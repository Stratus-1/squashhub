import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SetupStep = { key: string; label: string; validated: boolean };

/** Presentation only: reachability and validation remain owned by the builder. */
export function TournamentSetupNavigator({ steps, current, reached, onSelect }: {
  steps: SetupStep[]; current: number; reached: number; onSelect: (index: number) => void;
}) {
  const position = Math.min(current, steps.length - 1);
  return <nav aria-label="Tournament setup steps" className="tournament-setup-nav">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <p className="text-sm font-semibold text-foreground" aria-live="polite">Step {position + 1} of {steps.length}</p>
      <span className="text-xs text-muted-foreground">{steps[position]?.label}</span>
    </div>
    <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
      {steps.map((s, i) => {
        const active = i === position;
        const checked = i < reached && s.validated;
        return <li key={s.key} className="min-w-0">
          <Button type="button" variant="ghost" disabled={i > reached} onClick={() => onSelect(i)}
            aria-current={active ? "step" : undefined} data-state={active ? "current" : checked ? "validated" : "incomplete"}
            title={checked ? `${s.label} — validated` : s.label}
            className={cn("tournament-setup-step h-auto min-h-11 w-full justify-start whitespace-normal rounded-md px-2.5 py-2 text-left text-xs leading-snug",
              active ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : checked ? "bg-win/10 text-foreground hover:bg-win/15" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <span aria-hidden="true" className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold tabular-nums",
              active ? "bg-primary-foreground/15 text-primary-foreground" : checked ? "bg-win/15 text-win" : "bg-secondary text-muted-foreground")}>
              {checked && !active ? <Check /> : i + 1}
            </span><span className="min-w-0 break-words">{s.label}</span>
          </Button>
        </li>;
      })}
    </ol>
  </nav>;
}
