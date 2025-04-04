import { ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { saveMessages, getAllMessages } from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

export async function handleAnalyzeCommand(interaction: ChatInputCommandInteraction) {
  try {
    // すぐに初回応答を返す（ephemeral は flags で指定）
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    
    const guild = interaction.guild;
    if (!guild) {
      // ここで既に応答済みなら editReply を使う
      await interaction.editReply('このコマンドはギルド内でのみ使用できます。');
      return;
    }
    
    // ここからバックグラウンドの重い処理
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
    
    // 一度だけ最終応答を送る
    await interaction.editReply(`イベント提案:\n${eventProposal}`);
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('エラーが発生しました。');
    } else {
      await interaction.reply('エラーが発生しました。');
    }
  }
}
