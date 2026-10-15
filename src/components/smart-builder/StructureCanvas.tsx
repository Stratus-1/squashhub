import { useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, applyNodeChanges, useReactFlow, type Node, type NodeProps, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./structure-canvas.css";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StepAnswers } from "./StepByStepBuilder";
import { addCanvasDivision, attachCanvasBlock, canvasProjection, divisionNodeId, type CanvasBlock, type CanvasItem } from "@/lib/smart-builder/structure-canvas";
import { renameStructureKey, rowStages, structureEligibility, STRUCTURE_ELIGIBILITY_LABELS, writeRowStages } from "@/lib/smart-builder/structure-rows";
import { stageKindLabel, type StageKind, type StagePlanItem } from "@/lib/smart-builder/stage-plan";
import { unitCapacity } from "@/lib/smart-builder/structure-capacity";
import { RRTopologyEditor } from "./RRTopologyEditor";

const blocks: { kind: CanvasBlock; label: string }[] = [{ kind: "division", label: "Main Division" }, { kind: "subdivision", label: "Subdivision" }, { kind: "group", label: "Group" }, { kind: "pool", label: "Pool" }, { kind: "round_robin", label: "Round Robin" }, { kind: "swiss", label: "Swiss" }, { kind: "knockout", label: "Knockout" }, { kind: "monrad", label: "Monrad" }, { kind: "playoff", label: "Playoff" }];
type FlowNode = Node<{ label: string; detail: string; item?: CanvasItem; block?: CanvasBlock }, "structure">;

function StructureNode({ data, selected }: NodeProps<FlowNode>) {
  return <div className={`structure-canvas-node ${selected ? "structure-canvas-selected" : ""} ${data.block ? "structure-canvas-pending" : ""}`}>
    <Handle type="target" position={Position.Left} aria-label={`Connect into ${data.label}`} />
    <div className="flex items-center gap-1 text-xs font-semibold"><GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />{data.label}</div>
    <div className="mt-1 text-[11px] text-muted-foreground">{data.detail}</div>
    {!data.block && data.item?.type !== "pool" && <Handle type="source" position={Position.Right} aria-label={`Connect from ${data.label}`} />}
  </div>;
}
const nodeTypes = { structure: StructureNode };

function CanvasContent({ answers, onChange, onPendingChange }: { answers: StepAnswers; onChange: (a: StepAnswers) => void; onPendingChange: (pending: boolean) => void }) {
  const flow = useReactFlow<FlowNode>();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<FlowNode[]>([]);
  const [error, setError] = useState("");
  const [moving, setMoving] = useState<Record<string, { x: number; y: number }>>({});
  const projection = useMemo(() => canvasProjection(answers), [answers]);
  const item = projection.items.find((n) => n.id === selected);
  const stage = item?.type === "stage" || item?.type === "pool" ? rowStages(answers, item.key)[item.index ?? 0] : undefined;
  const nodes: FlowNode[] = projection.items.map<FlowNode>((n) => ({ id: n.id, type: "structure", selected: selected === n.id, position: moving[n.id] ?? answers.structureCanvas?.positions[n.id] ?? { x: n.type === "division" ? 25 : n.type === "subdivision" ? 245 : n.type === "pool" ? 720 + (n.pool ?? 0) * 195 : 460 + (n.index ?? 0) * 220, y: n.type === "division" ? answers.categories.indexOf(n.key) * 220 + 30 : Math.max(0, projection.items.filter((x) => x.type === "stage" && (x.index ?? 0) === 0).findIndex((x) => x.key === n.key)) * 190 + 95 + (n.type === "pool" ? 100 : 0) }, data: { label: n.label, item: n, detail: n.type === "stage" ? `${n.key.replace("::", " › ")} · ${unitCapacity(answers, n.key, Number(answers.unitEntries[n.key]) || 0).stages[n.index ?? 0]?.matches ?? "?"} matches` : n.type === "pool" ? "Round robin allocation" : `${n.type === "division" ? "Main division" : "Subdivision"} · ${answers.disc[n.key] ?? answers.disc[n.key.split("::")[0]] ?? "singles"} · ${structureEligibility(answers, n.key) ?? "open"}` } })).concat(pending);
  const setPosition = (id: string, position: { x: number; y: number }, a = answers) => ({ ...a, structureCanvas: { version: 1 as const, positions: { ...a.structureCanvas?.positions, [id]: position } } });
  const setPendingNodes = (p: FlowNode[]) => { setPending(p); onPendingChange(p.length > 0); };
  function add(block: CanvasBlock, position?: { x: number; y: number }) {
    const anchor = nodes.find((n) => n.id === selected);
    const autoPlaced = !position;
    position = position ?? (anchor ? { x: anchor.position.x + 240, y: anchor.position.y + (block === "pool" ? 110 : 0) } : { x: 25, y: nodes.length * 100 + 30 });
    if (autoPlaced) while (nodes.some((n) => Math.abs(n.position.x - position.x) < 195 && Math.abs(n.position.y - position.y) < 85)) position = { ...position, y: position.y + 100 };
    setError("");
    if (block === "division") { const a = addCanvasDivision(answers), id = divisionNodeId(a.categories[a.categories.length - 1]); onChange(setPosition(id, position, a)); setSelected(id); return; }
    const id = `pending:${crypto.randomUUID()}`;
    setPendingNodes([...pending, { id, type: "structure", position, data: { block, label: blocks.find((b) => b.kind === block)?.label ?? block, detail: "Not connected" } }]); setSelected(id);
  }
  function connect(c: Connection) {
    const source = projection.items.find((n) => n.id === c.source), target = pending.find((n) => n.id === c.target);
    if (!source || !target?.data.block) { setError("Connect an existing division or last stage to a new toolbox block. Existing paths cannot be rewired."); return; }
    try { const result = attachCanvasBlock(answers, source, target.data.block); onChange(setPosition(result.selected, target.position, result.answers)); setPendingNodes(pending.filter((n) => n.id !== target.id)); setSelected(result.selected); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Invalid connection."); }
  }
  const patch = (p: Partial<StagePlanItem>) => { if (!item || item.index == null) return; onChange(writeRowStages(answers, item.key, rowStages(answers, item.key).map((s, i) => i === item.index ? { ...s, ...p } : s))); };
  function remove() {
    if (!item) { setPendingNodes(pending.filter((p) => p.id !== selected)); setSelected(null); return; }
    if (item.type === "pool") { setError("Change the pool count in the stage settings; custom allocation must be reviewed there."); return; }
    if (item.type === "stage") {
      const stages = rowStages(answers, item.key);
      if (item.index !== stages.length - 1 || stages.length === 1) { setError("Only the last future stage can be removed; edit the initial format instead."); return; }
      onChange(writeRowStages(answers, item.key, stages.slice(0, -1)));
    } else {
      if (item.type === "division") onChange({ ...answers, categories: answers.categories.filter((c) => c !== item.key) });
      else { const [cat, sub] = item.key.split("::"); onChange({ ...answers, subcats: { ...answers.subcats, [cat]: answers.subcats[cat].filter((s) => s !== sub) } }); }
    }
    setSelected(null); setError("");
  }
  const pendingSelection = pending.find((p) => p.id === selected);
  return <div className="structure-canvas space-y-2" data-testid="structure-canvas">
    <div className="flex flex-wrap gap-1 border-y border-border py-2" aria-label="Visual builder toolbox">{blocks.map((b) => <Button key={b.kind} size="sm" variant="outline" className="h-7 text-xs" draggable onDragStart={(e) => { e.dataTransfer.setData("application/squashhub-block", b.kind); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => add(b.kind)} aria-label={`Add ${b.label} block`}><Plus className="mr-1 h-3 w-3" />{b.label}</Button>)}</div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="h-[560px] min-w-0 border border-border bg-muted/20" aria-label="Tournament structure canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={(e) => { e.preventDefault(); const kind = e.dataTransfer.getData("application/squashhub-block") as CanvasBlock; if (blocks.some((b) => b.kind === kind)) add(kind, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow<FlowNode> nodes={nodes} edges={projection.edges.map((e) => ({ ...e, type: "smoothstep", deletable: false }))} nodeTypes={nodeTypes} onConnect={connect} onNodeClick={(_, n) => { setSelected(n.id); setError(""); }} onPaneClick={() => setSelected(null)} onNodesChange={(changes) => { const positions = changes.filter((c) => c.type === "position" && c.position); if (positions.length) setMoving((cur) => ({ ...cur, ...Object.fromEntries(positions.filter((c) => c.type === "position" && c.position).map((c) => c.type === "position" ? [c.id, c.position] : [])) })); const pchanges = changes.filter((c) => c.type !== "remove" && pending.some((p) => "id" in c && p.id === c.id)); if (pchanges.length) setPendingNodes(applyNodeChanges(pchanges, pending)); }} onNodeDragStop={(_, n) => { setMoving((cur) => { const next = { ...cur }; delete next[n.id]; return next; }); if (n.data.block) setPendingNodes(pending.map((p) => p.id === n.id ? n : p)); else onChange(setPosition(n.id, n.position)); }} deleteKeyCode={null} fitView minZoom={0.25} maxZoom={1.5} nodesConnectable panOnScroll zoomOnScroll={false} preventScrolling={false}><Background /><Controls showInteractive={false} /></ReactFlow>
      </div>
      <aside className="min-w-0 space-y-3 border-l border-border pl-3 text-xs" aria-label="Node settings">
        <div className="flex items-center justify-between"><h4 className="font-semibold">{item?.label ?? pendingSelection?.data.label ?? "Settings"}</h4>{selected && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close node settings" onClick={() => setSelected(null)}><X className="h-3 w-3" /></Button>}</div>
        {item && (item.type === "division" || item.type === "subdivision") && <>
          <label className="block space-y-1">Name<Input key={item.id} aria-label="Node name" className="h-8 text-xs" defaultValue={item.label} onBlur={(e) => { const a = renameStructureKey(answers, item.key, e.target.value); if (a !== answers) { const dest = item.type === "division" ? e.target.value.trim() : `${item.key.split("::")[0]}::${e.target.value.trim()}`; onChange(setPosition(divisionNodeId(dest), nodes.find((n) => n.id === item.id)?.position ?? { x: 25, y: 30 }, a)); setSelected(divisionNodeId(dest)); } }} /></label>
          <label className="block space-y-1">Match discipline<select className="h-8 w-full rounded-md border border-input bg-background px-2" aria-label="Node discipline" value={answers.disc[item.key] ?? answers.disc[item.key.split("::")[0]] ?? "singles"} onChange={(e) => onChange({ ...answers, disc: { ...answers.disc, [item.key]: e.target.value as "singles" | "doubles" } })}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
          {item.type === "division" ? <label className="block space-y-1">Eligibility<select className="h-8 w-full rounded-md border border-input bg-background px-2" aria-label="Node eligibility" value={structureEligibility(answers, item.key) ?? "open"} onChange={(e) => onChange({ ...answers, categoryTypes: { ...answers.categoryTypes, [item.key]: e.target.value as "open" | "mens" | "ladies" | "mixed" } })}>{Object.entries(STRUCTURE_ELIGIBILITY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label> : <p className="text-muted-foreground">Eligibility: {structureEligibility(answers, item.key)} · inherited</p>}
          {!(item.type === "division" && answers.subcats[item.key]?.length) && <label className="block space-y-1">Expected entries<Input type="number" min={2} className="h-8 text-xs" aria-label="Node expected entries" value={answers.unitEntries[item.key] ?? ""} onChange={(e) => onChange({ ...answers, unitEntries: { ...answers.unitEntries, [item.key]: e.target.value } })} /></label>}
        </>}
        {stage && item?.type === "stage" && <>
          <label className="block space-y-1">Format<select className="h-8 w-full rounded-md border border-input bg-background px-2" aria-label="Node stage format" value={stage.kind === "pools" ? "round_robin" : stage.kind ?? ""} onChange={(e) => patch({ kind: (e.target.value || null) as StageKind | null })}><option value="">Decide later</option>{["round_robin", "swiss", "knockout", "monrad"].map((k) => <option key={k} value={k}>{stageKindLabel(k)}</option>)}</select></label>
          {stage.kind === "swiss" && <label className="block space-y-1">Rounds<Input className="h-8 text-xs" aria-label="Node Swiss rounds" type="number" min={1} max={15} value={stage.rounds ?? ""} onChange={(e) => patch({ rounds: Number(e.target.value) || null })} /></label>}
          <label className="block space-y-1">Who continues<select className="h-8 w-full rounded-md border border-input bg-background px-2" aria-label="Node qualification" value={stage.advance?.mode ?? "all_continue"} onChange={(e) => patch({ advance: { mode: e.target.value as "all_continue" | "top_n" | "none" | "per_pool", topN: stage.advance?.topN ?? 4, perPool: stage.advance?.perPool ?? 2 } })}><option value="all_continue">All entrants</option><option value="top_n">Top N</option>{(stage.kind === "pools" || stage.kind === "round_robin") && <option value="per_pool">Top N per pool</option>}<option value="none">Nobody</option></select></label>
          {(stage.advance?.mode === "top_n" || stage.advance?.mode === "per_pool") && <Input className="h-8 text-xs" type="number" min={1} aria-label="Node qualifiers" value={stage.advance.mode === "top_n" ? stage.advance.topN ?? 4 : stage.advance.perPool ?? 2} onChange={(e) => patch({ advance: { ...stage.advance, mode: stage.advance?.mode ?? "top_n", ...(stage.advance?.mode === "per_pool" ? { perPool: Number(e.target.value) } : { topN: Number(e.target.value) }) } })} />}
          {(stage.kind === "pools" || stage.kind === "round_robin") && <RRTopologyEditor stage={stage} entrants={unitCapacity(answers, item.key, Number(answers.unitEntries[item.key]) || 0).stages[item.index ?? 0].entrants} label="Canvas stage" onChange={patch} />}
        </>}
        {item?.type === "pool" && stage && <>
          <label className="block space-y-1">Pool name<Input key={item.id} className="h-8 text-xs" aria-label="Pool name" defaultValue={item.label} onBlur={(e) => { const name = e.target.value.trim(); if (!name) return; const names = Array.from({ length: stage.pools ?? 1 }, (_, i) => stage.poolNames?.[i] ?? `Pool ${String.fromCharCode(65 + i)}`); if (names.some((n, i) => i !== item.pool && n.toLowerCase() === name.toLowerCase())) { setError("Pool names must be unique."); return; } patch({ poolNames: names.map((n, i) => i === item.pool ? name : n) }); }} /></label>
          <RRTopologyEditor stage={stage} entrants={unitCapacity(answers, item.key, Number(answers.unitEntries[item.key]) || 0).stages[item.index ?? 0].entrants} label="Canvas pool" onChange={patch} />
        </>}
        {pendingSelection && <><p className="text-muted-foreground">Not connected</p><select className="h-8 w-full rounded-md border border-input bg-background px-2" aria-label="Connect block from" value="" onChange={(e) => { if (e.target.value) connect({ source: e.target.value, target: pendingSelection.id, sourceHandle: null, targetHandle: null }); }}><option value="">Connect from…</option>{projection.items.filter((n) => n.type !== "pool").map((n) => <option key={n.id} value={n.id}>{n.key.replace("::", " › ")} — {n.label}</option>)}</select></>}
        {selected && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={remove}><Trash2 className="mr-1 h-3 w-3" />Remove block</Button>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </aside>
    </div>
  </div>;
}

export function StructureCanvas(props: { answers: StepAnswers; onChange: (a: StepAnswers) => void; onPendingChange: (pending: boolean) => void }) { return <ReactFlowProvider><CanvasContent {...props} /></ReactFlowProvider>; }