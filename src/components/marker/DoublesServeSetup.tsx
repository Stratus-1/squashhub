import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  methodLabel,
  DOUBLES_SERVING_METHODS,
  type DoublesServingMethod,
  type PairNames,
  type Slot,
  type Team,
} from "@/lib/marker/doubles-serving";

export interface DoublesSetupResult {
  forehand: { a: Slot; b: Slot };
  servingTeam: Team;
  firstServer: { a: Slot; b: Slot };
}

interface Props {
  method: DoublesServingMethod;
  pairs: { a: PairNames; b: PairNames };
  /** True when scores already exist (resume on a fresh device). */
  resuming?: boolean;
  onStart: (r: DoublesSetupResult) => void;
}

/**
 * Start-of-match prompt for guided doubles serving. The marker must pick the
 * Forehand player of BOTH pairs — nothing is assumed from list order.
 */
export function DoublesServeSetup({ method, pairs, resuming, onStart }: Props) {
  const [fh, setFh] = useState<{ a: Slot | null; b: Slot | null }>({ a: null, b: null });
  const [first, setFirst] = useState<{ a: Slot | null; b: Slot | null }>({ a: null, b: null });
  const [servingTeam, setServingTeam] = useState<Team | null>(null);
  const alternating = method !== "second_server";

  const firstFor = (t: Team): Slot | null => first[t] ?? fh[t];
  const ready = fh.a !== null && fh.b !== null && servingTeam !== null && (!alternating || (firstFor("a") !== null && firstFor("b") !== null));

  const pairBlock = (t: Team) => (
    <div className="space-y-1.5" data-testid={`pair-setup-${t}`}>
      <p className="text-xs font-semibold">
        Pair {t.toUpperCase()}: {pairs[t][0]} & {pairs[t][1]}
      </p>
      <p className="text-[11px] text-muted-foreground">Who plays Forehand (right side)?</p>
      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as Slot[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={fh[t] === s ? "default" : "outline"}
            className="h-auto min-h-9 whitespace-normal text-xs leading-tight py-1.5"
            onClick={() => setFh((m) => ({ ...m, [t]: s }))}
          >
            {pairs[t][s]}
          </Button>
        ))}
      </div>
      {fh[t] !== null && (
        <p className="text-[11px] text-muted-foreground">
          Forehand: <span className="font-semibold text-foreground">{pairs[t][fh[t]!]}</span> · Backhand:{" "}
          <span className="font-semibold text-foreground">{pairs[t][fh[t] === 0 ? 1 : 0]}</span>
        </p>
      )}
      {alternating && fh[t] !== null && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            {resuming ? "Who served last for this pair's next turn?" : "Who serves first for this pair?"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as Slot[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={firstFor(t) === s ? "secondary" : "outline"}
                className="h-auto min-h-8 whitespace-normal text-[11px] leading-tight py-1"
                onClick={() => setFirst((m) => ({ ...m, [t]: s }))}
              >
                {pairs[t][s]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-4 border-primary/30 bg-primary/5 space-y-3" data-testid="doubles-serve-setup">
      <div className="text-center">
        <p className="text-sm font-heading font-bold">{resuming ? "Confirm doubles positions" : "Doubles — set court positions"}</p>
        <p className="text-xs text-muted-foreground">
          Serving method: <span className="font-semibold">{methodLabel(method)}</span> —{" "}
          {DOUBLES_SERVING_METHODS.find((m) => m.value === method)?.hint}
        </p>
      </div>
      {pairBlock("a")}
      {pairBlock("b")}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">{resuming ? "Which pair is serving now?" : "Which pair serves first (toss winner)?"}</p>
        <div className="grid grid-cols-2 gap-2">
          {(["a", "b"] as Team[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={servingTeam === t ? "default" : "outline"}
              className="h-auto min-h-9 whitespace-normal text-xs leading-tight py-1.5"
              onClick={() => setServingTeam(t)}
            >
              {pairs[t][0]} & {pairs[t][1]}
            </Button>
          ))}
        </div>
      </div>
      <Button
        size="sm"
        className="w-full font-semibold"
        disabled={!ready}
        onClick={() => {
          if (!ready) return;
          onStart({
            forehand: { a: fh.a!, b: fh.b! },
            servingTeam: servingTeam!,
            firstServer: { a: (firstFor("a") ?? fh.a)!, b: (firstFor("b") ?? fh.b)! },
          });
        }}
      >
        Start match
      </Button>
    </Card>
  );
}
