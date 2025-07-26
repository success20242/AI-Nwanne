import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askAI(prompt, lang = "en") {
  const systemPrompt = `
You are a smart, friendly assistant that replies clearly and helpfully.
Make your responses:
- Well-structured and professionally written
- Easy to read, using short paragraphs and line breaks
- Friendly and warm in tone (not robotic)
- Include emojis where helpful (but not excessive)
- Adapt your answer to the user's language: ${lang.toUpperCase()}
`;

  const { choices } = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature: 0.8,
    max_tokens: 500
  });

  return choices[0].message.content.trim();
}
