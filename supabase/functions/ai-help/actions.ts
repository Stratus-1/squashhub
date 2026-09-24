// Approved AI action catalogue (beta). The model may only NAME one of these
// actions with arguments. Each action:
//   preview(): read-only — resolves records, checks permission, describes change
//   execute(): runs ONLY after the user confirmed the stored preview
//   inverse(): optional defined rollback (Super Admin only)
// Executes use the caller's own signed-in client wherever possible so the
// existing database permission rules stay the source of truth.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { proposeBooking, confirmBooking, type BookingProposal } from "../ai-assistant/booking.ts";

export type Ctx = {
  user: SupabaseClient; // caller-scoped client (RLS + auth.uid())
  admin: SupabaseClient; // service client — reads + audited writes only
  userId: string;
  clubId: string;
  memberId: string | null;
  isAdmin: boolean;
  isSuper: boolean;
};

export type Preview = {
  ok: true;
  summary: string;
  changes: string[];
  affected: string[];
  consequences: string[];
  unchanged: string[];
  reversible: boolean;
  /** Frozen args the execute step will use — never re-interpreted by AI. */
  resolved: Record<string, unknown>;
  before?: unknown;
};
export type Refusal = { ok: false; reason: string; escalate: boolean };

export type ActionDef = {
  label: string;
  describe: string;
  preview: (c: Ctx, args: Record<string, unknown>) => Promise<Preview | Refusal>;
  execute: (c: Ctx, r: Record<string, unknown>) => Promise<{ ok: boolean; message: string; after?: unknown; reversible?: boolean }>;
  inverse?: {
    check: (c: Ctx, r: Record<string, unknown>, after: any) => Promise<{ ok: boolean; message: string; changes?: string[] }>;
    run: (c: Ctx, r: Record<string, unknown>, after: any) => Promise<{ ok: boolean; message: string; after?: unknown }>;
  };
};

const s = (v: unknown) => String(v ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);

async function findMember(c: Ctx, name: string) {
  const { data } = await c.admin.from("club_members").select("id, name").eq("club_id", c.clubId).ilike("name", `%${name}%`).limit(5);
  return (data ?? []) as { id: string; name: string }[];
}

