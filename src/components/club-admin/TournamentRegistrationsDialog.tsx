import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubMembers } from "@/hooks/use-club";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X, Check, UserPlus, Lock, Unlock, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp, normalisePhoneForWhatsApp } from "@/lib/whatsapp";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  champ: any; // club_champs row
  clubId: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting card",
  pending_eft: "Awaiting EFT",
  paid: "Paid",
  waived: "Waived",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending_payment: "outline",
  pending_eft: "outline",
  paid: "default",
  waived: "secondary",
  cancelled: "destructive",
};

export function TournamentRegistrationsDialog({ open, onOpenChange, champ, clubId }: Props) {
  const qc = useQueryClient();
  const { data: members = [] } = useClubMembers(clubId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMemberId, setInviteMemberId] = useState<string>("");
  const [overrideRegId, setOverrideRegId] = useState<string | null>(null);
  const [overridePartnerId, setOverridePartnerId] = useState<string>("");

  const champId = champ?.id;
  const entryFee = Number(champ?.entry_fee_cents || 0) / 100;
  const isDoubles = champ?.match_type === "doubles";
  const champGender = champ?.gender as "men" | "ladies" | "mixed";

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["champ-registrations", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("*, member:club_member_id(id, name, gender, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champId && open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["champ-registrations", champId] });

  const eligibleMembersForInvite = useMemo(() => {
    if (champGender === "mixed") return members;
    const m = champGender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return members.filter((x: any) => x.gender && m.includes(x.gender.toLowerCase()));
  }, [members, champGender]);

  const registeredMemberIds = new Set(registrations.map((r: any) => r.club_member_id));

  const invitableMembers = eligibleMembersForInvite.filter((m: any) => !registeredMemberIds.has(m.id));

  const eligiblePartners = useMemo(() => {
    return eligibleMembersForInvite;
  }, [eligibleMembersForInvite]);

  // Mark EFT paid
  const markPaid = useMutation({
    mutationFn: async (reg: any) => {
      const { error } = await fromExt("club_champs_registrations")
        .update({
          status: "paid",
          fee_paid_cents: Math.round(entryFee * 100),
          paid_at: new Date().toISOString(),
          payment_ref: `EFT-${Date.now()}`,
        })
        .eq("id", reg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked as paid"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const waiveFee = useMutation({
    mutationFn: async (reg: any) => {
      const { error } = await fromExt("club_champs_registrations")
        .update({ status: "waived", paid_at: new Date().toISOString() })
        .eq("id", reg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fee waived"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelReg = useMutation({
    mutationFn: async (reg: any) => {
      const { error } = await fromExt("club_champs_registrations")
        .update({ status: "cancelled" })
        .eq("id", reg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Registration cancelled"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const inviteMember = useMutation({
    mutationFn: async (memberId: string) => {
      const fee = Number(champ?.entry_fee_cents || 0);
      const { error } = await fromExt("club_champs_registrations").insert({
        champ_id: champId,
        club_member_id: memberId,
        status: fee > 0 && champ?.payment_required ? "pending_payment" : "paid",
        invited_by_admin: true,
        fee_paid_cents: fee > 0 && champ?.payment_required ? 0 : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Player invited"); setInviteMemberId(""); setInviteOpen(false); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const overridePartner = useMutation({
    mutationFn: async ({ regId, partnerId }: { regId: string; partnerId: string | null }) => {
      const { error } = await fromExt("club_champs_registrations")
        .update({ partner_member_id: partnerId, partner_confirmed: !!partnerId })
        .eq("id", regId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Partner updated"); setOverrideRegId(null); setOverridePartnerId(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleLock = useMutation({
    mutationFn: async () => {
      const { error } = await fromExt("club_champs")
        .update({ entries_locked: !champ.entries_locked })
        .eq("id", champId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(champ.entries_locked ? "Entries unlocked" : "Entries locked — ready to schedule");
      qc.invalidateQueries({ queryKey: ["club-champs", clubId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";

  const paidCount = registrations.filter((r: any) => r.status === "paid" || r.status === "waived").length;
  const pendingCount = registrations.filter((r: any) => r.status === "pending_payment" || r.status === "pending_eft").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrations — {champ?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <Badge variant="default">Paid {paidCount}</Badge>
            <Badge variant="outline">Pending {pendingCount}</Badge>
            <Badge variant="secondary">
              Entry fee: {entryFee > 0 ? `R${entryFee.toFixed(2)}` : "Free"}
            </Badge>
            {champ?.payment_required && entryFee > 0 && <Badge variant="outline">Payment required</Badge>}
            {champ?.entries_locked && <Badge><Lock className="w-3 h-3 mr-1" />Entries locked</Badge>}
          </div>

          <div className="flex justify-between items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Invite player
            </Button>
            <Button size="sm" variant={champ?.entries_locked ? "outline" : "default"} onClick={() => toggleLock.mutate()} disabled={toggleLock.isPending}>
              {champ?.entries_locked ? <><Unlock className="w-3.5 h-3.5 mr-1" /> Unlock entries</> : <><Lock className="w-3.5 h-3.5 mr-1" /> Lock entries</>}
            </Button>
          </div>

          {inviteOpen && (
            <div className="border rounded p-2 flex items-center gap-2">
              <Select value={inviteMemberId} onValueChange={setInviteMemberId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Pick a member to invite" /></SelectTrigger>
                <SelectContent>
                  {invitableMembers.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{getName(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!inviteMemberId || inviteMember.isPending} onClick={() => inviteMember.mutate(inviteMemberId)}>
                {inviteMember.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Invite
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setInviteOpen(false); setInviteMemberId(""); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No registrations yet.</p>
          ) : (
            <div className="border rounded divide-y">
              {registrations.map((r: any) => (
                <div key={r.id} className="p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{getName(r.member)}</p>
                      {isDoubles && (
                        <p className="text-xs text-muted-foreground truncate">
                          Partner: {r.partner ? getName(r.partner) : <span className="italic">none</span>}
                          {r.partner && !r.partner_confirmed && <span className="ml-1 text-amber-600">(pending)</span>}
                        </p>
                      )}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {r.invited_by_admin && <Badge variant="outline" className="text-[10px]">Invited</Badge>}
                        {r.confirmed_at && r.confirmation_source === "rsvp" && (
                          <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Accepted</Badge>
                        )}
                        {r.status === "cancelled" && (
                          <Badge variant="destructive" className="text-[10px]">Declined</Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[r.status] || "outline"} className="text-[10px]">
                      {STATUS_LABEL[r.status] || r.status}
                    </Badge>
                    <div className="flex gap-1">
                      {(r.status === "pending_payment" || r.status === "pending_eft") && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markPaid.mutate(r)} disabled={markPaid.isPending}>
                            <Check className="w-3 h-3 mr-1" />EFT paid
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => waiveFee.mutate(r)}>Waive</Button>
                        </>
                      )}
                      {isDoubles && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOverrideRegId(r.id); setOverridePartnerId(r.partner_member_id || ""); }}>
                          Partner
                        </Button>
                      )}
                      {r.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => cancelReg.mutate(r)}>
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {overrideRegId === r.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <Select value={overridePartnerId} onValueChange={setOverridePartnerId}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Choose partner" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No partner</SelectItem>
                          {eligiblePartners
                            .filter((m: any) => m.id !== r.club_member_id)
                            .map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>{getName(m)}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => overridePartner.mutate({ regId: r.id, partnerId: overridePartnerId === "__none" ? null : overridePartnerId })} disabled={overridePartner.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setOverrideRegId(null); setOverridePartnerId(""); }}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
