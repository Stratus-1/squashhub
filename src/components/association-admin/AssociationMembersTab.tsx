import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Building2 } from "lucide-react";

interface Row {
  affiliation_id: string;
  club_member_id: string;
  league_association_number: string | null;
  active: boolean;
  joined_at: string;
  member_name: string;
  member_email: string | null;
  gender: string | null;
  club_id: string;
  club_name: string;
  club_subdomain: string | null;
  league_name: string;
  league_fee_annual: number | null;
}

export function AssociationMembersTab({ clubId }: { clubId: string }) {
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["association-members", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_member_affiliations_v")
        .select("*")
        .eq("association_tenant_id", clubId)
        .order("league_association_number", { ascending: true });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const clubs = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.club_id, r.club_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (clubFilter !== "all" && r.club_id !== clubFilter) return false;
      if (!q) return true;
      return (
        r.member_name?.toLowerCase().includes(q) ||
        r.league_association_number?.toLowerCase().includes(q) ||
        r.club_name?.toLowerCase().includes(q) ||
        r.member_email?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, clubFilter]);

  const activeCount = rows.filter(r => r.active).length;

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> League Members
            </h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} active member{activeCount === 1 ? "" : "s"} across {clubs.length} club{clubs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={clubFilter}
              onChange={(e) => setClubFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="all">All clubs</option>
              {clubs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, number, email"
                className="h-8 pl-7 w-[240px] text-xs"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No league members found.</p>
            <p className="text-xs mt-1">Members joining via affiliated clubs will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">League #</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Club</th>
                  <th className="text-left px-3 py-2 font-medium">League</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.affiliation_id} className="border-t hover:bg-accent/30">
                    <td className="px-3 py-2 font-mono font-semibold">{r.league_association_number || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.member_name}</div>
                      {r.member_email && <div className="text-[10px] text-muted-foreground">{r.member_email}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {r.club_name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.league_name}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.active ? "default" : "outline"} className="text-[10px]">
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
