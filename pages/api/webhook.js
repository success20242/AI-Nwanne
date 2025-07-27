// pages/api/webhook.js
import axios from "axios";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242"; // match this in Facebook App webhook settings

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        return res.status(200).send(challenge);
      } else {
        return res.sendStatus(403); // Forbidden - Token mismatch
      }
    } else {
      return res.sendStatus(400); // Bad Request - Missing query parameters
    }

  } else if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const messagingEvents = entry.messaging;

        for (const event of messagingEvents) {
          const senderId = event.sender.id;
          const messageText = event.message?.text;

          if (messageText) {
            try {
              const completion = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [
                  { role: "system", content: "You are a helpful assistant." },
                  { role: "user", content: messageText },
                ],
                max_tokens: 150,
              });

              const reply = completion.data.choices[0].message.content;

              await axios.post(
                `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
                {
                  messaging_type: "RESPONSE",
                  recipient: { id: senderId },
                  message: { text: reply },
                }
              );
            } catch (err) {
              console.error("Error responding to Facebook message:", err.message);
            }
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } else {
      return res.sendStatus(404); // Not a valid Facebook event
    }

  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
