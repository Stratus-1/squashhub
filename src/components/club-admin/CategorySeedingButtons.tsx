import { cn } from "@/lib/utils";

const OPTIONS: { value: string; label: string }[] = [
  { value: "ranking", label: "Rankings" },
  { value: "ladder", label: "Club ladder" },
  { value: "manual", label: "Manual seeds" },
  { value: "random", label: "Random" },
  { value: "none", label: "No seeding" },
  { value: "later", label: "Decide later" },
];

/** One-row button version of the category seeding choice (replaces the dropdown). */
export function CategorySeedingButtons({ value, onChange, label, previousStage = false }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  previousStage?: boolean;
}) {
  const options = previousStage
    ? [{ value: "previous_stage", label: "Previous stage rankings" }, ...OPTIONS]
    : OPTIONS;
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors",
            value === o.value
              ? "border-fuchsia-500 bg-fuchsia-500/15 text-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Snake vs strength-band pool placement, with a plain-language explanation of each. */
export function PoolPlacementButtons({ value, onChange, label }: {
  value: "snake" | "banded";
  onChange: (value: "snake" | "banded") => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {([
          { v: "snake" as const, l: "Snake" },
          { v: "banded" as const, l: "Strength band" },
        ]).map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors",
              value === o.v
                ? "border-fuchsia-500 bg-fuchsia-500/15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
      {value === "snake" ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Snake:</strong> seed 1 → Pool A, 2 → Pool B, 3 → Pool B, 4 → Pool A, then 5 → A, 6 → B …
          (1, 2 then 3 back, 4). Strength is spread evenly, so every pool is about equally strong.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Strength band:</strong> seeds 1, 2, 3, 4 → Pool A, then 5, 6, 7, 8 → Pool B, 9–12 → Pool C …
          The strongest players are banded together in Pool A, the next band in Pool B, and so on.
        </p>
      )}
    </div>
  );
}

/** Plain-language explanation of the chosen pool placement. */
export function PlacementExplanation({ value }: { value: "snake" | "banded" }) {
  return value === "snake" ? (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      <strong>Snake:</strong> seed 1 → Pool A, 2 → Pool B, 3 → Pool B, 4 → Pool A, then 5 → A, 6 → B … (1, 2 then 3 back, 4).
      Strength is spread evenly, so every pool is about equally strong.
    </p>
  ) : (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      <strong>Strength band:</strong> seeds 1, 2, 3, 4 → Pool A, then 5, 6, 7, 8 → Pool B, 9–12 → Pool C …
      The strongest players are banded together in Pool A, the next band in Pool B, and so on.
    </p>
  );
}
