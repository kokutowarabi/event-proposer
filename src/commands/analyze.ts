import { ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  try {
    // インタラクションを受け取ったらすぐに deferReply を呼び出す（3秒以内必須）
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('このコマンドはサーバー内でのみ使用できます。');
      return;
    }

    // 重い処理を非同期で実行する
    const eventProposalChunks = await (async () => {
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
      // proposeEvent は文字列の配列を返す前提（長いメッセージを分割済み）
      const proposalChunks = await proposeEvent(allMessageTexts);
      return proposalChunks;
    })();

    // 最初のチャンクを editReply で返信、残りは followUp で送信
    await interaction.editReply(`イベント提案:\n${eventProposalChunks[0]}`);
    for (let i = 1; i < eventProposalChunks.length; i++) {
      await interaction.followUp({ content: eventProposalChunks[i], flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('エラー:', error);
    // すでに deferReply している場合は editReply を利用してエラーメッセージを送信
    try {
      await interaction.editReply('処理中にエラーが発生しました。');
    } catch (editError) {
      console.error('editReply エラー:', editError);
    }
  }
}
