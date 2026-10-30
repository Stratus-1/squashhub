import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { originalStructureFromAnswers, answersFromOriginalStructure } from "@/lib/smart-builder/original-structure";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { StepAnswers } from "./StepByStepBuilder";
import { addCardDivision, addCardSubdivision, cardStructureIssues, patchCardStage, saveCardStructure } from "@/lib/smart-builder/card-structure";
import { DIVISION_PRESETS, STRUCTURE_ELIGIBILITY_LABELS, applyStructurePreset, duplicateStructureRow, renameStructureKey, rowStages, structureEligibility, structureEligibilityAdvisory, structureUnits } from "@/lib/smart-builder/structure-rows";
import { FORMAT_HELP, baseFormatOf, formatHelpHidden, type BaseFormat } from "@/lib/smart-builder/format-help";
import { stageMatches } from "@/lib/smart-builder/structure-capacity";
import { monradPlan } from "@/lib/smart-builder/monrad";
import { evaluateStructures } from "@/lib/smart-builder/structure-guide";
import { categoryEstimate } from "@/lib/smart-builder/expected-entries";
import { RRTopologyEditor } from "./RRTopologyEditor";
import { rrFinishIssues, rrFinishSplit } from "@/lib/tournaments/swiss-rr-finish";
import { FormatLearnButton, FormatLearnDialog } from "./FormatLearnDialog";
import type { LearnFormat } from "@/lib/smart-builder/format-learn";
import type { StageKind } from "@/lib/smart-builder/stage-plan";

const control = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";
type Scoring = NonNullable<StepAnswers["scoring"]>;
const defaults: Scoring = { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapMinutes: "", timeCapPlay: "", timeCapBreak: "" };
const formats: BaseFormat[] = ["round_robin", "swiss", "knockout", "monrad"];

function RuleFields({ value, label, onChange }: { value: Scoring; label: string; onChange: (patch: Partial<Scoring>) => void }) {
  return <div className="grid gap-2 sm:grid-cols-3" aria-label={`${label} match rules`}>
    <label className="space-y-1"><span>Scoring</span><select className={control} aria-label={`${label} scoring`} value={value.mode} onChange={(e) => onChange({ mode: e.target.value as Scoring["mode"] })}><option value="standard">Standard</option><option value="time_capped_points">Bells / timed</option></select></label>
    {value.mode === "standard" ? <>
      <label className="space-y-1"><span>Points per game</span><select className={control} aria-label={`${label} points`} value={value.pointsPerGame} onChange={(e) => onChange({ pointsPerGame: Number(e.target.value) as 7 | 11 | 15 })}><option value="7">PAR 7</option><option value="11">PAR 11</option><option value="15">PAR 15</option></select></label>
      <label className="space-y-1"><span>Games</span><select className={control} aria-label={`${label} games`} value={value.playAllGames ? `all${value.bestOf}` : value.bestOf} onChange={(e) => onChange({ bestOf: Number(e.target.value.replace("all", "")) as 3 | 5, playAllGames: e.target.value.startsWith("all") })}><option value="3">Best of 3</option><option value="5">Best of 5</option><option value="all3">Play all 3</option><option value="all5">Play all 5</option></select></label>
      <label className="space-y-1"><span>Win condition</span><select className={control} aria-label={`${label} win condition`} value={value.winCondition} onChange={(e) => onChange({ winCondition: e.target.value as Scoring["winCondition"] })}><option value="win_by_2">Win by 2</option><option value="sudden_death">Sudden death</option></select></label>
    </> : <>
      <label className="space-y-1"><span>Playing minutes</span><Input className={control} type="number" min={1} aria-label={`${label} playing minutes`} value={value.timeCapPlay} onChange={(e) => onChange({ timeCapPlay: e.target.value })} /></label>
      <label className="space-y-1"><span>Changeover minutes</span><Input className={control} type="number" min={0} aria-label={`${label} changeover minutes`} value={value.timeCapBreak} onChange={(e) => onChange({ timeCapBreak: e.target.value })} /></label>
      {value.timeCapMinutes && !value.timeCapPlay && <span>Saved slot: {value.timeCapMinutes} minutes</span>}
    </>}
  </div>;
}

