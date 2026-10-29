import { courtsCapacity, type CourtsCapacityDay, type CourtsCapacityUnit } from "@/lib/smart-builder/courts-capacity";
import type { PlanAnswers } from "@/lib/smart-builder/stage-plan";
import { formatCourtMinutes } from "@/lib/tournaments/capacity";
import { cn } from "@/lib/utils";

export function CourtsCapacitySummary({ answers, days, units }: { answers: PlanAnswers; days: CourtsCapacityDay[]; units: CourtsCapacityUnit[] }) {
  const c = courtsCapacity(answers, days, units);
  return <section aria-label="Tournament capacity" className="space-y-3 border-y border-border py-4 text-xs" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Tournament capacity</h3>
      <span className={cn("font-semibold", c.fits === false ? "text-destructive" : "text-foreground")}>{c.fits === null ? "Provisional · setup incomplete" : c.fits ? "Fits by total court time" : "Not enough court capacity"}</span>
    </div>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><dt className="text-muted-foreground">Available court time</dt><dd className="text-base font-semibold">{formatCourtMinutes(c.availableMinutes)}</dd></div>
      <div><dt className="text-muted-foreground">Games required{c.incomplete ? " · known minimum" : ""}</dt><dd className="text-base font-semibold">{c.games}</dd></div>
      <div><dt className="text-muted-foreground">Required court time</dt><dd className="text-base font-semibold">{formatCourtMinutes(c.requiredMinutes)}</dd></div>
      <div><dt className="text-muted-foreground">{c.availableSlots == null ? "Court time remaining" : `Available ${c.slotMinutes}-min slots`}</dt><dd className="text-base font-semibold">{c.availableSlots ?? formatCourtMinutes(Math.max(0, c.availableMinutes - c.requiredMinutes))}</dd></div>
    </dl>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left">
      <thead className="text-muted-foreground"><tr><th className="py-2 pr-3">Category</th><th className="pr-3">Field</th><th className="pr-3">Stages</th><th className="pr-3">Play-offs</th><th className="pr-3">Slot</th><th>Court time</th></tr></thead>
      <tbody>{c.rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="py-2 pr-3 font-medium">{r.label}{r.incomplete && <span className="block font-normal text-muted-foreground">Unresolved setup</span>}</td><td className="pr-3">{r.entrants} {r.doubles ? "pairs" : "players"}{r.estimated ? " (estimated)" : ""}</td><td className="pr-3">{r.stages.map((s, i) => <div key={i}>{s.label}: {s.matches ?? "?"} games</div>)}</td><td className="pr-3">{r.playoffs}{r.playoffUnresolved ? " · provisional" : ""}</td><td className="pr-3">{r.poolSlots && r.poolSlots.length > 1 ? r.poolSlots.map((n, i) => <div key={i}>Pool {String.fromCharCode(65 + i)}: {n > 0 ? `${n} min` : "Not set"}</div>) : r.slotMinutes > 0 ? `${r.slotMinutes} min` : "Not set"}</td><td>{formatCourtMinutes(r.requiredMinutes)}</td></tr>)}</tbody>
    </table></div>
    {c.rows.some((r) => r.playoffs > 0) && <div className="space-y-2 border-t border-border pt-3" aria-label="Play-off court slots">
      <h4 className="text-sm font-semibold">Play-off court slots</h4>
      {c.rows.filter((r) => r.playoffs > 0).map((r) => <div key={r.key} className="space-y-1">
        <div className="font-medium">{r.label} · {r.playoffs} slots · {formatCourtMinutes(r.playoffMinutes)} court time{r.playoffUnresolved ? " · provisional" : ""}</div>
        {r.playoffSlots.map((s) => <div key={s.label} className="text-muted-foreground">{s.label}: {s.matches} slot{s.matches === 1 ? "" : "s"} × {r.slotMinutes} min = {formatCourtMinutes(s.minutes)}</div>)}
        {r.playoffUnresolved && <p className="text-muted-foreground">Qualification / pairing not confirmed.</p>}
      </div>)}
    </div>}
    {c.availableSlots != null && <p className="text-muted-foreground">Each court window ÷ {c.slotMinutes} minutes, rounded down separately = {c.availableSlots} whole match slots.</p>}
    <p className="text-muted-foreground">Court-time estimate only; rest, play-off gaps, court restrictions and shared players still need a timetable check. Undecided stages and qualification are not assumed.</p>
  </section>;
}