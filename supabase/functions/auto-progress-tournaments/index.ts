// Scheduled server-side stage progression for structured tournaments.
// Starts knockout/play-off stages that are READY and set to start automatically, then books
// their games into the stage's planned court sessions. Same engine as the admin page
// (bundled in engine.js), idempotent: started stages are never started twice, ties/missing
// results are held. Never sends notifications.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { atomically, autoProgress, schedulePlannedPlayoffGames } from "./engine.js";

// Staged rollout: Riverside first. Use ["*"] for all clubs.
const ROLLOUT_CLUBS: string[] = ["11111111-1111-1111-1111-111111111111"];

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== key && token !== anon) return json({ error: "Not allowed" }, 401);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  (globalThis as any).__shServerClient = sb;
  const db = {
    async insert(table: string, rows: any[]) { const { data, error } = await sb.from(table).insert(rows).select("*"); if (error) throw new Error(`${table}: ${error.message}`); return data ?? []; },
    async select(table: string, filter: Record<string, unknown>) { let q: any = sb.from(table).select("*"); for (const [k, v] of Object.entries(filter)) q = q.eq(k, v); const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`); return data ?? []; },
    async update(table: string, filter: Record<string, unknown>, patch: any) { let q: any = sb.from(table).update(patch); for (const [k, v] of Object.entries(filter)) q = q.eq(k, v); const { error } = await q; if (error) throw new Error(`${table}: ${error.message}`); },
  };
  const commit = async (tid: string, ops: unknown[]) => { const { data, error } = await sb.rpc("structured_commit", { p_tid: tid, p_ops: ops }); if (error) throw new Error(error.message); return data; };

  let q = sb.from("tournaments").select("id, club_id, name, status").eq("builder_architecture", "structured").not("status", "in", "(completed,cancelled,archived,draft)");
  if (!ROLLOUT_CLUBS.includes("*")) q = q.in("club_id", ROLLOUT_CLUBS);
  const { data: ts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const t of ts ?? []) {
    try {
      const exec = (fn: any) => atomically(db as any, t.id, commit, fn);
      const r = await autoProgress(db as any, t.id, exec);
      let booked = 0, unplaced = 0;
      if (r.started.length) { const s = await schedulePlannedPlayoffGames(t.id); booked = s.booked; unplaced = s.unplaced.length; }
      results.push({ id: t.id, started: r.started.map((s: any) => s.name), blocked: r.blocked.length, booked, unplaced });
    } catch (e) {
      results.push({ id: t.id, error: (e as Error).message });
    }
  }
  console.log(JSON.stringify({ checked: results.length, results }));
  return json({ checked: results.length, results });
});
