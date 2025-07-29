import Redis from "ioredis";
import { Configuration, OpenAIApi } from "openai";
import fetch from "node-fetch";

const redis = new Redis(process.env.REDIS_URL);

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "success20242";
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

const COOLDOWN_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_HISTORY_LENGTH = 6;

async function isRateLimited(senderId) {
  const key = `rateLimit:${senderId}`;
  const now = Date.now();
  let timestamps = (await redis.lrange(key, 0, -1)).map(Number);
  timestamps = timestamps.filter(ts => now - ts < COOLDOWN_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) return true;

  await redis.lpush(key, now.toString());
  await redis.ltrim(key, 0, MAX_REQUESTS_PER_WINDOW - 1);
  await redis.expire(key, Math.ceil(COOLDOWN_MS / 1000));

  return false;
}

async function getMemory(senderId) {
  const data = await redis.get(`memory:${senderId}`);
  return data ? JSON.parse(data) : [];
}

async function saveMemory(senderId, history) {
  await redis.set(`memory:${senderId}`, JSON.stringify(history), "EX", 3600);
}

async function sendMessage(senderId, message) {
  const body = {
    messaging_type: "RESPONSE",
    recipient: { id: senderId },
    message: {
      text: message,
      quick_replies: [
        { content_type: "text", title: "🌍 Translate for me", payload: "TRANSLATE" },
        { content_type: "text", title: "🤖 Ask AI-Nwanne", payload: "ASK_AI" },
      ],
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${FACEBOOK_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      console.error("Facebook API error:", await response.text());
    }
  } catch (e) {
    console.error("sendMessage exception:", e);
  }
}

async function handleMessage(senderId, text) {
  if (await isRateLimited(senderId)) {
    return sendMessage(senderId, "⏱️ You've reached the limit. Please wait before sending more messages.");
  }

  let history = await getMemory(senderId);
  const isFirstInteraction = history.length === 0;

  if (isFirstInteraction) {
    await sendMessage(senderId, `👋 Hi, I'm *AI-Nwanne*! Ask me anything. You can also tap a quick option below.`);
  }

  history.push({ role: "user", content: text });
  if (history.length > MAX_HISTORY_LENGTH) history.shift();

  try {
    const chat = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are AI-Nwanne, a smart assistant for Facebook Messenger users." },
        ...history,
      ],
    });

    const reply = chat.data.choices[0]?.message?.content || "🤖 Sorry, I couldn't generate a response.";
    history.push({ role: "assistant", content: reply });
    await saveMemory(senderId, history);
    await sendMessage(senderId, reply);
  } catch (err) {
    console.error("OpenAI error:", err);
    await sendMessage(senderId, "⚠️ Sorry, something went wrong on my side.");
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  if (req.method === "POST") {
    const { object, entry } = req.body;

    if (object === "page" && Array.isArray(entry)) {
      for (const ent of entry) {
        for (const event of ent.messaging || []) {
          const senderId = event.sender?.id;
          const text = event.message?.text || event.message?.quick_reply?.payload;
          if (senderId && text) {
            await handleMessage(senderId, text);
          }
        }
      }
      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.sendStatus(404);
  }

  return res.sendStatus(405);
}
