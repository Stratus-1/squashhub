import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RingProgress = {
  played: number;
  wins: number;
  winPct: number;
};

type Tile = {
  label: string;
  value: React.ReactNode;
  unit?: string;
  dotColor: string;
  helperText?: string;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function ring(radius: number, progress: number) {
  const clamped = clamp01(progress);
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  return { circumference, offset };
}

export function AppleStatsCard({
  title,
  subtitle,
  badgeText,
  ringLabel,
  ringValue,
  progress,
  tiles,
  rightHeader,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  badgeText?: string;
  ringLabel: string;
  ringValue: React.ReactNode;
  progress: RingProgress;
  tiles: Tile[];
  rightHeader?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const r1 = ring(44, progress.played);
  const r2 = ring(30, progress.wins);
  const r3 = ring(16, progress.winPct);

  return (
    <Card
      className={[
        "p-4 overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-background to-accent/10",
        className || "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold font-heading">{title}</p>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {rightHeader}
          {badgeText ? (
            <Badge
              variant="secondary"
              className="text-[10px] bg-primary/10 text-primary border border-primary/20 shrink-0"
            >
              {badgeText}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-foreground/70">{ringLabel}</p>
          <div className="mt-2 flex items-center justify-center">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 120 120" className="w-full h-full">
                <circle cx="60" cy="60" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                <circle
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke="#007aff"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${r1.circumference} ${r1.circumference}`}
                  strokeDashoffset={r1.offset}
                  transform="rotate(-90 60 60)"
                />

                <circle cx="60" cy="60" r="30" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                <circle
                  cx="60"
                  cy="60"
                  r="30"
                  fill="none"
                  stroke="#34c759"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${r2.circumference} ${r2.circumference}`}
                  strokeDashoffset={r2.offset}
                  transform="rotate(-90 60 60)"
                />

                <circle cx="60" cy="60" r="16" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                <circle
                  cx="60"
                  cy="60"
                  r="16"
                  fill="none"
                  stroke="#ff2d55"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${r3.circumference} ${r3.circumference}`}
                  strokeDashoffset={r3.offset}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xl font-bold font-heading">{ringValue}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.dotColor }} />
                <p className="text-[10px] uppercase tracking-wide text-foreground/70">{t.label}</p>
              </div>
              <p className="text-lg font-bold font-heading mt-1">{t.value}</p>
              {t.unit ? <p className="text-[11px] text-muted-foreground -mt-0.5">{t.unit}</p> : null}
              {t.helperText ? <p className="text-[11px] text-muted-foreground mt-1">{t.helperText}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
}

