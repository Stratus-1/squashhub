/**
 * Scan-to-Pay short codes.
 *
 * A printed QR never encodes the product's own barcode (a Castle Light barcode
 * is identical countrywide). It encodes a club-specific short code that maps to
 * exactly one row: club + (optional) bar item. The public page `/s/:code`
 * resolves it through the `resolve_qr_short_code` database function.
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (l, o, 0, 1)

export function generateShortCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const PRODUCTION_ROOT = "squashhub.co.za";

/**
 * Absolute URL printed on the sticker. Prefers the club's own subdomain
 * (nelspruit.squashhub.co.za/s/abc123) so the label is self-branding; falls
 * back to the current origin when running on a preview/custom host.
 */
export function buildScanUrl(code: string, subdomain?: string | null): string {
  const path = `/s/${code}`;
  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    const onProd = hostname === PRODUCTION_ROOT || hostname.endsWith(`.${PRODUCTION_ROOT}`);
    if (!onProd) return `${origin}${path}`;
  }
  const sub = (subdomain || "").trim();
  return sub ? `https://${sub}.${PRODUCTION_ROOT}${path}` : `https://${PRODUCTION_ROOT}${path}`;
}

export function formatMoney(amount: number, currencyCode?: string | null): string {
  const code = (currencyCode || "ZAR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: code }).format(amount);
  } catch {
    return `R${amount.toFixed(2)}`;
  }
}
