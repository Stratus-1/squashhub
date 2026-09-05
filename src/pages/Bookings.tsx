import { useEffect, useMemo, useRef, useState } from "react";
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
  AlertTriangle,
  Info,
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
import { BulkLeagueBookingsDialog } from "@/components/BulkLeagueBookingsDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { buildGoogleCalendarEventUrl, openExternalUrl } from "@/lib/google-calendar";
import { useMyClub, useIsSuperAdmin, useIsClubAdmin } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { useMemberAccessGate } from "@/hooks/use-member-access-gate";
import { MemberSuspensionBanner } from "@/components/MemberSuspensionBanner";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { OpsBookingDialog } from "@/components/OpsBookingDialog";
import { Wrench } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { enqueueOutbox } from "@/lib/outbox";
import { checkBookingBalance } from "@/lib/booking-balance-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { champMatchToBookingLabel } from "@/lib/tournaments/booking-label";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

async function extractFunctionError(data: unknown, error: unknown): Promise<string | null> {
  const dataError = (data as { error?: string; booking_id?: string | number } | null);
  if (dataError?.error) {
    return `${String(dataError.error)}${dataError.booking_id ? ` (GoBook BookingId: ${dataError.booking_id})` : ""}`;
  }
  if (!error) return null;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const txt = await ctx.clone().text();
      const parsed = JSON.parse(txt);
      if (parsed?.error) {
        return `${String(parsed.error)}${parsed.booking_id ? ` (GoBook BookingId: ${parsed.booking_id})` : ""}`;
      }
    } catch { /* ignore */ }
  }
  return (error as Error).message || "Request failed";
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