function NameField({ value, label, disabled, onCommit }: { value: string; label: string; disabled: boolean; onCommit: (name: string) => void }) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  return <Input className={control} aria-label={label} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} onBlur={() => { onCommit(name); if (!name.trim() || name.includes("::")) setName(value); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

export function CardStructureEditor({ clubId, answers, onSave, onDirtyChange }: { clubId?: string; answers: StepAnswers; onSave: (a: StepAnswers) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(answers);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [help, setHelp] = useState(true);
  const [advice, setAdvice] = useState(false);
  const [learn, setLearn] = useState<LearnFormat | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(answers);
  useEffect(() => { setDraft(answers); }, [answers]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const update = (fn: (a: StepAnswers) => StepAnswers) => { setSaved(false); setDraft(fn); };
  const issues = cardStructureIssues(draft);
  const locked = (key: string) => Object.values(draft.picks).some((v) => (Array.isArray(v) ? v : [v]).some((k) => k === key || k.startsWith(`${key}::`)));
  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: o[key] === false }));
  const showHelp = (kind: StageKind) => {
    const b = baseFormatOf(kind);
    if (b && !formatHelpHidden()) toast(FORMAT_HELP[b].title, { id: "card-format-help", closeButton: true, duration: 8000, description: FORMAT_HELP[b].definition });
  };
  const add = (kind: StageKind) => { update((a) => addCardDivision(a, kind).answers); showHelp(kind); };
  const setFormat = (key: string, kind: StageKind) => {
    update((a) => {
      const first = rowStages(a, key)[0];
      return patchCardStage(a, key, { kind, pools: kind === "round_robin" ? first.pools ?? 1 : null, rounds: kind === "swiss" ? first.rounds ?? 5 : null });
    }); showHelp(kind);
  };
  function unit(key: string, cat: string, sub = false) {
    const name = sub ? key.split("::")[1] : cat;
    const subs = draft.subcats[cat] ?? [];
    const parent = !sub && subs.length > 0;
    const first = rowStages(draft, key)[0];
    const kind = baseFormatOf(first.kind);
    const sc = draft.scoringOverrides[key] ?? draft.scoringOverrides[cat] ?? draft.scoring ?? defaults;
    const n = Number(draft.unitEntries[key]) || 0;
    const matches = stageMatches(first, n);
    const isOpen = open[key] !== false;
    return <article key={key} className={sub ? "border-t border-border py-3" : "overflow-hidden rounded-md border border-border bg-card"} data-testid={`card-division-${key}`}>
      <header className="flex min-w-0 items-center gap-2 bg-muted/30 px-3 py-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Toggle ${key}`} aria-expanded={isOpen} onClick={() => toggle(key)}>{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</Button>
        <span className="min-w-0 flex-1 break-words font-semibold">{name}</span>
        <Badge variant="secondary" className="hidden text-[11px] sm:inline-flex">{parent ? `${subs.length} subdivisions` : kind ? FORMAT_HELP[kind].title : "Format needed"}</Badge>
        {!sub && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Duplicate ${cat}`} title="Duplicate division settings" onClick={() => update((a) => duplicateStructureRow(a, cat))}><Copy className="h-3.5 w-3.5" /></Button>}
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={locked(key)} aria-label={`Remove ${key}`} title="Remove from draft" onClick={() => update((a) => sub ? { ...a, subcats: { ...a.subcats, [cat]: a.subcats[cat].filter((s) => s !== name) } } : { ...a, categories: a.categories.filter((c) => c !== cat) })}><Trash2 className="h-3.5 w-3.5" /></Button>
      </header>
      {isOpen && <div className="space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1"><span>{sub ? "Subdivision name" : "Division name"}</span><NameField label={`${key} name`} value={name} disabled={locked(key)} onCommit={(v) => update((a) => renameStructureKey(a, key, v))} /></label>
          {!sub && <label className="space-y-1"><span>Preset (optional)</span><select className={control} aria-label={`${cat} preset`} value="" disabled={locked(cat)} onChange={(e) => update((a) => applyStructurePreset(a, cat, e.target.value))}><option value="">Custom / choose preset</option>{DIVISION_PRESETS.map((p) => <option key={p.name} disabled={p.name !== cat && draft.categories.includes(p.name)}>{p.name}</option>)}</select></label>}
          <label className="space-y-1"><span>Match type</span><select className={control} aria-label={`${key} discipline`} value={draft.disc[key] ?? draft.disc[cat] ?? "singles"} onChange={(e) => update((a) => ({ ...a, disc: { ...a.disc, [key]: e.target.value as "singles" | "doubles" } }))}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
          {!sub ? <label className="space-y-1"><span>Participant eligibility</span><select className={control} aria-label={`${cat} eligibility`} value={structureEligibility(draft, cat) ?? ""} onChange={(e) => update((a) => ({ ...a, categoryTypes: { ...a.categoryTypes, [cat]: e.target.value as NonNullable<StepAnswers["categoryTypes"]>[string] } }))}><option value="" disabled>Choose eligibility</option>{Object.entries(STRUCTURE_ELIGIBILITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label> : <div className="space-y-1"><span>Participant eligibility</span><p className="py-2 text-muted-foreground">{STRUCTURE_ELIGIBILITY_LABELS[structureEligibility(draft, cat) ?? "open"]} · inherited</p></div>}
          {parent ? <div>Expected: <b>{categoryEstimate(draft, cat)}</b> total</div> : <label className="space-y-1"><span>Expected {draft.disc[key] === "doubles" ? "pairs" : "players"}</span><Input type="number" min={2} className={control} aria-label={`${key} expected entries`} value={draft.unitEntries[key] ?? ""} onChange={(e) => update((a) => ({ ...a, unitEntries: { ...a.unitEntries, [key]: e.target.value } }))} /></label>}
        </div>
        {structureEligibilityAdvisory(draft, key) && <p className="text-muted-foreground" role="note">{structureEligibilityAdvisory(draft, key)}</p>}
        {!parent && <>
          <div className="space-y-2 border-t border-border pt-3">
            <div className="font-semibold">Draw format</div><div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="group" aria-label={`${key} draw format`}>{formats.map((f) => <Button key={f} size="sm" variant={kind === f ? "default" : "outline"} className="h-auto min-h-8 whitespace-normal px-2 text-xs" aria-pressed={kind === f} onClick={() => setFormat(key, f)}>{f === "monrad" ? "Monrad" : FORMAT_HELP[f].title}</Button>)}</div>
            {first.kind && !kind && <p className="text-muted-foreground">Saved format: {first.kind}. Retained unless you choose another.</p>}
            {kind === "swiss" && <label className="flex items-center gap-2">Swiss rounds<Input type="number" min={1} max={15} className="h-8 w-20 text-xs" aria-label={`${key} Swiss rounds`} value={first.rounds ?? ""} onChange={(e) => update((a) => patchCardStage(a, key, { rounds: Number(e.target.value) || null }))} /></label>}
            {kind === "swiss" && (() => {
              const rr = first.rrFinish;
              const groups = rr?.groups ?? Math.max(1, Math.floor(n / 4) - (n % 4 === 1 ? 1 : 0));
              const issues = rr?.enabled ? rrFinishIssues(n, first.endAfterRound ?? first.rounds, groups) : [];
              const split = rrFinishSplit(n, groups);
              return <div className="space-y-1 rounded-md border border-border p-2" data-testid={`rr-finish-${key}`}>
                <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${key} round robin in final 3 rounds`} checked={!!rr?.enabled} onChange={(e) => update((a) => patchCardStage(a, key, { rrFinish: e.target.checked ? { enabled: true, groups } : null }))} />Round robin in final 3 rounds <Badge variant="outline">Pilot</Badge></label>
                {rr?.enabled && <>
                  <label className="flex items-center gap-2">Groups of 4<Input type="number" min={1} max={Math.max(1, Math.floor(n / 4))} className="h-8 w-20 text-xs" aria-label={`${key} round robin groups`} value={groups} onChange={(e) => update((a) => patchCardStage(a, key, { rrFinish: { enabled: true, groups: Math.max(1, Math.floor(Number(e.target.value)) || 1) } }))} /></label>
                  <p className="text-muted-foreground">Rounds 1–2 are Swiss. After Round 2 the positions are fixed: {split.groupRanges.map(([s, e]) => `${s}–${e}`).join(", ")} each play everyone in their group in Rounds 3–5.{split.remainder ? ` Positions ${split.remainder[0]}–${split.remainder[1]} carry on Swiss among themselves.` : ""} Standings keep counting all 5 rounds.</p>
                  {issues.map((m) => <p key={m} className="text-destructive">{m}</p>)}
                </>}
              </div>;
            })()}
            {kind === "monrad" && (() => { const plan = monradPlan(n); return <p className="text-muted-foreground">{plan ? `${n} expected player${n === 1 ? "" : "s"} → ${plan.rounds} round${plan.rounds === 1 ? "" : "s"} · ${plan.byes ? `${plan.bracket}-draw with ${plan.byes} bye${plan.byes === 1 ? "" : "s"} (top seeds)` : `full ${plan.bracket}-draw`} · ≈${plan.matches} matches. Every player plays every round and all finishing places are decided.` : "Enter expected entries to estimate the rounds, draw size and byes."} Draw generation is not available yet.</p>; })()}
            {kind === "round_robin" && <>
              <label className="flex items-center gap-2">Pools<Input className="h-8 w-20 text-xs" type="number" min={1} max={26} aria-label={`${key} pool count`} value={first.pools ?? 1} onChange={(e) => update((a) => { const count = Math.min(26, Math.max(1, Number(e.target.value) || 1)); return patchCardStage(a, key, { pools: count, poolNames: Array.from({ length: count }, (_, i) => rowStages(a, key)[0].poolNames?.[i] ?? `Pool ${i + 1}`) }); })} /></label>
              {(first.pools ?? 1) > 1 && <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: first.pools ?? 1 }, (_, i) => <label key={i} className="space-y-1"><span>Pool {i + 1} name</span><Input className={control} aria-label={`${key} pool ${i + 1} name`} value={first.poolNames?.[i] ?? `Pool ${i + 1}`} onChange={(e) => update((a) => patchCardStage(a, key, { poolNames: Array.from({ length: first.pools ?? 1 }, (_, j) => j === i ? e.target.value : first.poolNames?.[j] ?? `Pool ${j + 1}`) }))} /></label>)}</div>}
              {(first.pools ?? 1) > 1 && <div className="space-y-1" role="radiogroup" aria-label={`${key} pool allocation`}>
                <span className="font-medium">How are players split into the pools?</span>
                {([
                  { v: "snake" as const, t: "Snake (even pools)", d: `Seeds zig-zag down and back: Pool A gets 1, 4, 5, 8… and Pool B gets 2, 3, 6, 7… so both pools are equally strong.` },
                  { v: "banded" as const, t: "Strength bands", d: `Straight down the ranking: Pool A gets seeds 1–5, Pool B gets 6–10 — Pool A is the strongest band, Pool B the next.` },
                ]).map((o) => (
                  <label key={o.v} className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${(first.poolAllocation ?? "snake") === o.v ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" name={`${key}-pool-allocation`} className="mt-0.5" checked={(first.poolAllocation ?? "snake") === o.v} onChange={() => update((a) => patchCardStage(a, key, { poolAllocation: o.v }))} />
                    <span><span className="font-medium block">{o.t}</span><span className="text-muted-foreground">{o.d}</span></span>
                  </label>
                ))}
              </div>}
              <details><summary className="cursor-pointer py-1 font-medium">Who plays whom?</summary><RRTopologyEditor stage={first} entrants={n} label={key} onChange={(p) => update((a) => patchCardStage(a, key, p))} /></details>
            </>}
            <div className="text-muted-foreground">{matches == null ? "Match estimate needs complete settings." : `${matches} estimated matches`} {rowStages(draft, key).length > 1 && "· Saved later stages retained."}</div>
          </div>
          <details className="border-t border-border pt-2"><summary className="cursor-pointer py-1 font-medium">Match rules · {draft.scoringOverrides[key] ? "custom" : "inherited"}</summary><div className="space-y-2 pt-2"><label className="flex items-center gap-2"><input type="checkbox" checked={!!draft.scoringOverrides[key]} onChange={(e) => update((a) => { const overrides = { ...a.scoringOverrides }; if (e.target.checked) overrides[key] = { ...sc }; else delete overrides[key]; return { ...a, scoringOverrides: overrides }; })} />Custom rules for this group</label>{draft.scoringOverrides[key] ? <RuleFields value={sc} label={key} onChange={(p) => update((a) => ({ ...a, scoringOverrides: { ...a.scoringOverrides, [key]: { ...sc, ...p } } }))} /> : <p>Default rules apply.</p>}</div></details>
          {advice && (() => { const rec = evaluateStructures({ n, outcome: draft.guide?.outcome, strength: draft.guide?.strength, time: draft.guide?.time, isChamps: draft.kind === "period" })[0]; return rec ? <div className="space-y-1 border-t border-border pt-2"><span className="font-medium">Suggested: {rec.title}</span><p className="text-muted-foreground">{rec.why}</p><Button variant="outline" size="sm" onClick={() => update((a) => patchCardStage(a, key, { kind: rec.kind, pools: rec.pools?.length ?? 1, rounds: rec.rounds ?? null }))}>Use recommendation</Button></div> : <p>Enter expected entries for advice.</p>; })()}
        </>}
        {!sub && <div className="border-t border-border pt-2"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Subdivisions</span><Button variant="outline" size="sm" className="h-7 text-xs" disabled={locked(cat)} onClick={() => update((a) => addCardSubdivision(a, cat).answers)}><Plus className="mr-1 h-3 w-3" />Add Group</Button></div>{subs.map((s) => unit(`${cat}::${s}`, cat, true))}</div>}
      </div>}
    </article>;
  }
  if (clubId) return <ClubChampsTab clubId={clubId} structureOnly={{ initial: originalStructureFromAnswers(answers), onDirtyChange, onSave: (raw) => { onSave(answersFromOriginalStructure(answers, raw)); onDirtyChange?.(false); } }} />;
  return <div className="space-y-3 text-xs" data-testid="card-structure-editor">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Tournament structure</h3><Button size="sm" variant="outline" className="h-7 text-xs" aria-pressed={advice} onClick={() => setAdvice(!advice)}>Help me choose</Button></div>
    <details open className="border-y border-border py-3"><summary className="mb-2 cursor-pointer font-semibold">Default match rules</summary><RuleFields value={draft.scoring ?? defaults} label="Default" onChange={(p) => update((a) => ({ ...a, scoring: { ...(a.scoring ?? defaults), ...p } }))} />{!draft.scoring && <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => update((a) => ({ ...a, scoring: { ...defaults } }))}>Use PAR 11 · Best of 5 · Win by 2</Button>}</details>
    <div className={`grid items-start gap-3 ${help ? "lg:grid-cols-[minmax(0,1fr)_200px]" : ""}`}>
      <div className="min-w-0 space-y-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/x-card-format") as BaseFormat; if (formats.includes(k)) add(k); }} aria-label="Division cards">
        {draft.categories.filter((c) => c.trim()).map((c) => unit(c, c))}
        <div className="grid grid-cols-2 gap-2 border border-dashed border-border p-3 sm:grid-cols-4">{formats.map((f) => <Button key={f} variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal text-xs" onClick={() => add(f)}><Plus className="mr-1 h-3 w-3 shrink-0" />{f === "monrad" ? "Monrad" : FORMAT_HELP[f].title}</Button>)}</div>
      </div>
      {help ? <aside className="space-y-3 border-l border-border pl-3" aria-label="Format descriptions"><div className="flex items-center justify-between"><h4 className="font-semibold">Format palette</h4><Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Close format descriptions" onClick={() => setHelp(false)}><X className="h-3 w-3" /></Button></div>{formats.map((f) => <div key={f} className="space-y-1"><div className="flex items-start gap-1"><Button draggable onDragStart={(e) => e.dataTransfer.setData("application/x-card-format", f)} variant="outline" size="sm" className="h-auto min-h-8 w-full justify-start whitespace-normal text-left text-xs" onClick={() => add(f)}><Plus className="mr-1 h-3 w-3 shrink-0" />{FORMAT_HELP[f].title}</Button><FormatLearnButton format={f} onOpen={setLearn} /></div><p className="leading-relaxed text-muted-foreground">{FORMAT_HELP[f].definition}</p></div>)}<FormatLearnDialog format={learn} open={learn !== null} onOpenChange={(v) => { if (!v) setLearn(null); }} /></aside> : <Button size="sm" variant="ghost" onClick={() => setHelp(true)}>Format descriptions</Button>}
    </div>
    {issues.length > 0 && <ul aria-label="Structure issues" className="space-y-1 text-destructive">{issues.map((e) => <li key={e}>{e}</li>)}</ul>}
    <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">{dirty && <Badge variant="secondary" className="mr-auto">Unsaved structure</Badge>}{saved && <span className="mr-auto text-muted-foreground" role="status">Structure saved</span>}<Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setDraft(answers); setSaved(false); }}>Discard changes</Button><Button size="sm" disabled={!dirty || issues.length > 0} onClick={() => { onSave(saveCardStructure(draft)); setSaved(true); }}><Save className="mr-1 h-3.5 w-3.5" />Save Structure</Button></footer>
  </div>;
}