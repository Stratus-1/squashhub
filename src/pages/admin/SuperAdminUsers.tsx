import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEO } from "@/components/SEO";
import { Search, Shield, User, Building2 } from "lucide-react";
import { format } from "date-fns";

export default function SuperAdminUsers() {
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["sa-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, phone, rank, matches_played, wins, losses, created_at")
        .order("created_at", { ascending: false })
        .range(0, 49999);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["sa-all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role").range(0, 49999);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all club_members with club info to know linkage and admin status
  const { data: clubMembers = [] } = useQuery({
    queryKey: ["sa-club-members-linked"],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("user_id, role, club_id")
        .not("user_id", "is", null);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all clubs for name lookup
  const { data: clubs = [] } = useQuery({
    queryKey: ["sa-clubs-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id, name, created_by");
      if (error) throw error;
      return data || [];
    },
  });

  // Build club name lookup
  const clubNameMap = useMemo(() => {
    const m = new Map<string, string>();
    clubs.forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [clubs]);

  // Build club creator set
  const clubCreatorIds = useMemo(() => {
    const s = new Set<string>();
    clubs.forEach((c: any) => { if (c.created_by) s.add(c.created_by); });
    return s;
  }, [clubs]);

  // Build maps: club-linked user ids, club admin user ids, and user->club name
  const { clubLinkedUserIds, clubAdminUserIds, userClubMap } = useMemo(() => {
    const linked = new Set<string>();
    const admins = new Set<string>();
    const clubMap = new Map<string, string>();
    clubMembers.forEach((cm: any) => {
      if (cm.user_id) {
        linked.add(cm.user_id);
        const clubName = clubNameMap.get(cm.club_id);
        if (clubName) clubMap.set(cm.user_id, clubName);
        if (cm.role === 'admin' || cm.role === 'captain') {
          admins.add(cm.user_id);
        }
      }
    });
    // Also mark club creators as admins and link their club
    clubs.forEach((c: any) => {
      if (c.created_by) {
        if (!clubMap.has(c.created_by) && c.name) clubMap.set(c.created_by, c.name);
        admins.add(c.created_by);
      }
    });
    return { clubLinkedUserIds: linked, clubAdminUserIds: admins, userClubMap: clubMap };
  }, [clubMembers, clubNameMap, clubs]);

  const roleMap = useMemo(() => {
    const m = new Map<string, string[]>();
    roles.forEach((r: any) => {
      const arr = m.get(r.user_id) || [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    });
    return m;
  }, [roles]);

  // Show: platform role holders, club admins/captains/creators, OR unaffiliated users
  const platformUsers = useMemo(() => {
    return profiles.filter((p: any) => {
      const hasRole = roleMap.has(p.id);
      const isClubAdmin = clubAdminUserIds.has(p.id);
      const isClubCreator = clubCreatorIds.has(p.id);
      const isClubLinked = clubLinkedUserIds.has(p.id);
      // Show platform admins/moderators, club admins/creators, and unaffiliated users
      return hasRole || isClubAdmin || isClubCreator || !isClubLinked;
    });
  }, [profiles, roleMap, clubAdminUserIds, clubCreatorIds, clubLinkedUserIds]);

  const filtered = platformUsers.filter((p: any) => {
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
        <h2 className="text-2xl font-bold text-foreground">Platform Users</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {platformUsers.length} platform users (admins, club admins &amp; unaffiliated).
          Regular club members appear under each club's admin panel.
        </p>
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
              <TableHead>Club</TableHead>
              <TableHead>Roles</TableHead>
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
                const clubName = userClubMap.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell>
                      {clubName ? (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Building2 className="h-3 w-3" /> {clubName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {userRoles.length === 0 && !clubAdminUserIds.has(p.id) && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <User className="h-3 w-3" /> unaffiliated
                          </Badge>
                        )}
                        {clubAdminUserIds.has(p.id) && !userRoles.includes("admin") && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Shield className="h-3 w-3" /> club admin
                          </Badge>
                        )}
                        {userRoles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs gap-1">
                            <Shield className="h-3 w-3" /> {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
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
