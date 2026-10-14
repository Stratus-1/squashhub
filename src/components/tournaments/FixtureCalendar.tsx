import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** Visual scale only (px per minute). Never alters times or data. */
export const ZOOM_MIN = 1, ZOOM_MAX = 5, ZOOM_DEFAULT = 2.5;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
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

/** "Willem Pretorius v Ethan Tshabalala" -> "Pretorius v Tshabalala" for narrow week lanes (full names in the detail dialog). */
export const shortTitle = (t: string) => t.split(/\s+v\s+/).map((side) => side.split(" & ").map((n) => n.trim().split(/\s+/).pop()).join(" & ")).join(" v ");

function EventBlock({ e, top, height, left, width, compact, onOpen }: { e: CalEvent; top: number; height: number; left: string; width: string; compact?: boolean; onOpen: (e: CalEvent) => void }) {
  const st = e.state ?? "upcoming";
  const badge = e.kind === "proposed" ? "Proposed" : (st === "live" || st === "completed" || st === "paused") ? `${STATE_TEXT[st]}${e.score ? ` ${e.score}` : ""}` : null;
  return (
    <button type="button" onClick={() => onOpen(e)} data-testid="cal-event" data-kind={e.kind} data-state={st}
      aria-label={`${e.time?.slice(0, 5) ?? ""} ${e.court ?? ""} ${e.title}${badge ? ` ${badge}` : ""}`}
      className={cn("absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:brightness-125",
        e.kind === "confirmed" ? "border border-border bg-card shadow-sm" : "border border-dashed border-muted-foreground/60 bg-muted/40")}
      style={{ top, height, left, width, borderLeft: `3px solid hsl(var(${e.kind === "proposed" ? "--muted-foreground" : STATE_VAR[st]}))` }}>
      <div className="flex items-center gap-1">
        {e.court && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{compact ? e.court.replace(/court\s*/i, "C") : e.court}</span>}
        {badge && <span className="ml-auto truncate rounded px-1 text-[10px] font-semibold" style={{ backgroundColor: `hsl(var(${e.kind === "proposed" ? "--muted-foreground" : STATE_VAR[st]}) / .25)` }}>{badge}</span>}
      </div>
      <div className={cn("mt-0.5 font-semibold", compact ? "line-clamp-3" : "line-clamp-2")}>{compact ? shortTitle(e.title) : e.title}</div>
      {!compact && e.subtitle && <div className="truncate text-muted-foreground">{e.subtitle}</div>}
    </button>
  );
}

