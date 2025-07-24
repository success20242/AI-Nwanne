import { askAI } from "../lib/ai.js";
import { generateVoice } from "../lib/tts.js";
import fs from "fs";
import axios from "axios";
import { detectLang, langToCode } from "../lib/detectLang.js";

export default async function handler(req, res) {
  const { entry } = req.body;
  const messaging = entry?.[0]?.messaging?.[0];
  const text = messaging?.message?.text;
  const senderId = messaging?.sender?.id;

  if (!text) return res.end("OK");

  const lang = detectLang(text);
  const answer = await askAI(text, lang);
  const langCode = langToCode(lang);
  const file = `/tmp/fbvoice.mp3`;
  await generateVoice(answer, langCode, file);

  // Send text reply
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
    {
      messaging_type: "RESPONSE",
      recipient: { id: senderId },
      message: { text: answer }
    }
  );

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

  res.end("OK");
}
