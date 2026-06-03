import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useMemberContext } from "@/contexts/MemberContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FnbPaymentNotice } from "@/components/FnbPaymentNotice";
import { cn } from "@/lib/utils";
import { buildYocoReturnUrl, clearPendingYocoSession, getPendingYocoSession, openYocoCheckout, rememberPendingYocoSession } from "@/lib/yoco-native-checkout";
import { ArrowRight, CalendarClock, CheckCircle, CreditCard, Loader2, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";

type NotificationLike = {
  id?: string;
  type?: string | null;
  read?: boolean;
  data?: Record<string, any> | null;
};

type Props = {
  notification?: NotificationLike | null;
  champId?: string;
  registrationId?: string;
  champ?: any;
  compact?: boolean;
  className?: string;
  onResolved?: () => void;
};

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed", open: "Open" };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMoney(cents: number) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

export function isTournamentInviteNotification(notification?: { type?: string | null }) {
  return notification?.type === "tournament_invite" || notification?.type === "tournament_partner_invite";
}

export function TournamentInviteActions({ notification, champId, registrationId, champ: champProp, compact, className, onResolved }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { linkedMembers } = useMemberContext();
  const verifiedRef = useRef<string | null>(null);
  const data = notification?.data || {};
  const resolvedChampId = champId || data.champ_id;
  const isPartnerInvite = notification?.type === "tournament_partner_invite";

  const { data: fetchedChamp, isLoading: champLoading } = useQuery({
    queryKey: ["tournament-invite-champ", resolvedChampId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs").select("*").eq("id", resolvedChampId).maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
    enabled: !!resolvedChampId && !champProp,
  });

  const champ = champProp || fetchedChamp;

  // Resolve registration: explicit id wins, otherwise look up by champ + linked member
  const linkedMemberIds = useMemo(() => linkedMembers.map((m) => m.id).filter(Boolean), [linkedMembers]);
  const { data: registrationByLookup } = useQuery({
    queryKey: ["tournament-invite-reg-lookup", resolvedChampId, linkedMemberIds.join(",")],
    queryFn: async () => {
      if (!resolvedChampId || linkedMemberIds.length === 0) return null;
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id")
        .eq("champ_id", resolvedChampId)
        .in("club_member_id", linkedMemberIds)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
    enabled: !registrationId && !data.registration_id && !!resolvedChampId && linkedMemberIds.length > 0,
  });

  const resolvedRegistrationId = registrationId || data.registration_id || registrationByLookup?.id;

  const { data: registration, refetch: refetchRegistration, isLoading: regLoading } = useQuery({
    queryKey: ["tournament-invite-registration", resolvedRegistrationId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("*, player:club_member_id(id, name, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("id", resolvedRegistrationId)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
    enabled: !!resolvedRegistrationId,
  });

  const { data: clubInfo } = useQuery({
    queryKey: ["club-payment-gateway", champ?.club_id],
    queryFn: async () => {
      const { data } = await fromExt("clubs").select("payment_gateway").eq("id", champ.club_id).maybeSingle();
      return data as { payment_gateway: string | null } | null;
    },
    enabled: !!champ?.club_id,
  });

  const entryFeeCents = Number(champ?.entry_fee_cents || 0);
  const paymentRequired = !!champ?.payment_required && entryFeeCents > 0;
  const paymentMethods = (champ?.payment_methods || []) as string[];
  const acceptsCard = paymentMethods.includes("card");
  const acceptsEft = paymentMethods.includes("eft");
  const yocoReady = acceptsCard && clubInfo?.payment_gateway === "yoco";
  const status = String(registration?.status || "");
  const isAccepted = ["paid", "waived", "pending_eft"].includes(status) || (isPartnerInvite && registration?.partner_confirmed);
  const isDeclined = status === "cancelled" || (isPartnerInvite && !registration?.partner_member_id && registration?.partner_confirmed === false);

  // Auto-clear the notification once the invite is already resolved (accepted/paid/declined),
  // so the "new notifications" popup stops re-appearing for users who've already responded.
  const autoClearedRef = useRef(false);
  useEffect(() => {
    if (autoClearedRef.current) return;
    if (!notification?.id || notification.read) return;
    if (!registration) return;
    if (!(isAccepted || isDeclined)) return;
    autoClearedRef.current = true;
    (async () => {
      await supabase.from("notifications").update({ read: true }).eq("id", notification.id);
      invalidateNotifications();
      onResolved?.();
    })();
  }, [notification?.id, notification?.read, registration, isAccepted, isDeclined]); // eslint-disable-line react-hooks/exhaustive-deps


  const invalidateNotifications = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    qc.invalidateQueries({ queryKey: ["unread-notifications-modal"] });
  };

  const markNotificationRead = async () => {
    if (!notification?.id) return;
    await supabase.from("notifications").update({ read: true }).eq("id", notification.id);
  };

  const launchPayment = async () => {
    if (!champ || !registration) return;
    const returnParams = new URLSearchParams(window.location.search);
    returnParams.set("ctx", "tournament");
    returnParams.set("yoco_registration", registration.id);
    if (notification?.id) returnParams.set("notificationId", notification.id);
    const return_url = buildYocoReturnUrl(`${window.location.pathname}?${returnParams.toString()}`);
    const { data, error } = await supabase.functions.invoke("yoco-create-checkout", {
      body: {
        club_id: champ.club_id,
        club_member_id: registration.club_member_id,
        amount: entryFeeCents / 100,
        purpose: "tournament",
        champ_registration_id: registration.id,
        description: `${champ.name} entry fee`,
        return_url,
      },
    });
    if (error) throw error;
    if (data?.session_id) rememberPendingYocoSession(data.session_id, window.location.pathname);
    if (data?.redirect_url) await openYocoCheckout(data.redirect_url);
  };

  useEffect(() => {
    const pending = getPendingYocoSession();
    const cancelled = searchParams.get("yoco_cancelled");
    const sid = searchParams.get("yoco_session") || cancelled || (pending?.returnPath === window.location.pathname ? pending.sessionId : null);
    const ctx = searchParams.get("ctx");
    const yocoReg = searchParams.get("yoco_registration");
    if ((ctx && ctx !== "tournament") || (!sid && !cancelled) || (resolvedRegistrationId && yocoReg && yocoReg !== resolvedRegistrationId)) return;
    const token = sid || cancelled || "";
    if (verifiedRef.current === token) return;
    verifiedRef.current = token;

    (async () => {
      try {
        let status = "";
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { data, error } = await supabase.functions.invoke("yoco-verify-checkout", { body: { session_id: sid } });
          if (error) throw error;
          status = data?.status || "";
          if (["completed", "failed", "expired", "cancelled"].includes(status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        if (status === "completed") {
          clearPendingYocoSession(sid || undefined);
          await markNotificationRead();
          await refetchRegistration();
          invalidateNotifications();
          toast.success("Entry paid — tournament registration confirmed.");
          onResolved?.();
        } else if (status === "failed") {
          clearPendingYocoSession(sid || undefined);
          toast.error(
            "Your bank declined the card. Enable Online / Internet Purchases in your FNB or Absa app, then try again — or use Google Pay / EFT. Your invite stays open.",
            { duration: 12000 },
          );
        } else if (status === "expired") {
          clearPendingYocoSession(sid || undefined);
          toast.error("Payment expired. Your invite will stay open.");
        } else if (status === "cancelled") {
          clearPendingYocoSession(sid || undefined);
          toast.info("Payment cancelled — your invite will stay open.");
        } else if (cancelled) {
          toast.info("Payment returned without a final result yet. Your invite will stay open while we keep checking.");
        }
      } catch (e: any) {
        toast.error(e.message || "Could not verify payment");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("yoco_session");
        next.delete("yoco_cancelled");
        next.delete("yoco_registration");
        next.delete("ctx");
        setSearchParams(next, { replace: true });
      }
    })();
  }, [resolvedRegistrationId, searchParams, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      if (!registration) throw new Error("Invite not found");

      if (!accept) {
        if (isPartnerInvite) {
          const { error } = await fromExt("club_champs_registrations")
            .update({ partner_member_id: null, partner_confirmed: false })
            .eq("id", registration.id);
          if (error) throw error;
        } else {
          const { error } = await fromExt("club_champs_registrations").update({ status: "cancelled" }).eq("id", registration.id);
          if (error) throw error;
        }
        await markNotificationRead();
        return "declined";
      }

      if (isPartnerInvite) {
        const { error } = await fromExt("club_champs_registrations").update({ partner_confirmed: true }).eq("id", registration.id);
        if (error) throw error;
        await markNotificationRead();
        return "accepted";
      }

      // Player invite: RPC credits the entry fee to the player's account and updates status
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("accept_tournament_invite", {
        p_registration_id: registration.id,
        p_accept: true,
      });
      if (rpcErr) throw rpcErr;
      await markNotificationRead();

      const newStatus = (rpcData as any)?.status as string;
      if (newStatus === "pending_eft" && yocoReady) {
        await launchPayment();
        return "payment_started";
      }
      return newStatus === "pending_eft" ? "eft" : "accepted";
    },
    onSuccess: async (result) => {
      await refetchRegistration();
      invalidateNotifications();
      if (result === "payment_started") return;
      toast.success(result === "declined" ? "Tournament invite declined." : result === "eft" ? "Invite accepted — EFT payment pending." : "Tournament invite accepted.");
      onResolved?.();
    },
    onError: (e: any) => toast.error(e.message || "Could not update invite"),
  });

  const detailRows = useMemo(() => {
    if (!champ) return [];
    return [
      `${GENDER_LABELS[champ.gender] || champ.gender} ${champ.match_type === "doubles" ? "Doubles" : "Singles"}`,
      `${champ.start_date} to ${champ.end_date}`,
      `${(champ.play_days as number[] | undefined)?.map((d) => DAY_NAMES[d]).join(", ") || "Tournament days"} · ${String(champ.start_time || "").slice(0, 5)} – ${String(champ.end_time || "").slice(0, 5)}`,
      paymentRequired ? `${formatMoney(entryFeeCents)} entry fee${acceptsEft ? " · EFT accepted" : ""}` : "No entry fee",
    ].filter(Boolean);
  }, [acceptsEft, champ, entryFeeCents, paymentRequired]);

  if (champLoading || regLoading) {
    return <Card className={cn("p-3 flex items-center justify-center", className)}><Loader2 className="w-4 h-4 animate-spin text-primary" /></Card>;
  }

  // If we have the tournament but the user isn't registered yet (e.g. update broadcast),
  // prompt them to register instead of showing a dead-end "not available" message.
  if (champ && !registration) {
    const openTournament = () => {
      onResolved?.();
      navigate(`/club-champs/${champ.id}`);
    };
    return (
      <Card className={cn("p-3 border-primary/30 bg-primary/5", className)}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{champ.name}</p>
            <p className="text-[11px] text-muted-foreground">
              You're not registered yet. Open the tournament to register{paymentRequired ? ` (${formatMoney(entryFeeCents)} entry)` : ""}.
            </p>
            <Button size="sm" className="h-8 text-xs mt-3 w-full" onClick={openTournament}>
              Register / View Tournament <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!champ || !registration) {
    return <Card className={cn("p-3 text-sm text-muted-foreground", className)}>Tournament invite details are not available.</Card>;
  }

  return (
    <Card className={cn("p-3 border-primary/30 bg-primary/5", className)}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Trophy className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{champ.name}</p>
              <p className="text-[11px] text-muted-foreground">{isPartnerInvite ? "Doubles partner invite" : "Tournament invitation"}</p>
            </div>
            <Badge variant={isAccepted ? "default" : isDeclined ? "secondary" : "outline"} className="text-[10px] shrink-0">
              {isDeclined ? "Declined" : isAccepted ? (status === "pending_eft" ? "EFT pending" : "Accepted") : paymentRequired ? "Payment due" : "Awaiting reply"}
            </Badge>
          </div>

          <div className={cn("grid gap-1 mt-2", compact ? "text-[11px]" : "text-xs")}>
            {detailRows.map((row) => (
              <div key={row} className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="w-3 h-3 shrink-0" />
                <span>{row}</span>
              </div>
            ))}
          </div>

          {!isAccepted && !isDeclined && (
            <>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <Button size="sm" className="h-8 text-xs flex-1" disabled={respond.isPending} onClick={() => respond.mutate(true)}>
                  {respond.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : yocoReady && paymentRequired ? <CreditCard className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  {isPartnerInvite ? "Accept Partner" : paymentRequired && yocoReady ? `Pay & Register ${formatMoney(entryFeeCents)}` : "Accept Invite"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" disabled={respond.isPending} onClick={() => respond.mutate(false)}>
                  <XCircle className="w-3 h-3 mr-1" /> Decline
                </Button>
              </div>
              {yocoReady && paymentRequired && (
                <FnbPaymentNotice className="mt-2" />
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}