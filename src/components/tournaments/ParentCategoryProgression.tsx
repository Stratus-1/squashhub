import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RoundRobinPilotView } from "@/components/tournaments/RoundRobinPilotView";
import type { RRPoolView } from "@/lib/tournaments/round-robin-view";
import type { ParentProgressionGroup } from "@/lib/tournaments/parent-progression";

export interface ParentFixtureDisplay {
  id: string; round: number | null; a: string; b: string; score: string | null;
  when: string; deadline: string | null; status: string; stageKey?: string | null;
}
export interface ParentChildDisplay {
  group: number; label: string; format: string; standings: ReactNode;
  matrix: RRPoolView | null; upcoming: ParentFixtureDisplay[]; results: ParentFixtureDisplay[];
}

function Fixtures({ title, rows }: { title: string; rows: ParentFixtureDisplay[] }) {
  return <section className="min-w-0 space-y-2" aria-label={title}>
    <h5 className="text-sm font-semibold">{title} <span className="text-muted-foreground">({rows.length})</span></h5>
    {!rows.length ? <p className="text-xs text-muted-foreground">{title === "Results" ? "No results yet." : "No upcoming fixtures."}</p> :
      <div className="divide-y divide-border">{rows.map((m) => <div key={m.id} data-fixture-id={m.id} className="grid min-w-0 gap-1 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 break-words"><span className="font-medium">{m.a} v {m.b}</span><div className="text-muted-foreground">{m.round ? `Round ${m.round} · ` : ""}{m.status}{m.score ? ` · ${m.score}` : ""}</div></div>
        <div className="min-w-0 break-words sm:text-right">{m.when}{m.deadline && <div className="text-muted-foreground">Play by {m.deadline}</div>}</div>
      </div>)}</div>}
  </section>;
}

/** No action callbacks or data hooks: parent composition is strictly a spectator view. */
export function ParentCategoryProgression({ parent, children, playoffs }: { parent: ParentProgressionGroup; children: ParentChildDisplay[]; playoffs: ParentFixtureDisplay[] }) {
  const [view, setView] = useState("progression");
  const knownStageIds = new Set(parent.stages.map((s) => s.id));
  const unmatched = playoffs.filter((m) => !m.stageKey || !knownStageIds.has(m.stageKey));
  return <div className="min-w-0 space-y-4" data-testid="parent-category-progression">
    <Tabs value={view} onValueChange={setView} className="min-w-0 space-y-4">
      <TabsList aria-label={`${parent.label} view`} className="grid h-auto w-full grid-cols-2">
        <TabsTrigger value="progression" className="min-h-11 whitespace-normal">Progression</TabsTrigger>
        <TabsTrigger value="log" className="min-h-11 whitespace-normal">Log View</TabsTrigger>
      </TabsList>
      {["progression", "log"].map((mode) => <TabsContent key={mode} value={mode} className="min-w-0 space-y-6">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
          <div className="min-w-0 space-y-6">{children.map((child) => <section key={child.group} className="min-w-0 space-y-3 border-b border-border pb-5" aria-label={child.label}>
            <div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-semibold">{child.label}</h4><Badge variant="outline">{child.format}</Badge></div>
            <p className="text-xs text-muted-foreground">{child.upcoming.length ? child.results.length ? "Provisional rankings · matches still to play" : "Provisional draw order · no results yet" : "Rankings"}</p>
            {mode === "progression" && child.matrix ? <RoundRobinPilotView title={child.label} view={child.matrix} matrixOnly /> : <div className="max-w-full overflow-x-auto">{child.standings}</div>}
            <Fixtures title="Upcoming Fixtures" rows={child.upcoming} />
            <Fixtures title="Results" rows={child.results} />
          </section>)}</div>
          <section aria-label="Shared playoffs" className="min-w-0 space-y-4 xl:border-l xl:border-border xl:pl-4">
            <h4 className="text-base font-semibold">{parent.label} · Shared playoffs</h4>
            <div className="space-y-1 text-xs"><p>{parent.qualification}</p>{!playoffs.length && <p className="text-muted-foreground">Qualifiers and pairings await confirmation.</p>}</div>
            {!parent.stages.length && <p className="text-xs text-muted-foreground">Playoff stages not configured.</p>}
            {parent.stages.map((stage) => {
              const rows = playoffs.filter((m) => m.stageKey === stage.id);
              return <section key={stage.id} className="space-y-2 border-l-2 border-primary pl-3" aria-label={stage.name}>
                <h5 className="text-sm font-semibold">{stage.name}</h5>
                {rows.length ? rows.map((m) => <div key={m.id} data-fixture-id={m.id} className="space-y-1 rounded border border-border bg-muted/30 p-3 text-xs"><div className="break-words font-medium">{m.a}</div><div className="break-words font-medium">{m.b}</div><p>{m.score ?? m.status}</p><p className="text-muted-foreground">{m.when}</p>{m.deadline && <p>Play by {m.deadline}</p>}</div>) : <div className="space-y-1 border border-dashed border-border p-3 text-xs text-muted-foreground"><p>{stage.deferred ? "Define later · not configured" : "Awaiting confirmed fixtures"}</p><p>Participants TBD</p>{stage.plannedDate && <p>{stage.plannedDate}</p>}</div>}
              </section>;
            })}
            {unmatched.length > 0 && <Fixtures title="Saved playoff fixtures" rows={unmatched} />}
          </section>
        </div>
      </TabsContent>)}
    </Tabs>
  </div>;
}