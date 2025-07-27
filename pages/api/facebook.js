import Redis from "ioredis";
import axios from "axios";
import { OpenAI } from "openai";
import { askAI } from "../../lib/ai.js";
import { detectLang } from "../../lib/detectLang.js";

const redis = new Redis(process.env.REDIS_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const POST_COOLDOWN_MS = 3000; // 3 seconds per user cooldown

// Helper: sanitize Redis keys (basic, to avoid special chars in text keys)
function sanitizeKey(str) {
  return encodeURIComponent(str).replace(/\./g, "%2E");
}

async function translateTo(text, targetLang) {
  if (targetLang === "en") return text; // no translation needed

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
  } catch (error) {
    console.error("❌ Translation error:", error);
    return text; // fallback: return original text
  }
}

export default async function handler(req, res) {
  // ===== Webhook verification (GET) =====
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ FACEBOOK WEBHOOK VERIFIED");
      return res.status(200).send(challenge);
    } else {
      console.warn("❌ Verification failed: invalid token");
      return res.status(403).send("Forbidden");
    }
  }

  // ===== Handle webhook events (POST) =====
  if (req.method === "POST") {
    try {
      const { entry } = req.body;
      const messaging = entry?.[0]?.messaging?.[0];
      const text = messaging?.message?.text;
      const senderId = messaging?.sender?.id;

      if (!text || !senderId) {
        console.warn("⚠️ No text or sender ID");
        return res.end("No valid message");
      }

      // Rate limit per senderId
      const lastRequestKey = `lastReq:${senderId}`;
      const lastRequest = await redis.get(lastRequestKey);
      const now = Date.now();

      if (lastRequest && now - parseInt(lastRequest, 10) < POST_COOLDOWN_MS) {
        console.warn(`⚠️ User ${senderId} rate limited`);
        return res.status(429).end("Too Many Requests");
      }
      await redis.set(lastRequestKey, now.toString(), "PX", POST_COOLDOWN_MS);

      // Detect language with caching
      const langCacheKey = `lang:${senderId}:${sanitizeKey(text)}`;
      let lang = await redis.get(langCacheKey);
      if (!lang) {
        lang = await detectLang(text);
        await redis.set(langCacheKey, lang, "EX", 3600); // cache for 1 hour
      }

      // AI response cache (uses Wikipedia fact-checking via askAI)
      const aiCacheKey = `aiResp:${senderId}:${sanitizeKey(text)}`;
      let answer = await redis.get(aiCacheKey);
      if (!answer) {
        answer = await askAI(text, lang);
        await redis.set(aiCacheKey, answer, "EX", 3600); // cache for 1 hour
      }

      // Translate answer to original language if needed
      if (lang !== "en") {
        answer = await translateTo(answer, lang);
      }

      // Send text reply to Facebook user
      const fbResponse = await axios.post(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
        {
          messaging_type: "RESPONSE",
          recipient: { id: senderId },
          message: { text: answer },
        }
      );

      if (fbResponse.status !== 200) {
        console.error("❌ Failed to send message:", fbResponse.data);
        return res.status(500).end("Failed to send");
      }

      console.log(`✅ Replied to Facebook user ${senderId}`);
      return res.end("Message sent");
    } catch (error) {
      console.error("❌ Error handling Facebook message:", error.response?.data || error.message);
      return res.status(500).end("Internal server error");
    }
  }

  // ===== Unsupported HTTP methods =====
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
