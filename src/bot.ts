import { Client, GatewayIntentBits, Partials, Message, TextChannel, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import { handleAnalyzeCommandFromMessage } from './commands/analyze';

dotenv.config();

const { DISCORD_BOT_TOKEN } = process.env;
if (!DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKENが設定されていません。');
}

export function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.GuildMember,
      Partials.Reaction,
    ],
  });

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.on('messageCreate', async (message: Message) => {
    // Botのメッセージは無視
    if (message.author.bot) return;

    // Botへのメンションが含まれていなければ無視
    if (!message.mentions.has(client.user?.id!)) return;

    // Botメンション部分を除去
    const contentWithoutMention = message.content.replace(`<@${client.user?.id}>`, '').trim();

    let analyzeChannelNames: string[] = [];
    let customInstruction: string = "";
    let outputChannel: TextChannel;

    // outputキーワードがあるかどうかで分岐
    if (contentWithoutMention.includes('output')) {
      // 出力先指定あり：output キーワード前後で文字列を分割
      const parts = contentWithoutMention.split('output');
      const beforeOutput = parts[0].trim();
      const afterOutput = parts.slice(1).join('output').trim(); // 万が一outputが複数あっても連結

      // 【出力先チャンネルの取得】
      const outputMatch = afterOutput.match(/<#(\d+)>/);
      if (outputMatch) {
        const outputChannelId = outputMatch[1];
        const guildChannel = message.guild?.channels.cache.get(outputChannelId);
        if (!guildChannel || guildChannel.type !== ChannelType.GuildText) {
          await message.reply('指定された出力先チャンネルが見つからないか、テキストチャンネルではありません。');
          return;
        }
        outputChannel = guildChannel as TextChannel;
        // afterOutputから出力先メンション部分を除去して残りをカスタム指示とする
        customInstruction = afterOutput.replace(/<#\d+>/, '').trim();
      } else {
        // 出力先指定が誤っている場合はエラー
        await message.reply('出力チャンネルが指定されていません（例: output <#general>）。');
        return;
      }

      // 【解析対象チャンネルの取得】
      // analyzeがあれば、解析対象チャンネルのメンションを抽出
      if (beforeOutput.toLowerCase().startsWith('analyze')) {
        const channelMentions = Array.from(beforeOutput.matchAll(/<#(\d+)>/g)).map(m => m[1]);
        if (channelMentions.length > 0) {
          const analyzeChannels = channelMentions
            .map(id => message.guild?.channels.cache.get(id))
            .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText);
          if (analyzeChannels.length === 0) {
            await message.reply('解析対象チャンネルが見つかりませんでした。');
            return;
          }
          analyzeChannelNames = analyzeChannels.map(ch => ch.name);
          // カスタム指示は、analyze部分のメンションを除去した残りの文字列も考慮
          customInstruction = customInstruction || beforeOutput.replace(/<#\d+>/g, '').replace(/^analyze\s*/i, '').trim();
        } else {
          // analyzeキーワードはあるが、メンションがない場合→解析対象は全テキストチャンネル
          const fetchedChannels = await message.guild?.channels.fetch();
          analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
            .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
            .map(ch => (ch as TextChannel).name);
          customInstruction = customInstruction || beforeOutput.replace(/^analyze\s*/i, '').trim();
        }
      } else {
        // 出力先指定はあるが、analyzeキーワードがない場合は全テキストチャンネルを対象
        const fetchedChannels = await message.guild?.channels.fetch();
        analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
          .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
          .map(ch => (ch as TextChannel).name);
        customInstruction = customInstruction || beforeOutput;
      }
    } else {
      // output キーワードがない場合 → 出力先は【コマンド送信チャンネル】
      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply('コマンド送信チャンネルがテキストチャンネルではありません。');
        return;
      }
      outputChannel = message.channel as TextChannel;

      // 解析対象チャンネルは、analyze があればそのメンション、なければコマンド送信チャンネルを対象
      if (contentWithoutMention.toLowerCase().startsWith('analyze')) {
        const channelMentions = Array.from(contentWithoutMention.matchAll(/<#(\d+)>/g)).map(m => m[1]);
        if (channelMentions.length > 0) {
          const analyzeChannels = channelMentions
            .map(id => message.guild?.channels.cache.get(id))
            .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText);
          if (analyzeChannels.length === 0) {
            await message.reply('解析対象チャンネルが見つかりませんでした。');
            return;
          }
          analyzeChannelNames = analyzeChannels.map(ch => ch.name);
          customInstruction = contentWithoutMention.replace(/<#\d+>/g, '').replace(/^analyze\s*/i, '').trim();
        } else {
          // analyze キーワードはあるがチャンネルメンションがなければ、対象はコマンド送信先
          analyzeChannelNames = [(message.channel as TextChannel).name];
          customInstruction = contentWithoutMention.replace(/^analyze\s*/i, '').trim();
        }
      } else {
        // analyzeもoutputも指定がなければ、解析対象は全テキストチャンネル
        const fetchedChannels = await message.guild?.channels.fetch();
        analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
          .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
          .map(ch => (ch as TextChannel).name);
        customInstruction = contentWithoutMention;
      }
    }

    // （デバッグ用）ログ出力
    console.log('解析対象チャンネル:', analyzeChannelNames);
    console.log('出力先チャンネル:', outputChannel.name);
    console.log('カスタム命令:', customInstruction);

    // 解析処理を呼び出す（handleAnalyzeCommandFromMessage は引数として
    // 分析対象チャンネル名の配列、出力先チャンネル名、カスタム指示を受け取る）
    await handleAnalyzeCommandFromMessage(
      message,
      analyzeChannelNames,
      outputChannel.name,
      customInstruction
    );
  });

  client.login(DISCORD_BOT_TOKEN);
}
