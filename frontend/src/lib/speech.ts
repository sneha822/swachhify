import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "./types";

const VOICE_LANG: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Text-to-speech for answers and lessons — helpful for users who find reading hard. */
export function useSpeaker(lang: Lang) {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (canSpeak()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!canSpeak() || !text) return onEnd?.();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}‍️]/gu, ""));
      u.lang = VOICE_LANG[lang];
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang);
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => {
        setSpeaking(false);
        onEnd?.();
      };
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [lang],
  );

  useEffect(() => stop, [stop]);
  return { speak, stop, speaking, supported: canSpeak() };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** Optional voice input (Chrome/Edge/Android). Falls back to typing where unsupported. */
export function useVoiceInput(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<Recognition | null>(null);
  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;

  const start = useCallback(() => {
    if (!Ctor) return;
    const rec = new (Ctor as new () => Recognition)();
    rec.lang = VOICE_LANG[lang];
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript;
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    ref.current = rec;
    setListening(true);
    rec.start();
  }, [Ctor, lang, onText]);

  const stop = useCallback(() => {
    ref.current?.stop();
    setListening(false);
  }, []);

  return { start, stop, listening, supported: !!Ctor };
}
