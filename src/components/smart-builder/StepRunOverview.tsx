import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { supabaseDb } from "@/lib/tournaments/structured-db";
import { stageLifecycle, type StageStatus } from "@/lib/tournaments/progression";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { derivedLifecycle } from "@/lib/smart-builder/run-overview";
import type { LifecycleKey } from "@/lib/smart-builder/step-handover";
import { StageProgressPanel } from "./StageProgressPanel";
import { cn } from "@/lib/utils";

type PlanStage = { id: string; name: string; phase?: string; unit?: string; mode?: string; date?: string; deadline?: string; from?: string; to?: string; courtIds?: number[]; trigger?: string };

/**
 * Organiser overview while the tournament runs: the next meaningful action per path (tie to resolve,
 * stage to generate, auto-start, in play…), the planned timeline (dates, times, courts — visible before
 * fixtures exist) and the live Stage progress controls. Lifecycle follows the stored games, not dates.
 */
export function StepRunOverview({ clubId, tournamentId, plan, onLifecycle }: {
  clubId: string; tournamentId: string; plan: Record<string, any> | null | undefined;
  onLifecycle: (stage: LifecycleKey) => void;
}) {
  const { data } = useQuery({
    queryKey: ["step-run", tournamentId],
    refetchInterval: 30000,
    queryFn: async () => {
      const [{ data: t }, { data: matches }] = await Promise.all([
        fromExt("tournaments").select("builder_spec, builder_architecture").eq("id", tournamentId).maybeSingle(),
        fromExt("club_champs_matches").select("*").eq("champ_id", tournamentId),
      ]);
      const list = (matches ?? []) as any[];
      const ids = [...new Set(list.flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id]).filter(Boolean))];
      const { data: mem } = ids.length ? await supabase.from("club_members").select("id, name").in("id", ids) : { data: [] as any[] };
      return { spec: (t as any)?.builder_architecture === "structured" ? ((t as any)?.builder_spec as TournamentSpec | null) : null, matches: list, names: new Map((mem ?? []).map((m: any) => [m.id, m.name])) };
    },
  });
  const sig = (data?.matches ?? []).map((m) => `${m.id}:${m.winner_member_id ?? ""}:${m.status}`).join("|");
  const { data: states = [] } = useQuery({
    queryKey: ["step-run-states", tournamentId, sig, JSON.stringify(data?.spec?.positionOrders ?? {})],
    enabled: !!data?.spec,
    queryFn: () => stageLifecycle(supabaseDb, tournamentId),
  });
  const { data: courts = [] } = useQuery({
    queryKey: ["step-run-courts", clubId],
    queryFn: async () => ((await supabase.from("courts").select("id, name").eq("club_id", clubId)).data ?? []) as Array<{ id: number; name: string }>,
  });
  const gameCount = data?.matches.length ?? 0;
  const implied = derivedLifecycle(states, gameCount);
  useEffect(() => { if (implied) onLifecycle(implied); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [implied]);
  const nameOf = (id: string | null) => (id ? data?.names.get(id) ?? "Player" : "TBD");
  const courtName = (id: number) => courts.find((c) => Number(c.id) === Number(id))?.name ?? `Court ${id}`;

  const planned: PlanStage[] = ((plan?.stages ?? []) as PlanStage[]).filter((s) => s?.name);
  const ordered = [...planned.filter((s) => s.phase !== "playoff"), ...planned.filter((s) => s.phase === "playoff")];
  const stateFor = (name: string): StageStatus[] => states.filter((s) => s.name === name);

  return (
    <div className="space-y-3" data-testid="step-run-overview">
      {ordered.length > 0 && (
        <div className="rounded-md border border-border p-2 text-xs" data-testid="planned-timeline">
          <div className="mb-1 flex items-center gap-1 font-semibold"><CalendarClock className="h-3.5 w-3.5" />Planned timeline</div>
          <ol className="space-y-1">
            {ordered.map((s) => {
              const live = stateFor(s.name);
              const st = live.length ? (live.every((x) => x.state === "completed") ? "Completed" : live.some((x) => x.state === "active") ? "In play" : live.some((x) => x.state === "ready" || x.state === "blocked") ? "Next" : "Planned") : s.phase === "playoff" ? "Planned" : "";
              const when = s.mode === "scheduled" && s.date ? `${s.date}${s.from ? ` · ${s.from}–${s.to ?? ""}` : ""}` : s.deadline ? `Play by ${s.deadline}` : "Date: decide later";
              return (
                <li key={s.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{when}</span>
                  {(s.courtIds ?? []).length > 0 && <span className="text-muted-foreground">· {(s.courtIds ?? []).map(courtName).join(", ")}</span>}
                  {s.unit && <span className="text-muted-foreground">· {s.unit.split("::").join(" › ")}</span>}
                  {st && <span className={cn("rounded-full border px-1.5", st === "Completed" ? "border-primary/50 text-primary" : st === "Next" ? "border-destructive text-destructive" : "border-border text-muted-foreground")}>{st}</span>}
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-muted-foreground">Dates are when stages are played. A stage can be generated as soon as the stage before it is complete.</p>
        </div>
      )}

      {data?.spec && gameCount > 0 && (
        <div id="stage-progress"><StageProgressPanel champId={tournamentId} spec={data.spec} matches={data.matches} nameOf={nameOf} /></div>
      )}
    </div>
  );
}
