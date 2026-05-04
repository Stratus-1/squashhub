import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useMemberContext } from "@/contexts/MemberContext";
import { toast } from "sonner";
import { Zap, ZapOff, ArrowRightLeft, ChevronsUpDown, Check } from "lucide-react";
import { ShareBookingDialog } from "@/components/ShareBookingDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
import { useMyClub } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { enqueueOutbox } from "@/lib/outbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

// "John Smith" -> "J. Smith"; single names returned as-is.
function toInitialSurname(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return full.trim();
  const first = parts[0];
  const surname = parts[parts.length - 1];
  const initial = first.charAt(0).toUpperCase();
  return `${initial}. ${surname}`;
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
  return t;
}

function buildTimeSlots(stepMinutes: number) {
  const slots: string[] = [];
  const start = 6 * 60;
  const end = 22 * 60;
  const step = stepMinutes === 60 ? 60 : 30;
  for (let m = start; m < end; m += step) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

const timeSlots = buildTimeSlots(30);

function isPeakSlot(date: Date, startTime: string, club: any | null | undefined) {
  if (!club) return false;
  const day = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;
  const startKey = isWeekend ? "peak_weekend_start" : "peak_weekday_start";
  const endKey = isWeekend ? "peak_weekend_end" : "peak_weekday_end";
  const peakStart = String(club[startKey] ?? (isWeekend ? "08:00:00" : "16:00:00")).slice(0, 5);
  const peakEnd = String(club[endKey] ?? (isWeekend ? "12:00:00" : "19:00:00")).slice(0, 5);
  const m = timeToMinutes(startTime.slice(0, 5));
  const ps = timeToMinutes(peakStart);
  const pe = timeToMinutes(peakEnd);
  return m >= ps && m < pe;
}

// courts are loaded dynamically from the database

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
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [visitorSearchOpen, setVisitorSearchOpen] = useState(false);
  const [bookingDialog, setBookingDialog] = useState<{
    courtId: number;
    time: string;
    opponentId: string;
    guestName: string;
    playerMode: "none" | "member" | "guest" | "visitor";
    isFriendly: boolean;
    duration: 30 | 60;
    lightsOn: boolean;
    lightFeeSplit: "booker" | "shared";
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeMember, isAdmin: isMemberAdmin } = useMemberContext();
  const { data: me } = useProfile();
  const courtCheckinsEnabled = !!(me as any)?.court_checkins_enabled;
  const { data: myClubData } = useMyClub();
  const myClub = myClubData?.club;
  const usesGoBook = !!(myClub as any)?.uses_gobook && !!(myClub as any)?.gobook_url;
  const gobookUrl = (myClub as any)?.gobook_url as string | undefined;
  const lightsIntegrationEnabled = !!(myClub as any)?.lights_integration_enabled;
  const lightFeePerHour = lightsIntegrationEnabled ? ((myClub as any)?.light_fee_per_hour ?? 0) : 0;
  const slotMinutes: 30 | 60 = ((myClub as any)?.booking_slot_minutes === 60 ? 60 : 30) as 30 | 60;
  const maxPeakPerDay = Math.max(1, Number((myClub as any)?.max_peak_bookings_per_day ?? 1));
  const dynamicTimeSlots = useMemo(() => buildTimeSlots(slotMinutes), [slotMinutes]);

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
  const { data: clubData } = useMyClub();
  const bookingClubId = clubData?.club?.id;
  const { data: bookings, isLoading } = useBookings(dateStr, bookingClubId);
  const [terminatingSession, setTerminatingSession] = useState(false);
  const [transferDialog, setTransferDialog] = useState<{ sessionId: string; currentCourtId: number } | null>(null);
  const [confirmEndSession, setConfirmEndSession] = useState<string | null>(null);

  // Active light sessions for the current user
  const { data: myActiveLightSessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["my-active-light-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("light_sessions")
        .select("id, booking_id, court_id, started_at, fee_per_hour, status")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
  const { data: champsBookings = [] } = useQuery({
    queryKey: ["club-champs-bookings", dateStr],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("club_champs_matches")
        .select(`
          id,
          court_id,
          scheduled_time,
          scheduled_date,
          player_a:player_a_member_id(name, user_id, profiles:user_id(name)),
          player_b:player_b_member_id(name, user_id, profiles:user_id(name)),
          champ:champ_id(match_duration_minutes)
        `)
        .eq("scheduled_date", dateStr)
        .not("court_id", "is", null)
        .not("scheduled_time", "is", null);

      if (error) throw error;

      return (data || []).map((m: any) => {
        const playerA = m.player_a?.name || m.player_a?.profiles?.name || "Player A";
        const playerB = m.player_b?.name || m.player_b?.profiles?.name || "Player B";
        const playerAUserId = m.player_a?.user_id || null;
        const playerBUserId = m.player_b?.user_id || null;
        const start = String(m.scheduled_time || "").slice(0, 5);
        const duration = Number(m.champ?.match_duration_minutes) || 30;
        const end = addMinutesToTime(start, duration);

        return {
          id: `champ-${m.id}`,
          court_id: m.court_id,
          date: m.scheduled_date,
          start_time: `${start}:00`,
          end_time: `${end}:00`,
          status: "active",
          user_id: playerAUserId,
          opponent_id: playerBUserId,
          is_friendly: false,
          is_champ: true,
          guest_name: null,
          player_name: playerA,
          opponent_name: playerB,
          player_rank: null,
          opponent_rank: null,
          created_at: null,
        };
      });
    },
    enabled: !!dateStr,
  });

  const allCourtBookings = useMemo(() => {
    const normalBookings = (bookings as any[] | undefined) || [];
    const merged = new Map<string, any>();

    for (const b of normalBookings) {
      const key = `${b.court_id}-${String(b.start_time || "").slice(0, 5)}-${String(b.end_time || "").slice(0, 5)}`;
      merged.set(key, b);
    }

    for (const cb of champsBookings as any[]) {
      const key = `${cb.court_id}-${String(cb.start_time || "").slice(0, 5)}-${String(cb.end_time || "").slice(0, 5)}`;
      if (!merged.has(key)) merged.set(key, cb);
    }

    return Array.from(merged.values());
  }, [bookings, champsBookings]);

  const createBooking = useCreateBooking();
  const createChallenge = useCreateChallenge();
  const cancelBooking = useCancelBooking();

  // Load courts dynamically from database
  const { data: courtsData } = useQuery({
    queryKey: ["courts-list", bookingClubId],
    queryFn: async () => {
      let q = supabase.from("courts").select("id, name").order("id");
      if (bookingClubId) q = q.eq("club_id", bookingClubId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as { id: number; name: string }[];
    },
    enabled: !!bookingClubId,
  });
  const courts = (courtsData || []).map((c: any) => c.id);
  const getCourtName = (id: number) => courtsData?.find((c: any) => c.id === id)?.name || `Court ${id}`;

  const { data: availablePlayers } = useQuery({
    queryKey: ["available-players-club", dateStr, bookingClubId],
    queryFn: async () => {
      // Get club members (scoped to current club) with their ladder rank
      const { data: members, error: membersError } = await (supabase as any)
        .from("club_members")
        .select("id, name, user_id, email, ladder_position")
        .eq("club_id", bookingClubId);
      if (membersError) throw membersError;

      // Also get profiles for display names
      const userIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
      let profileMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,name,email")
          .in("id", userIds);
        profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      }

      const combined: Array<{ id: string; name: string; rank: number | null; email: string | null; memberId: string }> = [];
      const seen = new Set<string>();

      for (const m of (members || [])) {
        const key = m.user_id || m.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const profile = m.user_id ? profileMap.get(m.user_id) : null;
        combined.push({
          id: m.user_id || m.id,
          name: profile?.name || m.name || m.email || "Unknown",
          rank: m.ladder_position ?? null,
          email: profile?.email || m.email || null,
          memberId: m.id,
        });
      }

      return combined as any;
    },
    enabled: !!user && !!bookingClubId,
  });

  const { data: clubVisitors = [] } = useQuery({
    queryKey: ["club-visitors-booking", bookingClubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitors")
        .select("id, first_name, last_name, home_club_name, category")
        .eq("club_id", bookingClubId!)
        .order("first_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; first_name: string; last_name: string; home_club_name: string; category: string }>;
    },
    enabled: !!bookingClubId,
  });

  const { data: availableForSlotUserIds } = useQuery({
    queryKey: ["available-for-slot", dateStr, bookingDialog?.time],
    queryFn: async () => {
      if (!bookingDialog?.time) return [] as string[];
      const dow = getISODay(selectedDate);
      const start = `${bookingDialog.time}:00`;
      const end = `${addMinutesToTime(bookingDialog.time, bookingDialog.duration)}:00`;
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
    return allCourtBookings.find((b: any) => {
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
  const courtBookingCounts = courts.reduce((acc: Record<number, number>, courtId: number) => {
    acc[courtId] = allCourtBookings.filter((b: any) => b.court_id === courtId).length;
    return acc;
  }, {} as Record<number, number>);
  const totalSlots = dynamicTimeSlots.length;
  const dayBookingsCount = allCourtBookings.length;

  const handleBook = async () => {
    if (!bookingDialog) return;
    const endTime = addMinutesToTime(bookingDialog.time, bookingDialog.duration);
    const bookingId = crypto.randomUUID();

    // Enforce peak-hour cap
    if (isPeakSlot(selectedDate, bookingDialog.time, myClub)) {
      const myExistingPeakCount = (bookings || []).filter((b: any) => {
        const mine = (b.user_id && b.user_id === user?.id)
          || (activeMember?.id && b.club_member_id === activeMember.id);
        if (!mine) return false;
        if (b.status && b.status !== "active") return false;
        return isPeakSlot(selectedDate, String(b.start_time || ""), myClub);
      }).length;
      if (myExistingPeakCount >= maxPeakPerDay) {
        toast.error(`Peak-hour limit reached (max ${maxPeakPerDay} per day).`);
        return;
      }
    }

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
              club_member_id: activeMember?.id || null,
              court_id: bookingDialog.courtId,
              date: dateStr,
              start_time: bookingDialog.time + ":00",
              end_time: endTime + ":00",
              opponent_id: bookingDialog.opponentId || null,
              opponent_member_id: opponent?.memberId || null,
              is_friendly: bookingDialog.isFriendly,
            },
            ...(needsChallenge && bookingDialog.opponentId
              ? {
                  challenge: {
                    id: challengeId,
                    opponent_id: bookingDialog.opponentId,
                    challenger_member_id: activeMember?.id || null,
                    opponent_member_id: opponent?.memberId || null,
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

      const opponentMemberId = bookingDialog.opponentId
        ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId)?.memberId || null
        : null;

      const created = await createBooking.mutateAsync({
        bookingId,
        courtId: bookingDialog.courtId,
        date: dateStr,
        startTime: bookingDialog.time + ":00",
        endTime: endTime + ":00",
        opponentId: bookingDialog.opponentId || null,
        isFriendly: bookingDialog.isFriendly,
        guestName: bookingDialog.guestName || null,
        clubMemberId: activeMember?.id || null,
        opponentMemberId,
      });

      // Mark lights_requested and fee split on the booking
      if (bookingDialog.lightsOn && user?.id) {
        try {
          await fromExt("bookings")
            .update({
              lights_requested: true,
              light_fee_split: bookingDialog.lightFeeSplit || "booker",
            })
            .eq("id", (created as any)?.id || bookingId);
        } catch (e: any) {
          console.error("Failed to set lights_requested:", e);
        }
      }

      const opponent = bookingDialog.opponentId
        ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId) || null
        : null;

      if (bookingDialog.opponentId && !bookingDialog.isFriendly) {
        try {
          const challenge = await createChallenge.mutateAsync({
            opponentId: bookingDialog.opponentId,
            proposedDate: dateStr,
            challengerMemberId: activeMember?.id || null,
            opponentMemberId: opponentMemberId || null,
          });

          await (supabase as any)
            .from("bookings")
            .update({ challenge_id: (challenge as any).id })
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
              club_member_id: activeMember?.id || null,
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
                    challenger_member_id: activeMember?.id || null,
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

  const handleTerminateSession = async (sessionId: string) => {
    setTerminatingSession(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "terminate", session_id: sessionId },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;
      toast.success(`Lights off! R${(result?.fee_charged || 0).toFixed(2)} charged for ${result?.duration_minutes || 0} minutes`);
      refetchSessions();
      setBookingDetails(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to terminate session");
    } finally {
      setTerminatingSession(false);
    }
  };

  const handleTransferCourt = async (sessionId: string, targetCourtId: number) => {
    setTerminatingSession(true);
    try {
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "transfer", session_id: sessionId, target_court_id: targetCourtId },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;
      toast.success(`Transferred! R${(result?.fee_charged || 0).toFixed(2)} charged for previous court. Lights on at new court.`);
      refetchSessions();
      setTransferDialog(null);
      setBookingDetails(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to transfer");
    } finally {
      setTerminatingSession(false);
    }
  };

  const eligibleOpponents = (() => {
    const list = (availablePlayers || []).filter((p: any) => p.id !== user?.id);

    if (!bookingDialog) return [] as typeof list;
    // Club Member mode or Friendly mode: show all members
    if (bookingDialog.playerMode === "member" || bookingDialog.isFriendly) return list;
    
    const myRank = me?.rank ?? null;
    if (!myRank) return [] as typeof list;

    const challengeLevelsUp = 2;
    const availableSet = availableForSlotUserIds ? new Set(availableForSlotUserIds) : null;
    return list.filter(
      (p: any) =>
        typeof p.rank === "number" &&
        myRank - p.rank >= 1 &&
        myRank - p.rank <= challengeLevelsUp &&
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
            <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" /> Tap an open slot below to book a court
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

      {/* GoBook deep-link banner (only when club uses external GoBook system) */}
      {(myClub as any)?.uses_gobook && (myClub as any)?.gobook_url && (
        <div className="px-4 mt-3">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{(myClub as any)?.name || "Your club"} uses GoBook</p>
                <p className="text-[11px] text-muted-foreground">
                  Court bookings are managed on GoBook. Log in there with your member number + PIN.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => openExternalUrl((myClub as any).gobook_url)}
                className="shrink-0"
              >
                Open GoBook
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upcoming games first */}
      <div className="mt-2">
        <UpcomingGamesSection />
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

      {/* Court availability stats */}

      {/* Time Grid */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-y border-border/50 pt-[env(safe-area-inset-top)]">
        {/* Selected date headline */}
        <div className="px-4 pt-3 pb-1 text-center">
          <h2 className="text-base font-bold font-heading uppercase tracking-wide text-foreground">
            {format(selectedDate, "EEEE d MMMM yyyy")}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            Tap a time slot to make a booking
          </p>
        </div>

        <div className="px-4 py-1.5">
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

        <div className="gap-x-1.5 px-4 pb-2" style={{ display: "grid", gridTemplateColumns: `60px repeat(${courts.length}, 1fr)` }}>
          <div className="flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold text-foreground">{format(selectedDate, "EEE")}</span>
            <span className="text-[10px] text-muted-foreground">{format(selectedDate, "d MMM")}</span>
          </div>
          {courts.map((c: number) => (
            <div key={c} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {getCourtName(c)}
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
          {dynamicTimeSlots.map((time, idx) => {
            const isHour = time.endsWith(":00");
            return (
              <div
                key={time}
                className={cn(
                  "gap-x-1.5",
                  isHour && idx !== 0 && "pt-1.5 mt-1.5 border-t border-border/40"
                )}
                style={{ display: "grid", gridTemplateColumns: `60px repeat(${courts.length}, 1fr)` }}
              >
                <div className={cn(
                  "text-[10px] flex items-center justify-end pr-1.5 font-medium tabular-nums",
                  isHour ? "text-foreground/70" : "text-muted-foreground/40"
                )}>
                  {isHour ? formatTimeDisplay(time) : ""}
                </div>
                {courts.map((courtId) => {
                  const booking = getBooking(courtId, time);
                  // Event bookings are club bookings with a guest_name acting as event title
                  const isEventBooking = !!(booking as any)?.is_club_booking && !!(booking as any)?.guest_name;
                  const eventLabel = isEventBooking ? String((booking as any).guest_name) : null;
                  const a = (booking as any)?.player_name ? toInitialSurname(String((booking as any).player_name)) : null;
                  const b = !isEventBooking && (booking as any)?.opponent_name ? toInitialSurname(String((booking as any).opponent_name)) : null;
                  const isMine = booking && ((booking as any).user_id === user?.id || (booking as any).opponent_id === user?.id);
                  const isBlocked = !!(booking as any)?.is_blocked;
                  const blockReason = (booking as any)?.block_reason ? String((booking as any).block_reason) : "";

                  // Check if this slot is in the past
                  const slotDateTime = new Date(`${dateStr}T${time}:00`);
                  const isPastSlot = slotDateTime < new Date();

                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.div
                          whileTap={isPastSlot && !booking ? undefined : { scale: 0.97 }}
                          className={cn(
                            "h-10 rounded-lg flex items-center justify-center text-xs transition-all border",
                            isPastSlot && !booking
                              ? "bg-muted border-border/40 cursor-not-allowed opacity-60"
                              : booking
                                ? isMine
                                  ? "bg-primary/15 border-primary/50 hover:bg-primary/20 cursor-pointer shadow-sm"
                                  : "bg-secondary border-border/60 hover:bg-secondary/90 cursor-pointer shadow-sm"
                                : "border-border bg-win/10 hover:border-primary/40 hover:bg-win/20 border-dashed cursor-pointer"
                          )}
                          onClick={() => {
                            if (isPastSlot && !booking) return;
                            if (booking) { setBookingDetails(booking); return; }
                            if (usesGoBook && gobookUrl) {
                              toast.info("Opening GoBook to complete your booking…");
                              openExternalUrl(gobookUrl);
                              return;
                            }
                            setBookingDialog({ courtId, time, opponentId: "", guestName: "", playerMode: "none", isFriendly: true, duration: slotMinutes, lightsOn: lightsIntegrationEnabled, lightFeeSplit: "booker" });
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
                                {isBlocked ? (blockReason || "Blocked") : isEventBooking ? eventLabel : (a || "Booked")}
                                {!isBlocked && !isEventBooking && b ? <span className="font-normal text-muted-foreground"> v </span> : ""}
                                {!isBlocked && !isEventBooking && b ? b : ""}
                              </p>
                            </div>
                          ) : isPastSlot ? (
                            <span className="text-muted-foreground/20 text-[10px]">—</span>
                          ) : (
                            <span className="text-muted-foreground/30 text-[10px]">·</span>
                          )}
                        </motion.div>
                      </TooltipTrigger>
                      {booking && !isBlocked && (
                        <TooltipContent side="top" className="max-w-[220px] text-xs space-y-1 p-2.5">
                          <p className="font-semibold">{isEventBooking ? eventLabel : `${(booking as any).player_name || "Unknown"}${b ? ` vs ${b}` : ""}`}</p>
                          <p className="text-muted-foreground">{String((booking as any).start_time || "").slice(0, 5)} – {String((booking as any).end_time || "").slice(0, 5)}</p>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {(booking as any).lights_requested ? (
                              <><Zap className="w-3 h-3 text-amber-500" /> Auto Lights On</>
                            ) : (
                              <><ZapOff className="w-3 h-3" /> Lights Manual On</>
                            )}
                          </div>
                          {(booking as any).lights_requested && (
                            <p className="text-muted-foreground">
                              Fee: {(booking as any).light_fee_split === "shared" ? "Split 50/50" : (booking as any).light_fee_split === "none" || (booking as any).light_fee_split === "club" ? "Club Cost" : "Booker pays"}
                            </p>
                          )}
                          {(booking as any).is_friendly === false && (
                            <p className="text-muted-foreground">⚔️ Ladder match</p>
                          )}
                          {(booking as any).is_friendly === true && b && (
                            <p className="text-muted-foreground">🤝 Friendly</p>
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
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
                    {getCourtName(bookingDetails.court_id)} · {format(selectedDate, "EEE d MMM yyyy")}
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

              {/* Active light session info */}
              {(() => {
                const activeSession = (myActiveLightSessions as any[]).find(
                  (s: any) => s.booking_id === bookingDetails.id
                );
                if (!activeSession) return null;
                const startedAt = new Date(activeSession.started_at);
                const elapsedMin = Math.round((Date.now() - startedAt.getTime()) / 60000);
                const feePerHour = Number(activeSession.fee_per_hour) || 0;
                const currentCost = Math.round(((elapsedMin / 60) * feePerHour) * 100) / 100;
                return (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-semibold">Lights Active</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Running for {elapsedMin} min · R{currentCost.toFixed(2)} so far</p>
                      <p>R{feePerHour}/hr — charged when session ends</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5 flex-1"
                        disabled={terminatingSession}
                        onClick={() => setConfirmEndSession(activeSession.id)}
                      >
                        <ZapOff className="w-3.5 h-3.5" />
                        {terminatingSession ? "Ending..." : "End Session"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 flex-1"
                        disabled={terminatingSession}
                        onClick={() => setTransferDialog({ sessionId: activeSession.id, currentCourtId: bookingDetails.court_id })}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Transfer Court
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {bookingDetails.created_at && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Created {new Date(bookingDetails.created_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {bookingDetails && (() => {
              const isBooker = bookingDetails.user_id === user?.id;
              const isOpponent = !!(user?.id && (bookingDetails as any).opponent_id === user.id);
              const isAdmin = isMemberAdmin;
              const bookingDateStr = String(bookingDetails.date);
              const endTimeStr = String(bookingDetails.end_time || "23:59:59").slice(0, 5);
              const bookingEnd = new Date(`${bookingDateStr}T${endTimeStr}`);
              const isPastBooking = bookingEnd < new Date();
              const isBlocked = !!(bookingDetails as any).is_blocked;
              const canEnterResult = isPastBooking && !isBlocked && (isBooker || isOpponent || isAdmin);

              return (
                <>
                  {canEnterResult && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        const bd = bookingDetails;
                        setBookingDetails(null);
                        const params = new URLSearchParams();
                        if (bd.club_member_id) params.set("playerAMemberId", bd.club_member_id);
                        else if (bd.user_id) params.set("playerAUserId", bd.user_id);
                        if ((bd as any).opponent_member_id) params.set("playerBMemberId", (bd as any).opponent_member_id);
                        else if ((bd as any).opponent_id) params.set("playerBUserId", (bd as any).opponent_id);
                        if (bd.date) params.set("matchDate", String(bd.date));
                        navigate(`/add-result?${params.toString()}`);
                      }}
                    >
                      <Swords className="w-3.5 h-3.5" /> Enter Result
                    </Button>
                  )}
                  {isBooker && (
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
                </>
              );
            })()}
            <Button variant="outline" onClick={() => setBookingDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Confirmation Dialog */}
      <Dialog open={!!bookingDialog} onOpenChange={() => setBookingDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Book Court</DialogTitle>
            <p className="text-xs text-muted-foreground">Booking as <span className="font-medium text-foreground">{activeMember?.name || me?.name || "You"}</span></p>
          </DialogHeader>
          {bookingDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{getCourtName(bookingDialog.courtId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(selectedDate, "EEE d MMM yyyy")} · {bookingDialog.time} - {addMinutesToTime(bookingDialog.time, bookingDialog.duration)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Duration</Label>
                <div className="flex gap-1.5">
                  {(slotMinutes === 30 ? ([30, 60] as const) : ([60] as const)).map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={bookingDialog.duration === d ? "default" : "outline"}
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => setBookingDialog((s) => s ? { ...s, duration: d } : s)}
                    >
                      {d} min
                    </Button>
                  ))}
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
                    setBookingDialog((s) => (s ? { ...s, isFriendly: checked, opponentId: "", guestName: "", playerMode: "none" } : s))
                  }
                />
              </div>

              {lightsIntegrationEnabled && (
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="min-w-0">
                    <Label className="text-xs font-semibold">Switch on Lights Automatically</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {bookingDialog.lightsOn
                        ? (lightFeePerHour > 0
                            ? `Lights turn on when your booking starts · R${lightFeePerHour}/hr`
                            : "Lights will activate automatically at booking time")
                        : "Member will be prompted to switch on the lights"}
                    </p>
                  </div>
                  <Switch
                    checked={bookingDialog.lightsOn}
                    onCheckedChange={(checked) =>
                      setBookingDialog((s) => (s ? { ...s, lightsOn: checked } : s))
                    }
                  />
                </div>
              )}


              <div className="space-y-2">
                <Label className="text-xs font-semibold">2nd Player (optional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["member", "visitor"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={bookingDialog.playerMode === mode ? "default" : "outline"}
                      className="flex-1 text-xs rounded-lg min-w-[60px]"
                      onClick={() => setBookingDialog((s) => s ? { ...s, playerMode: mode, opponentId: "", guestName: "" } : s)}
                    >
                      {mode === "member" ? "Member" : "Visitor"}
                    </Button>
                  ))}
                </div>

                {bookingDialog.playerMode === "member" && (
                  <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between rounded-xl font-normal">
                        {bookingDialog.opponentId
                          ? (() => {
                              const p = eligibleOpponents.find((op: any) => op.id === bookingDialog.opponentId);
                              return p ? `${p.name} ${typeof p.rank === "number" ? `(#${p.rank})` : "(Unranked)"}` : "Select member...";
                            })()
                          : (bookingDialog.isFriendly ? "Choose anyone" : "Choose eligible opponent")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search member..." />
                        <CommandList>
                          <CommandEmpty>
                            {bookingDialog.isFriendly
                              ? "No other players found."
                              : !me?.rank
                                ? "You need a ladder rank first."
                                : "No eligible opponents available."}
                          </CommandEmpty>
                          <CommandGroup>
                            {eligibleOpponents.map((p: any) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.name} ${typeof p.rank === "number" ? `#${p.rank}` : ""}`}
                                onSelect={() => {
                                  setBookingDialog((s) => (s ? { ...s, opponentId: p.id } : s));
                                  setMemberSearchOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", bookingDialog.opponentId === p.id ? "opacity-100" : "opacity-0")} />
                                {p.name} {typeof p.rank === "number" ? `(#${p.rank})` : "(Unranked)"}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}

                {bookingDialog.playerMode === "guest" && (
                  <Input
                    placeholder="Guest name"
                    value={bookingDialog.guestName}
                    onChange={(e) => setBookingDialog((s) => s ? { ...s, guestName: e.target.value } : s)}
                    className="rounded-xl"
                  />
                )}

                {bookingDialog.playerMode === "visitor" && (
                  <Popover open={visitorSearchOpen} onOpenChange={setVisitorSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between rounded-xl font-normal">
                        {bookingDialog.guestName || "Choose a registered visitor"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search visitor..." />
                        <CommandList>
                          <CommandEmpty>No visitors registered yet.</CommandEmpty>
                          <CommandGroup>
                            {clubVisitors.map((v) => {
                              const val = `${v.first_name} ${v.last_name} (${v.home_club_name})`;
                              return (
                                <CommandItem
                                  key={v.id}
                                  value={`${v.first_name} ${v.last_name} ${v.home_club_name}`}
                                  onSelect={() => {
                                    setBookingDialog((s) => (s ? { ...s, guestName: val } : s));
                                    setVisitorSearchOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", bookingDialog.guestName === val ? "opacity-100" : "opacity-0")} />
                                  {v.first_name} {v.last_name} · {v.home_club_name}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {bookingDialog.lightsOn && lightFeePerHour > 0 && bookingDialog.playerMode === "member" && bookingDialog.opponentId && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Who pays for lights?</Label>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant={bookingDialog.lightFeeSplit === "booker" ? "default" : "outline"}
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => setBookingDialog((s) => s ? { ...s, lightFeeSplit: "booker" } : s)}
                    >
                      I'll pay
                    </Button>
                    <Button
                      size="sm"
                      variant={bookingDialog.lightFeeSplit === "shared" ? "default" : "outline"}
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => setBookingDialog((s) => s ? { ...s, lightFeeSplit: "shared" } : s)}
                    >
                      Split 50/50
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {bookingDialog.lightFeeSplit === "shared"
                      ? "Half the light fee will be deducted from each player's account"
                      : "Full light fee will be deducted from your account"}
                  </p>
                </div>
              )}

              {bookingDialog.lightsOn && lightFeePerHour > 0 && (
                <div className="rounded-xl bg-accent/10 border border-accent/30 p-3 text-xs">
                  <span className="font-semibold">💡 Light fee:</span>{" "}
                  R{lightFeePerHour}/hr — charged based on actual usage when lights turn off
                </div>
              )}
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
                  getCourtName(calendarPrompt.courtId),
                  `Time: ${calendarPrompt.startTime}-${calendarPrompt.endTime}`,
                  "Booked via SquashHub.",
                ].join("\n");
                const url = buildGoogleCalendarEventUrl({
                  title,
                  startLocal: start,
                  endLocal: end,
                  details,
                  location: getCourtName(calendarPrompt.courtId),
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

      {/* Transfer Court Dialog */}
      <Dialog open={!!transferDialog} onOpenChange={() => setTransferDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Transfer to Another Court</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Select a court to transfer your lights to. The current court's lights will turn off and you'll be charged for actual usage.
            </p>
            <div className="grid gap-2">
              {courts
                .filter((c: number) => c !== transferDialog?.currentCourtId)
                .map((courtId: number) => (
                  <Button
                    key={courtId}
                    variant="outline"
                    className="justify-start gap-2"
                    disabled={terminatingSession}
                    onClick={() => {
                      if (transferDialog) {
                        handleTransferCourt(transferDialog.sessionId, courtId);
                      }
                    }}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    {getCourtName(courtId)}
                  </Button>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm End Session Dialog */}
      <Dialog open={!!confirmEndSession} onOpenChange={() => setConfirmEndSession(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ZapOff className="w-4 h-4" /> End Court Session?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will turn off the lights and end your session. You'll be charged based on actual usage.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmEndSession(null)} disabled={terminatingSession}>
              Keep Playing
            </Button>
            <Button
              variant="destructive"
              disabled={terminatingSession}
              onClick={() => {
                if (confirmEndSession) {
                  handleTerminateSession(confirmEndSession);
                  setConfirmEndSession(null);
                }
              }}
            >
              <ZapOff className="w-3.5 h-3.5 mr-1" />
              {terminatingSession ? "Ending..." : "End Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BackToDashboard />
    </div>
  );
}
