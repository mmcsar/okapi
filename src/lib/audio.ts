/** Browser Web Speech helpers (Chrome / Edge / Safari partiel). */

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionCtor());
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function pickVoiceForLang(lang: string): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ||
    null
  );
}

export function speakText(
  text: string,
  opts?: { rate?: number; lang?: string; onend?: () => void },
) {
  if (!isSpeechSynthesisSupported()) return false;
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  if (!clean) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = opts?.lang || "fr-FR";
  utter.rate = opts?.rate ?? 1.02;
  const voice = pickVoiceForLang(utter.lang);
  if (voice) utter.voice = voice;
  if (opts?.onend) utter.onend = opts.onend;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
