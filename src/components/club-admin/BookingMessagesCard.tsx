import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { EditLock, useEditLock } from "./setup/EditLock";
import {
  BOOKING_CHANNEL_LABELS,
  availableChannels,
  normaliseChannels,
  type BookingChannel,
} from "@/lib/booking-notify";

/**
 * Club defaults for court-booking confirmations and reminders. Members may
 * override the channels and timing for their own booking when they book.
 */
export function BookingMessagesCard({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const allowed = availableChannels({
    smsEnabled: (club as any).sms_enabled,
    whatsappEnabled: (club as any).whatsapp_enabled,
  });

  const initial = () => ({
    confirmOn: !!(club as any).booking_confirm_enabled,
    confirmChannels: normaliseChannels((club as any).booking_confirm_channels, allowed),
    remindOn: (club as any).booking_reminder_enabled ?? true,
    remindChannels: normaliseChannels((club as any).booking_reminder_channels, allowed),
    hours: Number((club as any).booking_reminder_hours ?? 24),
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [
    club.id,
    (club as any).booking_confirm_enabled,
    (club as any).booking_reminder_enabled,
    (club as any).booking_reminder_hours,
  ]);
  const lock = useEditLock(() => setForm(initial()));

  const toggle = (key: "confirmChannels" | "remindChannels", ch: BookingChannel) =>
    setForm((p) => {
      const list = p[key];
      const next = list.includes(ch) ? list.filter((c) => c !== ch) : [...list, ch];
      return { ...p, [key]: next.length ? next : list };
    });

  const save = async (onDone?: () => void) => {
    const hours = Math.max(1, Math.min(168, Math.round(form.hours || 24)));
    try {
      await updateClub.mutateAsync({
        id: club.id,
        booking_confirm_enabled: form.confirmOn,
        booking_confirm_channels: form.confirmChannels,
        booking_reminder_enabled: form.remindOn,
        booking_reminder_channels: form.remindChannels,
        booking_reminder_hours: hours,
      } as any);
      toast.success("Booking messages saved");
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const ChannelRow = ({ value, onPick }: { value: BookingChannel[]; onPick: (c: BookingChannel) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {allowed.map((ch) => (
        <Button
          key={ch}
          type="button"
          size="sm"
          variant={value.includes(ch) ? "default" : "outline"}
          className="h-7 text-[11px] rounded-lg"
          onClick={() => onPick(ch)}
        >
          {BOOKING_CHANNEL_LABELS[ch]}
        </Button>
      ))}
    </div>
  );

  return (
    <Card className="p-4 space-y-4">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        onSave={() => save(lock.done)}
        saving={updateClub.isPending}
        title="booking messages"
      >
        <div>
          <h3 className="font-semibold text-sm">Booking messages</h3>
          <p className="text-xs text-muted-foreground">
            How members are told about their court bookings. Each member can change this for their own
            booking when they book.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold">Confirmation when a booking is made</Label>
              <p className="text-[11px] text-muted-foreground">Sent to the booker and the opponent.</p>
            </div>
            <Switch
              checked={form.confirmOn}
              onCheckedChange={(v) => setForm((p) => ({ ...p, confirmOn: v }))}
            />
          </div>
          {form.confirmOn && (
            <ChannelRow value={form.confirmChannels} onPick={(c) => toggle("confirmChannels", c)} />
          )}
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold">Reminder before the booking</Label>
              <p className="text-[11px] text-muted-foreground">Default timing for everyone at this club.</p>
            </div>
            <Switch
              checked={form.remindOn}
              onCheckedChange={(v) => setForm((p) => ({ ...p, remindOn: v }))}
            />
          </div>
          {form.remindOn && (
            <>
              <ChannelRow value={form.remindChannels} onPick={(c) => toggle("remindChannels", c)} />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  className="h-8 text-xs w-24"
                  value={form.hours}
                  onChange={(e) => setForm((p) => ({ ...p, hours: parseInt(e.target.value, 10) || 0 }))}
                />
                <span className="text-[11px] text-muted-foreground">hours before the booking starts</span>
              </div>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          SMS and WhatsApp only appear here once the club has them switched on, and are billed per message.
        </p>
      </EditLock>
    </Card>
  );
}
