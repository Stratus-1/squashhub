// Pure helpers for finding a club member's GoBook client. Shared by the
// gobook-api edge function (auto-match) and the Club Admin link panel.
// GoBook's Client/Search filters only on lastName (prefix), emailAddress or
// membershipNumber, so we derive the search terms ourselves.

const SUFFIXES = new Set(["snr", "jnr", "sr", "jr", "sen", "jun", "senior", "junior", "ii", "iii", "iv"]);
const PARTICLES = new Set(["van", "der", "den", "de", "du", "le", "la", "von", "da", "dos", "del", "janse", "jansen"]);

export function normName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Name words without Snr/Jnr-style suffixes, hyphens or brackets. */
export function nameWords(name: unknown): string[] {
  return String(name ?? "")
    .replace(/[()[\],.]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !SUFFIXES.has(w.toLowerCase()));
}

/** Surnames to try in GoBook, most likely first (e.g. "Richard Rilanco - Coetsee Snr" → Coetsee, Rilanco). */
export function surnameTerms(name: unknown): string[] {
  const words = nameWords(name);
  if (words.length < 2) return words.filter((w) => w.length >= 2);
  const rest = words.slice(1);
  const terms: string[] = [];
  const firstParticle = rest.findIndex((w) => PARTICLES.has(w.toLowerCase()));
  if (firstParticle >= 0 && firstParticle < rest.length - 1) terms.push(rest.slice(firstParticle).join(" "));
  terms.push(rest[rest.length - 1]);
  for (let i = rest.length - 2; i >= 0; i--) {
    if (!PARTICLES.has(rest[i].toLowerCase())) terms.push(rest[i]);
  }
  const seen = new Set<string>();
  return terms.filter((t) => {
    const k = t.toLowerCase();
    if (t.length < 2 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** All GoBook searches to run for a member: email first (exact), then surnames. */
export function goBookSearchTerms(name: unknown, email: unknown): string[] {
  const e = String(email ?? "").trim();
  return [...(e.includes("@") ? [e] : []), ...surnameTerms(name)];
}

export function firstNameMatches(memberName: unknown, clientFirstName: unknown): boolean {
  const a = normName(nameWords(memberName)[0]);
  const b = normName(clientFirstName).split(" ")[0] ?? "";
  return !!a && !!b && a === b;
}

export type GoBookCandidate = {
  clientId: number;
  firstName: string;
  lastName: string;
  isActive?: boolean;
  emailMatch: boolean;
};

/** Order candidates: same email + first name, then same email, then same first name, then the rest. */
export function rankCandidates(memberName: unknown, list: GoBookCandidate[]): Array<GoBookCandidate & { firstNameMatch: boolean }> {
  const byId = new Map<number, GoBookCandidate>();
  for (const c of list) {
    const prev = byId.get(c.clientId);
    byId.set(c.clientId, prev ? { ...prev, emailMatch: prev.emailMatch || c.emailMatch } : c);
  }
  const score = (c: GoBookCandidate & { firstNameMatch: boolean }) =>
    (c.emailMatch ? 2 : 0) + (c.firstNameMatch ? 1 : 0) + (c.isActive === false ? -4 : 0);
  return [...byId.values()]
    .map((c) => ({ ...c, firstNameMatch: firstNameMatches(memberName, c.firstName) }))
    .sort((x, y) => score(y) - score(x) || x.clientId - y.clientId);
}

/** The single safe automatic link, or null when a person must choose. */
export function confidentMatch(memberName: unknown, list: GoBookCandidate[]): GoBookCandidate | null {
  const ranked = rankCandidates(memberName, list).filter((c) => c.isActive !== false);
  const emailAndName = ranked.filter((c) => c.emailMatch && c.firstNameMatch);
  if (emailAndName.length === 1) return emailAndName[0];
  if (emailAndName.length > 1) return null;
  const fullName = normName(nameWords(memberName).join(" "));
  const exact = ranked.filter((c) => normName(`${c.firstName} ${c.lastName}`) === fullName);
  return exact.length === 1 ? exact[0] : null;
}
