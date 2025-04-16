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
    // Bot自身のメッセージは無視
    if (message.author.bot) return;

    // Botへのメンションが含まれていなければ無視
    if (!message.mentions.has(client.user?.id!)) return;

    // Botメンション部分を除去
    const contentWithoutMention = message.content.replace(`<@${client.user?.id}>`, '').trim();

    // サーバー (Guild) がない場合は無視 (DMなど)
    if (!message.guild) return;

    // --- ここは例として、従来の「analyze」「output」「time last X days/weeks」などを
    //     パースする簡易実装で残しています。 ---

    let analyzeChannelNames: string[] = [];
    let customInstruction: string = "";
    let outputChannel: TextChannel;

    // outputキーワードがあるかどうかで分岐
    if (contentWithoutMention.includes('output')) {
      const parts = contentWithoutMention.split('output');
      const beforeOutput = parts[0].trim();
      const afterOutput = parts.slice(1).join('output').trim();

      // 出力先チャンネル
      const outputMatch = afterOutput.match(/<#(\d+)>/);
      if (outputMatch) {
        const outputChannelId = outputMatch[1];
        const guildChannel = message.guild?.channels.cache.get(outputChannelId);
        if (!guildChannel || guildChannel.type !== ChannelType.GuildText) {
          await message.reply('指定された出力先チャンネルが見つからないか、テキストチャンネルではありません。');
          return;
        }
        outputChannel = guildChannel as TextChannel;
        // 残りをカスタム指示に
        customInstruction = afterOutput.replace(/<#\d+>/, '').trim();
      } else {
        await message.reply('出力チャンネルが指定されていません（例: output <#general>）。');
        return;
      }

      // analyze があれば解析対象チャンネルを抽出
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
          customInstruction = customInstruction ||
            beforeOutput.replace(/<#\d+>/g, '').replace(/^analyze\s*/i, '').trim();
        } else {
          // analyze キーワードあるがメンション無なら全チャンネル対象
          const fetchedChannels = await message.guild?.channels.fetch();
          analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
            .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
            .map(ch => (ch as TextChannel).name);
          customInstruction = customInstruction ||
            beforeOutput.replace(/^analyze\s*/i, '').trim();
        }
      } else {
        // outputあるがanalyzeない → 全チャンネル対象
        const fetchedChannels = await message.guild?.channels.fetch();
        analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
          .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
          .map(ch => (ch as TextChannel).name);
        customInstruction = customInstruction || beforeOutput;
      }
    } else {
      // outputがない → 出力先はコマンド送信チャンネル
      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply('コマンド送信チャンネルがテキストチャンネルではありません。');
        return;
      }
      outputChannel = message.channel as TextChannel;

      // analyze があれば対象を抽出
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
          customInstruction = contentWithoutMention
            .replace(/<#\d+>/g, '')
            .replace(/^analyze\s*/i, '')
            .trim();
        } else {
          // analyzeあるがメンション無 → コマンド送信チャンネルだけ
          analyzeChannelNames = [outputChannel.name];
          customInstruction = contentWithoutMention
            .replace(/^analyze\s*/i, '')
            .trim();
        }
      } else {
        // analyze も output も無い → 全チャンネル対象
        const fetchedChannels = await message.guild?.channels.fetch();
        analyzeChannelNames = Array.from(fetchedChannels?.values() || [])
          .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
          .map(ch => (ch as TextChannel).name);
        customInstruction = contentWithoutMention;
      }
    }

    console.log('解析対象チャンネル:', analyzeChannelNames);
    console.log('出力先チャンネル:', outputChannel.name);
    console.log('カスタム命令:', customInstruction);

    // 実際の解析処理へ
    await handleAnalyzeCommandFromMessage(
      message,
      analyzeChannelNames,
      outputChannel.name,
      customInstruction
    );
  });

  client.login(DISCORD_BOT_TOKEN);
}
