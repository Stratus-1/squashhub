// Duplicate-person detection used before ANY self-registration (all clubs,
// associations, federation). Pure helpers — unit-tested in src/test.

/** Last 9 digits of a South African number: 082 123 4567, +27 82-123-4567 and
 *  0027821234567 all become "821234567". Mirrors SQL public.norm_phone_tail. */
export function phoneTail(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  return d.slice(-9);
}

export function normName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** First and last token of a full name. */
export function nameParts(full: string | null | undefined): { first: string; last: string } {
  const n = normName(full);
  if (!n) return { first: "", last: "" };
  const t = n.split(" ");
  return { first: t[0], last: t.length > 1 ? t[t.length - 1] : "" };
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nameParts(a), y = nameParts(b);
  return !!x.first && !!x.last && x.first === y.first && x.last === y.last;
}

export type Candidate = { name: string | null; phone: string | null; user_id?: string | null };

/**
 * exact  = same first+last name AND same cell  -> recover, never duplicate
 * phone  = same cell, different name           -> strong signal (families share phones)
 * name   = same name only                      -> possible, never blocks
 * none
 */
export type MatchLevel = "exact" | "phone" | "name" | "none";

export function classifyMatch(input: { name?: string | null; phone?: string | null }, candidates: Candidate[]): MatchLevel {
  const tail = phoneTail(input.phone);
  let level: MatchLevel = "none";
  for (const c of candidates) {
    const phoneHit = !!tail && phoneTail(c.phone) === tail;
    const nameHit = sameName(input.name, c.name);
    if (phoneHit && nameHit) return "exact";
    if (phoneHit) level = "phone";
    else if (nameHit && level === "none") level = "name";
  }
  return level;
}

/** Only candidates whose cell matches may be revealed — and only after OTP. */
export function revealableAccounts<T extends Candidate & { email?: string | null }>(verifiedPhone: string, candidates: T[]): T[] {
  const tail = phoneTail(verifiedPhone);
  if (!tail) return [];
  return candidates.filter((c) => phoneTail(c.phone) === tail);
}

export function maskPhone(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length < 4 ? "your number" : `••• ••• ${d.slice(-3)}`;
}
