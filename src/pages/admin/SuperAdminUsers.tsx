import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEO } from "@/components/SEO";
import { Search, Shield, User } from "lucide-react";
import { format } from "date-fns";

export default function SuperAdminUsers() {
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["sa-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, phone, rank, matches_played, wins, losses, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["sa-all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data || [];
    },
  });

  const roleMap = useMemo(() => {
    const m = new Map<string, string[]>();
    roles.forEach((r: any) => {
      const arr = m.get(r.user_id) || [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    });
    return m;
  }, [roles]);

  const filtered = profiles.filter((p: any) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <SEO title="Users — Super Admin" noIndex />
      <div>
        <h2 className="text-2xl font-bold text-foreground">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">{profiles.length} registered users</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-center">Rank</TableHead>
              <TableHead className="text-center">Matches</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell>
              </TableRow>
            ) : (
              filtered.map((p: any) => {
                const userRoles = roleMap.get(p.id) || [];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {userRoles.length === 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <User className="h-3 w-3" /> member
                          </Badge>
                        )}
                        {userRoles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs gap-1">
                            <Shield className="h-3 w-3" /> {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">—</TableCell>
                    <TableCell className="text-center">{p.matches_played}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.created_at), "dd MMM yyyy")}
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
