import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { EditLock, useEditLock } from "./setup/EditLock";

/**
 * Two separate visitor situations on court bookings:
 *  1. A registered visitor books a court on their own — charged their own
 *     per-visit fee every time they play.
 *  2. A member books and brings a visitor instead of naming another member —
 *     the member is charged the club's visitor fee for that booking.
 * Both fees are raised after the booking slot has passed, so a cancelled
 * booking never costs anything.
 */
export function VisitorBookingRulesCard({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const { symbol } = useClubCurrency();

  const initial = () => ({
    visitorsCanBook: !!(club as any).visitors_can_book,
    selfFee: Number((club as any).visitor_self_booking_fee ?? 0),
    guestFee: Number((club as any).visitor_booking_fee ?? 0),
    requireVisitor: !!(club as any).require_visitor_for_member_booking,
    allowSolo: (club as any).allow_solo_bookings ?? true,
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [
    club.id,
    (club as any).visitors_can_book,
    (club as any).visitor_self_booking_fee,
    (club as any).visitor_booking_fee,
    (club as any).require_visitor_for_member_booking,
    (club as any).allow_solo_bookings,
  ]);
  const lock = useEditLock(() => setForm(initial()));

  const save = async (onDone?: () => void) => {
    try {
      await updateClub.mutateAsync({
        id: club.id,
        visitors_can_book: form.visitorsCanBook,
        visitor_self_booking_fee: Math.max(0, form.selfFee || 0),
        visitor_booking_fee: Math.max(0, form.guestFee || 0),
        require_visitor_for_member_booking: form.requireVisitor,
        allow_solo_bookings: form.allowSolo,
      } as any);
      toast.success("Visitor booking rules saved");
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        onSave={() => save(lock.done)}
        saving={updateClub.isPending}
        title="visitor booking rules"
      >
        <div>
          <h3 className="font-semibold text-sm">Visitors and court bookings</h3>
          <p className="text-xs text-muted-foreground">
            What a visitor pays to play here, whether they come on their own or with a member.
          </p>
        </div>

        {/* 0. Solo bookings */}
        <div className="space-y-1 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold">Allow members to book a court on their own</Label>
              <p className="text-[11px] text-muted-foreground">
                Switch this off and every booking must name a second player — another member or a visitor.
              </p>
            </div>
            <Switch
              checked={form.allowSolo}
              onCheckedChange={(v) => setForm((p) => ({ ...p, allowSolo: v }))}
            />
          </div>
          {!form.allowSolo && (
            <p className="text-[11px] text-muted-foreground pt-1">
              This applies to everyone, including club admins — events, tournaments and maintenance are booked
              through their own functions, so no exceptions are needed here.
            </p>
          )}
        </div>

        {/* Registered visitors are managed on the Visitors page — single source of truth. */}
        <p className="text-[11px] text-muted-foreground rounded-lg border border-dashed p-3">
          Whether registered visitors may book for themselves, and what they pay per visit, is set on the
          Visitors page where you manage your registered visitors.
        </p>


        {/* 2. Member brings a visitor */}
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs font-semibold">Member brings a visitor</Label>
          <p className="text-[11px] text-muted-foreground">
            Charged to the member when they book and name a visitor instead of another member.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{symbol}</span>
            <Input
              type="number"
              min={0}
              step={1}
              className="h-8 text-xs w-28"
              value={form.guestFee}
              onChange={(e) => setForm((p) => ({ ...p, guestFee: Math.max(0, parseFloat(e.target.value) || 0) }))}
            />
            <span className="text-[11px] text-muted-foreground">per booking (0 = no charge)</span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              <Label className="text-xs font-semibold">Require a visitor name when no member is named</Label>
              <p className="text-[11px] text-muted-foreground">
                The booking can't be saved until the member names an opponent or a visitor, so the fee is
                never missed.
              </p>
            </div>
            <Switch
              checked={form.requireVisitor}
              onCheckedChange={(v) => setForm((p) => ({ ...p, requireVisitor: v }))}
            />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          Both fees are added to the account after the booking time has passed, so a cancelled booking is
          never charged.
        </p>
      </EditLock>
    </Card>
  );
}
