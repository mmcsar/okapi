export const OKAPI_LANG_KEY = "okapi_language";

export const OKAPI_LANGUAGES = [
  { code: "auto", label: "Auto (langue du message)", speech: "fr-FR", tts: "fr-FR" },
  { code: "fr", label: "Français", speech: "fr-FR", tts: "fr-FR" },
  { code: "en", label: "English", speech: "en-US", tts: "en-US" },
  { code: "ln", label: "Lingala", speech: "fr-FR", tts: "fr-FR" },
  { code: "sw", label: "Kiswahili", speech: "sw-KE", tts: "sw-KE" },
  { code: "pt", label: "Português", speech: "pt-PT", tts: "pt-PT" },
  { code: "es", label: "Español", speech: "es-ES", tts: "es-ES" },
  { code: "ar", label: "العربية", speech: "ar-SA", tts: "ar-SA" },
  { code: "zh", label: "中文", speech: "zh-CN", tts: "zh-CN" },
] as const;

export type OkapiLangCode = (typeof OKAPI_LANGUAGES)[number]["code"];

export function getStoredLanguage(): OkapiLangCode {
  if (typeof window === "undefined") return "auto";
  const raw = window.localStorage.getItem(OKAPI_LANG_KEY) || "auto";
  return OKAPI_LANGUAGES.some((l) => l.code === raw)
    ? (raw as OkapiLangCode)
    : "auto";
}

export function setStoredLanguage(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OKAPI_LANG_KEY, code);
}

export function speechLocaleFor(code: string) {
  return OKAPI_LANGUAGES.find((l) => l.code === code)?.speech ?? "fr-FR";
}

export function ttsLocaleFor(code: string) {
  return OKAPI_LANGUAGES.find((l) => l.code === code)?.tts ?? "fr-FR";
}

/** Hint injected into LLM prompts. */
export function languageInstruction(code?: string | null) {
  const c = (code || "auto").toLowerCase();
  if (c === "auto" || !c) {
    return `LANGUAGE (critical, like ChatGPT/Claude):
- Detect the user's language from their latest message.
- Reply in THAT language. If they write in English, answer in English; Français → français; Lingala → Lingala; Swahili → Swahili; etc.
- Do not force French. Match the user. If mixed, prefer the dominant language of the latest message.
- For UI/apps you help design: use the same language for visible copy unless they ask otherwise.`;
  }

  const label =
    OKAPI_LANGUAGES.find((l) => l.code === c)?.label ?? c;
  return `LANGUAGE (critical):
- Preferred language: ${label} (${c}).
- Reply primarily in this language unless the user clearly switches language in their message — then follow their latest message.
- App/UI copy you propose should use this language unless asked otherwise.`;
}
