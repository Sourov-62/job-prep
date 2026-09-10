/* tts.js — ব্রাউজারের বিল্ট-ইন Speech Synthesis দিয়ে যেকোনো লেখা পড়ে শোনায়।
   এটি ব্রাউজার/অপারেটিং সিস্টেমের নিজস্ব ফিচার — ইন্টারনেট লাগে না।
   ডিভাইসে বাংলা ভয়েস ইনস্টল করা না থাকলে সিস্টেম ডিফল্ট ভয়েসে পড়বে। */

const TTS = (() => {
  const supported = "speechSynthesis" in window;

  function pickVoice(langHint) {
    if (!supported) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const want = langHint === "en" ? "en" : "bn";
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(want)) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en")) ||
      voices[0]
    );
  }

  function speak(text, langHint) {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(langHint);
    if (voice) { utter.voice = voice; utter.lang = voice.lang; }
    else utter.lang = langHint === "en" ? "en-US" : "bn-BD";
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
  }

  function isSpeaking() {
    return supported && window.speechSynthesis.speaking;
  }

  // কিছু ব্রাউজারে ভয়েস তালিকা asynchronously লোড হয়
  if (supported) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  return { supported, speak, stop, isSpeaking };
})();

window.TTS = TTS;
