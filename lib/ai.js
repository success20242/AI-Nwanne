import { OpenAI } from "openai";
import fetch from "node-fetch";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Determines the Wikipedia search term based on user's question.
 */
function getWikiQuery(userPrompt) {
  const prompt = userPrompt.toLowerCase();
  if (/\bking(s)?\b/.test(prompt) && !/\bqueen(s)?\b/.test(prompt)) {
    return "List of kings of the United Kingdom";
  }
  if (/\bqueen(s)?\b/.test(prompt) && !/\bking(s)?\b/.test(prompt)) {
    return "List of queens of the United Kingdom";
  }
  if (/\b(monarch|ruler|head of state|sovereign)\b/.test(prompt)) {
    return "Monarchs of the United Kingdom";
  }
  // Default fallback
  return userPrompt;
}

async function wikiSummary(query) {
  // Improved search for better matching
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
  try {
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const topTitle = searchData?.query?.search?.[0]?.title;
    if (!topTitle) return null;

    // Fetch summary for the top result
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();
    if (summaryData.extract) return summaryData.extract;
    return null;
  } catch (e) {
    console.error("Wikipedia fetch error:", e);
    return null;
  }
}

export async function askAI(userPrompt, lang = "en") {
  // 1. Get Wikipedia summary with the right query
  const wikiQuery = getWikiQuery(userPrompt);
  const wikiExtract = await wikiSummary(wikiQuery);

  let contextSection = "";
  if (wikiExtract) {
    contextSection = `Here is information from Wikipedia related to the question:\n"""\n${wikiExtract}\n"""\n`;
  }

  // 2. Precise, flexible prompt
  const mainPrompt = `
You are a reliable, concise, and up-to-date assistant.
- Use Wikipedia info if provided.
- If the user asks for "kings", give only kings; "queens", only queens; "monarchs" or "rulers", include both.
- If the question is ambiguous, clarify and explain the difference.
- Give a short, simple, and complete answer.
- Do NOT guess or add unsupported information.
- NO emojis, no fluff.
${contextSection}
User's question: """${userPrompt}"""
Short, clear, factual answer:
  `.trim();

  const mainResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a concise, factually accurate assistant." },
      { role: "user", content: mainPrompt }
    ],
    temperature: 0,
    max_tokens: 200,
  });

  let answer = mainResponse.choices[0]?.message?.content?.trim();

  // Cite Wikipedia if used
  if (wikiExtract) {
    answer += `\n\n(Source: Wikipedia)`;
  }

  return answer;
}
