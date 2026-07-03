import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBookings } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useClubSecrets } from "@/hooks/use-club-secrets";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Zap, ZapOff, ArrowRightLeft, Lightbulb, X, DoorOpen } from "lucide-react";
import { triggerShellyDoor } from "@/lib/shelly-door";
import { triggerShellyLights } from "@/lib/shelly-lights";
import { useMemberContext } from "@/contexts/MemberContext";
import { markDoorOpened, wasDoorOpenedForBooking } from "@/lib/door-open-state";
import { useMemberAccessGate } from "@/hooks/use-member-access-gate";




import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type ClubLightsConfig = {
  id?: string;
  light_fee_per_hour?: number | null;
  lights_integration_enabled?: boolean | null;
};

type BookingForLights = {
  id: string;
  court_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  guest_name?: string | null;
};

type LightSession = {
  id: string;
  booking_id: string | null;
  court_id: number;
  started_at: string;
  fee_per_hour: number | null;
  status: string;
};

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function LiveSessionBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: myBookings } = useMyBookings();
  const { data: clubData } = useMyClub();
  const club = clubData?.club as ClubLightsConfig | undefined;
  const lightFeePerHour = club?.light_fee_per_hour ?? 0;
  const lightsIntegrationEnabled = !!club?.lights_integration_enabled;
  const { data: clubSecrets } = useClubSecrets(club?.id);
  const accessType = (clubSecrets as any)?.access_control_type;
  const flussEnabled = accessType === "remote_trigger";
  const shellyEnabled = accessType === "shelly_relay";
  const accessGate = useMemberAccessGate();
  const doorEnabled = (flussEnabled || shellyEnabled) && !accessGate.isBlocked("door");
  const { activeMember } = useMemberContext();

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [actionLoading, setActionLoading] = useState(false);
  const [doorLoading, setDoorLoading] = useState(false);
  const [transferOpen, setTransferOpen] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState<string | null>(null);


  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Active light sessions
  const { data: activeSessions = [], refetch: refetchSessions } = useQuery<LightSession[]>({
    queryKey: ["live-light-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("light_sessions")
        .select("id, booking_id, court_id, started_at, fee_per_hour, status")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return (data || []) as LightSession[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Courts list
  const clubId = club?.id;
  const { data: courtsData } = useQuery({
    queryKey: ["courts-list", clubId],
    queryFn: async () => {
      let q = supabase.from("courts").select("id, name, relay_device_id, relay_ble_mac").order("id");
      if (clubId) q = q.eq("club_id", clubId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as { id: number; name: string; relay_device_id: string | null; relay_ble_mac: string | null }[];
    },
    enabled: !!clubId,
  });
  const getCourtName = (id: number) => courtsData?.find((c) => c.id === id)?.name || `Court ${id}`;

  // Find the booking to prompt for: from 15 min before start until end_time.
  // This lets members open the door on arrival, before their slot begins.
  const todayStr = format(now, "yyyy-MM-dd");
  const PRE_WINDOW_MS = 15 * 60 * 1000;
  const currentBooking = ((myBookings || []) as BookingForLights[]).find((b) => {
    if (b.status !== "active" || b.date !== todayStr) return false;
    const start = new Date(`${b.date}T${b.start_time}`);
    const end = new Date(`${b.date}T${b.end_time}`);
    return now.getTime() >= start.getTime() - PRE_WINDOW_MS && now <= end;
  });

  // Has the booking actually started (used to gate the lights UI, which must
  // only appear once play begins — not during the 15-min pre-arrival window)?
  const bookingHasStarted = !!currentBooking &&
    now >= new Date(`${currentBooking.date}T${currentBooking.start_time}`);

  const activeSession = activeSessions.find(
    (s) => currentBooking && s.booking_id === currentBooking.id
  );

  // If there's an active session without a matching current booking (orphan), still show it
  const orphanSession = !activeSession && activeSessions.length > 0 ? activeSessions[0] : null;
  const displaySession = activeSession || orphanSession;
  const promptKey = displaySession ? `session:${displaySession.id}` : currentBooking ? `booking:${currentBooking.id}` : null;

  // Nothing to show — must have lights integration OR door access to render
  if (!lightsIntegrationEnabled && !doorEnabled) return null;

  if (!promptKey) return null;
  if (dismissedKey === promptKey) return null;


  const handleTerminate = async (sessionId: string) => {
    setActionLoading(true);
    try {
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "terminate", session_id: sessionId },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;

      // Also end the booking early so the "Turn On Lights" prompt stops reappearing.
      // We shorten end_time to "now" (rounded up to the next 5 minutes) without cancelling.
      if (currentBooking) {
        try {
          const n = new Date();
          n.setSeconds(0, 0);
          const mins = n.getMinutes();
          const bump = Math.ceil((mins + 1) / 5) * 5;
          if (bump >= 60) {
            n.setHours(n.getHours() + 1);
            n.setMinutes(0);
          } else {
            n.setMinutes(bump);
          }
          const hh = String(n.getHours()).padStart(2, "0");
          const mm = String(n.getMinutes()).padStart(2, "0");
          await supabase
            .from("bookings")
            .update({ end_time: `${hh}:${mm}:00` })
            .eq("id", currentBooking.id);
        } catch (e) {
          console.warn("Failed to shorten booking on session end", e);
        }
      }

      toast.success(`Session ended. R${(result?.fee_charged || 0).toFixed(2)} charged for ${result?.duration_minutes || 0} min`);
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["my-active-light-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      setDismissedKey(`session:${sessionId}`);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to end session"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransfer = async (sessionId: string, targetCourtId: number) => {
    setActionLoading(true);
    try {
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "transfer", session_id: sessionId, target_court_id: targetCourtId },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;
      toast.success(`Transferred! R${(result?.fee_charged || 0).toFixed(2)} charged. Lights on at ${getCourtName(targetCourtId)}.`);
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["my-active-light-sessions"] });
      setTransferOpen(null);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to transfer"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleTurnOnLights = async () => {
    if (!currentBooking || !user || !club?.id) return;
    setActionLoading(true);
    try {
      const s: any = clubSecrets || {};
      const court = courtsData?.find((c) => c.id === currentBooking.court_id);
      const res = await triggerShellyLights({
        clubId: club.id,
        bookingId: currentBooking.id,
        courtId: currentBooking.court_id,
        courtName: court?.name,
        clubMemberId: activeMember?.id ?? null,
        courtRelayBleMac: court?.relay_ble_mac ?? null,
        ble: {
          enabled: !!s.ble_fallback_enabled,
          password: s.shelly_ble_control_password,
          channel: 0,
          pulseMs: 3600_000,
        },
      });
      toast.success(res.message);
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["live-light-sessions", user.id] });
    } catch (e) {
      toast.error(errorMessage(e, "Failed to turn on lights"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDoor = async () => {
    if (!currentBooking || !club?.id) return;
    setDoorLoading(true);
    try {
      if (shellyEnabled) {
        const s: any = clubSecrets || {};
        const res = await triggerShellyDoor({
          clubId: club.id,
          doorName: "Main door",
          clubMemberId: activeMember?.id ?? null,
          ble: {
            enabled: !!s.ble_fallback_enabled,
            mac: s.shelly_door_ble_mac,
            password: s.shelly_ble_control_password,
            channel: s.shelly_door_channel,
            pulseMs: s.shelly_door_pulse_ms,
          },
        });
        toast.success(res.message || "Door opening… 🚪");
      } else {
        const resp = await supabase.functions.invoke("fluss-trigger", {
          body: { club_id: club.id, court_id: currentBooking.court_id, booking_id: currentBooking.id },
        });
        if (resp.error) throw resp.error;
        toast.success("Door opening… 🚪");
      }
      markDoorOpened(currentBooking.id);
      setDismissedKey(promptKey);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to open door"));
    } finally {
      setDoorLoading(false);
    }
  };


  // Calculate elapsed time for active session

  const elapsedMin = displaySession
    ? Math.round((Date.now() - new Date(displaySession.started_at).getTime()) / 60000)
    : 0;
  const currentCost = displaySession
    ? Math.round(((elapsedMin / 60) * Number(displaySession.fee_per_hour || 0)) * 100) / 100
    : 0;

  // Lights UI only makes sense once the booking has actually started.
  const lightsNotOn = currentBooking && bookingHasStarted && !displaySession;

  // "Open Door" prompt rules (per user spec):
  //  • Show from 15 min before start until pressed.
  //  • If never pressed, stop showing 5 min after start.
  //  • Never show if the member already opened the door for this booking
  //    (e.g. via the always-visible dashboard tile after arriving early).
  const startMs = currentBooking
    ? new Date(`${currentBooking.date}T${currentBooking.start_time}`).getTime()
    : 0;
  const doorPromptActive =
    doorEnabled &&
    !!currentBooking &&
    !wasDoorOpenedForBooking(currentBooking.id) &&
    now.getTime() <= startMs + 5 * 60 * 1000;

  // If nothing actionable to show (e.g. pre-booking window but door already
  // opened via the dashboard tile), don't render at all.
  if (!displaySession && !lightsNotOn && !doorPromptActive) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[60] safe-area-top"
        >
          <div className={cn(
            "mx-2 mt-[max(0.5rem,env(safe-area-inset-top))] rounded-xl border shadow-lg backdrop-blur-md p-3",
            displaySession
              ? "bg-amber-500/15 border-amber-500/30"
              : "bg-primary/10 border-primary/30"
          )}>
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                displaySession ? "bg-amber-500/20" : "bg-primary/20"
              )}>
                {displaySession ? (
                  <Zap className="w-5 h-5 text-amber-500 animate-pulse" />
                ) : (
                  <Lightbulb className="w-5 h-5 text-primary" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {displaySession ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Lights Active</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-0">
                        {getCourtName(displaySession.court_id)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {elapsedMin} min · R{currentCost.toFixed(2)} so far
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold">
                      {bookingHasStarted ? "Playing Now" : "Booking starting soon"}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {getCourtName(currentBooking!.court_id)}
                      {bookingHasStarted ? " · Lights are off" : ` · Starts at ${currentBooking!.start_time.slice(0, 5)}`}
                    </p>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {displaySession ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs gap-1"
                      disabled={actionLoading}
                      onClick={() => setTransferOpen(displaySession.id)}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 px-3 text-xs gap-1"
                      disabled={actionLoading}
                      onClick={() => setConfirmEndOpen(displaySession.id)}
                    >
                      <ZapOff className="w-3.5 h-3.5" />
                      End Session
                    </Button>
                  </>
                ) : lightsNotOn ? (
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs gap-1"
                    disabled={actionLoading}
                    onClick={handleTurnOnLights}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Turn On Lights
                  </Button>
                ) : null}
                {doorPromptActive && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs gap-1"
                    disabled={doorLoading}
                    onClick={handleOpenDoor}
                  >
                    <DoorOpen className="w-3.5 h-3.5" />
                    Open Door
                  </Button>
                )}

                <button
                  className="p-1 rounded-full hover:bg-foreground/10 transition-colors"
                  onClick={() => setDismissedKey(promptKey)}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Booking info inline */}
            {currentBooking && (
              <div className="mt-2 pt-2 border-t border-foreground/10 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{getCourtName(currentBooking.court_id)}</span>
                <span>{currentBooking.start_time?.slice(0, 5)} – {currentBooking.end_time?.slice(0, 5)}</span>
                {currentBooking.guest_name && <span>vs {currentBooking.guest_name}</span>}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Transfer Court Dialog */}
      <Dialog open={!!transferOpen} onOpenChange={() => setTransferOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Transfer Court</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Current court lights will turn off and you'll be charged for actual usage. New court lights will turn on.
            </p>
            <div className="grid gap-2">
              {(courtsData || [])
                .filter((c) => c.id !== (displaySession?.court_id ?? -1))
                .map((court) => (
                  <Button
                    key={court.id}
                    variant="outline"
                    className="justify-start gap-2"
                    disabled={actionLoading}
                    onClick={() => {
                      if (transferOpen) handleTransfer(transferOpen, court.id);
                    }}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    {court.name}
                  </Button>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm End Session Dialog */}
      <Dialog open={!!confirmEndOpen} onOpenChange={() => setConfirmEndOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ZapOff className="w-4 h-4" /> End Session?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will turn off the lights and end your booking early (your booking stays on record).
            You'll be charged based on actual usage
            {displaySession ? ` (${elapsedMin} min · R${currentCost.toFixed(2)} so far)` : ""}.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmEndOpen(null)} disabled={actionLoading}>
              Keep Playing
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading}
              onClick={() => {
                if (confirmEndOpen) {
                  handleTerminate(confirmEndOpen);
                  setConfirmEndOpen(null);
                }
              }}
            >
              <ZapOff className="w-3.5 h-3.5 mr-1" />
              End Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
