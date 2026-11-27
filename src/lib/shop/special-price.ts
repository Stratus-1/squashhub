export type ShopSpecial = { price: number; until: string };

export function shopSpecial(raw: unknown): ShopSpecial | null {
  const special = (raw as { special?: ShopSpecial } | null)?.special;
  return special && Number.isFinite(special.price) && special.price >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(special.until)
    ? special : null;
}

export function shopPrice(regular: number, raw: unknown, now = new Date()): number {
  const special = shopSpecial(raw);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const day = ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
  return special && special.price < regular && day <= special.until ? special.price : regular;
}

export function specialError(regular: number, price: string, until: string): string | null {
  if (!price && !until) return null;
  if (!price || !Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) >= regular) return "Special price must be less than the regular price";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isFinite(Date.parse(until))) return "Choose the special's end date";
  return null;
}