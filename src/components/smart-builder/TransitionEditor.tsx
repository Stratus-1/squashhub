/**
 * Stage transition editor: Qualification → Mapping method → Pairing rule → Preview.
 * Edits the canonical StageTransition on the spec (stable pool indexes + positions).
 * Nothing here generates games; the engine remains the only generator.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  defaultPoolPairs, describePairing, effectiveTransition, pairingLabel, planTransition, possiblePoolPairings, transitionIssues,
  type StageTransition,
} from "@/lib/tournaments/transition";
import type { PlannedStage } from "@/lib/tournaments/contract";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid sm:grid-cols-[9rem_1fr] gap-2 items-center"><span className="text-xs text-muted-foreground">{label}</span>{children}</div>
);

export function TransitionEditor({ stage, source, poolLabels, locked, value, onChange }: {
  stage: PlannedStage; source: PlannedStage; poolLabels?: string[]; locked?: boolean;
  value: StageTransition | null; onChange: (t: StageTransition) => void;
}) {
  const poolCount = source.kind === "pools" ? source.pools ?? 1 : 1;
  const t: StageTransition = value ?? effectiveTransition(stage, source);
  const set = (patch: Partial<StageTransition>) => onChange({ ...t, ...patch, sourceStageId: source.id, destinationStageId: stage.id });
  const issues = transitionIssues(t, poolCount).filter((i) => i.level === "error");
  let preview: string[] = [];
  try { preview = issues.length ? [] : planTransition(t, poolCount).map((p, i) => `Match ${i + 1}: ${describePairing(p, poolLabels)}`); }
  catch (e: any) { issues.push({ level: "error", code: "plan", message: e.message }); }
  const options = poolCount > 1 && poolCount % 2 === 0 ? possiblePoolPairings(poolCount) : [];

  return (
    <fieldset disabled={locked} className="rounded border p-2 space-y-2 disabled:opacity-60">
      <div className="text-xs font-semibold">{source.name} → {stage.name}</div>

      <Row label="Who advances">
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value={t.positions.length === 1 && t.positions[0] === 1 ? "top1" : t.positions.join(",") === "1,2" ? "top2" : t.positions.join(",") === "1,2,3,4" ? "top4" : "custom"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") return;
              const positions = v === "top1" ? [1] : v === "top2" ? [1, 2] : [1, 2, 3, 4];
              set({ positions, manualSlots: undefined });
            }}>
            <option value="top1">Top 1 from each pool</option>
            <option value="top2">Top 2 from each pool</option>
            <option value="top4">Top 4 from each pool</option>
            <option value="custom">Custom positions</option>
          </select>
          <Input className="h-8 w-32 text-xs" aria-label="Qualifying positions" value={t.positions.join(", ")}
            onChange={(e) => set({ positions: e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0), manualSlots: undefined })} />
          <span className="text-xs text-muted-foreground">positions, e.g. 3, 4 for a Plate</span>
        </div>
      </Row>

      <Row label="How they meet">
        <select className="h-8 rounded-md border bg-background px-2 text-xs w-full sm:w-auto" value={t.method}
          onChange={(e) => {
            const method = e.target.value as StageTransition["method"];
            set({ method, poolPairs: method === "cross_pool" ? t.poolPairs ?? defaultPoolPairs(poolCount) : undefined, pairing: method === "cross_pool" ? t.pairing ?? "winner_runner_up" : undefined });
          }}>
          <option value="cross_pool" disabled={poolCount < 2}>Cross pools (choose which pools meet)</option>
          <option value="reseed">Reseed all qualifiers into one field</option>
          <option value="manual">Map each place myself</option>
        </select>
      </Row>

      {t.method === "cross_pool" && (
        <>
          <Row label="Pools crossed">
            <select className="h-8 rounded-md border bg-background px-2 text-xs w-full" aria-label="Which pools are crossed"
              value={JSON.stringify(t.poolPairs ?? defaultPoolPairs(poolCount))}
              onChange={(e) => set({ poolPairs: JSON.parse(e.target.value) })}>
              {options.map((o) => <option key={JSON.stringify(o)} value={JSON.stringify(o)}>{pairingLabel(o, poolLabels)}</option>)}
            </select>
          </Row>
          <Row label="Positions meet">
            <select className="h-8 rounded-md border bg-background px-2 text-xs w-full sm:w-auto" value={t.pairing ?? "winner_runner_up"}
              onChange={(e) => set({ pairing: e.target.value as StageTransition["pairing"] })}>
              <option value="winner_runner_up">Winner vs runner-up of the crossed pool</option>
              <option value="same_position">Same position vs same position</option>
            </select>
          </Row>
        </>
      )}

      {t.method === "manual" && (
        <div className="text-xs text-muted-foreground">
          Manual mapping is set place by place below. Each qualifying place may be used once.
          <div className="mt-1 space-y-1">
            {(t.manualSlots ?? []).map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <span>Match {i + 1}: {describePairing({ slot: i + 1, a: pair[0], b: pair[1] }, poolLabels)}</span>
                <Button size="sm" variant="ghost" onClick={() => set({ manualSlots: (t.manualSlots ?? []).filter((_, k) => k !== i) })}>Remove</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set({ manualSlots: [...(t.manualSlots ?? []), [{ poolIndex: 0, position: t.positions[0] ?? 1 }, { poolIndex: Math.min(1, poolCount - 1), position: t.positions[t.positions.length - 1] ?? 1 }]] })}>Add a match</Button>
          </div>
        </div>
      )}

      <div className="rounded bg-muted p-2 text-xs">
        <div className="font-medium">{stage.name} preview</div>
        {issues.length ? issues.map((i) => <div key={i.code + i.message} className="text-destructive">• {i.message}</div>)
          : preview.map((l) => <div key={l}>{l}</div>)}
        {!issues.length && <div className="mt-1 text-muted-foreground">Places shown until the pool results are complete; then the real players appear.</div>}
      </div>
    </fieldset>
  );
}
