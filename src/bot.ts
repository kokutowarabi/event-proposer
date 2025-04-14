import { Client, GatewayIntentBits, Partials, Message } from 'discord.js';
import dotenv from 'dotenv';
import { handleAnalyzeCommandFromMessage } from './commands/analyze';

dotenv.config();

const { DISCORD_BOT_TOKEN } = process.env;
if (!DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKENが設定されていません。');
}

export function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.GuildMember,
      Partials.Reaction,
    ],
  });

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user?.id!)) {
      // メンションのテキストからBotのメンションを除去してカスタム指示を取得
      const customInstruction = message.content.replace(`<@${client.user?.id}>`, '').trim();
      await handleAnalyzeCommandFromMessage(message, customInstruction);
    }
  });

  client.login(DISCORD_BOT_TOKEN);
}
