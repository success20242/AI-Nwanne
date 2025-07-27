import Redis from "ioredis";
import { askAI } from "../../lib/ai.js";
import { detectLang } from "../../lib/detectLang.js";
import { translate } from "../../lib/translate.js"; // Use the provider-based translation module

const redis = new Redis(process.env.REDIS_URL);

const COOLDOWN_MS = 3000; // per user cooldown in ms

// Helper: sanitize Redis keys (basic, to avoid special chars in text keys)
function sanitizeKey(str) {
  return encodeURIComponent(str).replace(/\./g, "%2E");
}

export default async function handler(req, res) {
  try {
    const message = req.body?.message;
    const msg = message?.text?.trim();
    const chatId = message?.chat?.id;
    if (!msg || !chatId) return res.end("No message");

    // Cooldown control
    const lastRequestKey = `lastReq:${chatId}`;
    const lastRequest = await redis.get(lastRequestKey);
    const now = Date.now();
    if (lastRequest && now - parseInt(lastRequest, 10) < COOLDOWN_MS) {
      return res.status(429).end("Too Many Requests");
    }
    await redis.set(lastRequestKey, now.toString(), "PX", COOLDOWN_MS);

    // Detect language (cached)
    const langCacheKey = `lang:${chatId}:${sanitizeKey(msg)}`;
    let lang = await redis.get(langCacheKey);
    if (!lang) {
      lang = await detectLang(msg);
      await redis.set(langCacheKey, lang, "EX", 3600);
    }

    // AI response (cached, with Wikipedia fact-checking)
    const aiCacheKey = `aiResp:${chatId}:${sanitizeKey(msg)}`;
    let answer = await redis.get(aiCacheKey);
    if (!answer) {
      answer = await askAI(msg, lang);
      await redis.set(aiCacheKey, answer, "EX", 3600);
    }

    // Translate if needed
    if (lang !== "en") {
      try {
        answer = await translate(answer, lang, "en");
      } catch (err) {
        console.error("Translation failed:", err);
        // fallback: English answer if translation fails
      }
    }

    // Send reply to Telegram
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
