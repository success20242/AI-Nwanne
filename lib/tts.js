import gTTS from "gtts";
import fs from "fs";
import path from "path";

export async function generateVoice(text, langCode = "en", file = "voice.mp3") {
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(text, langCode);
    gtts.save(file, (err) => {
      if (err) reject(err);
      else resolve(file);
    });
  });
}
