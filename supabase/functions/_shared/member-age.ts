/**
 * Age from a date of birth or a South African ID number (YYMMDD…).
 * Returns null when age cannot be determined — never guesses. Keep in sync
 * with src/lib/member-age.ts.
 */
export function dobFromSaId(id: string | null | undefined, now = new Date()): Date | null {
  const digits = String(id ?? "").replace(/\D/g, "");
  // Accept a full 13-digit SA ID or a bare 6-digit YYMMDD birth date.
  if (digits.length !== 13 && digits.length !== 6) return null;
  const yy = Number(digits.slice(0, 2)), mm = Number(digits.slice(2, 4)), dd = Number(digits.slice(4, 6));
  const curYY = now.getUTCFullYear() % 100;
  const year = (yy > curYY ? 1900 : 2000) + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d;
}

export function parseDob(dob: string | null | undefined): Date | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function ageOn(dob: Date | null, now = new Date()): number | null {
  if (!dob || dob.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const md = now.getUTCMonth() - dob.getUTCMonth();
  if (md < 0 || (md === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** First known source wins: explicit DOB, then SA ID numbers in order. */
export function resolveAge(sources: { dob?: string | null; idNumbers?: Array<string | null | undefined> }, now = new Date()): number | null {
  const fromDob = ageOn(parseDob(sources.dob), now);
  if (fromDob != null) return fromDob;
  for (const id of sources.idNumbers ?? []) {
    const a = ageOn(dobFromSaId(id, now), now);
    if (a != null) return a;
  }
  return null;
}

export type AgeGateResult = { allowed: true } | { allowed: false; reason: "underage" | "age_unknown"; age: number | null };

export function checkAgeGate(minAge: number | null | undefined, age: number | null): AgeGateResult {
  if (!minAge) return { allowed: true };
  if (age == null) return { allowed: false, reason: "age_unknown", age: null };
  return age >= minAge ? { allowed: true } : { allowed: false, reason: "underage", age };
}
