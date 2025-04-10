import { ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  try {
    // インタラクションを受け取ったら、即座に deferReply を呼び出す（3秒以内必須）
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('このコマンドはサーバー内でのみ使用できます。');
      return;
    }

    // 全テキストチャンネルからメッセージを取得する
    const messagesToStore: { id: string; content: string; channel_id: string }[] = [];
    const channels = await guild.channels.fetch();

    // channels は Collection<string, GuildChannel> なので、values() を利用
    for (const channel of channels.values()) {
      // テキストチャンネルのみ対象とする（channel.isTextBased() はスレッドなどもtrueになるので、ここでは TextChannel のインスタンスに絞る）
      if (!(channel instanceof TextChannel)) continue;
      const textChannel = channel as TextChannel;

      try {
        // 各チャンネルから最新100件のメッセージを取得
        const messages = await textChannel.messages.fetch({ limit: 100 });
        messages.forEach((msg) => {
          messagesToStore.push({
            id: msg.id,
            content: msg.content,
            channel_id: textChannel.id,
          });
        });
      } catch (fetchError) {
        console.error(`チャンネル[${textChannel.name}]のメッセージ取得に失敗しました。`, fetchError);
      }
    }

    await saveMessages(messagesToStore);

    const storedMessages = await getAllMessages();
    const allMessageTexts = storedMessages.map((msg) => msg.content);
    // proposeEvent はメッセージの配列（長い場合は分割済みのチャンク）を返す実装とする
    const eventProposalChunks = await proposeEvent(allMessageTexts);

    // 最初のチャンクを editReply で送信し、残りは followUp で送信
    await interaction.editReply(`イベント提案:\n${eventProposalChunks[0]}`);
    for (let i = 1; i < eventProposalChunks.length; i++) {
      await interaction.followUp({
        content: eventProposalChunks[i],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('初期処理エラー:', error);
    // 既に deferReply 済みの場合は editReply を利用
    try {
      await interaction.editReply('処理中にエラーが発生しました。');
    } catch (editError) {
      console.error('editReply エラー:', editError);
    }
  }
}
