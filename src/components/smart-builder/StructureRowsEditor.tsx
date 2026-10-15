import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COMPETITION_CATEGORIES } from "@/lib/leagues/category";
import { DIVISION_PRESETS, STRUCTURE_HELP, STRUCTURE_ELIGIBILITY_LABELS, applyStructurePreset, structureEligibility, structureEligibilityAdvisory, duplicateStructureRow, renameStructureKey, rowStages, writeRowStages, structureUnits, structureRowIssues, poolSizesFor, selectedStructureEntries } from "@/lib/smart-builder/structure-rows";
import { newStageId, validateStagePlan, type StageKind, type StagePlanItem } from "@/lib/smart-builder/stage-plan";
import { evaluateStructures, type GuideAnswers } from "@/lib/smart-builder/structure-guide";
import { categoryEstimate, setEstimate } from "@/lib/smart-builder/expected-entries";
import type { StepAnswers } from "./StepByStepBuilder";
import { StructureOverview } from "./StructureOverview";
import { RRTopologyEditor } from "./RRTopologyEditor";
import { rrIssues, rrMatchCount } from "@/lib/smart-builder/rr-topology";
import { unitCapacity } from "@/lib/smart-builder/structure-capacity";
import { monradNote } from "@/lib/smart-builder/monrad";
import { FORMAT_HELP, baseFormatOf, formatHelpHidden, hideFormatHelp } from "@/lib/smart-builder/format-help";
import { toast } from "sonner";

const control = "h-7 rounded-md border border-input bg-background px-2 text-xs max-w-full";
// Base formats only. "Pools + knockout" is Round robin (pool count + who plays whom) followed by a Knockout playoff stage.
const kinds: { value: StageKind | ""; label: string }[] = [{ value: "swiss", label: "Swiss" }, { value: "round_robin", label: "Round robin" }, { value: "knockout", label: "Knockout" }, { value: "monrad", label: "Monrad (positional draw)" }, { value: "", label: "Undecided" }];
const shownKind = (k?: StageKind | null) => (k === "pools" ? "round_robin" : k ?? "");

