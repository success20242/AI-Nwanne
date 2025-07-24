// pages/api/verify.js

export default function handler(req, res) {
  const VERIFY_TOKEN = "TEST_CHALLENGE";

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED ✅");
        return res.status(200).send(challenge);
      } else {
        return res.sendStatus(403);
      }
    } else {
      return res.sendStatus(400);
    }
  }

  if (req.method === "POST") {
    const body = req.body;

    console.log("📥 Received event:", JSON.stringify(body, null, 2));

    // Optionally respond to the user here or pass to another handler
    return res.sendStatus(200);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
