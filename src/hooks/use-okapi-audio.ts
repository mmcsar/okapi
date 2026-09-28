"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
  type SpeechRecognitionLike,
} from "@/lib/audio";
import { detectSpeechLocale } from "@/lib/i18n";

export function useOkapiAudio(
  onTranscript: (text: string, isFinal: boolean) => void,
  listenLocale = "fr-FR",
  /** null = choisir la voix selon le texte (mode Auto). */
  speakLocale: string | null = null,
) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supportedListen, setSupportedListen] = useState(false);
  const [supportedSpeak, setSupportedSpeak] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const listenLocaleRef = useRef(listenLocale);
  const speakLocaleRef = useRef(speakLocale);
  const finalBufRef = useRef("");
  const interimBufRef = useRef("");
  const suppressEndRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    listenLocaleRef.current = listenLocale;
  }, [listenLocale]);

  useEffect(() => {
    speakLocaleRef.current = speakLocale;
  }, [speakLocale]);

  useEffect(() => {
    setSupportedListen(isSpeechRecognitionSupported());
    setSupportedSpeak(isSpeechSynthesisSupported());

    // Voices load async in some browsers
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        stopSpeaking();
        recognitionRef.current?.abort();
      };
    }
  }, []);

  const stopListen = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* déjà arrêté */
    }
    setListening(false);
  }, []);

  const startListen = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setAudioError("Dictée non supportée sur ce navigateur (Chrome / Edge conseillé).");
      return;
    }

    stopSpeaking();
    setSpeaking(false);
    setAudioError(null);

    const recognition = new Ctor();
    recognition.lang = listenLocaleRef.current || "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    finalBufRef.current = "";
    interimBufRef.current = "";
    suppressEndRef.current = false;

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const piece = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finalText += piece;
        else interim += piece;
      }
      finalBufRef.current = finalText;
      interimBufRef.current = interim;
      const shown = `${finalText} ${interim}`.trim();
      if (shown) onTranscriptRef.current(shown, false);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        suppressEndRef.current = true;
        finalBufRef.current = "";
        interimBufRef.current = "";
        setListening(false);
        return;
      }
      const map: Record<string, string> = {
        "not-allowed": "Micro bloqué. Autorise le micro dans le navigateur.",
        "no-speech": "Aucune voix détectée. Réessaie.",
        "audio-capture": "Micro introuvable.",
        network: "Erreur réseau dictée.",
      };
      setAudioError(map[event.error] ?? `Erreur audio : ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      if (suppressEndRef.current) {
        suppressEndRef.current = false;
        return;
      }
      const text = `${finalBufRef.current} ${interimBufRef.current}`.trim();
      finalBufRef.current = "";
      interimBufRef.current = "";
      if (text) onTranscriptRef.current(text, true);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setAudioError("Impossible de démarrer le micro.");
      setListening(false);
    }
  }, []);

  const toggleListen = useCallback(() => {
    if (listening) stopListen();
    else startListen();
  }, [listening, startListen, stopListen]);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    setAudioError(null);
    const preferred =
      speakLocaleRef.current || listenLocaleRef.current || "fr-FR";
    const lang = detectSpeechLocale(text, preferred);
    const ok = speakText(text, {
      lang,
      onend: () => setSpeaking(false),
    });
    if (!ok) {
      setAudioError("Lecture vocale non supportée.");
      return;
    }
    setSpeaking(true);
  }, []);

  const stopSpeak = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const toggleSpeak = useCallback(
    (text: string) => {
      if (speaking) stopSpeak();
      else speak(text);
    },
    [speak, speaking, stopSpeak],
  );

  return {
    listening,
    speaking,
    supportedListen,
    supportedSpeak,
    audioError,
    clearAudioError: () => setAudioError(null),
    toggleListen,
    stopListen,
    speak,
    stopSpeak,
    toggleSpeak,
  };
}
