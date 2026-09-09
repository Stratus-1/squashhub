// SportyHQ historical result import.
//
// Pulls a club member's public SportyHQ result history and maps it into the
// normal SquashHub `matches` structure. Idempotent: every SportyHQ result id is
// registered in `external_ids`, so re-running never duplicates a match.
//
// POST body:
//   { club_id: uuid, limit?: number, cursor?: string, dry_run?: boolean }
// Returns progress so the caller can page through the club roster.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BASE = "https://www.sportyhq.com";
const SOURCE = "sportyhq";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ParsedResult {
  result_id: string;
  played_on: string; // yyyy-mm-dd
  opponent_name: string;
  opponent_user_id: number | null;
  opponent_slug: string | null;
  score: string;
  won: boolean;
  type_label: string;
  format_label: string | null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseResults(html: string): ParsedResult[] {
  const out: ParsedResult[] = [];
  const chunks = html.split(/(?=<tr class="result-row)/g).slice(1);
  for (const chunk of chunks) {
    const row = chunk.split("</tr>")[0];
    const idMatch = row.match(/data-result_id="(\d+)"/);
    if (!idMatch) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 5) continue;

    const typeLabel = row.match(/<i title="([^"]+)"/)?.[1] ?? "Match";
    const playedOn = parseDate(stripTags(cells[1] ?? ""));
    if (!playedOn) continue;

    const opponentCell = cells[2] ?? "";
    const opponentName =
      stripTags(opponentCell.match(/<a href="[^"]*\/ranking\/user\/[^"]*">([\s\S]*?)<\/a>/)?.[1] ?? "");
    const opponentUserId = Number(opponentCell.match(/\/user\/photo\/(\d+)\//)?.[1] ?? 0) || null;
    // Most rows show a default avatar, so also keep the profile slug for linking.
    const opponentSlug = (opponentCell.match(/\/ranking\/user\/([^"/?]+)/)?.[1] ?? "").toLowerCase() || null;

    const formatLabel = stripTags(cells[3] ?? "") || null;
    const scoreCell = stripTags(cells[4] ?? "");
    const score = scoreCell.match(/\d+\s*-\s*\d+/)?.[0]?.replace(/\s+/g, "") ?? "";

    // The leading cell's own tag carries the win/loss colour for the profile owner.
    const firstCellTag = row.match(/<td\b[^>]*>/)?.[0] ?? "";
    const won = /table-success/.test(firstCellTag);
    const lost = /table-danger/.test(firstCellTag);
    if (!won && !lost) continue; // retired / unresolved rows
    if (!opponentName) continue;

    out.push({
      result_id: idMatch[1],
      played_on: playedOn,
      opponent_name: opponentName,
      opponent_user_id: opponentUserId,
      opponent_slug: opponentSlug,
      score,
      won,
      type_label: typeLabel,
      format_label: formatLabel,
    });
  }
  return out;
}

function levelFor(typeLabel: string): string {
  const t = typeLabel.toLowerCase();
  if (t.includes("league")) return "league";
  if (t.includes("tournament")) return "regional";
  return "club"; // challenge, friendly, box, ladder
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const clubId = String(body.club_id ?? "");
  if (!clubId) return json({ error: "club_id required" }, 400);

  // --- Authorisation: service role, platform admin, or an admin of this club.
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const maintenanceSecret = Deno.env.get("HISTORY_IMPORT_ADMIN_SECRET") ?? "";
  const maintenanceHeader = req.headers.get("x-import-secret") ?? "";
  const isMaintenance = maintenanceSecret.length > 0 && maintenanceHeader === maintenanceSecret;
  const isServiceRole = isMaintenance || bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceRole) {
    const { data: userData } = await supabase.auth.getUser(bearer);
    const uid = userData?.user?.id ?? null;
    if (!uid) return json({ error: "Not signed in" }, 401);
    const { data: isPlatformAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isPlatformAdmin) {
      const { data: adminRow } = await supabase
        .from("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRow) return json({ error: "Club admin only" }, 403);
    }
  }

  // --- Gate: historical import needs the club to be onboarded (SLA accepted)
  // or explicitly enabled (the CSIR validation exception).
  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, history_import_enabled, sla_accepted_at")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return json({ error: "Club not found" }, 404);
  if (!club.history_import_enabled && !club.sla_accepted_at) {
    return json({ error: "Historical import is not enabled for this club" }, 403);
  }

  const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 30);
  const cursor = body.cursor ? String(body.cursor) : null;
  const dryRun = body.dry_run === true;

  // Members of this club that have a linked SportyHQ profile.
  let q = supabase
    .from("sportyhq_profiles")
    .select("sportyhq_user_id, club_member_id, club_members!inner(id, club_id, name)")
    .eq("club_members.club_id", clubId)
    .not("club_member_id", "is", null)
    .order("sportyhq_user_id", { ascending: true })
    .limit(limit);
  if (cursor) q = q.gt("sportyhq_user_id", Number(cursor));
  const { data: profiles, error: profErr } = await q;
  if (profErr) return json({ error: profErr.message }, 500);
  if (!profiles?.length) {
    await supabase.from("clubs").update({ history_imported_at: new Date().toISOString() }).eq("id", clubId);
    return json({ done: true, processed: 0, imported: 0, next_cursor: null });
  }

  // Map every SportyHQ id and profile slug in this club so both sides can link.
  const { data: allProfiles } = await supabase
    .from("sportyhq_profiles")
    .select("sportyhq_user_id, profile_path, club_member_id, club_members!inner(club_id)")
    .eq("club_members.club_id", clubId)
    .not("club_member_id", "is", null);
  const memberByShqId = new Map<number, string>();
  const memberBySlug = new Map<string, string>();
  for (const p of allProfiles ?? []) {
    if (!p.club_member_id) continue;
    if (p.sportyhq_user_id) memberByShqId.set(Number(p.sportyhq_user_id), p.club_member_id);
    const slug = String(p.profile_path ?? "").toLowerCase().match(/\/ranking\/user\/([^/?]+)/)?.[1];
    if (slug) memberBySlug.set(slug, p.club_member_id);
  }

  let imported = 0;
  let skipped = 0;
  let scanned = 0;
  let lastCursor: string | null = null;
  const errors: string[] = [];

  for (const prof of profiles) {
    const shqId = Number(prof.sportyhq_user_id);
    lastCursor = String(shqId);
    const memberId = prof.club_member_id as string;
    if (!shqId || !memberId) continue;

    const html = await fetchHtml(`${BASE}/ranking/results/${shqId}/squash/1000/`);
    if (!html) {
      errors.push(`fetch failed for ${shqId}`);
      continue;
    }
    const rows = parseResults(html);
    scanned += rows.length;
    if (rows.length === 0) {
      errors.push(`no rows for ${shqId} (html ${html.length}, markers ${(html.match(/result-row/g) ?? []).length})`);
    }

    for (const r of rows) {
      const externalId = `result:${r.result_id}`;
      const { data: existing } = await supabase
        .from("external_ids")
        .select("entity_id")
        .eq("source_system", SOURCE)
        .eq("entity_type", "match")
        .eq("external_id", externalId)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      if (dryRun) {
        imported++;
        continue;
      }

      const opponentMemberId = r.opponent_user_id ? memberByShqId.get(r.opponent_user_id) ?? null : null;
      const level = levelFor(r.type_label);
      const eventLabel = [r.type_label, r.format_label].filter(Boolean).join(" — ");

      const { data: match, error: insErr } = await supabase
        .from("matches")
        .insert({
          club_id: clubId,
          match_date: r.played_on,
          season_year: Number(r.played_on.slice(0, 4)),
          player_a_member_id: memberId,
          player_b_member_id: opponentMemberId,
          winner_member_id: r.won ? memberId : opponentMemberId,
          external_opponent_name: opponentMemberId ? null : r.opponent_name,
          score: r.score,
          source_type: level,
          event_label: eventLabel || r.type_label,
          notes: `Imported from SportyHQ. Player 1: ${(prof as { club_members?: { name?: string } }).club_members?.name ?? "Member"}. Player 2: ${r.opponent_name}`,
          confirmed: true,
          is_imported: true,
        })
        .select("id")
        .single();
      if (insErr || !match) {
        errors.push(`insert ${r.result_id}: ${insErr?.message ?? "unknown"}`);
        continue;
      }

      const { error: extErr } = await supabase.from("external_ids").insert({
        source_system: SOURCE,
        entity_type: "match",
        entity_id: match.id,
        external_id: externalId,
        source_metadata: {
          sportyhq_user_id: shqId,
          type: r.type_label,
          opponent_user_id: r.opponent_user_id,
        },
      });
      if (extErr) {
        // Lost a race with a concurrent run — drop the duplicate match row.
        await supabase.from("matches").delete().eq("id", match.id);
        skipped++;
        continue;
      }
      imported++;
    }
  }

  const done = profiles.length < limit;
  if (done && !dryRun) {
    await supabase.from("clubs").update({ history_imported_at: new Date().toISOString() }).eq("id", clubId);
  }

  return json({
    done,
    club: club.name,
    members_processed: profiles.length,
    results_scanned: scanned,
    imported,
    skipped,
    next_cursor: done ? null : lastCursor,
    errors: errors.slice(0, 10),
  });
});
