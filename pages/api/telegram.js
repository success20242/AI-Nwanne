import Redis from "ioredis";
import { OpenAI } from "openai";
import { askAI } from "../../lib/ai.js";
import { detectLang, langToCode } from "../../lib/detectLang.js";

const redis = new Redis(process.env.REDIS_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COOLDOWN_MS = 3000; // per user cooldown in ms

async function translateTo(text, targetLang) {
  if (targetLang === "en") return text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful translator." },
        { role: "user", content: `Translate this to ${targetLang}:\n\n${text}` },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content?.trim() || text;
  } catch (err) {
    console.error("Translation failed:", err);
    return text; // Fallback: return original text
  }
}

export default async function handler(req, res) {
  try {
    const message = req.body?.message;
    const msg = message?.text?.trim();
    const chatId = message?.chat?.id;

    if (!msg || !chatId) {
      console.log("No message or chat ID found.");
      return res.end("No message");
    }

    // Cooldown control
    const lastRequestKey = `lastReq:${chatId}`;
    const lastRequest = await redis.get(lastRequestKey);
    const now = Date.now();

    if (lastRequest && now - parseInt(lastRequest, 10) < COOLDOWN_MS) {
      console.warn(`⚠️ User ${chatId} rate limited`);
      return res.status(429).end("Too Many Requests");
    }
    await redis.set(lastRequestKey, now.toString(), "PX", COOLDOWN_MS);

    // Detect language (cached)
    const langCacheKey = `lang:${chatId}:${msg}`;
    let lang = await redis.get(langCacheKey);
    if (!lang) {
      lang = await detectLang(msg);
      await redis.set(langCacheKey, lang, "EX", 3600);
    }

    // AI response (cached)
    const aiCacheKey = `aiResp:${chatId}:${msg}`;
    let answer = await redis.get(aiCacheKey);
    if (!answer) {
      answer = await askAI(msg, lang);
      await redis.set(aiCacheKey, answer, "EX", 3600);
    }

    // Auto-translate back to detected language
    if (lang !== "en") {
      answer = await translateTo(answer, lang);
    }

    // Send message to Telegram
    const sendResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: answer,
        }),
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("Failed to send Telegram message:", errorText);
      return res.status(500).end("Failed to send message");
    }

    res.end("Message sent");
  } catch (error) {
    console.error("Error in Telegram webhook handler:", error);
    res.status(500).end("Internal server error");
  }
}
