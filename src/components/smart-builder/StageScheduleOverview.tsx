import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, CalendarDays, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarRows, roundMatrix, stageBadge, stageDays, STATUS_LABEL, type StageStatus, type ViewStage } from "@/lib/smart-builder/schedule-view";

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
  /** Optional one-line capacity summary per stage (e.g. "18 matches / 27 slots"). */
  capacityText?: (id: string) => string | null;
};

/** Timeline (R1 → … → Final) with an optional court-calendar view. Read-only. */
export function StageScheduleOverview({ main, playoffs, statusOf, unitName, dayLabel, courtName, onJump, capacityText }: Props) {
  const [view, setView] = useState<"timeline" | "calendar">("timeline");
  const [calMode, setCalMode] = useState<"round" | "date">("round");
  const all = [...main, ...playoffs];
  if (!all.length) return null;
  const when = (s: ViewStage) => s.mode === "scheduled" ? (s.date ? dayLabel(s.date) : "date not set") : s.mode === "play_by" ? (s.deadline ? `by ${dayLabel(s.deadline)}` : "deadline not set") : "decide later";
  const rows = calendarRows(all, statusOf);
  const scheduled = all.filter((s) => stageDays(s).length > 0);
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
        <div className="space-y-3" data-testid="court-calendar">
          <div className="flex gap-1" role="group" aria-label="Calendar layout">
            <Button type="button" size="sm" variant={calMode === "round" ? "secondary" : "ghost"} aria-pressed={calMode === "round"} onClick={() => setCalMode("round")} className="h-7 text-xs">By round</Button>
            <Button type="button" size="sm" variant={calMode === "date" ? "secondary" : "ghost"} aria-pressed={calMode === "date"} onClick={() => setCalMode("date")} className="h-7 text-xs">By date</Button>
          </div>
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No scheduled dates with courts yet.</p>}
          {calMode === "round" ? scheduled.map((s) => {
            const m = roundMatrix(s, all);
            const st = statusOf(s.id);
            const badge = s.phase === "playoff" ? stageBadge(s, 0) : stageBadge(s, main.indexOf(s));
            const cap = capacityText?.(s.id);
            return (
              <div key={s.id} className={cn("rounded-xl border bg-card", st === "conflict" ? "border-destructive/60" : s.phase === "playoff" ? "border-primary/40" : "border-border")} data-testid="round-matrix">
                <div className="flex items-start gap-3 border-b border-border p-3">
                  <span aria-hidden className={cn("font-display text-3xl font-black leading-none tabular-nums", s.phase === "playoff" ? "text-warning" : "text-primary")}>{badge}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => onJump(s.id)} className="text-left text-sm font-semibold underline-offset-2 hover:underline">{s.name}{s.unit ? <span className="font-normal text-muted-foreground"> · {unitName(s.unit)}</span> : null}</button>
                      <StatusBadge status={st} />
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="round-matrix-summary">
                      {m.first ? (m.first === m.last ? dayLabel(m.first) : `${dayLabel(m.first)} – ${dayLabel(m.last)}`) : "date not set"} · {m.days.length} {m.days.length === 1 ? "day" : "days"} · {m.courts.length} {m.courts.length === 1 ? "court" : "courts"}{cap ? ` · ${cap}` : ""}
                    </p>
                  </div>
                </div>
                {m.courts.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No courts chosen yet.</p> : (
                  <div className="overflow-x-auto p-2">
                    <table className="w-full min-w-max border-separate border-spacing-1 text-xs">
                      <thead><tr>
                        <th scope="col" className="sticky left-0 bg-card px-2 py-1 text-left font-medium text-muted-foreground">Court</th>
                        {m.days.map((d) => <th key={d} scope="col" className="whitespace-nowrap px-2 py-1 text-left font-semibold">{dayLabel(d)}</th>)}
                      </tr></thead>
                      <tbody>
                        {m.courts.map((c) => (
                          <tr key={c}>
                            <th scope="row" className="sticky left-0 whitespace-nowrap bg-card px-2 py-1 text-left font-medium">{courtName(c)}</th>
                            {m.days.map((d) => {
                              const cell = m.cells[c][d];
                              if (!cell) return <td key={d} className="rounded-md border border-dashed border-border px-2 py-1.5 text-center text-muted-foreground" aria-label={`${courtName(c)}, ${dayLabel(d)}: not planned`}>—</td>;
                              const bad = cell.clash.length > 0;
                              return (
                                <td key={d} data-testid="matrix-cell" className={cn("whitespace-nowrap rounded-md border px-2 py-1.5 font-medium tabular-nums", bad ? STATUS_TONE.conflict : cell.shared.length ? STATUS_TONE.short : "border-primary bg-primary text-primary-foreground")}
                                  aria-label={`${courtName(c)}, ${dayLabel(d)}: planned ${cell.from}–${cell.to}${bad ? `, clashes with ${cell.clash.join(", ")}` : cell.shared.length ? `, shares courts with ${cell.shared.join(", ")}` : ""}`}>
                                  {cell.from || "?"}–{cell.to || "?"}
                                  {bad && <span className="block text-[10px] font-normal">✕ clash: {cell.clash.join(", ")}</span>}
                                  {!bad && cell.shared.length > 0 && <span className="block text-[10px] font-normal">shares: {cell.shared.join(", ")}</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }) : rows.map((r) => (
            <div key={r.date} className="rounded-lg border border-border">
              <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-semibold">{dayLabel(r.date)}</div>
              <ul className="divide-y divide-border">
                {r.entries.map((e, i) => (
                  <li key={`${e.stageId}-${i}`} className="grid gap-1 px-2 py-1.5 text-xs sm:grid-cols-[minmax(0,10rem)_6.5rem_1fr] sm:items-center">
                    <button type="button" className="truncate text-left font-medium underline-offset-2 hover:underline" onClick={() => onJump(e.stageId)}>{e.name}{e.unit ? ` · ${unitName(e.unit)}` : ""}</button>
                    <span className="tabular-nums text-muted-foreground">{e.from || "?"}–{e.to || "?"}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {e.courtIds.length === 0 ? <span className="text-muted-foreground">no courts</span> : e.courtIds.map((c) => <span key={c} className={cn("rounded border px-1.5 py-0.5", STATUS_TONE[e.status])}>{courtName(c)}</span>)}
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
