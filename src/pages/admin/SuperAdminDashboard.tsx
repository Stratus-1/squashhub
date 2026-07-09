import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, Users, CreditCard, Activity, Sparkles, ShieldAlert } from "lucide-react";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export default function SuperAdminDashboard() {
  const { data: clubs } = useQuery({
    queryKey: ["sa-clubs-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clubs")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["sa-users-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["sa-members-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("club_members")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: recentBookings } = useQuery({
    queryKey: ["sa-bookings-7d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("date", since.toISOString().slice(0, 10));
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: recentClubs } = useQuery({
    queryKey: ["sa-recent-clubs"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, tenant_type, created_at, created_by")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const founderIds = (recentClubs ?? []).map((c) => c.created_by).filter(Boolean) as string[];

  const { data: founders } = useQuery({
    queryKey: ["sa-recent-club-founders", founderIds.sort().join(",")],
    enabled: founderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", founderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ledgerIntegrity } = useQuery({
    queryKey: ["sa-ledger-integrity"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("check_ledger_integrity", { p_club_id: null });
      if (error) throw error;
      return (data ?? []) as Array<{
        club_id: string;
        club_name: string;
        total_debit: number;
        total_credit: number;
        imbalance: number;
        debtors_balance: number;
        debtors_is_credit: boolean;
        bank_balance: number;
        total_income: number;
      }>;
    },
  });

  const problemClubs = (ledgerIntegrity ?? []).filter(
    (c) => Math.abs(Number(c.imbalance)) > 0.01 || c.debtors_is_credit,
  );

  const founderMap = new Map((founders ?? []).map((f) => [f.id, f]));

  const stats = [
    { label: "Total Clubs", value: clubs ?? "—", icon: Building2, color: "text-primary" },
    { label: "Registered Users", value: users ?? "—", icon: Users, color: "text-blue-500" },
    { label: "Club Members", value: members ?? "—", icon: CreditCard, color: "text-emerald-500" },
    { label: "Bookings (7d)", value: recentBookings ?? "—", icon: Activity, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <SEO title="Super Admin Dashboard" noIndex />
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-sm text-white/60 mt-1">Platform overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 backdrop-blur-md rounded-2xl p-5 flex items-start gap-4 text-white"
          >
            <div className={`p-2.5 rounded-xl bg-white/[0.04] border border-white/10 ${s.color}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-white/60">{s.label}</p>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 backdrop-blur-md rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="text-base font-semibold">Recently Registered Clubs (last 30 days)</h3>
          </div>
          <Link to="/super-admin/clubs" className="text-xs text-white/60 hover:text-white">
            View all →
          </Link>
        </div>
        {recentClubs && recentClubs.length > 0 ? (
          <div className="divide-y divide-white/10">
            {recentClubs.map((c) => {
              const f = c.created_by ? founderMap.get(c.created_by) : null;
              return (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-4 text-[13px]">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {c.name}
                      <span className="ml-2 text-white/40 font-normal">/{c.subdomain}</span>
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-white/40">
                        {c.tenant_type}
                      </span>
                    </div>
                    {f && (
                      <div className="text-white/50 text-xs truncate">
                        Founder: {f.name || "—"} {f.email ? `· ${f.email}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-white/50 text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/50">No new clubs in the last 30 days.</p>
        )}
      </Card>

      <Card className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 backdrop-blur-md rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`h-4 w-4 ${problemClubs.length > 0 ? "text-red-400" : "text-emerald-400"}`} />
            <h3 className="text-base font-semibold">
              Ledger integrity
              <span className="ml-2 text-xs text-white/50 font-normal">
                {ledgerIntegrity?.length ?? 0} clubs scanned
              </span>
            </h3>
          </div>
          <span className={`text-xs ${problemClubs.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {problemClubs.length > 0 ? `${problemClubs.length} needs attention` : "All balanced"}
          </span>
        </div>
        {problemClubs.length > 0 ? (
          <div className="divide-y divide-white/10">
            {problemClubs.map((c) => (
              <div key={c.club_id} className="py-2.5 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 text-[13px]">
                <div className="font-medium truncate">{c.club_name}</div>
                <div className="text-white/60 tabular-nums text-xs">
                  Bank R{Number(c.bank_balance).toLocaleString()}
                </div>
                <div className="text-white/60 tabular-nums text-xs">
                  Income R{Number(c.total_income).toLocaleString()}
                </div>
                <div className={`tabular-nums text-xs ${c.debtors_is_credit ? "text-amber-400" : "text-white/60"}`}>
                  Debtors R{Number(c.debtors_balance).toLocaleString()}
                  {c.debtors_is_credit && <span className="ml-1">(Cr)</span>}
                  {Math.abs(Number(c.imbalance)) > 0.01 && (
                    <span className="ml-2 text-red-400">
                      · unbalanced R{Number(c.imbalance).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">
            Every club's books balance and no accounts show an inverted sign.
          </p>
        )}
      </Card>
    </div>
  );
}

