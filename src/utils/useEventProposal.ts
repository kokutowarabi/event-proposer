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
          'チャットの流れを短くまとめてください。\n\n' +
          '盛り上がっているテーマやキーワードを列挙し、特に注目すべきトピックを3〜5個選び理由を添えて解説してください。\n\n' +
          '背景や理由の考察\n\n' +
          'なぜそれらのトピックが盛り上がっているのか、参加者の意図やニーズを推測してください。\n\n' +
          'どのような層（初心者／上級者、特定の興味分野など）が特に関心を示しているかを考察してください。\n\n' +
          'コミュニティ活性化のための提案\n\n' +
          '上記のトピックをさらに発展させるにはどんなイベント・企画・チャンネルが効果的か？\n\n' +
          '参加者同士の交流を促進するために運営者ができる具体的な施策は？（例：定期テーマの設定、勉強会／共同制作／オフ会の開催など）\n\n' +
          'リスクや留意点\n\n' +
          'ネガティブな意見や対立、トラブルの兆候があるか？ある場合はその対処法を提案。\n\n' +
          '一部のメンバーのみが盛り上がっていて、新規や初心者が入りづらい雰囲気になっていないか？\n\n' +
          'モデレーションやルール整備の必要性は？\n\n' +
          'まとめ／今後のアクションプラン\n\n' +
          '運営者が優先的に取り組むべきこと\n\n' +
          '期待できる成果やメリット\n\n' +
          '【出力形式】\n' +
          '要約\n\n' +
          '主要トピックと盛り上がりの背景\n\n' +
          '活性化のための具体的提案\n\n' +
          'リスク・留意点\n\n' +
          '結論・推奨アクションプラン\n\n' +
          '回答は日本語で、箇条書きや段落を用いて分かりやすく整理してください。必要があれば、追加の見出しやリストを使用しても構いません。\n\n' +
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
  // Markdownのコードブロック（json指定）があれば除去し、余分な空白をトリム
  responseContent = responseContent.replace(/^```json\s*|```$/g, '').trim();

  // レポートが2000文字を超える場合は分割して返却
  return splitMessage(responseContent);
}
