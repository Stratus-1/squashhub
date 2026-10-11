import { cn } from "@/lib/utils";
import { feeTotals, rand, type FeeBasis, type MixedRule, type FeeEntrant } from "@/lib/tournaments/entry-fees";

type Props = {
  fee: { basis?: FeeBasis | null; mixedRule?: MixedRule | null };
  setFee: (p: { basis?: FeeBasis | null; mixedRule?: MixedRule | null }) => void;
  vary: boolean;
  uniquePlayers: number;
  categoryEntries: number;
  entrants: FeeEntrant[];
  divisionFees: Record<string, number>;
  existing: boolean;
};

function Card({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={cn("rounded-md border p-3 text-left text-sm transition-colors", active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted")}>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}

/** Required Step 17 question: once per player vs per category entered, with a live total using actual picks. */
export function FeeBasisQuestion({ fee, setFee, vary, uniquePlayers, categoryEntries, entrants, divisionFees, existing }: Props) {
  const flat = Math.max(0, ...Object.values(divisionFees));
  const total = (basis: FeeBasis, mixedRule: MixedRule | null) =>
    feeTotals({ basis, mixedRule, flatCents: flat, divisionFees }, entrants).totalCents;
  const perPlayer = total("per_player", vary ? fee.mixedRule ?? null : null);
  const perCat = total("per_category", null);
  return (
    <div className="mt-4 space-y-2 border-t pt-4" data-testid="fee-basis">
      <div className="text-sm font-semibold">How is the entry fee charged? <span className="text-destructive">*</span></div>
      {!fee.basis && (
        <p className="rounded-md border border-dashed p-2 text-xs">
          <b>Needs confirmation.</b> {existing ? "This tournament has no saved choice. Nothing will be charged to member accounts until you choose and then separately approve posting charges." : "Choose one before completing setup."}
        </p>
      )}
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
        <Card active={fee.basis === "per_player"} onClick={() => setFee({ basis: "per_player" })}
          title="Once per player (for the whole tournament)" desc="A player in several categories pays one fee." />
        <Card active={fee.basis === "per_category"} onClick={() => setFee({ basis: "per_category", mixedRule: null })}
          title="Per category entered" desc="A player in two categories owes two fees." />
      </div>
      {fee.basis === "per_player" && vary && (
        <div className="space-y-1 rounded-md border p-2">
          <div className="text-xs font-semibold">Categories have different fees — which fee does a player in several categories pay? <span className="text-destructive">*</span></div>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            <Card active={fee.mixedRule === "highest"} onClick={() => setFee({ mixedRule: "highest" })} title="The highest category fee" desc="One fee, the most expensive of their categories." />
            <Card active={fee.mixedRule === "first"} onClick={() => setFee({ mixedRule: "first" })} title="Their first category's fee" desc="One fee, using the first category they entered." />
          </div>
        </div>
      )}
      <div className="rounded-md bg-muted p-2 text-xs" data-testid="fee-basis-preview">
        <div>Currently picked: <b>{uniquePlayers}</b> unique player{uniquePlayers === 1 ? "" : "s"} · <b>{categoryEntries}</b> category entr{categoryEntries === 1 ? "y" : "ies"}</div>
        <div className={cn(fee.basis === "per_player" && "font-semibold")}>Once per player: {perPlayer == null ? "choose the rule above" : rand(perPlayer)}</div>
        <div className={cn(fee.basis === "per_category" && "font-semibold")}>Per category entered: {rand(perCat)}</div>
        {existing && <div className="mt-1 text-muted-foreground">Estimate only. Saving this choice never posts, changes or removes member account charges; posting is a separate, previewed step on the running tournament.</div>}
      </div>
    </div>
  );
}
