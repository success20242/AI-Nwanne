import { askAI } from "../../lib/ai.js";
import axios from "axios";

const dailyPrompt = "Give me a powerful one-line cultural proverb from Nigeria with deep meaning and English translation.";

const caption = async () => await askAI(dailyPrompt);

export default async function handler(req, res) {
  try {
    const message = await caption();

    await axios.post(
      `https://graph.facebook.com/${process.env.FACEBOOK_PAGE_ID}/feed?access_token=${process.env.FACEBOOK_ACCESS_TOKEN}`,
      { message }
    );

    res.status(200).end("Posted");
  } catch (error) {
    console.error("Error posting to Facebook:", error);
    res.status(500).end("Failed to post");
  }
}
