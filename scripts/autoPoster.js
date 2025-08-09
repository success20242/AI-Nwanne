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
You are an African culture and heritage writer.

Task:
Create a short, authentic, and visually memorable cultural wisdom post for the daily series titled "AI Nwanne".

Audience:
An international social media audience, including people unfamiliar with African traditions.

Language:
English – simple, clear, and easy to understand.

Tone & Style:
Warm, inspiring, culturally respectful, and creatively engaging.

Creativity Constraint:
- Use vivid imagery, sensory details, or metaphors in the explanation so the reader can visualize or emotionally connect with the wisdom.
- Ensure the proverb feels alive and carries emotional weight without altering its authentic meaning.

Output Format:
1. Heading: "🧠 AI Nwanne – Daily Wisdom"
2. A powerful and authentic African proverb or cultural saying (use quotation marks). 
   - Must be genuine, rooted in African heritage, and suitable for all audiences.
   - Avoid any proverb or theme that has been used in the past 30 days.
3. A short explanation (1–2 sentences) in plain English that explains the meaning or moral of the proverb, using creative and vivid expression.
4. End with exactly 3 hashtags (must include #AINwanne). 
   - Hashtags should be relevant to African culture, wisdom, or art.

Avoid repetition:
Here are the topics already used in the last 100 posts:
${usedTopics.slice(-100).join('\n')}

Quality Constraints:
- Maximum 80 words in total.
- No invented or fake sayings — must be authentic from African heritage.
- Explanation must be understandable to both African and non-African readers.
- Keep cultural respect and accuracy at all times.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
  });

  let text = response.choices[0].message.content.trim();

  // Strip any hashtags from the AI output
  text = text.replace(/#\w+/g, '').replace(/\n{2,}/g, '\n').trim();

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
