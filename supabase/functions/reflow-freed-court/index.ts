// Dynamic court reflow: when a fixture/match completes early (or on time),
// move the earliest queued sibling on the same day forward into the freed
// cell. After moving, recurse on the vacated cell so a chain of pull-ups
// cascades down the schedule.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ReqBody = {
  fixture_id?: string;
  tournament_match_id?: string;
  club_id?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const nowHHMM = () => new Date().toISOString().slice(11, 16);
const hhmm = (v: unknown) => String(v ?? "").slice(0, 5);

type Freed = {
  court_id: number;
  date: string;
  start: string;          // earliest time the court can be reused
  round_id?: string | null;
  tournament_id?: string | null;
  club_id?: string | null;
  source_kind: string;
  source_id: string;
};

async function findCandidate(freed: Freed) {
  const cutoff = freed.start; // we want anything scheduled strictly later
  if (freed.round_id) {
    const { data } = await admin
      .from("platform_league_fixtures")
      .select("id, court_id, fixture_date, start_time, round_id, home_team_code, away_team_code")
      .eq("fixture_date", freed.date)
      .eq("round_id", freed.round_id)
      .gt("start_time", cutoff)
      .neq("id", freed.source_id)
      .order("start_time", { ascending: true })
      .limit(10);
    const ids = (data || []).map((r: any) => r.id);
    const locks = ids.length
      ? (await admin
          .from("league_marker_locks")
          .select("fixture_id, heartbeat_at")
          .in("fixture_id", ids)).data || []
      : [];
    const live = new Set(
      (locks as any[])
        .filter((l) => Date.now() - new Date(l.heartbeat_at).getTime() < 60_000)
        .map((l) => l.fixture_id),
    );
    return (data || []).find((r: any) => !live.has(r.id)) ?? null;
  }
  if (freed.tournament_id) {
    const { data } = await admin
      .from("club_champs_matches")
      .select("id, court_id, match_date, start_time, tournament_id, status")
      .eq("match_date", freed.date)
      .eq("tournament_id", freed.tournament_id)
      .gt("start_time", cutoff)
      .neq("id", freed.source_id)
      .in("status", ["scheduled", "pending", "ready"])
      .order("start_time", { ascending: true })
      .limit(1);
    return (data || [])[0] ?? null;
  }
  return null;
}

async function reflowCell(freed: Freed, depth: number, moved: any[]): Promise<void> {
  if (depth > 6) return; // safety
  const candidate = await findCandidate(freed);
  if (!candidate) return;

  const fromStart = hhmm(candidate.start_time);
  const fromCourt = candidate.court_id as number;
  const toStart = freed.start;
  const toCourt = freed.court_id;

  // No-op if we would push the match later or leave it in place.
  if (fromStart <= toStart && fromCourt === toCourt) return;

  const table = freed.round_id ? "platform_league_fixtures" : "club_champs_matches";
  await admin.from(table).update({ court_id: toCourt, start_time: toStart }).eq("id", candidate.id);

  await admin.from("court_reflow_log").insert({
    club_id: freed.club_id ?? null,
    source_kind: freed.source_kind,
    source_id: freed.source_id,
    moved_kind: freed.round_id ? "league_fixture" : "tournament_match",
    moved_id: candidate.id,
    from_court_id: fromCourt,
    to_court_id: toCourt,
    from_start_time: fromStart,
    to_start_time: toStart,
    fixture_date: freed.date,
    reason: depth === 0 ? "auto_reflow_on_completion" : "auto_reflow_cascade",
  });

  moved.push({ id: candidate.id, from: { court: fromCourt, start: fromStart }, to: { court: toCourt, start: toStart } });

  // Cascade: the candidate's original cell is now free. Recurse against it,
  // treating the moved match as the "source" so the chain keeps walking down.
  await reflowCell(
    {
      court_id: fromCourt,
      date: freed.date,
      start: fromStart,
      round_id: freed.round_id,
      tournament_id: freed.tournament_id,
      club_id: freed.club_id,
      source_kind: freed.round_id ? "league_fixture" : "tournament_match",
      source_id: candidate.id,
    },
    depth + 1,
    moved,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as ReqBody;

    let freedCourtId: number | null = null;
    let freedDate: string | null = null;
    let sourceStart: string | null = null;
    let sourceKind = "";
    let sourceId = "";
    let clubId: string | null = body.club_id ?? null;
    let roundId: string | null = null;
    let tournamentId: string | null = null;

    if (body.fixture_id) {
      sourceKind = "league_fixture";
      sourceId = body.fixture_id;
      const { data: f } = await admin
        .from("platform_league_fixtures")
        .select("id, court_id, fixture_date, start_time, round_id")
        .eq("id", body.fixture_id)
        .maybeSingle();
      if (!f) return json({ skipped: "fixture_not_found" });
      freedCourtId = (f as any).court_id;
      freedDate = (f as any).fixture_date;
      sourceStart = hhmm((f as any).start_time);
      roundId = (f as any).round_id;
    } else if (body.tournament_match_id) {
      sourceKind = "tournament_match";
      sourceId = body.tournament_match_id;
      const { data: m } = await admin
        .from("club_champs_matches")
        .select("id, court_id, match_date, start_time, tournament_id, club_id")
        .eq("id", body.tournament_match_id)
        .maybeSingle();
      if (!m) return json({ skipped: "match_not_found" });
      freedCourtId = (m as any).court_id;
      freedDate = (m as any).match_date;
      sourceStart = hhmm((m as any).start_time);
      tournamentId = (m as any).tournament_id;
      if (!clubId) clubId = (m as any).club_id;
    } else {
      return json({ error: "fixture_id or tournament_match_id required" }, 400);
    }

    if (!freedCourtId || !freedDate || !sourceStart) {
      return json({ skipped: "incomplete_source_slot" });
    }

    if (clubId) {
      const { data: club } = await admin
        .from("clubs")
        .select("dynamic_court_reflow_enabled")
        .eq("id", clubId)
        .maybeSingle();
      if (club && (club as any).dynamic_court_reflow_enabled === false) {
        return json({ skipped: "disabled_for_club" });
      }
    }

    // The court is free NOW. Use the later of now vs the original slot start
    // so we never schedule anything in the past, but we DO pull matches
    // earlier than their originally-planned time when the court freed up
    // ahead of schedule.
    const now = nowHHMM();
    const freedStart = sourceStart > now ? sourceStart : now;

    const moved: any[] = [];
    await reflowCell(
      {
        court_id: freedCourtId,
        date: freedDate,
        start: freedStart,
        round_id: roundId,
        tournament_id: tournamentId,
        club_id: clubId,
        source_kind: sourceKind,
        source_id: sourceId,
      },
      0,
      moved,
    );

    if (!moved.length) return json({ skipped: "no_candidate" });
    return json({ moved });
  } catch (e) {
    console.error("reflow-freed-court error:", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
