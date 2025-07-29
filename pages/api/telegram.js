import Redis from "ioredis";
import { Configuration, OpenAIApi } from "openai";
import fetch from "node-fetch";

const redis = new Redis(process.env.REDIS_URL);
const COOLDOWN_MS = 3000;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const message = req.body?.message;
    const msg = message?.text?.trim();
    const chatId = message?.chat?.id;
    const userFirstName = message?.from?.first_name || "there";

    if (!msg || !chatId) return res.end("No message");

    const lastRequestKey = `cooldown:${chatId}`;
    const lastRequest = await redis.get(lastRequestKey);
    const now = Date.now();

    if (lastRequest && now - parseInt(lastRequest, 10) < COOLDOWN_MS) {
      return res.status(429).end("Too Many Requests");
    }
    await redis.set(lastRequestKey, now.toString(), "PX", COOLDOWN_MS);

    const userKey = `user:${chatId}`;
    const userExists = await redis.exists(userKey);

    if (!userExists) {
      await redis.hset(userKey, {
        firstSeen: new Date().toISOString(),
        name: userFirstName,
        lang: "en",
      });
    }

    let answer = "";
    if (!userExists) {
      answer = `👋 Welcome ${userFirstName}! I am *AI-Nwanne*, your smart assistant. Ask me anything.`;
    } else {
      const prompt = `Reply conversationally and helpfully to this message: ${msg}`;
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a friendly assistant named AI-Nwanne who helps with smart, accurate, and culturally aware responses." },
          { role: "user", content: prompt },
        ],
      });
      answer = completion.data.choices[0].message.content.trim();
    }

    const sendResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: answer,
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["What can you do?", "Tell me a fun fact"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }),
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("Telegram Error:", errorText);
      return res.status(500).end("Failed to send Telegram message");
    }

    res.status(200).end("Message sent");
  } catch (error) {
    console.error("Telegram webhook error:", error);
    res.status(500).end("Internal server error");
  }
}
