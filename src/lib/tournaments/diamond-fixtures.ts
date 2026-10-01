/**
 * Mirror Diamond League ties into the linked tournament's game list so they
 * show under Upcoming and can be marked (dl:<tieId>:<gameIndex> rows).
 * Shared by the Diamond manager and the Standings play-off buttons so both
 * write fixtures with exactly the same rules: scored/started games are kept,
 * unstarted unscored rows are replaceable, leftovers are removed.
 */
import { fromExt } from "@/lib/supabase-ext";
import {
  tieGames, gameLabel, diamondGameStarts,
  type DiamondTeam, type DiamondTie, type DiamondWeek, type TeamLeagueConfig,
} from "@/lib/tournaments/team-league";
import { diamondPendingParticipantPatch, diamondSlotReplacements, type ParticipantIds } from "@/lib/tournaments/diamond-participants";

export async function syncDiamondFixtures(opts: {
  champId: string;
  clubId: string;
  cfg: TeamLeagueConfig;
  teams: DiamondTeam[];
  weeks: DiamondWeek[];
  teamName: (id: string) => string;
  previousTeams?: DiamondTeam[];
}): Promise<number> {
  const { champId, clubId, cfg, teams, weeks, teamName, previousTeams = teams } = opts;
  const replacements = diamondSlotReplacements(previousTeams, teams);
  const games = tieGames(cfg);
  const { data: courtRows } = await fromExt("courts").select("id").eq("club_id", clubId).order("id");
  const courtIds = ((courtRows || []) as any[]).map((c) => c.id as number);
  const { data: existing, error: exErr } = await fromExt("club_champs_matches")
    .select("id, stage_key, status, score, scheduled_date, scheduled_time, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", champId).like("stage_key", "dl:%");
  if (exErr) throw exErr;
  const keep = new Set<string>();
  const replaceable = new Map<string, { id: string; scheduled_date: string | null; scheduled_time: string | null; participants: ParticipantIds; startedTie: boolean }>();
  const startedTies = new Set(((existing || []) as any[]).filter((m) => m.status !== "scheduled" || m.score).map((m) => String(m.stage_key).replace(/:\d+$/, "")));
  ((existing || []) as any[]).forEach((m) => {
    if (m.status === "scheduled" && !m.score) replaceable.set(m.stage_key, {
      id: m.id, scheduled_date: m.scheduled_date, scheduled_time: m.scheduled_time,
      participants: { player_a_member_id: m.player_a_member_id, player_b_member_id: m.player_b_member_id, partner_a_member_id: m.partner_a_member_id, partner_b_member_id: m.partner_b_member_id },
      startedTie: startedTies.has(String(m.stage_key).replace(/:\d+$/, "")),
    });
    else keep.add(m.stage_key);
  });
  const starts = diamondGameStarts(cfg, cfg.startTime || "17:45");
  const rows: any[] = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  weeks.forEach((w) => w.ties.forEach((t) => {
    const home = teams.find((x) => x.id === t.home), away = teams.find((x) => x.id === t.away);
    if (!home || !away) return;
    games.forEach((g, gi) => {
      const key = `dl:${t.id}:${gi}`;
      const time = starts[gi];
      const [p1, p2] = g.positions;
      const participants: ParticipantIds = {
        player_a_member_id: home.players[p1 - 1] ?? null, player_b_member_id: away.players[p1 - 1] ?? null,
        partner_a_member_id: p2 ? home.players[p2 - 1] ?? null : null, partner_b_member_id: p2 ? away.players[p2 - 1] ?? null : null,
      };
      if (keep.has(key)) return;
      const saved = replaceable.get(key);
      if (saved) {
        replaceable.delete(key);
        const patch: Record<string, unknown> = diamondPendingParticipantPatch(saved.participants, participants, saved.startedTie, replacements);
        if (!saved.startedTie && (saved.scheduled_date !== (w.date || null) || saved.scheduled_time?.slice(0, 5) !== time)) {
          patch.scheduled_date = w.date || null;
          patch.scheduled_time = time;
        }
        if (Object.keys(patch).length) updates.push({ id: saved.id, patch });
        return;
      }
      rows.push({
        champ_id: champId, group_number: w.week, round_number: w.week, section_number: 1,
        stage: w.stage === "pool" ? "group" : "knockout", stage_key: key,
        stage_label: `${w.stage === "pool" ? `Week ${w.week} · Division ${home.pool}` : w.stage === "semi" ? "Semi-finals" : "Finals"} · ${teamName(home.id)} v ${teamName(away.id)} · ${gameLabel(g)}`,
        ...participants,
        scheduled_date: w.date || null, scheduled_time: time,
        court_id: courtIds[t.court - 1] ?? null, status: "scheduled",
      });
    });
  }));
  for (const item of updates) {
    const { error } = await fromExt("club_champs_matches").update(item.patch).eq("id", item.id).eq("champ_id", champId).eq("status", "scheduled").is("score", null);
    if (error) throw error;
  }
  if (replaceable.size) {
    const { error } = await fromExt("club_champs_matches").delete().in("id", [...replaceable.values()].filter((item) => !item.startedTie).map((item) => item.id)).eq("champ_id", champId).eq("status", "scheduled").is("score", null);
    if (error) throw error;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await fromExt("club_champs_matches").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
  return rows.length;
}

export type DiamondTieLike = DiamondTie;
