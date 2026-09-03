import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Slot = {
  scheduleTimeId: number;
  courtId: number;
  courtName: string;
  startTime: string;
  endTime: string;
  label: string;
  booked: boolean;
  ownBooking: boolean;
  bookedBy: string | null;
  bookable: boolean;
};

/**
 * Live GoBook court grid, driven entirely by the official GoBook API
 * (one club-level API account). Works for any club whose booking system is
 * GoBook and whose admin has enabled API booking.
 */
export function GoBookApiBooking({
  clubId,
  clubMemberId,
}: {
  clubId: string;
  clubMemberId?: string;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const [booking, setBooking] = useState<number | null>(null);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("gobook-api", {
      body: { action, club_id: clubId, club_member_id: clubMemberId, ...extra },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const linkQ = useQuery({
    queryKey: ["gobook-my-client", clubId, clubMemberId],
    queryFn: () => invoke("my_client"),
  });

  const datesQ = useQuery({
    queryKey: ["gobook-dates", clubId, clubMemberId],
    queryFn: () => invoke("list_dates"),
    enabled: !!linkQ.data?.clientId,
  });

  const dates: Array<{ date: string; label: string }> = datesQ.data?.dates ?? [];
  const activeDate = date ?? dates[0]?.date ?? null;

  const slotsQ = useQuery({
    queryKey: ["gobook-slots", clubId, activeDate, clubMemberId],
    queryFn: () => invoke("list_slots", { booking_date: activeDate }),
    enabled: !!activeDate && !!linkQ.data?.clientId,
  });

  const slots: Slot[] = slotsQ.data?.slots ?? [];

  const { courts, times, byKey } = useMemo(() => {
    const courtMap = new Map<number, string>();
    const timeSet = new Set<string>();
    const map = new Map<string, Slot>();
    for (const s of slots) {
      courtMap.set(s.courtId, s.courtName || `Court ${s.courtId}`);
      timeSet.add(s.startTime);
      map.set(`${s.courtId}|${s.startTime}`, s);
    }
    return {
      courts: [...courtMap.entries()].map(([id, name]) => ({ id, name })),
      times: [...timeSet].sort(),
      byKey: map,
    };
  }, [slots]);

  const book = async (slot: Slot) => {
    setBooking(slot.scheduleTimeId);
    try {
      await invoke("book", {
        booking_date: activeDate,
        schedule_time_ids: [slot.scheduleTimeId],
        notes: "Booked via SquashHub",
      });
      toast.success(`Booked ${slot.courtName} at ${slot.startTime}`);
      qc.invalidateQueries({ queryKey: ["gobook-slots"] });
      qc.invalidateQueries({ queryKey: ["gobook-my-bookings"] });
    } catch (e: any) {
      toast.error(e?.message || "GoBook rejected the booking");
    } finally {
      setBooking(null);
    }
  };

  if (linkQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Connecting to GoBook…
        </CardContent>
      </Card>
    );
  }

  if (!linkQ.data?.clientId) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/10">
        <CardContent className="p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Your GoBook account isn't linked yet</p>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              Bookings are made through the club's GoBook API account, so we need to know
              which GoBook member you are. Ask a club admin to link your profile under
              Club Admin → Courts → GoBook API connection.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Live GoBook availability
          </p>
          <Badge variant="outline" className="text-[10px]">
            <Check className="w-3 h-3 mr-1" />
            {linkQ.data?.clientName || `Client #${linkQ.data.clientId}`}
          </Badge>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {dates.map((d) => (
            <Button
              key={d.date}
              size="sm"
              variant={d.date === activeDate ? "default" : "outline"}
              className="h-7 text-[11px] shrink-0"
              onClick={() => setDate(d.date)}
            >
              {d.label || d.date}
            </Button>
          ))}
        </div>

        {slotsQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading slots…
          </div>
        ) : !slots.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No slots available for this date.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted-foreground w-14">Time</th>
                  {courts.map((c) => (
                    <th key={c.id} className="font-medium text-muted-foreground">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((t) => (
                  <tr key={t}>
                    <td className="text-muted-foreground tabular-nums">{t}</td>
                    {courts.map((c) => {
                      const s = byKey.get(`${c.id}|${t}`);
                      if (!s) {
                        return (
                          <td key={c.id}>
                            <div className="h-7 rounded-md bg-muted/40" />
                          </td>
                        );
                      }
                      if (!s.bookable) {
                        return (
                          <td key={c.id}>
                            <div className="h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground truncate px-1">
                              {s.ownBooking ? "Yours" : s.bookedBy || "Booked"}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td key={c.id}>
                          <button
                            className="h-7 w-full rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                            disabled={booking !== null}
                            onClick={() => book(s)}
                          >
                            {booking === s.scheduleTimeId ? (
                              <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                            ) : (
                              "Book"
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Bookings go straight into GoBook under your own GoBook account. Cancellations
          must still be done on gobook.co.za — GoBook's API does not expose a cancel
          endpoint yet.
        </p>
      </CardContent>
    </Card>
  );
}
