// pages/api/webhook.js

export default function handler(req, res) {
  const VERIFY_TOKEN = "success20242";

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED ✅");
      return res.status(200).send(challenge);
    } else {
      console.warn("WEBHOOK VERIFICATION FAILED ❌");
      return res.sendStatus(403);
    }

  } else if (req.method === "POST") {
    const body = req.body;

    // Check this is a page subscription event
    if (body.object === "page") {
      body.entry.forEach(entry => {
        const event = entry.messaging[0];
        console.log("📥 Received event:", JSON.stringify(event, null, 2));
        // You can respond to messages here (e.g. call send API)
      });

      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }

  } else {
    // Unsupported HTTP method
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
