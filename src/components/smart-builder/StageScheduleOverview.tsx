import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, CalendarDays, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarRows, stageBadge, STATUS_LABEL, type StageStatus, type ViewStage } from "@/lib/smart-builder/schedule-view";

/** Token-based styling per status (blue reserved, green fits, amber warning, red clash). */
export const STATUS_TONE: Record<StageStatus, string> = {
  conflict: "border-destructive/60 bg-destructive/10 text-destructive",
  short: "border-warning/60 bg-warning/10 text-warning-foreground",
  incomplete: "border-warning/60 bg-warning/10 text-warning-foreground",
  fits: "border-success/60 bg-success/10 text-success-foreground",
  reserved: "border-primary/50 bg-primary/10 text-primary",
  play_by: "border-border bg-muted text-muted-foreground",
  later: "border-dashed border-border bg-background text-muted-foreground",
};
const STATUS_MARK: Record<StageStatus, string> = { conflict: "✕", short: "!", incomplete: "!", fits: "✓", reserved: "■", play_by: "⏱", later: "…" };

export function StatusBadge({ status }: { status: StageStatus }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}><span aria-hidden>{STATUS_MARK[status]}</span>{STATUS_LABEL[status]}</span>;
}

/** Collapsible shell around one existing stage form. The body is the unchanged form. */
export function StageCardShell({ stage, index, title, unitLabel, summary, status, open, onToggle, children }: {
  stage: ViewStage; index: number; title: string; unitLabel: string; summary: string; status: StageStatus; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const po = stage.phase === "playoff";
  return (
    <div id={`stage-${stage.id}`} data-testid="stage-card" data-open={open ? "true" : "false"} className={cn("scroll-mt-24 rounded-xl border bg-card shadow-sm", po ? "border-primary/40" : "border-border", status === "conflict" && "border-destructive/60")}>
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{title || (po ? "Playoff stage" : `Round ${index + 1}`)}</span>
            <span className="text-xs text-muted-foreground">· {unitLabel}</span>
            <StatusBadge status={status} />
          </div>
          <p className="break-words text-xs text-muted-foreground" data-testid="stage-summary">{summary}</p>
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs" aria-expanded={open} aria-controls={`stage-body-${stage.id}`} onClick={onToggle}>
            {open ? <><ChevronUp className="mr-1 h-3.5 w-3.5" />Collapse</> : <><ChevronDown className="mr-1 h-3.5 w-3.5" />Edit</>}
          </Button>
        </div>
        <span aria-hidden className={cn("shrink-0 font-display text-3xl font-black leading-none tabular-nums sm:text-4xl", po ? "text-warning" : "text-primary")}>{stageBadge(stage, index)}</span>
      </div>
      {open && <div id={`stage-body-${stage.id}`} className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

type Props = {
  main: ViewStage[]; playoffs: ViewStage[]; statusOf: (id: string) => StageStatus;
  unitName: (k: string) => string; dayLabel: (d: string) => string; courtName: (id: string) => string; onJump: (id: string) => void;
};

/** Timeline (R1 → … → Final) with an optional court-calendar view. Read-only. */
export function StageScheduleOverview({ main, playoffs, statusOf, unitName, dayLabel, courtName, onJump }: Props) {
  const [view, setView] = useState<"timeline" | "calendar">("timeline");
  const all = [...main, ...playoffs];
  if (!all.length) return null;
  const when = (s: ViewStage) => s.mode === "scheduled" ? (s.date ? dayLabel(s.date) : "date not set") : s.mode === "play_by" ? (s.deadline ? `by ${dayLabel(s.deadline)}` : "deadline not set") : "decide later";
  const rows = calendarRows(all, statusOf);
  const playBy = all.filter((s) => s.mode === "play_by");
  const chip = (s: ViewStage, i: number) => (
    <li key={s.id} className="flex min-w-0 items-center gap-1">
      {i > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
      <button type="button" onClick={() => onJump(s.id)} data-testid="timeline-chip"
        className={cn("min-w-0 rounded-lg border px-2 py-1 text-left text-xs transition-colors hover:bg-accent", STATUS_TONE[statusOf(s.id)])}
        aria-label={`${s.name}${s.unit ? ` (${unitName(s.unit)})` : ""}: ${when(s)} — ${STATUS_LABEL[statusOf(s.id)]}`}>
        <span className="block font-bold">{s.phase === "playoff" ? stageBadge(s, 0) : `R${main.indexOf(s) + 1}`}{s.unit ? <span className="font-normal"> · {unitName(s.unit)}</span> : null}</span>
        <span className="block whitespace-nowrap opacity-90">{when(s)}</span>
      </button>
    </li>
  );
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Tournament timeline" data-testid="schedule-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Tournament timeline</div>
        <div className="flex gap-1" role="group" aria-label="Timeline view">
          <Button type="button" size="sm" variant={view === "timeline" ? "default" : "outline"} aria-pressed={view === "timeline"} onClick={() => setView("timeline")}><ListOrdered className="mr-1 h-3.5 w-3.5" />Timeline</Button>
          <Button type="button" size="sm" variant={view === "calendar" ? "default" : "outline"} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays className="mr-1 h-3.5 w-3.5" />Court calendar</Button>
        </div>
      </div>
      {view === "timeline" ? (
        <ol className="flex flex-wrap items-center gap-1.5">{all.map(chip)}</ol>
      ) : (
        <div className="space-y-2" data-testid="court-calendar">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No scheduled dates with courts yet.</p>}
          {rows.map((r) => (
            <div key={r.date} className="rounded-lg border border-border">
              <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-semibold">{dayLabel(r.date)}</div>
              <ul className="divide-y divide-border">
                {r.entries.map((e, i) => (
                  <li key={`${e.stageId}-${i}`} className="grid gap-1 px-2 py-1.5 text-xs sm:grid-cols-[minmax(0,10rem)_6.5rem_1fr] sm:items-center">
                    <button type="button" className="truncate text-left font-medium underline-offset-2 hover:underline" onClick={() => onJump(e.stageId)}>{e.name}{e.unit ? ` · ${unitName(e.unit)}` : ""}</button>
                    <span className="tabular-nums text-muted-foreground">{e.from || "?"}–{e.to || "?"}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {e.courtIds.length === 0 ? <span className="text-muted-foreground">no courts</span> : e.courtIds.map((c) => <span key={c} className={cn("rounded border px-1.5 py-0.5", STATUS_TONE[e.status])}>{courtName(c)}</span>)}
                      <StatusBadge status={e.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {playBy.length > 0 && <p className="text-xs text-muted-foreground">Play-by rounds reserve no courts: {playBy.map((s) => `${s.name} (${when(s)})`).join(", ")}.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-border pt-2" aria-label="Legend">
        {(["reserved", "fits", "short", "conflict", "play_by"] as StageStatus[]).map((k) => <StatusBadge key={k} status={k} />)}
      </div>
      <p className="text-[11px] text-muted-foreground">Planning view only — these are planned court reservations, not bookings or games. Nothing is booked from here.</p>
    </section>
  );
}
