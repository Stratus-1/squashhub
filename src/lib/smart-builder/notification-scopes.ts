import { supabase } from "@/integrations/supabase/client";
import { drawNoticeKey, drawNoticeSent, type DrawScope } from "@/lib/smart-builder/draw-notice";

/** One notifiable draw: a category's round (or a named stage) — or a category with no draw yet. */
export type NotificationScope = {
  key: string; categoryLabel: string; groupNumber: number | null; title: string;
  scope: DrawScope; games: number; hasFixtures: boolean;
  sent: { at: string; sent: number } | null;
};

type MatchRow = { group_number?: number | null; round_number?: number | null; stage_key?: string | null; stage_label?: string | null; status?: string | null };
type Division = { groupNumber?: number | string; label?: string };

const cleanLabel = (l: string) => l.replace(/ · Singles$| · Doubles$/, "");

/** Pure: groups saved fixtures into category × round/stage scopes; categories without games get a template-only scope. */
export function buildNotificationScopes(matches: MatchRow[], divisions: Division[], betaLifecycle: any): NotificationScope[] {
  const labels = new Map<number, string>(divisions.map((d) => [Number(d.groupNumber), cleanLabel(String(d.label ?? ""))]));
  const groups = new Map<string, { g: number | null; round: number; stageKey?: string; stageName?: string; games: number }>();
  for (const m of matches) {
    if (m.round_number == null) continue;
    const g = m.group_number ?? null;
    const sk = m.stage_key || undefined;
    const id = `${g ?? "all"}|${m.round_number}|${sk ?? ""}`;
    const cur = groups.get(id) ?? { g, round: Number(m.round_number), stageKey: sk, stageName: sk ? (m.stage_label || undefined) : undefined, games: 0 };
    cur.games += 1;
    groups.set(id, cur);
  }
  const out: NotificationScope[] = [];
  for (const v of groups.values()) {
    const categoryLabel = (v.g != null && labels.get(v.g)) || (v.g != null ? `Category ${v.g}` : "All categories");
    const scope: DrawScope = { round: v.round, groupNumber: v.g ?? undefined, label: categoryLabel, stageKey: v.stageKey, stageName: v.stageName };
    const key = drawNoticeKey(scope);
    out.push({ key, categoryLabel, groupNumber: v.g, title: v.stageName || `Round ${v.round}`, scope, games: v.games, hasFixtures: true, sent: drawNoticeSent(betaLifecycle, key) });
  }
  for (const [g, label] of labels) {
    if (out.some((s) => s.groupNumber === g)) continue;
    const scope: DrawScope = { round: 1, groupNumber: g, label: label || `Category ${g}` };
    const key = drawNoticeKey(scope);
    out.push({ key, categoryLabel: scope.label!, groupNumber: g, title: "Round 1", scope, games: 0, hasFixtures: false, sent: drawNoticeSent(betaLifecycle, key) });
  }
  return out.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.scope.round - b.scope.round || a.title.localeCompare(b.title));
}

export async function loadNotificationScopes(tournamentId: string) {
  const [{ data: matches, error }, { data: t }] = await Promise.all([
    supabase.from("club_champs_matches").select("group_number, round_number, stage_key, stage_label, status").eq("champ_id", tournamentId),
    (supabase as any).from("tournaments").select("builder_spec, beta_lifecycle").eq("id", tournamentId).maybeSingle(),
  ]);
  if (error) throw error;
  return buildNotificationScopes((matches ?? []) as MatchRow[], (t?.builder_spec?.divisions ?? []) as Division[], t?.beta_lifecycle);
}
