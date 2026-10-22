import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { stageLifecycle } from "@/lib/tournaments/progression";
import { supabaseDb } from "@/lib/tournaments/structured-db";

const STATE: Record<string, string> = { active: "in progress", completed: "complete", ready: "ready to start", waiting: "waiting", blocked: "needs attention", needs_setup: "needs setup", not_started: "not started" };

/** Read-only progress line per non-Swiss category (round robin, pools, play-offs) for Manage running tournament. */
export function CategoryProgressPanel({ tournamentId }: { tournamentId: string }) {
  const { data } = useQuery({
    queryKey: ["category-progress", tournamentId],
    refetchInterval: 30000,
    queryFn: async () => {
      const [{ data: t }, { data: matches }] = await Promise.all([
        fromExt("tournaments").select("builder_spec, builder_architecture").eq("id", tournamentId).maybeSingle(),
        fromExt("club_champs_matches").select("group_number, stage_key, winner_member_id, status, is_bye").eq("champ_id", tournamentId),
      ]);
      if ((t as any)?.builder_architecture !== "structured") return null;
      const states = await stageLifecycle(supabaseDb, tournamentId).catch(() => []);
      return { spec: (t as any).builder_spec, matches: (matches ?? []) as any[], states };
    },
  });
  if (!data?.spec?.divisions?.length) return null;
  const rows = (data.spec.divisions as any[]).map((d, i) => {
    const main = d.stages?.[0];
    if (!main || main.kind === "swiss" || main.kind === "knockout") return null;
    const gm = data.matches.filter((m) => m.group_number === i + 1 && m.stage_key === main.id && !m.is_bye);
    const played = gm.filter((m) => m.winner_member_id || m.status === "completed").length;
    const later = (data.states as any[]).filter((s) => s.divisionKey === d.divisionId && s.stageKey !== main.id);
    const next = later.find((s) => s.state !== "completed");
    const kind = main.kind === "pools" ? "Pools" : "Round robin";
    const tail = next ? `${next.name} ${STATE[next.state] ?? next.state}` : later.length ? "Play-offs complete" : played === gm.length && gm.length ? "Finished — no play-offs planned" : "";
    return { key: d.divisionId, text: `${d.label} · ${kind} ${played} of ${gm.length} played${tail ? ` · ${tail}` : ""}`, detail: next?.state === "blocked" ? next.detail : null };
  }).filter(Boolean) as Array<{ key: string; text: string; detail: string | null }>;
  if (!rows.length) return null;
  return (
    <div className="space-y-1 rounded-md border border-border p-3 text-xs" data-testid="category-progress-panel">
      <div className="text-sm font-semibold">Progress per category</div>
      <ul className="space-y-1">
        {rows.map((r) => <li key={r.key}>{r.text}{r.detail && <span className="block text-destructive">{r.detail}</span>}</li>)}
      </ul>
    </div>
  );
}
