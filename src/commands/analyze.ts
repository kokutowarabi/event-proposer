import { ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { proposeEvent, proposeChannelTopic } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  try {
    // インタラクションを受信したら即座に deferReply を呼び出す（3秒以内必須）
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('このコマンドはサーバー内でのみ使用できます。');
      return;
    }

    // 全テキストチャンネルからメッセージを取得する際、チャンネルごとにグループ化する
    const messagesToStore: { id: string; content: string; channel_id: string }[] = [];
    // チャンネルごとのメッセージを保持する Map（channel_id をキーとし、チャンネル名とメッセージ内容の配列を格納）
    const channelMessageGroups: Record<string, { channelName: string; messages: string[] }> = {};

    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      // TextChannel のみ対象にする
      if (!(channel instanceof TextChannel)) continue;
      const textChannel = channel as TextChannel;

      try {
        // 各チャンネルから最新100件のメッセージを取得
        const messages = await textChannel.messages.fetch({ limit: 100 });
        messages.forEach((msg) => {
          // 空文字は除外
          if (!msg.content.trim()) return;
          // システムメッセージは除外
          if (msg.system) return;
          // メンションのみのメッセージも除外
          const mentionRegex = /^<@!?[0-9]+>$/;
          if (mentionRegex.test(msg.content.trim())) return;

          messagesToStore.push({
            id: msg.id,
            content: msg.content,
            channel_id: textChannel.id,
          });

          // チャンネルごとにメッセージをグループ化する
          if (!channelMessageGroups[textChannel.id]) {
            channelMessageGroups[textChannel.id] = { channelName: textChannel.name, messages: [] };
          }
          channelMessageGroups[textChannel.id].messages.push(msg.content);
        });
      } catch (fetchError) {
        console.error(`チャンネル[${textChannel.name}]のメッセージ取得に失敗しました。`, fetchError);
      }
    }

    await saveMessages(messagesToStore);

    const storedMessages = await getAllMessages();
    const allMessageTexts = storedMessages.map((msg) => msg.content);
    // 全体チャットログに基づくレポート作成
    const eventProposalChunks = await proposeEvent(allMessageTexts);

    // 全体レポートと、各チャンネルごとのレポートを順次送信
    let outputChunks: string[] = [];
    outputChunks.push(`【全体レポート】\n${eventProposalChunks.join('\n')}\n`);

    // 各チャンネルごとにレポート生成
    for (const channelId in channelMessageGroups) {
      const group = channelMessageGroups[channelId];
      // チャンネルごとにメッセージがない場合はスキップ
      if (group.messages.length === 0) continue;
      const channelReportChunks = await proposeChannelTopic(group.channelName, group.messages);
      const channelReport = `【チャンネル: ${group.channelName}】\n${channelReportChunks.join('\n')}\n`;
      outputChunks.push(channelReport);
    }

    // 送信する全体のテキスト（長すぎる場合は適宜 splitMessage などで分割して送信してください）
    let finalOutput = outputChunks.join('\n');

    // 2000文字以内に分割
    const messageChunks: string[] = [];
    while (finalOutput.length > 0) {
      messageChunks.push(finalOutput.slice(0, 2000));
      finalOutput = finalOutput.slice(2000);
    }
    if (messageChunks.length > 0) {
      await interaction.editReply(messageChunks[0]);
      for (let i = 1; i < messageChunks.length; i++) {
        await interaction.followUp({ content: messageChunks[i], flags: MessageFlags.Ephemeral });
      }
    }
  } catch (error) {
    console.error('初期処理エラー:', error);
    try {
      await interaction.editReply('処理中にエラーが発生しました。');
    } catch (editError) {
      console.error('editReply エラー:', editError);
    }
  }
}
