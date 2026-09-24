import { StageWindowControl } from "./DateControls";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import {
  FORMAT_LABEL, addStage, diamondTemplate, moveStage, relink, removeStage, setDiscipline, setFormat, stageSummary, transitionText,
  type BuilderFormat,
} from "@/lib/smart-builder/stage-builder";
import { cn } from "@/lib/utils";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 min-w-0 w-full bg-white/5 border-white/15 text-white text-xs";
const sel = "smart-builder-select h-8 w-full rounded-md bg-white/5 border border-white/15 text-white px-2 text-xs";
const btn = "h-7 bg-transparent border-white/20 text-white/80 text-[11px]";

function Q({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("block space-y-1 text-[11px] text-white/70", className)}><span>{label}</span>{children}</label>;
}

/** Custom / mixed format: an ordered stage builder per division. Edits the same definition as every other path. */
export function StageBuilder({ def, edit }: { def: TournamentDefinition; edit: Edit }) {
  const [divIdx, setDivIdx] = useState(0);
  const d = def.divisions[Math.min(divIdx, def.divisions.length - 1)];
  const stages = d?.sections[0]?.stages ?? [];
  const [selId, setSelId] = useState<string | null>(null);
  const sel0 = stages.find((s) => s.id === selId) ?? stages[0];
  const si = sel0 ? stages.indexOf(sel0) : -1;
  const prev = si > 0 ? stages[si - 1] : null;
  const di = def.divisions.indexOf(d!);
  const editDiv = (mut: (x: NonNullable<typeof d>, full: TournamentDefinition) => void) => edit((x) => mut(x.divisions[di], x));
  const editStage = (mut: (s: (typeof stages)[number]) => void) => editDiv((x) => { const s = x.sections[0].stages.find((y) => y.id === sel0!.id); if (s) mut(s); });
  if (!d) return null;
  const entrants = stages[0]?.input?.entrants ?? null;

  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.03] p-3 space-y-3 text-xs text-white/80" data-field="stage-builder">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">Custom / mixed format — stage builder</span>
        <span className="text-white/50">Build the stages in order. Each stage is set up on its own.</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className={btn} onClick={() => edit((x) => { diamondTemplate(x); setSelId(null); })}>Load Diamond League template</Button>
          <Button size="sm" variant="outline" className={btn} onClick={() => edit((x) => { x.quickPath = null; })}>Open full builder</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Q label="Tournament name"><Input className={f} value={def.name} onChange={(e) => edit((x) => { x.name = e.target.value; })} /></Q>
        <Q label="Seeding">
          <select className={sel} value={def.players?.seedingSource ?? ""} onChange={(e) => edit((x) => { x.players = { ...x.players, seedingSource: (e.target.value || null) as any }; })}>
            <option value="">Not decided</option><option value="ranking">Ranking</option><option value="ladder">Club ladder</option><option value="manual">I'll seed manually</option><option value="none">No seeding</option>
          </select>
        </Q>
        {stages.length > 1 && (
          <Q label="Final result">
            <select className={sel} value={def.finalStandings ?? "last_stage"} onChange={(e) => edit((x) => { x.finalStandings = e.target.value as any; })}>
              <option value="last_stage">Last stage decides</option><option value="cumulative">Points added up across all stages</option>
            </select>
          </Q>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {def.divisions.map((x, i) => (
          <button key={x.id} onClick={() => { setDivIdx(i); setSelId(null); }} className={cn("rounded border px-2 py-1", i === di ? "border-white/60 text-white" : "border-white/15 text-white/60")}>{x.name}</button>
        ))}
        <Button size="sm" variant="outline" className={btn} onClick={() => edit((x) => {
          const id = `div${x.divisions.length + 1}_${Date.now().toString(36)}`;
          const copy = JSON.parse(JSON.stringify(x.divisions[di]).replace(/"(id|fromStageId)":"(stage[^"]+)"/g, (_m, k, v) => `"${k}":"${v}-${id}"`));
          x.divisions.push({ ...copy, id, name: `Division ${x.divisions.length + 1}` });
        })}>Add division (copy of this one)</Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-3">
        <div className="space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <Q label="Division name"><Input className={f} value={d.name} onChange={(e) => editDiv((x) => { x.name = e.target.value; })} /></Q>
            <Q label="Entries">
              <select className={sel} value={d.entry} onChange={(e) => editDiv((x) => { x.entry = e.target.value as any; })}>
                <option value="individual">Individual players</option><option value="pairs">Pairs</option>
              </select>
            </Q>
            <Q label="Expected entries"><Input className={f} inputMode="numeric" value={entrants ?? ""} onChange={(e) => editDiv((x) => { const s = x.sections[0].stages[0]; s.input = { ...s.input, entrants: e.target.value ? Number(e.target.value) : null }; })} /></Q>
          </div>

          <div className="rounded border border-white/10 p-2 space-y-1" data-field="tournament-map">
            <div className="font-semibold text-white">{d.name}</div>
            {stages.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="pl-3 text-white/50">{transitionText(stages[i - 1], s)}</div>}
                <div className={cn("flex items-center gap-1 rounded border px-2 py-1", s.id === sel0?.id ? "border-white/60 bg-white/[0.06]" : "border-white/10")}>
                  <button className="flex-1 text-left" onClick={() => setSelId(s.id)} aria-label={`Edit ${s.name}`}>
                    <div className="text-white">Stage {i + 1} — {s.name}</div>
                    <div className="text-white/60">{stageSummary(s, i === 0 ? entrants : null)}</div>
                  </button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-white/60" aria-label="Move stage up" disabled={i === 0} onClick={() => editDiv((x) => moveStage(x, s.id, -1))}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-white/60" aria-label="Move stage down" disabled={i === stages.length - 1} onClick={() => editDiv((x) => moveStage(x, s.id, 1))}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-white/60" aria-label="Remove stage" disabled={stages.length <= 1} onClick={() => { editDiv((x) => removeStage(x, s.id)); setSelId(null); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            <div className="pl-3 text-white/50">↓</div>
            <div className="px-2 text-white/80">Final standings · {stages.length > 1 && def.finalStandings === "cumulative" ? "points added up across stages" : "last stage decides"}</div>
            <Button size="sm" variant="outline" className={cn(btn, "mt-1")} onClick={() => { let nid = ""; editDiv((x) => { nid = addStage(x); }); setTimeout(() => setSelId(nid), 0); }}><Plus className="h-3 w-3 mr-1" />Add stage</Button>
          </div>
        </div>

        {sel0 && (
          <div className="rounded border border-white/10 p-2 space-y-2" data-field="stage-panel">
            <div className="font-semibold text-white">Stage {si + 1} settings</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <Q label="Stage name"><Input className={f} value={sel0.name} onChange={(e) => editStage((s) => { s.name = e.target.value; })} /></Q>
              <Q label="1. Match type">
                <select className={sel} value={sel0.discipline ?? "singles"} onChange={(e) => editDiv((x) => setDiscipline(x, sel0.id, e.target.value as any))}>
                  <option value="singles">Singles</option><option value="doubles">Doubles</option>
                </select>
              </Q>
              <Q label="2. Match format">
                <select className={sel} value={sel0.kind} onChange={(e) => editDiv((x) => setFormat(x, sel0.id, e.target.value as BuilderFormat))}>
                  {(Object.keys(FORMAT_LABEL) as BuilderFormat[]).map((k) => <option key={k} value={k}>{FORMAT_LABEL[k]}</option>)}
                </select>
              </Q>
              {sel0.kind === "round_robin" && (
                <Q label="3. Grouping">
                  <select className={sel} value={sel0.groups > 1 ? "pools" : "one"} onChange={(e) => editStage((s) => { s.groups = e.target.value === "pools" ? 2 : 1; if (s.groups === 1) s.groupSize = null; })}>
                    <option value="one">One field</option><option value="pools">Divide into pools</option>
                  </select>
                </Q>
              )}
              {sel0.kind === "round_robin" && sel0.groups > 1 && (
                <>
                  <Q label="Number of pools"><Input className={f} inputMode="numeric" value={sel0.groups} onChange={(e) => editStage((s) => { s.groups = Math.max(2, Number(e.target.value) || 2); })} /></Q>
                  <Q label="Players per pool"><Input className={f} inputMode="numeric" value={sel0.groupSize ?? ""} onChange={(e) => editStage((s) => { s.groupSize = e.target.value ? Number(e.target.value) : null; })} /></Q>
                </>
              )}
              {sel0.kind === "round_robin" && (
                <Q label="4. Rounds — play each other">
                  <select className={sel} value={sel0.legs ?? 1} onChange={(e) => editStage((s) => { s.legs = Number(e.target.value) === 2 ? 2 : 1; })}>
                    <option value={1}>Once (rounds worked out automatically)</option><option value={2}>Twice</option>
                  </select>
                </Q>
              )}
              {sel0.kind === "swiss" && (
                <Q label="4. Number of Swiss rounds"><Input className={f} inputMode="numeric" value={sel0.swissRounds ?? ""} onChange={(e) => editStage((s) => { s.swissRounds = e.target.value ? Number(e.target.value) : null; })} /></Q>
              )}
              {sel0.kind === "knockout" && (
                <Q label="4. Rounds">
                  <select className={sel} value={sel0.thirdPlace ? "yes" : "no"} onChange={(e) => editStage((s) => { s.thirdPlace = e.target.value === "yes"; })}>
                    <option value="no">Worked out from the bracket</option><option value="yes">Worked out + 3rd/4th place match</option>
                  </select>
                </Q>
              )}
              <Q label="5. Scheduling">
                <select className={sel} value={sel0.schedule.mode === "fixed" || sel0.schedule.mode === "play_by" ? sel0.schedule.mode : ""} onChange={(e) => editStage((s) => { s.schedule = { ...s.schedule, mode: (e.target.value || "unset") as any }; })}>
                  <option value="">Not decided</option><option value="fixed">Fixed dates & times</option><option value="play_by">Play by a deadline</option>
                </select>
              </Q>
              {(sel0.schedule.mode === "fixed" || sel0.schedule.mode === "play_by") && (
                <>
                  <StageWindowControl def={def} stage={sel0} onChange={(patch) => editStage((s) => { s.schedule = { ...s.schedule, ...patch }; })} />
                  <Q label="Courts available"><Input className={f} inputMode="numeric" value={sel0.schedule.courtsPerVenue ?? ""} onChange={(e) => editStage((s) => { s.schedule = { ...s.schedule, courtsPerVenue: e.target.value ? Number(e.target.value) : null }; })} /></Q>
                </>
              )}
            </div>

            {prev && <Progression def={def} prev={prev} cur={sel0} editDiv={editDiv} />}
            {!prev && <div className="text-[11px] text-white/50">Stage 1 takes the entries.</div>}
          </div>
        )}
      </div>
      <div className="text-white/50">Who can enter, invitations and scoring are on the other tabs. The same checks run before anything is created.</div>
    </div>
  );
}

