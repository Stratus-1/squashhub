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
 * Peak hours are picked from the club's real court slots (e.g. 40-minute slots),
 * stored as start of first peak slot → end of last peak slot.
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

  const defaultFor = (day: number) =>
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
      <Label className="text-xs font-semibold">3. Peak hours</Label>
      <p className="text-[10px] text-muted-foreground">
        Choose the first and last peak slot from your {step}-minute court slots. Defaults apply to every day unless you override that day below.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1 rounded-lg border p-2">
          <Label className="text-[11px] font-semibold">Default weekday (Mon–Fri)</Label>
          <SlotRange start={value.peak_weekday_start} end={value.peak_weekday_end}
            onSet={(s, e) => onChange({ peak_weekday_start: s, peak_weekday_end: e })} />
        </div>
        <div className="space-y-1 rounded-lg border p-2">
          <Label className="text-[11px] font-semibold">Default weekend (Sat–Sun)</Label>
          <SlotRange start={value.peak_weekend_start} end={value.peak_weekend_end}
            onSet={(s, e) => onChange({ peak_weekend_start: s, peak_weekend_end: e })} />
        </div>
      </div>

      <div className="rounded-lg border divide-y">
        {DAY_ORDER.map(day => {
          const o = (value.peak_day_overrides || {})[String(day)];
          const custom = !!o;
          const def = defaultFor(day);
          return (
            <div key={day} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <span className="text-[11px] font-medium w-20">{DAY_LABELS[day]}</span>
              <label className="flex items-center gap-1.5 text-[11px]">
                <Switch checked={custom} onCheckedChange={(c) => setOverride(day, c ? { start: def.start.slice(0, 5), end: def.end.slice(0, 5) } : null)} />
                Override
              </label>
              {!custom && <span className="text-[11px] text-muted-foreground">Default {def.start.slice(0, 5)}–{def.end.slice(0, 5)}</span>}
              {custom && (
                <>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <Switch checked={!o.off} onCheckedChange={(c) => setOverride(day, c ? { start: def.start.slice(0, 5), end: def.end.slice(0, 5) } : { off: true })} />
                    Peak this day
                  </label>
                  {!o.off && (
                    <div className="flex-1 min-w-[220px]">
                      <SlotRange start={o.start || def.start} end={o.end || def.end}
                        onSet={(s, e) => setOverride(day, { start: s, end: e })} />
                    </div>
                  )}
                  {o.off && <span className="text-[11px] text-muted-foreground">No peak time</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
