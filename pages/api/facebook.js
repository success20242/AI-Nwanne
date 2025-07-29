import Redis from "ioredis";
import { Configuration, OpenAIApi } from "openai";

const redis = new Redis(process.env.REDIS_URL);

const config = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(config);

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

const COOLDOWN_MS = 60000; // 1 minute cooldown window
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_HISTORY_LENGTH = 6;

function sanitizeKey(str) {
  return encodeURIComponent(str).replace(/\./g, "%2E");
}

async function isRateLimited(senderId) {
  const key = `rateLimit:${senderId}`;
  const now = Date.now();

  // get timestamps array from Redis
  let timestamps = await redis.lrange(key, 0, -1);
  timestamps = timestamps.map(Number).filter(ts => now - ts < COOLDOWN_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  // Add current timestamp and trim list
  await redis.lpush(key, now.toString());
  await redis.ltrim(key, 0, MAX_REQUESTS_PER_WINDOW - 1);
  // Set expiry so Redis cleans it eventually
  await redis.expire(key, Math.ceil(COOLDOWN_MS / 1000));

  return false;
}

async function getMemory(senderId) {
  const key = `memory:${senderId}`;
  const json = await redis.get(key);
  return json ? JSON.parse(json) : [];
}

async function saveMemory(senderId, history) {
  const key = `memory:${senderId}`;
  await redis.set(key, JSON.stringify(history), "EX", 3600); // 1 hour expiry
}

async function handleMessage(senderId, text) {
  if (await isRateLimited(senderId)) {
    return sendMessage(senderId, "⏱️ You've reached the limit. Please wait a moment before sending more messages.");
  }

  let history = await getMemory(senderId);
  if (history.length === 0) {
    await sendMessage(senderId, `👋 Hi, I'm AI-Nwanne! Ask me anything. You can also tap a quick option below.`);
  }

  history.push({ role: "user", content: text });
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are AI-Nwanne, a smart assistant for Facebook Messenger users." },
        ...history,
      ],
    });

    const reply = response.data.choices[0].message.content;
    history.push({ role: "assistant", content: reply });

    await saveMemory(senderId, history);
    await sendMessage(senderId, reply);
  } catch (err) {
    console.error("OpenAI error:", err.message);
    await sendMessage(senderId, "⚠️ Sorry, I'm having trouble thinking right now.");
  }
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
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${FACEBOOK_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("sendMessage error:", e);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } else if (req.method === "POST") {
    const body = req.body;
    if (body.object === "page") {
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        if (webhookEvent.message && webhookEvent.message.text) {
          const text = webhookEvent.message.text;
          await handleMessage(senderId, text);
        } else if (webhookEvent.message && webhookEvent.message.quick_reply) {
          await handleMessage(senderId, webhookEvent.message.quick_reply.payload);
        }
      }
      return res.status(200).send("EVENT_RECEIVED");
    }
    return res.sendStatus(404);
  }
  return res.sendStatus(405);
}
