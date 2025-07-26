import { askAI } from "../../lib/ai.js";
// import { generateVoice } from "../../lib/tts.js";
import fs from "fs";
import axios from "axios";
import { detectLang, langToCode } from "../../lib/detectLang.js";

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

      const lang = detectLang(text);
      const langCode = langToCode(lang);
      const answer = await askAI(text, lang);

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
