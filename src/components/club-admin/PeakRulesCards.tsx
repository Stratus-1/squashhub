import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { EditLock, useEditLock } from "./setup/EditLock";
import { PeakHoursEditor } from "./PeakHoursEditor";
import type { PeakOverrides } from "@/lib/peak-hours";
import { bookingHoursSummary } from "@/lib/peak-cancel-rules";

export function BookingHoursSummary({ slotMinutes, openTime, lastSlotTime }: { slotMinutes: number; openTime: string; lastSlotTime: string }) {
  const h = bookingHoursSummary(slotMinutes, openTime, lastSlotTime);
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed">
      First booking starts <b className="text-foreground">{h.first}</b> · Last booking starts{" "}
      <b className="text-foreground">{h.last}</b> · Courts close <b className="text-foreground">{h.close}</b> ({h.step}-min slots)
    </p>
  );
}

const fromClub = (club: Club) => {
  const c = club as any;
  return {
    booking_slot_minutes: c.booking_slot_minutes ?? 30,
    booking_open_time: (c.booking_open_time ?? "05:00:00").slice(0, 5),
    booking_last_slot_time: (c.booking_last_slot_time ?? "22:00:00").slice(0, 5),
    peak_weekday_start: (c.peak_weekday_start ?? "16:00:00").slice(0, 5),
    peak_weekday_end: (c.peak_weekday_end ?? "19:00:00").slice(0, 5),
    peak_weekend_start: (c.peak_weekend_start ?? "08:00:00").slice(0, 5),
    peak_weekend_end: (c.peak_weekend_end ?? "12:00:00").slice(0, 5),
    peak_day_overrides: (c.peak_day_overrides ?? {}) as PeakOverrides,
  };
};

