import { OpenAI } from "openai";
import fetch from "node-fetch";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Search Wikipedia for a summary related to the user's query.
 * Returns the first relevant summary or null if not found.
 */
async function wikiSummary(query) {
  // Use the search endpoint to improve match for ambiguous queries
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
  try {
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const topTitle = searchData?.query?.search?.[0]?.title;
    if (!topTitle) return null;

    // Now fetch the summary for the top result
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

/**
 * Generates a concise, factually correct, and unambiguous answer to the user's question.
 * Fact-checks using Wikipedia summary when possible.
 * @param {string} userPrompt - The user's original question.
 * @param {string} lang - Language code.
 * @returns {Promise<string>} - Fact-checked response.
 */
export async function askAI(userPrompt, lang = "en") {
  // 1. Get Wikipedia summary for fact-checking
  const wikiExtract = await wikiSummary(userPrompt);

  // 2. Build context for OpenAI
  let contextSection = "";
  if (wikiExtract) {
    contextSection = `Here is information from Wikipedia related to the question:\n"""\n${wikiExtract}\n"""\n`;
  }

  // 3. Step: Generate the answer with a robust prompt
  const mainPrompt = `
You are a reliable, concise, and up-to-date assistant. 
- Give a SHORT, SIMPLE, and COMPLETE answer.
- If Wikipedia info is provided, use it. If not, answer only with facts you are sure about.
- If the question is unclear or ambiguous, ask the user to clarify.
- Do NOT guess or add information that is not supported.
- NO emojis, no unnecessary fluff.
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

  // 4. If Wikipedia summary exists, optionally add the source
  if (wikiExtract) {
    answer += `\n\n(Source: Wikipedia)`;
  }

  return answer;
}
