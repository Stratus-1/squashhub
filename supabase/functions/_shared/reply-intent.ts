// Shared, deterministic classifier for inbound free-text replies
// (WhatsApp / SMS style) to tournament invites and event RSVPs.
//
// This file is the single source of truth: the `whatsapp-inbound` edge
// function imports it directly, and the app re-exports it from
// `src/lib/reply-intent.ts` so the two can never drift.
//
// Design rules (deliberately conservative — a wrong YES creates a paid
// tournament entry, so ambiguity must never mutate state):
//   1. Opt-out ("stop") wins over everything.
//   2. Ambiguous/"I'll let you know" replies are classified `unknown`.
//   3. Explicit negatives beat positive keywords in the same sentence.
//   4. Positives must be an affirmative phrase — a bare mention of
//      "play" or "attend" is NOT positive.

export type ReplyIntent = "yes" | "no" | "stop" | "unknown";

export interface ReplyClassification {
  intent: ReplyIntent;
  /** The normalised text the decision was made on (useful for audit rows). */
  normalised: string;
  /** Which rule fired, for the audit trail. */
  reason: string;
}

/**
 * Lowercase, strip typographic apostrophes/punctuation and collapse
 * whitespace, while keeping the thumbs up/down emoji as words.
 */
export function normaliseReply(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u201b`´]/g, "'")
    .replace(/\u{1F44D}/gu, " thumbsup ")
    .replace(/\u{1F44E}/gu, " thumbsdown ")
    .replace(/'/g, "")            // can't -> cant, won't -> wont, i'm -> im
    .replace(/[^a-z0-9\s]/g, " ") // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = /\b(stop|unsubscribe|opt\s?out|remove me)\b/;

/** Replies that express uncertainty — never mutate state on these. */
const AMBIGUOUS: RegExp[] = [
  /\b(maybe|perhaps|possibly|probably|hopefully)\b/,
  /\bnot sure\b/,
  /\bunsure\b/,
  /\b(ill|i will|i)? ?let you know\b/,
  /\bget back to you\b/,
  /\bdepends\b/,
  /\bif (i|we) can\b/,
  /\btbc\b/,
  /\bcheck( and| then)? (get back|let you know)\b/,
  /\bi think so\b/,
];

/** Explicit declines. Checked before positives — negation always wins. */
const NEGATIVE: RegExp[] = [
  /^n$/,
  /\b(no|nope|nah|naah|nee|negative|thumbsdown)\b/,
  /\b(cant|cannot|wont|shant|couldnt|wouldnt)\b/,
  /\bnot (playing|attending|available|coming|going|in|able|make it|this time)\b/,
  /\bnot going to\b/,
  /\b(unable|unavailable)\b/,
  /\b(decline|declined|declining)\b/,
  /\b(withdraw|withdrawing|deregister|pull out|opt out)\b/,
  /\b(count me out|leave me out|skip (me|this)|sit (this|it) out)\b/,
  /\b(sorry|apologies)\b.*\b(cant|cannot|wont|no|not|another time|next time)\b/,
  /\b(another|next) time\b/,
  /\bim out\b/,
  /\bi am out\b/,
];

/** Explicit affirmatives — full phrases, never a bare "play"/"attend". */
const POSITIVE: RegExp[] = [
  /^y$/,
  /\b(yes|yep|yeah|yah|yup|ya|yebo|ja|affirmative|thumbsup)\b/,
  /^(ok|okay|okey|kk|k)\b/,
  /\b(sure|definitely|absolutely|certainly|for sure)\b/,
  /\b(confirm|confirmed|confirming)\b/,
  /\b(accept|accepted|accepting)\b/,
  /\b(count me in|im in|i am in|include me|put me down|book me|enter me|register me|sign me up)\b/,
  /\b(i|ill|i will|i can|we can|we will) (can |will )?(play|attend|be there|come|make it|join)\b/,
  /\b(im|i am|we are) (playing|attending|coming|going)\b/,
  /\b(see you there|ill be there|i will be there)\b/,
];

const matched = (patterns: RegExp[], text: string): RegExp | null =>
  patterns.find((re) => re.test(text)) ?? null;

/**
 * Classify an inbound reply. `payload` is a quick-reply button payload (when
 * the transport provides one) and takes precedence over free text, because a
 * button tap is an unambiguous signal.
 */
export function classifyReply(payload: string | null | undefined, text?: string | null): ReplyClassification {
  const button = normaliseReply(payload ?? "");
  const body = normaliseReply(text ?? "");
  const normalised = [button, body].filter(Boolean).join(" ").trim();

  if (!normalised) return { intent: "unknown", normalised, reason: "empty" };

  if (STOP.test(normalised)) return { intent: "stop", normalised, reason: "opt-out" };

  // A structured button payload is authoritative when it is a clean yes/no.
  if (button) {
    if (/^(yes|accept|confirm|going|attending|entry_yes|rsvp_yes)$/.test(button)) {
      return { intent: "yes", normalised, reason: "button:yes" };
    }
    if (/^(no|decline|not_going|entry_no|rsvp_no)$/.test(button)) {
      return { intent: "no", normalised, reason: "button:no" };
    }
  }

  const ambiguous = matched(AMBIGUOUS, normalised);
  if (ambiguous) return { intent: "unknown", normalised, reason: `ambiguous:${ambiguous.source}` };

  const negative = matched(NEGATIVE, normalised);
  if (negative) return { intent: "no", normalised, reason: `negative:${negative.source}` };

  const positive = matched(POSITIVE, normalised);
  if (positive) return { intent: "yes", normalised, reason: `positive:${positive.source}` };

  return { intent: "unknown", normalised, reason: "no-match" };
}
