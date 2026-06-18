import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { toast } from "sonner";
import { Loader2, UserPlus, Users, Check, X, Trash2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  /** The current active club member (grantor / delegate identity). */
  clubMemberId: string | null;
  clubId: string | null;
  memberName?: string | null;
}

type Delegation = {
  id: string;
  club_id: string;
  grantor_member_id: string;
  delegate_member_id: string;
  status: "pending" | "active" | "declined" | "revoked";
  scope: string;
  requested_at: string;
  responded_at: string | null;
};

export function SharedAccessCard({ clubMemberId, clubId, memberName }: Props) {
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [memberNo, setMemberNo] = useState("");
  const [cell, setCell] = useState("");

  const { data: delegations, isLoading } = useQuery({
    queryKey: ["account-delegations", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_account_delegations")
        .select("*")
        .or(`grantor_member_id.eq.${clubMemberId},delegate_member_id.eq.${clubMemberId}`)
        .in("status", ["pending", "active"])
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Delegation[];
    },
    enabled: !!clubMemberId,
  });

  // Fetch names for all involved members in one go
  const memberIds = Array.from(new Set(
    (delegations || []).flatMap((d) => [d.grantor_member_id, d.delegate_member_id])
  ));
  const { data: memberMap } = useQuery({
    queryKey: ["delegation-members", memberIds.sort().join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return {} as Record<string, any>;
      const { data, error } = await fromExt("club_members")
        .select("id, name, club_member_number")
        .in("id", memberIds);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const m of data || []) map[(m as any).id] = m;
      return map;
    },
    enabled: memberIds.length > 0,
  });

  const grantedByMe = (delegations || []).filter((d) => d.grantor_member_id === clubMemberId);
  const grantedToMe = (delegations || []).filter((d) => d.delegate_member_id === clubMemberId);
  const pendingForMe = grantedToMe.filter((d) => d.status === "pending");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("request_account_delegation", {
        _grantor_member_id: clubMemberId,
        _delegate_member_number: memberNo.trim(),
        _delegate_cell: cell.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Request sent — they'll be notified to accept");
      setGrantOpen(false);
      setMemberNo("");
      setCell("");
      qc.invalidateQueries({ queryKey: ["account-delegations"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not send request"),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await fromExt("member_account_delegations")
        .update({ status: accept ? "active" : "declined", responded_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.accept ? "Access granted" : "Request declined");
      qc.invalidateQueries({ queryKey: ["account-delegations"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("member_account_delegations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["account-delegations"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  if (!clubMemberId) return null;

  return (
    <motion.div
      className="px-4 mt-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
    >
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold font-heading">Shared Access</h2>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setGrantOpen(true)}>
            <UserPlus className="w-3 h-3" /> Grant access
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground mb-3">
          Let a family member view and pay your account. They'll see your fees in their own account.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            {pendingForMe.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                  Requests for you to accept
                </p>
                <div className="space-y-1.5">
                  {pendingForMe.map((d) => {
                    const g = memberMap?.[d.grantor_member_id];
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-amber-500/5 border-amber-500/20">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{g?.name || "Member"}</p>
                          <p className="text-[10px] text-muted-foreground">#{g?.club_member_number || "—"} wants you to manage their fees</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" className="h-7 px-2 gap-1" disabled={respondMutation.isPending}
                            onClick={() => respondMutation.mutate({ id: d.id, accept: true })}>
                            <Check className="w-3 h-3" /> Accept
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={respondMutation.isPending}
                            onClick={() => respondMutation.mutate({ id: d.id, accept: false })}>
                            <X className="w-3 h-3" /> Decline
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {grantedByMe.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                  People who can manage your account
                </p>
                <div className="space-y-1.5">
                  {grantedByMe.map((d) => {
                    const m = memberMap?.[d.delegate_member_id];
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-muted/30">
                        <div className="min-w-0 flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{m?.name || "Member"}</p>
                            <p className="text-[10px] text-muted-foreground">#{m?.club_member_number || "—"}</p>
                          </div>
                          <Badge variant={d.status === "active" ? "default" : "secondary"} className="text-[9px] h-4 px-1.5">
                            {d.status === "active" ? "Active" : "Pending"}
                          </Badge>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" disabled={revokeMutation.isPending}
                          onClick={() => {
                            if (confirm("Revoke this person's access?")) revokeMutation.mutate(d.id);
                          }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {grantedToMe.filter((d) => d.status === "active").length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                  Accounts you manage
                </p>
                <div className="space-y-1.5">
                  {grantedToMe.filter((d) => d.status === "active").map((d) => {
                    const m = memberMap?.[d.grantor_member_id];
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                        <div className="min-w-0 flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{m?.name || "Member"}</p>
                            <p className="text-[10px] text-muted-foreground">#{m?.club_member_number || "—"} · view & pay fees</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Tip: switch the active profile (top of dashboard) to a linked person to view and pay their fees.
                </p>
              </div>
            )}

            {grantedByMe.length === 0 && grantedToMe.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                No shared access set up yet.
              </p>
            )}
          </div>
        )}
      </Card>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Grant account access</DialogTitle>
            <DialogDescription>
              Enter the person's club member number and cell phone. Both must match for the request to send.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1">
              <Label className="text-xs">Member number</Label>
              <Input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} placeholder="e.g. 1234" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cell phone</Label>
              <Input value={cell} onChange={(e) => setCell(e.target.value)} placeholder="e.g. 082 123 4567" className="h-9" inputMode="tel" />
            </div>
            <div className="p-2 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
              They will get a notification to accept before they can see your account. You can revoke access at any time.
            </div>
            <Button className="w-full" disabled={requestMutation.isPending || !memberNo.trim() || !cell.trim()}
              onClick={() => requestMutation.mutate()}>
              {requestMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Send request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
