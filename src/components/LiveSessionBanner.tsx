import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBookings } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
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
import { Zap, ZapOff, ArrowRightLeft, Lightbulb, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

export function LiveSessionBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: myBookings } = useMyBookings();
  const { data: clubData } = useMyClub();
  const lightFeePerHour = (clubData?.club as any)?.light_fee_per_hour ?? 0;
  const [dismissed, setDismissed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferOpen, setTransferOpen] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState<string | null>(null);

  // Active light sessions
  const { data: activeSessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["live-light-sessions", user?.id],
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

  // Courts list
  const { data: courtsData } = useQuery({
    queryKey: ["courts-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("courts").select("id, name, relay_device_id").order("id");
      if (error) throw error;
      return (data || []) as { id: number; name: string; relay_device_id: string | null }[];
    },
  });
  const getCourtName = (id: number) => courtsData?.find((c) => c.id === id)?.name || `Court ${id}`;

  // Find current active booking (happening right now)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const currentBooking = (myBookings || []).find((b: any) => {
    if (b.status !== "active" || b.date !== todayStr) return false;
    const start = new Date(`${b.date}T${b.start_time}`);
    const end = new Date(`${b.date}T${b.end_time}`);
    return now >= start && now <= end;
  });

  const activeSession = (activeSessions as any[]).find(
    (s: any) => currentBooking && s.booking_id === currentBooking.id
  );

  // Nothing to show
  if (!currentBooking && activeSessions.length === 0) return null;
  if (dismissed) return null;

  // If there's an active session without a matching current booking (orphan), still show it
  const orphanSession = !activeSession && activeSessions.length > 0 ? (activeSessions as any[])[0] : null;
  const displaySession = activeSession || orphanSession;

  const handleTerminate = async (sessionId: string) => {
    setActionLoading(true);
    try {
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "terminate", session_id: sessionId },
      });
      if (resp.error) throw resp.error;
      const result = resp.data;
      toast.success(`Lights off! R${(result?.fee_charged || 0).toFixed(2)} charged for ${result?.duration_minutes || 0} min`);
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["my-active-light-sessions"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to end session");
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
    } catch (e: any) {
      toast.error(e.message || "Failed to transfer");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTurnOnLights = async () => {
    if (!currentBooking || !user) return;
    setActionLoading(true);
    try {
      const resp = await supabase.functions.invoke("court-lights", {
        body: { action: "turn_on", booking_id: currentBooking.id },
      });

      if (resp.error) {
        throw new Error(resp.error.message || "Failed to turn on lights");
      }

      toast.success("Lights are on! ⚡");
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ["my-bookings", "my-active-light-sessions"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to turn on lights");
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate elapsed time for active session
  const elapsedMin = displaySession
    ? Math.round((Date.now() - new Date(displaySession.started_at).getTime()) / 60000)
    : 0;
  const currentCost = displaySession
    ? Math.round(((elapsedMin / 60) * Number(displaySession.fee_per_hour || 0)) * 100) / 100
    : 0;

  const lightsNotOn = currentBooking && !displaySession;

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
                    <span className="text-sm font-semibold">Playing Now</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {getCourtName(currentBooking!.court_id)} · Lights are off
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
                      End
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
                <button
                  className="p-1 rounded-full hover:bg-foreground/10 transition-colors"
                  onClick={() => setDismissed(true)}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Navigate to booking */}
            {currentBooking && (
              <button
                className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => navigate("/bookings")}
              >
                View booking details <ChevronRight className="w-3 h-3" />
              </button>
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
              <ZapOff className="w-4 h-4" /> End Court Session?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will turn off the lights and end your session. You'll be charged based on actual usage
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
