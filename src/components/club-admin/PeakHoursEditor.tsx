import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DAY_LABELS, DAY_ORDER, clubSlotStarts, toHHMM, toMin,
  type PeakOverride, type PeakOverrides,
} from "@/lib/peak-hours";

type Form = {
  booking_slot_minutes: number;
  booking_open_time: string;
  booking_last_slot_time: string;
  peak_weekday_start: string;
  peak_weekday_end: string;
  peak_weekend_start: string;
  peak_weekend_end: string;
  peak_day_overrides: PeakOverrides;
};

/**
 * Peak hours are set per day, picked from the club's real court slots
 * (e.g. 40-minute slots), stored as start of first peak slot → end of last peak slot.
 * Days without an explicit setting keep the club's previously saved times.
 */
export function PeakHoursEditor({ value, onChange }: { value: Form; onChange: (patch: Partial<Form>) => void }) {
  const step = value.booking_slot_minutes || 30;
  const slots = useMemo(
    () => clubSlotStarts(step, value.booking_open_time, value.booking_last_slot_time),
    [step, value.booking_open_time, value.booking_last_slot_time],
  );

  const SlotRange = ({ start, end, onSet }: { start: string; end: string; onSet: (s: string, e: string) => void }) => {
    const first = start.slice(0, 5);
    const last = toHHMM(toMin(end) - step); // stored end = end of last peak slot
    const startOpts = slots.includes(first) ? slots : [first, ...slots].sort();
    const lastOpts = slots.includes(last) ? slots : [...slots, last].sort();
    const pick = (s: string, l: string) => {
      const lastStart = toMin(l) < toMin(s) ? s : l;
      onSet(s, toHHMM(toMin(lastStart) + step));
    };
    const label = (t: string) => `${t}–${toHHMM(toMin(t) + step)}${slots.includes(t) ? "" : " (not a slot)"}`;
    return (
      <div className="flex items-center gap-1">
        <Select value={first} onValueChange={(v) => pick(v, last)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{startOpts.map(t => <SelectItem key={t} value={t} className="text-xs">{label(t)}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground shrink-0">to</span>
        <Select value={last} onValueChange={(v) => pick(first, v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {lastOpts.filter(t => toMin(t) >= toMin(first)).map(t => <SelectItem key={t} value={t} className="text-xs">{label(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };

  /** Previously saved times for a day (kept intact for existing clubs). */
  const savedFor = (day: number) =>
    day === 0 || day === 6
      ? { start: value.peak_weekend_start, end: value.peak_weekend_end }
      : { start: value.peak_weekday_start, end: value.peak_weekday_end };

  const setOverride = (day: number, o: PeakOverride | null) => {
    const next = { ...(value.peak_day_overrides || {}) };
    if (o) next[String(day)] = o; else delete next[String(day)];
    onChange({ peak_day_overrides: next });
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">3. Peak hours per day</Label>
      <p className="text-[10px] text-muted-foreground">
        Set each day's peak time from your {step}-minute court slots, or switch a day off. Days you don't change keep their current times.
      </p>

      <div className="rounded-lg border divide-y">
        {DAY_ORDER.map(day => {
          const o = (value.peak_day_overrides || {})[String(day)];
          const saved = savedFor(day);
          const cur = o && !o.off && o.start && o.end ? { start: o.start, end: o.end } : saved;
          const off = !!o?.off;
          return (
            <div key={day} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <span className="text-[11px] font-medium w-20">{DAY_LABELS[day]}</span>
              <label className="flex items-center gap-1.5 text-[11px]">
                <Switch checked={!off} onCheckedChange={(c) => setOverride(day, c ? { start: cur.start.slice(0, 5), end: cur.end.slice(0, 5) } : { off: true })} />
                Peak this day
              </label>
              {!off && (
                <div className="flex-1 min-w-[220px]">
                  <SlotRange start={cur.start} end={cur.end}
                    onSet={(s, e) => setOverride(day, { start: s, end: e })} />
                </div>
              )}
              {off && <span className="text-[11px] text-muted-foreground">No peak time</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
