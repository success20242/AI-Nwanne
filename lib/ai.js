import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askAI(prompt, lang = "en") {
  const { choices } = await openai.chat.completions.create({
    messages: [{ role: "user", content: `(${lang}) ${prompt}` }],
    model: "gpt-4o"
  });
  return choices[0].message.content;
}
