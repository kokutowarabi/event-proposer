import { Message as DiscordMessage, TextChannel } from 'discord.js';
import {
  saveMessages,
  getAllMessages,
  getLatestMessageIdByChannel
} from '../utils/supabaseClient';
import { analyzeMessages } from '../utils/kuromoji';
import { proposeEvent } from '../utils/useEventProposal';

/**
 * 重複排除
 */
function deduplicateMessages<T extends { id: string }>(messages: T[]): T[] {
  const map = new Map<string, T>();
  for (const msg of messages) {
    map.set(msg.id, msg);
  }
  return Array.from(map.values());
}

/**
 * メッセージが「空またはサーバー絵文字だけ」で構成されているか判定
 * 
 * - 空 or 空白だけ: /^s*$/
 * - カスタム絵文字のみ: 例 "<:name:12345>" や "<a:name:12345>" が繰り返されている場合
 */
function isEmptyOrOnlyServerEmojis(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    // 完全に空 or スペースだけ
    return true;
  }
  // 複数個のサーバー絵文字だけが連続しているかをチェック
  //   <a?:emojiName:123456789> が任意回数 (空白あり) 繰り返される場合マッチ
  const serverEmojiPattern = /^(<a?:[a-zA-Z0-9_]+:\d+>\s*)+$/;
  return serverEmojiPattern.test(trimmed);
}

/**
 * Botメッセージ・コマンド等を除外するフィルタ
 */
function shouldExcludeMessage(msg: DiscordMessage): boolean {
  // 1) Bot自身のメッセージは除外
  if (msg.author.bot) return true;

  // 2) Botへのメンションを含む(=コマンド呼び出し)メッセージを除外
  if (msg.mentions.has(msg.client.user!.id)) return true;

  // 3) メンションだけの内容 -> 例: "<@123456>"
  if (/^<@!?[0-9]+>$/.test(msg.content.trim())) return true;

  // 4) Empty（空）やサーバー絵文字だけの場合も除外
  if (isEmptyOrOnlyServerEmojis(msg.content)) return true;

  return false;
}

/**
 * まだDBに無いチャンネル → 最古まで遡る (beforeパラメータ)
 */
async function fetchFullChannelHistoryIfNoData(
  textChannel: TextChannel
): Promise<{ id: string; content: string; channel_id: string; sent_at: string }[]> {
  const results: { id: string; content: string; channel_id: string; sent_at: string }[] = [];
  let lastMessageId: string | undefined;
  let fetchMore = true;

  while (fetchMore) {
    const fetched = await textChannel.messages.fetch({
      limit: 100,
      before: lastMessageId,
    });
    // 除外フィルタ
    const filtered = fetched.filter((msg) => !shouldExcludeMessage(msg));
    filtered.forEach((m) => {
      results.push({
        id: m.id,
        content: m.content,
        channel_id: textChannel.id,
        sent_at: m.createdAt.toISOString(),
      });
    });

    if (fetched.size < 100) {
      fetchMore = false; // もう過去に遡れない
    } else {
      lastMessageId = fetched.lastKey(); // 最古のメッセージID
      if (!lastMessageId) fetchMore = false;
    }
  }

  return results;
}

/**
 * 既存の最新メッセージID以降を取得 (afterパラメータ)
 */
async function fetchNewMessagesFromChannel(
  textChannel: TextChannel,
  lastStoredMessageId: string
): Promise<{ id: string; content: string; channel_id: string; sent_at: string }[]> {
  const results: { id: string; content: string; channel_id: string; sent_at: string }[] = [];
  let after = lastStoredMessageId;
  let fetchComplete = false;

  while (!fetchComplete) {
    const fetched = await textChannel.messages.fetch({ limit: 100, after });
    const filtered = fetched.filter((msg) => !shouldExcludeMessage(msg));
    filtered.forEach((msg) => {
      results.push({
        id: msg.id,
        content: msg.content,
        channel_id: textChannel.id,
        sent_at: msg.createdAt.toISOString(),
      });
    });
    if (fetched.size < 100) {
      fetchComplete = true;
    } else {
      after = fetched.last()?.id || '';
    }
  }

  return results;
}

export async function handleAnalyzeCommandFromMessage(
  message: DiscordMessage,
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
      const messagesToStore: { id: string; content: string; channel_id: string; sent_at: string }[] = [];

      for (const channel of channels.values()) {
        if (!channel || channel.type !== 0) continue; // テキストチャンネル以外除外
        if (!targetChannelNames.includes(channel.name)) continue; // 対象外チャンネルは除外

        const textChannel = channel as TextChannel;
        // DB内の最新メッセージID
        const lastStoredMessageId = await getLatestMessageIdByChannel(textChannel.id);
        let newMessages = [];

        if (!lastStoredMessageId) {
          // 初回→最古まで遡って取得
          console.log(`チャネル "${textChannel.name}" は未登録: 最古まで遡ります。`);
          newMessages = await fetchFullChannelHistoryIfNoData(textChannel);
        } else {
          // 既にある→その後の新規分だけ取得
          newMessages = await fetchNewMessagesFromChannel(textChannel, lastStoredMessageId);
        }

        messagesToStore.push(...newMessages);
      }

      // 重複排除
      const uniqueMessages = deduplicateMessages(messagesToStore);
      if (uniqueMessages.length > 0) {
        await saveMessages(uniqueMessages);
        console.log(`新規メッセージを ${uniqueMessages.length} 件保存しました。`);
      }

      // DBに保存されている全メッセージ
      const storedMessages = await getAllMessages();
      let filteredMessages = storedMessages;

      // 英語表記の期間指定 "last 7 days" / "last 1 week" / ...
      const englishTimeRangeMatch = customInstruction.match(/last\s+(\d+)\s+(day|days|week|weeks)/i);
      if (englishTimeRangeMatch) {
        const quantity = parseInt(englishTimeRangeMatch[1], 10);
        const unit = englishTimeRangeMatch[2].toLowerCase();
        const days = unit.startsWith('day') ? quantity : quantity * 7;
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        filteredMessages = storedMessages.filter((m) => new Date(m.sent_at) >= threshold);
      }

      // 解析
      const allMessageTexts = filteredMessages.map(m => m.content);
      const extractedKeywords = await analyzeMessages(allMessageTexts);
      const eventProposals = await proposeEvent(extractedKeywords, customInstruction);

      // 出力
      const outputChannel = channels.find(
        (ch) => ch && ch.type === 0 && ch.name === outputChannelName
      ) as TextChannel | undefined;

      if (!outputChannel) {
        await replyMessage.edit(`指定された出力チャンネル「#${outputChannelName}」が見つかりませんでした。`);
        return;
      }

      await outputChannel.send(`📢 **解析結果レポート** 📢\n${eventProposals.join('\n')}`);
      await replyMessage.edit(`解析が完了しました！結果を #${outputChannelName} に送信しました。`);
    } catch (err) {
      console.error('解析処理中にエラー:', err);
      await replyMessage.edit('処理中にエラーが発生しました。');
    }
  });
}
