import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Building2, ChevronDown, Search, Trophy, Users } from "lucide-react";

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
}

interface SportyProfile {
  club_member_id: string | null;
  rankings: unknown;
  rating: number | null;
}

interface NsaEntry {
  person_id: string | null;
  player_code: string;
  rank: number;
  category: string;
}

interface DirectoryRow extends Row {
  nationalRank: number | null;
  nsaRank: number | null;
  rating: number | null;
}

function nationalRank(profile?: SportyProfile) {
  const rankings = Array.isArray(profile?.rankings) ? profile.rankings as Array<{ label?: string; position?: number }> : [];
  const match = rankings
    .filter((r) => typeof r.position === "number" && r.position > 0)
    .find((r) => /national|south africa/i.test(r.label || ""));
  return match?.position ?? null;
}

export function AssociationMembersTab({ clubId }: { clubId: string }) {
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [openClubs, setOpenClubs] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["association-members-ranked", clubId],
    queryFn: async () => {
      const { data: rows, error } = await fromExt("association_member_affiliations_v")
        .select("*")
        .eq("association_tenant_id", clubId)
        .order("club_name", { ascending: true })
        .order("member_name", { ascending: true });
      if (error) throw error;
      const baseRows = (rows || []) as Row[];
      const memberIds = baseRows.map((row) => row.club_member_id).filter(Boolean);

      const [{ data: profiles, error: profileError }, { data: snapshot, error: snapshotError }] = await Promise.all([
        memberIds.length
          ? fromExt("sportyhq_profiles").select("club_member_id, rankings, rating").in("club_member_id", memberIds)
          : Promise.resolve({ data: [], error: null }),
        fromExt("ranking_snapshots").select("id").is("association_id", null).order("computed_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (snapshotError) throw snapshotError;

      const { data: entries, error: entryError } = snapshot?.id
        ? await fromExt("ranking_snapshot_entries").select("person_id, player_code, rank, category").eq("snapshot_id", snapshot.id).eq("category", "ALL")
        : { data: [], error: null };
      if (entryError) throw entryError;

      const profileByMember = new Map<string, SportyProfile>();
      (profiles || []).forEach((profile: SportyProfile) => {
        if (profile.club_member_id) profileByMember.set(profile.club_member_id, profile);
      });
      const nsaByCode = new Map<string, number>();
      (entries || []).forEach((entry: NsaEntry) => nsaByCode.set(entry.player_code.toLowerCase(), entry.rank));

      return baseRows.map((row): DirectoryRow => {
        const profile = profileByMember.get(row.club_member_id);
        return {
          ...row,
          nationalRank: nationalRank(profile),
          nsaRank: nsaByCode.get(row.league_association_number?.toLowerCase() || "") ?? null,
          rating: profile?.rating ?? null,
        };
      });
    },
  });

  const rows = data || [];
  const clubs = useMemo(() => Array.from(new Map(rows.map((row) => [row.club_id, row.club_name])).entries()), [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (clubFilter !== "all" && row.club_id !== clubFilter) return false;
      if (!q) return true;
      return [row.member_name, row.league_association_number, row.club_name, row.member_email]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [rows, search, clubFilter]);
  const grouped = useMemo(() => {
    const map = new Map<string, DirectoryRow[]>();
    filtered.forEach((row) => map.set(row.club_id, [...(map.get(row.club_id) || []), row]));
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4 mt-4 text-[13px]">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Members by affiliated club</h3>
            <p className="text-xs text-muted-foreground">
              {rows.filter((row) => row.active).length} active members across {clubs.length} club{clubs.length === 1 ? "" : "s"} · national and NSA positions are read-only imports
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="all">All clubs</option>
              {clubs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member, NSF number or club" className="h-8 pl-7 w-[260px] text-xs" />
            </div>
          </div>
        </div>

        {isLoading ? <p className="text-xs text-muted-foreground py-8 text-center">Loading members and ranking positions…</p> : grouped.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm"><Users className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No members found.</p></div>
        ) : (
          <div className="space-y-2">
            {grouped.map(([clubIdForRows, clubRows]) => {
              const isOpen = openClubs[clubIdForRows] ?? true;
              return (
                <Collapsible key={clubIdForRows} open={isOpen} onOpenChange={(open) => setOpenClubs((current) => ({ ...current, [clubIdForRows]: open }))}>
                  <div className="rounded-md border overflow-hidden">
                    <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-left">
                      <span className="flex items-center gap-2 font-semibold"><Building2 className="w-4 h-4 text-muted-foreground" />{clubRows[0].club_name}<Badge variant="secondary" className="text-[10px]">{clubRows.length}</Badge></span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground border-t">
                            <tr><th className="text-left px-3 py-2 font-medium">Member</th><th className="text-left px-3 py-2 font-medium">NSF number</th><th className="text-right px-3 py-2 font-medium">National</th><th className="text-right px-3 py-2 font-medium">NSA</th><th className="text-right px-3 py-2 font-medium">Club status</th></tr>
                          </thead>
                          <tbody>
                            {clubRows.map((row) => (
                              <tr key={row.affiliation_id} className="border-t hover:bg-accent/30">
                                <td className="px-3 py-2"><div className="font-medium">{row.member_name}</div>{row.member_email && <div className="text-[10px] text-muted-foreground">{row.member_email}</div>}</td>
                                <td className="px-3 py-2 font-mono">{row.league_association_number || "—"}</td>
                                <td className="px-3 py-2 text-right">{row.nationalRank ? <span className="inline-flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" />#{row.nationalRank}</span> : row.rating ? `Rating ${Math.round(row.rating)}` : "—"}</td>
                                <td className="px-3 py-2 text-right">{row.nsaRank ? `#${row.nsaRank}` : "—"}</td>
                                <td className="px-3 py-2 text-right"><Badge variant={row.active ? "default" : "outline"} className="text-[10px]">{row.active ? "Active" : "Inactive"}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
