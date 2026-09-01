import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useClubMembers } from "@/hooks/use-club";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EftPaymentPanel } from "@/components/payments/EftPaymentPanel";
import { FnbPaymentNotice } from "@/components/FnbPaymentNotice";
import { isSupportedGateway, startClubCheckout, pollStitchPayment, clearPendingClubSession, type GatewayId } from "@/lib/club-payments";
import { CalendarClock, Check, CheckCircle, CreditCard, Landmark, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed", open: "Open" };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const money = (cents: number) => `R${(Number(cents || 0) / 100).toFixed(2)}`;
const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champ: any;
  registration: any;
  paymentGateway: string | null;
  onDone?: () => void;
  /** Marks the originating notification read after a successful accept. */
  onAccepted?: () => Promise<void> | void;
}

/**
 * "Register to accept" flow for tournament invitations. Handles the three
 * invitation shapes:
 *  1. Invited + entry fee  → register, pay (card or EFT + proof), then pick a
 *     partner from players who have already registered and paid.
 *  2. Invited, no fee      → just accept, then pick any eligible club member as
 *     partner (they do not have to register first).
 *  3. Admin-paired doubles → nothing to pick: only confirm you can play.
 */
export function TournamentInviteRegisterDialog({
  open, onOpenChange, champ, registration, paymentGateway, onDone, onAccepted,
}: Props) {
  const qc = useQueryClient();
  const clubId = champ?.club_id as string;
  const memberId = registration?.club_member_id as string;
  const { data: members = [] } = useClubMembers(clubId);
  const [partnerId, setPartnerId] = useState("");
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [showEft, setShowEft] = useState(false);
  const [chosenDivisions, setChosenDivisions] = useState<number[]>([]);
  const [divisionError, setDivisionError] = useState("");

  // Divisions this member may enter — the invitee ticks the ones they want.
  const { data: divisionOptions = [] } = useQuery({
    queryKey: ["champ-division-options", champ?.id, memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("tournament_division_options", {
        p_champ_id: champ.id,
        p_member_id: memberId,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : [])
        .map((d: any) => ({
          group_number: Number(d?.group_number),
          label: String(d?.label || "").trim() || `League ${d?.group_number}`,
          match_type: d?.match_type ?? null,
        }))
        .filter((d: any) => Number.isFinite(d.group_number) && d.group_number > 0);
    },
    enabled: open && !!champ?.id && !!memberId,
  });

  const mustChooseDivision = divisionOptions.length > 1;
  /**
   * Bells is time-capped: every league plays simultaneously until the bell, so
   * a player can only ever be in ONE league. Other formats allow multi-entry.
   */
  const singleDivisionOnly = champ?.scoring_mode === "time_capped_points";

  useEffect(() => {
    const existing = (registration?.division_choices || []).map((n: any) => Number(n))
      .filter((n: number) => divisionOptions.some((d: any) => d.group_number === n));
    if (existing.length > 0) setChosenDivisions(singleDivisionOnly ? [existing[0]] : existing);
    else if (divisionOptions.length === 1) setChosenDivisions([divisionOptions[0].group_number]);
  }, [divisionOptions, registration?.division_choices, singleDivisionOnly]);

  const toggleDivision = (gn: number) => {
    setDivisionError("");
    if (singleDivisionOnly) {
      setChosenDivisions([gn]);
      return;
    }
    setChosenDivisions((prev) =>
      prev.includes(gn) ? prev.filter((n) => n !== gn) : [...prev, gn].sort((a, b) => a - b),
    );
  };



  const entryFeeCents = Number(champ?.entry_fee_cents || 0);
  const paymentRequired = !!champ?.payment_required && entryFeeCents > 0;
  const methods = (champ?.payment_methods || []) as string[];
  const acceptsCard = methods.includes("card");
  const acceptsEft = methods.includes("eft") || !acceptsCard;
  const gatewayReady = acceptsCard && isSupportedGateway(paymentGateway);
  const isDoubles = champ?.match_type === "doubles";
  const playerPicksPartner = isDoubles && champ?.partner_mode === "players";
  const adminPairs = isDoubles && !playerPicksPartner;

  const status = String(registration?.status || "");
  const accepted = !!registration?.confirmed_at;
  const settled = status === "paid" || status === "waived";
  const feeOutstanding = paymentRequired && !settled;
  // Option 1 gate: with a fee, partners may only be picked once you are paid.
  const canPickPartner = playerPicksPartner && accepted && (!paymentRequired || settled);

  // Who is already in the draw (used to hide paired-up members and, when a fee
  // applies, to restrict the list to players who registered and paid).
  const { data: others = [] } = useQuery({
    queryKey: ["champ-registered-others", champ?.id, memberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id, status")
        .eq("champ_id", champ.id)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open && !!champ?.id && playerPicksPartner,
  });

  const eligiblePartners = useMemo(() => {
    const taken = new Set<string>();
    const registeredPaid = new Set<string>();
    others.forEach((r: any) => {
      if (r.partner_member_id) {
        taken.add(r.club_member_id);
        taken.add(r.partner_member_id);
      }
      if (r.status === "paid" || r.status === "waived") registeredPaid.add(r.club_member_id);
    });
    let list = (members as any[]).filter((m) => m.id !== memberId && !taken.has(m.id));
    const g = champ?.gender;
    if (g === "men") list = list.filter((m) => m.gender && ["men", "male", "m"].includes(String(m.gender).toLowerCase()));
    else if (g === "ladies") list = list.filter((m) => m.gender && ["ladies", "female", "f", "women"].includes(String(m.gender).toLowerCase()));
    // With an entry fee, only players who have registered and paid can be picked.
    if (paymentRequired) list = list.filter((m) => registeredPaid.has(m.id));
    return list;
  }, [others, members, memberId, champ?.gender, paymentRequired]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["tournament-invite-registration"] });
    await qc.invalidateQueries({ queryKey: ["champ-registered-others", champ?.id, memberId] });
    await qc.invalidateQueries({ queryKey: ["tournament-registrations", champ?.id] });
    await qc.invalidateQueries({ queryKey: ["my-champ-reg", champ?.id, memberId] });
  };

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("accept_tournament_invite", {
        p_registration_id: registration.id,
        p_accept: true,
        p_divisions: chosenDivisions.length > 0 ? chosenDivisions : null,
      });
      if (error) throw error;
      await onAccepted?.();
      return (data as any)?.status as string;
    },
    onSuccess: async (newStatus) => {
      await refresh();
      if (newStatus === "pending_eft" || newStatus === "pending_payment") {
        toast.success("Registered — please settle your entry fee below.");
      } else {
        toast.success("Invitation accepted.");
      }
    },
    onError: (e: any) => toast.error(e.message || "Could not accept the invitation"),
  });

  const payByCard = useMutation({
    mutationFn: async () => {
      if (!isSupportedGateway(paymentGateway)) throw new Error("No supported online payment gateway is configured for this club.");
      const res = await startClubCheckout(paymentGateway as GatewayId, {
        clubId, clubMemberId: memberId,
        amount: entryFeeCents / 100,
        purpose: "tournament",
        champ_registration_id: registration.id,
        description: `${champ.name} entry fee`,
        returnPath: `${window.location.pathname}?ctx=tournament`,
      });
      if (paymentGateway === "stitch" && (res as any)?.keptOpen && (res as any)?.session_id) {
        toast.info("Complete the payment in the Stitch tab — this page will update automatically.");
        const st = await pollStitchPayment((res as any).session_id);
        clearPendingClubSession("stitch", (res as any).session_id);
        if (st === "completed") toast.success("Entry fee paid — you're in!");
        else toast.error("The entry fee payment did not go through. No money was taken.");
      }
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message || "Could not start payment"),
  });

  const markEft = useMutation({
    mutationFn: async () => {
      const { error } = await fromExt("club_champs_registrations").update({ status: "pending_eft" }).eq("id", registration.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const saveProof = async (path: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await fromExt("club_champs_registrations").update({
      status: "pending_eft",
      proof_url: path,
      proof_uploaded_at: new Date().toISOString(),
      proof_uploaded_by: auth.user?.id || null,
    }).eq("id", registration.id);
    if (error) throw error;
    await refresh();
  };

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
    onSuccess: async () => {
      setPartnerId("");
      setPartnerOpen(false);
      toast.success("Partner confirmed.");
      await refresh();
    },
    onError: (e: any) => toast.error(e.message || "Could not set your partner"),
  });

  if (!champ || !registration) return null;

  const selfScheduled = String((champ as any).scheduling_mode || "") === "self";
  const detailRows = [
    `${GENDER_LABELS[champ.gender] || champ.gender} ${isDoubles ? "Doubles" : "Singles"}`,
    `${champ.start_date} to ${champ.end_date}`,
    selfScheduled
      ? "Players arrange their own games — no fixed court times"
      : `${(champ.play_days as number[] | undefined)?.map((d) => DAY_NAMES[d]).join(", ") || "Tournament days"} · ${String(champ.start_time || "").slice(0, 5)} – ${String(champ.end_time || "").slice(0, 5)}`,
    paymentRequired ? `${money(entryFeeCents)} entry fee` : "No entry fee — just accept",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{champ.name}</DialogTitle>
          <DialogDescription className="text-xs">
            {paymentRequired ? "Register and pay to accept this invitation." : "Accept this invitation to play."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-1 text-xs">
            {detailRows.map((row) => (
              <div key={row} className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="w-3 h-3 shrink-0" /> <span>{row}</span>
              </div>
            ))}
            {adminPairs && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3 h-3 shrink-0" /> <span>Pairs are chosen by the organiser — just confirm you can play.</span>
              </div>
            )}
          </div>

          {/* Division choice — tick every division you want to play in */}
          {divisionOptions.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Which do you want to play in?</Label>
              <p className="text-[11px] text-muted-foreground">
                You may enter more than one — tick every division you want to play.
              </p>
              <div className="space-y-1">
                {divisionOptions.map((d: any) => (
                  <label key={d.group_number} className="flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={chosenDivisions.includes(d.group_number)}
                      disabled={accepted}
                      onCheckedChange={() => toggleDivision(d.group_number)}
                    />
                    <span className="flex-1">{d.label}</span>
                    {d.match_type === "doubles" && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1">Doubles</Badge>
                    )}
                  </label>
                ))}
              </div>
              {divisionError && <p className="text-[11px] text-destructive">{divisionError}</p>}
            </div>
          )}

          {/* Step 1 — accept / register */}
          {!accepted ? (
            <Button className="w-full h-9 text-xs" disabled={accept.isPending} onClick={() => {
              if (mustChooseDivision && chosenDivisions.length === 0) {
                setDivisionError("Please tick at least one division you want to play in.");
                return;
              }
              setDivisionError("");
              accept.mutate();
            }}>
              {accept.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              {paymentRequired ? `Register to accept · ${money(entryFeeCents)}` : "Accept and confirm I can play"}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Check className="w-3 h-3" />
              <span>{paymentRequired ? (settled ? "Registered and paid" : "Registered — payment outstanding") : "You're in"}</span>
              <Badge variant="outline" className="text-[10px] ml-auto">{status || "confirmed"}</Badge>
            </div>
          )}

          {/* Step 2 — payment */}
          {accepted && feeOutstanding && (
            <div className="space-y-2">
              {gatewayReady && (
                <>
                  <Button size="sm" className="w-full h-8 text-xs" disabled={payByCard.isPending} onClick={() => payByCard.mutate()}>
                    {payByCard.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CreditCard className="w-3 h-3 mr-1" />}
                    Pay {money(entryFeeCents)} by card
                  </Button>
                  <FnbPaymentNotice gateway={paymentGateway} />
                </>
              )}
              {acceptsEft && !showEft && status !== "pending_eft" && (
                <Button size="sm" variant={gatewayReady ? "outline" : "default"} className="w-full h-8 text-xs"
                  onClick={() => { setShowEft(true); markEft.mutate(); }}>
                  <Landmark className="w-3 h-3 mr-1" /> Pay {money(entryFeeCents)} by EFT
                </Button>
              )}
              {acceptsEft && (showEft || status === "pending_eft") && (
                <EftPaymentPanel
                  clubId={clubId}
                  clubMemberId={memberId}
                  amountLabel={money(entryFeeCents)}
                  reference={String(champ.name || "Tournament").slice(0, 20)}
                  proofPath={registration.proof_url}
                  onProofUploaded={saveProof}
                />
              )}
            </div>
          )}

          {/* Step 3 — partner */}
          {playerPicksPartner && accepted && (
            <div className="pt-2 border-t border-border/60 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your partner</p>
              {registration.partner_member_id ? (
                <p className="text-xs flex items-center gap-1">
                  <Check className="w-3 h-3 text-primary" /> {getName(registration.partner) || "Partner selected"}
                </p>
              ) : !canPickPartner ? (
                <p className="text-[11px] text-muted-foreground">
                  Settle your entry fee first — you can pick your partner as soon as your payment is confirmed.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Popover open={partnerOpen} onOpenChange={setPartnerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" role="combobox" className="h-8 text-xs flex-1 justify-between font-normal">
                          <span className="truncate">
                            {partnerId ? getName(eligiblePartners.find((m: any) => m.id === partnerId)) : "Search players…"}
                          </span>
                          <Search className="w-3 h-3 opacity-60 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
                        <Command>
                          <CommandInput placeholder="Type a name…" className="h-9 text-xs" />
                          <CommandList>
                            <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">
                              {paymentRequired ? "No registered and paid player available yet." : "No available member found."}
                            </CommandEmpty>
                            <CommandGroup>
                              {eligiblePartners.map((m: any) => (
                                <CommandItem key={m.id} value={getName(m)} className="text-xs"
                                  onSelect={() => { setPartnerId(m.id); setPartnerOpen(false); }}>
                                  {getName(m)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" className="h-8 text-xs shrink-0" disabled={!partnerId || choosePartner.isPending}
                      onClick={() => choosePartner.mutate()}>
                      {choosePartner.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Confirm
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {paymentRequired
                      ? "Only players who have already registered and paid can be selected. If your partner isn't listed yet, ask them to register first."
                      : "Pick any eligible club member — they don't have to register first."}
                  </p>
                </>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" className="w-full h-8 text-xs"
            onClick={() => { onOpenChange(false); onDone?.(); }}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
