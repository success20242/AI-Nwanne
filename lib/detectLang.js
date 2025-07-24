export function detectLang(msg) {
  if (/^\s*(kedu|bia|gịnị|ụbọchị)/i.test(msg)) return "ig";
  if (/^\s*(sannu|barka|ina|me|yaya)/i.test(msg)) return "ha";
  if (/^\s*(ekaro|bawo|kilode|se|nkan)/i.test(msg)) return "yo";
  return "en";
}

export function langToCode(lang) {
  return {
    ig: "ig",
    ha: "ha",
    yo: "yo",
    en: "en"
  }[lang] || "en";
}
