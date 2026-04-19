import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, CheckCircle2, Clock, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface JoinedAssociationsCardProps {
  clubId: string | null | undefined;
  className?: string;
}

interface AssociationRow {
  id: string;
  name: string;
  subdomain: string | null;
  member_number: string | null;
  league_fee_paid: boolean;
  league_fee_amount: number;
}

/**
 * Persistent status tile showing every association the member has opted into,
 * with their league number (allocated by the association admin) and fee status.
 */
export function JoinedAssociationsCard({ clubId, className }: JoinedAssociationsCardProps) {
  const { user } = useAuth();

  // 1. Find associations affiliated to this club
  const { data: affiliated = [] } = useQuery({
    queryKey: ["affiliated-associations-status", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("association_affiliated_clubs")
        .select("association:association_tenant_id(id, name, subdomain, tenant_type)")
        .eq("club_id", clubId!)
        .eq("status", "active");
      if (error) throw error;
      return ((data || []) as any[])
        .map((r) => r.association)
        .filter((a) => a && a.tenant_type === "association");
    },
  });

  const associationIds = affiliated.map((a: any) => a.id);

  // 2. Find which of those the member has actually joined (i.e. has a member row at)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["joined-associations-status", user?.id, associationIds.sort().join(",")],
    enabled: !!user?.id && associationIds.length > 0,
    queryFn: async (): Promise<AssociationRow[]> => {
      const { data: members, error } = await fromExt("club_members")
        .select("id, club_id, club_member_number")
        .eq("user_id", user!.id)
        .in("club_id", associationIds);
      if (error) throw error;

      const list: AssociationRow[] = [];
      for (const m of (members || []) as any[]) {
        const assoc = affiliated.find((a: any) => a.id === m.club_id);
        if (!assoc) continue;

        // Look up association / league-affiliation fees at the association tenant.
        // The association admin sets these up — typically fee_type = 'association'
        // or 'league_affiliation'. We treat ALL fees on the association tenant as
        // affiliation fees (since the tenant only bills affiliation-related dues).
        const { data: fees } = await fromExt("club_member_fee_payments")
          .select("amount, paid, fee_type, fee_label")
          .eq("club_member_id", m.id);

        const affiliationFees = (fees || []).filter((f: any) => {
          const t = String(f.fee_type || "").toLowerCase();
          const l = String(f.fee_label || "").toLowerCase();
          return (
            t === "association" ||
            t === "league_affiliation" ||
            t === "league" ||
            l.includes("league") ||
            l.includes("affiliation")
          );
        });
        const totalDue = affiliationFees
          .filter((f: any) => !f.paid)
          .reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);
        const allPaid = affiliationFees.length > 0 && affiliationFees.every((f: any) => f.paid);

        list.push({
          id: assoc.id,
          name: assoc.name,
          subdomain: assoc.subdomain,
          member_number: m.club_member_number || null,
          league_fee_paid: allPaid,
          league_fee_amount: totalDue,
        });
      }
      return list;
    },
  });

  if (isLoading) {
    return (
      <Card className={cn("p-4 flex items-center gap-2", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Checking association memberships…</span>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Joined league associations</h3>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const hasNumber = !!row.member_number;
          const isActive = hasNumber && row.league_fee_paid;
          return (
            <div
              key={row.id}
              className="rounded-md border border-border bg-card/50 p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{row.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {isActive ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Active · League # {row.member_number}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                      <Clock className="w-3 h-3" />
                      Inactive
                      {hasNumber ? ` · League # ${row.member_number}` : " · awaiting league #"}
                    </Badge>
                  )}
                  {!isActive && (
                    row.league_fee_amount > 0 ? (
                      <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive">
                        <Wallet className="w-3 h-3" />
                        R{row.league_fee_amount.toFixed(2)} fees due
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Clock className="w-3 h-3" />
                        Fees pending allocation
                      </Badge>
                    )
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                  {isActive
                    ? "You're active at this association. Fixtures and results will appear here."
                    : hasNumber
                      ? "Your league number is allocated. Pay the league fee to become active."
                      : "The association admin will allocate your league number. You'll become active once fees are paid."}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
