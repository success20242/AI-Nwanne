import { OpenAI } from "openai";
import fetch from "node-fetch";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getWikiQuery(userPrompt) {
  const prompt = userPrompt.toLowerCase().trim();
  if (/\bking(s)?\b/.test(prompt) && !/\bqueen(s)?\b/.test(prompt)) {
    return "List of kings of the United Kingdom";
  }
  if (/\bqueen(s)?\b/.test(prompt) && !/\bking(s)?\b/.test(prompt)) {
    return "List of queens of the United Kingdom";
  }
  if (/\b(monarch|ruler|head of state|sovereign)\b/.test(prompt)) {
    return "Monarchs of the United Kingdom";
  }
  return prompt;
}

async function wikiSummary(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
  try {
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();

    // Pick first non-disambiguation result
    const searchResults = searchData?.query?.search || [];
    let topTitle = null;
    for (const result of searchResults) {
      if (!/disambiguation/i.test(result.snippet)) {
        topTitle = result.title;
        break;
      }
    }
    if (!topTitle && searchResults[0]) {
      topTitle = searchResults[0].title; // fallback
    }
    if (!topTitle) return null;

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();

    if (summaryData.extract && !/may refer to/i.test(summaryData.extract)) {
      return summaryData.extract;
    }
    return null;
  } catch (e) {
    console.error("Wikipedia fetch error:", e);
    return null;
  }
}

export async function askAI(userPrompt, lang = "en") {
  const wikiQuery = getWikiQuery(userPrompt);
  const wikiExtract = await wikiSummary(wikiQuery);

  let contextSection = "";
  if (wikiExtract) {
    contextSection = `Here is information from Wikipedia related to the question:\n"""\n${wikiExtract}\n"""\n`;
  } else {
    contextSection = `No relevant Wikipedia context was found for this question.\n`;
  }

  const systemPrompt = "You are a concise, factually accurate assistant. No emojis, no fluff.";
  const userPromptFull = `
${contextSection}
User's question: """${userPrompt}"""
Short, clear, factual answer:
  `.trim();

  let answer;
  try {
    const mainResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPromptFull }
      ],
      temperature: 0,
      max_tokens: 200,
    });
    answer = mainResponse.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("OpenAI API error:", e);
    return "Sorry, I could not retrieve an answer at this time.";
  }

  if (!answer) {
    answer = "Sorry, I could not find a reliable answer.";
  } else if (wikiExtract) {
    answer += `\n\n(Source: Wikipedia)`;
  }

  return answer;
}
