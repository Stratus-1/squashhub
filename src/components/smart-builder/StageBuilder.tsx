import { SEEDING_LABELS } from "@/lib/smart-builder/scope";
import { StageWindowControl } from "./DateControls";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TournamentDefinition } from "@/lib/smart-builder/definition";
import {
  FORMAT_LABEL, setSameSession, addStage, copyPreviousStage, diamondTemplate, shapeChange, moveStage, relink, removeStage, setDiscipline, setFormat, stageSummary, transitionText,
  type BuilderFormat,
} from "@/lib/smart-builder/stage-builder";
import { cn } from "@/lib/utils";
import { TIE_PAIRING_LABEL, opponentPositions, standardRubbers, type TiePairing } from "@/lib/smart-builder/ties";
import { addDivision, applyPlan, applyStructure, removeDivision } from "@/lib/smart-builder/division-structure";
import { toast } from "sonner";
import { TransitionEditor } from "./TransitionEditor";
import { DiamondLeaguePanel } from "./DiamondLeaguePanel";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { poolDisplay } from "@/lib/tournaments/transition";

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
  // Review → "Go there": open the offending division and stage.
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<{ stageId: string }>).detail?.stageId;
      const i = def.divisions.findIndex((x) => x.sections.some((s) => s.stages.some((st) => st.id === id)));
      if (i >= 0) { setDivIdx(i); setSelId(id); }
    };
    window.addEventListener("smart-builder:focus-stage", h);
    return () => window.removeEventListener("smart-builder:focus-stage", h);
  }, [def]);
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
        <Q label="Seeding source">
          <div className="rounded border border-white/10 px-2 py-1.5 text-white/70" data-field="event.seedingSource">{def.event?.seedingSource ? SEEDING_LABELS[def.event.seedingSource] : (def.players?.seedingSource ? `${def.players.seedingSource} (older setting)` : "Set under Seeding data above")}<span className="block text-[10px] text-white/40">Set once for the whole tournament</span></div>
        </Q>
        {stages.length > 1 && (
          <Q label="Final result">
            <select className={sel} value={def.finalStandings ?? "last_stage"} onChange={(e) => edit((x) => { x.finalStandings = e.target.value as any; })}>
              <option value="last_stage">Last stage decides</option><option value="cumulative">Points added up across all stages</option>
            </select>
          </Q>
        )}
      </div>

      <DiamondLeaguePanel def={def} edit={edit} clubId={(def.event as any)?.ownerId ?? null} />

      <DivisionsPanel def={def} edit={edit} di={di} onSelect={(i) => { setDivIdx(i); setSelId(null); }} />

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-3">
        <div className="space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <Q label="Division name"><Input className={f} value={d.name} onChange={(e) => editDiv((x) => { x.name = e.target.value; })} /></Q>
            <Q label="Entries">
              <select className={sel} value={d.entry} onChange={(e) => editDiv((x) => { x.entry = e.target.value as any; })}>
                <option value="individual">Individual players</option><option value="pairs">Pairs</option>
              </select>
            </Q>
            <Q label="Expected entries"><Input className={f} inputMode="numeric" value={entrants ?? ""} onChange={(e) => editDiv((x) => { const s = x.sections[0]?.stages[0]; if (!s) return; s.input = { ...s.input, entrants: e.target.value ? Number(e.target.value) : null }; })} /></Q>
          </div>

          <div className="rounded border border-white/10 p-2 space-y-1" data-field="tournament-map">
            <div className="font-semibold text-white">{def.divisions.length > 1 ? <>Editing structure for: <span className="underline">{d.name}</span></> : d.name}</div>
            {stages.length === 0 && <div className="text-white/50">No stages yet — add the first stage for {d.name}.</div>}
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
            {stages[stages.length - 1]?.kind === "knockout" && <div className="text-[11px] text-white/50">A knockout is always the last stage for now — change the last stage's format to add another after it.</div>}
            <Button size="sm" variant="outline" className={cn(btn, "mt-1")} disabled={stages[stages.length - 1]?.kind === "knockout"} onClick={() => { let nid = ""; editDiv((x) => { nid = addStage(x); }); setTimeout(() => setSelId(nid), 0); }}><Plus className="h-3 w-3 mr-1" />Add stage{def.divisions.length > 1 ? ` to ${d.name}` : ""}</Button>
          </div>
        </div>

        {sel0 && (
          <div className="rounded border border-white/10 p-2 space-y-2" data-field="stage-panel">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Stage {si + 1} settings</span>
              <span className="text-[11px] text-white/50">set up on its own — nothing is copied from other stages</span>
              {prev && <Button size="sm" variant="outline" className={cn(btn, "ml-auto")} onClick={() => editDiv((x) => copyPreviousStage(x, sel0.id))}>Copy previous stage settings</Button>}
            </div>
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
                  <Q label={sel0.discipline === "doubles" ? "Pairs per pool" : "Players per pool"}><Input className={f} inputMode="numeric" value={sel0.groupSize ?? ""} onChange={(e) => editStage((s) => { s.groupSize = e.target.value ? Number(e.target.value) : null; })} /></Q>
                </>
              )}
              {sel0.kind === "round_robin" && (
                <Q label="4. Rounds — play each other">
                  <select className={sel} value={sel0.legs ?? 1} onChange={(e) => editStage((s) => { s.legs = Number(e.target.value) === 2 ? 2 : 1; })}>
                    <option value={1}>Once (rounds worked out automatically)</option><option value={2}>Twice</option>
                  </select>
                </Q>
              )}
              {sel0.kind === "cross_pool_league" && (
                <>
                  <Q label="3. Number of pools"><Input className={f} inputMode="numeric" value={sel0.groups} onChange={(e) => editStage((s) => { s.groups = Math.max(2, Number(e.target.value) || 2); })} /></Q>
                  <Q label="Players per pool"><Input className={f} inputMode="numeric" value={sel0.groupSize ?? ""} onChange={(e) => editStage((s) => { s.groupSize = e.target.value ? Number(e.target.value) : null; })} /></Q>
                  <Q label="4. Pool rotation">
                    <select className={sel} value={sel0.legs ?? 1} onChange={(e) => editStage((s) => { s.legs = Number(e.target.value) === 2 ? 2 : 1; })}>
                      <option value={1}>Round robin — each pool plays every other pool once</option><option value={2}>Round robin — every other pool twice</option>
                    </select>
                  </Q>
                  <Q label="Pairing inside each tie">
                    <select className={sel} data-field={`stage.${sel0.id}.tiePairing`} value={sel0.tieFormat?.pairing ?? ""} onChange={(e) => editStage((s) => { s.tieFormat = { rubbers: [], sameCourt: true, ...s.tieFormat, pairing: (e.target.value || null) as TiePairing | null }; })}>
                      <option value="">Not decided</option>
                      {(Object.keys(TIE_PAIRING_LABEL) as TiePairing[]).map((k) => <option key={k} value={k}>{TIE_PAIRING_LABEL[k]}</option>)}
                    </select>
                  </Q>
                </>
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

            {sel0.kind === "cross_pool_league" && <TieGames stage={sel0} editStage={editStage} />}
            {prev && (
              <label className="flex items-center gap-2 text-white/80" data-field={`stage.${sel0.id}.sameSession`}>
                <input type="checkbox" checked={sel0.sameSessionAs === prev.id} onChange={(e) => editDiv((x) => setSameSession(x, sel0.id, e.target.checked))} />
                Same session as {prev.name || "the previous stage"} — played straight after it on the same dates and courts
              </label>
            )}
            {sel0.kind === "cross_pool_league" && !sel0.sameSessionAs && (
              <Q label="Session start time (each date)"><Input type="time" className={f} value={sel0.tieFormat?.startTime ?? ""} onChange={(e) => editStage((s) => { if (s.tieFormat) s.tieFormat.startTime = e.target.value || null; })} /></Q>
            )}
            {prev && <Progression def={def} prev={prev} cur={sel0} editDiv={editDiv} />}
            {!prev && <div className="text-[11px] text-white/50">Stage 1 takes the entries.</div>}
          </div>
        )}
      </div>
      <div className="text-white/50">Who can enter, invitations and scoring are on the other tabs. The same checks run before anything is created.</div>
    </div>
  );
}

