/**
 * Voice output for the assistant (Web Speech synthesis).
 *
 * Users pick a voice, a speaking rate and a response style; a club may set a
 * default voice. The list is derived from the device's installed voices, so it
 * grows on its own as platforms add voices — we only curate the ordering.
 */
export type VoiceOption = {
  /** Stable id we persist: the platform voice name. */
  id: string;
  label: string;
  lang: string;
};

const PREFERRED = [
  /google uk english female/i,
  /google us english/i,
  /samantha/i,
  /karen/i,
  /serena/i,
  /aria/i,
  /jenny/i,
  /natural/i,
];

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Selectable voices, best-sounding English ones first. */
export function listVoices(): VoiceOption[] {
  if (!speechSupported()) return [];
  const voices = window.speechSynthesis.getVoices() ?? [];
  const scored = voices
    .filter((v) => /^en/i.test(v.lang) || /^af/i.test(v.lang))
    .map((v) => {
      const rank = PREFERRED.findIndex((re) => re.test(v.name));
      return { v, rank: rank === -1 ? PREFERRED.length : rank };
    })
    .sort((a, b) => a.rank - b.rank || a.v.name.localeCompare(b.v.name));
  return scored.map(({ v }) => ({ id: v.name, label: `${v.name} (${v.lang})`, lang: v.lang }));
}

/** Strip anything that reads badly out loud. */
export function speakableText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link on screen")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string, opts: { voice?: string | null; rate?: number } = {}): void {
  if (!speechSupported()) return;
  const clean = speakableText(text);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  const match = opts.voice ? synth.getVoices().find((v) => v.name === opts.voice) : undefined;
  if (match) utter.voice = match;
  utter.rate = Math.min(1.6, Math.max(0.6, opts.rate ?? 1));
  synth.speak(utter);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export const RESPONSE_STYLES = [
  { value: "friendly", label: "Friendly", hint: "Warm and conversational" },
  { value: "concise", label: "Concise", hint: "Straight to the point" },
  { value: "detailed", label: "Detailed", hint: "More background and context" },
] as const;
