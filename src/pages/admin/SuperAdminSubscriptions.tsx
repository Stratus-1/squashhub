import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { Building2 } from "lucide-react";

export default function SuperAdminSubscriptions() {
  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["sa-clubs-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, logo_url, subdomain, member_fee_annual, member_fee_due_month, created_at")
        .order("name");
      if (error) throw error;

      // Get member counts per club
      const { data: members } = await supabase.from("club_members").select("club_id");
      const countMap = new Map<string, number>();
      (members || []).forEach((m: any) => {
        countMap.set(m.club_id, (countMap.get(m.club_id) || 0) + 1);
      });

      return (data || []).map((c: any) => ({
        ...c,
        member_count: countMap.get(c.id) || 0,
      }));
    },
  });

  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="space-y-6">
      <SEO title="Subscriptions — Super Admin" noIndex />
      <div>
        <h2 className="text-2xl font-bold text-foreground">Subscriptions & Fees</h2>
        <p className="text-sm text-muted-foreground mt-1">Club membership fees overview</p>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-center">Members</TableHead>
              <TableHead className="text-right">Annual Fee</TableHead>
              <TableHead>Due Month</TableHead>
              <TableHead className="text-right">Est. Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : clubs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No clubs</TableCell>
              </TableRow>
            ) : (
              clubs.map((club: any) => {
                const fee = Number(club.member_fee_annual) || 0;
                const est = fee * club.member_count;
                return (
                  <TableRow key={club.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {club.logo_url ? (
                          <img src={club.logo_url} alt="" className="h-8 w-8 rounded-md object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-foreground">{club.name}</span>
                          {club.subdomain && (
                            <p className="text-xs text-muted-foreground">{club.subdomain}.squashhub.co.za</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{club.member_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fee > 0 ? `R ${fee.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>
                      {club.member_fee_due_month
                        ? monthNames[club.member_fee_due_month] || `Month ${club.member_fee_due_month}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {est > 0 ? `R ${est.toLocaleString()}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
