import { askAI } from "../../lib/ai.js";
// import { generateVoice } from "../../lib/tts.js";
// import { sendTelegramVoice } from "../../utils/sendVoice.js";
import { detectLang, langToCode } from "../../lib/detectLang.js";

export default async function handler(req, res) {
  const msg = req.body.message?.text;
  const chatId = req.body.message?.chat.id;

  if (!msg || !chatId) {
    return res.end("No message");
  }

  try {
    const lang = detectLang(msg);
    const langCode = langToCode(lang);
    const answer = await askAI(msg, lang);

    // Send AI-generated reply back to Telegram
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
