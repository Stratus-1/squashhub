/**
 * Device-local Step-by-Step answers, kept SEPARATE per identity:
 *  - one unfinished NEW draft per club (no tournament yet)            → draftKey
 *  - one plan per created tournament (used to edit its setup / draw)  → tournamentKey
 * A new setup can therefore never inherit an existing tournament's id. The old single slot
 * (`sh.stepbuilder.<club>`) is migrated once: a created tournament's plan moves to its own key,
 * an unfinished plan becomes the draft.
 */
export const legacyKey = (clubId: string) => `sh.stepbuilder.${clubId}`;
export const draftKey = (clubId: string) => `sh.stepbuilder.draft.${clubId}`;
export const tournamentKey = (tid: string) => `sh.stepbuilder.t.${tid}`;

const parse = (raw: string | null): Record<string, any> | null => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

export function migrateLegacy(clubId: string) {
  const old = parse(localStorage.getItem(legacyKey(clubId)));
  if (!old) return;
  if (old.createdTournamentId) { if (!localStorage.getItem(tournamentKey(old.createdTournamentId))) localStorage.setItem(tournamentKey(old.createdTournamentId), JSON.stringify(old)); }
  else if (!localStorage.getItem(draftKey(clubId))) localStorage.setItem(draftKey(clubId), JSON.stringify(old));
  localStorage.removeItem(legacyKey(clubId));
}

/** The unfinished new draft, if it has any real answers. */
export function readDraft(clubId: string): Record<string, any> | null {
  migrateLegacy(clubId);
  const d = parse(localStorage.getItem(draftKey(clubId)));
  return d && !d.createdTournamentId && (d.kind || d.playType || d.name || (d.categories ?? []).some(Boolean)) ? d : null;
}
export const clearDraft = (clubId: string) => localStorage.removeItem(draftKey(clubId));
/** Only the local setup copy is removed; the real tournament remains untouched. */
export const clearTournamentPlan = (tid: string) => localStorage.removeItem(tournamentKey(tid));

/** Saved plan of one created tournament (null if planned on another device). */
export function readTournamentPlan(clubId: string, tid: string): Record<string, any> | null {
  migrateLegacy(clubId);
  const p = parse(localStorage.getItem(tournamentKey(tid)));
  return p && p.createdTournamentId === tid ? p : null;
}

/** Update one category's knockout pace/pairing on this device's saved plan (no-op if the plan lives on another device). */
export function patchTournamentPlanFormat(clubId: string, tid: string, key: string, patch: Record<string, any>) {
  const p = readTournamentPlan(clubId, tid);
  if (!p) return;
  const base = p.formatOverrides?.[key] ?? p.formatOverrides?.[key.split("::")[0]] ?? p.format ?? {};
  p.formatOverrides = { ...(p.formatOverrides ?? {}), [key]: { ...base, ...patch } };
  localStorage.setItem(tournamentKey(tid), JSON.stringify(p));
}
