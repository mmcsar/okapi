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

export function useOkapiAudio(
  onTranscript: (text: string, isFinal: boolean) => void,
  locale = "fr-FR",
) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supportedListen, setSupportedListen] = useState(false);
  const [supportedSpeak, setSupportedSpeak] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const localeRef = useRef(locale);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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
    recognitionRef.current?.stop();
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
    recognition.lang = localeRef.current || "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      if (finalText) onTranscriptRef.current(finalText, true);
      else if (interim) onTranscriptRef.current(interim, false);
    };

    recognition.onerror = (event) => {
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
    const ok = speakText(text, {
      lang: localeRef.current || "fr-FR",
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