function buildTimeSlots(stepMinutes: number, openTime?: string | null, lastSlotTime?: string | null) {
  const slots: string[] = [];
  const step = stepMinutes === 60 ? 60 : stepMinutes === 40 ? 40 : 30;
  // Club-configurable window. Defaults: 05:00 first slot, 22:00 last slot start
  // (40-min clubs historically start at 07:00 when no club setting exists).
  const defaultStart = step === 40 ? 7 * 60 : 5 * 60;
  const start = openTime ? timeToMinutes(String(openTime).slice(0, 5)) : defaultStart;
  const last = lastSlotTime ? timeToMinutes(String(lastSlotTime).slice(0, 5)) : 22 * 60 - step;
  for (let m = start; m <= last; m += step) {
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

// Quick date chips for the next 7 days (+ admin: 30 days, super-admin: 365 days)
function DateChips({ selectedDate, onSelect, isAdmin, isSuperAdmin }: { selectedDate: Date; onSelect: (d: Date) => void; isAdmin?: boolean; isSuperAdmin?: boolean }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [pickerOpen, setPickerOpen] = useState(false);
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const maxDate = addDays(todayMidnight, 365);
  const canPick = isAdmin || isSuperAdmin;
  const selectedBeyondStrip = selectedDate > addDays(todayMidnight, 6);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 px-4 scrollbar-hide">
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
      {canPick && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center min-w-[3.2rem] px-2 py-2 rounded-xl text-xs font-medium transition-all",
                selectedBeyondStrip
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-card hover:bg-secondary border border-border/50 border-dashed"
              )}
              title="Pick a date (next 30 days) — admin only"
            >
              <CalendarIcon className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-wider mt-0.5">
                {selectedBeyondStrip ? format(selectedDate, "d MMM") : "Pick"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => { if (d) { onSelect(d); setPickerOpen(false); } }}
              disabled={(d) => d < todayMidnight || d > maxDate}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}
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
    duration: 30 | 40 | 60;
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
  const [topUpPrompt, setTopUpPrompt] = useState<{
    open: boolean;
    shortfall: number;
    currentOwing: number;
    planAllowedDebt: number;
    requiredBuffer: number;
  }>({ open: false, shortfall: 0, currentOwing: 0, planAllowedDebt: 0, requiredBuffer: 0 });
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
  const [bulkLeagueOpen, setBulkLeagueOpen] = useState(false);
  const { user } = useAuth();
  const { activeMember, isAdmin: isMemberAdmin } = useMemberContext();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: me } = useProfile();
  const courtCheckinsEnabled = !!(me as any)?.court_checkins_enabled;
  const { data: myClubData } = useMyClub();
  const isFullAdmin = useIsClubAdmin();
  const canBypassBookingLimits = useHasPermission("bookings_unlimited");
  const canBypassNonPeak = useHasPermission("bookings_unlimited_non_peak");
  const canOpsBook = useHasPermission("ops_booking");
  const [opsDialogOpen, setOpsDialogOpen] = useState(false);
  const bookingLimitsBypassed = isFullAdmin || canBypassBookingLimits;
  const myClub = myClubData?.club;
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);
  const externalProvider = ((myClub as any)?.external_booking_provider as string | null) ||
    ((myClub as any)?.uses_gobook ? "gobook" : null);
  const externalUrl = ((myClub as any)?.external_booking_url as string | undefined) ||
    ((myClub as any)?.gobook_url as string | undefined);
  const externalLabel = ((myClub as any)?.external_booking_label as string | undefined) ||
    (externalProvider === "gobook" ? "GoBook" : externalProvider === "courtmanager" ? "Court Manager" : "the booking system");
  const usesExternalBooking = !!externalProvider && externalProvider !== "none" && !!externalUrl;
  // Official GoBook API mode: one club-level API account, no member logins.
  const gobookApiMode = externalProvider === "gobook" && !!(myClub as any)?.gobook_api_enabled;
  const bookingProviderActive = gobookApiMode || usesExternalBooking;

  const lightsIntegrationEnabled = !!(myClub as any)?.lights_integration_enabled;
  const lightFeePerHour = lightsIntegrationEnabled ? ((myClub as any)?.light_fee_per_hour ?? 0) : 0;
  const rawSlot = Number((myClub as any)?.booking_slot_minutes);
  const slotMinutes: 30 | 40 | 60 = (rawSlot === 60 ? 60 : rawSlot === 40 ? 40 : 30);
  const maxPeakPerDay = Math.max(1, Number((myClub as any)?.max_peak_bookings_per_day ?? 1));
  const maxBookingsPerDay = Math.max(1, Number((myClub as any)?.max_bookings_per_day ?? 4));
  const dynamicTimeSlots = useMemo(
    () => buildTimeSlots(slotMinutes, (myClub as any)?.booking_open_time, (myClub as any)?.booking_last_slot_time),
    [slotMinutes, (myClub as any)?.booking_open_time, (myClub as any)?.booking_last_slot_time],
  );


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

  // ── Resume a booking that was interrupted by a "top up to book" redirect ──
  // Members were being sent to My Account to pay, and the booking they were in
  // the middle of making was silently lost — they came back having paid with no
  // slot reserved. We stash the intent and re-open it when they return.
  const PENDING_BOOKING_KEY = "sh.pendingBooking";
  const pendingRestoredRef = useRef(false);

  useEffect(() => {
    if (pendingRestoredRef.current) return;
    if (!myClub?.id || !activeMember?.id) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PENDING_BOOKING_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    pendingRestoredRef.current = true;
    try {
      localStorage.removeItem(PENDING_BOOKING_KEY);
      const p = JSON.parse(raw);
      if (p?.clubId !== myClub.id || p?.memberId !== activeMember.id) return;
      const todayStr = format(new Date(), "yyyy-MM-dd");
      if (!p?.dateStr || p.dateStr < todayStr) return;
      const parsed = new Date(`${p.dateStr}T00:00:00`);
      if (!isNaN(parsed.getTime())) setSelectedDate(parsed);
      setBookingDialog(p.dialog);
      toast.info("Welcome back — tap Confirm Booking to finish reserving your slot.");
    } catch {
      /* ignore malformed intent */
    }
  }, [myClub?.id, activeMember?.id]);

  const { data: clubData } = useMyClub();
  const bookingClubId = clubData?.club?.id;
  /** Visitors are local guests unless the club opted back into home clubs. */
  const showVisitorHomeClub = !!(clubData?.club as any)?.visitor_home_clubs_enabled;
  const { data: bookings, isLoading } = useBookings(dateStr, bookingClubId);
  const [terminatingSession, setTerminatingSession] = useState(false);
  const [transferDialog, setTransferDialog] = useState<{ sessionId: string; currentCourtId: number } | null>(null);
  const [confirmEndSession, setConfirmEndSession] = useState<string | null>(null);
  const [syncingGobook, setSyncingGobook] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [cancellingGobook, setCancellingGobook] = useState(false);
  const [moveSource, setMoveSource] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const handleSyncGobook = async () => {
    if (gobookApiMode) {
      await syncGobookApiDay(dateStr, { notify: true });
      return;
    }
    if (!myClub?.id) return;
    setSyncingGobook(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-sync", {
        body: { club_id: myClub.id, days: 14 },
      });
      if (error) throw error;
      const r = data as { synced?: number; cancelled?: number; skipped_reason?: string };
      if (r?.skipped_reason) {
        toast.error(`GoBook sync skipped: ${r.skipped_reason.replace(/_/g, " ")}`);
      } else {
        toast.success(`GoBook synced — ${r?.synced ?? 0} bookings, ${r?.cancelled ?? 0} cancellations`);
        await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      }
    } catch (e: any) {
      toast.error(e?.message || "GoBook sync failed");
    } finally {
      setSyncingGobook(false);
    }
  };

  /**
   * Official GoBook API mode: mirror one day of GoBook occupancy into the core
   * bookings grid. The native calendar stays the only booking surface — this
   * only imports external rows (with the booker's name) so the grid is truthful.
   */
  const syncGobookApiDay = async (day: string, opts: { notify?: boolean } = {}) => {
    if (!myClub?.id) return;
    setSyncingGobook(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: { action: "sync_core_day", club_id: myClub.id, booking_date: day },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      if (opts.notify) {
        toast.success(`GoBook refreshed — ${(data as any)?.synced ?? 0} bookings on ${day}`);
      }
    } catch (e: any) {
      if (opts.notify) toast.error(e?.message || "Could not refresh from GoBook");
    } finally {
      setSyncingGobook(false);
    }
  };

  // Keep the visible day in step with GoBook while API mode is on.
  const gobookSyncedDayRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gobookApiMode || !myClub?.id) return;
    const key = `${myClub.id}:${dateStr}`;
    if (gobookSyncedDayRef.current === key) return;
    gobookSyncedDayRef.current = key;
    void syncGobookApiDay(dateStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gobookApiMode, myClub?.id, dateStr]);


  // Does the current member have GoBook credentials saved? Drives the banner.
  const { data: gobookCredInfo, isLoading: gobookCredInfoLoading } = useQuery({
    queryKey: ["member-gobook-cred-info", activeMember?.id, user?.id],
    enabled: (!!activeMember?.id || !!user?.id) && !!(myClub as any)?.uses_gobook,
    queryFn: async () => {
      // Use the GoBook backend helper first because it uses the same member
      // ownership check as saving/booking credentials. This avoids the Courts
      // banner showing the setup prompt while the direct table read is blocked
      // or still settling after sign-in.
      if (activeMember?.id) {
        const { data, error } = await supabase.functions.invoke("gobook-book", {
          body: { action: "get_credentials_meta", club_member_id: activeMember.id },
        });
        if (!error && (data as any)?.has_credentials) {
          return {
            club_member_id: activeMember.id,
            user_id: user?.id ?? null,
            last_verification_status: (data as any).last_verification_status ?? null,
            last_verified_at: (data as any).last_verified_at ?? null,
            is_sync_source: true,
          };
        }
      }
      if (user?.id) {
        const { data, error } = await supabase
          .from("member_gobook_credentials")
          .select("club_member_id, user_id, last_verification_status, last_verified_at, is_sync_source")
          .eq("user_id", user.id)
          .eq("is_sync_source", true)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data ?? null;
      }
      return null;
    },
    refetchInterval: 60_000,
  });
  const hasGobookCreds = !!gobookCredInfo;
  const gobookCredsInvalid =
    !!gobookCredInfo && gobookCredInfo.last_verification_status === "invalid";
  // GoBook's own login captcha — the member's credentials are fine, so this
  // gets its own (non-destructive) banner instead of "your login is invalid".
  const gobookCaptchaBlocked =
    !!gobookCredInfo && gobookCredInfo.last_verification_status === "captcha_blocked";

  /**
   * Who may move or cancel a GoBook-sourced booking from the core grid.
   * Imported rows that could not be matched to a member belong to someone
   * outside SquashHub, so only club admins may touch them. Both Move and
   * Cancel share this so a "move" (cancel + rebook) can never bypass it.
   */
  const gobookRowPermission = (bd: any) => {
    const rowMemberId = bd?.club_member_id ? String(bd.club_member_id) : "";
    const isClubAdmin = !!(isMemberAdmin || isSuperAdmin);
    const memberId = gobookApiMode
      ? (isClubAdmin && rowMemberId ? rowMemberId : String(activeMember?.id || ""))
      : String((gobookCredInfo as any)?.club_member_id || activeMember?.id || "");
    const ownsBooking = !!memberId && !!rowMemberId && rowMemberId === memberId;
    const externalBookingId = String(bd?.external_id || "").match(/^gobook:(\d+)$/)?.[1] || "";
    const startMs = new Date(`${bd?.date}T${String(bd?.start_time || "00:00").slice(0, 5)}:00+02:00`).getTime();
    const withinHour = !Number.isNaN(startMs) && startMs - Date.now() < 60 * 60 * 1000;

    const reason = !gobookApiMode && !hasGobookCreds
      ? "Save your GoBook login under Profile first."
      : !ownsBooking && !isClubAdmin
        ? rowMemberId
          ? "Only the member who made this booking (or a club admin) can change it."
          : "This booking was made outside SquashHub. Only a club admin can change it here."
        : gobookApiMode && !externalBookingId
          ? "This booking has no GoBook reference yet. Refresh from GoBook and try again."
          : withinHour
            ? "GoBook does not allow changes within 1 hour of the booking start time."
            : null;

    return { memberId, externalBookingId, allowed: !reason, reason };
  };



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
          is_bye,
          player_a:player_a_member_id(name, user_id, profiles:user_id(name)),
          player_b:player_b_member_id(name, user_id, profiles:user_id(name)),
          partner_a:partner_a_member_id(name, user_id, profiles:user_id(name)),
          partner_b:partner_b_member_id(name, user_id, profiles:user_id(name)),
          group_number,
          champ:champ_id(name, group_labels, match_duration_minutes, group_durations, rules:tournament_rules(scoring_mode))
        `)
        .eq("scheduled_date", dateStr)
        .not("court_id", "is", null)
        .not("scheduled_time", "is", null);

      if (error) throw error;

      return (data || []).map((m: any) => {
        const tournamentName = m.champ?.name || "Tournament";
        const start = String(m.scheduled_time || "").slice(0, 5);
        const champRules = Array.isArray(m.champ?.rules) ? m.champ?.rules[0] : m.champ?.rules;
        const isBellsMode = champRules?.scoring_mode === "time_capped_points";
        const groupDurations = (m.champ?.group_durations || {}) as Record<string, number>;
        const duration = isBellsMode
          ? Number(groupDurations[String(m.group_number)] || m.champ?.match_duration_minutes) || 30
          : Number(m.champ?.match_duration_minutes) || 30;
        const end = addMinutesToTime(start, duration);
        // Names come from the linked match, so they stay correct even if a
        // member is renamed after the booking was made.
        const label = champMatchToBookingLabel(m, {
          champName: tournamentName,
          divisionLabel: m.group_number != null ? getGroupLabel(m.champ, m.group_number) : null,
        });

        return {
          id: `champ-${m.id}`,
          court_id: m.court_id,
          date: m.scheduled_date,
          start_time: `${start}:00`,
          end_time: `${end}:00`,
          status: "active",
          user_id: null,
          opponent_id: null,
          is_friendly: false,
          is_champ: true,
          champ_match_id: m.id,
          champ_title: label.title,
          champ_compact_title: label.compactTitle,
          champ_context: label.context,
          guest_name: label.title,
          player_name: label.title,
          opponent_name: null,
          source: "club_event",
          player_rank: null,
          opponent_rank: null,
          created_at: null,
        };
      });
    },
    enabled: !!dateStr,
  });


  const allCourtBookings = useMemo(() => {
    const normalBookings = ((bookings as any[] | undefined) || []).filter(
      (b: any) => !b.status || b.status === "active"
    );
    const merged = new Map<string, any>();
    const overlaps = (a: any, b: any) => {
      if (a.court_id !== b.court_id || a.date !== b.date) return false;
      const aStart = timeToMinutes(String(a.start_time || "").slice(0, 5));
      const aEnd = timeToMinutes(String(a.end_time || "").slice(0, 5));
      const bStart = timeToMinutes(String(b.start_time || "").slice(0, 5));
      const bEnd = timeToMinutes(String(b.end_time || "").slice(0, 5));
      return aStart < bEnd && bStart < aEnd;
    };

    for (const b of normalBookings) {
      const key = `${b.court_id}-${String(b.start_time || "").slice(0, 5)}-${String(b.end_time || "").slice(0, 5)}`;
      const extId = String(b.external_id || "");
      const isSavedTournamentBlock = b.source === "club_event" && extId.startsWith("champ:");
      // Player-scheduled tournament bookings carry the match id
      // (`champ:<champId>:match:<matchId>`) — resolve those by id first so the
      // names always belong to the right fixture, then fall back to overlap.
      const linkedMatchId = extId.includes(":match:") ? extId.split(":match:")[1] : null;
      const matchingTournament = isSavedTournamentBlock
        ? (linkedMatchId
            ? (champsBookings as any[]).find((cb: any) => cb.champ_match_id === linkedMatchId)
            : null) || (champsBookings as any[]).find((cb: any) => overlaps(b, cb))
        : null;
      if (!matchingTournament) {
        merged.set(key, b);
        continue;
      }
      // A directly linked match is authoritative; an overlapping court block
      // only fills in a title when the booking has none of its own.
      const adoptNames = !!linkedMatchId || !b.guest_name;
      merged.set(key, {
        ...b,
        is_champ: true,
        champ_match_id: matchingTournament.champ_match_id,
        champ_title: matchingTournament.champ_title,
        champ_compact_title: matchingTournament.champ_compact_title,
        champ_context: matchingTournament.champ_context,
        guest_name: adoptNames ? matchingTournament.champ_title : b.guest_name,
        player_name: b.player_name || matchingTournament.champ_title,
      });
    }


    for (const cb of champsBookings as any[]) {
      const key = `${cb.court_id}-${String(cb.start_time || "").slice(0, 5)}-${String(cb.end_time || "").slice(0, 5)}`;
      if (!merged.has(key)) merged.set(key, cb);
    }

    return Array.from(merged.values());
  }, [bookings, champsBookings]);

  const createBooking = useCreateBooking();
  const accessGate = useMemberAccessGate();
  const createChallenge = useCreateChallenge();
  const cancelBooking = useCancelBooking();

  // Load courts dynamically from database
  const { data: courtsData } = useQuery({
    queryKey: ["courts-list", bookingClubId],
    queryFn: async () => {
      let q = supabase.from("courts").select("id, name").eq("is_external", false).order("id");
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
    if (accessGate.isBlocked("bookings")) {
      toast.error(accessGate.reason || "Account suspended — settle outstanding fees to book courts.");
      return;
    }
    // Enforce club-level visitor booking permission
    const isVisitorRole = String((activeMember as any)?.role || "").toLowerCase() === "visitor";
    if (isVisitorRole && !(myClub as any)?.visitors_can_book) {
      toast.error("Visitor bookings aren't enabled at this club. Please ask a member or the club admin to book on your behalf.");
      return;
    }
    const endTime = addMinutesToTime(bookingDialog.time, bookingDialog.duration);
    const bookingId = crypto.randomUUID();

    // Helpers for per-day caps (per-player, also counting opponent slots)
    const isLeagueGuest = (s: any) =>
      typeof s === "string" && /\bleague\b|\bround\s*\d/i.test(s);
    const bookingsFor = (memberId?: string | null, userId?: string | null) =>
      (bookings || []).filter((b: any) => {
        if (b.status && b.status !== "active") return false;
        if (isLeagueGuest(b.guest_name)) return false;
        return (
          (memberId && (b.club_member_id === memberId || b.opponent_member_id === memberId)) ||
          (userId && (b.user_id === userId || b.opponent_id === userId))
        );
      });

    const opp = bookingDialog.opponentId
      ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId)
      : null;

    // 1. Enforce total-per-day cap (skipped for club admins / delegates / super-admins
    //    and for non-peak slots when the member has bookings_unlimited_non_peak)
    const isPeak = isPeakSlot(selectedDate, bookingDialog.time, myClub);
    const limitsApply = !bookingLimitsBypassed && !(canBypassNonPeak && !isPeak);
    if (limitsApply) {
      const myTotal = bookingsFor(activeMember?.id, user?.id).length;
      if (myTotal >= maxBookingsPerDay) {
        toast.error(`Daily booking limit reached (max ${maxBookingsPerDay} per day).`);
        return;
      }
      if (opp) {
        const oppTotal = bookingsFor((opp as any).memberId, (opp as any).id).length;
        if (oppTotal >= maxBookingsPerDay) {
          toast.error(`${(opp as any).name || "Your opponent"} has reached the daily booking limit (max ${maxBookingsPerDay} per day).`);
          return;
        }
      }

      // 1b. Optional "no back-to-back slots" rule — a member may play twice in a
      //     day (morning and evening) but not take two slots directly in a row.
      if ((myClub as any)?.block_back_to_back_bookings) {
        const toMin = (t: string) => {
          const [h, m] = String(t).slice(0, 5).split(":").map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const newStart = toMin(bookingDialog.time);
        const newEnd = newStart + slotMinutes;
        const adjacent = (memberId?: string | null, userId?: string | null) =>
          bookingsFor(memberId, userId).some((b: any) => {
            if (b.date && b.date !== dateStr) return false;
            const s = toMin(String(b.start_time || ""));
            const e = b.end_time ? toMin(String(b.end_time)) : s + slotMinutes;
            return e === newStart || s === newEnd;
          });
        if (adjacent(activeMember?.id, user?.id)) {
          toast.error("Back-to-back slots aren't allowed — pick a slot later in the day.");
          return;
        }
        if (opp && adjacent((opp as any).memberId, (opp as any).id)) {
          toast.error(`${(opp as any).name || "Your opponent"} already has a booking directly before or after this slot.`);
          return;
        }
      }

      // 2. Enforce peak-hour cap
      if (isPeak) {
        const peakCountFor = (memberId?: string | null, userId?: string | null) =>
          bookingsFor(memberId, userId).filter((b: any) =>
            isPeakSlot(selectedDate, String(b.start_time || ""), myClub)
          ).length;

        if (peakCountFor(activeMember?.id, user?.id) >= maxPeakPerDay) {
          toast.error(`Peak-hour limit reached (max ${maxPeakPerDay} per day).`);
          return;
        }
        if (opp && peakCountFor((opp as any).memberId, (opp as any).id) >= maxPeakPerDay) {
          toast.error(`${(opp as any).name || "Your opponent"} has already reached the peak-hour limit (max ${maxPeakPerDay} per day).`);
          return;
        }
      }
    }

    // 3. Minimum-balance gate — applies to ALL members, including club admins.
    //    Only super-admins (platform staff) bypass; club admins like Daniel must
    //    keep the club's required booking buffer just like any other member.
    //    Always call the gate — it re-reads the club's current min_booking_balance from the DB,
    //    so a stale cached club value can't silently bypass the check.
    console.log("[booking-balance] gate entry", {
      isSuperAdmin,
      isFullAdmin,
      activeMemberId: activeMember?.id,
      clubId: myClub?.id,
      cachedMinBalance: (myClub as any)?.min_booking_balance,
    });
    if (!isSuperAdmin && activeMember?.id && myClub?.id) {
      try {
        const check = await checkBookingBalance({
          clubMemberId: activeMember.id,
          clubId: myClub.id,
          minBookingBalance: (myClub as any)?.min_booking_balance ?? null,
        });
        console.log("[booking-balance] gate result", check);
        if (!check.allowed) {
          // Remember the slot so it can be resumed after the top-up.
          try {
            localStorage.setItem(
              PENDING_BOOKING_KEY,
              JSON.stringify({
                clubId: myClub.id,
                memberId: activeMember.id,
                dateStr,
                dialog: bookingDialog,
                savedAt: Date.now(),
              }),
            );
          } catch {
            /* storage unavailable — prompt still shows */
          }
          setTopUpPrompt({
            open: true,
            shortfall: check.shortfall,
            currentOwing: check.currentOwing,
            planAllowedDebt: check.planAllowedDebt,
            requiredBuffer: check.requiredBuffer,
          });
          return;
        }

      } catch (e) {
        console.error("[booking-balance] check failed, allowing booking:", e);
      }
    }





    setSubmittingBooking(true);
    const usingGobook =
      !!(myClub as any)?.uses_gobook &&
      ((myClub as any)?.booking_slot_minutes ?? 60) === 60 &&
      !!activeMember?.id;
    const usingGobookApi = usingGobook && gobookApiMode;
    const progressToastId = usingGobook
      ? toast.loading(usingGobookApi ? "Submitting booking to GoBook…" : "Submitting booking to GoBook…", {
          description: "This can take 10–20 seconds. Please don't close this window.",
        })
      : null;
    let bookingSucceeded = false;
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
      let gobookMirror: { court: number; externalId: string; externalBookerName: string | null } | null = null;

      if (usingGobook) {
        if (!myClub?.id) throw new Error("No active club selected");
        const selectedCourt = courtsData?.find((c: any) => c.id === bookingDialog.courtId);
        if (usingGobookApi && !selectedCourt) throw new Error("The selected court is unavailable");
        const labelA = (activeMember as any)?.name || (activeMember as any)?.full_name || "";
        const labelB = (bookingDialog.opponentId
          ? (availablePlayers || []).find((p: any) => p.id === bookingDialog.opponentId)?.name
          : null) || bookingDialog.guestName || "";
        const notes = [labelA, labelB].filter(Boolean).join(" v ").slice(0, 200);
        let data: any;
        let error: any;
        if (usingGobookApi) {
          ({ data, error } = await supabase.functions.invoke("gobook-api", {
            body: {
              action: "book",
              club_id: myClub.id,
              club_member_id: activeMember.id,
              booking_date: dateStr,
              court_id: bookingDialog.courtId,
              start_time: bookingDialog.time,
              end_time: endTime,
              notes,
            },
          }));
        } else {
          const courtNum = Number(String(selectedCourt?.name || "").match(/(\d+)/)?.[1] || 0);
          ({ data, error } = await supabase.functions.invoke("gobook-book", {
            body: { action: "book", club_member_id: activeMember.id, date: dateStr, start_hour: Number(String(bookingDialog.time).split(":")[0]), court: courtNum || "any", notes, sms: false, email: false },
          }));
        }
        const msg = await extractFunctionError(data, error);
        if (msg) throw new Error(`GoBook booking failed: ${msg}`);
        const bookedId = usingGobookApi ? (data as any)?.bookingId : null;
        // In official API mode a booking without a provider id could never be
        // cancelled or moved later, so we refuse to mirror it locally.
        if (usingGobookApi && !bookedId) {
          throw new Error("GoBook did not return a booking reference. Refresh the grid to check whether the slot was taken.");
        }
        gobookMirror = {
          court: Number((data as any)?.court || selectedCourt?.id || 0),
          externalId: bookedId ? `gobook:${bookedId}` : `${dateStr.replace(/-/g, "")}-${String((data as any)?.court || 0)}-${String(bookingDialog.time).replace(":", "")}`,
          externalBookerName: labelA || null,
        };
      }

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
        source: gobookMirror ? "gobook" : "squashhub",
        externalId: gobookMirror?.externalId ?? null,
        externalBookerName: gobookMirror?.externalBookerName ?? null,
      });

      // Mark lights_requested and fee split on the booking
      if (lightsIntegrationEnabled && bookingDialog.lightsOn && user?.id) {
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

      bookingSucceeded = true;
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
    } finally {
      if (progressToastId !== null) {
        toast.dismiss(progressToastId);
        if (usingGobook && bookingSucceeded) {
          toast.success("Booking confirmed on GoBook");
          try {
            if (usingGobookApi) {
              await syncGobookApiDay(dateStr);
            } else {
              setSyncingGobook(true);
              await supabase.functions.invoke("gobook-sync", { body: { mode: "pull_today" } });
              queryClient.invalidateQueries({ queryKey: ["bookings"] });
              queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
            }
          } catch {
            // non-fatal — the manual refresh action remains available
          } finally {
            if (!usingGobookApi) setSyncingGobook(false);
          }
        }
      }
      // A "move" is always: reserve the new slot first, then release the old one.
      // We only reach here once the replacement booking succeeded, so a failure
      // below leaves the member with the new slot and a clear warning about the
      // original — never a silently lost booking.
      if (bookingSucceeded && moveSource) {
        const src: any = moveSource;
        try {
          if (src.source === "gobook") {
            const externalBookingId = String(src.external_id || "").match(/^gobook:(\d+)$/)?.[1] || "";
            // Official API mode uses the club-level account, so the signed-in
            // member identifies the booking owner. Legacy mode keeps the saved
            // personal GoBook credentials.
            const cancelMemberId = gobookApiMode
              ? String(activeMember?.id || "")
              : String((gobookCredInfo as any)?.club_member_id || activeMember?.id || "");
            if (gobookApiMode && !externalBookingId) {
              throw new Error("the original booking has no GoBook reference yet — refresh the grid and cancel it manually");
            }
            const t = toast.loading("Cancelling original GoBook slot…");
            const { data, error } = await supabase.functions.invoke(gobookApiMode ? "gobook-api" : "gobook-book", {
              body: gobookApiMode
                ? { action: "cancel", club_id: myClub?.id, club_member_id: cancelMemberId, booking_id: externalBookingId }
                : { action: "cancel", club_member_id: cancelMemberId, booking_id: src.id },
            });
            toast.dismiss(t);
            const msg = await extractFunctionError(data, error);
            if (msg) throw new Error(msg);
            if (gobookApiMode) {
              // Release the local mirror straight away so the vacated slot is
              // bookable again without waiting for the next provider sync.
              await fromExt("bookings").update({ status: "cancelled" }).eq("id", src.id).eq("source", "gobook");
            }
            toast.success("Booking moved — original GoBook slot cancelled");
          } else {
            await cancelBooking.mutateAsync(String(src.id));
            toast.success("Booking moved");
          }
          if (gobookApiMode) await syncGobookApiDay(dateStr);
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
          queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
        } catch (e: any) {
          toast.error(`Moved to new slot, but failed to cancel the original: ${e?.message || e}. Please cancel it manually.`);
        } finally {
          setMoveSource(null);
        }
      }
      setSubmittingBooking(false);
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
      <MemberSuspensionBanner />
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

      {/* GoBook API mode: no separate calendar — the core grid below IS the
          calendar. GoBook occupancy is mirrored into it, including booker names. */}
      {gobookApiMode && externalProvider === "gobook" && (
        <div className="px-4 mt-3">
          <Card className="border-emerald-500/40 bg-emerald-500/10">
            <CardContent className="p-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                {syncingGobook ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">GoBook courts are live in this grid</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  Bookings made on GoBook show below with the booker's name, and booking here
                  reserves the slot on GoBook too. No GoBook login needed.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={syncingGobook} onClick={() => syncGobookApiDay(dateStr, { notify: true })}>
                    {syncingGobook ? "Refreshing…" : "Refresh from GoBook"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {usesExternalBooking && !gobookApiMode && externalProvider === "gobook" && (
        <div className="px-4 mt-3">
          <Card className={hasGobookCreds ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}>
            <CardContent className="p-3 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasGobookCreds ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
                {gobookCredInfoLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600 dark:text-amber-400" />
                ) : hasGobookCreds ? (
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {gobookCredInfoLoading
                    ? "Checking your GoBook connection…"
                    : hasGobookCreds
                    ? "Two-way sync with GoBook is active"
                    : "Connect your GoBook account to enable two-way sync"}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  {gobookCredInfoLoading
                    ? "Please wait while SquashHub checks your saved GoBook login."
                    : hasGobookCreds
                    ? "Book courts here and we'll push them to GoBook under your account. Bookings made on GoBook also appear in the grid below."
                    : "Go to Profile → GoBook and enter your GoBook login. Until then, bookings made here won't be pushed to GoBook."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!gobookCredInfoLoading && !hasGobookCreds && (
                    <Button size="sm" onClick={() => navigate("/profile")}>
                      Add GoBook details
                    </Button>
                  )}
                  {hasGobookCreds && (isMemberAdmin || isSuperAdmin) && (
                    <Button
                      size="sm"
                      disabled={syncingGobook || ((myClub as any)?.booking_slot_minutes ?? 60) !== 60}
                      onClick={handleSyncGobook}
                      title={((myClub as any)?.booking_slot_minutes ?? 60) !== 60 ? "GoBook requires hourly slots" : undefined}
                    >
                      {syncingGobook ? "Syncing…" : "Sync GoBook now"}
                    </Button>
                  )}

                  {externalUrl && (
                    <Button size="sm" variant="outline" onClick={() => openExternalUrl(externalUrl)}>
                      Open GoBook
                    </Button>
                  )}
                  {hasGobookCreds && isSuperAdmin && activeMember?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const t = toast.loading("Fetching GoBook /MyBookings…");
                        try {
                          const { data, error } = await supabase.functions.invoke("gobook-book", {
                            body: { action: "debug_my_bookings", club_member_id: activeMember.id },
                          });
                          toast.dismiss(t);
                          if (error || (data as any)?.error) {
                            throw new Error((data as any)?.error || error?.message || "Debug failed");
                          }
                          console.log("[gobook debug_my_bookings]", data);
                          const probes = (data as any)?.probes || [];
                          const ok = probes.find((p: any) => p.status === 200);
                          toast.success(`Got ${probes.length} probes — see console (${ok ? ok.path + " 200" : "no 200"})`);
                        } catch (e: any) {
                          toast.dismiss(t);
                          toast.error(e?.message || "Debug failed");
                        }
                      }}
                    >
                      Debug GoBook
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* GoBook credentials invalid — last sync attempt failed for this member */}
      {usesExternalBooking && !gobookApiMode && externalProvider === "gobook" && gobookCredsInvalid && (
        <div className="px-4 mt-2">
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-destructive">
                  Your saved GoBook login is no longer valid
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  The last sync attempt with your GoBook credentials failed. Bookings in
                  the grid may be out of date until you re-enter your password under
                  Profile → GoBook. No GoBook bookings will be cancelled while the
                  login is invalid.
                </p>
                <div className="mt-2">
                  <Button size="sm" variant="destructive" onClick={() => navigate("/profile")}>
                    Fix GoBook login
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {usesExternalBooking && !gobookApiMode && externalProvider === "gobook" && gobookCaptchaBlocked && (
        <div className="px-4 mt-2">
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardContent className="p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-700">
                  GoBook sync is blocked by a captcha
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  gobook.co.za has added an "I'm not a robot" check to its login page,
                  so SquashHub can no longer sign in on your behalf. Your GoBook
                  username and password are still correct — re-entering them will not
                  help. Book directly on gobook.co.za until GoBook allows SquashHub
                  through.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Move-booking banner */}
      {moveSource && (
        <div className="px-4 mt-3">
          <Card className="border-primary/50 bg-primary/10">
            <CardContent className="p-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  Moving booking — pick a new empty slot below
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  {`From ${getCourtName((moveSource as any).court_id) || "court"} · ${String((moveSource as any).date)} ${String((moveSource as any).start_time || "").slice(0,5)}`}
                  {(moveSource as any).source === "gobook" ? " (GoBook)" : ""}.
                  {" "}We'll create the new booking, then cancel the original automatically.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setMoveSource(null)}>Cancel move</Button>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Other external providers (non-GoBook) — still read-only deep-link */}
      {usesExternalBooking && externalProvider !== "gobook" && (
        <div className="px-4 mt-3">
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="p-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {(myClub as any)?.name || "Your club"} uses {externalLabel} for court bookings
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  All bookings must be made on{" "}
                  <span className="font-medium text-foreground">{externalLabel}</span> using your existing credentials. Bookings made there will not appear on the schedule below.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openExternalUrl(externalUrl!)}>
                    Open {externalLabel}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No courts configured yet */}
      {!bookingProviderActive && courts.length === 0 && (
        <div className="px-4 mt-3">
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="p-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Court bookings aren't activated yet</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  {(myClub as any)?.name || "Your club"} hasn't set up courts in the app yet. This usually
                  means the club either uses an{" "}
                  <span className="font-medium text-foreground">external booking system</span> (like
                  Court Manager or GoBook), or the{" "}
                  <span className="font-medium text-foreground">smart lighting / court integration</span>{" "}
                  hasn't been switched on. Please book your court through your club's usual channel for now —
                  ask a club admin if you're not sure where to book.
                </p>
              </div>
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
        <div className="px-4 mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 backdrop-blur-sm px-3 py-1 text-xs">
            <CalendarCheck className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold tabular-nums">{dayBookingsCount}</span>
            <span className="text-muted-foreground">bookings</span>
          </div>
          {isFullAdmin && myClub?.id && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setBulkLeagueOpen(true)}
            >
              <CalendarCheck className="w-3.5 h-3.5 mr-1" />
              Bulk book league fixtures
            </Button>
          )}
          {canOpsBook && myClub?.id && (courtsData?.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setOpsDialogOpen(true)}
            >
              <Wrench className="w-3.5 h-3.5 mr-1" />
              Maintenance / Cleaning
            </Button>
          )}
        </div>
      )}
      <DateChips selectedDate={selectedDate} onSelect={setSelectedDate} isAdmin={isMemberAdmin} isSuperAdmin={isSuperAdmin} />
      {isFullAdmin && myClub?.id && (
        <BulkLeagueBookingsDialog open={bulkLeagueOpen} onOpenChange={setBulkLeagueOpen} clubId={myClub.id} />
      )}
      {canOpsBook && myClub?.id && (
        <OpsBookingDialog
          open={opsDialogOpen}
          onOpenChange={setOpsDialogOpen}
          clubId={myClub.id}
          courts={(courtsData || []) as any}
          defaultDate={selectedDate}
        />
      )}

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
            // For 40-min clubs, slots don't align to the hour, so label every
            // row and skip the hourly separator rule to avoid drift.
            const showTimeLabel = slotMinutes === 40 ? true : isHour;
            const showHourSeparator = slotMinutes !== 40 && isHour && idx !== 0;
            return (
              <div
                key={time}
                className={cn(
                  "gap-x-1.5",
                  showHourSeparator && "pt-1.5 mt-1.5 border-t border-border/40"
                )}
                style={{ display: "grid", gridTemplateColumns: `60px repeat(${courts.length}, 1fr)` }}
              >
                <div className={cn(
                  "text-[10px] flex items-center justify-end pr-1.5 font-medium tabular-nums",
                  showTimeLabel ? "text-foreground/70" : "text-muted-foreground/40"
                )}>
                  {showTimeLabel ? formatTimeDisplay(time) : ""}
                </div>
                {courts.map((courtId) => {
                  const booking = getBooking(courtId, time);
                  // Event bookings are club bookings with a guest_name acting as event title.
                  // League fixture bookings also use guest_name as the title (e.g. "Round 1 - Baobabs vs Cobras").
                  const rawGuestName = (booking as any)?.guest_name ? String((booking as any).guest_name) : "";
                  const isLeagueBooking = /\bleague\b|\bround\s*\d/i.test(rawGuestName);
                  // Event bookings created by CreateClubEvent use a "Club — Title" guest_name.
                  // The em-dash separator is our reliable marker since `is_club_booking`
                  // is not a real column on the bookings table.
                  const looksLikeEventTitle = rawGuestName.includes(" — ");
                  const isTournamentBooking = !!(booking as any)?.is_champ || String((booking as any)?.external_id || "").startsWith("champ:");
                  const isClubEventBooking = (booking as any)?.source === "club_event" && (!!rawGuestName || isTournamentBooking);
                  const isEventBooking = isClubEventBooking || isTournamentBooking || (!!(booking as any)?.is_club_booking && !!rawGuestName) || isLeagueBooking || looksLikeEventTitle;
                  // Normalise league fixture titles to a consistent compact format:
                  //   "<League ordinal> R<round> · Team A vs Team B"
                  // Source guest_names vary: "League - A vs B", "2nd League round 1 - A vs B", etc.
                  const formatLeagueLabel = (raw: string): string => {
                    const dashIdx = raw.indexOf(" - ");
                    const head = (dashIdx >= 0 ? raw.slice(0, dashIdx) : raw).trim();
                    const matchup = dashIdx >= 0 ? raw.slice(dashIdx + 3).trim() : "";
                    // Extract league ordinal (1st/2nd/3rd/Nth or numeric); default to 1st
                    const ordMatch = head.match(/(\d+)(?:st|nd|rd|th)?/i);
                    const leagueNum = ordMatch ? parseInt(ordMatch[1], 10) : 1;
                    const ord = (n: number) => {
                      const s = ["th", "st", "nd", "rd"];
                      const v = n % 100;
                      return n + (s[(v - 20) % 10] || s[v] || s[0]);
                    };
                    const roundMatch = head.match(/round\s*(\d+)/i);
                    const roundPart = roundMatch ? ` R${roundMatch[1]}` : "";
                    const prefix = `${ord(leagueNum)} League${roundPart}`;
                    return matchup ? `${prefix} · ${matchup}` : prefix;
                  };
                  // Tournament match bookings show the competitors; the
                  // competition name/division moves to secondary text.
                  const champCompact = (booking as any)?.champ_compact_title as string | undefined;
                  const champFull = (booking as any)?.champ_title as string | undefined;
                  const champContext = (booking as any)?.champ_context as string | undefined;
                  const eventLabel = isEventBooking
                    ? (champCompact
                        || (isLeagueBooking ? formatLeagueLabel(rawGuestName) : (rawGuestName || (booking as any)?.player_name || "Tournament")))
                    : null;

                  const a = (booking as any)?.player_name ? toInitialSurname(String((booking as any).player_name)) : null;
                  const b = !isEventBooking && (booking as any)?.opponent_name ? toInitialSurname(String((booking as any).opponent_name)) : null;
                  const isMine = booking && ((booking as any).user_id === user?.id || (booking as any).opponent_id === user?.id);
                  const isBlocked = !!(booking as any)?.is_blocked;
                  const blockReason = (booking as any)?.block_reason ? String((booking as any).block_reason) : "";

                  // A slot is considered "past" only once it has fully ended — so the
                  // currently-running slot (e.g. 08:00 at 08:05) is still bookable for
                  // walk-ups who didn't pre-book.
                  const slotDateTime = new Date(`${dateStr}T${time}:00`);
                  const slotEndDateTime = new Date(slotDateTime.getTime() + slotMinutes * 60000);
                  const isPastSlot = slotEndDateTime <= new Date();
                  const isPeak = isPeakSlot(selectedDate, time, myClub);

                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.div
                          whileTap={isPastSlot && !booking ? undefined : { scale: 0.97 }}
                          className={cn(
                            "relative h-10 min-w-0 overflow-hidden rounded-lg flex items-center justify-center text-xs transition-all border",
                            isPastSlot && !booking
                              ? "bg-muted/40 border-border/30 cursor-not-allowed opacity-50"
                              : booking
                                ? isMine
                                  ? "bg-primary/20 border-primary/60 hover:bg-primary/30 text-primary-foreground cursor-pointer shadow-sm shadow-primary/20"
                                  : "bg-card/80 border-border/50 hover:bg-card hover:border-border cursor-pointer"
                                : "border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/15 hover:border-emerald-400/60 text-emerald-200/90 cursor-pointer"
                          )}
                          onClick={() => {
                            if (isPastSlot && !booking) return;
                            if (booking) { setBookingDetails(booking); return; }
                            // For non-GoBook external providers, redirect.
                            // GoBook clubs book in-app and silently push to GoBook.
                            if (usesExternalBooking && externalProvider !== "gobook" && externalUrl) {
                              toast.info(`Opening ${externalLabel} to complete your booking…`);
                              openExternalUrl(externalUrl);
                              return;
                            }

                            // When in "move" mode, prefill duration from the source booking so we re-book the same length
                            let prefillDuration = slotMinutes;
                            if (moveSource) {
                              const s = String((moveSource as any).start_time || "").slice(0,5);
                              const e = String((moveSource as any).end_time || "").slice(0,5);
                              if (s && e) {
                                const [sh, sm] = s.split(":").map(Number);
                                const [eh, em] = e.split(":").map(Number);
                                const mins = (eh * 60 + em) - (sh * 60 + sm);
                                if (mins > 0) prefillDuration = mins as any;
                              }
                            }
                            setBookingDialog({ courtId, time, opponentId: "", guestName: "", playerMode: "none", isFriendly: true, duration: prefillDuration, lightsOn: lightsIntegrationEnabled, lightFeeSplit: "booker" });
                          }}
                        >
                          {isPeak && (
                            <span
                              className="absolute top-0.5 right-1 text-[9px] font-bold leading-none px-1 py-0.5 rounded bg-amber-500/80 text-amber-950"
                              title="Peak time"
                            >
                              P
                            </span>
                          )}
                          {booking ? (
                            <div className="px-1.5 w-full min-w-0 text-center leading-tight">
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
                              {!isBlocked && champContext ? (
                                <p className="text-[9px] text-muted-foreground truncate">{champContext}</p>
                              ) : null}
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
                          <p className="font-semibold">{champFull || (isEventBooking ? eventLabel : `${(booking as any).player_name || "Unknown"}${b ? ` vs ${b}` : ""}`)}</p>
                          {champContext ? <p className="text-muted-foreground">{champContext}</p> : null}

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
            <DialogDescription className="sr-only">Court booking details, players, time, and light session information.</DialogDescription>
          </DialogHeader>
          {bookingDetails && (
            <div className="space-y-3 py-2">
              {(bookingDetails as any).champ_title ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="text-sm font-semibold">{(bookingDetails as any).champ_title}</p>
                  {(bookingDetails as any).champ_context ? (
                    <Badge variant="secondary" className="mt-1.5 text-[10px] bg-primary/15 text-primary border-0">
                      {(bookingDetails as any).champ_context}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
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
                      <p>Running for {elapsedMin} min · {money(currentCost)} so far</p>
                      <p>{money(feePerHour)}/hr — charged when session ends</p>
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
              const isBooker = bookingDetails.user_id === user?.id || (!!activeMember?.id && (bookingDetails as any).club_member_id === activeMember.id);
              const isOpponent = !!(user?.id && (bookingDetails as any).opponent_id === user.id);
              const isAdmin = isMemberAdmin;
              const isGoBookBooking = (bookingDetails as any).source === 'gobook';
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
                      <Swords className="w-3.5 h-3.5" /> Enter your result
                    </Button>
                  )}
                  {isBooker && (
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
                  )}
                  {(isBooker || isGoBookBooking) && (() => {
                    const bd: any = bookingDetails;
                    if (isGoBookBooking && !gobookRowPermission(bd).allowed) return null;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setMoveSource(bd);
                          setBookingDetails(null);
                          toast.info("Pick a new empty slot in the grid to move this booking to.");
                        }}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Move
                      </Button>
                    );
                  })()}
                  {(isBooker || isGoBookBooking) && (
                    <>
                      {isGoBookBooking ? (() => {
                        const bd: any = bookingDetails;
                        const permission = gobookRowPermission(bd);
                        const cancelMemberId = permission.memberId;
                        const disabledReason = permission.reason;
                        if (disabledReason) {
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block">
                                  <Button variant="destructive" size="sm" disabled>Cancel</Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[280px] text-xs">
                                <p>{disabledReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return (
                          <Button
                            variant="destructive"
                            size="sm"
                            title="We'll auto-sync GoBook before cancelling. If it still fails, click 'Sync GoBook now' at the top of the page and try again."
                            disabled={cancellingGobook || syncingGobook}
                            onClick={async () => {
                               if (!cancelMemberId) return;
                               const startHour = Number(String(bd.start_time || "00").slice(0, 2));
                               if (gobookApiMode) {
                                const externalBookingId = String(bd.external_id || "").match(/^gobook:(\d+)$/)?.[1] || "";
                                if (!externalBookingId) {
                                  toast.error("This GoBook booking has no provider booking ID yet. Refresh the grid and try again.");
                                  return;
                                }
                                setCancellingGobook(true);
                                const t = toast.loading("Cancelling on GoBook…");
                                try {
                                  const { data, error } = await supabase.functions.invoke("gobook-api", {
                                    body: { action: "cancel", club_id: myClub?.id, club_member_id: cancelMemberId, booking_id: externalBookingId },
                                  });
                                  toast.dismiss(t);
                                  const msg = await extractFunctionError(data, error);
                                  if (msg) throw new Error(`GoBook cancellation failed: ${msg}`);
                                  await fromExt("bookings").update({ status: "cancelled" }).eq("id", bd.id).eq("source", "gobook");
                                  toast.success("Booking cancelled on GoBook");
                                  setBookingDetails(null);
                                  // Re-sync from GoBook so the grid reflects the
                                  // provider's authoritative state immediately.
                                  try { await syncGobookApiDay(String(bd.date)); } catch { /* manual refresh remains available */ }
                                  queryClient.invalidateQueries({ queryKey: ["bookings"] });
                                  queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
                                } catch (e: any) {
                                  toast.dismiss(t);
                                  toast.error(e?.message || "Failed to cancel booking on GoBook");
                                } finally {
                                  setCancellingGobook(false);
                                }
                               } else {
                                 // Legacy scraper mode retains its existing cancellation flow.
                                 const courtName = String(
                                   bd.court?.name
                                   || bd.court_name
                                   || (courtsData || []).find((c: any) => c.id === bd.court_id)?.name
                                   || getCourtName(bd.court_id)
                                   || ""
                                 );
                                 const courtNum = Number((courtName.match(/(\d+)/) || [])[1]);
                                 if (!courtNum) {
                                   toast.error("Couldn't determine the GoBook court number for this booking.");
                                   return;
                                 }
                                 try {
                                   setSyncingGobook(true);
                                   const ts = toast.loading("Syncing with GoBook before cancelling…");
                                   await supabase.functions.invoke("gobook-sync", { body: { mode: "pull_today" } });
                                   toast.dismiss(ts);
                                 } catch {
                                   // non-fatal — proceed with cancellation attempt anyway
                                 } finally {
                                   setSyncingGobook(false);
                                 }
                                 setCancellingGobook(true);
                                const t = toast.loading("Cancelling on GoBook… 5–15 seconds");
                                try {
                                  const { data, error } = await supabase.functions.invoke("gobook-book", {
                                    body: { action: "cancel", club_member_id: cancelMemberId, booking_id: bd.id, client_notes: bd.external_booker_name || bd.player_name || "Cancelled via SquashHub", date: String(bd.date), start_hour: startHour, court: courtNum },
                                  });
                                  toast.dismiss(t);
                                  const msg = await extractFunctionError(data, error);
                                  if (msg) throw new Error(`GoBook cancellation failed: ${msg}`);
                                  toast.success((data as any)?.stale_local ? "Stale booking removed" : "Booking cancelled on GoBook");
                                  setBookingDetails(null);
                                  queryClient.invalidateQueries({ queryKey: ["bookings"] });
                                  queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
                                } catch (e: any) {
                                  toast.dismiss(t);
                                  toast.error(e?.message || "Failed to cancel booking on GoBook");
                                } finally {
                                  setCancellingGobook(false);
                                }
                              }
                            }}
                          >
                            {cancellingGobook ? "Cancelling…" : syncingGobook ? "Syncing…" : "Cancel"}
                          </Button>
                        );
                      })() : (
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
                      )}
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
            <DialogDescription className="sr-only">Confirm the selected court, time, opponent, guest, visitor, and lights options.</DialogDescription>
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
                  {(slotMinutes === 30 ? ([30, 60] as const) : slotMinutes === 40 ? ([40] as const) : ([60] as const)).map((d) => (
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
                              const home = (v.home_club_name || "").trim();
                              const showHome = showVisitorHomeClub && home && home.toLowerCase() !== "visitor";
                              const val = showHome
                                ? `${v.first_name} ${v.last_name} (${home})`
                                : `${v.first_name} ${v.last_name}`;
                              return (
                                <CommandItem
                                  key={v.id}
                                  value={`${v.first_name} ${v.last_name} ${showHome ? home : ""}`}
                                  onSelect={() => {
                                    setBookingDialog((s) => (s ? { ...s, guestName: val } : s));
                                    setVisitorSearchOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", bookingDialog.guestName === val ? "opacity-100" : "opacity-0")} />
                                  {v.first_name} {v.last_name}{showHome ? ` · ${home}` : ""}
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
                  {money(lightFeePerHour)}/hr — charged based on actual usage when lights turn off
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialog(null)}>Cancel</Button>
            <Button onClick={handleBook} disabled={submittingBooking || createBooking.isPending || createChallenge.isPending}>
              {submittingBooking || createBooking.isPending || createChallenge.isPending
                ? ((myClub as any)?.uses_gobook ? "Submitting to GoBook…" : "Booking…")
                : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insufficient balance prompt */}
      <Dialog
        open={topUpPrompt.open}
        onOpenChange={(open) => setTopUpPrompt((s) => ({ ...s, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Top up needed to book</DialogTitle>
            <DialogDescription>
              Your account balance is below the minimum required to book a court.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1 text-sm">
            <div className="rounded-lg border p-3 bg-muted/40 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currently owing</span>
                <span className="font-medium">
                  {topUpPrompt.currentOwing >= 0
                    ? money(topUpPrompt.currentOwing)
                    : `-${money(Math.abs(topUpPrompt.currentOwing))} (credit)`}
                </span>
              </div>
              {topUpPrompt.planAllowedDebt > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outstanding membership allowed</span>
                  <span className="font-medium">{money(topUpPrompt.planAllowedDebt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking buffer required</span>
                <span className="font-medium">{money(topUpPrompt.requiredBuffer)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">Minimum balance</span>
                <span className="font-medium">
                  -{money(Math.max(0, topUpPrompt.planAllowedDebt - topUpPrompt.requiredBuffer))}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="font-semibold">Please top up</span>
                <span className="font-bold text-destructive">
                  {money(topUpPrompt.shortfall)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your slot is <span className="font-medium">not booked yet</span>. We'll keep it ready —
              once the top-up reflects, come back to Court Bookings and tap Confirm Booking to finish.
            </p>
          </div>


          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                try { localStorage.removeItem(PENDING_BOOKING_KEY); } catch { /* noop */ }
                setTopUpPrompt((s) => ({ ...s, open: false }));
              }}
            >
              Not now
            </Button>

            <Button
              onClick={() => {
                const amt = Math.max(topUpPrompt.shortfall, 0).toFixed(2);
                setTopUpPrompt((s) => ({ ...s, open: false }));
                navigate(`/my-account?topup=${amt}`);
              }}
            >
              Top up now
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
            <DialogDescription className="sr-only">Choose whether to share the booking or add it to Google Calendar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-1">
              <p className="text-sm font-semibold">
                {getCourtName(calendarPrompt.courtId)} · {calendarPrompt.dateStr}
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
                    `🏸 Squash booking!\n\n${getCourtName(calendarPrompt.courtId)} on ${calendarPrompt.dateStr} from ${calendarPrompt.startTime} to ${calendarPrompt.endTime}.\n\nJoin me!`
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
        courtName={getCourtName(shareDialog.courtId)}
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
            <DialogDescription className="sr-only">Select another court and transfer the active light session.</DialogDescription>
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
            <DialogDescription className="sr-only">Confirm ending the active court light session.</DialogDescription>
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
