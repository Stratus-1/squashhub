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
import { Trophy, Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  champ: any;
  clubId: string;
  memberId: string;
  paymentGateway: string | null;
}

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export function TournamentRegisterCard({ champ, clubId, memberId, paymentGateway }: Props) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: members = [] } = useClubMembers(clubId);
  const [partnerId, setPartnerId] = useState<string>("");

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
        } else if (["cancelled", "failed", "expired"].includes(data?.status)) {
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
      const return_url = `${window.location.origin}${window.location.pathname}?ctx=tournament`;
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
      if (data?.redirect_url) window.location.href = data.redirect_url;
    } catch (e: any) {
      toast.error(e.message || "Could not start payment");
    }
  };

  const choosePartner = useMutation({
    mutationFn: async () => {
      if (!myReg) throw new Error("Register first");
      if (!partnerId) throw new Error("Pick a partner");
      const { error } = await fromExt("club_champs_registrations")
        .update({ partner_member_id: partnerId, partner_confirmed: false })
        .eq("id", myReg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Partner invited"); setPartnerId(""); refetch(); },
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

  if (champ?.registration_mode === "invite" && !myReg) return null;

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
            {myReg.status === "paid" ? "Paid" : myReg.status === "waived" ? "Entered" : myReg.status === "pending_payment" ? "Payment due" : myReg.status}
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

      {myReg && myReg.status === "pending_payment" && (
        <div className="flex items-center gap-2 mt-1">
          {acceptsCard && paymentGateway === "yoco" && (
            <Button size="sm" className="text-xs h-8" onClick={() => launchPayment(myReg.id)}>
              <CreditCard className="w-3 h-3 mr-1" /> Pay R{entryFee.toFixed(2)}
            </Button>
          )}
          {acceptsEft && (
            <p className="text-[11px] text-muted-foreground">or pay R{entryFee.toFixed(2)} by EFT and the club will mark you paid.</p>
          )}
        </div>
      )}

      {myReg && (myReg.status === "paid" || myReg.status === "waived") && isDoubles && partnerByPlayers && (
        <div className="mt-2">
          {myReg.partner ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-primary" />
              Partner: <span className="font-medium text-foreground">{getName(myReg.partner)}</span>
              {!myReg.partner_confirmed && <Badge variant="outline" className="text-[10px] ml-1">awaiting confirmation</Badge>}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose your partner" /></SelectTrigger>
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
