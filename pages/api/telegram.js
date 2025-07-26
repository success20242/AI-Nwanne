import Redis from "ioredis";
import { OpenAI } from "openai";
import { askAI } from "../../lib/ai.js";
import { detectLang, langToCode } from "../../lib/detectLang.js";

const redis = new Redis(process.env.REDIS_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COOLDOWN_MS = 3000; // per user cooldown in ms

async function translateTo(text, targetLang) {
  if (targetLang === "en") return text; // no translation needed

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are a helpful translator." },
      { role: "user", content: `Translate this to ${targetLang}:\n\n${text}` },
    ],
    temperature: 0,
    max_tokens: 500,
  });
  return response.choices[0].message.content.trim();
}

export default async function handler(req, res) {
  const msg = req.body.message?.text;
  const chatId = req.body.message?.chat.id;

  if (!msg || !chatId) {
    return res.end("No message");
  }

  try {
    // Rate limit per user
    const lastRequestKey = `lastReq:${chatId}`;
    const lastRequest = await redis.get(lastRequestKey);
    const now = Date.now();

    if (lastRequest && now - parseInt(lastRequest, 10) < COOLDOWN_MS) {
      console.warn(`⚠️ User ${chatId} rate limited`);
      return res.status(429).end("Too Many Requests");
    }
    await redis.set(lastRequestKey, now.toString(), "PX", COOLDOWN_MS);

    // Detect language with cache
    const langCacheKey = `lang:${chatId}:${msg}`;
    let lang = await redis.get(langCacheKey);
    if (!lang) {
      lang = await detectLang(msg);
      await redis.set(langCacheKey, lang, "EX", 3600); // cache 1 hour
    }

    // AI response cache
    const aiCacheKey = `aiResp:${chatId}:${msg}`;
    let answer = await redis.get(aiCacheKey);
    if (!answer) {
      answer = await askAI(msg, lang);
      await redis.set(aiCacheKey, answer, "EX", 3600); // cache 1 hour
    }

    // Auto-translate if needed
    if (lang !== "en") {
      answer = await translateTo(answer, lang);
    }

    // Send reply to Telegram
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: answer,
      }),
    });

    res.end("Message sent");
  } catch (error) {
    console.error("Error replying to Telegram:", error);
    res.status(500).end("Failed to send message");
  }
}
