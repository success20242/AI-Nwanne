import axios from "axios";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  if (req.method === "GET") {
    // verification logic...
    const VERIFY_TOKEN = "success20242";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  } else if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const messagingEvent = entry.messaging[0];
        const senderId = messagingEvent.sender.id;
        const receivedMessage = messagingEvent.message?.text;

        if (receivedMessage) {
          // Generate AI reply using OpenAI
          const completion = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: receivedMessage },
            ],
            max_tokens: 150,
          });

          const replyText = completion.data.choices[0].message.content;

          // Send the AI reply back to Facebook user
          await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
            {
              messaging_type: "RESPONSE",
              recipient: { id: senderId },
              message: { text: replyText },
            }
          );
        }
      }

      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
