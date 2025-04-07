import { ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  try {
    // Interactionにはまず即座にdeferReplyで返答（3秒以内必須）
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('このコマンドはサーバー内でのみ使用できます。');
      return;
    }

    // 重い処理をバックグラウンドで行う
    process.nextTick(async () => {
      try {
        const messagesToStore: { id: string; content: string; channel_id: string }[] = [];
        const channels = await guild.channels.fetch();

        for (const [, channel] of channels) {
          if (!channel || channel.type !== 0) continue; // TextChannelのみ
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
        const eventProposal = await proposeEvent(extractedKeywords);

        await interaction.editReply(`イベント提案:\n${eventProposal}`);
      } catch (innerError) {
        console.error('バックグラウンド処理エラー:', innerError);
        await interaction.editReply('処理中にエラーが発生しました。');
      }
    });
  } catch (error) {
    console.error('初期処理エラー:', error);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
    } else {
      await interaction.editReply('エラーが発生しました。');
    }
  }
}
