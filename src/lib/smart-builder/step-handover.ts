/**
 * Step-by-Step Beta → Tournament Management handover.
 *
 * Summary is the handover point: "Complete setup & continue" creates the tournament
 * record through the same `club_champs` insert the Current Builder uses (no schema
 * change), enters admin-picked players as registrations that stay payment-outstanding,
 * and saves a handover record (lifecycle position + deferred decisions + the shared
 * message snapshot) on this device. Nothing is sent and no payment is taken here.
 */
import { fromExt } from "@/lib/supabase-ext";
import { sanitizeDraftPayload } from "@/lib/tournaments/draft-payload";

export const LIFECYCLE = [
  { key: "planning", label: "Planning" },
  { key: "invite", label: "Invite / Inform players" },
  { key: "registrations", label: "Registrations & payments" },
  { key: "finalise", label: "Finalise entries" },
  { key: "generate", label: "Generate draw & fixtures" },
  { key: "activate", label: "Activate tournament" },
  { key: "running", label: "Tournament running" },
  { key: "complete", label: "Complete" },
] as const;
export type LifecycleKey = (typeof LIFECYCLE)[number]["key"];
export const lifecycleIndex = (k: LifecycleKey) => LIFECYCLE.findIndex((s) => s.key === k);

/** A "Decide later" answer: deferred, not forgotten — due at a lifecycle stage. */
export type DeferredDecision = { id: string; label: string; neededAt: LifecycleKey; why: string };

export type EntrantMessage = { memberId: string; name: string; text: string; status: "Entered · Payment outstanding" | "Entered" };

export type Handover = {
  tournamentId: string;
  clubId: string;
  name: string;
  kind: "once_off" | "period";
  /** invite = players self-enter; inform = admin picked everyone (notification, not invitation). */
  mode: "invite" | "inform";
  feeDue: boolean;
  channels: string[];
  messageTemplate: string;
  /** Inform mode: one personalised message per entered player (partner + amount due). */
  entrantMessages: EntrantMessage[];
  /** Invite mode: one sample invitation. */
  invitePreview: string;
  deferred: DeferredDecision[];
  /** Expected entries per category/subcategory (estimates from setup), compared at Finalise entries. */
  expected?: Array<{ label: string; expected: number | null; doubles: boolean }>;
  stage: LifecycleKey;
  completed: LifecycleKey[];
  informedAt?: string | null;
  createdAt: string;
};

const hkey = (clubId: string) => `sh.stepbuilder.handover.${clubId}`;
export function loadHandovers(clubId: string): Handover[] {
  try { return JSON.parse(localStorage.getItem(hkey(clubId)) || "[]") as Handover[]; } catch { return []; }
}
export function loadHandover(clubId: string, tid: string) { return loadHandovers(clubId).find((h) => h.tournamentId === tid) ?? null; }
export function saveHandover(h: Handover) {
  const all = loadHandovers(h.clubId).filter((x) => x.tournamentId !== h.tournamentId);
  localStorage.setItem(hkey(h.clubId), JSON.stringify([h, ...all]));
}

/** Deferred items that must be resolved before a stage's action can be taken. */
export const blockersFor = (h: Pick<Handover, "deferred">, stage: LifecycleKey) => h.deferred.filter((d) => d.neededAt === stage);

/** The single prominent next action for the current lifecycle stage. */
export function nextAction(h: Handover): { title: string; detail: string; available: boolean } {
  if (h.stage === "invite") {
    const blocked = blockersFor(h, "invite");
    if (h.mode === "inform") return { title: "Inform selected players", detail: `Tell the ${h.entrantMessages.length} entered player${h.entrantMessages.length === 1 ? "" : "s"} they have been entered${h.feeDue ? ", what they owe and how to pay" : ""}.`, available: blocked.length === 0 };
    return { title: "Invite players", detail: "Send the invitation so eligible players can enter.", available: blocked.length === 0 };
  }
  if (h.stage === "registrations") return { title: "Close registrations & finalise entries", detail: "When entries and payments are in, move on to check the final field.", available: true };
  if (h.stage === "finalise") {
    const blocked = blockersFor(h, "finalise");
    return { title: "Generate draw & fixtures", detail: blocked.length ? "Decide the items below first — they depend on the real entries, so they're asked for now." : "Everything needed is decided. Draw and fixture generation is the next Beta build.", available: false };
  }
  return { title: LIFECYCLE[lifecycleIndex(h.stage)].label, detail: "Not part of this Beta yet.", available: false };
}

