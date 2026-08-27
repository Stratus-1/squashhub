import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Check, X } from "lucide-react";
import { useState } from "react";

interface Props {
  clubId: string;
}

interface PendingApplicant {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  applied_at: string | null;
}

/**
 * Membership applications that came in from the public landing page / QR code.
 * Pending applicants have no member-scoped access to club data until they are
 * activated (automatically on payment, or here by an admin).
 */
export function PendingApplicationsPanel({ clubId }: Props) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: pending = [] } = useQuery({
    queryKey: ["pending-applications", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("club_members")
        .select("id, name, email, phone, gender, applied_at")
        .eq("club_id", clubId)
        .eq("is_pending_approval", true)
        .order("applied_at", { ascending: true });
      if (error) throw error;
      return (data || []) as PendingApplicant[];
    },
    enabled: !!clubId,
  });

  const review = async (member: PendingApplicant, approve: boolean) => {
    setBusyId(member.id);
    const { error } = await (supabase.rpc as any)("review_membership_application", {
      _member_id: member.id,
      _approve: approve,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      approve
        ? `${member.name || "Applicant"} approved`
        : `${member.name || "Applicant"}'s application declined`,
    );
    qc.invalidateQueries({ queryKey: ["pending-applications", clubId] });
    qc.invalidateQueries({ queryKey: ["club-members", clubId] });
    qc.invalidateQueries({ queryKey: ["club-members"] });
  };

  if (!pending.length) return null;

  return (
    <Card className="p-3 border-amber-500/50 bg-amber-500/5 space-y-2">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-amber-600" />
        <h3 className="text-[13px] font-semibold">Membership applications</h3>
        <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
          {pending.length} pending
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        These people signed up themselves. They can only see their own record and fee statement until you approve
        them (or their first fee is paid, depending on your activation setting).
      </p>
      <div className="space-y-1.5">
        {pending.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5"
          >
            <span className="text-[12px] font-medium truncate flex-1 min-w-[120px]">{p.name || "—"}</span>
            <span className="text-[10px] text-muted-foreground truncate">{p.email || ""}</span>
            <span className="text-[10px] text-muted-foreground truncate">{p.phone || ""}</span>
            <div className="flex gap-1 ml-auto">
              <Button
                size="sm"
                className="h-6 text-[11px] gap-1"
                disabled={busyId === p.id}
                onClick={() => review(p, true)}
              >
                <Check className="w-3 h-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1 text-destructive border-destructive/40"
                disabled={busyId === p.id}
                onClick={() => review(p, false)}
              >
                <X className="w-3 h-3" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
