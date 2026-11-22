/**
 * Junior registration link (/j/:token) — pure helpers.
 *
 * A junior association's leaders share one link. A junior (or a parent) picks
 * a club from that association's list, finds the player's name, and then
 * claims the profile or registers a new junior. The database RPCs
 * (`junior_join_*`) are the authority; these helpers give instant form
 * feedback and survive the email-confirmation round trip.
 */

export type JuniorJoinKind = "claim" | "existing_unlisted" | "new";

/** Who is filling in the form. Under 18 a parent consents on the form; a player sends a consent link to the parent. */
export type JuniorFilledBy = "parent" | "player";

export interface JuniorForm {
  name?: string;
  gender?: string;
  dob?: string;
  phone?: string;
  address?: string;
  idNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  filledBy?: JuniorFilledBy | "";
  consent?: boolean;
}

export interface JuniorPending extends JuniorForm {
  token: string;
  clubId: string;
  kind: JuniorJoinKind;
  memberId?: string | null;
  nsaNumber?: string | null;
  email?: string;
  skillLevel?: string;
  savedAt: number;
}

const PENDING_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const pendingKey = (token: string) => `sh.junior_pending.${token}`;

export const isJuniorToken = (t: string | null | undefined): t is string => !!t && /^[0-9a-f]{24}$/i.test(t);
export const juniorJoinPath = (token: string) => `/j/${token}`;

/** Parse a YYYY-MM-DD date of birth; null when it isn't a real calendar date. */
export function parseDob(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dob = new Date(Date.UTC(y, mo - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) return null;
  return dob;
}

/** Whole years old on `today` (local calendar date). */
export function ageOn(dob: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dob.getUTCFullYear();
  const beforeBirthday = today.getMonth() < dob.getUTCMonth()
    || (today.getMonth() === dob.getUTCMonth() && today.getDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Players under 18 need a parent or guardian's name, cell number and consent. */
export function needsGuardian(dobValue: string | null | undefined, today: Date = new Date()): boolean {
  const dob = parseDob(dobValue);
  return !dob || ageOn(dob, today) < 18;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Same checks as `_junior_check_guardian`: real past date, under 100, guardian details under 18. */
export function guardianProblem(f: JuniorForm, today: Date = new Date()): string | null {
  const dob = parseDob(f.dob);
  if (!dob) return "Please enter the player's date of birth.";
  const age = ageOn(dob, today);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (dob.getTime() > todayUtc || age >= 100) return "Please enter a valid date of birth.";
  if (age < 18) {
    if ((f.parentName ?? "").trim().length < 3 || (f.parentPhone ?? "").replace(/\D/g, "").length < 9) {
      return "A parent or guardian's name and cell number are needed for players under 18.";
    }
    if (f.filledBy !== "parent" && f.filledBy !== "player") return "Please say who is filling in the form.";
    if (f.filledBy === "parent" && !f.consent) return "A parent or guardian must give consent for players under 18.";
    if (f.filledBy === "player" && !EMAIL_RE.test((f.parentEmail ?? "").trim())) {
      return "Please enter your parent or guardian's email so they can give consent.";
    }
  }
  return null;
}

/** Optional SA ID: 13 digits whose first six match the birth date (same as `_junior_check_id`). */
export function idNumberProblem(id: string | null | undefined, dobValue: string | null | undefined): string | null {
  const digits = (id ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 13) return "An SA ID number has 13 digits.";
  const dob = parseDob(dobValue);
  if (dob) {
    const yymmdd = `${String(dob.getUTCFullYear()).slice(2)}${String(dob.getUTCMonth() + 1).padStart(2, "0")}${String(dob.getUTCDate()).padStart(2, "0")}`;
    if (digits.slice(0, 6) !== yymmdd) return "The ID number does not match the date of birth.";
  }
  return null;
}

/** New / unlisted junior: the normal member details (name, boy or girl, cell, address, optional SA ID) plus the guardian rules. */
export function juniorDetailsProblem(f: JuniorForm, today: Date = new Date()): string | null {
  const name = (f.name ?? "").trim().replace(/\s+/g, " ");
  if (!name.includes(" ") || name.length < 4) return "Please enter the player's first name and surname.";
  if (f.gender !== "male" && f.gender !== "female") return "Please choose boy or girl.";
  const guardian = guardianProblem(f, today);
  if (guardian) return guardian;
  const cell = (f.phone ?? "").replace(/\D/g, "") || (f.parentPhone ?? "").replace(/\D/g, "");
  if (cell.length < 9) return "Please enter a cell number.";
  if ((f.address ?? "").trim().length < 5) return "Please enter the player's home address.";
  return idNumberProblem(f.idNumber, f.dob);
}

export function saveJuniorPending(p: JuniorPending, store: Storage = localStorage): void {
  store.setItem(pendingKey(p.token), JSON.stringify(p));
}

export function readJuniorPending(token: string, now = Date.now(), store: Storage = localStorage): JuniorPending | null {
  try {
    const p = JSON.parse(store.getItem(pendingKey(token)) || "null") as JuniorPending | null;
    if (!p || p.token !== token || !p.clubId || now - Number(p.savedAt || 0) > PENDING_TTL_MS) return null;
    if (!(["claim", "existing_unlisted", "new"] as string[]).includes(p.kind)) return null;
    if (p.kind === "claim" && !p.memberId) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearJuniorPending(token: string, store: Storage = localStorage): void {
  store.removeItem(pendingKey(token));
}

/** WhatsApp message leaders send to their juniors. */
export function juniorLinkShareText(bodyName: string, url: string): string {
  return `${bodyName}: please register as a junior squash player on SquashHub. ` +
    `Choose your club, find your name (or add yourself). Players under 18 need a parent's consent.\n${url}`;
}
