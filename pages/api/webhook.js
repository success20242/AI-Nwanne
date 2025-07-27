export default function handler(req, res) {
  if (req.method === "GET") {
    const VERIFY_TOKEN = "success20242";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  }

  // You can add the POST handler below as needed
  else if (req.method === "POST") {
    // Handle incoming messages
    console.log("Received webhook POST", req.body);
    res.sendStatus(200);
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
