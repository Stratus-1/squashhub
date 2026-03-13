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
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Platform overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5 flex items-start gap-4">
            <div className={`p-2.5 rounded-lg bg-muted ${s.color}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
