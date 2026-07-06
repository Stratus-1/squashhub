// Dynamic court reflow: when a fixture/match completes early, move the
// earliest queued sibling on the same day into the freed cell.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ReqBody = {
  fixture_id?: string;         // league fixture that just ended
  tournament_match_id?: string; // tournament match that just ended
  club_id?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as ReqBody;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Resolve freed slot from the source
    let freedCourtId: number | null = null;
    let freedDate: string | null = null;
    let freedStart: string | null = null;
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
      freedStart = String((f as any).start_time ?? "").slice(0, 5);
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
      freedStart = String((m as any).start_time ?? "").slice(0, 5);
      tournamentId = (m as any).tournament_id;
      if (!clubId) clubId = (m as any).club_id;
    } else {
      return json({ error: "fixture_id or tournament_match_id required" }, 400);
    }

    if (!freedCourtId || !freedDate || !freedStart) {
      return json({ skipped: "incomplete_source_slot" });
    }

    // Kill-switch check
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

    const nowHHMM = new Date().toISOString().slice(11, 16);
    const cutoff = freedStart > nowHHMM ? freedStart : nowHHMM;

    // Find the earliest queued sibling on the same day, later than the freed
    // slot, that hasn't started yet. Prefer siblings in the same round/tournament.
    let candidate: any = null;
    if (roundId) {
      const { data } = await admin
        .from("platform_league_fixtures")
        .select("id, court_id, fixture_date, start_time, round_id, home_team_code, away_team_code")
        .eq("fixture_date", freedDate)
        .eq("round_id", roundId)
        .gt("start_time", cutoff)
        .neq("id", sourceId)
        .order("start_time", { ascending: true })
        .limit(5);
      // exclude anything already being marked live
      const ids = (data || []).map((r: any) => r.id);
      const locks = ids.length
        ? (await admin
            .from("league_marker_locks")
            .select("fixture_id, heartbeat_at")
            .in("fixture_id", ids)).data || []
        : [];
      const stale = new Set(
        (locks as any[])
          .filter((l) => Date.now() - new Date(l.heartbeat_at).getTime() < 60_000)
          .map((l) => l.fixture_id),
      );
      candidate = (data || []).find((r: any) => !stale.has(r.id)) ?? null;
    } else if (tournamentId) {
      const { data } = await admin
        .from("club_champs_matches")
        .select("id, court_id, match_date, start_time, tournament_id, status")
        .eq("match_date", freedDate)
        .eq("tournament_id", tournamentId)
        .gt("start_time", cutoff)
        .neq("id", sourceId)
        .in("status", ["scheduled", "pending", "ready"])
        .order("start_time", { ascending: true })
        .limit(1);
      candidate = (data || [])[0] ?? null;
    }

    if (!candidate) return json({ skipped: "no_candidate" });

    const from_start = String(candidate.start_time ?? "").slice(0, 5);
    const from_court = candidate.court_id;

    if (roundId) {
      await admin
        .from("platform_league_fixtures")
        .update({ court_id: freedCourtId, start_time: freedStart })
        .eq("id", candidate.id);
    } else {
      await admin
        .from("club_champs_matches")
        .update({ court_id: freedCourtId, start_time: freedStart })
        .eq("id", candidate.id);
    }

    await admin.from("court_reflow_log").insert({
      club_id: clubId,
      source_kind: sourceKind,
      source_id: sourceId,
      moved_kind: roundId ? "league_fixture" : "tournament_match",
      moved_id: candidate.id,
      from_court_id: from_court,
      to_court_id: freedCourtId,
      from_start_time: from_start,
      to_start_time: freedStart,
      fixture_date: freedDate,
      reason: "auto_reflow_on_completion",
    });

    return json({
      moved: candidate.id,
      to_court_id: freedCourtId,
      to_start_time: freedStart,
    });
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
