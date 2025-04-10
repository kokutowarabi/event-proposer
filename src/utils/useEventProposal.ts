import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 2000文字以内に分割するヘルパー関数
function splitMessage(message: string, limit = 2000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const lines = message.split('\n');

  for (const line of lines) {
    // 改行コード分(+1)を考慮して追加する
    if (currentChunk.length + line.length + 1 > limit) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * 全体のチャットログに基づくレポート作成
 */
export async function proposeEvent(keywords: string[]): Promise<string[]> {
  const promptKeywords = keywords.join('、');
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          '「あなたはDiscordコミュニティのチャットログを分析し、盛り上がっている話題とコミュニケーションをさらに活性化させるアイデアを提案するAIです。以下の情報をもとに、指示内容を満たすレポートを作成してください。\n\n' +
          '【コミュニティ概要】\n' +
          '猫に興味がある人が集まるDiscordコミュニティ\n\n' +
          '【あなたのタスク】\n' +
          '要約と主要トピックの抽出\n\n' +
          'チャットの流れを短くまとめ、盛り上がっているテーマやキーワードを列挙してください。さらに背景や参加者の意図、コミュニティ活性化のための提案も含めたレポートを作成してください。\n\n' +
          '【出力形式】\n' +
          '要約\n\n' +
          '主要トピックと盛り上がりの背景\n\n' +
          '活性化のための具体的提案\n\n' +
          'リスク・留意点\n\n' +
          '結論・推奨アクションプラン\n\n' +
          '回答は日本語で、箇条書きや段落を用いて分かりやすく整理してください。\n\n' +
          '以上を踏まえ、レポートを作成してください。」'
      },
      {
        role: 'user',
        content: `以下のキーワードがチャットログ内で頻出しています: ${promptKeywords}`
      },
      {
        role: 'user',
        content:
          '上記の情報をもとに、Discordコミュニティのチャットログに基づくレポートを作成してください。'
      }
    ],
    model: 'deepseek-chat',
  });

  let responseContent = completion.choices[0].message.content || '';
  console.log('Raw response from DeepSeek:', responseContent);
  // Markdownのコードブロックがあれば除去し、余分な空白をトリム
  responseContent = responseContent.replace(/^```json\s*|```$/g, '').trim();

  // レポートが2000文字を超える場合は分割して返却
  return splitMessage(responseContent);
}

/**
 * 各チャンネルごとの話題抽出のためのレポート作成
 * channelName: 対象のチャンネル名
 * keywords: チャンネル内の頻出メッセージ（フィルタ済み）の配列
 */
export async function proposeChannelTopic(channelName: string, keywords: string[]): Promise<string[]> {
  const promptKeywords = keywords.join('、');
  const modifiedPrompt =
    `「あなたはDiscordコミュニティのチャットログを分析し、各チャンネルにおける盛り上がっている話題を抽出するAIです。` +
    `以下の情報をもとに、【チャンネル名: ${channelName}】において頻出しているキーワードから、` +
    `注目すべき話題やトピックを抽出し、簡潔なレポートを作成してください。` +
    `各話題の要約、背景、参加者の意図などについても短くまとめてください。」`;

  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: modifiedPrompt
      },
      {
        role: 'user',
        content: `以下のキーワードがこのチャンネルのチャットログ内で頻出しています: ${promptKeywords}`
      },
      {
        role: 'user',
        content:
          '上記の情報をもとに、このチャンネルにおける盛り上がっている話題を抽出し、簡潔なレポートを作成してください。'
      }
    ],
    model: 'deepseek-chat'
  });
  let responseContent = completion.choices[0].message.content || '';
  console.log(`Raw response from DeepSeek for channel ${channelName}:`, responseContent);
  responseContent = responseContent.replace(/^```json\s*|```$/g, '').trim();
  return splitMessage(responseContent);
}
