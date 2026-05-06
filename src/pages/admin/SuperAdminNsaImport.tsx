// Super-Admin: Bulk-provision NSA Pretoria clubs
// ---------------------------------------------------------------
// Lists every club that appears in the current NSA league season,
// computes a proposed slug (first 3 letters of any team code),
// shows existing/conflicting status, and lets admin tick which
// clubs to provision as `nsa_seeded` tenants.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Loader2, RefreshCw, Users } from "lucide-react";
import { useNsaFixtures, NSA_CURRENT_SEASON } from "@/hooks/use-nsa";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ClubRow = {
  nsa_club_id: string;
  name: string;
  proposed_slug: string;
  team_count: number;
  divisions: string[];
  existing_subdomain: string | null;
  existing_club_id: string | null;
  roster_seeded_at: string | null;
};

function slugFromCode(code: string): string {
  return (code || "").slice(0, 3).toLowerCase().replace(/[^a-z]/g, "");
}

export default function SuperAdminNsaImport() {
  const qc = useQueryClient();
  const [season, setSeason] = useState(NSA_CURRENT_SEASON);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const { data: fixtures = [], isLoading: fxLoading, refetch: refetchFx } = useNsaFixtures({
    league: season,
    status: "completed",
  });

  // Existing nsa_seeded / nsa_club_id lookup so we can mark already-imported clubs
  const { data: existing = [] } = useQuery({
    queryKey: ["clubs-with-nsa-id"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, nsa_club_id, tenant_type")
        .or("nsa_club_id.not.is.null,subdomain.not.is.null");
      if (error) throw error;
      return data || [];
    },
  });

  const rows: ClubRow[] = useMemo(() => {
    const map = new Map<string, ClubRow>();
    for (const f of fixtures) {
      for (const t of [f.team1, f.team2]) {
        if (!t?.club_id) continue;
        if (!map.has(t.club_id)) {
          const proposed = slugFromCode(t.code) || `nsa${t.club_id}`;
          const existingByNsa = (existing as any[]).find((c) => c.nsa_club_id === t.club_id);
          const existingBySlug = (existing as any[]).find((c) => c.subdomain === proposed);
          map.set(t.club_id, {
            nsa_club_id: t.club_id,
            name: t.club,
            proposed_slug: proposed,
            team_count: 0,
            divisions: [],
            existing_subdomain: existingByNsa?.subdomain || existingBySlug?.subdomain || null,
            existing_club_id: existingByNsa?.id || existingBySlug?.id || null,
          });
        }
        const r = map.get(t.club_id)!;
        r.team_count += 1;
        const div = `${f.category} ${f.league}`;
        if (!r.divisions.includes(div)) r.divisions.push(div);
      }
    }
    // Each fixture contributes 2 teams but each team appears in many fixtures —
    // dedupe team_count properly via team code instead.
    const codeMap = new Map<string, Set<string>>();
    for (const f of fixtures) {
      for (const t of [f.team1, f.team2]) {
        if (!t?.club_id) continue;
        if (!codeMap.has(t.club_id)) codeMap.set(t.club_id, new Set());
        codeMap.get(t.club_id)!.add(t.code);
      }
    }
    for (const [cid, codes] of codeMap) {
      const r = map.get(cid);
      if (r) r.team_count = codes.size;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fixtures, existing]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(f) || r.proposed_slug.includes(f));
  }, [rows, filter]);

  const toggleAll = () => {
    const eligible = filtered.filter((r) => !r.existing_club_id).map((r) => r.nsa_club_id);
    if (eligible.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const provision = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("nsa-bulk-provision-clubs", {
        body: { season, nsa_club_ids: Array.from(selected) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(
        `Provisioned ${res.created_count} clubs. ${res.skipped_count} skipped, ${res.error_count} errors.`
      );
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["clubs-with-nsa-id"] });
    },
    onError: (e: any) => toast.error(e.message || "Provision failed"),
  });

  const [seedingClubId, setSeedingClubId] = useState<string | null>(null);
  const seedRoster = useMutation({
    mutationFn: async (clubId: string) => {
      setSeedingClubId(clubId);
      const { data, error } = await supabase.functions.invoke("nsa-seed-club-roster", {
        body: { club_id: clubId, season },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (res: any) => {
      const errs = (res?.player_errors || []).length;
      toast.success(
        `Seeded: ${res.leagues_created} leagues, ${res.members_created} members, ${res.registrations_created} registrations${errs ? ` (${errs} warnings)` : ""}`
      );
      setSeedingClubId(null);
    },
    onError: (e: any) => {
      toast.error(e.message || "Seed failed");
      setSeedingClubId(null);
    },
  });

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-amber-300" />
          <div>
            <h1 className="text-xl font-bold text-white">NSA Bulk Club Import</h1>
            <p className="text-xs text-white/60">
              Provisions clubs from the NSA league API as free-tier tenants (until 30 Sep 2026).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchFx()}
          disabled={fxLoading}
          className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${fxLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card className="p-4 bg-white/[0.04] border-white/10 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/60">Season</label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-8 w-24 bg-white/[0.04] border-white/15 text-white"
            />
          </div>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter clubs…"
            className="h-8 max-w-xs bg-white/[0.04] border-white/15 text-white"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
            >
              Toggle eligible
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0 || provision.isPending}
              onClick={() => provision.mutate()}
              className="bg-amber-500 hover:bg-amber-400 text-black"
            >
              {provision.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Provision {selected.size} club{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>

        {fxLoading ? (
          <div className="py-12 text-center text-white/60">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading NSA fixtures…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] text-white/85">
              <thead className="text-white/55 uppercase tracking-wide text-[11px]">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-3 w-8"></th>
                  <th className="text-left py-2 pr-3">Club</th>
                  <th className="text-left py-2 pr-3">NSA #</th>
                  <th className="text-left py-2 pr-3">Slug</th>
                  <th className="text-left py-2 pr-3">Teams</th>
                  <th className="text-left py-2 pr-3">Divisions</th>
                  <th className="text-left py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isExisting = !!r.existing_club_id;
                  return (
                    <tr key={r.nsa_club_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={selected.has(r.nsa_club_id)}
                          onCheckedChange={() => toggleOne(r.nsa_club_id)}
                          disabled={isExisting}
                        />
                      </td>
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-white/55 font-mono text-[12px]">{r.nsa_club_id}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-amber-300">
                        {r.existing_subdomain || r.proposed_slug}
                      </td>
                      <td className="py-2 pr-3">{r.team_count}</td>
                      <td className="py-2 pr-3 text-white/65 text-[12px]">
                        {r.divisions.slice(0, 4).join(", ")}
                        {r.divisions.length > 4 && ` +${r.divisions.length - 4}`}
                      </td>
                      <td className="py-2 pr-3">
                        {isExisting ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                              Provisioned
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={seedingClubId === r.existing_club_id}
                              onClick={() => seedRoster.mutate(r.existing_club_id!)}
                              className="h-6 px-2 text-[11px] border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                            >
                              {seedingClubId === r.existing_club_id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Users className="w-3 h-3 mr-1" />
                              )}
                              Seed roster
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-200 bg-amber-500/10">
                            Available
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/50">
                      No clubs match the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[12px] text-white/45 leading-relaxed">
        After provisioning, each club appears in <strong>Clubs &amp; Associations</strong> with subdomain access
        (e.g. <code className="text-amber-300">slug.squashhub.app</code>). Phase 3 (roster + ladder seeding) runs
        per-club from that page once you've reviewed which tenants to populate.
      </p>
    </div>
  );
}
