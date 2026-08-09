import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useClubMembers } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trophy, Loader2, CreditCard, Check, Landmark, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { FnbPaymentNotice } from "@/components/FnbPaymentNotice";
import {
  isSupportedGateway, readReturnSession, clearReturnParams,
  clearPendingClubSession, startClubCheckout, verifyClubCheckout,
  type GatewayId,
} from "@/lib/club-payments";

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
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);
  const [partnerId, setPartnerId] = useState<string>("");
  const [partnerOpen, setPartnerOpen] = useState(false);
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
    const ctx = searchParams.get("ctx");
    if (ctx && ctx !== "tournament") return;
    const found = readReturnSession(searchParams, window.location.pathname);
    if (!found) return;
    const { gateway, sid, statusHint, cancelled } = found;
    if (verifiedRef.current === sid) return;
    verifiedRef.current = sid;
    (async () => {
      try {
        let status = "";
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const { data, error } = await verifyClubCheckout(gateway, sid);
          if (error) throw error;
          status = (data as any)?.status || "";
          if (status === "completed") break;
          if (["failed", "expired", "cancelled"].includes(status) && statusHint !== "failure") break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        if (status === "completed") {
          clearPendingClubSession(gateway, sid);
          toast.success("Entry fee paid — you're registered!");
          refetch();
        } else if (status === "failed") {
          clearPendingClubSession(gateway, sid);
          toast.error(
            gateway === "yoco"
              ? "Your bank declined the card. Enable Online / Internet Purchases in your FNB or Absa app, then try again — or use Google Pay / EFT."
              : "The payment did not go through. No money was taken — please try again.",
            { duration: 12000 },
          );
        } else if (status === "expired") {
          clearPendingClubSession(gateway, sid);
          toast.error("Payment expired.");
        } else if (status === "cancelled") {
          clearPendingClubSession(gateway, sid);
          toast.info("Payment cancelled.");
        } else if (statusHint === "failure") {
          toast.info("Gateway returned before final confirmation. I'll keep checking this payment in the background.");
        } else if (cancelled) {
          toast.info("Payment returned without a final result yet. I'll keep checking when you open this page again.");
        } else {
          toast.info("Payment still processing. I'll keep checking when you open this page again.");
        }
      } catch (e: any) {
        toast.error(e.message || "Could not verify payment");
      } finally {
        const next = clearReturnParams(searchParams);
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
      if (paymentRequired && acceptsCard && isSupportedGateway(paymentGateway)) {
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
      if (!isSupportedGateway(paymentGateway)) {
        throw new Error("No supported online payment gateway is configured for this club.");
      }
      const res = await startClubCheckout(paymentGateway as GatewayId, {
        clubId, clubMemberId: memberId,
        amount: entryFee, purpose: "tournament",
        champ_registration_id: regId,
        description: `${champ.name} entry fee`,
        returnPath: `${window.location.pathname}?ctx=tournament`,
      });
      // Stitch leaves the payer on its own completion page, so poll from here.
      if (paymentGateway === "stitch" && (res as any)?.keptOpen && res.session_id) {
        toast.info("Complete the payment in the Stitch tab — this page will update automatically.");
        const status = await pollStitchPayment(res.session_id);
        if (status === "completed") {
          clearPendingClubSession("stitch", res.session_id);
          toast.success("Entry fee paid — you're in!");
          queryClient.invalidateQueries({ queryKey: ["champ-registrations"] });
          queryClient.invalidateQueries({ queryKey: ["my-champ-registration"] });
        } else if (status === "failed" || status === "expired" || status === "cancelled") {
          clearPendingClubSession("stitch", res.session_id);
          toast.error("The entry fee payment did not go through. No money was taken.");
        }
      }

    } catch (e: any) {
      toast.error(e.message || "Could not start payment");
    }
  };

  // Registers me (if needed) AND my partner in one go. Partner may be any eligible
  // club member — they do not have to have registered themselves first.
  const choosePartner = useMutation({
    mutationFn: async () => {
      if (!partnerId) throw new Error("Pick a partner");
      const { error } = await (supabase as any).rpc("register_doubles_pair", {
        _champ_id: champ.id,
        _member_id: memberId,
        _partner_member_id: partnerId,
      });
      if (error) throw error;
    },
    onSuccess: async (_d, _v) => {
      toast.success(
        paymentRequired
          ? "You and your partner are entered — each of you still needs to pay the entry fee."
          : "You and your partner are entered!",
      );
      setPartnerId("");
      setPartnerOpen(false);
      await refetch();
      qc.invalidateQueries({ queryKey: ["champ-registered-others", champ.id, memberId] });
      qc.invalidateQueries({ queryKey: ["tournament-registrations", champ.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Existing registrations, used to hide members who are already paired up.
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
    enabled: !!champ?.id && champ?.match_type === "doubles" && champ?.partner_mode === "players",
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
    let list = members.filter((m: any) => m.id !== memberId && !takenIds.has(m.id));
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

  const partnerPicker = (ctaLabel: string) => (
    <div className="flex items-center gap-2">
      <Popover open={partnerOpen} onOpenChange={setPartnerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" role="combobox" className="h-8 text-xs flex-1 justify-between font-normal">
            <span className="truncate">
              {partnerId ? getName(eligiblePartners.find((m: any) => m.id === partnerId)) : "Search club members…"}
            </span>
            <Search className="w-3 h-3 opacity-60 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
          <Command>
            <CommandInput placeholder="Type a name…" className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">No available member found.</CommandEmpty>
              <CommandGroup>
                {eligiblePartners.map((m: any) => (
                  <CommandItem
                    key={m.id}
                    value={getName(m)}
                    onSelect={() => { setPartnerId(m.id); setPartnerOpen(false); }}
                    className="text-xs"
                  >
                    {getName(m)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        className="h-8 text-xs shrink-0"
        onClick={() => choosePartner.mutate()}
        disabled={!partnerId || choosePartner.isPending}
      >
        {choosePartner.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
        {ctaLabel}
      </Button>
    </div>
  );


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
            {entryFee > 0 && <> · {money(entryFee)} entry fee</>}
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
        <div className="space-y-2">
          {notYetOpen ? (
            <p className="text-xs text-muted-foreground">Registration opens {opensAt?.toLocaleString()}</p>
          ) : isClosed ? (
            <p className="text-xs text-muted-foreground">Registration is closed</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button size="sm" className="text-xs h-8" onClick={() => register.mutate()} disabled={register.isPending}>
                  {register.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                  {entryFee > 0 ? `Register · Pay ${money(entryFee)}` : "Register"}
                </Button>
                {isDoubles && partnerByPlayers && (
                  <span className="text-[11px] text-muted-foreground">on my own — pick a partner later</span>
                )}
              </div>
              {isDoubles && partnerByPlayers && (
                <div className="pt-1 border-t border-border/60">
                  <p className="text-[11px] text-muted-foreground mb-1">Or enter as a pair — search any club member:</p>
                  {partnerPicker("Enter both")}
                  {entryFee > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Each player pays their own {money(entryFee)} entry fee.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}


      {myReg && (myReg.status === "pending_payment" || myReg.status === "pending_eft") && (
        <div className="space-y-2 mt-1">
          <div className="flex flex-wrap items-center gap-2">
            {acceptsCard && paymentGateway === "yoco" && (
              <Button size="sm" className="text-xs h-8" onClick={() => launchPayment(myReg.id)}>
                <CreditCard className="w-3 h-3 mr-1" /> Pay {money(entryFee)} by card
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
                <Landmark className="w-3 h-3 mr-1" /> Pay {money(entryFee)} by EFT
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
                  <p className="text-xs font-semibold"><span className="text-muted-foreground">Amount:</span> {money(entryFee)}</p>
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

      {myReg && isDoubles && partnerByPlayers && (
        <div className="mt-2">
          {myReg.partner ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              Partner: <span className="font-medium text-foreground">{getName(myReg.partner)}</span>
            </p>
          ) : (
            partnerPicker("Add your partner")
          )}
        </div>
      )}
    </Card>
  );
}
