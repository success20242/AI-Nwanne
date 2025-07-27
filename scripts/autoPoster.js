import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs';
import 'dotenv/config';
import { translate } from '../lib/translate.js'; // <-- Corrected relative path

const LANGUAGES = ["english", "igbo", "hausa", "yoruba"];
const INTERVAL_HOURS = 6;
const LOG_FILE = './posted_wisdom.json';
const INDEX_FILE = './current_index.json';

let currentIndex = 0;

// Load current index
if (fs.existsSync(INDEX_FILE)) {
  try {
    const obj = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    if (typeof obj.currentIndex === 'number') currentIndex = obj.currentIndex;
  } catch (e) {
    console.error("⚠️ Failed to parse index file.", e);
  }
}

// Load wisdom log
let postedWisdoms = [];
if (fs.existsSync(LOG_FILE)) {
  try {
    postedWisdoms = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    if (!Array.isArray(postedWisdoms)) postedWisdoms = [];
  } catch (e) {
    console.error("⚠️ Failed to load wisdom log.", e);
    postedWisdoms = [];
  }
}

function saveWisdomLog(wisdom) {
  postedWisdoms.push(wisdom);
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(postedWisdoms, null, 2));
  } catch (e) {
    console.error("❌ Failed to save wisdom log:", e);
  }
}

function saveCurrentIndex(index) {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ currentIndex: index }, null, 2));
  } catch (e) {
    console.error("❌ Failed to save index file:", e);
  }
}

function hasBeenPosted(wisdom) {
  if (!wisdom || !wisdom.trim) return false;
  return postedWisdoms.some(w => w.trim() === wisdom.trim());
}

// Helper to get ISO code for translation API
function getLangCode(language) {
  const lang = language.toLowerCase();
  if (lang === "yoruba") return "yo";
  if (lang === "hausa") return "ha";
  if (lang === "igbo") return "ig";
  if (lang === "english") return "en";
  return lang.slice(0, 2);
}

async function generateWisdom(language) {
  // Always generate in English
  const systemPrompt = `You are AI Nwanne, an intelligent African cultural assistant.
Write a SHORT, stylish, and culturally rich message exploring traditional wisdom or values in ENGLISH only. The output must be concise, clear, and formatted with a bold header. Use authentic phrasing.`;

  const userPrompt = `Give a culturally rich, SHORT *question and answer* in ENGLISH about traditional beliefs or values. Only reply in ENGLISH. Include a bold title or header and use authentic, natural expression.`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 350
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const englishWisdom = response.data.choices[0]?.message?.content?.trim() ?? null;
    if (!englishWisdom) return null;

    // Now use your translation module to get native version
    let nativeTranslation = englishWisdom;
    if (language.toLowerCase() !== "english") {
      try {
        const langCode = getLangCode(language);
        nativeTranslation = await translate(englishWisdom, langCode, "en");
      } catch (err) {
        console.error("❌ Wisdom translation failed:", err);
        nativeTranslation = "[Translation unavailable]";
      }
    }

    // Format the result: English first, then native
    return `*ENGLISH*: ${englishWisdom}\n\n*${language.toUpperCase()}*: ${nativeTranslation}`;
  } catch (error) {
    console.error("❌ OpenAI Error:", error.response?.data || error.message);
    return null;
  }
}

async function postToFacebook(message) {
  if (!message) return;
  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID) {
    console.error("❌ Facebook env vars not set.");
    return;
  }
  const payload = {
    message: `🧠 *AI Nwanne - Daily Wisdom* 📚\n\n${message}\n\n#AINwanne #AfricanAI #NaijaCulture`,
    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
      payload
    );
    if (res.data && res.data.id) {
      console.log("✅ Facebook post successful:", res.data.id);
    } else {
      throw new Error("No post ID returned");
    }
  } catch (err) {
    console.error("❌ Facebook Error:", err.response?.data || err.message);
  }
}

async function postToTelegram(message) {
  if (!message) return;
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ Telegram env vars not set.");
    return;
  }

  const payload = {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: `🧠 *AI Nwanne - Daily Wisdom*\n\n${message}\n\n#AINwanne #AfricanAI #NaijaCulture`,
    parse_mode: "Markdown"
  };

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      payload
    );
    if (res.data && res.data.ok) {
      console.log("✅ Telegram post successful:", res.data.result?.message_id ?? true);
    } else {
      throw new Error("Telegram API did not return ok");
    }
  } catch (err) {
    console.error("❌ Telegram Error:", err.response?.data || err.message);
  }
}

async function runScheduler() {
  const lang = LANGUAGES[currentIndex];
  console.log(`🕐 Generating wisdom for: ${lang.toUpperCase()}`);

  let wisdom = await generateWisdom(lang);
  let attempts = 0;

  // Avoid duplicate posts, try up to 3 times
  while (wisdom && hasBeenPosted(wisdom) && attempts < 3) {
    console.warn("♻️ Duplicate detected. Trying again...");
    wisdom = await generateWisdom(lang);
    attempts++;
  }

  if (wisdom && !hasBeenPosted(wisdom)) {
    await postToFacebook(wisdom);
    await postToTelegram(wisdom);
    saveWisdomLog(wisdom);
  } else {
    console.warn("⚠️ Could not generate unique wisdom after multiple attempts.");
  }

  currentIndex = (currentIndex + 1) % LANGUAGES.length;
  saveCurrentIndex(currentIndex);
}

// Startup log
console.log("🚀 AI Nwanne Wisdom Scheduler started");

// Initial run
runScheduler();

// Scheduled every 6 hours
cron.schedule('0 */6 * * *', runScheduler);
