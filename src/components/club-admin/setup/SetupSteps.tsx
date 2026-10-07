import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

export interface SetupStep {
  id: string;
  /** Short tab label */
  label: string;
  /** Plain-language explanation of what happens on this page */
  description: string;
  complete?: boolean;
}

/**
 * Numbered step tabs for a club setup section, with a plain-language
 * explanation of what the current page does.
 */
export function SetupSteps({
  steps,
  value,
  onChange,
  variant = "pills",
}: {
  steps: SetupStep[];
  value: string;
  onChange: (id: string) => void;
  variant?: "pills" | "connected";
}) {
  const current = steps.find((s) => s.id === value) ?? steps[0];
  return (
    <div className="space-y-2">
      {variant === "connected" ? (
        <div className="overflow-hidden rounded-md border bg-card">
          <div role="group" aria-label="Setup steps" className="grid grid-cols-4 divide-x">
            {steps.map((s, i) => {
              const active = s.id === current?.id;
              return <Button key={s.id} type="button" variant="ghost" aria-current={active ? "step" : undefined}
                onClick={() => onChange(s.id)} className={cn(
                  "h-auto min-h-14 min-w-0 flex-col gap-1 whitespace-normal rounded-none px-1 py-2 text-[11px] leading-tight sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-xs",
                  active ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : s.complete ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}>
                <span className="flex size-4 shrink-0 items-center justify-center text-[11px]">{s.complete ? <Check className="size-3.5" /> : i + 1}</span>
                {s.label}
              </Button>;
            })}
          </div>
        </div>
      ) : <div className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => {
          const active = s.id === current?.id;
          const hue = `var(--step-${(i % 6) + 1})`;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              style={{
                backgroundColor: active ? `hsl(${hue})` : `hsl(${hue} / 0.10)`,
                borderColor: active ? `hsl(${hue})` : `hsl(${hue} / 0.35)`,
                color: active ? `hsl(var(--step-fg))` : `hsl(${hue})`,
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all",
                active ? "shadow-sm" : "hover:opacity-80"
              )}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: active ? `hsl(var(--step-fg) / 0.25)` : `hsl(${hue} / 0.18)`,
                  color: active ? `hsl(var(--step-fg))` : `hsl(${hue})`,
                }}
              >
                {s.complete ? <Check className="w-2.5 h-2.5" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>}
      {current?.description && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Step {steps.findIndex((s) => s.id === current.id) + 1} of {steps.length}:
          </span>{" "}
          {current.description}
        </p>
      )}
    </div>
  );
}

/** Back / Next buttons that walk through the same step list. */
export function SetupStepNav({
  steps,
  value,
  onChange,
  nextDisabled,
  nextHint,
}: {
  steps: SetupStep[];
  value: string;
  onChange: (id: string) => void;
  /** Disable the Next button (e.g. step not applicable in the current context). */
  nextDisabled?: boolean;
  /** Explanation shown next to a disabled Next button. */
  nextHint?: string;
}) {
  const i = Math.max(0, steps.findIndex((s) => s.id === value));
  return (
    <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
      <Button
        variant="ghost"
        size="sm"
        disabled={i === 0}
        onClick={() => onChange(steps[i - 1].id)}
      >
        <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
      </Button>
      {nextDisabled && nextHint ? (
        <p className="text-xs text-muted-foreground flex-1 text-right min-w-[200px]">{nextHint}</p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={nextDisabled || i >= steps.length - 1}
          onClick={() => onChange(steps[i + 1].id)}
        >
          Next: {steps[Math.min(i + 1, steps.length - 1)].label}
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      )}
    </div>
  );
}
