/**
 * Free WhatsApp click-to-chat helpers.
 *
 * Uses the public `https://wa.me/<phone>?text=<message>` scheme — no Meta
 * verification, no API key, no per-message cost. The user's WhatsApp app
 * opens with the message pre-filled; they tap Send.
 */

/**
 * Normalise a phone number to E.164 digits (no leading +) suitable for wa.me.
 * Defaults to South Africa (+27) when the number starts with `0`.
 * Returns null if the number can't be parsed.
 */
export function normalisePhoneForWhatsApp(raw?: string | null, defaultCc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Strip everything except digits and a leading +
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = defaultCc + s.slice(1);
  // Sanity: E.164 is 8–15 digits
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

/** Build a `wa.me` link. When phone is null, returns a share link without recipient. */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string {
  const text = encodeURIComponent(message);
  const normalised = normalisePhoneForWhatsApp(phone);
  return normalised
    ? `https://wa.me/${normalised}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/** Open the WhatsApp link in a new tab (mobile: opens the WhatsApp app). */
export function openWhatsApp(phone: string | null | undefined, message: string): void {
  const url = buildWhatsAppLink(phone, message);
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Strip HTML to a plain-text WhatsApp-friendly message.
 * Keeps line breaks from block elements; drops all tags/scripts/styles.
 */
export function htmlToWhatsAppText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|br|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
