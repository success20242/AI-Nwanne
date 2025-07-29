import Redis from "ioredis";
import { Configuration, OpenAIApi } from "openai";

const redis = new Redis(process.env.REDIS_URL);

const COOLDOWN_MS = 3000;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const USED_TOPICS_FILE = './used_topics.json';
const memoryStore = './telegram_memory.json';

function sanitizeKey(str) {
  return encodeURIComponent(str).replace(/\./g, "%2E");
}

async function loadMemory() {
  try {
    const fs = await import("fs/promises");
    const data = await fs.readFile(memoryStore, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveMemory(memory) {
  const fs = await import("fs/promises");
  await fs.writeFile(memoryStore, JSON.stringify(memory, null, 2));
}

export default async function handler(req, res) {
  try {
    const message = req.body?.message;
    const msg = message?.text?.trim();
    const chatId = message?.chat?.id;
    const userFirstName = message?.from?.first_name || "there";
    if (!msg || !chatId) return res.end("No message");

    const lastRequestKey = `lastReq:${chatId}`;
    const lastRequest = await redis.get(lastRequestKey);
    const now = Date.now();
    if (lastRequest && now - parseInt(lastRequest, 10) < COOLDOWN_MS) {
      return res.status(429).end("Too Many Requests");
    }
    await redis.set(lastRequestKey, now.toString(), "PX", COOLDOWN_MS);

    const memory = await loadMemory();
    const userKey = String(chatId);
    let isFirstTime = !memory[userKey];

    // Store user in memory
    memory[userKey] = { firstSeen: new Date().toISOString(), name: userFirstName };
    await saveMemory(memory);

    let answer = "";
    if (isFirstTime) {
      answer = `👋 Welcome ${userFirstName}! I am *AI Nwanne*, your smart assistant. Ask me anything.`;
    } else {
      const prompt = `Reply conversationally and helpfully to this message: ${msg}`;
      const completion = await openai.createChatCompletion({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a friendly assistant named AI Nwanne who helps with smart, accurate, and culturally aware responses." },
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
      console.error("Failed to send Telegram message:", errorText);
      return res.status(500).end("Failed to send message");
    }

    res.end("Message sent");
  } catch (error) {
    console.error("Error in Telegram webhook handler:", error);
    res.status(500).end("Internal server error");
  }
}
