/**
 * Pure helpers for browser Web Speech API dictation.
 *
 * Kept free of React so the support/merge/error logic can be unit tested.
 */

export type DictationState = "unsupported" | "idle" | "listening" | "denied" | "error";

type SpeechCtor = new () => any;

/** Returns the SpeechRecognition constructor for this browser, if any. */
export function getSpeechRecognitionCtor(win: any = typeof window !== "undefined" ? window : undefined): SpeechCtor | null {
  if (!win) return null;
  return (win.SpeechRecognition || win.webkitSpeechRecognition || null) as SpeechCtor | null;
}

/** Whether dictation can run in this browser. */
export function isDictationSupported(win?: any): boolean {
  return !!getSpeechRecognitionCtor(win);
}

/**
 * Merge a recognised transcript into whatever the user has already typed.
 * Never replaces existing text destructively — it appends with one space.
 */
export function mergeTranscript(existing: string, transcript: string): string {
  const add = transcript.trim();
  if (!add) return existing;
  const base = existing.trim();
  if (!base) return add;
  return `${base} ${add}`;
}

/** Map a SpeechRecognition error code to a state + user-facing message. */
export function mapDictationError(code: string | undefined): { state: DictationState; message: string } {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        state: "denied",
        message: "Microphone blocked. Allow microphone access in your browser settings, or type your question.",
      };
    case "no-speech":
      return { state: "idle", message: "Didn't catch that — try again or type your question." };
    case "audio-capture":
      return { state: "error", message: "No microphone found. Type your question instead." };
    case "aborted":
      return { state: "idle", message: "" };
    default:
      return { state: "error", message: "Dictation failed. Type your question instead." };
  }
}

/** Short label describing the current dictation state. */
export function dictationLabel(state: DictationState): string {
  switch (state) {
    case "listening":
      return "Listening… tap to stop";
    case "denied":
      return "Microphone blocked";
    case "unsupported":
      return "Dictation not supported in this browser";
    case "error":
      return "Dictation unavailable";
    default:
      return "Dictate your question";
  }
}
