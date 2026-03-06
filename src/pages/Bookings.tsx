import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format, addDays, subDays } from "date-fns";
import { useBookings, useCreateBooking, useCreateChallenge, useProfile } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildGoogleCalendarEventUrl, openExternalUrl } from "@/lib/google-calendar";

const timeSlots = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

const courts = [1, 2];

export default function Bookings() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookingDialog, setBookingDialog] = useState<{
    courtId: number;
    time: string;
    opponentId: string;
    isFriendly: boolean;
  } | null>(null);
  const [calendarPrompt, setCalendarPrompt] = useState<{
    open: boolean;
    courtId: number;
    dateStr: string;
    startTime: string;
    endTime: string;
    isFriendly: boolean;
    opponentName: string | null;
    opponentEmail: string | null;
  }>({
    open: false,
    courtId: 1,
    dateStr: "",
    startTime: "",
    endTime: "",
    isFriendly: false,
    opponentName: null,
    opponentEmail: null,
  });
  const { user } = useAuth();
  const { data: me } = useProfile();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: bookings, isLoading } = useBookings(dateStr);
  const createBooking = useCreateBooking();
  const createChallenge = useCreateChallenge();

  const { data: availablePlayers } = useQuery({
    queryKey: ["available-players", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,rank,availability,email")
        .not("availability", "is", null)
        .neq("availability", "")
        .order("rank", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; rank: number | null; availability: string | null; email: string | null }>;
    },
    enabled: !!user,
  });

  const getBooking = (courtId: number, time: string) => {
    return bookings?.find(
      (b) => b.court_id === courtId && b.start_time === time + ":00"
    );
  };

  const handleBook = async () => {
    if (!bookingDialog) return;
    const endHour = parseInt(bookingDialog.time.split(":")[0]) + 1;
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;

    try {
      const created = await createBooking.mutateAsync({
        courtId: bookingDialog.courtId,
        date: dateStr,
        startTime: bookingDialog.time + ":00",
        endTime: endTime + ":00",
        opponentId: bookingDialog.opponentId || null,
        isFriendly: bookingDialog.isFriendly,
      });

      const opponent = bookingDialog.opponentId
        ? (availablePlayers || []).find((p) => p.id === bookingDialog.opponentId) || null
        : null;

      if (bookingDialog.opponentId && !bookingDialog.isFriendly) {
        try {
          const challenge = await createChallenge.mutateAsync({
            opponentId: bookingDialog.opponentId,
            proposedDate: dateStr,
          });

          await supabase
            .from("bookings")
            .update({ challenge_id: (challenge as any).id } as any)
            .eq("id", (created as any).id);

          toast.success("Court booked + challenge sent");
        } catch (e: any) {
          toast.success("Court booked");
          toast.error(e?.message || "Booking created, but challenge could not be sent");
        }
      } else if (bookingDialog.opponentId && bookingDialog.isFriendly) {
        toast.success("Court booked (friendly match)");
      } else {
        toast.success("Court booked!");
      }

      setCalendarPrompt({
        open: true,
        courtId: bookingDialog.courtId,
        dateStr,
        startTime: bookingDialog.time,
        endTime,
        isFriendly: bookingDialog.isFriendly,
        opponentName: opponent?.name || null,
        opponentEmail: opponent?.email || null,
      });

      setBookingDialog(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to book");
    }
  };

  const eligibleOpponents = (() => {
    const list = (availablePlayers || []).filter((p) => p.id !== user?.id);
    const myRank = me?.rank ?? null;

    if (!bookingDialog) return [] as typeof list;
    if (bookingDialog.isFriendly) return list;
    if (!myRank) return [] as typeof list;

    return list.filter((p) => typeof p.rank === "number" && myRank - p.rank >= 1 && myRank - p.rank <= 2);
  })();

  const selectedOpponent = bookingDialog?.opponentId
    ? (availablePlayers || []).find((p) => p.id === bookingDialog.opponentId) || null
    : null;

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Court Bookings" subtitle="Book your court" />

      {/* Date Selector */}
      <div className="flex items-center justify-between px-4 mt-2">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm font-semibold font-heading">
          {format(selectedDate, "EEEE, d MMM")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Court Headers */}
      <div className="grid grid-cols-[60px_1fr_1fr] gap-2 px-4 mt-4 mb-2">
        <div />
        {courts.map((c) => (
          <div key={c} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Court {c}
          </div>
        ))}
      </div>

      {/* Time Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <motion.div
          className="px-4 space-y-1 mb-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {timeSlots.map((time) => (
            <div key={time} className="grid grid-cols-[60px_1fr_1fr] gap-2">
              <div className="text-xs text-muted-foreground flex items-center justify-end pr-2 font-medium">
                {time}
              </div>
              {courts.map((courtId) => {
                const booking = getBooking(courtId, time);
                const playerName = booking?.player_name || "Booked";

                return (
                  <Card
                    key={courtId}
                    className={cn(
                      "h-12 flex items-center justify-center text-xs cursor-pointer transition-colors",
                      booking
                        ? "bg-primary/10 border-primary/30"
                        : "hover:bg-secondary/80 border-dashed"
                    )}
                    onClick={() => {
                      if (!booking) {
                        setBookingDialog({ courtId, time, opponentId: "", isFriendly: false });
                      }
                    }}
                  >
                    {booking ? (
                      <div className="px-1 min-w-0 text-center">
                        <p className="font-medium text-primary text-[11px] truncate">
                          {(booking as any).player_name?.split(" ")[0]}
                          {(booking as any).opponent_name ? ` vs ${(booking as any).opponent_name.split(" ")[0]}` : ""}
                        </p>
                        {(booking as any).is_friendly ? (
                          <p className="text-[10px] text-muted-foreground">Friendly</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50 text-[10px]">Available</span>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </motion.div>
      )}

      {/* Booking Confirmation Dialog */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Confirm Booking</DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Court</span>
                <span className="font-medium">Court {bookingDialog.courtId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(selectedDate, "d MMM yyyy")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">
                  {bookingDialog.time} - {(parseInt(bookingDialog.time) + 1).toString().padStart(2, "0")}:00
                </span>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <Label className="text-xs">Friendly</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Friendly matches can be booked with anyone, but don’t count toward the ladder.
                  </p>
                </div>
                <Switch
                  checked={bookingDialog.isFriendly}
                  onCheckedChange={(checked) =>
                    setBookingDialog((s) => (s ? { ...s, isFriendly: checked, opponentId: "" } : s))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Opponent (optional)</Label>
                <Select
                  value={bookingDialog.opponentId}
                  onValueChange={(v) => setBookingDialog((s) => (s ? { ...s, opponentId: v } : s))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={bookingDialog.isFriendly ? "Choose anyone" : "Choose someone you can challenge"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOpponents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {bookingDialog.isFriendly
                          ? "No players with availability yet."
                          : !me?.rank
                            ? "You need a ladder rank to book a ladder match. Toggle Friendly to book anyone."
                            : "No available players you can challenge right now. Toggle Friendly to book anyone."}
                      </div>
                    ) : (
                      eligibleOpponents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {typeof p.rank === "number" ? `(Rank #${p.rank})` : "(Unranked)"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {selectedOpponent?.availability ? (
                  <div className="rounded-md border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Availability</p>
                    <p className="text-sm mt-1">{selectedOpponent.availability}</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialog(null)}>Cancel</Button>
            <Button onClick={handleBook} disabled={createBooking.isPending || createChallenge.isPending}>
              {createBooking.isPending || createChallenge.isPending ? "Booking..." : "Book Court"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Google Calendar Prompt */}
      <Dialog
        open={calendarPrompt.open}
        onOpenChange={(open) => setCalendarPrompt((s) => ({ ...s, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Add to Google Calendar?</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm font-medium">
                Court {calendarPrompt.courtId} · {calendarPrompt.dateStr}
              </p>
              <p className="text-xs text-muted-foreground">
                {calendarPrompt.startTime} - {calendarPrompt.endTime}
                {calendarPrompt.opponentName ? ` · vs ${calendarPrompt.opponentName}` : ""}
                {calendarPrompt.isFriendly ? " · Friendly" : ""}
              </p>
            </div>

            {calendarPrompt.opponentEmail ? (
              <p className="text-xs text-muted-foreground">
                We'll add <span className="text-foreground font-medium">{calendarPrompt.opponentEmail}</span> as a guest.
              </p>
            ) : calendarPrompt.opponentName ? (
              <p className="text-xs text-muted-foreground">
                No email found for {calendarPrompt.opponentName}, so we can’t prefill a guest invite.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                You can add an opponent later from Google Calendar.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCalendarPrompt((s) => ({ ...s, open: false }))}>
              Not now
            </Button>
            <Button
              onClick={async () => {
                const start = new Date(`${calendarPrompt.dateStr}T${calendarPrompt.startTime}:00`);
                const end = new Date(`${calendarPrompt.dateStr}T${calendarPrompt.endTime}:00`);
                const title = calendarPrompt.opponentName
                  ? `Squash: vs ${calendarPrompt.opponentName}`
                  : "Squash booking";
                const details = [
                  calendarPrompt.isFriendly ? "Friendly match (not ladder-recordable)." : "Ladder match booking.",
                  `Court ${calendarPrompt.courtId}`,
                  `Time: ${calendarPrompt.startTime}-${calendarPrompt.endTime}`,
                  "Booked via Gordon's Bay Squash Hub.",
                ].join("\n");
                const url = buildGoogleCalendarEventUrl({
                  title,
                  startLocal: start,
                  endLocal: end,
                  details,
                  location: `Court ${calendarPrompt.courtId}`,
                  guestEmail: calendarPrompt.opponentEmail,
                });
                await openExternalUrl(url);
                setCalendarPrompt((s) => ({ ...s, open: false }));
              }}
            >
              Add to Calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
