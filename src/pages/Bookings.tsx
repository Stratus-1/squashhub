import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MessageCircle,
  Calendar as CalendarIcon,
  CalendarCheck,
  Clock,
  MapPin,
  Users,
  Swords,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays, subDays, getISODay, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { useBookings, useCancelBooking, useCreateBooking, useCreateChallenge, useProfile, useMyBookings } from "@/hooks/use-data";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

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

function formatTimeDisplay(t: string) {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${ampm}`;
}

const timeSlots = (() => {
  const slots: string[] = [];
  const start = 6 * 60;
  const end = 22 * 60;
  for (let m = start; m < end; m += 30) {
    slots.push(minutesToTime(m));
  }
  return slots;
})();

const courts = [1, 2];

function getDateLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE");
}

// Quick date chips for the next 7 days
function DateChips({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 px-4 scrollbar-hide">
      {days.map((day) => {
        const isSelected = format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelect(day)}
            className={cn(
              "flex flex-col items-center min-w-[3.2rem] px-2 py-2 rounded-xl text-xs font-medium transition-all",
              isSelected
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-card hover:bg-secondary border border-border/50"
            )}
          >
            <span className={cn("text-[10px] uppercase tracking-wider", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {format(day, "EEE")}
            </span>
            <span className="text-base font-bold mt-0.5">{format(day, "d")}</span>
          </button>
        );
      })}
    </div>
  );
}

// Upcoming games card
function UpcomingGamesSection() {
  const { data: myBookings, isLoading } = useMyBookings();

  if (isLoading) return null;
  if (!myBookings || myBookings.length === 0) return null;

  const upcoming = myBookings.slice(0, 3);

  return (
    <div className="px-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
        </div>
        <h2 className="text-sm font-semibold font-heading">Upcoming Games</h2>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {myBookings.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {upcoming.map((booking: any, i: number) => (
          <motion.div
            key={booking.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0",
                  "bg-primary/10 text-primary"
                )}>
                  <span className="text-[10px] font-medium uppercase">
                    {format(parseISO(booking.date), "MMM")}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {format(parseISO(booking.date), "d")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">
                      {booking.court_name}
                    </span>
                    {booking.is_friendly ? (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">Friendly</Badge>
                    ) : (
                      <Badge className="text-[9px] px-1 py-0 bg-primary/15 text-primary border-0">Ladder</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {String(booking.start_time || "").slice(0, 5)} - {String(booking.end_time || "").slice(0, 5)}
                    </span>
                    {booking.opponent_name && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Swords className="w-3 h-3" />
                        vs {booking.opponent_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <div className="w-2 h-2 rounded-full bg-win animate-pulse" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

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
  const courtCheckinsEnabled = !!(me as any)?.court_checkins_enabled;

  useEffect(() => {
    if (!user?.id) return;
    if (!courtCheckinsEnabled) return;
    if (!isToday(selectedDate)) return;

    const lastAtMs = Number(localStorage.getItem("courtPresence:lastAtMs") || "0");
    if (Number.isFinite(lastAtMs) && Date.now() - lastAtMs < 15 * 60 * 1000) return;

    let cancelled = false;
    (async () => {
      try {
        const perm = await Geolocation.checkPermissions().catch(() => null as any);
        const loc = perm?.location as string | undefined;
        if (loc === "denied") return;

        if (loc !== "granted") {
          // Only request once (avoid repeatedly prompting on refresh).
          const asked = localStorage.getItem("courtPresence:asked");
          if (asked) return;
          localStorage.setItem("courtPresence:asked", "1");

          const req = await Geolocation.requestPermissions().catch(() => null as any);
          const reqLoc = req?.location as string | undefined;
          if (reqLoc !== "granted") return;
        }

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 60_000,
        });
        if (cancelled) return;

        localStorage.setItem("courtPresence:lastAtMs", String(Date.now()));

        const { data, error } = await (supabase.rpc as any)("record_court_presence", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          source: Capacitor.isNativePlatform() ? "native" : "web",
        });
        if (error) throw error;

        if (data?.at_court && data?.had_booking === false) {
          toast.info("Looks like you’re at the courts but no booking was found — book a slot so your game is tracked.");
        }
      } catch {
        // Silent: court check-ins are best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courtCheckinsEnabled, selectedDate, user?.id]);

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

  // Count bookings per court for stats
  const court1Count = (bookings as any[] | undefined)?.filter((b: any) => b.court_id === 1).length || 0;
  const court2Count = (bookings as any[] | undefined)?.filter((b: any) => b.court_id === 2).length || 0;
  const totalSlots = timeSlots.length;
  const dayBookingsCount = (bookings as any[] | undefined)?.length || 0;

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
          ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId) || null
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
          description: "Your booking will sync automatically when you're back online.",
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
        ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId) || null
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
          description: "We'll retry syncing your booking automatically.",
        });
        setBookingDialog(null);
        return;
      }

      toast.error(err.message || "Failed to book");
    }
  };

  const eligibleOpponents = (() => {
    const list = (availablePlayers || []).filter((p: any) => p.id !== user?.id);
    const myRank = me?.rank ?? null;

    if (!bookingDialog) return [] as typeof list;
    if (bookingDialog.isFriendly) return list;
    if (!myRank) return [] as typeof list;

    const availableSet = availableForSlotUserIds ? new Set(availableForSlotUserIds) : null;
    return list.filter(
      (p: any) =>
        typeof p.rank === "number" &&
        myRank - p.rank >= 1 &&
        myRank - p.rank <= 2 &&
        (availableSet ? availableSet.has(p.id) : true)
    );
  })();

  const selectedOpponent = bookingDialog?.opponentId
    ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId) || null
    : null;

  return (
    <div className="bottom-nav-safe">
      {/* Header */}
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold font-heading tracking-tight">Courts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getDateLabel(selectedDate)} · {format(selectedDate, "d MMM")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isToday(selectedDate) && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setSelectedDate(new Date())}
              >
                Today
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Date chips */}
      {!isLoading && (
        <div className="px-4 mt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 backdrop-blur-sm px-3 py-1 text-xs">
            <CalendarCheck className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold tabular-nums">{dayBookingsCount}</span>
            <span className="text-muted-foreground">bookings</span>
          </div>
        </div>
      )}
      <DateChips selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* Upcoming games */}
      <div className="mt-4">
        <UpcomingGamesSection />
      </div>

      {/* Court availability stats */}
      {!isLoading && (
        <div className="px-4 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {courts.map((courtId) => {
              const count = courtId === 1 ? court1Count : court2Count;
              const pct = Math.round((count / totalSlots) * 100);
              return (
                <Card key={courtId} className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold font-heading">Court {courtId}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[9px] px-1.5 py-0",
                          pct > 70 ? "bg-destructive/15 text-destructive" : pct > 40 ? "bg-accent/20 text-accent-foreground" : "bg-win/15 text-win"
                        )}
                      >
                        {pct > 70 ? "Busy" : pct > 40 ? "Moderate" : "Available"}
                      </Badge>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          pct > 70 ? "bg-destructive" : pct > 40 ? "bg-accent" : "bg-primary"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{count}/{totalSlots} slots booked</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Time Grid */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-y border-border/50 pt-[env(safe-area-inset-top)]">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schedule</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary/70" /> You
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Booked
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full border border-border/70 bg-background" /> Open
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[60px_1fr_1fr] sm:grid-cols-[72px_1fr_1fr] gap-x-1.5 px-4 pb-2">
          <div />
          {courts.map((c) => (
            <div key={c} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Court {c}
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <motion.div
          className="px-4 space-y-[3px] mb-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {timeSlots.map((time, idx) => {
            const isHour = time.endsWith(":00");
            return (
              <div
                key={time}
                className={cn(
                  "grid grid-cols-[60px_1fr_1fr] sm:grid-cols-[72px_1fr_1fr] gap-x-1.5",
                  isHour && idx !== 0 && "pt-1.5 mt-1.5 border-t border-border/40"
                )}
              >
                <div className={cn(
                  "text-[10px] flex items-center justify-end pr-1.5 font-medium tabular-nums",
                  isHour ? "text-foreground/70" : "text-muted-foreground/40"
                )}>
                  {isHour ? formatTimeDisplay(time) : ""}
                </div>
                {courts.map((courtId) => {
                  const booking = getBooking(courtId, time);
                  const a = (booking as any)?.player_name ? String((booking as any).player_name).split(" ")[0] : null;
                  const b = (booking as any)?.opponent_name ? String((booking as any).opponent_name).split(" ")[0] : null;
                  const isMine = booking && (booking as any).user_id === user?.id;
                  const isBlocked = !!(booking as any)?.is_blocked;
                  const blockReason = (booking as any)?.block_reason ? String((booking as any).block_reason) : "";

                  return (
                    <motion.div
                      key={courtId}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "h-10 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-all border",
                        booking
                          ? isMine
                            ? "bg-primary/15 border-primary/40 hover:bg-primary/20"
                            : "bg-secondary/80 border-border/50 hover:bg-secondary"
                          : "border-border/30 hover:border-primary/30 hover:bg-primary/5 border-dashed"
                      )}
                      onClick={() => {
                        if (booking) setBookingDetails(booking);
                        else setBookingDialog({ courtId, time, opponentId: "", isFriendly: false });
                      }}
                    >
                      {booking ? (
                        <div className="px-1.5 min-w-0 text-center leading-tight">
                          <p className={cn(
                            "font-semibold text-[11px] truncate",
                            isBlocked
                              ? "text-destructive"
                              : isMine
                                ? "text-primary"
                                : "text-foreground/70"
                          )}>
                            {isBlocked ? (blockReason || "Blocked") : (a || "Booked")}
                            {!isBlocked && b ? ` vs ${b}` : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30 text-[10px]">·</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Booking Details Dialog */}
      <Dialog open={!!bookingDetails} onOpenChange={() => setBookingDetails(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Booking Details</DialogTitle>
          </DialogHeader>
          {bookingDetails && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Court {bookingDetails.court_id} · {format(selectedDate, "d MMM yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {String(bookingDetails.start_time || "").slice(0, 5)} - {String(bookingDetails.end_time || "").slice(0, 5)}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px]",
                    (bookingDetails as any).is_blocked
                      ? "bg-destructive/15 text-destructive border-0"
                      : bookingDetails.is_friendly
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary border-0"
                  )}
                >
                  {(bookingDetails as any).is_blocked ? "Blocked" : bookingDetails.is_friendly ? "Friendly" : "Ladder"}
                </Badge>
              </div>

              {(bookingDetails as any).is_blocked && (
                <Card className="p-3 border-destructive/20 bg-destructive/5">
                  <p className="text-sm font-semibold">Court blocked</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reason: {String((bookingDetails as any).block_reason || "Maintenance")}
                  </p>
                </Card>
              )}

              <div className="rounded-xl border p-3 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Booked by
                  </span>
                  <span className="font-medium">
                    {bookingDetails.player_name || "Unknown"}
                    {typeof bookingDetails.player_rank === "number" ? ` (#${bookingDetails.player_rank})` : ""}
                  </span>
                </div>
                {!(bookingDetails as any).is_blocked && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5" /> Opponent
                    </span>
                    <span className="font-medium">
                      {bookingDetails.opponent_name || "Not selected"}
                      {typeof bookingDetails.opponent_rank === "number" ? ` (#${bookingDetails.opponent_rank})` : ""}
                    </span>
                  </div>
                )}
              </div>

              {bookingDetails.created_at && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Created {new Date(bookingDetails.created_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {bookingDetails && bookingDetails.user_id === user?.id && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const bd = bookingDetails;
                    setBookingDetails(null);
                    setShareDialog({
                      open: true,
                      bookingId: bd.id,
                      courtId: bd.court_id,
                      dateStr: String(bd.date),
                      startTime: String(bd.start_time || "").slice(0, 5),
                      endTime: String(bd.end_time || "").slice(0, 5),
                      opponentName: bd.opponent_name || null,
                    });
                  }}
                >
                  <Mail className="w-3.5 h-3.5" /> Share
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
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
                  {cancelBooking.isPending ? "Cancelling..." : "Cancel"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setBookingDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Confirmation Dialog */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Book Court</DialogTitle>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Court {bookingDialog.courtId}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(selectedDate, "d MMM yyyy")} · {bookingDialog.time} - {addMinutesToTime(bookingDialog.time, 30)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <Label className="text-xs font-semibold">Friendly Match</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Won't count toward ladder rankings
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
                <Label className="text-xs font-semibold">Opponent (optional)</Label>
                <Select
                  value={bookingDialog.opponentId}
                  onValueChange={(v) => setBookingDialog((s) => (s ? { ...s, opponentId: v } : s))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={bookingDialog.isFriendly ? "Choose anyone" : "Choose eligible opponent"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOpponents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {bookingDialog.isFriendly
                          ? "No other players found."
                          : !me?.rank
                            ? "You need a ladder rank first. Toggle Friendly to book anyone."
                            : availableForSlotUserIds
                              ? "No eligible opponents available. Toggle Friendly to book anyone."
                              : "Loading availability…"}
                      </div>
                    ) : (
                      eligibleOpponents.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {typeof p.rank === "number" ? `(#${p.rank})` : "(Unranked)"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialog(null)}>Cancel</Button>
            <Button onClick={handleBook} disabled={createBooking.isPending || createChallenge.isPending}>
              {createBooking.isPending || createChallenge.isPending ? "Booking..." : "Confirm Booking"}
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
            <DialogTitle className="font-heading">Add to Calendar?</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-1">
              <p className="text-sm font-semibold">
                Court {calendarPrompt.courtId} · {calendarPrompt.dateStr}
              </p>
              <p className="text-xs text-muted-foreground">
                {calendarPrompt.startTime} - {calendarPrompt.endTime}
                {calendarPrompt.opponentName ? ` · vs ${calendarPrompt.opponentName}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl border p-3">
              <p className="text-xs text-muted-foreground flex-1">Share this booking?</p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-lg"
                onClick={() => {
                  setCalendarPrompt((s) => ({ ...s, open: false }));
                  setShareDialog({
                    open: true,
                    bookingId: calendarPrompt.bookingId,
                    courtId: calendarPrompt.courtId,
                    dateStr: calendarPrompt.dateStr,
                    startTime: calendarPrompt.startTime,
                    endTime: calendarPrompt.endTime,
                    opponentName: calendarPrompt.opponentName,
                  });
                }}
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-lg"
                onClick={() => {
                  const msg = encodeURIComponent(
                    `🏸 Squash booking!\n\nCourt ${calendarPrompt.courtId} on ${calendarPrompt.dateStr} from ${calendarPrompt.startTime} to ${calendarPrompt.endTime}.\n\nJoin me!`
                  );
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </div>
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
                  calendarPrompt.isFriendly ? "Friendly match." : "Ladder match.",
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
              <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
              Add to Calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Booking Dialog */}
      <ShareBookingDialog
        open={shareDialog.open}
        onOpenChange={(open) => setShareDialog((s) => ({ ...s, open }))}
        bookingId={shareDialog.bookingId}
        courtId={shareDialog.courtId}
        dateStr={shareDialog.dateStr}
        startTime={shareDialog.startTime}
        endTime={shareDialog.endTime}
        opponentName={shareDialog.opponentName}
        inviterName={me?.name || undefined}
      />
    </div>
  );
}
