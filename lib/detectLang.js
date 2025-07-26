import { OpenAI } from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const igboWords = ["kedu", "bia", "gịnị", "ụbọchị", "ndewo", "ọtụtụ", "anyị", "ụmụ"];
const hausaWords = ["sannu", "barka", "yaya", "ina", "lafiya", "gani", "zaka", "me"];
const yorubaWords = ["ekaro", "bawo", "kilode", "se", "nkan", "oju", "ife", "owa", "eni"];

// Cache and rate limit vars
const langCache = new Map();
let lastFallbackCall = 0;
const fallbackCooldownMs = 10000; // 10 seconds cooldown between fallback calls

export async function detectLang(msg) {
  const text = msg.toLowerCase().trim();

  // Keyword checks first
  if (igboWords.some(word => text.includes(word))) return "ig";
  if (hausaWords.some(word => text.includes(word))) return "ha";
  if (yorubaWords.some(word => text.includes(word))) return "yo";

  // Check cache
  if (langCache.has(text)) {
    return langCache.get(text);
  }

  const now = Date.now();

  // Rate limit fallback calls
  if (now - lastFallbackCall < fallbackCooldownMs) {
    // Return 'en' if within cooldown period to save API calls
    return "en";
  }

  lastFallbackCall = now;

  // OpenAI fallback detection
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a language detection assistant."
        },
        {
          role: "user",
          content: `Detect the language of this text. Return only the ISO 639-1 code (like en, ig, ha, yo): "${msg}"`
        }
      ],
      temperature: 0,
      max_tokens: 3
    });

    const langCode = response.choices[0].message.content.trim().toLowerCase();
    if (["ig", "ha", "yo", "en"].includes(langCode)) {
      langCache.set(text, langCode); // Cache the result
      return langCode;
    }
  } catch (error) {
    console.error("OpenAI fallback language detection error:", error);
  }

  // Default fallback
  return "en";
}

export function langToCode(lang) {
  const map = {
    ig: "ig",
    ha: "ha",
    yo: "yo",
    en: "en",
  };
  return map[lang] || "en";
}
