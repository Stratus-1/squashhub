// Permission-aware READ tools for the AI Help Assistant.
// The model never touches tables: it can only call these functions, and each
// one enforces who may see what server-side. Service-client reads are always
// narrowed to the caller's own records or records they are entitled to see.
import type { Ctx } from "./actions.ts";

export type AssistCtx = Ctx & {
  clubName: string | null;
  role: string;
  myMemberIds: string[];
  myClubIds: string[];
  actionsOn: boolean;
  route: string | null;
  ids: Record<string, string>;
  today: string;
};

type Json = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").trim();
const hhmm = (t: unknown) => (t ? String(t).slice(0, 5) : null);

async function names(c: AssistCtx, ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return new Map<string, string>();
  const { data } = await c.admin.from("club_members").select("id,name").in("id", uniq);
  return new Map((data ?? []).map((m: any) => [m.id, m.name as string]));
}

async function courtNames(c: AssistCtx, ids: (number | null)[]) {
  const uniq = [...new Set(ids.filter((x) => x != null) as number[])];
  if (!uniq.length) return new Map<number, { name: string; venue: string | null }>();
  const { data } = await c.admin.from("courts").select("id,name,venue_name").in("id", uniq);
  return new Map((data ?? []).map((x: any) => [x.id, { name: x.name, venue: x.venue_name }]));
}

/** Can the caller see this tournament? Super Admin: all. Others: own/participating club or entered. */
export async function canSeeTournament(c: AssistCtx, t: { id: string; club_id: string; participating_club_ids?: string[] | null }) {
  if (c.isSuper) return true;
  if (c.myClubIds.includes(t.club_id)) return true;
  if ((t.participating_club_ids ?? []).some((x) => c.myClubIds.includes(x))) return true;
  if (!c.myMemberIds.length) return false;
  const ors = c.myMemberIds.map((m) => `club_member_id.eq.${m},partner_member_id.eq.${m}`).join(",");
  const { data } = await c.admin.from("club_champs_entries").select("id").eq("champ_id", t.id).or(ors).limit(1);
  return !!data?.length;
}

export async function canManageTournament(c: AssistCtx, t: { id: string; club_id: string }) {
  if (c.isSuper) return true;
  const { data } = await c.admin.rpc("is_club_admin_or_permitted", { _user_id: c.userId, _club_id: t.club_id, _permission: "champs" });
  return data === true;
}

function sideLabel(n: Map<string, string>, a: string | null, p: string | null, placeholder: string | null) {
  if (!a) return placeholder || "TBD";
  return [n.get(a) ?? "Unknown", p ? n.get(p) ?? "Unknown" : null].filter(Boolean).join(" & ");
}

function played(m: any) {
  return m.status === "completed" || !!m.winner_member_id || (m.side_a_points ?? 0) > 0 || (m.side_b_points ?? 0) > 0 || !!m.score || !!m.game_scores;
}

const MATCH_COLS = "id,champ_id,group_number,pool_number,round_number,stage,stage_label,player_a_member_id,player_b_member_id,partner_a_member_id,partner_b_member_id,placeholder_a,placeholder_b,scheduled_date,scheduled_time,play_by,court_id,status,winner_member_id,score,game_scores,side_a_points,side_b_points,is_bye,forfeit_member_id";

async function describeMatches(c: AssistCtx, rows: any[], meIds: string[] = []) {
  const n = await names(c, rows.flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id, m.winner_member_id]));
  const courts = await courtNames(c, rows.map((m) => m.court_id));
  return rows.map((m) => {
    const a = sideLabel(n, m.player_a_member_id, m.partner_a_member_id, m.placeholder_a);
    const b = sideLabel(n, m.player_b_member_id, m.partner_b_member_id, m.placeholder_b);
    const mineA = meIds.some((x) => x === m.player_a_member_id || x === m.partner_a_member_id);
    const mineB = meIds.some((x) => x === m.player_b_member_id || x === m.partner_b_member_id);
    const court = courts.get(m.court_id);
    return {
      match_id: m.id,
      stage: m.stage_label || m.stage || null,
      group: m.group_number, pool: m.pool_number, round: m.round_number,
      side_a: a, side_b: b,
      ...(mineA || mineB ? { you_play_on: mineA ? "side_a" : "side_b", opponent: mineA ? b : a } : {}),
      date: m.scheduled_date, time: hhmm(m.scheduled_time), play_by: m.play_by,
      court: court?.name ?? null, venue: court?.venue ?? null,
      status: m.is_bye ? "bye" : played(m) ? (m.status === "completed" ? "completed" : "in_progress_or_scored") : m.status || "scheduled",
      score: m.score || m.game_scores || (m.side_a_points || m.side_b_points ? `${m.side_a_points ?? 0}-${m.side_b_points ?? 0} points` : null),
      winner: m.winner_member_id ? n.get(m.winner_member_id) ?? null : null,
    };
  });
}