/** 4. Peak hours per day — read-only until Edit; saves only peak_day_overrides. */
export function PeakHoursCard({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const [form, setForm] = useState(() => fromClub(club));
  const sync = () => setForm(fromClub(club));
  const lock = useEditLock(sync);
  useEffect(() => { if (!lock.editing) sync(); }, [club.id, JSON.stringify((club as any).peak_day_overrides ?? {}), (club as any).booking_slot_minutes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="p-4 space-y-3">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        saving={updateClub.isPending}
        title="peak hours"
        onSave={async () => {
          try {
            await updateClub.mutateAsync({ id: club.id, peak_day_overrides: form.peak_day_overrides } as any);
            toast.success("Peak hours saved");
            lock.done();
          } catch (e: any) { toast.error(e.message || "Failed to save"); }
        }}
      >
        <div>
          <h3 className="font-semibold text-sm">4. Peak hours per day</h3>
        </div>
        <PeakHoursEditor value={form} readOnly={!lock.editing} onChange={(p) => setForm(f => ({ ...f, ...p }))} />
      </EditLock>
    </Card>
  );
}

/** 5. Peak-hour cancellation & no-show penalty fees — opt-in, OFF and R0 by default. */
export function PeakPenaltyCard({ club }: { club: Club }) {
  const c = club as any;
  const updateClub = useUpdateClub();
  const { symbol } = useClubCurrency();
  const lighting = !!c.lights_integration_enabled;
  const slot = c.booking_slot_minutes ?? 30;
  const init = () => ({
    peak_cancel_restrict_enabled: !!c.peak_cancel_restrict_enabled,
    peak_penalties_enabled: !!c.peak_penalties_enabled,
    peak_late_cancel_allowed: !!c.peak_late_cancel_allowed,
    peak_late_cancel_fee: Number(c.peak_late_cancel_fee ?? 0),
    peak_no_show_fee: Number(c.peak_no_show_fee ?? 0),
  });
  const [f, setF] = useState(init);
  const lock = useEditLock(() => setF(init()));
  useEffect(() => { if (!lock.editing) setF(init()); }, [club.id, c.peak_cancel_restrict_enabled, c.peak_penalties_enabled, c.peak_late_cancel_allowed, c.peak_late_cancel_fee, c.peak_no_show_fee]); // eslint-disable-line react-hooks/exhaustive-deps
  const ro = !lock.editing;
  const external = c.uses_gobook || c.gobook_api_enabled || c.external_booking_provider;

  return (
    <Card className="p-4 space-y-3">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        saving={updateClub.isPending}
        title="cancellation & no-show rules"
        onSave={async () => {
          if (f.peak_penalties_enabled && f.peak_late_cancel_fee <= 0 && f.peak_no_show_fee <= 0) {
            toast.error("Set at least one penalty amount, or switch penalty fees off");
            return;
          }
          try {
            await updateClub.mutateAsync({
              id: club.id,
              peak_cancel_restrict_enabled: f.peak_cancel_restrict_enabled,
              peak_penalties_enabled: lighting ? f.peak_penalties_enabled : false,
              peak_late_cancel_allowed: lighting && f.peak_penalties_enabled ? f.peak_late_cancel_allowed : false,
              peak_late_cancel_fee: Math.max(0, f.peak_late_cancel_fee || 0),
              peak_no_show_fee: Math.max(0, f.peak_no_show_fee || 0),
            } as any);
            toast.success("Cancellation rules saved");
            lock.done();
          } catch (e: any) { toast.error(e.message || "Failed to save"); }
        }}
      >
        <div>
          <h3 className="font-semibold text-sm">5. Peak-hour cancellation & no-show penalty fees</h3>
          <p className="text-[11px] text-muted-foreground">
            Optional. Everything here is off until you switch it on. Late means inside one {slot}-minute slot before the booking starts — no grace period. Off-peak bookings are never affected.
          </p>
        </div>

        <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <Label className="text-xs font-semibold">Restrict peak-hour late cancellations</Label>
            <Switch disabled={ro} checked={f.peak_cancel_restrict_enabled} onCheckedChange={(v) => setF(p => ({ ...p, peak_cancel_restrict_enabled: v }))} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Members can't cancel a peak booking in SquashHub once the slot before it has started. Admins can still cancel (a reason is required and logged; no penalty).
          </p>
          {external && (
            <p className="text-[10px] text-muted-foreground">
              Your club also uses an external booking system. SquashHub blocks cancellations made in SquashHub only — cancellations made directly in the external system can't be blocked from here.
            </p>
          )}
        </div>

        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <Label className="text-xs font-semibold">Charge peak-hour penalty fees</Label>
            <Switch disabled={ro || !lighting} checked={lighting && f.peak_penalties_enabled} onCheckedChange={(v) => setF(p => ({ ...p, peak_penalties_enabled: v }))} />
          </div>
          {!lighting ? (
            <p className="text-[10px] text-muted-foreground">
              Only available when SquashHub runs your court lights. Clubs whose lights or bookings are run by another provider (e.g. GoBook) charge their own fees there.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Fees post to the member's account. They apply only to bookings made after you switch this on — never backdated. One penalty per booking at most.
            </p>
          )}

          {lighting && f.peak_penalties_enabled && (
            <div className="space-y-3 pt-1">
              <label className="flex items-start justify-between gap-3">
                <span className="text-[11px]">
                  Allow late cancellation of peak-hour bookings
                  <span className="block text-[10px] text-muted-foreground">Off: members are blocked in the late window. On: they may cancel, and the fee below is charged.</span>
                </span>
                <Switch disabled={ro} checked={f.peak_late_cancel_allowed} onCheckedChange={(v) => setF(p => ({ ...p, peak_late_cancel_allowed: v }))} />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Late-cancellation penalty ({symbol})</Label>
                  <Input type="number" min={0} step={1} className="h-8 text-xs" disabled={ro || !f.peak_late_cancel_allowed}
                    value={f.peak_late_cancel_fee} onChange={(e) => setF(p => ({ ...p, peak_late_cancel_fee: Math.max(0, parseFloat(e.target.value) || 0) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">No-show penalty ({symbol})</Label>
                  <Input type="number" min={0} step={1} className="h-8 text-xs" disabled={ro}
                    value={f.peak_no_show_fee} onChange={(e) => setF(p => ({ ...p, peak_no_show_fee: Math.max(0, parseFloat(e.target.value) || 0) }))} />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                No-shows are only charged after an admin confirms them. If someone else plays in the freed slot, the original booker stays liable and the replacement pays only normal fees. Admins can waive any penalty with a reason; waivers are reversed in the books, never deleted.
              </p>
            </div>
          )}
        </div>
      </EditLock>
    </Card>
  );
}
