import fs from 'fs/promises';
import path from 'path';
import { Configuration, OpenAIApi } from 'openai';

const config = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(config);

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;

const memoryFile = path.resolve('./user_memory.json');
const rateLimitFile = path.resolve('./rate_limits.json');
const memoryMap = new Map();
const rateLimits = new Map();

const loadJSON = async (file, fallback) => {
  try {
    const content = await fs.readFile(file, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
};

const saveJSON = async (file, data) => {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
};

const isRateLimited = (senderId) => {
  const windowSize = 60 * 1000; // 1 minute
  const maxRequests = 5;
  const now = Date.now();
  const userTimestamps = rateLimits.get(senderId) || [];
  const recent = userTimestamps.filter(ts => now - ts < windowSize);
  if (recent.length >= maxRequests) return true;
  recent.push(now);
  rateLimits.set(senderId, recent);
  saveJSON(rateLimitFile, Object.fromEntries(rateLimits));
  return false;
};

const handleMessage = async (senderId, text) => {
  if (isRateLimited(senderId)) {
    return sendMessage(senderId, "⏱️ You've reached the limit. Please wait a moment before sending more messages.");
  }

  if (!memoryMap.has(senderId)) {
    memoryMap.set(senderId, []);
    await sendMessage(senderId, `👋 Hi, I'm AI Nwanne! Ask me anything. You can also tap a quick option below.`);
  }

  const history = memoryMap.get(senderId);
  history.push({ role: 'user', content: text });
  if (history.length > 6) history.shift();

  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are AI Nwanne, a smart assistant for Facebook Messenger users.' },
        ...history
      ]
    });
    const reply = response.data.choices[0].message.content;
    history.push({ role: 'assistant', content: reply });
    memoryMap.set(senderId, history);
    await sendMessage(senderId, reply);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    await sendMessage(senderId, "⚠️ Sorry, I'm having trouble thinking right now.");
  }
  await saveJSON(memoryFile, Object.fromEntries(memoryMap));
};

const sendMessage = async (senderId, message) => {
  const body = {
    messaging_type: 'RESPONSE',
    recipient: { id: senderId },
    message: {
      text: message,
      quick_replies: [
        { content_type: 'text', title: '🌍 Translate for me', payload: 'TRANSLATE' },
        { content_type: 'text', title: '🤖 Ask AI Nwanne', payload: 'ASK_AI' }
      ]
    }
  };
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('sendMessage error:', e);
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } else if (req.method === 'POST') {
    const memoryData = await loadJSON(memoryFile, {});
    Object.entries(memoryData).forEach(([id, messages]) => memoryMap.set(id, messages));
    const rateData = await loadJSON(rateLimitFile, {});
    Object.entries(rateData).forEach(([id, timestamps]) => rateLimits.set(id, timestamps));

    const body = req.body;
    if (body.object === 'page') {
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
      return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
  }
  return res.sendStatus(405);
}
