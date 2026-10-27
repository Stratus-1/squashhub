/**
 * Results-decided next-round Swiss games: the same projection the progress log and Court Bookings show.
 * `loadProjectedFixtures` is read-only. `createDecidedSwissGames` (server, service role) turns each decided
 * pairing into a normal fixture and books its planned court slot in the same step. Idempotent.
 */
import { supabase } from "@/integrations/supabase/client";
import { isFrozenUitsigTournament } from "./swiss-sequencing-policy";
import { projectCourtFixtures, projectDecidedPlayByFixtures, projectSwissBookingRetries, type ProjectionInput, type ProjectedCourtFixture } from "@/lib/tournaments/projected-court-fixtures";

export type ProjectedChampFixture = ProjectedCourtFixture & { courtName: string };

async function loadProjectionInput(champ: any): Promise<ProjectionInput> {
  const sb = supabase as any;
  const [courts, arch, entries, matches, rounds, partialFlag] = await Promise.all([
    sb.from("courts").select("id, name, active").eq("club_id", champ.club_id).order("id"),
    sb.from("tournaments").select("builder_architecture,builder_spec,beta_lifecycle,start_time,end_time,match_duration_minutes,default_break_minutes,court_ids").eq("id", champ.id).maybeSingle(),
    sb.from("club_champs_entries").select("*, club_members:club_member_id(id, name)").eq("champ_id", champ.id),
    sb.from("club_champs_matches").select("*, player_a:player_a_member_id(name), player_b:player_b_member_id(name)").eq("champ_id", champ.id),
    sb.from("club_champs_rounds").select("*").eq("champ_id", champ.id),
    sb.from("club_beta_features").select("feature").eq("club_id", champ.club_id).eq("feature", "tournament_swiss_partial_rounds").maybeSingle(),
  ]);
  const active = ((courts.data ?? []) as any[]).filter((c) => c.active !== false);
  return { champ, arch: arch.data, entries: entries.data ?? [], matches: matches.data ?? [], rounds: rounds.data ?? [], courts: active, partialGeneration: !!partialFlag.data };
}

export async function loadProjectedFixtures(champ: any): Promise<ProjectedChampFixture[]> {
  const input = await loadProjectionInput(champ);
  const name = (id: number) => input.courts.find((c) => Number(c.id) === id)?.name ?? `Court ${id}`;
  try {
    return projectCourtFixtures(input)
      .map((f) => ({ ...f, courtName: name(f.courtId) }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  } catch { return []; }
}

export async function createDecidedSwissGames(tid: string): Promise<{ created: number; booked: number; issues: string[] }> {
  if (isFrozenUitsigTournament(tid)) return { created: 0, booked: 0, issues: ["Existing Uitsig tournament is protected; no pairing or booking updates performed."] };
  const sb = supabase as any;
  const { data: champ } = await sb.from("club_champs").select("*").eq("id", tid).maybeSingle();
  if (!champ) return { created: 0, booked: 0, issues: [] };
  const input = await loadProjectionInput(champ);
  const list = [...projectCourtFixtures(input), ...projectDecidedPlayByFixtures(input)];
  let created = 0, booked = 0; const issues: string[] = [];
  for (const f of projectSwissBookingRetries(input)) {
    const { error } = await sb.rpc("self_schedule_champ_match", { p_match_id: f.matchId, p_court_id: f.courtId, p_date: f.date, p_time: `${f.time}:00`, p_duration_minutes: f.minutes });
    if (error) issues.push(`${f.title}: court booking retry failed (${error.message})`);
    else booked++;
  }
  for (const f of list) {
    const { data: id, error } = await sb.rpc("create_decided_swiss_game", { p_tid: tid, p_group: f.group, p_round: f.round, p_a: f.aId, p_b: f.bId, p_rr_finish_block: f.rrFinishBlock === true });
    if (error || !id) { issues.push(`${f.title}: ${error?.message ?? "not created"}`); continue; }
    created++;
    // The existing round row owns the play-by deadline. Leave court/time/booking empty.
    if (!("courtId" in f)) continue;
    const { error: be } = await sb.rpc("self_schedule_champ_match", { p_match_id: id, p_court_id: f.courtId, p_date: f.date, p_time: `${f.time}:00`, p_duration_minutes: f.minutes });
    if (be) issues.push(`${f.title}: game created, court not booked (${be.message})`); else booked++;
  }
  return { created, booked, issues };
}
