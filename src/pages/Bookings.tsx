import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2, Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { format, addDays, subDays, getISODay } from "date-fns";
import { useBookings, useCancelBooking, useCreateBooking, useCreateChallenge, useProfile } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ShareBookingDialog } from "@/components/ShareBookingDialog";
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
import { enqueueOutbox } from "@/lib/outbox";

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

function minutesToTime(m: number) {
  const mm = ((m % 60) + 60) % 60;
  const hh = Math.floor(m / 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutesToTime(t: string, delta: number) {
  return minutesToTime(timeToMinutes(t) + delta);
}

const timeSlots = (() => {
  const slots: string[] = [];
  const start = 6 * 60; // 06:00
  const end = 22 * 60; // 22:00 (exclusive)
  for (let m = start; m < end; m += 30) {
    slots.push(minutesToTime(m));
  }
  return slots;
})();

const courts = [1, 2];

export default function Bookings() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookingDetails, setBookingDetails] = useState<any | null>(null);
  const [bookingDialog, setBookingDialog] = useState<{
    courtId: number;
    time: string;
    opponentId: string;
    isFriendly: boolean;
  } | null>(null);
  const [calendarPrompt, setCalendarPrompt] = useState<{
    open: boolean;
    bookingId: string;
    courtId: number;
    dateStr: string;
    startTime: string;
    endTime: string;
    isFriendly: boolean;
    opponentName: string | null;
    opponentEmail: string | null;
  }>({
    open: false,
    bookingId: "",
    courtId: 1,
    dateStr: "",
    startTime: "",
    endTime: "",
    isFriendly: false,
    opponentName: null,
    opponentEmail: null,
  });
  const [shareDialog, setShareDialog] = useState<{
    open: boolean;
    bookingId: string;
    courtId: number;
    dateStr: string;
    startTime: string;
    endTime: string;
    opponentName: string | null;
  }>({ open: false, bookingId: "", courtId: 1, dateStr: "", startTime: "", endTime: "", opponentName: null });
  const { user } = useAuth();
  const { data: me } = useProfile();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: bookings, isLoading } = useBookings(dateStr);
  const createBooking = useCreateBooking();
  const createChallenge = useCreateChallenge();
  const cancelBooking = useCancelBooking();

  const { data: availablePlayers } = useQuery({
    queryKey: ["available-players", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,rank,email")
        .order("rank", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; rank: number | null; email: string | null }> as any;
    },
    enabled: !!user,
  });

  const { data: availableForSlotUserIds } = useQuery({
    queryKey: ["available-for-slot", dateStr, bookingDialog?.time],
    queryFn: async () => {
      if (!bookingDialog?.time) return [] as string[];
      const dow = getISODay(selectedDate);
      const start = `${bookingDialog.time}:00`;
      const end = `${addMinutesToTime(bookingDialog.time, 30)}:00`;
      const { data, error } = await (supabase as any)
        .from("player_availability")
        .select("user_id")
        .eq("day_of_week", dow)
        .lte("start_time", start)
        .gte("end_time", end);
      if (error) throw error;
      return [...new Set((data || []).map((r: any) => String(r.user_id)))] as string[];
    },
    enabled: !!user && !!bookingDialog?.time,
  });

  const getBooking = (courtId: number, time: string) => {
    const tMin = timeToMinutes(time);
    return (bookings as any[] | undefined)?.find((b: any) => {
      if (b.court_id !== courtId) return false;
      const start = String(b.start_time || "").slice(0, 5);
      const end = String(b.end_time || "").slice(0, 5);
      if (!start || !end) return false;
      const sMin = timeToMinutes(start);
      const eMin = timeToMinutes(end);
      return tMin >= sMin && tMin < eMin;
    });
  };

  const handleBook = async () => {
    if (!bookingDialog) return;
    const endTime = addMinutesToTime(bookingDialog.time, 30);
    const bookingId = crypto.randomUUID();

    try {
      const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
      if (!isOnline) {
        if (!user?.id) throw new Error("Must be logged in");

        const needsChallenge = !!bookingDialog.opponentId && !bookingDialog.isFriendly;
        const challengeId = needsChallenge ? crypto.randomUUID() : null;
        const opponent = bookingDialog.opponentId
          ? (availablePlayers || []).find((p) => p.id === bookingDialog.opponentId) || null
          : null;

        enqueueOutbox({
          id: crypto.randomUUID(),
          kind: "booking_flow",
          user_id: user.id,
          created_at: new Date().toISOString(),
          payload: {
            booking: {
              id: bookingId,
              user_id: user.id,
              court_id: bookingDialog.courtId,
              date: dateStr,
              start_time: bookingDialog.time + ":00",
              end_time: endTime + ":00",
              opponent_id: bookingDialog.opponentId || null,
              is_friendly: bookingDialog.isFriendly,
            },
            ...(needsChallenge && bookingDialog.opponentId
              ? {
                  challenge: {
                    id: challengeId,
                    opponent_id: bookingDialog.opponentId,
                    proposed_date: dateStr,
                  },
                }
              : {}),
          },
        });

        toast.message("Saved offline", {
          description: "Your booking will sync automatically when you’re back online.",
        });

        setCalendarPrompt({
          open: true,
          bookingId,
          courtId: bookingDialog.courtId,
          dateStr,
          startTime: bookingDialog.time,
          endTime,
          isFriendly: bookingDialog.isFriendly,
          opponentName: opponent?.name || null,
          opponentEmail: opponent?.email || null,
        });

        setBookingDialog(null);
        return;
      }

      const created = await createBooking.mutateAsync({
        bookingId,
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
        bookingId: (created as any)?.id || bookingId,
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
      const msg = String(err?.message || "");
      const likelyNetwork =
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("fetch failed") ||
        msg.includes("Network request failed");

      if (likelyNetwork && user?.id && bookingDialog) {
        const needsChallenge = !!bookingDialog.opponentId && !bookingDialog.isFriendly;
        const challengeId = needsChallenge ? crypto.randomUUID() : null;

        enqueueOutbox({
          id: crypto.randomUUID(),
          kind: "booking_flow",
          user_id: user.id,
          created_at: new Date().toISOString(),
          payload: {
            booking: {
              id: bookingId,
              user_id: user.id,
              court_id: bookingDialog.courtId,
              date: dateStr,
              start_time: bookingDialog.time + ":00",
              end_time: endTime + ":00",
              opponent_id: bookingDialog.opponentId || null,
              is_friendly: bookingDialog.isFriendly,
            },
            ...(needsChallenge && bookingDialog.opponentId
              ? {
                  challenge: {
                    id: challengeId,
                    opponent_id: bookingDialog.opponentId,
                    proposed_date: dateStr,
                  },
                }
              : {}),
          },
        });

        toast.message("Network issue — saved offline", {
          description: "We’ll retry syncing your booking automatically.",
        });
        setBookingDialog(null);
        return;
      }

      toast.error(err.message || "Failed to book");
    }
  };

  const eligibleOpponents = (() => {
    const list = (availablePlayers || []).filter((p) => p.id !== user?.id);
    const myRank = me?.rank ?? null;

    if (!bookingDialog) return [] as typeof list;
    if (bookingDialog.isFriendly) return list;
    if (!myRank) return [] as typeof list;

    const availableSet = availableForSlotUserIds ? new Set(availableForSlotUserIds) : null;
    return list.filter(
      (p) =>
        typeof p.rank === "number" &&
        myRank - p.rank >= 1 &&
        myRank - p.rank <= 2 &&
        (availableSet ? availableSet.has(p.id) : true)
    );
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
                const a = (booking as any)?.player_name ? String((booking as any).player_name).split(" ")[0] : null;
                const b = (booking as any)?.opponent_name ? String((booking as any).opponent_name).split(" ")[0] : null;

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
                      if (booking) setBookingDetails(booking);
                      else setBookingDialog({ courtId, time, opponentId: "", isFriendly: false });
                    }}
                  >
                    {booking ? (
                      <div className="px-1 min-w-0 text-center leading-tight">
                        <p className="font-medium text-primary text-[11px] truncate">
                          {a || "Booked"}
                          {b ? ` vs ${b}` : ""}
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

      {/* Booking Details Dialog */}
      <Dialog open={!!bookingDetails} onOpenChange={() => setBookingDetails(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Booking details</DialogTitle>
          </DialogHeader>
          {bookingDetails && (
            <div className="space-y-3 py-2">
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    Court {bookingDetails.court_id} · {format(selectedDate, "d MMM yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {String(bookingDetails.start_time || "").slice(0, 5)} - {String(bookingDetails.end_time || "").slice(0, 5)}
                    {bookingDetails.is_friendly ? " · Friendly" : " · Ladder"}
                  </p>
                </div>
                <Badge variant="secondary" className={bookingDetails.is_friendly ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}>
                  {bookingDetails.is_friendly ? "Friendly" : "Ladder"}
                </Badge>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Booked by</span>
                  <span className="font-medium text-right">
                    {bookingDetails.player_name || "Unknown"}
                    {typeof bookingDetails.player_rank === "number" ? ` (Rank #${bookingDetails.player_rank})` : ""}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Opponent</span>
                  <span className="font-medium text-right">
                    {bookingDetails.opponent_name || "Not selected"}
                    {typeof bookingDetails.opponent_rank === "number" ? ` (Rank #${bookingDetails.opponent_rank})` : ""}
                  </span>
                </div>
                {bookingDetails.challenge_id ? (
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Challenge</span>
                    <span className="font-medium text-right">Linked</span>
                  </div>
                ) : null}
              </div>

              {(bookingDetails.player_availability || bookingDetails.opponent_availability) && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Availability</p>
                  {bookingDetails.player_availability ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">{(bookingDetails.player_name || "Booked by").split(" ")[0]}:</span>{" "}
                      {bookingDetails.player_availability}
                    </p>
                  ) : null}
                  {bookingDetails.opponent_availability ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">{(bookingDetails.opponent_name || "Opponent").split(" ")[0]}:</span>{" "}
                      {bookingDetails.opponent_availability}
                    </p>
                  ) : null}
                </div>
              )}

              {bookingDetails.created_at ? (
                <p className="text-[11px] text-muted-foreground">
                  Created: {new Date(bookingDetails.created_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          )}
          <DialogFooter>
            {bookingDetails && bookingDetails.user_id === user?.id ? (
              <Button
                variant="outline"
                disabled={cancelBooking.isPending}
                onClick={async () => {
                  try {
                    await cancelBooking.mutateAsync(String(bookingDetails.id));
                    toast.success("Booking cancelled");
                    setBookingDetails(null);
                  } catch (e: any) {
                    toast.error(e.message || "Failed to cancel booking");
                  }
                }}
              >
                {cancelBooking.isPending ? "Cancelling..." : "Cancel booking"}
              </Button>
            ) : null}
            <Button onClick={() => setBookingDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {bookingDialog.time} - {addMinutesToTime(bookingDialog.time, 30)}
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
                          ? "No other players found."
                          : !me?.rank
                            ? "You need a ladder rank to book a ladder match. Toggle Friendly to book anyone."
                            : availableForSlotUserIds
                              ? "No eligible opponents are available for this 30-minute slot. Toggle Friendly to book anyone."
                              : "Loading availability…"}
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

                {selectedOpponent ? (
                  <div className="rounded-md border p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Availability</p>
                    {selectedOpponent.availability ? (
                      <p className="text-sm mt-1">{selectedOpponent.availability}</p>
                    ) : (
                      <p className="text-sm mt-1 text-muted-foreground">No availability set.</p>
                    )}
                    {availableForSlotUserIds ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {availableForSlotUserIds.includes(selectedOpponent.id)
                          ? "Available for this slot."
                          : "Not available for this slot (based on their availability blocks)."}
                      </p>
                    ) : null}
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