function Progression({ def, prev, cur, editDiv }: { def: TournamentDefinition; prev: any; cur: any; editDiv: (m: (x: any) => void) => void }) {
  const p = cur.progression ?? {};
  const sc = shapeChange(prev, cur);
  const pooled = prev.kind === "round_robin" && prev.groups > 1;
  // "Top N from each pool" is one owner choice: into a same-type knockout it uses the play-off mapping path,
  // otherwise per-pool slots then this stage's own format (and pair rule when the match type changes).
  const mode = p.mode === "form_pairs" ? "all_continue" : p.mode === "qualifiers" && pooled ? "per_pool" : p.mode === "top_n" && p.perPool ? "per_pool" : p.mode;
  const koMapping = !sc && cur.kind === "knockout";
  const perPoolN = p.mode === "qualifiers" ? prev.advance?.perGroup : p.top;
  const upd = (mut: (st: any, pr: any) => void) => editDiv((x) => {
    const ss = x.sections[0].stages; const i = ss.findIndex((s: any) => s.id === cur.id);
    mut(ss[i], ss[i - 1]); relink(x);
  });
  if (prev.kind === "knockout") return <Note>A knockout eliminates players, so nothing can follow it here. Put the knockout last.</Note>;
  const modes: Array<[string, string]> = [["all_continue", "Everyone continues"], ["top_n", "Top finishers overall (one combined ranking)"]];
  if (pooled) modes.push(["per_pool", "Top N from each pool"]);
  if (!pooled && !sc && cur.kind === "knockout" && (prev.kind === "round_robin" || prev.kind === "swiss")) modes.push(["qualifiers", "Qualifiers by position (play-off mapping)"]);
  const pairOpts: Array<[string, string]> = sc === "to_pairs" ? [["positions", "By finishing position: 1st + 2nd, 3rd + 4th…"], ["fold", "Balanced: 1st + last, 2nd + second-last…"], ["manual", "I'll set the pairs when this stage starts"]]
    : sc === "to_singles" ? [["split", "Each pair's players continue individually, at the pair's position"]] : [];
  return (
    <div className="rounded border border-white/10 p-2 space-y-2" data-field="stage-transition">
      <div className="font-semibold text-white">6. How participants move here from {prev.name || "the previous stage"}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Q label="Who continues">
          <select className={sel} value={mode ?? ""} onChange={(e) => upd((st, pr) => {
            let m = e.target.value;
            if (m === "per_pool" && koMapping) m = "qualifiers";
            if (m === "per_pool") { st.progression = { mode: "top_n", perPool: true, top: 2, standings: p.standings ?? null, pairing: p.pairing ?? null }; pr.advance = { role: "none" }; return; }
            st.progression = m ? { mode: m, standings: p.standings ?? null, pairing: p.pairing ?? null, top: m === "top_n" ? p.top ?? null : null } : null;
            if (m === "qualifiers") { st.progression = { mode: m }; pr.advance = { role: "qualify", perGroup: pr.groups > 1 ? 2 : 4 }; st.qualifierMapping = pr.groups > 1 ? "cross_pool" : "reseed"; }
            else pr.advance = { role: "none" };
          })}>
            <option value="">Choose…</option>{modes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Q>
        {mode === "per_pool" && (
          <Q label="How many qualify from each pool">
            <Input className={f} inputMode="numeric" value={perPoolN ?? ""} onChange={(e) => upd((st, pr) => {
              const n = e.target.value ? Number(e.target.value) : null;
              if (st.progression?.mode === "qualifiers") { pr.advance = { role: "qualify", perGroup: n }; if (st.qualifierTransition) st.qualifierTransition.positions = Array.from({ length: n ?? 0 }, (_, i) => i + 1); }
              else st.progression = { ...st.progression, top: n };
            })} />
          </Q>
        )}
        {mode === "top_n" && (
          <Q label={`How many continue${prev.discipline === "doubles" ? " (pairs)" : ""}`}><Input className={f} inputMode="numeric" value={p.top ?? ""} onChange={(e) => upd((st) => { st.progression = { ...st.progression, top: e.target.value ? Number(e.target.value) : null }; })} /></Q>
        )}
        {mode === "qualifiers" && !pooled && (
          <>
            <Q label={prev.groups > 1 ? "Qualify from each pool" : "How many qualify"}><Input className={f} inputMode="numeric" value={prev.advance?.perGroup ?? ""} onChange={(e) => upd((_st, pr) => { pr.advance = { role: "qualify", perGroup: e.target.value ? Number(e.target.value) : null }; })} /></Q>
            <Q label="How qualifiers are placed">
              <select className={sel} value={cur.qualifierMapping ?? ""} onChange={(e) => upd((st) => { st.qualifierMapping = e.target.value || null; })}>
                <option value="">Not decided</option>{prev.groups > 1 && <option value="cross_pool">Cross-pool (A1 v B2)</option>}<option value="reseed">Re-seed by finishing position</option>{prev.groups > 1 && <option value="same_pool">Within the same pool</option>}
              </select>
            </Q>
          </>
        )}
        {sc && mode && p.mode !== "qualifiers" && (
          <Q label={sc === "to_pairs" ? "How are pairs formed?" : "How do pairs become singles players?"}>
            <select className={sel} value={p.pairing ?? ""} onChange={(e) => upd((st) => { st.progression = { ...st.progression, pairing: e.target.value || null }; })}>
              <option value="">Choose…</option>{pairOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Q>
        )}
        {mode && p.mode !== "qualifiers" && (
          <Q label="Points from earlier stages">
            <select className={sel} value={p.standings ?? ""} onChange={(e) => upd((st) => { st.progression = { ...st.progression, standings: e.target.value || null }; })}>
              <option value="">Choose…</option><option value="carry">Carry forward (also used to rank who continues / pairs)</option><option value="reset">Reset — rank by {prev.name || "previous stage"} only</option>
            </select>
          </Q>
        )}
        {mode && (
          <Q label="Create this stage's games">
            <select className={sel} value={cur.generation ?? ""} onChange={(e) => upd((st) => { st.generation = e.target.value || null; })}>
              <option value="">Not decided</option><option value="owner_approval">After I preview and confirm</option><option value="automatic">Automatically when the previous stage is done</option>
            </select>
          </Q>
        )}
      </div>
      {mode === "per_pool" && perPoolN ? (
        <div className="text-[11px] text-white/70" data-field="per-pool-slots">
          {prev.groups} pools × top {perPoolN} = {prev.groups * perPoolN} qualifiers:{" "}
          {Array.from({ length: perPoolN }, (_, pos) => Array.from({ length: prev.groups }, (_, i) => `${poolDisplay(i, def.divisions.find((d) => d.sections[0]?.stages.some((x: any) => x.id === prev.id))?.poolLabels).replace(/^Pool /, "")}${pos + 1}`)).flat().join(", ")}
          {" "}— each from its own pool's final table, never a combined ranking.
          {!koMapping && cur.kind === "knockout" && " Pairs are formed first, then seeded into the bracket."}
          {!koMapping && cur.kind !== "knockout" && ` Seeded into ${cur.name || "this stage"} as all 1st places, then all 2nd places…`}
        </div>
      ) : null}
      {p.mode === "qualifiers" && pooled && <PoolMapping def={def} prev={prev} cur={cur} upd={upd} />}
      {sc === "to_pairs" && <div className="text-[11px] text-white/50">Singles players are never turned into pairs without this rule. Pairs keep the same identity for every game in this stage.</div>}
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <div className="rounded border border-white/10 p-2 text-[11px] text-white/60">{children}</div>;

/** Divisions first: how many, their names, then pick one to build its own stages. Copy/apply is always explicit. */
function DivisionsPanel({ def, edit, di, onSelect }: { def: TournamentDefinition; edit: Edit; di: number; onSelect: (i: number) => void }) {
  const [multi, setMulti] = useState(def.divisions.length > 1);
  const [adding, setAdding] = useState<{ name: string; from: string } | null>(null);
  const [applying, setApplying] = useState<{ targets: string[]; replace: boolean } | null>(null);
  const src = def.divisions[di];
  const plan = applying ? applyPlan(def, src.id, applying.targets) : [];
  const configured = plan.filter((p) => p.status === "configured");
  return (
    <div className="rounded border border-white/10 p-2 space-y-2" data-field="divisions">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-white">1. How many divisions / categories?</span>
        <label className="flex items-center gap-1"><input type="radio" checked={!multi} disabled={def.divisions.length > 1} onChange={() => setMulti(false)} />One division</label>
        <label className="flex items-center gap-1"><input type="radio" checked={multi} onChange={() => setMulti(true)} />Multiple divisions</label>
        {def.divisions.length > 1 && <span className="text-white/40">(remove extra divisions to go back to one)</span>}
      </div>
      {multi && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {def.divisions.map((x, i) => (
              <span key={x.id} className={cn("inline-flex items-center rounded border", i === di ? "border-white/60 text-white bg-white/[0.06]" : "border-white/15 text-white/60")}>
                <button className="px-2 py-1" onClick={() => onSelect(i)}>{x.name} <span className="text-white/40">· {x.sections.flatMap((y) => y.stages).length} stages</span></button>
                {def.divisions.length > 1 && <button aria-label={`Remove ${x.name}`} className="px-1 text-white/40 hover:text-white" onClick={() => {
                  if (!confirm(`Remove ${x.name} and its own stages? Other divisions are not affected.`)) return;
                  edit((dd) => { removeDivision(dd, x.id); }); onSelect(0);
                }}><Trash2 className="h-3 w-3" /></button>}
              </span>
            ))}
            <Button size="sm" variant="outline" className={btn} onClick={() => setAdding({ name: "", from: "" })}><Plus className="h-3 w-3 mr-1" />Add division</Button>
            {def.divisions.length > 1 && <Button size="sm" variant="outline" className={btn} onClick={() => setApplying({ targets: def.divisions.filter((x) => x.id !== src.id).map((x) => x.id), replace: false })}>Apply {src.name} structure to other divisions…</Button>}
          </div>
          {adding && (
            <div className="flex flex-wrap items-end gap-2 rounded border border-white/10 p-2">
              <Q label="New division name" className="w-40"><Input className={f} autoFocus value={adding.name} placeholder="e.g. Ladies" onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></Q>
              <Q label="Start with" className="w-56">
                <select className={sel} value={adding.from} onChange={(e) => setAdding({ ...adding, from: e.target.value })}>
                  <option value="">Blank — no stages</option>
                  {def.divisions.map((x) => <option key={x.id} value={x.id}>Copy structure from {x.name} (independent copy)</option>)}
                </select>
              </Q>
              <Button size="sm" className="h-8 text-xs" onClick={() => {
                let nid = ""; edit((dd) => { nid = addDivision(dd, adding.name, adding.from ? { copyFromId: adding.from } : undefined); });
                setAdding(null); setTimeout(() => onSelect(def.divisions.length), 0); void nid;
              }}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-white/60" onClick={() => setAdding(null)}>Cancel</Button>
            </div>
          )}
          {applying && (
            <div className="rounded border border-white/10 p-2 space-y-1">
              <div className="text-white">Apply {src.name} structure to:</div>
              {def.divisions.filter((x) => x.id !== src.id).map((x) => {
                const st = plan.find((p) => p.id === x.id)?.status;
                return (
                  <label key={x.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={applying.targets.includes(x.id)} onChange={(e) => setApplying({ ...applying, targets: e.target.checked ? [...applying.targets, x.id] : applying.targets.filter((t) => t !== x.id) })} />
                    {x.name} <span className="text-white/40">{st === "configured" ? "— already has stages" : st === "blank" ? "— blank" : ""}</span>
                  </label>
                );
              })}
              {configured.length > 0 && (
                <label className="flex items-center gap-2 text-amber-300">
                  <input type="checkbox" checked={applying.replace} onChange={(e) => setApplying({ ...applying, replace: e.target.checked })} />
                  Replace the existing stages in {configured.map((c) => c.name).join(", ")} (otherwise they are skipped)
                </label>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs" disabled={!applying.targets.length} onClick={() => {
                  let r = { applied: [] as string[], skipped: [] as { name: string }[] };
                  edit((dd) => { r = applyStructure(dd, src.id, applying.targets, { replaceConfigured: applying.replace }); });
                  toast.success(`Copied to ${r.applied.length} division(s)${r.skipped.length ? `; skipped ${r.skipped.map((s) => s.name).join(", ")}` : ""}. Each copy is independent.`);
                  setApplying(null);
                }}>Apply</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-white/60" onClick={() => setApplying(null)}>Cancel</Button>
              </div>
            </div>
          )}
          <div className="text-white/50">2. Select a division, then build its stages. Each division owns its own stages — changes never spread to another division unless you copy or apply.</div>
        </>
      )}
    </div>
  );
}

/** Cross-pool mapping for a same-type knockout, using the same transition editor/preview as Edit tournament. */
function PoolMapping({ def, prev, cur, upd }: { def: TournamentDefinition; prev: any; cur: any; upd: (m: (st: any, pr: any) => void) => void }) {
  let spec: ReturnType<typeof specFromDefinition> | null = null;
  try { spec = specFromDefinition(def); } catch { return null; }
  const d = spec.divisions.find((x) => x.stages.some((s) => s.id === cur.id));
  const st = d?.stages.find((s) => s.id === cur.id), src = d?.stages.find((s) => s.id === prev.id);
  if (!d || !st || !src) return null;
  const labels = def.divisions.find((x) => x.id === d.divisionId)?.poolLabels;
  return (
    <TransitionEditor stage={st} source={src} poolLabels={labels} value={st.qualify?.transition ?? null}
      onChange={(t) => upd((s, pr) => {
        const { sourceStageId: _a, destinationStageId: _b, generation: _g, ...rest } = t as any;
        s.qualifierTransition = rest; s.qualifierMapping = t.method === "cross_pool" ? "cross_pool" : "reseed";
        pr.advance = { role: "qualify", perGroup: Math.max(...t.positions) };
      })} />
  );
}

/** Ordered games inside one pool-v-pool tie (one discipline per stage; link stages for mixed evenings). */
function TieGames({ stage, editStage }: { stage: any; editStage: (m: (s: any) => void) => void }) {
  const t = stage.tieFormat ?? { rubbers: [], pairing: null };
  const need = stage.discipline === "doubles" ? 2 : 1;
  const parse = (v: string) => v.split(/[+,\s]+/).map(Number).filter((n) => n > 0).slice(0, 2);
  const upd = (i: number, patch: any) => editStage((s) => { s.tieFormat.rubbers[i] = { ...s.tieFormat.rubbers[i], ...patch }; });
  return (
    <div className="rounded border border-white/10 p-2 space-y-1" data-field={`stage.${stage.id}.tieGames`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">Games in each tie (in order, same court)</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 bg-transparent border-white/20 text-white/80 text-[11px]" disabled={!stage.groupSize}
          onClick={() => editStage((s) => { s.tieFormat = { sameCourt: true, pairing: null, ...s.tieFormat, rubbers: standardRubbers(s.discipline, s.groupSize, s.discipline === "doubles" ? 30 : 20) }; })}>
          Fill {stage.discipline === "doubles" ? "1+2, 3+4…" : "1v1…"} from pool size
        </Button>
      </div>
      {t.rubbers.map((r: any, i: number) => {
        const opp = opponentPositions(r, t.pairing);
        return (
          <div key={i} className="flex items-center gap-1 text-[11px]">
            <span className="w-12 text-white/50">Game {i + 1}</span>
            <Input className="h-7 w-16 bg-white/5 border-white/15 text-white text-xs" value={r.positions.join("+")} onChange={(e) => { const p = parse(e.target.value); if (p.length) upd(i, { positions: p, discipline: stage.discipline }); }} aria-label={`Game ${i + 1} positions`} />
            <span className="text-white/50">v</span>
            {t.pairing === "custom"
              ? <Input className="h-7 w-16 bg-white/5 border-white/15 text-white text-xs" value={(r.positionsB ?? []).join("+")} onChange={(e) => upd(i, { positionsB: parse(e.target.value) })} aria-label={`Game ${i + 1} opponent positions`} />
              : <span className="w-16 text-white/80">{opp ? opp.join("+") : "?"}</span>}
            <Input className="h-7 w-14 bg-white/5 border-white/15 text-white text-xs" inputMode="numeric" value={r.minutes} onChange={(e) => upd(i, { minutes: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Game ${i + 1} minutes`} />
            <span className="text-white/50">min</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-white/60" aria-label={`Remove game ${i + 1}`} onClick={() => editStage((s) => { s.tieFormat.rubbers.splice(i, 1); })}><Trash2 className="h-3 w-3" /></Button>
          </div>
        );
      })}
      <Button size="sm" variant="outline" className="h-7 bg-transparent border-white/20 text-white/80 text-[11px]"
        onClick={() => editStage((s) => { s.tieFormat = { sameCourt: true, pairing: null, rubbers: [], ...s.tieFormat }; const n = s.tieFormat.rubbers.length; s.tieFormat.rubbers.push({ discipline: s.discipline, positions: need === 2 ? [2 * n + 1, 2 * n + 2] : [n + 1], minutes: need === 2 ? 30 : 20 }); })}>
        <Plus className="h-3 w-3 mr-1" />Add game
      </Button>
      <div className="text-white/50 text-[11px]">One match type per stage. For singles then doubles on the same evening, add a Doubles stage and tick "Same session".</div>
    </div>
  );
}

