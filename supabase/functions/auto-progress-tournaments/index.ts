// Scheduled server-side stage progression for structured tournaments.
// Starts knockout/play-off stages that are READY and set to start automatically, then books
// their games into the stage's planned court sessions. Same engine as the admin page
// (bundled in engine.js), idempotent: started stages are never started twice, ties/missing
// results are held. Never sends notifications.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { atomically, autoProgress, createDecidedSwissGames, schedulePlannedPlayoffGames } from "./engine.js";
import { MYBURG_TOURNAMENT, MYBURG_FEEDERS, myburgFinalPlacements } from "../_shared/myburg-final-handover.ts";

// Staged rollout: Riverside first. Use ["*"] for all clubs.
const ROLLOUT_CLUBS: string[] = ["*"];

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let body: { tid?: string; action?: string } = {};
  try { body = await req.json(); } catch { /* scheduled request */ }
  const handover = async (tid: string) => {
    if (tid !== MYBURG_TOURNAMENT) return [];
    const ids = [...new Set(MYBURG_FEEDERS.flatMap(([source, final]) => [source, final]))];
    const { data: rows, error } = await sb.from("club_champs_matches").select("*").eq("champ_id", tid).in("id", ids);
    if (error) throw error;
    const placed = [];
    for (const p of myburgFinalPlacements(rows ?? [])) {
      const field = `player_${p.side}_member_id`;
      const { data, error: writeError } = await sb.from("club_champs_matches")
        .update({ [field]: p.winner }).eq("id", p.finalId).eq("champ_id", tid)
        .eq("status", "scheduled").is(field, null).is("winner_member_id", null)
        .is("score", null).is("game_scores", null).eq(`placeholder_${p.side}`, p.placeholder)
        .select("id");
      if (writeError) throw writeError;
      if (data?.length) placed.push(p);
    }
    return placed;
  };
  if (body.action === "handover") {
    if (body.tid !== MYBURG_TOURNAMENT) return json({ error: "Not allowed" }, 403);
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: identity } = await userClient.auth.getUser();
    if (!identity.user) return json({ error: "Sign in required" }, 401);
    const { data: allowed, error } = await userClient.rpc("can_manage_tournament", { _tournament_id: body.tid });
    if (error || !allowed) return json({ error: "Not allowed" }, 403);
    try { return json({ placed: await handover(body.tid) }); }
    catch (e) { return json({ error: (e as Error).message }, 500); }
  }
  const { data: sec } = await sb.from("app_settings").select("value").eq("key", "auto_progress_private_secret").maybeSingle();
  const given = req.headers.get("x-internal-secret") ?? "";
  if (!sec?.value || given !== String(sec.value)) return json({ error: "Not allowed" }, 401);
  (globalThis as any).__shServerClient = sb;
  const db = {
    async insert(table: string, rows: any[]) { const { data, error } = await sb.from(table).insert(rows).select("*"); if (error) throw new Error(`${table}: ${error.message}`); return data ?? []; },
    async select(table: string, filter: Record<string, unknown>) { let q: any = sb.from(table).select("*"); for (const [k, v] of Object.entries(filter)) q = q.eq(k, v); const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`); return data ?? []; },
    async update(table: string, filter: Record<string, unknown>, patch: any) { let q: any = sb.from(table).update(patch); for (const [k, v] of Object.entries(filter)) q = q.eq(k, v); const { error } = await q; if (error) throw new Error(`${table}: ${error.message}`); },
  };
  const commit = async (tid: string, ops: unknown[]) => { const { data, error } = await sb.rpc("structured_commit", { p_tid: tid, p_ops: ops }); if (error) throw new Error(error.message); return data; };

  let only: string | null = null;
  if (typeof body.tid === "string" && /^[0-9a-f-]{36}$/i.test(body.tid)) only = body.tid;
  let q = sb.from("tournaments").select("id, club_id, name, status").eq("builder_architecture", "structured").not("status", "in", "(completed,cancelled,archived,draft)");
  if (only) q = q.eq("id", only);
  if (!ROLLOUT_CLUBS.includes("*")) q = q.in("club_id", ROLLOUT_CLUBS);
  const { data: ts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const t of ts ?? []) {
    try {
      const finals = await handover(t.id);
      const exec = (fn: any) => atomically(db as any, t.id, commit, fn);
      const r = await autoProgress(db as any, t.id, exec);
      let booked = 0, unplaced = 0;
      if (r.started.length) { const s = await schedulePlannedPlayoffGames(t.id); booked = s.booked; unplaced = s.unplaced.length; }
      // Swiss: each next-round game becomes a real fixture + court booking once both players are decided.
      let swiss: any = null;
      try { swiss = await createDecidedSwissGames(t.id); } catch (e) { swiss = { error: (e as Error).message }; }
      results.push({ id: t.id, finals, started: r.started.map((s: any) => s.name), blocked: r.blocked.length, booked, unplaced, swiss });
    } catch (e) {
      results.push({ id: t.id, error: (e as Error).message });
    }
  }
  console.log(JSON.stringify({ checked: results.length, results }));
  return json({ checked: results.length, results });
});
