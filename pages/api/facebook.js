import Redis from "ioredis";
import axios from "axios";
import { askAI } from "../../lib/ai.js";
import { detectLang } from "../../lib/detectLang.js";
import { translate } from "../../lib/translate.js";

const redis = new Redis(process.env.REDIS_URL);

const POST_COOLDOWN_MS = 3000; // 3 seconds per user cooldown

function sanitizeKey(str) {
  return encodeURIComponent(str).replace(/\./g, "%2E");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ FACEBOOK WEBHOOK VERIFIED");
        return res.status(200).send(challenge);
      } else {
        console.warn("❌ Verification failed: invalid token");
        return res.status(403).send("Forbidden");
      }
    } else {
      return res.status(400).send("Bad Request");
    }
  } else if (req.method === "POST") {
    try {
      if (!req.body || !req.body.entry) {
        return res.status(400).send("Invalid webhook payload");
      }

      for (const entry of req.body.entry) {
        if (!entry.messaging) continue;

        for (const messagingEvent of entry.messaging) {
          const senderId = messagingEvent.sender?.id;
          const text = messagingEvent.message?.text;

          if (!senderId || !text) {
            console.warn("⚠️ Missing senderId or text, skipping event");
            continue;
          }

          // Rate limit check
          const lastRequestKey = `lastReq:${senderId}`;
          const lastRequest = await redis.get(lastRequestKey);
          const now = Date.now();

          if (lastRequest && now - parseInt(lastRequest, 10) < POST_COOLDOWN_MS) {
            console.warn(`⚠️ User ${senderId} rate limited`);
            continue;
          }
          await redis.set(lastRequestKey, now.toString(), "PX", POST_COOLDOWN_MS);

          // Detect language with caching
          const langCacheKey = `lang:${senderId}:${sanitizeKey(text)}`;
          let lang = await redis.get(langCacheKey);
          if (!lang) {
            lang = await detectLang(text);
            await redis.set(langCacheKey, lang, "EX", 3600);
          }

          // AI response cache
          const aiCacheKey = `aiResp:${senderId}:${sanitizeKey(text)}`;
          let answer = await redis.get(aiCacheKey);
          if (!answer) {
            answer = await askAI(text, lang);
            await redis.set(aiCacheKey, answer, "EX", 3600);
          }

          // Translate answer if user's language is not English
          if (lang !== "en") {
            try {
              // Translate from English (AI's answer) to user's language
              answer = await translate(answer, "en", lang);
            } catch (error) {
              console.error("❌ Translation error:", error);
              // fallback: send English answer if translation fails
            }
          }

          // Send reply to Facebook user
          try {
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
            } else {
              console.log(`✅ Replied to Facebook user ${senderId}`);
            }
          } catch (fbErr) {
            console.error("❌ Error sending reply to Facebook:", fbErr.response?.data || fbErr.message);
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      console.error("❌ Error handling POST webhook:", err.response?.data || err.message || err);
      return res.status(500).send("Internal server error");
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
