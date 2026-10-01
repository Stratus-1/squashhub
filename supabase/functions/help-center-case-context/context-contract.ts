export type SourceMessage = { author_role: "reporter" | "support"; body: string | null; created_at: string };
export type ContextMessage = {
  author_role: "reporter" | "support";
  body: string;
  truncated: boolean;
  created_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseOperatorEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 32 || values.some((value) => typeof value !== "string" || !EMAIL_RE.test(value.trim()))) return new Set();
    return new Set(values.map((value: string) => value.trim().toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Returns only a bounded recent conversation; identities and attachment columns are never copied. */
export function projectMessages(
  newestFirst: SourceMessage[],
  maxMessages: number,
  maxCharacters: number,
): ContextMessage[] {
  return newestFirst.slice(0, maxMessages).reverse().flatMap((message) => {
    if (typeof message.body !== "string" || !message.body.trim() || typeof message.created_at !== "string") return [];
    return [{
      author_role: message.author_role,
      body: message.body.slice(0, maxCharacters),
      truncated: message.body.length > maxCharacters,
      created_at: message.created_at,
    }];
  });
}

/** Drops oldest excerpts until the serialized JSON fits the central receiver limit. */
export function fitContextPayload<T extends { messages: ContextMessage[] }>(payload: T, maxBytes: number): T | null {
  const encoder = new TextEncoder();
  const result = { ...payload, messages: [...payload.messages] };
  while (result.messages.length && encoder.encode(JSON.stringify(result)).byteLength > maxBytes) result.messages.shift();
  return encoder.encode(JSON.stringify(result)).byteLength <= maxBytes ? result : null;
}