export type CreateInput = {
  clubId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  feeCents: number | null;
  paymentMethods: string[];
  partnerMode: "admin" | "players" | null;
  /** Admin-entered players (pairs carry a partner). */
  entrants: Array<{ memberId: string; partnerId?: string | null; division?: number | null }>;
  /** Step-by-Step categories/subcategories, in order — become the tournament's divisions (group 1..n). */
  divisions?: Array<{ label: string; matchType: "singles" | "doubles" }>;
  existingId?: string | null;
};

/**
 * Create (or, when re-completing, update) the tournament record, then enter admin-picked
 * players. Admin selection never marks anyone paid: with a fee they are `pending_payment`.
 * Re-running is idempotent (upsert on champ_id + club_member_id; existing rows untouched).
 */
export async function persistStepTournament(i: CreateInput): Promise<string> {
  const row = sanitizeDraftPayload({
    club_id: i.clubId,
    name: i.name.trim(),
    start_date: i.startDate || null,
    end_date: i.endDate || null,
    entry_fee_cents: i.feeCents ?? 0,
    payment_required: (i.feeCents ?? 0) > 0,
    payment_methods: i.paymentMethods.length ? i.paymentMethods : null,
    ...(i.partnerMode ? { partner_mode: i.partnerMode } : {}),
    // Map categories → divisions so the table default (2 unnamed divisions) never applies.
    ...(i.divisions?.length ? {
      num_groups: i.divisions.length,
      group_labels: Object.fromEntries(i.divisions.map((d, n) => [String(n + 1), d.label])),
    } : { num_groups: 1 }),
    description: "Set up with the Step-by-Step Beta builder.",
  });
  let tid = i.existingId ?? null;
  if (tid) {
    const { error } = await fromExt("club_champs").update(row).eq("id", tid);
    if (error) throw error;
  } else {
    const { data, error } = await fromExt("club_champs").insert({ ...row, status: "planning" }).select("id").single();
    if (error) throw error;
    tid = data.id as string;
  }
  if (i.divisions?.length) {
    // league_match_types lives only on the base table (not the club_champs view).
    const { error } = await fromExt("tournaments").update({ league_match_types: Object.fromEntries(i.divisions.map((d, n) => [String(n + 1), d.matchType])) }).eq("id", tid);
    if (error) throw error;
  }
  if (i.entrants.length) {
    const nDiv = Math.max(1, i.divisions?.length ?? 1);
    const missing = i.entrants.filter((e) => nDiv > 1 && !(e.division && e.division >= 1 && e.division <= nDiv));
    if (missing.length) throw new Error(`${missing.length} picked player${missing.length === 1 ? " is" : "s are"} not placed in a category yet — go back to "Select & pair players" and place them.`);
    const now = new Date().toISOString();
    const fee = (i.feeCents ?? 0) > 0;
    const rows = i.entrants.map((e) => ({
      champ_id: tid, club_member_id: e.memberId, partner_member_id: e.partnerId ?? null, partner_confirmed: !!e.partnerId,
      status: fee ? "pending_payment" : "invited", invited_by_admin: true, confirmed_at: now, confirmation_source: "admin",
      registration_source: "admin",
      // Admin entry is already confirmed, so it must carry the player's division (category).
      division_choices: nDiv > 1 ? [e.division as number] : [1],
    }));
    const { error } = await fromExt("club_champs_registrations").upsert(rows, { onConflict: "champ_id,club_member_id", ignoreDuplicates: true });
    if (error) {
      if (!i.existingId) await fromExt("tournaments").delete().eq("id", tid);
      throw error;
    }
  }
  return tid!;
}
