import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Loader2, CreditCard, Check, Landmark, Copy } from "lucide-react";
import { toast } from "sonner";
import { FnbPaymentNotice } from "@/components/FnbPaymentNotice";
import { buildYocoReturnUrl, openYocoCheckout } from "@/lib/yoco-native-checkout";

interface Props {
  champ: any;
  clubId: string;
  memberId: string;
  paymentGateway: string | null;
  allowSelfSignup?: boolean;
}

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export function TournamentRegisterCard({ champ, clubId, memberId, paymentGateway, allowSelfSignup }: Props) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: members = [] } = useClubMembers(clubId);
  const [partnerId, setPartnerId] = useState<string>("");
  const [showEft, setShowEft] = useState(false);

  const { data: bankDetails } = useQuery({
    queryKey: ["club-bank-details", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_club_bank_details", { _club_id: clubId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as null | {
        bank_name: string | null;
        bank_account_name: string | null;
        bank_account_number: string | null;
        bank_branch_code: string | null;
        bank_reference: string | null;
      };
    },
    enabled: !!clubId && showEft,
  });

  const markPendingEft = useMutation({
    mutationFn: async (regId: string) => {
      const { error } = await fromExt("club_champs_registrations")
        .update({ status: "pending_eft" })
        .eq("id", regId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as paying by EFT — admin will confirm once received.");
      qc.invalidateQueries({ queryKey: ["my-champ-reg", champ.id, memberId] });
      qc.invalidateQueries({ queryKey: ["tournament-registrations", champ.id] });
    },
    onError: (e: any) => toast.error(e.message || "Could not update payment method"),
  });

  const copyBankDetails = () => {
    if (!bankDetails) return;
    const ref = `${champ?.name ? champ.name.slice(0, 20) : "Tournament"}`.replace(/\s+/g, "-");
    const parts = [
      bankDetails.bank_name && `Bank: ${bankDetails.bank_name}`,
      bankDetails.bank_account_name && `Account: ${bankDetails.bank_account_name}`,
      bankDetails.bank_account_number && `Number: ${bankDetails.bank_account_number}`,
      bankDetails.bank_branch_code && `Branch: ${bankDetails.bank_branch_code}`,
      `Reference: ${ref}`,
      `Amount: R${entryFee.toFixed(2)}`,
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n"));
    toast.success("Bank details copied");
  };

  const entryFee = Number(champ?.entry_fee_cents || 0) / 100;
  const paymentRequired = !!champ?.payment_required && entryFee > 0;
  const acceptsCard = (champ?.payment_methods || []).includes("card");
  const acceptsEft = (champ?.payment_methods || []).includes("eft");
  const isDoubles = champ?.match_type === "doubles";
  const partnerByPlayers = champ?.partner_mode === "players";

  const { data: myReg, refetch } = useQuery({
    queryKey: ["my-champ-reg", champ.id, memberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("*, partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champ.id)
        .eq("club_member_id", memberId)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
    enabled: !!champ?.id && !!memberId,
  });

  const verifiedRef = useRef<string | null>(null);
  useEffect(() => {
    const sid = searchParams.get("yoco_session");
    const ctx = searchParams.get("ctx");
    if (ctx !== "tournament" || !sid || verifiedRef.current === sid) return;
    verifiedRef.current = sid;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("yoco-verify-checkout", { body: { session_id: sid } });
        if (error) throw error;
        if (data?.status === "completed") {
          toast.success("Entry fee paid — you're registered!");
          refetch();
        } else if (data?.status === "failed") {
          toast.error(
            "Your bank declined the card. Enable Online / Internet Purchases in your FNB or Absa app, then try again — or use Google Pay / EFT.",
            { duration: 12000 },
          );
        } else if (["cancelled", "expired"].includes(data?.status)) {
          toast.error(`Payment ${data.status}.`);
        }
      } catch (e: any) {
        toast.error(e.message || "Could not verify payment");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("yoco_session");
        next.delete("ctx");
        setSearchParams(next, { replace: true });
      }
    })();
  }, [searchParams, setSearchParams, refetch]);

  const register = useMutation({
    mutationFn: async () => {
      const status = paymentRequired ? "pending_payment" : "paid";
      const { data, error } = await fromExt("club_champs_registrations").insert({
        champ_id: champ.id,
        club_member_id: memberId,
        status,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (reg) => {
      qc.invalidateQueries({ queryKey: ["my-champ-reg", champ.id, memberId] });
      if (paymentRequired && acceptsCard && paymentGateway === "yoco") {
        await launchPayment(reg.id);
      } else if (paymentRequired) {
        toast.info("Registered — please pay your entry fee.");
      } else {
        toast.success("You're registered!");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const launchPayment = async (regId: string) => {
    try {
      const return_url = buildYocoReturnUrl(`${window.location.pathname}?ctx=tournament`);
      const { data, error } = await supabase.functions.invoke("yoco-create-checkout", {
        body: {
          club_id: clubId,
          club_member_id: memberId,
          amount: entryFee,
          purpose: "tournament",
          champ_registration_id: regId,
          description: `${champ.name} entry fee`,
          return_url,
        },
      });
      if (error) throw error;
      if (data?.redirect_url) await openYocoCheckout(data.redirect_url);
    } catch (e: any) {
      toast.error(e.message || "Could not start payment");
    }
  };

  const choosePartner = useMutation({
    mutationFn: async () => {
      if (!myReg) throw new Error("Register first");
      if (!partnerId) throw new Error("Pick a partner");
      const { error } = await fromExt("club_champs_registrations")
        .update({ partner_member_id: partnerId, partner_confirmed: true })
        .eq("id", myReg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Partner allocated"); setPartnerId(""); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Registered players in this champ (excluding cancelled). Partners may only be picked
  // from members who have already registered and are not already paired with someone else.
  const { data: registeredOthers = [] } = useQuery({
    queryKey: ["champ-registered-others", champ.id, memberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status")
        .eq("champ_id", champ.id)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champ?.id && !!myReg && champ?.match_type === "doubles" && champ?.partner_mode === "players",
  });

  const eligiblePartners = (() => {
    const g = champ?.gender;
    const takenIds = new Set<string>();
    registeredOthers.forEach((r: any) => {
      if (r.partner_member_id) {
        takenIds.add(r.club_member_id);
        takenIds.add(r.partner_member_id);
      }
    });
    const registeredIds = new Set(
      registeredOthers
        .filter((r: any) => r.club_member_id !== memberId && !takenIds.has(r.club_member_id))
        .map((r: any) => r.club_member_id)
    );
    let list = members.filter((m: any) => m.id !== memberId && registeredIds.has(m.id));
    if (g === "men") list = list.filter((m: any) => m.gender && ["men", "male", "m"].includes(m.gender.toLowerCase()));
    else if (g === "ladies") list = list.filter((m: any) => m.gender && ["ladies", "female", "f", "women"].includes(m.gender.toLowerCase()));
    return list;
  })();

  const now = new Date();
  const closesAt = champ?.registration_closes_at ? new Date(champ.registration_closes_at) : null;
  const opensAt = champ?.registration_opens_at ? new Date(champ.registration_opens_at) : null;
  const notYetOpen = opensAt && now < opensAt;
  const isClosed = (closesAt && now > closesAt) || champ?.entries_locked;

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";

  if (champ?.registration_mode === "invite" && !myReg && !allowSelfSignup) return null;

  return (
    <Card className="p-3 mb-2 border-primary/30 bg-primary/5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> {champ.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"}
            {entryFee > 0 && <> · R{entryFee.toFixed(2)} entry fee</>}
            {closesAt && <> · Closes {closesAt.toLocaleDateString()}</>}
          </p>
        </div>
        {myReg && (
          <Badge variant={myReg.status === "paid" || myReg.status === "waived" ? "default" : "outline"} className="text-[10px]">
            {myReg.status === "paid" ? "Paid" : myReg.status === "waived" ? "Entered" : (myReg.status === "pending_payment" || myReg.status === "pending_eft") ? "Payment due" : myReg.status}
          </Badge>
        )}
      </div>

      {!myReg && (
        <div className="flex items-center gap-2">
          {notYetOpen ? (
            <p className="text-xs text-muted-foreground">Registration opens {opensAt?.toLocaleString()}</p>
          ) : isClosed ? (
            <p className="text-xs text-muted-foreground">Registration is closed</p>
          ) : (
            <Button size="sm" className="text-xs h-8" onClick={() => register.mutate()} disabled={register.isPending}>
              {register.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              {entryFee > 0 ? `Register · Pay R${entryFee.toFixed(2)}` : "Register"}
            </Button>
          )}
        </div>
      )}

      {myReg && (myReg.status === "pending_payment" || myReg.status === "pending_eft") && (
        <div className="space-y-2 mt-1">
          <div className="flex flex-wrap items-center gap-2">
            {acceptsCard && paymentGateway === "yoco" && (
              <Button size="sm" className="text-xs h-8" onClick={() => launchPayment(myReg.id)}>
                <CreditCard className="w-3 h-3 mr-1" /> Pay R{entryFee.toFixed(2)} by card
              </Button>
            )}
            {acceptsEft && (
              <Button
                size="sm"
                variant={myReg.status === "pending_eft" ? "default" : "outline"}
                className="text-xs h-8"
                onClick={() => {
                  setShowEft(true);
                  if (myReg.status !== "pending_eft") markPendingEft.mutate(myReg.id);
                }}
              >
                <Landmark className="w-3 h-3 mr-1" /> Pay R{entryFee.toFixed(2)} by EFT
              </Button>
            )}
          </div>

          {acceptsEft && (showEft || myReg.status === "pending_eft") && (
            <Card className="p-3 bg-muted/50 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                {bankDetails && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copyBankDetails}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                )}
              </div>
              {!bankDetails ? (
                <p className="text-xs text-muted-foreground">
                  Bank details not yet captured by the club. Please contact your club admin to arrange EFT — they will mark you paid once received.
                </p>
              ) : (
                <>
                  {bankDetails.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {bankDetails.bank_name}</p>}
                  {bankDetails.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {bankDetails.bank_account_name}</p>}
                  {bankDetails.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {bankDetails.bank_account_number}</p>}
                  {bankDetails.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {bankDetails.bank_branch_code}</p>}
                  <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {(champ?.name || "Tournament").slice(0, 20)}</p>
                  <p className="text-xs font-semibold"><span className="text-muted-foreground">Amount:</span> R{entryFee.toFixed(2)}</p>
                </>
              )}
              <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1">
                After making your EFT, the club admin will confirm receipt and mark your entry as paid.
              </p>
            </Card>
          )}

          {acceptsCard && paymentGateway === "yoco" && (
            <FnbPaymentNotice showEftFallback={acceptsEft} />
          )}
        </div>
      )}

      {myReg && (myReg.status === "paid" || myReg.status === "waived") && isDoubles && partnerByPlayers && (
        <div className="mt-2">
          {myReg.partner ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              Partner: <span className="font-medium text-foreground">{getName(myReg.partner)}</span>
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={partnerId} onValueChange={setPartnerId} disabled={eligiblePartners.length === 0}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={eligiblePartners.length === 0 ? "Waiting for partner to register…" : "Choose your partner"} />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePartners.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{getName(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs" onClick={() => choosePartner.mutate()} disabled={!partnerId || choosePartner.isPending}>Invite</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
