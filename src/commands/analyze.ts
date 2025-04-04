import { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  // すでに応答が行われていない場合は、deferReply を実行
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('このコマンドはギルド内でのみ使用できます。');
      return;
    }

    const messagesToStore: { id: string; content: string; channel_id: string }[] = [];
    const channels = await guild.channels.fetch();

    for (const [, channel] of channels) {
      // TextChannelのみ対象
      if (!channel || channel.type !== 0) continue;
      const textChannel = channel as TextChannel;

      const messages = await textChannel.messages.fetch({ limit: 100 });
      messages.forEach((msg) => {
        messagesToStore.push({
          id: msg.id,
          content: msg.content,
          channel_id: textChannel.id,
        });
      });
    }

    // Supabaseにメッセージを保存（既存のものはアップサート）
    await saveMessages(messagesToStore);

    // DBから全メッセージを取得し、内容だけを抽出
    const storedMessages = await getAllMessages();
    const allMessageTexts = storedMessages.map((msg) => msg.content);

    // kuromoji.jsで形態素解析し、キーワードを抽出
    const extractedKeywords = await analyzeMessages(allMessageTexts);

    // 抽出したキーワードを元にイベント提案を生成
    const eventProposal = await proposeEvent(extractedKeywords);

    // 1回だけeditReplyを呼び出す
    await interaction.editReply(`イベント提案:\n${eventProposal}`);
  } catch (error) {
    console.error(error);
    // すでに応答済みならeditReply、未応答ならreplyでエラーを通知
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('エラーが発生しました。');
    } else {
      await interaction.reply('エラーが発生しました。');
    }
  }
}
