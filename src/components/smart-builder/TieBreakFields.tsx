import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_TIE_BREAKS, TIE_BREAK_CRITERIA, TIE_BREAK_TEXT, normaliseTieBreaks, type TieBreakCriterion } from "@/lib/tournaments/tie-breaks";

const HELP: Record<TieBreakCriterion, string> = {
  game_difference: "games won minus games lost",
  games_won: "total games won",
  points_difference: "rally points for minus against — skipped if any game has no per-game score",
  head_to_head: "results only between the players still level",
};

/** Tournament-wide tie-break order for pools / round robins. Wins always first; manual decision always last. */
export function TieBreakFields({ value, onChange }: { value: TieBreakCriterion[] | undefined; onChange: (v: TieBreakCriterion[]) => void }) {
  const list = normaliseTieBreaks(value);
  const off = TIE_BREAK_CRITERIA.filter((c) => !list.includes(c));
  const move = (i: number, d: -1 | 1) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  const isDefault = JSON.stringify(list) === JSON.stringify(DEFAULT_TIE_BREAKS);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="tie-break-rules">
      <div className="text-sm font-semibold">Tie-break rules <span className="font-normal text-muted-foreground">· pools and round robins</span></div>
      <p className="text-xs text-muted-foreground">When players or pairs finish level on wins, these are applied in order until the tie is broken. You only decide manually if they are still level after all of them — and only when it changes who plays the next stage.</p>
      <ol className="space-y-1 text-sm">
        <li className="flex items-center gap-2"><span className="w-5 text-muted-foreground">1.</span><span className="flex-1 font-medium">Wins</span><span className="text-xs text-muted-foreground">always first</span></li>
        {list.map((c, i) => (
          <li key={c} className="flex items-center gap-2">
            <span className="w-5 text-muted-foreground">{i + 2}.</span>
            <span className="flex-1">{TIE_BREAK_TEXT[c]} <span className="text-xs text-muted-foreground">— {HELP[c]}</span></span>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${TIE_BREAK_TEXT[c]} up`}><ArrowUp className="h-3 w-3" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${TIE_BREAK_TEXT[c]} down`}><ArrowDown className="h-3 w-3" /></Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange(list.filter((x) => x !== c))}>Remove</Button>
          </li>
        ))}
        <li className="flex items-center gap-2"><span className="w-5 text-muted-foreground">{list.length + 2}.</span><span className="flex-1 font-medium">Manual decision</span><span className="text-xs text-muted-foreground">last resort</span></li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {off.map((c) => <Button key={c} type="button" size="sm" variant="outline" onClick={() => onChange([...list, c])}>Add {TIE_BREAK_TEXT[c]}</Button>)}
        {!isDefault && <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...DEFAULT_TIE_BREAKS])}>Reset to default</Button>}
      </div>
    </div>
  );
}
