// pages/api/webhook.js

export default function handler(req, res) {
  const VERIFY_TOKEN = "success20242";

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  } else if (req.method === "POST") {
    console.log("Received webhook:", req.body);
    return res.sendStatus(200);
  } else {
    // Unsupported HTTP method
    return res.sendStatus(405);
  }
}
