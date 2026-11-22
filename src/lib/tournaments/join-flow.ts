/**
 * Open tournament entry link (/t/:champId/join) — pure helpers.
 *
 * Flow: pick your club → "I already use SquashHub" / "I'm a member of this
 * club" (find yourself, or register as an existing member not on the list —
 * no new-member fees) / "I'm not a member" (new member) → personal entry page.
 * The selection survives the email-confirmation round trip in localStorage so
 * the player lands back here and the step finishes automatically.
 */

export type JoinKind = "claim" | "existing_unlisted" | "new";

export interface JoinPending {
  champId: string;
  clubId: string;
  kind: JoinKind;
  memberId?: string | null;
  memberName?: string | null;
  nsaNumber?: string | null;
  name?: string;
  gender?: string;
  phone?: string;
  email?: string;
  savedAt: number;
}

const PENDING_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const RETURN_KEY = "sh.join_return";
const pendingKey = (champId: string) => `sh.join_pending.${champId}`;

/** Only a tournament join path or a junior registration link may be used as the post-sign-in return target. */
export function isSafeJoinPath(path: string | null | undefined): path is string {
  return !!path && (/^\/(c\/[a-z0-9-]+\/)?t\/[0-9a-f-]{36}\/join$/i.test(path) || /^\/j\/[0-9a-f]{24}$/i.test(path));
}

/** Remember where to come back after confirming an email (junior links use their own pending store). */
export function rememberJoinReturn(path: string, savedAt = Date.now(), store: Storage = localStorage): void {
  if (isSafeJoinPath(path)) store.setItem(RETURN_KEY, JSON.stringify({ path, savedAt }));
}

export function joinPath(champId: string, subdomain?: string | null): string {
  return subdomain ? `/c/${subdomain}/t/${champId}/join` : `/t/${champId}/join`;
}

export function savePending(p: JoinPending, path: string, store: Storage = localStorage): void {
  store.setItem(pendingKey(p.champId), JSON.stringify(p));
  if (isSafeJoinPath(path)) store.setItem(RETURN_KEY, JSON.stringify({ path, savedAt: p.savedAt }));
}

export function readPending(champId: string, now = Date.now(), store: Storage = localStorage): JoinPending | null {
  try {
    const p = JSON.parse(store.getItem(pendingKey(champId)) || "null") as JoinPending | null;
    if (!p || p.champId !== champId || !p.clubId || now - Number(p.savedAt || 0) > PENDING_TTL_MS) return null;
    if (!(["claim", "existing_unlisted", "new"] as string[]).includes(p.kind)) return null;
    if (p.kind === "claim" && !p.memberId) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPending(champId: string, store: Storage = localStorage): void {
  store.removeItem(pendingKey(champId));
  store.removeItem(RETURN_KEY);
}

/** Where to send someone who just confirmed their email, if they came from a join link. */
export function takeJoinReturn(now = Date.now(), store: Storage = localStorage): string | null {
  try {
    const r = JSON.parse(store.getItem(RETURN_KEY) || "null") as { path?: string; savedAt?: number } | null;
    if (!r || !isSafeJoinPath(r.path) || now - Number(r.savedAt || 0) > PENDING_TTL_MS) {
      store.removeItem(RETURN_KEY);
      return null;
    }
    return r.path;
  } catch {
    store.removeItem(RETURN_KEY);
    return null;
  }
}

/** Registration details must name a real person: first name + surname and a gender. */
export function detailsProblem(d: { name?: string; gender?: string; email?: string }, needEmail: boolean): string | null {
  const name = (d.name ?? "").trim();
  if (!name.includes(" ") || name.length < 4) return "Please enter your first name and surname.";
  if (!d.gender) return "Please choose your gender.";
  if (needEmail && !/^\S+@\S+\.\S+$/.test((d.email ?? "").trim())) return "Please enter a valid email address.";
  return null;
}
