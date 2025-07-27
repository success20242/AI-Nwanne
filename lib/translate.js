import fetch from "node-fetch";

const TRANSLATE_PROVIDER = process.env.TRANSLATE_PROVIDER || "nllb";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const languageMap = {
  ig: { nllb: "ibo_Latn", google: "ig", libre: "ig" },
  ha: { nllb: "hau_Latn", google: "ha", libre: "ha" },
  yo: { nllb: "yor_Latn", google: "yo", libre: "yo" },
  en: { nllb: "eng_Latn", google: "en", libre: "en" },
  fr: { nllb: "fra_Latn", google: "fr", libre: "fr" },
  // Add more as needed...
};

export async function translate(text, targetLang, sourceLang = "en") {
  try {
    switch (TRANSLATE_PROVIDER) {
      case "nllb":
        return await nllbTranslate(text, targetLang, sourceLang);
      case "google":
        return await googleTranslate(text, targetLang, sourceLang);
      case "libre":
        return await libreTranslate(text, targetLang, sourceLang);
      default:
        throw new Error("Unknown translation provider!");
    }
  } catch (err) {
    console.warn(`⚠️ Translation with ${TRANSLATE_PROVIDER} failed: ${err.message}. Falling back to OpenAI...`);
    return openaiTranslate(text, targetLang, sourceLang);
  }
}

// NLLB (No Language Left Behind) public API
async function nllbTranslate(text, targetLang, sourceLang = "en") {
  const target = languageMap[targetLang]?.nllb || targetLang;
  const source = languageMap[sourceLang]?.nllb || sourceLang;
  const response = await fetch("https://nllb.metatext.io/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source,
      target,
    }),
  });
  const data = await response.json();
  if (data?.translation) return data.translation;
  throw new Error("NLLB translation failed");
}

// Google Translate API (needs API key in process.env.GOOGLE_API_KEY)
async function googleTranslate(text, targetLang, sourceLang = "en") {
  const target = languageMap[targetLang]?.google || targetLang;
  const source = languageMap[sourceLang]?.google || sourceLang;
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const body = {
    q: text,
    source,
    target,
    format: "text",
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data?.data?.translations?.[0]?.translatedText) {
    return data.data.translations[0].translatedText;
  }
  throw new Error("Google Translate failed");
}

// LibreTranslate API (free, open source)
async function libreTranslate(text, targetLang, sourceLang = "en") {
  const target = languageMap[targetLang]?.libre || targetLang;
  const source = languageMap[sourceLang]?.libre || sourceLang;
  const url = "https://libretranslate.de/translate";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source,
      target,
      format: "text",
      api_key: process.env.LIBRE_API_KEY || undefined,
    }),
  });
  const data = await response.json();
  if (data?.translatedText) return data.translatedText;
  throw new Error("LibreTranslate failed");
}

// OpenAI translation fallback
async function openaiTranslate(text, targetLang, sourceLang = "en") {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key missing");

  const prompt = `Translate the following text from ${sourceLang} to ${targetLang}:\n\n${text}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful translation assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  throw new Error("OpenAI translation failed");
}
