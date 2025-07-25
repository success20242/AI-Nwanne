import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs';
import 'dotenv/config';

const LANGUAGES = ["english", "igbo", "hausa", "yoruba"];
const INTERVAL_HOURS = 6;
const LOG_FILE = './posted_wisdom.json';

let currentIndex = 0;

// Load previously posted wisdoms from file or initialize empty
let postedWisdoms = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    postedWisdoms = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch (e) {
    console.error("⚠️ Failed to parse posted wisdom log file, starting fresh.");
    postedWisdoms = [];
  }
}

function saveWisdomLog(wisdom) {
  postedWisdoms.push(wisdom);
  fs.writeFileSync(LOG_FILE, JSON.stringify(postedWisdoms, null, 2));
}

function hasBeenPosted(wisdom) {
  return postedWisdoms.includes(wisdom);
}

async function generateWisdom(language) {
  const prompt = `Generate a culturally meaningful question and answer about traditional values, beliefs, or practices in ${language} culture. Return both in the ${language} language. Format:
Question: <your question>
Answer: <your answer>`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("❌ OpenAI API Error:", error.response?.data || error.message);
    return null;
  }
}

async function postToFacebook(message) {
  if (!message) {
    console.error("⚠️ No message to post.");
    return;
  }
  const url = `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`;
  const payload = {
    message: `🧠 Caption: AI Nwanne - Daily Wisdom 📚\n\n${message}\n\n#AINwanne #AfricanAI #NaijaCulture`,
    access_token: process.env.FACEBOOK_ACCESS_TOKEN
  };

  try {
    const res = await axios.post(url, payload);
    console.log('✅ Posted to Facebook:', res.data);
  } catch (err) {
    console.error('❌ Facebook Post Error:', err.response?.data || err.message);
  }
}

async function runScheduler() {
  const language = LANGUAGES[currentIndex];
  console.log(`🕐 Posting for language: ${language.toUpperCase()}`);

  let wisdom = await generateWisdom(language);
  let attempts = 0;

  // Retry up to 3 times if wisdom was already posted
  while (wisdom && hasBeenPosted(wisdom) && attempts < 3) {
    console.log("♻️ Duplicate detected, generating new wisdom...");
    wisdom = await generateWisdom(language);
    attempts++;
  }

  if (wisdom && !hasBeenPosted(wisdom)) {
    await postToFacebook(wisdom);
    saveWisdomLog(wisdom);
  } else {
    console.warn("⚠️ Couldn't generate unique wisdom after multiple attempts, skipping post.");
  }

  currentIndex = (currentIndex + 1) % LANGUAGES.length;
}

// Log start
console.log("🚀 AI Nwanne Scheduler Started");

// Run once immediately on start
runScheduler();

// Schedule every 6 hours (0, 6, 12, 18)
cron.schedule('0 */6 * * *', runScheduler);
