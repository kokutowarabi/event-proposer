import { Message, TextChannel } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommandFromMessage(
  message: Message,
  targetChannelNames: string[],
  outputChannelName: string,
  customInstruction: string
): Promise<void> {
  const guild = message.guild;
  if (!guild) {
    await message.reply('このコマンドはサーバー内でのみ使用できます。');
    return;
  }

  const replyMessage = await message.reply('指定されたチャンネルの解析を開始します…');

  process.nextTick(async () => {
    try {
      const channels = await guild.channels.fetch();
      const messagesToStore: { id: string; content: string; channel_id: string }[] = [];

      for (const channel of channels.values()) {
        if (!channel || channel.type !== 0 || !targetChannelNames.includes(channel.name)) continue;
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

      await saveMessages(messagesToStore);

      const storedMessages = await getAllMessages();
      const allMessageTexts = storedMessages.map((msg) => msg.content);
      const extractedKeywords = await analyzeMessages(allMessageTexts);

      const eventProposals = await proposeEvent(extractedKeywords, customInstruction);

      // 出力チャンネルを取得して結果を送信
      const outputChannel = channels.find(
        (ch) => ch && ch.type === 0 && ch.name === outputChannelName
      ) as TextChannel | undefined;

      if (!outputChannel) {
        await replyMessage.edit(`指定された出力チャンネル「#${outputChannelName}」が見つかりませんでした。`);
        return;
      }

      await outputChannel.send(`📢 **解析結果レポート** 📢\n${eventProposals.join('\n')}`);

      await replyMessage.edit(`解析が完了しました！結果を #${outputChannelName} に送信しました。`);
    } catch (innerError) {
      console.error('解析処理中にエラー:', innerError);
      await replyMessage.edit('処理中にエラーが発生しました。');
    }
  });
}