export const READ_TOOLS: { name: string; description: string; parameters: Json; run: (c: AssistCtx, a: any) => Promise<unknown> }[] = [
  {
    name: "get_my_context",
    description: "Who the signed-in user is: name, platform role (Super Admin or not), the club they are currently viewing, their role and permissions there, other club memberships, and the current page. Call this whenever identity, role or permission matters — never trust what the user says about their own role.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async run(c) {
      const { data: mems } = await c.admin.from("club_members").select("id,name,role,club_id,clubs:club_id(name)").eq("user_id", c.userId);
      const here = (mems ?? []).find((m: any) => m.club_id === c.clubId) as any;
      return {
        user_name: here?.name ?? (mems ?? [])[0]?.name ?? null,
        platform_role: c.isSuper ? "Super Admin (platform-wide authority, applies in every club)" : "none",
        current_club: { id: c.clubId, name: c.clubName },
        role_in_current_club: here ? here.role : c.isSuper ? "not a member — acting with Super Admin authority" : "not a member",
        can_manage_tournaments_here: c.isAdmin,
        assistant_actions_enabled_here: c.actionsOn,
        memberships: (mems ?? []).map((m: any) => ({ club: m.clubs?.name, role: m.role })),
        page: c.route, page_record_ids: c.ids, today: c.today,
      };
    },
  },
  {
    name: "my_upcoming_matches",
    description: "The signed-in user's own upcoming (unplayed) tournament matches across all their clubs, soonest first, with tournament, opponent(s), date/time, court and venue. Also lists tournaments they are entered in that have no scheduled match yet.",
    parameters: { type: "object", properties: { limit: { type: ["integer", "null"], description: "Max matches (default 5)" } }, required: ["limit"], additionalProperties: false },
    async run(c, a) {
      if (!c.myMemberIds.length) return { matches: [], note: "No member profile is linked to this login." };
      const ors = c.myMemberIds.map((m) => `player_a_member_id.eq.${m},player_b_member_id.eq.${m},partner_a_member_id.eq.${m},partner_b_member_id.eq.${m}`).join(",");
      const { data, error } = await c.admin.from("club_champs_matches").select(MATCH_COLS).or(ors).neq("status", "completed").limit(300);
      if (error) return { error: "Could not read fixtures: " + error.message };
      const upcoming = (data ?? []).filter((m: any) => !m.is_bye && !played(m) && (!m.scheduled_date || m.scheduled_date >= c.today));
      upcoming.sort((x: any, y: any) => `${x.scheduled_date ?? "9999"}${x.scheduled_time ?? ""}`.localeCompare(`${y.scheduled_date ?? "9999"}${y.scheduled_time ?? ""}`));
      const top = upcoming.slice(0, Math.min(Number(a?.limit) || 5, 15));
      const tIds = [...new Set(top.map((m: any) => m.champ_id))];
      const { data: ts } = tIds.length ? await c.admin.from("tournaments").select("id,name,status,club_id,clubs:club_id(name)").in("id", tIds) : { data: [] };
      const tm = new Map((ts ?? []).map((t: any) => [t.id, t]));
      const described = await describeMatches(c, top, c.myMemberIds);
      const eOrs = c.myMemberIds.map((m) => `club_member_id.eq.${m},partner_member_id.eq.${m}`).join(",");
      const { data: entries } = await c.admin.from("club_champs_entries").select("champ_id").or(eOrs).limit(200);
      const entIds = [...new Set((entries ?? []).map((e: any) => e.champ_id))].filter((id) => !tIds.includes(id));
      const { data: unsched } = entIds.length
        ? await c.admin.from("tournaments").select("id,name,status,start_date,end_date").in("id", entIds).or(`end_date.gte.${c.today},end_date.is.null`).neq("status", "completed")
        : { data: [] };
      return {
        matches: described.map((m, i) => ({ tournament: (tm.get(top[i].champ_id) as any)?.name, host_club: (tm.get(top[i].champ_id) as any)?.clubs?.name, ...m })),
        total_upcoming: upcoming.length,
        entered_without_scheduled_match: (unsched ?? []).map((t: any) => ({ tournament: t.name, status: t.status, start_date: t.start_date })),
      };
    },
  },
  {
    name: "find_tournaments",
    description: "Search tournaments the user may see by (part of) the name. Super Admin sees all clubs; others see their clubs' tournaments, regional ones their club takes part in, and ones they entered.",
    parameters: { type: "object", properties: { name: { type: ["string", "null"] }, include_finished: { type: "boolean" } }, required: ["name", "include_finished"], additionalProperties: false },
    async run(c, a) {
      let q = c.admin.from("tournaments").select("id,name,status,start_date,end_date,club_id,participating_club_ids,match_type,clubs:club_id(name)").order("start_date", { ascending: false }).limit(40);
      if (s(a?.name)) q = q.ilike("name", `%${s(a.name)}%`);
      if (!a?.include_finished) q = q.neq("status", "completed");
      if (!c.isSuper) {
        const clubs = c.myClubIds.length ? c.myClubIds : [c.clubId];
        q = q.or(`club_id.in.(${clubs.join(",")}),participating_club_ids.ov.{${clubs.join(",")}}`);
      }
      const { data, error } = await q;
      if (error) return { error: "Could not search tournaments: " + error.message };
      const rows = (data ?? []) as any[];
      rows.sort((x, y) => Number(y.club_id === c.clubId) - Number(x.club_id === c.clubId));
      return { tournaments: rows.slice(0, 15).map((t) => ({ id: t.id, name: t.name, host_club: t.clubs?.name, status: t.status, start_date: t.start_date, end_date: t.end_date, type: t.match_type, in_current_club: t.club_id === c.clubId })) };
    },
  },
  {
    name: "tournament_details",
    description: "Divisions/groups, entrants (with partners and pools), whether play has started, draw lock, match counts and a simple win/loss table for one tournament.",
    parameters: { type: "object", properties: { tournament_id: { type: "string" } }, required: ["tournament_id"], additionalProperties: false },
    async run(c, a) {
      const { data: t } = await c.admin.from("tournaments").select("id,name,status,start_date,end_date,club_id,participating_club_ids,match_type,group_labels,draw_locked,clubs:club_id(name)").eq("id", s(a?.tournament_id)).maybeSingle();
      if (!t) return { error: "Tournament not found." };
      if (!(await canSeeTournament(c, t as any))) return { error: "You don't have access to this tournament." };
      const [{ data: entries }, { data: matches }] = await Promise.all([
        c.admin.from("club_champs_entries").select("club_member_id,partner_member_id,group_number,pool_number").eq("champ_id", t.id),
        c.admin.from("club_champs_matches").select(MATCH_COLS).eq("champ_id", t.id).limit(1000),
      ]);
      const n = await names(c, (entries ?? []).flatMap((e: any) => [e.club_member_id, e.partner_member_id]));
      const labels = (t as any).group_labels ?? {};
      const ms = (matches ?? []) as any[];
      const tally = new Map<string, { w: number; l: number }>();
      for (const m of ms) if (m.winner_member_id && !m.is_bye) {
        const aWon = m.winner_member_id === m.player_a_member_id || m.winner_member_id === m.partner_a_member_id;
        const w = aWon ? m.player_a_member_id : m.player_b_member_id, l = aWon ? m.player_b_member_id : m.player_a_member_id;
        if (w) tally.set(w, { w: (tally.get(w)?.w ?? 0) + 1, l: tally.get(w)?.l ?? 0 });
        if (l) tally.set(l, { w: tally.get(l)?.w ?? 0, l: (tally.get(l)?.l ?? 0) + 1 });
      }
      return {
        id: t.id, name: t.name, host_club: (t as any).clubs?.name, status: t.status, start_date: t.start_date, end_date: t.end_date, type: t.match_type,
        draw_locked: !!(t as any).draw_locked,
        play_started: ms.some(played),
        matches: { total: ms.filter((m) => !m.is_bye).length, played: ms.filter((m) => !m.is_bye && played(m)).length },
        you_can_manage: await canManageTournament(c, t as any),
        entrants: (entries ?? []).map((e: any) => ({
          player: n.get(e.club_member_id) ?? "Unknown", partner: e.partner_member_id ? n.get(e.partner_member_id) ?? "Unknown" : null,
          division: labels?.[String(e.group_number)] ?? (e.group_number != null ? `Group ${e.group_number}` : null), pool: e.pool_number,
          wins: tally.get(e.club_member_id)?.w ?? 0, losses: tally.get(e.club_member_id)?.l ?? 0,
        })),
      };
    },
  },
  {
    name: "tournament_fixtures",
    description: "Matches in one tournament with players, date/time, court, status and score. Optionally only one player's matches and/or only unplayed ones.",
    parameters: { type: "object", properties: { tournament_id: { type: "string" }, player_name: { type: ["string", "null"] }, only_unplayed: { type: "boolean" } }, required: ["tournament_id", "player_name", "only_unplayed"], additionalProperties: false },
    async run(c, a) {
      const { data: t } = await c.admin.from("tournaments").select("id,name,club_id,participating_club_ids").eq("id", s(a?.tournament_id)).maybeSingle();
      if (!t) return { error: "Tournament not found." };
      if (!(await canSeeTournament(c, t as any))) return { error: "You don't have access to this tournament." };
      const { data } = await c.admin.from("club_champs_matches").select(MATCH_COLS).eq("champ_id", t.id).order("scheduled_date").order("scheduled_time").limit(1000);
      let rows = ((data ?? []) as any[]).filter((m) => !m.is_bye && (!a?.only_unplayed || !played(m)));
      let described = await describeMatches(c, rows, c.myMemberIds);
      if (s(a?.player_name)) {
        const needle = s(a.player_name).toLowerCase();
        described = described.filter((m) => m.side_a.toLowerCase().includes(needle) || m.side_b.toLowerCase().includes(needle));
      }
      return { tournament: t.name, count: described.length, matches: described.slice(0, 40) };
    },
  },
  {
    name: "my_bookings",
    description: "The signed-in user's upcoming court bookings at the current club.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async run(c) {
      const { data, error } = await c.admin.from("bookings").select("id,date,start_time,end_time,status,courts(name)")
        .eq("club_id", c.clubId).eq("user_id", c.userId).gte("date", c.today).neq("status", "cancelled").order("date").order("start_time").limit(20);
      if (error) return { error: "Could not read bookings: " + error.message };
      return { bookings: (data ?? []).map((b: any) => ({ date: b.date, start: hhmm(b.start_time), end: hhmm(b.end_time), court: b.courts?.name, status: b.status })) };
    },
  },
  {
    name: "club_ladder",
    description: "The current club's ladder positions (top N), and the user's own position.",
    parameters: { type: "object", properties: { top: { type: ["integer", "null"] } }, required: ["top"], additionalProperties: false },
    async run(c, a) {
      const { data, error } = await c.admin.from("club_members").select("id,name,ladder_position,gender").eq("club_id", c.clubId).not("ladder_position", "is", null).order("ladder_position").limit(Math.min(Number(a?.top) || 20, 50));
      if (error) return { error: "Could not read the ladder: " + error.message };
      const { data: me } = c.memberId ? await c.admin.from("club_members").select("ladder_position").eq("id", c.memberId).maybeSingle() : { data: null };
      return { ladder: (data ?? []).map((m: any) => ({ position: m.ladder_position, name: m.name, gender: m.gender })), my_position: (me as any)?.ladder_position ?? null };
    },
  },
];
