import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, Users, CreditCard, Activity } from "lucide-react";
import { SEO } from "@/components/SEO";

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
            className="admin-glass p-5 flex items-start gap-4 border-white/10 bg-white/5 backdrop-blur-xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] hover:bg-white/[0.08] transition-colors"
          >
            <div className={`p-2.5 rounded-lg bg-white/10 ring-1 ring-white/10 ${s.color}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-white/60">{s.label}</p>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
