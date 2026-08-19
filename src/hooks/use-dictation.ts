import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DictationState,
  getSpeechRecognitionCtor,
  mapDictationError,
  mergeTranscript,
} from "@/lib/help/dictation";

/**
 * Web Speech API dictation.
 *
 * Recognised speech is handed back through onResult so the caller can put it in
 * an input for review — we never auto-submit anything.
 */
export function useDictation(onResult: (merge: (existing: string) => string) => void) {
  const supported = typeof window !== "undefined" && !!getSpeechRecognitionCtor(window);
  const [state, setState] = useState<DictationState>(supported ? "idle" : "unsupported");
  const [message, setMessage] = useState("");
  const recRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop?.();
    } catch {
      /* noop */
    }
    setState((s) => (s === "listening" ? "idle" : s));
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor(window);
    if (!Ctor) {
      setState("unsupported");
      return;
    }
    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = navigator.language || "en-ZA";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setMessage("");
        setState("listening");
      };
      rec.onerror = (e: any) => {
        const mapped = mapDictationError(e?.error);
        setState(mapped.state);
        setMessage(mapped.message);
      };
      rec.onend = () => setState((s) => (s === "listening" ? "idle" : s));
      rec.onresult = (e: any) => {
        const transcript = Array.from(e?.results?.[0] ?? [])
          .map((r: any) => r?.transcript ?? "")
          .join(" ");
        if (transcript) onResultRef.current((existing) => mergeTranscript(existing, transcript));
      };

      rec.start();
    } catch {
      setState("error");
      setMessage("Dictation failed. Type your question instead.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "listening") stop();
    else start();
  }, [state, start, stop]);

  return { supported, state, message, start, stop, toggle };
}
