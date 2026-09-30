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

export async function syncDiamondFixtures(opts: {
  champId: string;
  clubId: string;
  cfg: TeamLeagueConfig;
  teams: DiamondTeam[];
  weeks: DiamondWeek[];
  teamName: (id: string) => string;
}): Promise<number> {
  const { champId, clubId, cfg, teams, weeks, teamName } = opts;
  const games = tieGames(cfg);
  const { data: courtRows } = await fromExt("courts").select("id").eq("club_id", clubId).order("id");
  const courtIds = ((courtRows || []) as any[]).map((c) => c.id as number);
  const { data: existing, error: exErr } = await fromExt("club_champs_matches")
    .select("id, stage_key, status, score, scheduled_date, scheduled_time").eq("champ_id", champId).like("stage_key", "dl:%");
  if (exErr) throw exErr;
  const keep = new Set<string>();
  const replaceable = new Map<string, { id: string; scheduled_date: string | null; scheduled_time: string | null }>();
  const startedTies = new Set(((existing || []) as any[]).filter((m) => m.status !== "scheduled" || m.score).map((m) => String(m.stage_key).replace(/:\d+$/, "")));
  ((existing || []) as any[]).forEach((m) => {
    if (m.status === "scheduled" && !m.score && !startedTies.has(String(m.stage_key).replace(/:\d+$/, ""))) replaceable.set(m.stage_key, m);
    else keep.add(m.stage_key);
  });
  const starts = diamondGameStarts(cfg, cfg.startTime || "17:45");
  const rows: any[] = [];
  const updates: Array<{ id: string; date: string | null; time: string }> = [];
  weeks.forEach((w) => w.ties.forEach((t) => {
    const home = teams.find((x) => x.id === t.home), away = teams.find((x) => x.id === t.away);
    if (!home || !away) return;
    games.forEach((g, gi) => {
      const key = `dl:${t.id}:${gi}`;
      const time = starts[gi];
      if (keep.has(key)) return;
      const saved = replaceable.get(key);
      if (saved) {
        replaceable.delete(key);
        if (saved.scheduled_date !== (w.date || null) || saved.scheduled_time?.slice(0, 5) !== time) updates.push({ id: saved.id, date: w.date || null, time });
        return;
      }
      const [p1, p2] = g.positions;
      rows.push({
        champ_id: champId, group_number: w.week, round_number: w.week, section_number: 1,
        stage: w.stage === "pool" ? "group" : "knockout", stage_key: key,
        stage_label: `${w.stage === "pool" ? `Week ${w.week} · Division ${home.pool}` : w.stage === "semi" ? "Semi-finals" : "Finals"} · ${teamName(home.id)} v ${teamName(away.id)} · ${gameLabel(g)}`,
        player_a_member_id: home.players[p1 - 1], player_b_member_id: away.players[p1 - 1],
        partner_a_member_id: p2 ? home.players[p2 - 1] : null, partner_b_member_id: p2 ? away.players[p2 - 1] : null,
        scheduled_date: w.date || null, scheduled_time: time,
        court_id: courtIds[t.court - 1] ?? null, status: "scheduled",
      });
    });
  }));
  for (const item of updates) {
    const { error } = await fromExt("club_champs_matches").update({ scheduled_date: item.date, scheduled_time: item.time }).eq("id", item.id).eq("status", "scheduled").is("score", null);
    if (error) throw error;
  }
  if (replaceable.size) {
    const { error } = await fromExt("club_champs_matches").delete().in("id", [...replaceable.values()].map((item) => item.id)).eq("status", "scheduled").is("score", null);
    if (error) throw error;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await fromExt("club_champs_matches").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
  return rows.length;
}

export type DiamondTieLike = DiamondTie;
