import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Clock } from "lucide-react";

interface ClaimRow {
  id: string;
  club_id: string;
  requester_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  claimed_role: string;
  note: string | null;
  status: string;
  created_at: string;
  clubs?: { name: string; subdomain: string | null } | null;
}

export function ClubClaimsPanel() {
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["club-claim-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("club_claim_requests")
        .select("*, clubs:club_id(name, subdomain)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ClaimRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("approve_club_claim", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim approved — the requester is now a club admin.");
      qc.invalidateQueries({ queryKey: ["club-claim-requests"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to approve claim"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase.rpc as any)("reject_club_claim", { _request_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim rejected.");
      qc.invalidateQueries({ queryKey: ["club-claim-requests"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to reject claim"),
  });

  const pending = claims.filter((c) => c.status === "pending");
  const reviewed = claims.filter((c) => c.status !== "pending").slice(0, 10);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Club claims</h2>
        {pending.length > 0 && <Badge variant="destructive">{pending.length} pending</Badge>}
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && pending.length === 0 && (
        <p className="text-xs text-muted-foreground">No claims awaiting review.</p>
      )}

      {pending.map((c) => (
        <div key={c.id} className="rounded-lg border p-3 space-y-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.clubs?.name || "Unknown club"}</span>
            {c.clubs?.subdomain && (
              <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{c.clubs.subdomain}</code>
            )}
            <Badge variant="outline" className="text-[10px]">
              <Clock className="w-3 h-3 mr-1" />
              {new Date(c.created_at).toLocaleDateString()}
            </Badge>
          </div>
          <div className="text-muted-foreground">
            {c.requester_name || "Unnamed"} · {c.claimed_role}
            {c.requester_email ? ` · ${c.requester_email}` : ""}
            {c.requester_phone ? ` · ${c.requester_phone}` : ""}
          </div>
          {c.note && <p className="italic text-muted-foreground">“{c.note}”</p>}
          <Textarea
            placeholder="Reason (only used when rejecting)"
            value={reasons[c.id] || ""}
            onChange={(e) => setReasons((p) => ({ ...p, [c.id]: e.target.value }))}
            className="min-h-[52px] text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => approve.mutate(c.id)} disabled={approve.isPending}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reject.mutate({ id: c.id, reason: reasons[c.id] || "" })}
              disabled={reject.isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}

      {reviewed.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          {reviewed.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{c.clubs?.name} — {c.requester_name}</span>
              <Badge variant={c.status === "approved" ? "secondary" : "outline"} className="text-[10px]">
                {c.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