export const ACTIONS: Record<string, ActionDef> = {
  create_booking: {
    label: "Book a court",
    describe: 'args: {"date":"YYYY-MM-DD","start_time":"HH:MM","duration_minutes"?:number,"court_name"?:string}',
    async preview(c, args) {
      const out = await proposeBooking(c.user as any, c.clubId, args as any);
      if (!out.ok) return { ok: false, reason: out.message, escalate: false };
      const p = out.proposal;
      return {
        ok: true, summary: `Book ${p.summary}`,
        changes: [`A new court booking for you: ${p.court_name}, ${p.date} ${p.start_time}–${p.end_time}`],
        affected: ["Court bookings"],
        consequences: ["The court is reserved in your name. Normal booking fees/rules apply."],
        unchanged: ["No other bookings are moved"],
        reversible: true, resolved: { proposal: p },
      };
    },
    async execute(c, r) {
      const res = await confirmBooking(c.user as any, c.userId, c.clubId, c.memberId, r.proposal as BookingProposal);
      return res.ok ? { ok: true, message: res.message, after: { booking_id: res.bookingId }, reversible: true } : { ok: false, message: res.message };
    },
    inverse: {
      async check(c, _r, after) {
        const { data: b } = await c.admin.from("bookings").select("id,date,status").eq("id", after?.booking_id).maybeSingle();
        if (!b) return { ok: false, message: "The booking no longer exists." };
        if (b.status === "cancelled") return { ok: false, message: "Already cancelled." };
        if (b.date < today()) return { ok: false, message: "The booking date has passed — manual review required." };
        return { ok: true, message: "ok", changes: [`Cancel booking on ${b.date}`] };
      },
      async run(c, _r, after) {
        const { error } = await c.admin.from("bookings").update({ status: "cancelled" }).eq("id", after.booking_id);
        return error ? { ok: false, message: error.message } : { ok: true, message: "Booking cancelled", after: { booking_id: after.booking_id, status: "cancelled" } };
      },
    },
  },

  cancel_my_booking: {
    label: "Cancel one of my future bookings",
    describe: 'args: {"date":"YYYY-MM-DD","start_time"?:"HH:MM"}',
    async preview(c, args) {
      const date = s(args.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: "Which day is the booking on?", escalate: false };
      if (date < today()) return { ok: false, reason: "That booking is in the past, so it can't be cancelled here.", escalate: false };
      let q = c.admin.from("bookings").select("id,date,start_time,end_time,status,court_id,courts(name)")
        .eq("club_id", c.clubId).eq("user_id", c.userId).eq("date", date).neq("status", "cancelled");
      if (s(args.start_time)) q = q.eq("start_time", s(args.start_time).length === 5 ? `${s(args.start_time)}:00` : s(args.start_time));
      const { data } = await q;
      const rows = (data ?? []) as any[];
      if (!rows.length) return { ok: false, reason: "I couldn't find a booking of yours at that time.", escalate: false };
      if (rows.length > 1) return { ok: false, reason: `You have ${rows.length} bookings that day — which start time?`, escalate: false };
      const b = rows[0];
      const label = `${b.courts?.name ?? "Court"} on ${b.date} at ${String(b.start_time).slice(0, 5)}`;
      return {
        ok: true, summary: `Cancel your booking: ${label}`,
        changes: [`Your booking ${label} is cancelled`],
        affected: ["Court bookings"],
        consequences: ["The court becomes free for others. Any invited opponent may be notified by the normal booking rules."],
        unchanged: ["Fees already charged are not refunded automatically", "Your other bookings stay as they are"],
        reversible: true, resolved: { booking_id: b.id }, before: { status: b.status },
      };
    },
    async execute(c, r) {
      const { data, error } = await c.user.from("bookings").update({ status: "cancelled" })
        .eq("id", r.booking_id).eq("user_id", c.userId).select("id,status").maybeSingle();
      if (error || !data) return { ok: false, message: error?.message ?? "You're not allowed to cancel that booking." };
      return { ok: data.status === "cancelled", message: "Booking cancelled.", after: data, reversible: true };
    },
    inverse: {
      async check(c, r) {
        const { data: b } = await c.admin.from("bookings").select("*").eq("id", r.booking_id).maybeSingle();
        if (!b || b.status !== "cancelled") return { ok: false, message: "Booking is not in a cancelled state any more." };
        if (b.date < today()) return { ok: false, message: "Date has passed — manual review required." };
        const { data: clash } = await c.admin.from("bookings").select("id").eq("court_id", b.court_id).eq("date", b.date)
          .neq("status", "cancelled").lt("start_time", b.end_time).gt("end_time", b.start_time).neq("id", b.id);
        if (clash?.length) return { ok: false, message: "Someone else has since booked that slot — manual review required." };
        return { ok: true, message: "ok", changes: [`Restore booking on ${b.date} at ${String(b.start_time).slice(0, 5)}`] };
      },
      async run(c, r) {
        const { error } = await c.admin.from("bookings").update({ status: "confirmed" }).eq("id", r.booking_id);
        return error ? { ok: false, message: error.message } : { ok: true, message: "Booking restored", after: { status: "confirmed" } };
      },
    },
  },

  replace_tournament_player: {
    label: "Replace a player in a tournament (unplayed games only) — admins / tournament managers",
    describe: 'args: {"tournament_id"?:uuid (use page context if on a tournament page),"tournament_name"?:string,"old_player":string,"new_player":string}',
    async preview(c, args) {
      let champId = s(args.tournament_id);
      if (!champId && s(args.tournament_name)) {
        const { data } = await c.admin.from("tournaments").select("id,name").eq("club_id", c.clubId).ilike("name", `%${s(args.tournament_name)}%`).limit(3);
        if ((data ?? []).length !== 1) return { ok: false, reason: "I couldn't pin down which tournament you mean — open it first, or give its exact name.", escalate: false };
        champId = data![0].id;
      }
      if (!champId) return { ok: false, reason: "Which tournament? Open it first, or give its name.", escalate: false };
      const olds = await findMember(c, s(args.old_player));
      const news = await findMember(c, s(args.new_player));
      if (olds.length !== 1 || news.length !== 1) {
        return { ok: false, reason: `I found ${olds.length} match(es) for "${s(args.old_player)}" and ${news.length} for "${s(args.new_player)}" in your club. Please use full names.`, escalate: false };
      }
      const { data, error } = await c.user.rpc("ai_replace_tournament_player", { p_champ_id: champId, p_old_member: olds[0].id, p_new_member: news[0].id, p_preview: true });
      if (error) return { ok: false, reason: error.message, escalate: /permission/i.test(error.message) };
      const p = data as any;
      if (p.club_id !== c.clubId && !c.isSuper) return { ok: false, reason: "That tournament belongs to another club.", escalate: true };
      if (p.new_already_entered) return { ok: false, reason: `${p.new_name} is already entered in ${p.tournament}. Swapping two entrants needs an admin to review.`, escalate: true };
      if (!p.entries && !(p.unplayed_matches ?? []).length) return { ok: false, reason: `${p.old_name} isn't entered in ${p.tournament}.`, escalate: false };
      const n = (p.unplayed_matches ?? []).length;
      return {
        ok: true, summary: `Replace ${p.old_name} with ${p.new_name} in ${p.tournament}`,
        changes: [
          `${n} unplayed game(s) switch from ${p.old_name} to ${p.new_name} (same courts and times)`,
          `The entry/pairing in the standings now shows ${p.new_name}`,
          "Players in those games get an in-app notice of the line-up change",
        ],
        affected: [`Tournament: ${p.tournament}`, `Entries: ${p.entries}`, `Registrations: ${p.registrations}`],
        consequences: [p.new_same_club ? "" : `${p.new_name} is not a member of this club.`].filter(Boolean),
        unchanged: [
          `${p.played_matches} game(s) already played or started keep ${p.old_name} and their scores`,
          "Standings points already earned, payments and receipts are not changed",
          "No emails/WhatsApps are sent",
        ],
        reversible: true,
        resolved: { champ_id: champId, old_member: olds[0].id, new_member: news[0].id, old_name: p.old_name, new_name: p.new_name },
        before: { unplayed_matches: p.unplayed_matches, played: p.played_matches },
      };
    },
    async execute(c, r) {
      const { data, error } = await c.user.rpc("ai_replace_tournament_player", { p_champ_id: r.champ_id, p_old_member: r.old_member, p_new_member: r.new_member, p_preview: false });
      if (error) return { ok: false, message: error.message };
      const d = data as any;
      // Verify: no unplayed game still has the old player.
      const check = await c.user.rpc("ai_replace_tournament_player", { p_champ_id: r.champ_id, p_old_member: r.old_member, p_new_member: r.new_member, p_preview: true });
      const left = ((check.data as any)?.unplayed_matches ?? []).length;
      return { ok: left === 0, message: left === 0 ? `Done — ${d.new_name} replaces ${d.old_name} in ${d.changed_matches.length} game(s).` : "Change ran but verification found games still to fix.", after: d, reversible: true };
    },
    inverse: {
      async check(c, r, after) {
        const ids: string[] = after?.changed_matches ?? [];
        if (!ids.length) return { ok: false, message: "No games were changed — nothing to reverse." };
        const { data } = await c.admin.from("club_champs_matches").select("id,status,winner_member_id,score,game_scores").in("id", ids);
        const played = (data ?? []).filter((m: any) => m.status === "completed" || m.winner_member_id || m.score || m.game_scores).length;
        return { ok: true, message: "ok", changes: [
          `Put ${r.old_name} back instead of ${r.new_name} in ${ids.length - played} unplayed game(s) and the entry`,
          ...(played ? [`${played} game(s) have been played since and stay as they are`] : []),
        ] };
      },
      async run(c, r, after) {
        const { data, error } = await c.user.rpc("ai_replace_tournament_player", { p_champ_id: r.champ_id, p_old_member: r.new_member, p_new_member: r.old_member, p_preview: false, p_only_match_ids: after?.changed_matches ?? [] });
        return error ? { ok: false, message: error.message } : { ok: true, message: "Player swap reversed", after: data };
      },
    },
  },

  update_my_contact: {
    label: "Update my own phone number or email on my member profile",
    describe: 'args: {"phone"?:string,"email"?:string}',
    async preview(c, args) {
      if (!c.memberId) return { ok: false, reason: "I couldn't find your member profile at this club.", escalate: true };
      const phone = s(args.phone), email = s(args.email).toLowerCase();
      if (!phone && !email) return { ok: false, reason: "What should the new phone number or email be?", escalate: false };
      if (phone && !/^\+?[\d\s-]{9,16}$/.test(phone)) return { ok: false, reason: "That phone number doesn't look right.", escalate: false };
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: "That email doesn't look right.", escalate: false };
      const { data: m } = await c.admin.from("club_members").select("id,name,phone,email").eq("id", c.memberId).maybeSingle();
      const changes = [
        ...(phone ? [`Phone: ${m?.phone || "(none)"} → ${phone}`] : []),
        ...(email ? [`Email on your member profile: ${m?.email || "(none)"} → ${email}`] : []),
      ];
      return {
        ok: true, summary: "Update your contact details", changes, affected: [`Member profile: ${m?.name}`],
        consequences: ["Club messages will use the new details."],
        unchanged: ["Your login email/password is not changed", "Other family members' profiles are not changed"],
        reversible: true, resolved: { member_id: c.memberId, ...(phone ? { phone } : {}), ...(email ? { email } : {}) },
        before: { phone: m?.phone ?? null, email: m?.email ?? null },
      };
    },
    async execute(c, r) {
      const patch: Record<string, string> = {};
      if (r.phone) patch.phone = String(r.phone);
      if (r.email) patch.email = String(r.email);
      // Self-only: the row must belong to the caller.
      const { data, error } = await c.admin.from("club_members").update(patch).eq("id", r.member_id).eq("user_id", c.userId).select("id,phone,email").maybeSingle();
      if (error || !data) return { ok: false, message: error?.message ?? "That profile isn't yours." };
      return { ok: true, message: "Your contact details are updated.", after: data, reversible: true };
    },
    inverse: {
      async check(_c, _r, _after) { return { ok: true, message: "ok", changes: ["Restore the previous phone/email"] }; },
      async run(c, r, _after) {
        const { data: row } = await c.admin.from("ai_assist_interactions").select("before_data").eq("id", (r as any).__interaction_id).maybeSingle();
        const before = (row?.before_data ?? {}) as { phone?: string | null; email?: string | null };
        const patch: Record<string, unknown> = {};
        if ("phone" in r) patch.phone = before.phone ?? null;
        if ("email" in r) patch.email = before.email ?? null;
        const { error } = await c.admin.from("club_members").update(patch).eq("id", r.member_id);
        return error ? { ok: false, message: error.message } : { ok: true, message: "Contact details restored", after: patch };
      },
    },
  },
};

export function catalogueFor(isAdmin: boolean) {
  return Object.entries(ACTIONS)
    .filter(([k]) => isAdmin || k !== "replace_tournament_player")
    .map(([k, a]) => `- ${k}: ${a.label}. ${a.describe}`).join("\n");
}