function EditableName({ value, label, disabled, onCommit }: { value: string; label: string; disabled?: boolean; onCommit: (name: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <Input aria-label={label} className="h-8 min-w-36 text-xs" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={() => { onCommit(text); if (!text.trim()) setText(value); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

export function StructureRowsEditor({ answers, onSave, onDirtyChange }: { answers: StepAnswers; onSave: (a: StepAnswers) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(() => ({ ...answers, categories: answers.categories.filter((c) => c.trim()) }));
  const [guided, setGuided] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(answers);
  useEffect(() => { setDraft({ ...answers, categories: answers.categories.filter((c) => c.trim()) }); }, [answers]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const update = (fn: (a: StepAnswers) => StepAnswers) => { setSaved(false); setDraft(fn); };
  const units = structureUnits(draft);
  const issues = [...structureRowIssues(draft), ...units.flatMap((key) => {
    const n = Number(draft.unitEntries[key]) || 0;
    const cap = unitCapacity(draft, key, n);
    return [...validateStagePlan(rowStages(draft, key), { entrants: n }).filter((x) => x.level === "error").map((x) => `${key}: ${x.message}`), ...rowStages(draft, key).flatMap((s, i) => s.kind === "pools" || s.kind === "round_robin" ? rrIssues(cap.stages[i].entrants, s.pools ?? 1, s.rrTopology).map((x) => `${key} stage ${i + 1}: ${x}`) : [])];
  })];
  const stages = (key: string, fn: (s: StagePlanItem[]) => StagePlanItem[]) => update((a) => writeRowStages(a, key, fn(rowStages(a, key))));
  const patchStage = (key: string, index: number, patch: Partial<StagePlanItem>) => stages(key, (s) => s.map((x, i) => i === index ? { ...x, ...patch } : x));
  const toggle = (key: string) => setOpen((x) => ({ ...x, [key]: !x[key] }));
  const hasPeople = (key: string) => Object.values(draft.picks).some((v) => (Array.isArray(v) ? v : [v]).some((k) => k === key || k.startsWith(`${key}::`)));
  const setKind = (key: string, kind: StageKind | null) => {
    stages(key, (s) => [{ ...s[0], id: s[0]?.id ?? newStageId(), kind, pools: kind === "pools" ? s[0]?.pools ?? 2 : kind === "round_robin" ? s[0]?.pools ?? 1 : null, rounds: kind === "swiss" ? s[0]?.rounds ?? null : null }, ...s.slice(1)]);
    update((a) => ({ ...a, poolPlan: { ...a.poolPlan, [key]: { mode: kind === "pools" ? "later" : "none", ...(a.poolPlan?.[key]?.target ? { target: a.poolPlan[key].target } : {}) } } }));
  };
  const showHelp = (k: StageKind | null) => {
    const b = baseFormatOf(k);
    if (!b || formatHelpHidden()) return;
    const h = FORMAT_HELP[b];
    toast(h.title, { id: "format-help", duration: 9000, description: `${h.definition} Ideal for: ${h.idealFor} Trade-offs: ${h.tradeoffs}`, action: { label: "Learn more", onClick: () => window.open(h.learnMore, "_blank", "noopener") }, cancel: { label: "Don't show again", onClick: () => hideFormatHelp() } });
  };
  const add = () => update((a) => {
    let name = `Division ${a.categories.length + 1}`;
    while (a.categories.includes(name)) name += " new";
    return { ...a, categories: [...a.categories, name], categoryTypes: { ...a.categoryTypes, [name]: "open" }, disc: { ...a.disc, [name]: "singles" } };
  });
  const addSub = (cat: string) => {
    update((a) => {
      const subs = a.subcats[cat] ?? [];
      let name = subs.length ? `Group ${subs.length + 1}` : "A";
      while (subs.includes(name)) name += " new";
      const key = `${cat}::${name}`;
      return { ...a, subcats: { ...a.subcats, [cat]: [...subs, name] }, disc: { ...a.disc, [key]: a.disc[cat] ?? (a.playType === "doubles" ? "doubles" : "singles") }, unitEntries: { ...a.unitEntries, [key]: subs.length ? "" : a.unitEntries[cat] ?? "" } };
    });
    setOpen((o) => ({ ...o, [cat]: true }));
  };
  const applyPreset = (cat: string, name: string) => {
    update((a) => applyStructurePreset(a, cat, name));
  };
  const guide = draft.guide ?? {};
  const advice = (key: string) => evaluateStructures({ n: Number(draft.unitEntries[key]) || 0, outcome: guide.outcome, strength: guide.strength, time: guide.time, isChamps: draft.kind === "period" })[0];
  const setGuide = (patch: Partial<GuideAnswers>) => update((a) => ({ ...a, guide: { ...a.guide, ...patch } }));

  function stageDetails(key: string) {
    const first = rowStages(draft, key)[0];
    if (!first) return null;
    return <div className="space-y-2 py-2 pl-6" aria-label={`Format for ${key}`}>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        {first.kind === "swiss" && <Input className="h-7 w-20 text-xs" type="number" min={1} max={15} aria-label={`${key} Swiss rounds`} value={first.rounds ?? ""} onChange={(e) => patchStage(key, 0, { rounds: Number(e.target.value) || null })} />}
        {(first.kind === "pools" || first.kind === "round_robin") && <><Input className="h-7 w-16 text-xs" type="number" min={1} aria-label={`${key} pool count`} value={first.pools ?? 1} onChange={(e) => { const p = Math.max(1, Number(e.target.value) || 1); setKind(key, p > 1 ? "pools" : "round_robin"); patchStage(key, 0, { pools: p, kind: p > 1 ? "pools" : "round_robin" }); }} /><span className="text-xs">pools</span></>}
        {first.kind === "monrad" && <span className="text-[11px] text-muted-foreground">{monradNote(unitCapacity(draft, key, Number(draft.unitEntries[key]) || 0).stages[0].entrants) ?? "Enter expected entries"}</span>}
      </div>
      {(first.kind === "pools" || first.kind === "round_robin") && <RRTopologyEditor stage={first} entrants={unitCapacity(draft, key, Number(draft.unitEntries[key]) || 0).stages[0].entrants} selectedEntrants={selectedStructureEntries(draft, key)} label={`${key} stage 1`} onChange={(patch) => patchStage(key, 0, patch)} />}
    </div>;
  }



  function row(key: string, cat: string, isSub = false) {
    const subs = draft.subcats[cat] ?? [];
    const parentOnly = !isSub && subs.length > 0;
    const first = rowStages(draft, key)[0];
    const sizes = first ? poolSizesFor(draft, key, first) : [];
    const disc = draft.disc[key] ?? draft.disc[cat] ?? (draft.playType === "doubles" ? "doubles" : "singles");
    const initialValue = shownKind(first?.kind);
    return <Fragment key={key}>
      <tr className="border-t border-border align-top" data-testid={`division-row-${key}`}>
        <td className="p-2"><div className={`flex items-center gap-1 ${isSub ? "pl-5" : ""}`}>
          <Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" aria-label={`Expand ${key}`} aria-expanded={!!open[key]} onClick={() => toggle(key)}>{open[key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
          <div className="space-y-1"><EditableName label={`${key} name`} value={isSub ? key.split("::")[1] : cat} disabled={hasPeople(key)} onCommit={(name) => update((a) => renameStructureKey(a, key, name))} />
          {!isSub && <select className={`${control} w-full`} aria-label={`${cat} preset`} value="" disabled={hasPeople(key)} onChange={(e) => applyPreset(cat, e.target.value)}><option value="">Preset / custom name</option>{DIVISION_PRESETS.map((p) => <option key={p.name} value={p.name} disabled={p.name !== cat && draft.categories.includes(p.name)}>{p.name}</option>)}</select>}
          {isSub && <span className="text-[11px] text-muted-foreground">Subdivision</span>}</div>
        </div></td>
        <td className="p-2"><select className={`${control} w-full`} aria-label={`${key} discipline`} value={disc} onChange={(e) => update((a) => ({ ...a, disc: { ...a.disc, [key]: e.target.value as "singles" | "doubles", ...(!isSub ? Object.fromEntries(subs.map((s) => [`${cat}::${s}`, e.target.value as "singles" | "doubles"])) : {}) } }))}><option value="singles">Singles</option><option value="doubles">Doubles</option><option value="hybrid" disabled>Hybrid (not supported here)</option></select></td>
        <td className="p-2">
          {isSub ? <span className="text-muted-foreground">{structureEligibility(draft, key) ? STRUCTURE_ELIGIBILITY_LABELS[structureEligibility(draft, key) ?? "open"] : "Not selected"} · inherited</span> : <select className={`${control} w-full`} aria-label={`${cat} eligibility type`} value={structureEligibility(draft, cat) ?? ""} onChange={(e) => update((a) => ({ ...a, categoryTypes: { ...a.categoryTypes, [cat]: e.target.value as NonNullable<StepAnswers["categoryTypes"]>[string] } }))}><option value="" disabled>Select eligibility</option>{COMPETITION_CATEGORIES.map((t) => <option key={t} value={t}>{STRUCTURE_ELIGIBILITY_LABELS[t]}</option>)}</select>}
          {!isSub && structureEligibilityAdvisory(draft, key) && <p className="mt-1 max-w-48 text-[11px] text-muted-foreground" role="note">{structureEligibilityAdvisory(draft, key)}</p>}
          {!isSub && structureEligibility(draft, key) === "mixed" && <p className="mt-1 max-w-48 text-[11px] text-muted-foreground">{disc === "doubles" ? "One man + one lady per pair." : "Any gender; mixed composition applies to doubles pairs only."}</p>}
        </td>
        <td className="p-1.5">{parentOnly ? <span className="tabular-nums">{categoryEstimate(draft, cat)} total</span> : <Input className="h-7 w-20 text-xs" type="number" min={2} step={1} aria-label={`${key} expected entries`} value={draft.unitEntries[key] ?? draft.guide?.expected?.[key] ?? ""} onChange={(e) => update((a) => setEstimate(a, cat, key, e.target.value))} />}<div className="mt-1 text-[11px] text-muted-foreground">{disc === "doubles" ? "pairs" : "players"}</div></td>
        <td className="min-w-28 p-1.5">{!isSub ? <Button variant="ghost" size="sm" className="h-8 whitespace-nowrap" disabled={hasPeople(cat)} onClick={() => addSub(cat)}><Plus className="mr-1 h-3 w-3" />{subs.length ? `${subs.length} groups` : "Group"}</Button> : "—"}</td>
        <td className="p-2">{parentOnly ? <span className="text-xs text-muted-foreground">Per subdivision ↓</span> : <><select className={`${control} w-full`} aria-label={`${key} initial format`} value={initialValue} onChange={(e) => { const k = (e.target.value || null) as StageKind | null; showHelp(k); setKind(key, k === "round_robin" && first?.kind === "pools" ? "pools" : k); }}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          {first?.kind === "swiss" && <Input className="mt-1 h-8 w-20 text-xs" type="number" min={1} max={15} aria-label={`${key} Swiss rounds`} placeholder="Rounds" value={first.rounds ?? ""} onChange={(e) => patchStage(key, 0, { rounds: Number(e.target.value) || null })} />}
          {first?.kind === "monrad" && <span className="mt-1 block text-[11px] text-muted-foreground">{monradNote(Number(draft.unitEntries[key]) || 0) ?? "Enter expected entries"}</span>}
          {(first?.kind === "pools" || first?.kind === "round_robin") && <div className="mt-1 flex items-center gap-1"><Input className="h-8 w-16 text-xs" type="number" min={1} aria-label={`${key} pool count`} value={first.pools ?? 1} onChange={(e) => { const p = Math.max(1, Number(e.target.value) || 1); setKind(key, p > 1 ? "pools" : "round_robin"); patchStage(key, 0, { pools: p, kind: p > 1 ? "pools" : "round_robin" }); }} /><span className="text-xs">pools</span></div>}
          {sizes.length > 0 && <><span className="text-[11px] text-muted-foreground">{sizes.join(" / ")} entries · {rrMatchCount(sizes, first?.rrTopology)} {first?.rrTopology?.mode && first.rrTopology.mode !== "within" ? `${first.rrTopology.mode} matches` : "within-pool matches"}</span><Button size="sm" variant="ghost" className="h-7 px-0" onClick={() => setOpen((o) => ({ ...o, [key]: true }))}>Who plays whom?</Button></>}</>}</td>
        <td className="p-1.5"><div className="flex gap-1">{!isSub && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Duplicate ${cat}`} onClick={() => update((a) => duplicateStructureRow(a, cat))}><Copy className="h-3.5 w-3.5" /></Button>}<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${key}`} disabled={hasPeople(key)} onClick={() => update((a) => isSub ? { ...a, subcats: { ...a.subcats, [cat]: a.subcats[cat].filter((s) => `${cat}::${s}` !== key) } } : { ...a, categories: a.categories.filter((c) => c !== cat) })}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
      </tr>
      {open[key] && <tr><td colSpan={7} className="bg-muted/30 px-2">{parentOnly ? null : stageDetails(key)}{!isSub && subs.map((s) => <span key={s} className="sr-only">{s}</span>)}</td></tr>}
      {!isSub && open[key] && subs.map((s) => row(`${cat}::${s}`, cat, true))}
    </Fragment>;
  }

  return <div className="space-y-3 text-[13px]" data-testid="structure-rows-editor">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Tournament structure</h3><div className="flex gap-1" role="group" aria-label="Structure entry mode"><Button size="sm" variant={!guided ? "default" : "outline"} aria-pressed={!guided} onClick={() => setGuided(false)}>I know what I want</Button><Button size="sm" variant={guided ? "default" : "outline"} aria-pressed={guided} onClick={() => setGuided(true)}>Help me choose</Button></div></div>
    {guided && <section className="space-y-2 border-y border-border py-3" aria-label="Structure advice">
      <div className="flex flex-wrap gap-2"><label>Goal <select className={control} value={guide.outcome ?? "balanced"} onChange={(e) => setGuide({ outcome: e.target.value as GuideAnswers["outcome"] })}><option value="balanced">Balanced play</option><option value="rank">Rank everyone</option><option value="winner">Find a winner</option></select></label><label>Opponents <select className={control} value={guide.strength ?? "broad"} onChange={(e) => setGuide({ strength: e.target.value as GuideAnswers["strength"] })}><option value="broad">Everyone in the group</option><option value="similar">Similar results</option></select></label><label>Time <select className={control} value={guide.time ?? "some"} onChange={(e) => setGuide({ time: e.target.value as GuideAnswers["time"] })}><option value="tight">Limited</option><option value="some">Moderate</option><option value="plenty">Plenty</option></select></label></div>
      {units.map((key) => { const o = advice(key); return o ? <div key={key} className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">{key.replace("::", " › ")}</span><span>{o.title} · {o.matches} estimated matches</span><Button size="sm" variant="outline" onClick={() => { const s: StagePlanItem = { id: newStageId(), kind: o.kind, rounds: o.kind === "swiss" ? o.rounds : null, pools: o.pools?.length, advance: { mode: "all_continue" } }; stages(key, () => [s]); update((a) => ({ ...a, poolPlan: { ...a.poolPlan, [key]: { mode: o.kind === "pools" ? "later" : "none", target: o.pools?.[0] ? String(o.pools[0]) : undefined } } })); }}>Apply recommendation</Button><span className="text-muted-foreground">{o.why}</span></div> : <span key={key} className="text-xs text-muted-foreground">{key}: enter expected entries for advice.</span>; })}
    </section>}
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{Object.entries(STRUCTURE_HELP).filter(([k]) => k !== "pools" && k !== "playoffs").map(([k, text]) => <Tooltip key={k}><TooltipTrigger asChild><span tabIndex={0} className="flex cursor-help items-center gap-1">{k === "round_robin" ? "Round robin" : k === "swiss" ? "Swiss" : k === "knockout" ? "Knockout" : "Monrad"}<Info className="h-3 w-3" /></span></TooltipTrigger><TooltipContent className="max-w-80">{text}</TooltipContent></Tooltip>)}</div>
    <div className="overflow-x-auto" data-testid="structure-table-scroll"><table className="w-full min-w-[880px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Division name", "Match type", "Eligibility", "Expected", "Subdivisions", "Initial format / rounds", ""].map((h, i) => <th key={i} className="p-1.5 font-medium">{h}</th>)}</tr></thead><tbody>{draft.categories.map((cat) => row(cat, cat))}</tbody></table></div>
    <Button size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add row</Button>
    <StructureOverview answers={draft} units={units.map((key) => ({ key, label: key.replace("::", " › ") }))} entrants={Object.fromEntries(units.map((key) => [key, Number(draft.unitEntries[key]) || Number(draft.guide?.expected?.[key]) || 0]))} onEdit={(key) => { setOpen((o) => ({ ...o, [key]: true, [key.split("::")[0]]: true })); }} />
    {issues.length > 0 && <ul className="text-xs text-destructive" aria-label="Structure issues">{issues.map((s, i) => <li key={i}>{s}</li>)}</ul>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">{dirty && <Badge variant="secondary" className="mr-auto">Unsaved structure</Badge>}{saved && <span className="mr-auto text-xs text-muted-foreground" role="status">Structure saved on this device. No draw applied.</span>}<Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setDraft(answers); setSaved(false); }}>Discard changes</Button><Button size="sm" disabled={!dirty || issues.length > 0} onClick={() => { const discs = units.map((k) => draft.disc[k] ?? draft.disc[k.split("::")[0]] ?? (draft.playType === "doubles" ? "doubles" : "singles")); const playType = discs.every((d) => d === "singles") ? "singles" : discs.every((d) => d === "doubles") ? "doubles" : "both"; onSave({ ...draft, playType }); setSaved(true); }}>Save Structure</Button></div>
  </div>;
}