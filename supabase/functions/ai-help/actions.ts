// Approved AI action catalogue (beta). The model may only NAME one of these
// actions with arguments. Each action:
//   preview(): read-only — resolves records, checks permission, describes change
//   execute(): runs ONLY after the user confirmed the stored preview
//   inverse(): optional defined rollback (Super Admin only)
// Executes use the caller's own signed-in client wherever possible so the
// existing database permission rules stay the source of truth.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { proposeBooking, confirmBooking, type BookingProposal } from "./booking.ts";

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
        // Super Admin may act in any club; others only in the club they are in.
        let q = c.admin.from("tournaments").select("id,name,club_id").ilike("name", `%${s(args.tournament_name)}%`).neq("status", "completed").limit(5);
        if (!c.isSuper) q = q.eq("club_id", c.clubId);
        const { data } = await q;
        const rows = (data ?? []) as any[];
        const exact = rows.filter((t) => t.name.toLowerCase() === s(args.tournament_name).toLowerCase());
        const pick = exact.length === 1 ? exact : rows.length > 1 ? rows.filter((t) => t.club_id === c.clubId) : rows;
        if (pick.length !== 1) return { ok: false, reason: rows.length ? `Several tournaments match "${s(args.tournament_name)}": ${rows.map((t) => t.name).join(", ")}. Which one?` : `I couldn't find an active tournament called "${s(args.tournament_name)}".`, escalate: false };
        champId = pick[0].id;
      }
      if (!champId) return { ok: false, reason: "Which tournament? Give its name.", escalate: false };
      const { data: t } = await c.admin.from("tournaments").select("id,name,club_id,participating_club_ids").eq("id", champId).maybeSingle();
      if (!t) return { ok: false, reason: "That tournament wasn't found.", escalate: false };
      // Old player: search the tournament's own entrants first (works for regional events).
      const { data: ent } = await c.admin.from("club_champs_entries").select("club_member_id,partner_member_id").eq("champ_id", champId);
      const entIds = [...new Set((ent ?? []).flatMap((e: any) => [e.club_member_id, e.partner_member_id]).filter(Boolean))];
      const { data: entM } = entIds.length ? await c.admin.from("club_members").select("id,name").in("id", entIds) : { data: [] };
      const matchName = (rows: { id: string; name: string }[], q: string) => {
        const n = q.toLowerCase();
        const ex = rows.filter((r) => r.name.toLowerCase() === n);
        if (ex.length) return ex;
        const parts = n.split(/\s+/).filter(Boolean);
        return rows.filter((r) => parts.every((p) => r.name.toLowerCase().includes(p)));
      };
      const olds = matchName((entM ?? []) as any[], s(args.old_player));
      const clubs = [t.club_id, ...((t as any).participating_club_ids ?? [])];
      const { data: pool } = await c.admin.from("club_members").select("id,name").in("club_id", clubs).ilike("name", `%${s(args.new_player).split(/\s+/)[0]}%`).limit(50);
      const news = matchName((pool ?? []) as any[], s(args.new_player));
      if (olds.length !== 1) {
        return { ok: false, reason: olds.length ? `More than one entrant matches "${s(args.old_player)}": ${olds.map((o) => o.name).join(", ")}. Which one?` : `"${s(args.old_player)}" isn't an entrant in ${t.name}.`, escalate: false };
      }
      if (news.length !== 1) {
        return { ok: false, reason: news.length ? `More than one member matches "${s(args.new_player)}": ${news.slice(0, 6).map((o) => o.name).join(", ")}. Which one?` : `I couldn't find a member called "${s(args.new_player)}" in the host or participating clubs.`, escalate: false };
      }
      const { data, error } = await c.user.rpc("ai_replace_tournament_player", { p_champ_id: champId, p_old_member: olds[0].id, p_new_member: news[0].id, p_preview: true });
      if (error) return { ok: false, reason: error.message, escalate: /permission/i.test(error.message) };
      const p = data as any;
      if (p.new_already_entered) return { ok: false, reason: `${p.new_name} is already entered in ${p.tournament}, so this is a SWAP of two entrants. Swapping two entrants is not yet an enabled assistant action (this is not a permission problem).`, escalate: true };
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

  correct_match_result: {
    label: "Correct the score of a completed tournament match (same winner only) — admins / tournament managers",
    describe: 'args: {"match_id":uuid (from tournament_fixtures),"games":"11-9, 8-11, 11-5, ..." (EVERY game, in order, player A score first as listed in the fixture)}. If the user only gave a games tally like 3-2, ask for each game score first.',
    async preview(c, args) {
      const matchId = s(args.match_id);
      if (!/^[0-9a-f-]{36}$/i.test(matchId)) return { ok: false, reason: "Which match? Look it up with tournament_fixtures first.", escalate: false };
      const games = s(args.games).split(/[,;]+/).map((g) => g.trim()).filter(Boolean).map((g) => {
        const mm = g.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
        return mm ? { a: Number(mm[1]), b: Number(mm[2]) } : null;
      });
      if (!games.length || games.some((g) => !g)) return { ok: false, reason: "Please give every game score in order, e.g. 11-9, 8-11, 11-5, 9-11, 11-7.", escalate: false };
      const { data, error } = await c.user.rpc("ai_correct_champ_result", { p_match_id: matchId, p_games: games, p_preview: true });
      if (error) return { ok: false, reason: error.message, escalate: /permission/i.test(error.message) };
      const p = data as any;
      const sideA = [p.player_a, p.partner_a].filter(Boolean).join(" & ");
      const sideB = [p.player_b, p.partner_b].filter(Boolean).join(" & ");
      const oldGames = Array.isArray(p.old_games) ? p.old_games : [];
      const oldTally = [oldGames.filter((g: any) => g.a > g.b).length, oldGames.filter((g: any) => g.b > g.a).length];
      const label = `${p.tournament} — ${sideA} vs ${sideB}`;
      if ((p.blockers ?? []).length) {
        return { ok: false, escalate: true, reason: `${label}. Current result ${oldTally.join("–")} (${p.old_score}); proposed ${p.new_games_won.join("–")} (${p.new_score}). The assistant can't apply this safely: ${p.blockers.join(" ")}` };
      }
      return {
        ok: true,
        summary: `Correct result: ${label}. ${oldTally.join("–")} → ${p.new_games_won.join("–")}. Winner stays ${p.new_winner}.`,
        changes: [`Match score ${p.old_score} → ${p.new_score}`, `Games ${oldTally.join("–")} → ${p.new_games_won.join("–")}`],
        affected: [`Tournament: ${p.tournament}`, p.is_group ? `Pool ${p.pool ?? "-"} standings: games and points difference update automatically` : "Knockout game: the same player still goes through", "Player match statistics refresh"],
        consequences: [p.is_group ? "Pool positions can move only if they were tied on wins." : ""].filter(Boolean),
        unchanged: [`Winner (${p.new_winner}) and win/loss points in the table`, "Ranking points and ladder (same winner, not re-awarded)", "Later rounds / progression", "No result email, WhatsApp or app message is sent", "The original result is kept in the change history"],
        reversible: true,
        resolved: { match_id: matchId, games, expected_updated_at: p.updated_at },
        before: { score: p.old_score, games: p.old_games, winner: p.old_winner },
      };
    },
    async execute(c, r) {
      const { data: cur } = await c.admin.from("club_champs_matches").select("updated_at").eq("id", r.match_id).maybeSingle();
      if (!cur || cur.updated_at !== r.expected_updated_at) return { ok: false, message: "The match changed after the preview was made — please ask again so I can re-check it." };
      const { data, error } = await c.user.rpc("ai_correct_champ_result", { p_match_id: r.match_id, p_games: r.games, p_preview: false, p_reason: "AI assistant — correction confirmed by user" });
      if (error) return { ok: false, message: error.message };
      const d = data as any;
      const { data: after } = await c.admin.from("club_champs_matches").select("score,game_scores,winner_member_id,status").eq("id", r.match_id).maybeSingle();
      const ok = after?.score === d.new_score && after?.winner_member_id === d.winner_member_id && after?.status === "completed";
      return { ok, message: ok ? `Done — the score is now ${d.new_score}. Winner unchanged; no notifications were sent.` : "The update ran but verification didn't match — flagged for review.", after: d, reversible: true };
    },
    inverse: {
      async check(c, r, after) {
        const { data: m } = await c.admin.from("club_champs_matches").select("score").eq("id", r.match_id).maybeSingle();
        if (m?.score !== after?.new_score) return { ok: false, message: "The score has changed again since — manual review required." };
        return { ok: true, message: "ok", changes: [`Restore score ${after?.old_score}`] };
      },
      async run(c, r, after) {
        const sets = (() => { try { return JSON.parse(after.old_game_scores).sets; } catch { return null; } })();
        if (!sets) return { ok: false, message: "Original game scores unreadable — manual review required." };
        const { data, error } = await c.user.rpc("ai_correct_champ_result", { p_match_id: r.match_id, p_games: sets, p_preview: false, p_reason: "Super Admin reversed an AI result correction" });
        return error ? { ok: false, message: error.message } : { ok: true, message: "Original score restored", after: data };
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

  // Recorded by the automatic self-heal (repair.ts); never proposed by the model.
  // Exists here so Super Admin can reverse it from AI Activity.
  repair_tournament_state: {
    label: "Automatic tournament repair",
    describe: "internal",
    async preview() {
      return { ok: false, reason: "Use the diagnose_and_repair_tournament tool instead.", escalate: false };
    },
    async execute() {
      return { ok: false, message: "Automatic repairs run through diagnose_and_repair_tournament." };
    },
    inverse: {
      async check(c, _r, after) {
        const snap = (after?.snapshot ?? []) as any[];
        if (!after?.tournament_id || !snap.length) return { ok: false, message: "No snapshot stored for this repair." };
        const ids = snap.map((e) => e.row?.id).filter(Boolean);
        const { data } = await c.admin.from("club_champs_matches").select("id,status,score,winner_member_id").in("id", ids);
        const locked = (data ?? []).filter((m: any) => (m.status && m.status !== "scheduled") || m.score || m.winner_member_id);
        return locked.length
          ? { ok: false, message: `${locked.length} affected game(s) have started or been scored since — reversing would disturb real results.` }
          : { ok: true, message: `Restore ${snap.length} game(s) to how they were before the automatic repair.`, changes: [`${snap.length} fixture(s) restored`] };
      },
      async run(c, _r, after) {
        const { data, error } = await c.admin.rpc("ai_rollback_champ_repair", { p_champ: after.tournament_id, p_snapshot: after.snapshot });
        return error ? { ok: false, message: error.message } : { ok: true, message: `Restored ${(data as any)?.restored ?? 0} game(s)`, after: data };
      },
    },
  },
};

export function catalogueFor(isAdmin: boolean) {
  return Object.entries(ACTIONS)
    .filter(([k]) => k !== "repair_tournament_state")
    .filter(([k]) => isAdmin || !["replace_tournament_player", "correct_match_result"].includes(k))
    .map(([k, a]) => `- ${k}: ${a.label}. ${a.describe}`).join("\n");
}
