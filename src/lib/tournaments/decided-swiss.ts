/**
 * Results-decided next-round Swiss games: the same projection the progress log and Court Bookings show.
 * `loadProjectedFixtures` is read-only. `createDecidedSwissGames` (server, service role) turns each decided
 * pairing into a normal fixture and books its planned court slot in the same step. Idempotent.
 */
import { supabase } from "@/integrations/supabase/client";
import { projectCourtFixtures, type ProjectedCourtFixture } from "@/lib/tournaments/projected-court-fixtures";
import { fetchSwissNoRepeat } from "./swiss-no-repeat";

export type ProjectedChampFixture = ProjectedCourtFixture & { courtName: string };

export async function loadProjectedFixtures(champ: any): Promise<ProjectedChampFixture[]> {
  const sb = supabase as any;
  const [courts, arch, entries, matches, rounds, noRepeats] = await Promise.all([
    sb.from("courts").select("id, name, active").eq("club_id", champ.club_id).order("id"),
    sb.from("tournaments").select("builder_architecture,builder_spec,beta_lifecycle,start_time,end_time,match_duration_minutes,default_break_minutes,court_ids").eq("id", champ.id).maybeSingle(),
    sb.from("club_champs_entries").select("*, club_members:club_member_id(id, name)").eq("champ_id", champ.id),
    sb.from("club_champs_matches").select("*, player_a:player_a_member_id(name), player_b:player_b_member_id(name)").eq("champ_id", champ.id),
    sb.from("club_champs_rounds").select("*").eq("champ_id", champ.id),
    fetchSwissNoRepeat(champ.club_id),
  ]);
  const active = ((courts.data ?? []) as any[]).filter((c) => c.active !== false);
  const name = (id: number) => active.find((c) => Number(c.id) === id)?.name ?? `Court ${id}`;
  try {
    return projectCourtFixtures({ champ, arch: arch.data, entries: entries.data ?? [], matches: matches.data ?? [], rounds: rounds.data ?? [], courts: active, noRepeats })
      .map((f) => ({ ...f, courtName: name(f.courtId) }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  } catch { return []; }
}

export async function createDecidedSwissGames(tid: string): Promise<{ created: number; booked: number; issues: string[] }> {
  const sb = supabase as any;
  const { data: champ } = await sb.from("club_champs").select("*").eq("id", tid).maybeSingle();
  if (!champ) return { created: 0, booked: 0, issues: [] };
  const list = await loadProjectedFixtures(champ);
  let created = 0, booked = 0; const issues: string[] = [];
  for (const f of list) {
    const { data: id, error } = await sb.rpc("create_decided_swiss_game", { p_tid: tid, p_group: f.group, p_round: f.round, p_a: f.aId, p_b: f.bId });
    if (error || !id) { issues.push(`${f.title}: ${error?.message ?? "not created"}`); continue; }
    created++;
    const { error: be } = await sb.rpc("self_schedule_champ_match", { p_match_id: id, p_court_id: f.courtId, p_date: f.date, p_time: `${f.time}:00`, p_duration_minutes: f.minutes });
    if (be) issues.push(`${f.title}: game created, court not booked (${be.message})`); else booked++;
  }
  return { created, booked, issues };
}
