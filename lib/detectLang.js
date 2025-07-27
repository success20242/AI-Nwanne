import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Detect language of a text using OpenAI.
 * Returns ISO language code (e.g., en, fr, es).
 */
export async function detectLang(text) {
  const prompt = `Detect the language of the following text and output only the ISO 639-1 code (for example: en, fr, es, etc.):\n\n${text}`;
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are a language detection tool." },
      { role: "user", content: prompt }
    ],
    temperature: 0,
    max_tokens: 5
  });
  return response.choices[0]?.message?.content?.trim()?.toLowerCase() || "en";
}