function Progression({ prev, cur, editDiv }: { def: TournamentDefinition; prev: any; cur: any; editDiv: (m: (x: any) => void) => void }) {
  const p = cur.progression ?? {};
  const toDoubles = prev.discipline !== "doubles" && cur.discipline === "doubles";
  const upd = (mut: (st: any, pr: any) => void) => editDiv((x) => {
    const ss = x.sections[0].stages; const i = ss.findIndex((s: any) => s.id === cur.id);
    mut(ss[i], ss[i - 1]); relink(x);
  });
  if (prev.discipline === "doubles" && cur.discipline !== "doubles") return <Note>A doubles stage can't feed a singles stage. Change the match type or the order.</Note>;
  if (prev.kind === "knockout") return <Note>A knockout eliminates players, so nothing can follow it here. Put the knockout last.</Note>;
  const modes: Array<[string, string]> = toDoubles ? [["form_pairs", "Form doubles pairs from the singles results"]]
    : cur.kind === "knockout" && (prev.kind === "round_robin" || prev.kind === "swiss") ? [["qualifiers", "Qualifiers continue (top N)"], ["all_continue", "Everyone continues"]]
    : [["all_continue", "Everyone continues"]];
  return (
    <div className="rounded border border-white/10 p-2 space-y-2">
      <div className="font-semibold text-white">6. How players move here from {prev.name || "the previous stage"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Q label="Who continues">
          <select className={sel} value={p.mode ?? ""} onChange={(e) => upd((st, pr) => {
            st.progression = { mode: e.target.value, standings: null, pairing: null };
            if (e.target.value === "qualifiers") { pr.advance = { role: "qualify", perGroup: pr.groups > 1 ? 2 : 4 }; st.qualifierMapping = pr.groups > 1 ? "cross_pool" : "reseed"; }
            else pr.advance = { role: "none" };
          })}>
            <option value="">Choose…</option>{modes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Q>
        {p.mode === "qualifiers" && (
          <>
            <Q label={prev.groups > 1 ? "Qualify from each pool" : "How many qualify"}><Input className={f} inputMode="numeric" value={prev.advance?.perGroup ?? ""} onChange={(e) => upd((_st, pr) => { pr.advance = { role: "qualify", perGroup: e.target.value ? Number(e.target.value) : null }; })} /></Q>
            <Q label="How qualifiers are placed">
              <select className={sel} value={cur.qualifierMapping ?? ""} onChange={(e) => upd((st) => { st.qualifierMapping = e.target.value || null; })}>
                <option value="">Not decided</option>{prev.groups > 1 && <option value="cross_pool">Cross-pool (A1 v B2)</option>}<option value="reseed">Re-seed by finishing position</option>{prev.groups > 1 && <option value="same_pool">Within the same pool</option>}
              </select>
            </Q>
          </>
        )}
        {p.mode === "form_pairs" && (
          <Q label="How pairs are formed">
            <select className={sel} value={p.pairing ?? ""} onChange={(e) => upd((st) => { st.progression = { ...st.progression, pairing: e.target.value || null }; })}>
              <option value="">Choose…</option><option value="fold">Balanced: 1st + last, 2nd + second-last</option><option value="positions">By position: 1st + 2nd, 3rd + 4th</option><option value="manual">I'll set the pairs when this stage starts</option>
            </select>
          </Q>
        )}
        {(p.mode === "all_continue" || p.mode === "form_pairs") && (
          <Q label="Points from earlier stages">
            <select className={sel} value={p.standings ?? ""} onChange={(e) => upd((st) => { st.progression = { ...st.progression, standings: e.target.value || null }; })}>
              <option value="">Choose…</option><option value="carry">Carry forward</option><option value="reset">Reset for this stage</option>
            </select>
          </Q>
        )}
        {p.mode && (
          <Q label="Create this stage's games">
            <select className={sel} value={cur.generation ?? ""} onChange={(e) => upd((st) => { st.generation = e.target.value || null; })}>
              <option value="">Not decided</option><option value="owner_approval">After I preview and confirm</option><option value="automatic">Automatically when the previous stage is done</option>
            </select>
          </Q>
        )}
      </div>
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <div className="rounded border border-white/10 p-2 text-[11px] text-white/60">{children}</div>;
