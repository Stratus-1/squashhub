import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PassThroughFee {
  id: string;
  fee_label: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  linked_fee_payment_id: string | null;
  club_member_id: string;
  created_at: string;
  club_members: {
    id: string;
    name: string | null;
    club_member_number: string | null;
    club_id: string;
  } | null;
}

interface LinkedAssocRow {
  id: string;
  club_member_id: string;
  club_members: { club_id: string; clubs: { id: string; name: string } | null } | null;
}

/**
 * Shows pass-through league/affiliation fees the club has *collected* from members
 * but not yet physically remitted to the receiving association tenant.
 *
 * Rule: a fee is "collected" once `paid = true` on the club-side row. The trigger
 * automatically flips the linked association-side row to paid (so the member is
 * activated immediately at the league). This panel tracks the cash settlement
 * the club still owes the league for those collections.
 */
export function RemittancesPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [settling, setSettling] = useState<string | null>(null);

  // 1) All pass-through fees collected by THIS club from its members
  const { data: ptFees, isLoading } = useQuery({
    queryKey: ["club-pass-through-fees", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, fee_label, amount, paid, paid_at, linked_fee_payment_id, club_member_id, created_at, club_members!inner(id, name, club_member_number, club_id)")
        .eq("is_pass_through", true)
        .eq("club_members.club_id", clubId)
        .not("linked_fee_payment_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PassThroughFee[];
    },
    enabled: !!clubId,
  });

  // 2) For each linked row, look up the receiving association tenant's name
  const linkedIds = useMemo(
    () => (ptFees || []).map((f) => f.linked_fee_payment_id).filter(Boolean) as string[],
    [ptFees],
  );

  const { data: linkedRows } = useQuery({
    queryKey: ["linked-assoc-fees", linkedIds],
    queryFn: async () => {
      if (linkedIds.length === 0) return [] as LinkedAssocRow[];
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, club_member_id, club_members!inner(club_id, clubs:club_id(id, name))")
        .in("id", linkedIds);
      if (error) throw error;
      return (data || []) as LinkedAssocRow[];
    },
    enabled: linkedIds.length > 0,
  });

  // 3) Group by receiving association tenant
  const grouped = useMemo(() => {
    const linkedMap = new Map<string, { id: string; name: string }>();
    (linkedRows || []).forEach((row) => {
      const club = row.club_members?.clubs;
      if (club && row.id) linkedMap.set(row.id, club);
    });

    type Group = {
      assocId: string;
      assocName: string;
      collected: PassThroughFee[];
      uncollected: PassThroughFee[];
    };
    const map = new Map<string, Group>();

    (ptFees || []).forEach((fee) => {
      const assoc = fee.linked_fee_payment_id ? linkedMap.get(fee.linked_fee_payment_id) : null;
      if (!assoc) return;
      if (!map.has(assoc.id)) {
        map.set(assoc.id, { assocId: assoc.id, assocName: assoc.name, collected: [], uncollected: [] });
      }
      const g = map.get(assoc.id)!;
      if (fee.paid) g.collected.push(fee);
      else g.uncollected.push(fee);
    });

    return Array.from(map.values()).sort((a, b) => a.assocName.localeCompare(b.assocName));
  }, [ptFees, linkedRows]);

  /** Mark all collected (but not-yet-remitted) fees for an association as physically settled.
   *  Posts: Dr "Owed to <Assoc>" (creditors) / Cr Bank Current. */
  const handleSettle = async (group: typeof grouped[number]) => {
    const totalAmount = group.collected.reduce((s, f) => s + Number(f.amount), 0);
    if (totalAmount <= 0) return;

    setSettling(group.assocId);
    try {
      const journalRef = crypto.randomUUID();
      const desc = `Remittance to ${group.assocName} (${group.collected.length} member${group.collected.length === 1 ? "" : "s"})`;

      const { error } = await fromExt("club_journal_entries").insert([
        {
          club_id: clubId,
          journal_ref: journalRef,
          account: "creditors",
          debit: totalAmount,
          credit: 0,
          description: desc,
        },
        {
          club_id: clubId,
          journal_ref: journalRef,
          account: "bank_current",
          debit: 0,
          credit: totalAmount,
          description: desc,
        },
      ]);
      if (error) throw error;

      toast.success(`Recorded R${totalAmount.toFixed(2)} remittance to ${group.assocName}`);
      qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
      qc.invalidateQueries({ queryKey: ["club-pass-through-fees", clubId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to record remittance");
    } finally {
      setSettling(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading remittances…</p>;
  }

  if (grouped.length === 0) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No pass-through fees to remit.</p>
        <p className="text-xs text-muted-foreground mt-1">
          When you collect league fees on behalf of a partner association, they will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map((group) => {
        const collectedTotal = group.collected.reduce((s, f) => s + Number(f.amount), 0);
        const uncollectedTotal = group.uncollected.reduce((s, f) => s + Number(f.amount), 0);

        return (
          <Card key={group.assocId} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  {group.assocName}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Collected on behalf of this association
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Owed to {group.assocName}</p>
                <p className={cn("text-xl font-bold tabular-nums", collectedTotal > 0 ? "text-primary" : "text-muted-foreground")}>
                  R{collectedTotal.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Ready to remit */}
            {group.collected.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-accent/40 px-3 py-2 border-b flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
                    Ready to Remit ({group.collected.length})
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleSettle(group)}
                    disabled={settling === group.assocId}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <Send className="w-3 h-3" />
                    {settling === group.assocId ? "Recording…" : `Mark R${collectedTotal.toFixed(2)} Remitted`}
                  </Button>
                </div>
                <div className="divide-y">
                  {group.collected.map((fee) => (
                    <div key={fee.id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{fee.club_members?.name || "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {fee.club_members?.club_member_number || "—"} · {fee.fee_label}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">R{Number(fee.amount).toFixed(2)}</p>
                        <Badge variant="outline" className="text-[9px] mt-0.5">collected</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Awaiting collection from members */}
            {group.uncollected.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 border-b flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Awaiting Member Payment ({group.uncollected.length}) · R{uncollectedTotal.toFixed(2)}
                  </p>
                </div>
                <div className="divide-y">
                  {group.uncollected.map((fee) => (
                    <div key={fee.id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{fee.club_members?.name || "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {fee.club_members?.club_member_number || "—"} · {fee.fee_label}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums text-muted-foreground">R{Number(fee.amount).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
