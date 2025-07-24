import { askAI } from "../lib/ai.js";
// import { generateVoice } from "../lib/tts.js";
import fs from "fs";
import axios from "axios";
import { detectLang, langToCode } from "../lib/detectLang.js";

export default async function handler(req, res) {
  // ===== Webhook verification (GET) =====
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242"; // Your chosen verify token

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Forbidden");
    }
  }

  // ===== Handle webhook events (POST) =====
  if (req.method === "POST") {
    const { entry } = req.body;
    const messaging = entry?.[0]?.messaging?.[0];
    const text = messaging?.message?.text;
    const senderId = messaging?.sender?.id;

    if (!text) return res.end("OK");

    const lang = detectLang(text);
    const answer = await askAI(text, lang);
    const langCode = langToCode(lang);
    // const file = `/tmp/fbvoice.mp3`;
    // await generateVoice(answer, langCode, file);

    // Send text reply
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
      {
        messaging_type: "RESPONSE",
        recipient: { id: senderId },
        message: { text: answer }
      }
    );

    /*
    // Upload voice note
    const form = new FormData();
    form.append("filedata", fs.createReadStream(file));
    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/me/message_attachments?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
      form,
      { headers: form.getHeaders() }
    );

    const attachment_id = data.attachment_id;

    // Send audio reply
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
      {
        messaging_type: "RESPONSE",
        recipient: { id: senderId },
        message: {
          attachment: {
            type: "audio",
            payload: { attachment_id }
          }
        }
      }
    );
    */

    return res.end("OK");
  }

  // ===== Unsupported HTTP methods =====
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
