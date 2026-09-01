// Shared Paynow (Zimbabwe) helpers: message hashing and form parsing.
// Paynow hash spec: concatenate the RAW values of every field in the message
// (in the order sent/received, excluding `hash`), append the Integration Key,
// SHA-512, uppercase hex.

export async function paynowHash(values: string[], integrationKey: string): Promise<string> {
  const data = new TextEncoder().encode(values.join("") + integrationKey);
  const digest = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Parse a url-encoded Paynow message; values are URL-decoded. */
export function parsePaynowMessage(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(raw || "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).toLowerCase();
    const v = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    out[k] = v;
  }
  return out;
}

/**
 * Verify an inbound Paynow message hash. `fieldsInOrder` must be the keys in
 * the exact order they appear in the message, excluding `hash`.
 */
export async function verifyPaynowMessage(
  raw: string,
  integrationKey: string,
): Promise<{ ok: boolean; fields: Record<string, string> }> {
  const fields = parsePaynowMessage(raw);
  const given = (fields.hash || "").toUpperCase();
  if (!given) return { ok: false, fields };
  // Preserve original field order from the raw message.
  const orderedValues: string[] = [];
  for (const part of String(raw || "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).toLowerCase();
    if (k === "hash") continue;
    orderedValues.push(decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " ")));
  }
  const expected = await paynowHash(orderedValues, integrationKey);
  return { ok: expected === given, fields };
}

/** True when a Paynow status means the money is ours. */
export function isPaynowPaid(status: string | undefined | null): boolean {
  const s = (status || "").toLowerCase();
  return s === "paid" || s === "awaiting delivery" || s === "delivered";
}
