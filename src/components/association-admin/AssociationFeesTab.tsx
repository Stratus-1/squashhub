import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, Building2 } from "lucide-react";

interface Row {
  affiliation_id: string;
  club_member_id: string;
  league_association_number: string | null;
  active: boolean;
  member_name: string;
  club_id: string;
  club_name: string;
  league_association_id: string;
  league_name: string;
  league_fee_annual: number | null;
  members_pay_directly: boolean | null;
}

interface PaymentRow {
  id: string;
  club_member_id: string;
  amount: number;
  paid: boolean;
  fee_label: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 }).format(n);

export function AssociationFeesTab({ clubId }: { clubId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["association-fees", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_member_affiliations_v")
        .select("*")
        .eq("association_tenant_id", clubId)
        .eq("active", true);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  // Pull league-fee payments for those members so we can mark paid vs owing
  const memberIds = useMemo(() => Array.from(new Set(rows.map(r => r.club_member_id))), [rows]);
  const { data: payments = [] } = useQuery({
    queryKey: ["association-fee-payments", clubId, memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [] as PaymentRow[];
      const { data, error } = await fromExt("member_fee_payments")
        .select("id, club_member_id, amount, paid, fee_label, fee_type")
        .in("club_member_id", memberIds)
        .eq("fee_type", "league_association");
      if (error) throw error;
      return (data || []) as PaymentRow[];
    },
    enabled: memberIds.length > 0,
  });

  const payByMember = useMemo(() => {
    const map = new Map<string, PaymentRow[]>();
    payments.forEach(p => {
      if (!map.has(p.club_member_id)) map.set(p.club_member_id, []);
      map.get(p.club_member_id)!.push(p);
    });
    return map;
  }, [payments]);

  // Group rows by club for totals
  const byClub = useMemo(() => {
    const groups = new Map<string, { name: string; rows: Row[]; owed: number; paid: number }>();
    rows.forEach(r => {
      const owed = Number(r.league_fee_annual || 0);
      const memPays = payByMember.get(r.club_member_id) || [];
      const paid = memPays.filter(p => p.paid).reduce((s, p) => s + Number(p.amount || 0), 0);
      const g = groups.get(r.club_id) || { name: r.club_name, rows: [], owed: 0, paid: 0 };
      g.rows.push(r);
      g.owed += owed;
      g.paid += paid;
      groups.set(r.club_id, g);
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, payByMember]);

  const grandOwed = byClub.reduce((s, g) => s + g.owed, 0);
  const grandPaid = byClub.reduce((s, g) => s + g.paid, 0);
  const grandOutstanding = Math.max(grandOwed - grandPaid, 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Billable</p>
          <p className="text-lg font-bold">{fmt(grandOwed)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Collected</p>
          <p className="text-lg font-bold text-emerald-600">{fmt(grandPaid)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="text-lg font-bold text-amber-600">{fmt(grandOutstanding)}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Fees by Club
          </h3>
          <p className="text-xs text-muted-foreground">League fees owed via each affiliated club</p>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
        ) : byClub.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No active league members yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {byClub.map((g) => {
              const outstanding = Math.max(g.owed - g.paid, 0);
              return (
                <div key={g.name} className="border rounded-md overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Building2 className="w-4 h-4 text-muted-foreground" /> {g.name}
                      <Badge variant="outline" className="text-[10px]">{g.rows.length} members</Badge>
                    </div>
                    <div className="text-xs flex items-center gap-3">
                      <span className="text-muted-foreground">Billable: <strong className="text-foreground">{fmt(g.owed)}</strong></span>
                      <span className="text-emerald-600">Paid: {fmt(g.paid)}</span>
                      <span className="text-amber-600">Owing: {fmt(outstanding)}</span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">League #</th>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-right px-3 py-1.5 font-medium">Fee</th>
                        <th className="text-right px-3 py-1.5 font-medium">Paid</th>
                        <th className="text-right px-3 py-1.5 font-medium">Owing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(r => {
                        const owed = Number(r.league_fee_annual || 0);
                        const memPays = payByMember.get(r.club_member_id) || [];
                        const paid = memPays.filter(p => p.paid).reduce((s, p) => s + Number(p.amount || 0), 0);
                        const owing = Math.max(owed - paid, 0);
                        return (
                          <tr key={r.affiliation_id} className="border-t hover:bg-accent/30">
                            <td className="px-3 py-1.5 font-mono">{r.league_association_number || "—"}</td>
                            <td className="px-3 py-1.5">{r.member_name}</td>
                            <td className="px-3 py-1.5 text-right">{fmt(owed)}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600">{fmt(paid)}</td>
                            <td className={`px-3 py-1.5 text-right ${owing > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>{fmt(owing)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
