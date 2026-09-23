import { useState } from "react";
import { Plus, Trash2, ArrowLeft, ArrowRight, AlertTriangle, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  STAGE_KINDS, STAGE_LABELS, newId, newStage,
  type Division, type Stage, type StageKind, type TournamentDefinition,
} from "@/lib/smart-builder/definition";
import type { ValidationResult } from "@/lib/smart-builder/validate";

const field = "h-8 bg-white/5 border-white/15 text-white text-xs";
const sel = "h-8 rounded-md bg-white/5 border border-white/15 text-white text-xs px-2";

interface Props {
  def: TournamentDefinition;
  validation: ValidationResult;
  onChange: (next: TournamentDefinition) => void;
}

export function DesignCanvas({ def, validation, onChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const mutate = (fn: (d: TournamentDefinition) => void) => {
    const next = structuredClone(def);
    fn(next);
    onChange(next);
  };
  const find = (d: TournamentDefinition, stageId: string) => {
    for (const div of d.divisions) for (const sec of div.sections) {
      const i = sec.stages.findIndex((s) => s.id === stageId);
      if (i >= 0) return { div, sec, i };
    }
    return null;
  };

  const addStage = (divId: string, secId: string, at: number, kind: StageKind = "knockout") =>
    mutate((d) => {
      const sec = d.divisions.find((x) => x.id === divId)!.sections.find((x) => x.id === secId)!;
      const st = newStage(kind);
      const prev = sec.stages[at - 1];
      if (prev) st.input = { fromStageId: prev.id };
      const nextStage = sec.stages[at];
      if (nextStage) nextStage.input = { ...nextStage.input, fromStageId: st.id };
      sec.stages.splice(at, 0, st);
      setSelected(st.id);
    });

  const issuesFor = (id: string) => validation.issues.filter((i) => i.stageId === id);
  const selectedRef = selected ? find(def, selected) : null;
  const stage = selectedRef ? selectedRef.sec.stages[selectedRef.i] : null;

  const patchStage = (p: Partial<Stage>) =>
    mutate((d) => {
      const r = find(d, selected!);
      if (r) r.sec.stages[r.i] = { ...r.sec.stages[r.i], ...p } as Stage;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className={cn(field, "max-w-sm font-semibold")} value={def.name} onChange={(e) => mutate((d) => { d.name = e.target.value; })} />
        <Button size="sm" variant="outline" className="h-8 border-white/20 bg-transparent text-white/80" onClick={() => mutate((d) => {
          d.divisions.push({ id: newId("div"), name: `Division ${d.divisions.length + 1}`, eligibility: "open", entry: "individual",
            sections: [{ id: newId("sec"), name: "Main", stages: [] }] });
        })}><Plus className="w-3 h-3 mr-1" /> Division</Button>
      </div>

      {def.divisions.length === 0 && (
        <p className="text-xs text-white/50">No structure yet. Describe the tournament in the chat, or add a division.</p>
      )}

      {def.divisions.map((div) => (
        <div key={div.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
          <DivisionHeader div={div} onPatch={(p) => mutate((d) => Object.assign(d.divisions.find((x) => x.id === div.id)!, p))}
            onRemove={() => mutate((d) => { d.divisions = d.divisions.filter((x) => x.id !== div.id); })}
            onAddSection={() => mutate((d) => { const x = d.divisions.find((y) => y.id === div.id)!; x.sections.push({ id: newId("sec"), name: `Section ${x.sections.length + 1}`, stages: [] }); })} />
          {div.sections.map((sec) => (
            <div key={sec.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Input className={cn(field, "w-40")} value={sec.name} onChange={(e) => mutate((d) => { d.divisions.find((x) => x.id === div.id)!.sections.find((x) => x.id === sec.id)!.name = e.target.value; })} />
                {div.sections.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-white/40" onClick={() => mutate((d) => { const x = d.divisions.find((y) => y.id === div.id)!; x.sections = x.sections.filter((s) => s.id !== sec.id); })}><Trash2 className="w-3 h-3" /></Button>
                )}
              </div>
              <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
                <AddBtn onClick={() => addStage(div.id, sec.id, 0)} />
                {sec.stages.map((st, i) => {
                  const iss = issuesFor(st.id);
                  const err = iss.some((x) => x.level === "error");
                  const warn = iss.some((x) => x.level === "warning");
                  const flow = validation.flows[st.id];
                  return (
                    <div key={st.id} className="flex items-stretch gap-1">
                      <button onClick={() => setSelected(st.id)} className={cn(
                        "min-w-[170px] text-left rounded-lg border p-2 text-xs transition-colors",
                        selected === st.id ? "border-amber-400/70 bg-white/10" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]",
                        err && "border-red-400/60", !err && warn && "border-amber-300/50",
                      )}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white truncate">{st.name}</span>
                          {err ? <XCircle className="w-3 h-3 text-red-400" /> : warn ? <AlertTriangle className="w-3 h-3 text-amber-300" /> : null}
                        </div>
                        <div className="text-white/50">{STAGE_LABELS[st.kind]} · {st.discipline}</div>
                        <div className="text-white/70 mt-1">
                          {st.kind === "pair_from_positions"
                            ? (st.pairing ?? []).map((p) => `${p[0]}+${p[1]}`).join(", ") || "choose positions"
                            : `${st.groups} × ${st.groupSize ?? (st.dynamic ? "TBD" : "?")}`}
                        </div>
                        {flow && (
                          <div className="text-white/40 mt-1">in {flow.supply ?? "TBD"} {flow.unit}{flow.outTotal ? ` → out ${flow.outTotal}` : ""}</div>
                        )}
                        {st.dynamic && <div className="text-sky-300/80 mt-1">Resolves at registration close</div>}
                      </button>
                      <AddBtn onClick={() => addStage(div.id, sec.id, i + 1)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {stage && selectedRef && (
        <StageEditor
          stage={stage}
          siblings={selectedRef.sec.stages.filter((s) => s.id !== stage.id)}
          issues={issuesFor(stage.id)}
          onPatch={patchStage}
          onMove={(dir) => mutate((d) => {
            const r = find(d, stage.id)!; const j = r.i + dir;
            if (j < 0 || j >= r.sec.stages.length) return;
            [r.sec.stages[r.i], r.sec.stages[j]] = [r.sec.stages[j], r.sec.stages[r.i]];
          })}
          onRemove={() => mutate((d) => {
            const r = find(d, stage.id)!;
            r.sec.stages.forEach((s) => { if (s.input.fromStageId === stage.id) s.input = { ...s.input, fromStageId: stage.input.fromStageId ?? null }; });
            r.sec.stages.splice(r.i, 1);
            setSelected(null);
          })}
        />
      )}
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Add Stage" className="shrink-0 self-center rounded-md border border-dashed border-white/20 px-1.5 py-3 text-[10px] text-white/50 hover:text-white hover:border-white/40">
      <Plus className="w-3 h-3 mx-auto" />Stage
    </button>
  );
}

function DivisionHeader({ div, onPatch, onRemove, onAddSection }: {
  div: Division; onPatch: (p: Partial<Division>) => void; onRemove: () => void; onAddSection: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className={cn(field, "w-44 font-semibold")} value={div.name} onChange={(e) => onPatch({ name: e.target.value })} />
      <select className={sel} value={div.eligibility} onChange={(e) => onPatch({ eligibility: e.target.value as Division["eligibility"] })}>
        <option value="men">Men</option><option value="ladies">Ladies</option><option value="mixed">Mixed (1M+1F)</option>
        <option value="open">Open</option><option value="open_any_pair">Open — any pair</option>
      </select>
      <select className={sel} value={div.entry} onChange={(e) => onPatch({ entry: e.target.value as Division["entry"] })}>
        <option value="individual">Players enter individually</option><option value="pairs">Players enter as pairs</option>
      </select>
      <Button size="sm" variant="ghost" className="h-8 text-white/60" onClick={onAddSection}><Plus className="w-3 h-3 mr-1" />Section</Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-white/40 ml-auto" onClick={onRemove}><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function StageEditor({ stage, siblings, issues, onPatch, onMove, onRemove }: {
  stage: Stage; siblings: Stage[]; issues: ValidationResult["issues"];
  onPatch: (p: Partial<Stage>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));
  return (
    <div className="rounded-xl border border-amber-400/30 bg-white/[0.04] p-3 space-y-3 text-xs text-white/80">
      <div className="flex items-center gap-2">
        <Input className={cn(field, "w-56 font-semibold")} value={stage.name} onChange={(e) => onPatch({ name: e.target.value })} />
        <select className={sel} value={stage.kind} onChange={(e) => onPatch({ kind: e.target.value as StageKind })}>
          {STAGE_KINDS.map((k) => <option key={k} value={k}>{STAGE_LABELS[k]}</option>)}
        </select>
        <select className={sel} value={stage.discipline} onChange={(e) => onPatch({ discipline: e.target.value as Stage["discipline"] })}>
          <option value="singles">Singles</option><option value="doubles">Doubles</option>
        </select>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 text-white/60" onClick={() => onMove(-1)}><ArrowLeft className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-white/60" onClick={() => onMove(1)}><ArrowRight className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-300" onClick={onRemove}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <L label="Players / pairs come from">
          <select className={cn(sel, "w-full")} value={stage.input.fromStageId ?? ""} onChange={(e) => onPatch({ input: { ...stage.input, fromStageId: e.target.value || null } })}>
            <option value="">Registrations</option>
            {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </L>
        {!stage.input.fromStageId && (
          <L label="Entrants (blank = TBD)"><Input className={field} value={stage.input.entrants ?? ""} onChange={(e) => onPatch({ input: { ...stage.input, entrants: num(e.target.value) } })} /></L>
        )}
        {stage.kind === "pair_from_positions" ? (
          <L label="Pairs (e.g. 1+2, 3+4, 5+6)">
            <Input className={field} defaultValue={(stage.pairing ?? []).map((p) => `${p[0]}+${p[1]}`).join(", ")}
              onBlur={(e) => onPatch({ pairing: e.target.value.split(",").map((x) => x.split("+").map((n) => Number(n.trim()))).filter((p) => p.length === 2 && p.every((n) => n > 0)) })} />
          </L>
        ) : (
          <>
            <L label={stage.kind === "knockout" ? "Draws" : "Pools / groups"}><Input className={field} value={stage.groups} onChange={(e) => onPatch({ groups: Math.max(1, num(e.target.value) ?? 1) })} /></L>
            <L label={stage.kind === "knockout" ? "Draw size" : "Per group"}><Input className={field} value={stage.groupSize ?? ""} onChange={(e) => onPatch({ groupSize: num(e.target.value) || null })} /></L>
          </>
        )}
        {(stage.kind === "round_robin" || stage.kind === "swiss") && (
          <>
            <L label="What advances">
              <select className={cn(sel, "w-full")} value={stage.advance.role} onChange={(e) => onPatch({ advance: { ...stage.advance, role: e.target.value as Stage["advance"]["role"] } })}>
                <option value="none">Nothing (final stage)</option><option value="qualify">Top finishers qualify</option><option value="seed">Everyone (sets seeding)</option>
              </select>
            </L>
            {stage.advance.role === "qualify" && (
              <L label="Per group"><Input className={field} value={stage.advance.perGroup ?? ""} onChange={(e) => onPatch({ advance: { ...stage.advance, perGroup: num(e.target.value) } })} /></L>
            )}
          </>
        )}
        {stage.kind === "swiss" && <L label="Swiss rounds"><Input className={field} value={stage.swissRounds ?? ""} onChange={(e) => onPatch({ swissRounds: num(e.target.value) })} /></L>}
        {stage.kind === "knockout" && (
          <>
            <L label="Seeded matchups (e.g. 1v4,2v3)"><Input className={field} value={stage.seededMatchups ?? ""} onChange={(e) => onPatch({ seededMatchups: e.target.value || null })} /></L>
            <L label="Strength bands (comma)"><Input className={field} defaultValue={(stage.seedingBands ?? []).join(", ")} onBlur={(e) => onPatch({ seedingBands: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></L>
          </>
        )}
        <L label="Min matches each"><Input className={field} value={stage.minMatches ?? ""} onChange={(e) => onPatch({ minMatches: num(e.target.value) })} /></L>
        <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={!!stage.dynamic} onChange={(e) => onPatch({ dynamic: e.target.checked })} /> Decide when registration closes</label>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((i, k) => (
            <li key={k} className="flex gap-2">
              {i.level === "error" ? <XCircle className="w-3 h-3 mt-0.5 text-red-400 shrink-0" /> : i.level === "warning" ? <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-300 shrink-0" /> : <Info className="w-3 h-3 mt-0.5 text-sky-300 shrink-0" />}
              <span>{i.message}{i.fix && <span className="text-white/50"> — {i.fix}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-white/50">{label}</span>{children}</label>;
}
