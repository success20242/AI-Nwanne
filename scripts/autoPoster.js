import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs/promises';
import 'dotenv/config';
import OpenAI from 'openai';

// === OpenAI Configuration ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === Configuration ===
const USED_TOPICS_FILE = './used_topics.json';

// === Hashtag Configuration ===
const FIXED_HASHTAGS = ['#AINwanne', '#NaijaCulture', '#AfricanAI'];

async function getUsedTopics() {
  try {
    const data = await fs.readFile(USED_TOPICS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveUsedTopic(topic) {
  const topics = await getUsedTopics();
  topics.push(topic);
  await fs.writeFile(USED_TOPICS_FILE, JSON.stringify(topics.slice(-500), null, 2), 'utf-8');
}

// === Wisdom Generator ===
async function generateWisdomPost() {
  const usedTopics = await getUsedTopics();

  const prompt = `
Generate a short African wisdom post for a daily cultural page titled "AI Nwanne". 
The format should include:
1. Heading: "🧠 AI Nwanne – Daily Wisdom"
2. One powerful African proverb or cultural quote.
3. A 1-2 sentence explanation in simple English.
4. End with 3 hashtags (must be #AINwanne, #NaijaCulture and #AfricanAI ).

Avoid repeating previous topics. Here are past ones:
${usedTopics.slice(-100).join('\n')}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
  });

  const text = response.choices[0].message.content.trim();

  const topicMatch = text.match(/(?:“|")(.+?)(?:”|")/);
  if (topicMatch) {
    await saveUsedTopic(topicMatch[1]);
  }

  return text;
}

// === Facebook Posting ===
async function postToFacebook(content) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const res = await axios.post(
    `https://graph.facebook.com/${pageId}/feed`,
    new URLSearchParams({ message: content, access_token: token }),
  );
  return res.data;
}

// === Telegram Posting ===
async function postToTelegram(content) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: content,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  return res.data;
}

// === MAIN ===
async function runPost() {
  try {
    const post = await generateWisdomPost();
    const hashtags = FIXED_HASHTAGS.join(' ');
    const fullPost = `${post}\n\n${hashtags}`;

    const fb = await postToFacebook(fullPost);
    console.log('✅ Posted to Facebook:', fb.id);

    const tg = await postToTelegram(fullPost);
    console.log('✅ Posted to Telegram:', tg.message_id);
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

// === Schedule it to run every 6 hours ===
cron.schedule('0 */6 * * *', () => {
  console.log('🕐 Scheduled run starting...');
  runPost();
});

// Run immediately on startup
runPost();
