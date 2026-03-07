import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function isoDateInTz(date: Date, timeZone: string) {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function weekdayInTz(date: Date, timeZone: string) {
  // en-US yields "Mon", "Tue", ...
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function logOnce(args: { user_id: string; kind: string; ref_table: string; ref_id: string | null; scheduled_for: string }) {
  const { error } = await supabaseAdmin.from("reminder_log").insert({
    user_id: args.user_id,
    kind: args.kind,
    ref_table: args.ref_table,
    ref_id: args.ref_id,
    scheduled_for: args.scheduled_for,
  } as any);

  if (!error) return true;
  if ((error as any)?.code === "23505") return false; // already sent
  throw error;
}

async function sendReminder(args: {
  user_id: string;
  kind: string;
  ref_table: string;
  ref_id: string | null;
  scheduled_for: string;
  title: string;
  message: string;
  url: string;
  data?: Record<string, unknown>;
}) {
  const ok = await logOnce({
    user_id: args.user_id,
    kind: args.kind,
    ref_table: args.ref_table,
    ref_id: args.ref_id,
    scheduled_for: args.scheduled_for,
  });
  if (!ok) return false;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: args.user_id,
    title: args.title,
    message: args.message,
    type: "reminder",
    url: args.url,
    data: { kind: args.kind, ref_table: args.ref_table, ref_id: args.ref_id, ...(args.data || {}) },
  } as any);
  if (error) throw error;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  const secret = req.headers.get("x-internal-secret") || "";
  const expected = Deno.env.get("REMINDERS_INTERNAL_SECRET") || "";
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const timeZone = Deno.env.get("REMINDERS_TIMEZONE") || "Africa/Johannesburg";
    const now = new Date();
    const today = isoDateInTz(now, timeZone);
    const tomorrow = isoDateInTz(addDays(now, 1), timeZone);
    const isWeeklyRun = weekdayInTz(now, timeZone) === "Mon";

    let sent = 0;
    let skipped = 0;

    // 1) Booking reminders (tomorrow)
    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id,user_id,opponent_id,date,start_time,end_time,court_id,status")
      .eq("status", "active")
      .eq("date", tomorrow)
      .limit(500);

    for (const b of bookings || []) {
      const start = String((b as any).start_time || "").slice(0, 5);
      const end = String((b as any).end_time || "").slice(0, 5);
      const title = "Court booking tomorrow";
      const message = `Court ${(b as any).court_id} · ${tomorrow} ${start}-${end}`;
      const url = "/bookings";
      const recipients = [String((b as any).user_id), (b as any).opponent_id ? String((b as any).opponent_id) : null].filter(Boolean) as string[];
      for (const uid of recipients) {
        const ok = await sendReminder({
          user_id: uid,
          kind: "booking_tomorrow",
          ref_table: "bookings",
          ref_id: String((b as any).id),
          scheduled_for: today,
          title,
          message,
          url,
          data: { booking_id: String((b as any).id), date: tomorrow },
        });
        if (ok) sent += 1;
        else skipped += 1;
      }
    }

    // 2) Challenge schedules (tomorrow, accepted)
    const { data: schedules } = await supabaseAdmin
      .from("challenge_schedules")
      .select("id,challenge_id,proposed_date,start_time,end_time,court_id,status")
      .eq("status", "accepted")
      .eq("proposed_date", tomorrow)
      .limit(500);

    const challengeIds = [...new Set((schedules || []).map((s: any) => String(s.challenge_id)))];
    const { data: challenges } = challengeIds.length
      ? await supabaseAdmin.from("challenges").select("id,challenger_id,opponent_id").in("id", challengeIds)
      : { data: [] as any[] };
    const challengeMap = new Map((challenges || []).map((c: any) => [String(c.id), c]));

    for (const s of schedules || []) {
      const c = challengeMap.get(String((s as any).challenge_id));
      if (!c) continue;
      const start = String((s as any).start_time || "").slice(0, 5);
      const end = String((s as any).end_time || "").slice(0, 5);
      const title = "Match scheduled tomorrow";
      const message = `Scheduled ${tomorrow} ${start}-${end}${(s as any).court_id ? ` · Court ${(s as any).court_id}` : ""}`;
      const url = "/challenges";
      const recipients = [String(c.challenger_id), String(c.opponent_id)];
      for (const uid of recipients) {
        const ok = await sendReminder({
          user_id: uid,
          kind: "challenge_schedule_tomorrow",
          ref_table: "challenge_schedules",
          ref_id: String((s as any).id),
          scheduled_for: today,
          title,
          message,
          url,
          data: { challenge_id: String(c.id), schedule_id: String((s as any).id) },
        });
        if (ok) sent += 1;
        else skipped += 1;
      }
    }

    // 3) Challenge expiring soon (next 24h)
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: expiring } = await supabaseAdmin
      .from("challenges")
      .select("id,challenger_id,opponent_id,expires_at,status")
      .in("status", ["pending", "accepted"] as any)
      .gte("expires_at", new Date().toISOString())
      .lt("expires_at", soon)
      .limit(500);

    for (const c of expiring || []) {
      const title = "Challenge expiring soon";
      const message = "Your challenge will expire in less than 24 hours. Propose a time or play your match.";
      const url = "/challenges";
      const recipients = [String((c as any).challenger_id), String((c as any).opponent_id)];
      for (const uid of recipients) {
        const ok = await sendReminder({
          user_id: uid,
          kind: "challenge_expiring",
          ref_table: "challenges",
          ref_id: String((c as any).id),
          scheduled_for: today,
          title,
          message,
          url,
          data: { challenge_id: String((c as any).id) },
        });
        if (ok) sent += 1;
        else skipped += 1;
      }
    }

    // 4) Inactivity nudge (3 weeks). Only run weekly (Monday in REMINDERS_TIMEZONE) to keep load low.
    if (!isWeeklyRun) {
      return new Response(JSON.stringify({ ok: true, sent, skipped, today, tomorrow, isWeeklyRun }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inactiveProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id,name,rank,last_competitive_match_at,created_at")
      .not("rank", "is", null)
      .lt("created_at", cutoff)
      .or(`last_competitive_match_at.is.null,last_competitive_match_at.lt.${cutoff}`)
      .limit(500);

    for (const p of inactiveProfiles || []) {
      // Skip if we already nudged within the last 7 days.
      const sevenDaysAgo = isoDateInTz(addDays(now, -7), timeZone);
      const { data: already } = await supabaseAdmin
        .from("reminder_log")
        .select("id")
        .eq("user_id", String((p as any).id))
        .eq("kind", "inactive_nudge")
        .gte("scheduled_for", sevenDaysAgo)
        .limit(1);
      if (already && already.length > 0) {
        skipped += 1;
        continue;
      }

      const title = "Time for a squash game?";
      const message = "You haven’t played in a while. Book a court or send a challenge to climb the ladder.";
      const url = "/bookings";
      const ok = await sendReminder({
        user_id: String((p as any).id),
        kind: "inactive_nudge",
        ref_table: "profiles",
        ref_id: String((p as any).id),
        scheduled_for: today,
        title,
        message,
        url,
      });
      if (ok) sent += 1;
      else skipped += 1;
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, today, tomorrow, isWeeklyRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Reminders error:", error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
