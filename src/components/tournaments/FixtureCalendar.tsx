import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Read-only visual fixture calendar (Riverside pilot). Real time-grid layout:
 * Day = courts as lanes, Week = days across the top, Month = overview.
 * Only saved date/time/court values are placed; nothing is booked or moved.
 */
export type CalKind = "confirmed" | "proposed" | "play_by";
export type CalState = "upcoming" | "live" | "paused" | "completed" | "bye";
export interface CalEvent {
  id: string; date: string; time: string | null; durationMin?: number; court: string | null;
  title: string; subtitle?: string; kind: CalKind; state?: CalState; score?: string | null;
}
type View = "day" | "week" | "month";

const PX_PER_MIN = 1.1;
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const weekStart = (s: string) => { const d = parse(s); const wd = (d.getUTCDay() + 6) % 7; return addDays(s, -wd); };
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const calDayLabel = (s: string) => { const d = parse(s); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const todayIso = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

const STATE_VAR: Record<CalState, string> = { upcoming: "--round-1", live: "--destructive", paused: "--warning", completed: "--success", bye: "--muted-foreground" };
const STATE_TEXT: Record<CalState, string> = { upcoming: "Upcoming", live: "LIVE", paused: "Paused", completed: "Completed", bye: "Bye" };

/** First date to show: the first event on/after today, else the first event, else today. */
export function initialCalendarDate(events: CalEvent[], today = todayIso()): string {
  const ds = events.map((e) => e.date).sort();
  return ds.find((d) => d >= today) ?? ds[0] ?? today;
}
/** Visible hour range from timed events (padded), default 08–22. */
export function hourRange(events: CalEvent[]): [number, number] {
  const timed = events.filter((e) => e.time);
  if (!timed.length) return [8, 22];
  const lo = Math.min(...timed.map((e) => mins(e.time!)));
  const hi = Math.max(...timed.map((e) => mins(e.time!) + (e.durationMin ?? 40)));
  return [Math.max(0, Math.floor(lo / 60) - 1), Math.min(24, Math.ceil(hi / 60) + 1)];
}

function EventBlock({ e, top, height, left, width, compact }: { e: CalEvent; top: number; height: number; left: string; width: string; compact?: boolean }) {
  const st = e.state ?? "upcoming";
  return (
    <div data-testid="cal-event" data-kind={e.kind} data-state={st} title={`${e.time?.slice(0, 5) ?? ""} ${e.court ?? ""} · ${e.title}${e.subtitle ? ` · ${e.subtitle}` : ""}`}
      className={cn("absolute overflow-hidden rounded-sm px-1 py-0.5 text-[10px] leading-tight text-foreground",
        e.kind === "confirmed" ? "border border-border bg-card shadow-sm" : "border border-dashed border-muted-foreground/60 bg-muted/40")}
      style={{ top, height, left, width, borderLeft: `3px solid hsl(var(${e.kind === "proposed" ? "--muted-foreground" : STATE_VAR[st]}))` }}>
      <div className="flex items-center gap-1 font-semibold tabular-nums">
        <span>{e.time?.slice(0, 5)}</span>{!compact && e.court && <span className="font-normal text-muted-foreground">{e.court}</span>}
        {e.kind === "proposed" ? <span className="ml-auto rounded bg-muted px-1 text-[9px] font-normal">Proposed</span> : (st === "live" || st === "completed") && <span className="ml-auto rounded px-1 text-[9px]" style={{ backgroundColor: `hsl(var(${STATE_VAR[st]}) / .2)` }}>{STATE_TEXT[st]}{e.score ? ` ${e.score}` : ""}</span>}
      </div>
      <div className="truncate">{e.title}</div>
      {!compact && e.subtitle && <div className="truncate text-muted-foreground">{e.subtitle}</div>}
    </div>
  );
}

export function FixtureCalendar({ events, defaultDuration = 40 }: { events: CalEvent[]; defaultDuration?: number }) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => initialCalendarDate(events));
  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches) setView("day"); }, []);
  const timed = events.filter((e) => e.time && e.kind !== "play_by");
  const [h0, h1] = hourRange(timed);
  const gridH = (h1 - h0) * 60 * PX_PER_MIN;
  const ev = (e: CalEvent) => ({ top: (mins(e.time!) - h0 * 60) * PX_PER_MIN, height: Math.max(22, (e.durationMin ?? defaultDuration) * PX_PER_MIN - 2) });
  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const courts = useMemo(() => [...new Set(timed.map((e) => e.court ?? "No court"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [events]);
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const move = (dir: 1 | -1) => {
    if (view === "month") { const d = parse(anchor); d.setUTCMonth(d.getUTCMonth() + dir, 1); setAnchor(iso(d)); } else setAnchor(addDays(anchor, dir * step));
  };
  const rangeLabel = view === "day" ? calDayLabel(anchor) : view === "week" ? `${calDayLabel(days[0])} – ${calDayLabel(days[6])} ${parse(days[6]).getUTCFullYear()}` : `${MON[parse(anchor).getUTCMonth()]} ${parse(anchor).getUTCFullYear()}`;
  const deadlines = events.filter((e) => e.kind === "play_by" && days.includes(e.date));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);

  return (
    <div className="space-y-2 text-xs" data-testid="fixture-calendar" data-view={view}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Previous" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAnchor(todayIso())}>Today</Button>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Next" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h4 className="text-sm font-semibold" data-testid="cal-range">{rangeLabel}</h4>
        <div role="tablist" aria-label="Calendar range" className="ml-auto grid grid-cols-3 border border-border">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm border border-border bg-card" />Saved fixture</span>
        <span className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm border border-dashed border-muted-foreground/60 bg-muted/40" />Proposed slot (not booked)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm border border-warning/60 bg-warning/10" />Play-by deadline</span>
      </div>

      {view === "month" ? (() => {
        const first = parse(anchor); first.setUTCDate(1);
        const start = weekStart(iso(first));
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div className="grid grid-cols-7 border-l border-t border-border" data-testid="cal-month">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-b border-r border-border bg-muted px-1 py-1 text-center font-semibold">{d}</div>)}
            {cells.map((d) => {
              const es = events.filter((e) => e.date === d);
              const inMonth = parse(d).getUTCMonth() === first.getUTCMonth();
              return (
                <button key={d} type="button" onClick={() => { setAnchor(d); setView("day"); }} className={cn("min-h-[72px] border-b border-r border-border p-1 text-left align-top hover:bg-accent/40", !inMonth && "opacity-40")}>
                  <div className="font-semibold">{parse(d).getUTCDate()}</div>
                  {es.filter((e) => e.kind === "confirmed").length > 0 && <div className="mt-0.5 rounded-sm bg-card px-1 text-[10px]">{es.filter((e) => e.kind === "confirmed").length} saved</div>}
                  {es.filter((e) => e.kind === "proposed").length > 0 && <div className="mt-0.5 rounded-sm border border-dashed border-muted-foreground/60 px-1 text-[10px]">{es.filter((e) => e.kind === "proposed").length} proposed</div>}
                  {es.filter((e) => e.kind === "play_by").length > 0 && <div className="mt-0.5 rounded-sm border border-warning/60 bg-warning/10 px-1 text-[10px]">{es.filter((e) => e.kind === "play_by").length} play-by</div>}
                </button>
              );
            })}
          </div>
        );
      })() : (
        <div className="overflow-x-auto rounded-md border border-border">
          <div style={{ minWidth: view === "day" ? Math.max(360, 60 + courts.length * 140) : 860 }}>
            {/* header */}
            <div className="sticky top-0 z-10 flex border-b border-border bg-muted">
              <div className="w-14 shrink-0" />
              {view === "day"
                ? courts.map((c) => <div key={c} className="flex-1 border-l border-border px-2 py-1.5 text-center font-semibold" data-testid="cal-lane">{c}</div>)
                : days.map((d) => <div key={d} className={cn("flex-1 border-l border-border px-2 py-1.5 text-center font-semibold", d === todayIso() && "text-primary")} data-testid="cal-day">{calDayLabel(d)}</div>)}
            </div>
            {deadlines.length > 0 && (
              <div className="flex border-b border-border">
                <div className="w-14 shrink-0 px-1 py-1 text-[10px] text-muted-foreground">Play by</div>
                {(view === "day" ? [anchor] : days).map((d) => (
                  <div key={d} className="flex-1 space-y-0.5 border-l border-border p-1">
                    {deadlines.filter((e) => e.date === d).map((e) => <div key={e.id} data-testid="cal-deadline" className="truncate rounded-sm border border-warning/60 bg-warning/10 px-1 text-[10px]">{e.title}</div>)}
                  </div>
                ))}
              </div>
            )}
            {/* grid */}
            <div className="relative flex" style={{ height: gridH }}>
              <div className="w-14 shrink-0">
                {hours.map((h) => <div key={h} className="relative border-t border-border text-[10px] text-muted-foreground" style={{ height: 60 * PX_PER_MIN }}><span className="absolute -top-2 right-1 bg-background px-0.5 tabular-nums">{String(h).padStart(2, "0")}:00</span></div>)}
              </div>
              {(view === "day" ? courts : days).map((col) => {
                const colEvents = view === "day" ? timed.filter((e) => e.date === anchor && (e.court ?? "No court") === col) : timed.filter((e) => e.date === col);
                // week: lanes per court present that day so simultaneous matches sit side by side
                const lanes = view === "week" ? [...new Set(colEvents.map((e) => e.court ?? "No court"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : ["x"];
                return (
                  <div key={col} className="relative flex-1 border-l border-border">
                    {hours.map((h) => <div key={h} className="border-t border-border/60" style={{ height: 60 * PX_PER_MIN }} />)}
                    {colEvents.map((e) => {
                      const li = view === "week" ? lanes.indexOf(e.court ?? "No court") : 0;
                      const w = 100 / lanes.length;
                      const { top, height } = ev(e);
                      return <EventBlock key={e.id} e={e} top={top} height={height} left={`calc(${li * w}% + 1px)`} width={`calc(${w}% - 2px)`} compact={view === "week" && lanes.length > 2} />;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {timed.length === 0 && <p className="text-muted-foreground">No fixtures with a saved time to place on the calendar.</p>}
    </div>
  );
}
