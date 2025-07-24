import fs from "fs";
import axios from "axios";
import FormData from "form-data";

export async function sendTelegramVoice(botToken, chatId, filePath, caption = "") {
  const url = `https://api.telegram.org/bot${botToken}/sendVoice`;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("voice", fs.createReadStream(filePath));
  const res = await axios.post(url, form, { headers: form.getHeaders() });
  return res.data;
}
