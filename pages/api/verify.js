export default function handler(req, res) {
  const VERIFY_TOKEN = "TEST_CHALLENGE";

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED ✅");
        res.status(200).send(challenge);
        return; // ✅ just end here without returning a value
      } else {
        res.status(403).end();
        return;
      }
    } else {
      res.status(400).end();
      return;
    }
  }

  if (req.method === "POST") {
    const body = req.body;
    console.log("📥 Received event:", JSON.stringify(body, null, 2));

    res.status(200).end();
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
