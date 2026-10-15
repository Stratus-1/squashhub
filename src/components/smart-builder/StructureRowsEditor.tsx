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

const control = "h-8 rounded-md border border-input bg-background px-2 text-xs max-w-full";
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
    const list = rowStages(draft, key);
    return <div className="space-y-2 py-2 pl-6" aria-label={`Stages for ${key}`}>
      {list.map((s, i) => <div key={s.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="w-16 font-medium">Stage {i + 1}</span>
        <select className={control} aria-label={`${key} stage ${i + 1} format`} value={shownKind(s.kind)} onChange={(e) => { const k = (e.target.value || null) as StageKind | null; showHelp(k); if (i === 0) setKind(key, k); else patchStage(key, i, { kind: k === "round_robin" && s.kind === "pools" ? "pools" : k }); }}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        {i > 0 && (s.kind === "round_robin" || s.kind === "pools") && <><Input className="h-8 w-16 text-xs" type="number" min={1} aria-label={`${key} stage ${i + 1} pool count`} value={s.pools ?? 1} onChange={(e) => { const p = Math.max(1, Number(e.target.value) || 1); patchStage(key, i, { pools: p, kind: p > 1 ? "pools" : "round_robin" }); }} /><span className="text-xs">pools</span></>}
        {s.kind === "monrad" && <span className="text-[11px] text-muted-foreground">{monradNote(unitCapacity(draft, key, Number(draft.unitEntries[key]) || 0).stages[i].entrants) ?? "Enter expected entries"}</span>}
        {s.kind === "swiss" && <Input className="h-8 w-20 text-xs" type="number" min={1} max={15} aria-label={`${key} stage ${i + 1} rounds`} value={s.rounds ?? ""} onChange={(e) => patchStage(key, i, { rounds: Number(e.target.value) || null })} />}
        <select className={control} aria-label={`${key} stage ${i + 1} advancement`} value={s.advance?.mode ?? "all_continue"} onChange={(e) => patchStage(key, i, { advance: { mode: e.target.value as NonNullable<StagePlanItem["advance"]>["mode"] } })}>
          <option value="all_continue">Everyone continues</option><option value="top_n">Top N qualify</option>{s.kind === "pools" && <option value="per_pool">Top N per pool</option>}<option value="shared_playoff">Shared parent playoff</option><option value="none">Finish here</option>
        </select>
        {(s.advance?.mode === "top_n" || s.advance?.mode === "per_pool" || s.advance?.mode === "shared_playoff") && <Input type="number" min={1} className="h-8 w-20 text-xs" aria-label={`${key} stage ${i + 1} qualifiers`} value={(s.advance.mode === "per_pool" ? s.advance.perPool : s.advance.topN) ?? ""} onChange={(e) => patchStage(key, i, { advance: { mode: s.advance?.mode ?? "top_n", [s.advance?.mode === "per_pool" ? "perPool" : "topN"]: Number(e.target.value) || null }, sharedWith: s.advance?.mode === "shared_playoff" ? key.split("::")[0] : s.sharedWith })} />}
        <Badge variant="outline">Planned</Badge>
        {i > 0 && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${key} stage ${i + 1}`} onClick={() => stages(key, (all) => all.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
        {(s.kind === "round_robin" || s.kind === "pools") && <RRTopologyEditor stage={s} entrants={unitCapacity(draft, key, Number(draft.unitEntries[key]) || 0).stages[i].entrants} selectedEntrants={i === 0 ? selectedStructureEntries(draft, key) : undefined} label={`${key} stage ${i + 1}`} onChange={(patch) => patchStage(key, i, patch)} />}
      </div>)}
      <Button variant="ghost" size="sm" onClick={() => stages(key, (s) => [...s, { id: newStageId(), kind: null, advance: { mode: "all_continue" } }])}><Plus className="mr-1 h-3 w-3" />Add future stage</Button>
    </div>;
  }

  function row(key: string, cat: string, isSub = false) {
    const subs = draft.subcats[cat] ?? [];
    const parentOnly = !isSub && subs.length > 0;
    const first = rowStages(draft, key)[0];
    const list = rowStages(draft, key);
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
        <td className="p-2">{parentOnly ? <span className="tabular-nums">{categoryEstimate(draft, cat)} total</span> : <Input className="h-8 w-20 text-xs" type="number" min={2} step={1} aria-label={`${key} expected entries`} value={draft.unitEntries[key] ?? draft.guide?.expected?.[key] ?? ""} onChange={(e) => update((a) => setEstimate(a, cat, key, e.target.value))} />}<div className="mt-1 text-[11px] text-muted-foreground">{disc === "doubles" ? "pairs" : "players"}</div></td>
        <td className="min-w-28 p-2">{!isSub ? <Button variant="ghost" size="sm" className="h-8 whitespace-nowrap" disabled={hasPeople(cat)} onClick={() => addSub(cat)}><Plus className="mr-1 h-3 w-3" />{subs.length ? `${subs.length} groups` : "Group"}</Button> : "—"}</td>
        <td className="p-2">{parentOnly ? <span className="text-xs text-muted-foreground">Per subdivision ↓</span> : <><select className={`${control} w-full`} aria-label={`${key} initial format`} value={initialValue} onChange={(e) => { const k = (e.target.value || null) as StageKind | null; showHelp(k); setKind(key, k === "round_robin" && first?.kind === "pools" ? "pools" : k); }}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          {first?.kind === "swiss" && <Input className="mt-1 h-8 w-20 text-xs" type="number" min={1} max={15} aria-label={`${key} Swiss rounds`} placeholder="Rounds" value={first.rounds ?? ""} onChange={(e) => patchStage(key, 0, { rounds: Number(e.target.value) || null })} />}
          {first?.kind === "monrad" && <span className="mt-1 block text-[11px] text-muted-foreground">{monradNote(Number(draft.unitEntries[key]) || 0) ?? "Enter expected entries"}</span>}
          {(first?.kind === "pools" || first?.kind === "round_robin") && <div className="mt-1 flex items-center gap-1"><Input className="h-8 w-16 text-xs" type="number" min={1} aria-label={`${key} pool count`} value={first.pools ?? 1} onChange={(e) => { const p = Math.max(1, Number(e.target.value) || 1); setKind(key, p > 1 ? "pools" : "round_robin"); patchStage(key, 0, { pools: p, kind: p > 1 ? "pools" : "round_robin" }); }} /><span className="text-xs">pools</span></div>}
          {sizes.length > 0 && <><span className="text-[11px] text-muted-foreground">{sizes.join(" / ")} entries · {rrMatchCount(sizes, first?.rrTopology)} {first?.rrTopology?.mode && first.rrTopology.mode !== "within" ? `${first.rrTopology.mode} matches` : "within-pool matches"}</span><Button size="sm" variant="ghost" className="h-7 px-0" onClick={() => setOpen((o) => ({ ...o, [key]: true }))}>Who plays whom?</Button></>}</>}</td>
        <td className="p-2">{parentOnly ? "Per subdivision ↓" : <select className={`${control} w-full`} aria-label={`${key} next stage`} value={list.length > 1 ? list[1].kind ?? "undecided" : "none"} onChange={(e) => stages(key, (s) => e.target.value === "none" ? s.slice(0, 1) : [s[0], { ...s[1], id: s[1]?.id ?? newStageId(), kind: e.target.value === "undecided" ? null : e.target.value as StageKind, advance: s[1]?.advance ?? { mode: "all_continue" } }, ...s.slice(2)])}><option value="none">No next stage</option><option value="undecided">Decide later</option>{kinds.filter((k) => k.value).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>}</td>
        <td className="p-2">{parentOnly ? "—" : <label className="flex items-center gap-1 text-xs"><input type="checkbox" aria-label={`${key} playoffs`} checked={draft.playoffOverrides[key]?.choice === "playoffs"} onChange={(e) => update((a) => ({ ...a, playoffOverrides: { ...a.playoffOverrides, [key]: { ...a.playoff, ...a.playoffOverrides[key], choice: e.target.checked ? "playoffs" : "none", qualification: "later", pairing: "later" } } }))} />Playoffs</label>}
          {draft.playoffOverrides[key]?.choice === "playoffs" && <select className={`${control} mt-1`} aria-label={`${key} playoff path`} value={draft.playoffOverrides[key].rounds} onChange={(e) => update((a) => ({ ...a, playoffOverrides: { ...a.playoffOverrides, [key]: { ...a.playoffOverrides[key], rounds: Number(e.target.value) as 1 | 2 | 3 } } }))}><option value={3}>QF / SF / Final</option><option value={2}>SF / Final</option><option value={1}>Final</option></select>}</td>
        <td className="p-2"><div className="flex gap-1">{!isSub && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplicate ${cat}`} onClick={() => update((a) => duplicateStructureRow(a, cat))}><Copy className="h-3.5 w-3.5" /></Button>}<Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete ${key}`} disabled={hasPeople(key)} onClick={() => update((a) => isSub ? { ...a, subcats: { ...a.subcats, [cat]: a.subcats[cat].filter((s) => `${cat}::${s}` !== key) } } : { ...a, categories: a.categories.filter((c) => c !== cat) })}><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
      </tr>
      {open[key] && <tr><td colSpan={9} className="bg-muted/30 px-2">{parentOnly ? null : stageDetails(key)}{!isSub && subs.map((s) => <span key={s} className="sr-only">{s}</span>)}</td></tr>}
      {!isSub && open[key] && subs.map((s) => row(`${cat}::${s}`, cat, true))}
    </Fragment>;
  }

  return <div className="space-y-3 text-[13px]" data-testid="structure-rows-editor">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Tournament structure</h3><div className="flex gap-1" role="group" aria-label="Structure entry mode"><Button size="sm" variant={!guided ? "default" : "outline"} aria-pressed={!guided} onClick={() => setGuided(false)}>I know what I want</Button><Button size="sm" variant={guided ? "default" : "outline"} aria-pressed={guided} onClick={() => setGuided(true)}>Help me choose</Button></div></div>
    {guided && <section className="space-y-2 border-y border-border py-3" aria-label="Structure advice">
      <div className="flex flex-wrap gap-2"><label>Goal <select className={control} value={guide.outcome ?? "balanced"} onChange={(e) => setGuide({ outcome: e.target.value as GuideAnswers["outcome"] })}><option value="balanced">Balanced play</option><option value="rank">Rank everyone</option><option value="winner">Find a winner</option></select></label><label>Opponents <select className={control} value={guide.strength ?? "broad"} onChange={(e) => setGuide({ strength: e.target.value as GuideAnswers["strength"] })}><option value="broad">Everyone in the group</option><option value="similar">Similar results</option></select></label><label>Time <select className={control} value={guide.time ?? "some"} onChange={(e) => setGuide({ time: e.target.value as GuideAnswers["time"] })}><option value="tight">Limited</option><option value="some">Moderate</option><option value="plenty">Plenty</option></select></label></div>
      {units.map((key) => { const o = advice(key); return o ? <div key={key} className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">{key.replace("::", " › ")}</span><span>{o.title} · {o.matches} estimated matches</span><Button size="sm" variant="outline" onClick={() => { const s: StagePlanItem = { id: newStageId(), kind: o.kind, rounds: o.kind === "swiss" ? o.rounds : null, pools: o.pools?.length, advance: { mode: "all_continue" } }; stages(key, () => [s]); update((a) => ({ ...a, poolPlan: { ...a.poolPlan, [key]: { mode: o.kind === "pools" ? "later" : "none", target: o.pools?.[0] ? String(o.pools[0]) : undefined } } })); }}>Apply recommendation</Button><span className="text-muted-foreground">{o.why}</span></div> : <span key={key} className="text-xs text-muted-foreground">{key}: enter expected entries for advice.</span>; })}
    </section>}
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{Object.entries(STRUCTURE_HELP).filter(([k]) => k !== "pools").map(([k, text]) => <Tooltip key={k}><TooltipTrigger asChild><span tabIndex={0} className="flex cursor-help items-center gap-1">{k === "round_robin" ? "Round robin" : k === "swiss" ? "Swiss" : k === "knockout" ? "Knockout" : k === "monrad" ? "Monrad" : "Playoffs"}<Info className="h-3 w-3" /></span></TooltipTrigger><TooltipContent className="max-w-80">{text}</TooltipContent></Tooltip>)}</div>
    <div className="overflow-x-auto" data-testid="structure-table-scroll"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr>{["Division name", "Match type", "Eligibility", "Expected", "Subdivisions", "Initial format / rounds", "Next stage", "Playoffs", ""].map((h, i) => <th key={i} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody>{draft.categories.map((cat) => row(cat, cat))}</tbody></table></div>
    <Button size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add row</Button>
    <StructureOverview answers={draft} units={units.map((key) => ({ key, label: key.replace("::", " › ") }))} entrants={Object.fromEntries(units.map((key) => [key, Number(draft.unitEntries[key]) || Number(draft.guide?.expected?.[key]) || 0]))} onEdit={(key) => { setOpen((o) => ({ ...o, [key]: true, [key.split("::")[0]]: true })); }} />
    {units.some((key) => draft.playoffOverrides[key]?.choice === "playoffs") && <p className="text-xs text-muted-foreground">Playoffs are planned separately; qualifier counts and pairings are not confirmed. Their matches and court-hours are not included above.</p>}
    {issues.length > 0 && <ul className="text-xs text-destructive" aria-label="Structure issues">{issues.map((s, i) => <li key={i}>{s}</li>)}</ul>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">{dirty && <Badge variant="secondary" className="mr-auto">Unsaved structure</Badge>}{saved && <span className="mr-auto text-xs text-muted-foreground" role="status">Structure saved on this device. No draw applied.</span>}<Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setDraft(answers); setSaved(false); }}>Discard changes</Button><Button size="sm" disabled={!dirty || issues.length > 0} onClick={() => { const discs = units.map((k) => draft.disc[k] ?? draft.disc[k.split("::")[0]] ?? (draft.playType === "doubles" ? "doubles" : "singles")); const playType = discs.every((d) => d === "singles") ? "singles" : discs.every((d) => d === "doubles") ? "doubles" : "both"; onSave({ ...draft, playType }); setSaved(true); }}>Save Structure</Button></div>
  </div>;
}