// Sends weekly league availability prompts to roster players + reminders to captains.
// Triggered by pg_cron every Tuesday 18:00 SAST. Can also be invoked manually for testing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Require an internal secret OR the service-role bearer token.
  const internalSecret =
    Deno.env.get("NOTIFY_INTERNAL_SECRET") || Deno.env.get("PUSH_INTERNAL_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headerSecret = req.headers.get("x-internal-secret") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const authorized =
    (internalSecret && headerSecret === internalSecret) || bearer === serviceRole;
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(SUPABASE_URL, serviceRole);

  try {
    // Compute the upcoming week_start_date for each club based on its league_week_start_dow.
    // Tuesday 18:00 SAST -> the next league week (typically Wednesday) is the day after.
    const { data: clubs, error: clubsErr } = await supabase
      .from("clubs")
      .select("id, name, league_week_start_dow");
    if (clubsErr) throw clubsErr;

    let totalPlayerNotifs = 0;
    let totalCaptainNotifs = 0;

    for (const club of clubs ?? []) {
      const dow = (club as any).league_week_start_dow ?? 3;
      // Compute next week_start: today + ((dow - todayDow + 7) % 7); if 0, use +7 (next week, not today).
      const today = new Date();
      const todayDow = today.getUTCDay();
      let diff = (dow - todayDow + 7) % 7;
      if (diff === 0) diff = 7;
      const weekStart = new Date(today);
      weekStart.setUTCDate(today.getUTCDate() + diff);
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      // Fetch club's leagues
      const { data: leagues } = await supabase
        .from("leagues")
        .select("id, name, captain_member_id")
        .eq("club_id", club.id);

      const leagueIds = (leagues ?? []).map((l) => l.id);
      if (leagueIds.length === 0) continue;

      // Fetch unique roster member IDs
      const { data: regs } = await supabase
        .from("member_league_registrations")
        .select("club_member_id, league_id")
        .in("league_id", leagueIds);

      const memberToLeagues = new Map<string, Set<string>>();
      for (const r of regs ?? []) {
        if (!memberToLeagues.has(r.club_member_id)) memberToLeagues.set(r.club_member_id, new Set());
        memberToLeagues.get(r.club_member_id)!.add(r.league_id);
      }

      const memberIds = Array.from(memberToLeagues.keys());
      if (memberIds.length === 0) continue;

      // Get user_id mapping (some shared accounts have null user_id)
      const { data: members } = await supabase
        .from("club_members")
        .select("id, user_id, name")
        .in("id", memberIds);

      // Build notifications for players (skip duplicates already sent for this week)
      const { data: existing } = await supabase
        .from("notifications")
        .select("club_member_id")
        .eq("type", "league_availability")
        .filter("data->>week_start_date", "eq", weekStartStr)
        .in("club_member_id", memberIds);

      const alreadyNotified = new Set((existing ?? []).map((n: any) => n.club_member_id));

      const playerRows = (members ?? [])
        .filter((m) => !alreadyNotified.has(m.id))
        .map((m) => ({
          user_id: m.user_id,
          club_member_id: m.id,
          title: "Are you available next week?",
          message: `Squash week starts ${weekStartStr}. Tap Available or Not Available so your captain can fill the team.`,
          type: "league_availability",
          url: "/league-games",
          data: {
            week_start_date: weekStartStr,
            club_id: club.id,
            club_member_id: m.id,
          },
        }));

      console.log(`[${club.name}] week=${weekStartStr} roster=${memberIds.length} alreadyNotified=${alreadyNotified.size} toInsert=${playerRows.length}`);
      if (playerRows.length > 0) {
        const { error: insErr, data: insData } = await supabase.from("notifications").insert(playerRows).select("id");
        if (insErr) console.error("player notif insert failed", insErr);
        else totalPlayerNotifs += (insData?.length || 0);
      }

      // Captain reminders — one per captain
      const captainIds = Array.from(
        new Set((leagues ?? []).map((l: any) => l.captain_member_id).filter(Boolean)),
      );
      if (captainIds.length > 0) {
        const { data: caps } = await supabase
          .from("club_members")
          .select("id, user_id")
          .in("id", captainIds);

        const { data: capExisting } = await supabase
          .from("notifications")
          .select("club_member_id")
          .eq("type", "captain_fillup_reminder")
          .filter("data->>week_start_date", "eq", weekStartStr)
          .in("club_member_id", captainIds);
        const capDone = new Set((capExisting ?? []).map((n: any) => n.club_member_id));

        const capRows = (caps ?? [])
          .filter((c) => !capDone.has(c.id))
          .map((c) => ({
            user_id: c.user_id,
            club_member_id: c.id,
            title: "Fill your league team for next week",
            message: `Squash week starts ${weekStartStr}. Open the Fill-up Leagues tab to confirm your line-up.`,
            type: "captain_fillup_reminder",
            url: "/league-games",
            data: { week_start_date: weekStartStr, club_id: club.id },
          }));

        if (capRows.length > 0) {
          const { error } = await supabase.from("notifications").insert(capRows);
          if (error) console.error("captain notif insert failed", error);
          else totalCaptainNotifs += capRows.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        player_notifications_sent: totalPlayerNotifs,
        captain_notifications_sent: totalCaptainNotifs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notify-league-week-kickoff error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
