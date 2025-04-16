import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URLまたはSUPABASE_KEYが設定されていません。');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface Message {
  id: string;
  content: string;
  channel_id: string;
  created_at?: string; // DBにINSERTされた時刻
  sent_at: string;     // Discordメッセージ投稿時刻
}

export async function saveMessages(messages: Message[]): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .upsert(messages, { onConflict: 'id' });
  if (error) {
    throw error;
  }
}

export async function getAllMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*');
  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * 指定チャンネルで「最も新しい sent_at のメッセージID」を返す。
 * 1つも無ければ null
 */
export async function getLatestMessageIdByChannel(channelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('channel_id', channelId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) {
    return null;
  }
  return data.id as string;
}