export function FixtureCalendar({ events, defaultDuration = 40 }: { events: CalEvent[]; defaultDuration?: number }) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => initialCalendarDate(events));
  const [ppm, setPpm] = useState(ZOOM_DEFAULT);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ppmRef = useRef(ppm); ppmRef.current = ppm;
  // Zoom keeping the time under the pointer (or grid centre) stationary on screen.
  const zoomTo = (next: number, clientY?: number) => {
    const el = gridRef.current; const z = clampZoom(next);
    if (!el || z === ppmRef.current) return false;
    const r = el.getBoundingClientRect();
    const py = clientY ?? Math.min(window.innerHeight, r.bottom) / 2 + Math.max(0, r.top) / 2;
    const offset = py - r.top; // px from grid top to anchor
    setPpm(z);
    requestAnimationFrame(() => window.scrollBy(0, offset * (z / ppmRef.current) - offset));
    return true;
  };
  // Ctrl/Cmd + wheel or trackpad pinch zooms; plain wheel keeps scrolling the page through the calendar.
  useEffect(() => {
    const el = gridRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (zoomTo(ppmRef.current * Math.exp(-dy * 0.003), e.clientY)) e.preventDefault();
      else if (e.ctrlKey) e.preventDefault(); // block browser page zoom even at bounds
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches) setView("day"); }, []);
  const timed = events.filter((e) => e.time && e.kind !== "play_by");
  const [h0, h1] = hourRange(timed);
  const gridH = (h1 - h0) * 60 * ppm;
  const ev = (e: CalEvent) => ({ top: (mins(e.time!) - h0 * 60) * ppm, height: Math.max(56, (e.durationMin ?? defaultDuration) * ppm - 3) });
  const days = view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
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
        {view !== "month" && (
          <div className="flex items-center gap-1" role="group" aria-label="Calendar zoom">
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Zoom out calendar" onClick={() => zoomTo(ppm / 1.25)} disabled={ppm <= ZOOM_MIN}><ZoomOut className="h-4 w-4" /></Button>
            <span className="w-11 text-center text-xs tabular-nums" aria-live="polite" data-testid="cal-zoom">{Math.round((ppm / ZOOM_DEFAULT) * 100)}%</span>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Zoom in calendar" onClick={() => zoomTo(ppm * 1.25)} disabled={ppm >= ZOOM_MAX}><ZoomIn className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" aria-label="Reset calendar zoom" onClick={() => setPpm(ZOOM_DEFAULT)}><RotateCcw className="h-4 w-4" /></Button>
          </div>
        )}
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
          <div style={{ minWidth: view === "day" ? 320 : 1180 }}>
            {/* header */}
            <div className="sticky top-0 z-10 flex border-b border-border bg-muted">
              <div className="w-16 shrink-0" />
              {days.map((d) => <button type="button" key={d} onClick={() => { setAnchor(d); setView("day"); }} aria-label={`Open ${calDayLabel(d)}`} className={cn("flex-1 border-l border-border px-2 py-1.5 text-center font-semibold hover:bg-accent/40", d === todayIso() && "text-primary")} data-testid="cal-day">{calDayLabel(d)}{view === "week" && <span className="ml-1 font-normal text-muted-foreground">({timed.filter((e) => e.date === d).length})</span>}</button>)}
            </div>
            {deadlines.length > 0 && (
              <div className="flex border-b border-border">
                <div className="w-16 shrink-0 px-1 py-1 text-[10px] text-muted-foreground">Play by</div>
                {(view === "day" ? [anchor] : days).map((d) => (
                  <div key={d} className="flex-1 space-y-0.5 border-l border-border p-1">
                    {deadlines.filter((e) => e.date === d).map((e) => <div key={e.id} data-testid="cal-deadline" className="truncate rounded-sm border border-warning/60 bg-warning/10 px-1 text-[10px]">{e.title}</div>)}
                  </div>
                ))}
              </div>
            )}
            {/* grid */}
            <div ref={gridRef} className="relative flex" style={{ height: gridH }} data-testid="cal-grid">
              <div className="w-16 shrink-0 border-r border-border bg-muted/40" data-testid="cal-axis">
                {hours.map((h) => (
                  <div key={h} className="relative border-t border-border" style={{ height: 60 * ppm }}>
                    <span className="absolute left-0 right-1 top-0.5 text-right text-xs font-semibold tabular-nums text-foreground">{String(h).padStart(2, "0")}:00</span>
                    {ppm >= 1.5 && <span className="absolute right-1 text-right text-[10px] tabular-nums text-muted-foreground" style={{ top: 30 * ppm - 6 }}>{String(h).padStart(2, "0")}:30</span>}
                  </div>
                ))}
              </div>
              {days.map((col) => {
                // Time slots first: games starting together sit side by side, each labelled with its court.
                const colEvents = timed.filter((e) => e.date === col);
                const slots = new Map<string, CalEvent[]>();
                colEvents.forEach((e) => slots.set(e.time!.slice(0, 5), [...(slots.get(e.time!.slice(0, 5)) ?? []), e]));
                return (
                  <div key={col} className="relative flex-1 border-l border-border">
                    {hours.map((h) => <div key={h} className="border-t border-border/70" style={{ height: 60 * ppm, backgroundImage: "linear-gradient(to bottom, transparent calc(50% - 0.5px), hsl(var(--border) / .35) calc(50% - 0.5px), hsl(var(--border) / .35) calc(50% + 0.5px), transparent calc(50% + 0.5px))" }} />)}
                    {[...slots.values()].flatMap((group) => {
                      group.sort((x, y) => (x.court ?? "").localeCompare(y.court ?? "", undefined, { numeric: true }));
                      const w = 100 / group.length;
                      return group.map((e, i) => { const { top, height } = ev(e); return <EventBlock key={e.id} e={e} top={top} height={height} left={`calc(${i * w}% + 1px)`} width={`calc(${w}% - 2px)`} compact={view === "week" && group.length > 2} onOpen={setOpen} />; });
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm" data-testid="cal-detail">
          <DialogHeader><DialogTitle className="text-base">{open?.title}</DialogTitle></DialogHeader>
          {open && (
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">When</dt><dd>{calDayLabel(open.date)}{open.time ? ` · ${open.time.slice(0, 5)}` : ""}{open.durationMin ? ` (${open.durationMin} min)` : ""}</dd>
              <dt className="text-muted-foreground">Court</dt><dd>{open.court ?? "—"}</dd>
              {open.subtitle && <><dt className="text-muted-foreground">Details</dt><dd>{open.subtitle}</dd></>}
              <dt className="text-muted-foreground">Type</dt><dd>{open.kind === "proposed" ? "Proposed slot (not booked)" : open.kind === "play_by" ? "Play-by deadline" : "Saved fixture"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{STATE_TEXT[open.state ?? "upcoming"]}{open.score ? ` · ${open.score}` : ""}</dd>
            </dl>
          )}
          <p className="text-[11px] text-muted-foreground">View only — nothing can be changed here.</p>
        </DialogContent>
      </Dialog>
      {timed.length === 0 && <p className="text-muted-foreground">No fixtures with a saved time to place on the calendar.</p>}
    </div>
  );
}
