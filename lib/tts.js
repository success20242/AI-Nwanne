// import googleTTS from 'google-tts-api';
// import fs from 'fs';
// import path from 'path';
// import fetch from 'node-fetch';

// export async function generateVoice(text, langCode = 'en', file = 'voice.mp3') {
//   try {
//     // Get the audio URL from Google TTS
//     const url = googleTTS.getAudioUrl(text, {
//       lang: langCode,
//       slow: false,
//       host: 'https://translate.google.com',
//     });

//     // Download the audio and save it as a local MP3 file
//     const response = await fetch(url);
//     if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);

//     const buffer = await response.arrayBuffer();
//     fs.writeFileSync(file, Buffer.from(buffer));

//     return file;
//   } catch (error) {
//     console.error("Error generating voice:", error);
//     throw error;
//   }
// }

export async function generateVoice() {
  // Voice generation is currently disabled.
  throw new Error("Voice generation is disabled.");
}
