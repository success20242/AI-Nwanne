// pages/api/webhook.js
export default async function handler(req, res) {
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242"; // match the token in your Facebook app settings

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge); // ✅ Echo the challenge
      } else {
        res.sendStatus(403); // ❌ Token didn't match
      }
    } else {
      res.sendStatus(400); // ❌ Missing parameters
    }
  } else if (req.method === "POST") {
    // Here you process incoming messages
    console.log("Webhook event received:", JSON.stringify(req.body, null, 2));
    res.sendStatus(200); // Required response to acknowledge receipt
  } else {
    res.sendStatus(405); // Method not allowed
  }
}
