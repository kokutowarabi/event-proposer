import { Message, TextChannel } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommandFromMessage(
  message: Message,
  customInstruction: string
): Promise<void> {
  const guild = message.guild;
  if (!guild) {
    await message.reply('このコマンドはサーバー内でのみ使用できます。');
    return;
  }

  try {
    const replyMessage = await message.reply('解析処理を開始しています…');

    process.nextTick(async () => {
      try {
        const messagesToStore: { id: string; content: string; channel_id: string }[] = [];
        const channels = await guild.channels.fetch();

        for (const channel of channels.values()) {
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

        await saveMessages(messagesToStore);

        const storedMessages = await getAllMessages();
        const allMessageTexts = storedMessages.map((msg) => msg.content);
        const extractedKeywords = await analyzeMessages(allMessageTexts);
        const eventProposals = await proposeEvent(extractedKeywords, customInstruction);

        await replyMessage.edit(`イベント提案:\n${eventProposals.join('\n')}`);
      } catch (innerError) {
        console.error('バックグラウンド処理エラー:', innerError);
        await replyMessage.edit('処理中にエラーが発生しました。');
      }
    });
  } catch (error) {
    console.error('解析中にエラーが発生:', error);
    await message.reply('解析処理中にエラーが発生しました。');
  }
}
