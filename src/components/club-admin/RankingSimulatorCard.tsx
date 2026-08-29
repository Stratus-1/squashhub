import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, ArrowRight } from "lucide-react";
import { computeRankingDeltas, type RankingFormulaSettings } from "@/lib/ranking-points";

export interface SimMember {
  id: string;
  name: string;
  ranking_points?: number | null;
  ladder_position?: number | null;
}

interface Props {
  /** Live (possibly unsaved) formula values from the settings form. */
  settings: RankingFormulaSettings;
  /** Leaderboard rows, already ordered by ranking points descending. */
  members: SimMember[];
  /** Whether the club-level ranking system is currently switched on. */
  enabled: boolean;
  /** True when the settings form has unsaved edits. */
  dirty?: boolean;
}

const WEIGHTS = ["0.5", "1", "1.5", "2", "3"];

export function RankingSimulatorCard({ settings, members, enabled, dirty }: Props) {
  const ranked = useMemo(
    () => members.map((m, i) => ({ ...m, rank: i + 1 })),
    [members],
  );

  const [aId, setAId] = useState<string>(ranked[0]?.id ?? "");
  const [bId, setBId] = useState<string>(ranked[1]?.id ?? "");
  const [winner, setWinner] = useState<"a" | "b">("a");
  const [weight, setWeight] = useState("1");

  const a = ranked.find((m) => m.id === aId);
  const b = ranked.find((m) => m.id === bId);

  const result = useMemo(() => {
    if (!a || !b || a.id === b.id) return null;
    const w = winner === "a" ? a : b;
    const l = winner === "a" ? b : a;
    const { winnerDelta, loserDelta } = computeRankingDeltas(w.rank, l.rank, settings);
    const mult = Number(weight) || 1;
    return {
      w,
      l,
      winnerDelta: round2(winnerDelta * mult),
      loserDelta: round2(loserDelta * mult),
      upset: w.rank > l.rank,
      gap: Math.abs(w.rank - l.rank),
    };
  }, [a, b, winner, weight, settings]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Try it out (simulation)</h3>
        {dirty && (
          <Badge variant="outline" className="text-[10px]">Previewing unsaved values</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick two players and a result to see exactly how many points the rules above would award. Nothing is saved
        and no player's points change.
      </p>

      {ranked.length < 2 ? (
        <p className="text-xs text-muted-foreground">Add at least two ranked members to run a simulation.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Player A</Label>
              <PlayerSelect value={aId} onChange={setAId} options={ranked} />
            </div>
            <div>
              <Label className="text-xs">Player B</Label>
              <PlayerSelect value={bId} onChange={setBId} options={ranked} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Winner</Label>
              <Select value={winner} onValueChange={(v) => setWinner(v as "a" | "b")}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">{a?.name ?? "Player A"}</SelectItem>
                  <SelectItem value="b">{b?.name ?? "Player B"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Competition weight</Label>
              <Select value={weight} onValueChange={setWeight}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEIGHTS.map((w) => (
                    <SelectItem key={w} value={w}>{w}× {w === "1" ? "(normal)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {result && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant={result.upset ? "default" : "secondary"} className="text-[10px]">
                  {result.upset ? `Upset win — ${result.gap} place${result.gap === 1 ? "" : "s"} up` : result.gap === 0 ? "Same rank" : `Favourite won — ${result.gap} place${result.gap === 1 ? "" : "s"} down`}
                </Badge>
                {Number(weight) !== 1 && <span className="text-muted-foreground">weighted {weight}×</span>}
              </div>

              <SimRow
                label="Winner"
                name={result.w.name}
                rank={result.w.rank}
                before={Number(result.w.ranking_points ?? 0)}
                delta={result.winnerDelta}
              />
              <SimRow
                label="Loser"
                name={result.l.name}
                rank={result.l.rank}
                before={Number(result.l.ranking_points ?? 0)}
                delta={result.loserDelta}
              />
            </div>
          )}

          {!enabled && (
            <p className="text-[11px] text-amber-600">
              The ranking points system is currently switched off, so real results would award nothing.
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setWinner(winner === "a" ? "b" : "a");
            }}
          >
            Swap the winner
          </Button>
        </>
      )}
    </Card>
  );
}

function PlayerSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (SimMember & { rank: number })[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a player" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            #{m.rank} · {m.name} ({Number(m.ranking_points ?? 0).toFixed(2)} pts)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SimRow({
  label,
  name,
  rank,
  before,
  delta,
}: {
  label: string;
  name: string;
  rank: number;
  before: number;
  delta: number;
}) {
  const after = round2(before + delta);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground"> (#{rank})</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
        <span className="text-muted-foreground">{before.toFixed(2)}</span>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <span className="font-semibold">{after.toFixed(2)}</span>
        <span className={delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"}>
          ({delta > 0 ? "+" : ""}{delta.toFixed(2)})
        </span>
      </div>
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
