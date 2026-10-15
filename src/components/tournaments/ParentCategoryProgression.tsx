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

const ord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** Positional placeholders only ("A1 1st v A2 2nd"); never real names until qualification is confirmed. */
export function placeholderBracket(labels: string[], rounds: number): string[][] {
  if (rounds < 1 || labels.length !== 2) return [];
  const per = 2 ** rounds / 2;
  const out: string[][] = [];
  // Cross-pool seeding: X 1st v Y kth, Y 1st v X kth, …
  const r1: string[] = [];
  for (let j = 0; j < per; j += 1) {
    const [x, y] = j % 2 === 0 ? labels : [labels[1], labels[0]];
    const rank = Math.floor(j / 2) + 1;
    r1.push(`${x} ${ord(rank)} v ${y} ${ord(per + 1 - rank)}`);
  }
  out.push(r1);
  for (let r = 1; r < rounds; r += 1) out.push(Array.from({ length: out[r - 1].length / 2 }, (_, i) => `Winner M${2 * i + 1} v Winner M${2 * i + 2}`));
  return out;
}

/** No action callbacks or data hooks: parent composition is strictly a spectator view. */
export function ParentCategoryProgression({ parent, children, playoffs }: { parent: ParentProgressionGroup; children: ParentChildDisplay[]; playoffs: ParentFixtureDisplay[] }) {
  const [view, setView] = useState("progression");
  const knownStageIds = new Set(parent.stages.map((s) => s.id));
  const unmatched = playoffs.filter((m) => !m.stageKey || !knownStageIds.has(m.stageKey));
  // "Mens A › 1 · Singles" → "A1"; falls back to the full label when no number is saved.
  const short = (c: ParentChildDisplay) => { const n = c.label.replace(parent.label, "").match(/\d+/)?.[0]; return n ? `${parent.label.split(" ").pop()}${n}` : c.label; };
  const upcoming = children.flatMap((c) => c.upcoming.map((m) => ({ ...m, child: short(c) })));
  const placeholders = placeholderBracket(children.map(short), parent.stages.length);
  return <div className="min-w-0 space-y-4" data-testid="parent-category-progression">
    <Tabs value={view} onValueChange={setView} className="min-w-0 space-y-4">
      <TabsList aria-label={`${parent.label} view`} className="grid h-auto w-full grid-cols-2">
        <TabsTrigger value="progression" className="min-h-11 whitespace-normal">Progression</TabsTrigger>
        <TabsTrigger value="log" className="min-h-11 whitespace-normal">Log View</TabsTrigger>
      </TabsList>
      {["progression", "log"].map((mode) => <TabsContent key={mode} value={mode} className="min-w-0">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
          <div className="min-w-0 space-y-4"><div className="min-w-0 divide-y divide-border rounded-md border border-border" data-testid="parent-main-block">{children.map((child) => <section key={child.group} className="min-w-0 space-y-2 p-3" aria-label={child.label}>
            <div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-semibold">{child.label}</h4><Badge variant="outline">{child.format}</Badge>
              <span className="text-xs text-muted-foreground">{child.upcoming.length ? child.results.length ? "Provisional rankings · matches still to play" : "Provisional draw order · no results yet" : "Rankings"}</span></div>
            {mode === "progression" && child.matrix ? <RoundRobinPilotView title={child.label} view={child.matrix} matrixOnly showSlots /> : <div className="max-w-full overflow-x-auto">{child.standings}</div>}
            {mode === "log" && <Fixtures title="Results" rows={child.results} />}
          </section>)}</div>
            <section aria-label="Shared playoffs" className="space-y-3 rounded-md border border-border p-3">
              <h5 className="text-sm font-semibold">{parent.label} · Shared playoffs</h5>
              <p className="text-[11px] text-muted-foreground">{parent.qualification}{!playoffs.length && " · Positions shown until qualifiers are confirmed."}</p>
              {!parent.stages.length && <p className="text-xs text-muted-foreground">Playoff stages not configured.</p>}
              <div className="flex gap-3 overflow-x-auto" data-testid="parent-bracket">{parent.stages.map((stage, si) => {
                const rows = playoffs.filter((m) => m.stageKey === stage.id);
                return <div key={stage.id} className="flex min-w-[150px] flex-1 flex-col justify-around gap-2" aria-label={stage.name}>
                  <h6 className="text-xs font-semibold">{stage.name}{stage.plannedDate ? <span className="font-normal text-muted-foreground"> · {stage.plannedDate}</span> : null}</h6>
                  {rows.length ? rows.map((m) => <div key={m.id} data-fixture-id={m.id} className="rounded border border-border border-l-2 border-l-primary bg-muted/30 p-2 text-xs"><div className="break-words font-medium">{m.a}</div><div className="break-words font-medium">{m.b}</div><p className="text-muted-foreground">{m.score ?? m.when}</p></div>)
                    : (placeholders[si] ?? ["Participants TBD"]).map((label, i) => <div key={i} data-testid="bracket-placeholder" className="rounded border border-dashed border-border border-l-2 border-l-primary p-2 text-xs text-muted-foreground">{label.split(" v ").map((side) => <div key={side}>{side}</div>)}</div>)}
                </div>;
              })}</div>
              {unmatched.length > 0 && <Fixtures title="Saved playoff fixtures" rows={unmatched} />}
            </section>
          </div>
          <div className="min-w-0 space-y-4">
            <section aria-label="Upcoming games" data-testid="parent-upcoming-summary" className="rounded-md border border-border p-3 lg:sticky lg:top-20">
              <h5 className="mb-1 text-sm font-semibold">Upcoming games <span className="text-muted-foreground">({upcoming.length})</span></h5>
              {!upcoming.length ? <p className="text-xs text-muted-foreground">No upcoming games.</p> : <ul className="divide-y divide-border text-xs">{upcoming.map((m) => <li key={m.id} data-fixture-id={m.id} className="py-1">
                <div className="break-words font-medium">{m.a} v {m.b}</div>
                <div className="text-[11px] text-muted-foreground">{m.child}{m.round ? ` · R${m.round}` : ""} · {m.when}</div>
              </li>)}</ul>}
            </section>
          </div>
        </div>
      </TabsContent>)}
    </Tabs>
  </div>;
}
