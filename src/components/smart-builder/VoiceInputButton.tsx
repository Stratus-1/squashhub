import { useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Mic, Square, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RECORD_SECONDS, micErrorMessage, startRecording, voiceSupported, type Recorder } from "@/lib/smart-builder/voice";

type State = "idle" | "recording" | "transcribing";

/**
 * Speak instead of type. The transcript is ONLY inserted into the builder's
 * text box (onTranscript); nothing is sent to the builder until the admin
 * presses Send, so voice and typing share exactly one interpretation path.
 */
export function VoiceInputButton({ clubId, disabled, onTranscript, onError }: {
  clubId?: string;
  disabled?: boolean;
  onTranscript: (text: string, final: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<Recorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { rec.current?.cancel(); if (timer.current) clearInterval(timer.current); }, []);

  if (!voiceSupported()) return null;

  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };

  const start = async () => {
    onError(null);
    try {
      rec.current = await startRecording();
      setSeconds(0); setState("recording");
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSeconds(s); setLevel(rec.current?.level() ?? 0);
        if (s >= MAX_RECORD_SECONDS) void stop();
      }, 200);
    } catch (e) {
      setState("idle");
      onError(micErrorMessage(e));
    }
  };

  const cancel = () => { clearTimer(); rec.current?.cancel(); rec.current = null; setState("idle"); };

  const stop = async () => {
    const r = rec.current; rec.current = null; clearTimer();
    if (!r) return;
    setState("transcribing");
    try {
      const file = await r.stop();
      const { data: s } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("file", file, file.name);
      if (clubId) form.append("clubId", clubId);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-tournament-transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: form,
      });
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || "Transcription failed — please try again or type instead.");
      }
      let text = "", finished = false, streamErr: string | null = null;
      const parser = createParser({
        onEvent(ev) {
          if (ev.data === "[DONE]") return;
          try {
            const d = JSON.parse(ev.data);
            if (d.type === "transcript.text.delta" && d.delta) { text += d.delta; onTranscript(text, false); }
            else if (d.type === "transcript.text.done") { text = d.text ?? text; finished = true; }
            else if (d.type === "error" || d.error) streamErr = d.error?.message || d.message || "Transcription failed";
          } catch { /* ignore keep-alives */ }
        },
      });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) { const { value, done } = await reader.read(); if (done) break; parser.feed(value); }
      if (streamErr) throw new Error(streamErr);
      if (!finished && !text) throw new Error("Transcription didn't complete — please try again.");
      if (!text.trim()) throw new Error("I couldn't hear any words — please try again, a little closer to the mic.");
      onTranscript(text.trim(), true);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setState("idle");
    }
  };

  if (state === "recording") {
    const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/60 bg-destructive/15 px-2 py-1" role="status" aria-live="polite">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70" style={{ transform: `scale(${1 + Math.min(1, level * 3)})` }} />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
        </span>
        <span className="text-xs text-white/85 tabular-nums">Listening… {mm}</span>
        <Button size="sm" variant="destructive" className="h-8" onClick={stop}><Square className="w-3.5 h-3.5 mr-1" />Done</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/70" aria-label="Cancel recording" onClick={cancel}><X className="w-4 h-4" /></Button>
      </div>
    );
  }

  return (
    <Button type="button" size="icon" variant="outline" disabled={disabled || state === "transcribing"}
      aria-label={state === "transcribing" ? "Transcribing" : "Speak your description"} title="Speak instead of typing"
      className={cn("h-9 w-9 shrink-0 bg-transparent border-white/20 text-white/85")} onClick={start}>
      {state === "transcribing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
    </Button>
  );
}
