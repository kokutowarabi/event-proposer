import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com', // Deepseekなどのエンドポイント想定
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * Discord の1メッセージ制限(約2000文字)を考慮して分割
 */
function splitMessage(message: string, limit = 2000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const lines = message.split('\n');

  for (const line of lines) {
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

export async function proposeEvent(
  keywords: string[],
  customInstruction: string = ''
): Promise<string[]> {
  const promptKeywords = keywords.join('、');
  const additionalInstruction = customInstruction
    ? `\n\n【追加のカスタム指示】\n${customInstruction}\n\n`
    : '';

  const systemMessage = 
    'あなたはDiscordコミュニティのチャットログを分析し、盛り上がっている話題とコミュニケーションをさらに活性化させる' +
    'アイデアを提案するAIです。\n' +
    additionalInstruction +
    '以下のキーワードに基づいてレポートを作成してください。\n\n' +
    '【コミュニティ概要】\n猫に興味がある人が集まるDiscordコミュニティ\n\n' +
    '【タスク】\n' +
    '- チャットの流れの要約\n' +
    '- 主要トピックと盛り上がりの背景\n' +
    '- 活性化のための具体的提案\n' +
    '- リスク・留意点\n' +
    '- 結論・推奨アクションプラン\n\n' +
    '出力は日本語で、箇条書きや段落を使って整理してください。';

  const userMessage = `以下のキーワードが頻出しています: ${promptKeywords}`;

  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    model: 'deepseek-chat',
  });

  let responseContent = completion.choices[0].message.content || '';
  // ```json で囲まれていたら削除
  responseContent = responseContent.replace(/^```json\s*|```$/g, '').trim();

  return splitMessage(responseContent);
}
