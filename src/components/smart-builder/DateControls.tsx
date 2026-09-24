import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { allStages, type Stage, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { definitionDateIssues, stageWindowOf, tournamentWindow } from "@/lib/smart-builder/dates";
import { d10 } from "@/lib/tournaments/date-window";

type Edit = (mut: (d: TournamentDefinition) => void) => void;
const f = "h-8 min-w-0 w-full bg-white/5 border-white/15 text-white text-xs";
const fmt = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "…");
/** Keep any saved time on the canonical fields. */
const keepTime = (v: string, prev?: string | null) => (v ? (prev && prev.length > 10 ? `${v}${prev.slice(10)}` : v) : null);

/** The ONLY editable tournament Start/End. Design → Tournament dates. */
export function TournamentDatesCard({ def, edit }: { def: TournamentDefinition; edit: Edit }) {
  const sd = def.scheduleDefaults ?? {};
  const set = (patch: Record<string, string | null>) => edit((d) => { d.scheduleDefaults = { ...d.scheduleDefaults, ...patch }; });
  const issues = definitionDateIssues(def);
  const extend = issues.find((i) => i.extendTo);
  // Older drafts kept dates only on stages: offer to adopt them as the one tournament range.
  const stageDates = allStages(def).flatMap(({ stage }) => [d10(stage.schedule.startDate), d10(stage.schedule.endDate), ...(stage.schedule.roundDates ?? []).map(d10)]).filter(Boolean).sort() as string[];
  const adopt = !sd.startDate && !sd.endDate && stageDates.length ? { start: stageDates[0], end: stageDates[stageDates.length - 1] } : null;
  return (
    <section data-field="defaults.startDate" className="rounded-lg border border-white/15 bg-white/[0.04] p-3 space-y-2 text-xs text-white/80">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><CalendarRange className="w-4 h-4" />Tournament dates</h3>
      <p className="text-[11px] text-white/50">The overall window. Stages use these dates unless you give a stage its own narrower window; rounds and games must fall inside.</p>
      <div className="grid grid-cols-2 gap-2 max-w-md">
        <label className="space-y-0.5"><span className="text-[11px] text-white/60">First day</span>
          <Input type="date" className={f} value={d10(sd.startDate) ?? ""} onChange={(e) => set({ startDate: keepTime(e.target.value, sd.startDate) })} /></label>
        <label data-field="defaults.endDate" className="space-y-0.5"><span className="text-[11px] text-white/60">Last day</span>
          <Input type="date" className={f} value={d10(sd.endDate) ?? ""} onChange={(e) => set({ endDate: keepTime(e.target.value, sd.endDate) })} /></label>
      </div>
      {adopt && (
        <p className="text-amber-200">This draft has dates only on its stages.{" "}
          <button type="button" className="underline" onClick={() => set({ startDate: adopt.start, endDate: adopt.end })}>Use {fmt(adopt.start)} → {fmt(adopt.end)} as the tournament dates</button>
        </p>
      )}
      {issues.filter((i) => i.code === "window_order").map((i) => <p key={i.code} className="text-red-300">{i.message}</p>)}
      {extend?.extendTo && (
        <p className="text-amber-200">{extend.message}{" "}
          <button type="button" className="underline" onClick={() => set({ startDate: extend.extendTo!.start, endDate: extend.extendTo!.end })}>
            Extend tournament to {fmt(extend.extendTo.start)} → {fmt(extend.extendTo.end)}
          </button>
        </p>
      )}
    </section>
  );
}

/** Read-only view of the tournament window, for Schedule. */
export function TournamentDatesDisplay({ def }: { def: TournamentDefinition }) {
  const tw = tournamentWindow(def);
  return (
    <div className="text-[11px] text-white/70">
      <span className="text-white/45">Tournament dates: </span>
      {tw.start || tw.end ? `${fmt(tw.start)} → ${fmt(tw.end)}` : <span className="text-red-300">not set</span>}
      <span className="text-white/45"> — change these at the top of Design.</span>
    </div>
  );
}

/** Stage window: inherit the tournament dates, or set a narrower window for this stage. */
export function StageWindowControl({ def, stage, onChange }: {
  def: TournamentDefinition; stage: Stage; onChange: (patch: { startDate?: string | null; endDate?: string | null }) => void;
}) {
  const sw = stageWindowOf(def, stage);
  const tw = tournamentWindow(def);
  const issues = definitionDateIssues(def).filter((i) => i.stageId === stage.id);
  const playBy = stage.schedule.mode === "play_by";
  return (
    <div className="space-y-1 text-[11px] text-white/75 sm:col-span-2">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={sw.inherits}
          onChange={(e) => onChange(e.target.checked ? { startDate: null, endDate: null } : { startDate: tw.start, endDate: tw.end })} />
        Use tournament dates{sw.inherits && (tw.start || tw.end) ? ` (${fmt(tw.start)} → ${fmt(tw.end)})` : ""}
      </label>
      {!sw.inherits && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5"><span className="text-white/60">Dates for this stage — from</span>
            <Input type="date" className={f} value={d10(stage.schedule.startDate) ?? ""} min={tw.start ?? undefined} max={tw.end ?? undefined}
              onChange={(e) => onChange({ startDate: e.target.value || null })} /></label>
          <label className="space-y-0.5"><span className="text-white/60">{playBy ? "to (play-by date)" : "to"}</span>
            <Input type="date" className={f} value={d10(stage.schedule.endDate) ?? ""} min={tw.start ?? undefined} max={tw.end ?? undefined}
              onChange={(e) => onChange({ endDate: e.target.value || null })} /></label>
        </div>
      )}
      {sw.inherits && playBy && <p className="text-white/45">Play-by date: the tournament's last day.</p>}
      {issues.map((i, k) => <p key={k} className="text-red-300">{i.message}{i.extendTo ? " Extend the tournament dates at the top of Design." : ""}</p>)}
    </div>
  );
}
