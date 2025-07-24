import { askAI } from "../lib/ai.js";
// import { generateVoice } from "../lib/tts.js";
// import { sendTelegramVoice } from "../utils/sendVoice.js";
import { detectLang, langToCode } from "../lib/detectLang.js";

export default async function handler(req, res) {
  const msg = req.body.message?.text;
  const chatId = req.body.message?.chat.id;

  if (!msg) return res.end("No message");

  const lang = detectLang(msg);
  const langCode = langToCode(lang);
  const answer = await askAI(msg, lang);
  // const file = `/tmp/voice.mp3`;

  // await generateVoice(answer, langCode, file);
  // await sendTelegramVoice(process.env.TELEGRAM_BOT_TOKEN, chatId, file, answer);

  // Instead, send only the text message back
  // You probably have a Telegram Bot client setup somewhere else to send messages
  // If not, you can add a simple fetch or axios call here to send the text reply

  // Example using axios to send text message:
  /*
  import axios from "axios";
  await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text: answer
  });
  */

  res.end("OK");
}
