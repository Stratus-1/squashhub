import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserMinus, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

export interface SwapCandidate {
  memberId: string;
  name: string;
  code: string;       // NSF / SSA / club number
  rank?: number;      // player_rank
  squad: boolean;     // true = registered for this exact team-league
  reserve?: boolean;  // true = registered in another same-prefix reserve league
  byeFrom?: string;   // team code of a team on bye this week
  inUse?: { side: "home" | "away"; position: number } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamCode: string;        // e.g. "CSI001"
  side: "home" | "away";
  position: number;        // 1..5
  currentName: string;
  currentCode: string;
  /** Codes already assigned in this fixture, so we can mark "in use" */
  inUseCodes: Map<string, { side: "home" | "away"; position: number }>;
  /** Optional: kept for backwards compatibility — both captain and admin see the same pool */
  isAdmin?: boolean;
  /** Association the current fixture belongs to — used to find teams on bye this week */
  associationId?: string | null;
  /** Fixture date (YYYY-MM-DD) — used to locate same-week bye fixtures (± 3 days) */
  fixtureDate?: string | null;
  onSelect: (c: SwapCandidate) => void;
  onClear?: () => void;
}

export function LineupSwapDialog({
  open, onOpenChange, teamCode, side, position,
  currentName, currentCode, inUseCodes,
  associationId, fixtureDate,
  onSelect, onClear,
}: Props) {
  const [search, setSearch] = useState("");

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["lineup-swap-candidates", teamCode, associationId, fixtureDate],
    queryFn: async (): Promise<SwapCandidate[]> => {
      if (!teamCode) return [];

      // 1) Resolve this team-league (a "league" row represents one club's team in a division)
      const { data: leagueRow } = await (supabase as any)
        .from("leagues")
        .select("id, name, association_id")
        .eq("code", teamCode)
        .maybeSingle();
      if (!leagueRow?.id) return [];

      const teamLeagueId = leagueRow.id as string;
      const teamLeagueName = (leagueRow.name || "") as string;
      const assocId = (leagueRow.association_id || associationId) as string | null;

      const ordRe = /(\d+(?:st|nd|rd|th))/i;

      // 2) Pull ALL leagues in this association — we'll compute tier per league.
      const { data: allLeagues } = await (supabase as any)
        .from("leagues")
        .select("id, code, name")
        .eq("association_id", assocId);
      const leaguesList = (allLeagues || []) as Array<{ id: string; code: string; name: string }>;

      // 3) Resolve platform_association_id for fixture lookup (some assocs are tenant copies).
      let platformAssocId: string | null = assocId;
      try {
        const { data: la } = await (supabase as any)
          .from("league_associations")
          .select("platform_association_id")
          .eq("id", assocId)
          .maybeSingle();
        platformAssocId = (la?.platform_association_id as string | null) || assocId;
      } catch { /* noop */ }

      // 4) Build fixture-based tier per team code (source of truth, matches Standings).
      const fixtureTierByCode = new Map<string, string>();
      try {
        const { data: rounds } = await (supabase as any)
          .from("league_rounds")
          .select("id, name")
          .eq("association_id", assocId);
        const roundTier = new Map<string, string>();
        (rounds || []).forEach((r: any) => {
          const cleaned = String(r.name || "").replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "").trim();
          const m = cleaned.match(/(\d+(?:st|nd|rd|th))\s*League/i);
          if (m) roundTier.set(r.id, m[1]);
        });
        const roundIds = Array.from(roundTier.keys());
        if (roundIds.length > 0 && platformAssocId) {
          const { data: fx } = await (supabase as any)
            .from("platform_league_fixtures")
            .select("round_id, home_team_code, away_team_code")
            .eq("association_id", platformAssocId)
            .in("round_id", roundIds);
          const tally = new Map<string, Map<string, number>>();
          const bump = (code: string | null, tier: string) => {
            if (!code || code.startsWith("__")) return;
            if (!tally.has(code)) tally.set(code, new Map());
            const m = tally.get(code)!;
            m.set(tier, (m.get(tier) || 0) + 1);
          };
          (fx || []).forEach((f: any) => {
            const tier = roundTier.get(f.round_id);
            if (!tier) return;
            bump(f.home_team_code, tier);
            bump(f.away_team_code, tier);
          });
          tally.forEach((m, code) => {
            let bestTier = ""; let best = -1;
            m.forEach((n, t) => { if (n > best) { best = n; bestTier = t; } });
            if (bestTier) fixtureTierByCode.set(code, bestTier);
          });
        }
      } catch { /* noop */ }

      const tierOf = (l: { code: string; name: string }): string | null => {
        const isReserves = /reserves?/i.test(l.name);
        // Non-reserve teams: prefer fixture-based tier.
        if (!isReserves) {
          const fromFx = fixtureTierByCode.get(l.code);
          if (fromFx) return fromFx;
        }
        const m = l.name.match(ordRe);
        return m ? m[1] : null;
      };

      const targetTier = tierOf({ code: teamCode, name: teamLeagueName });

      // 5) Same-tier reserves leagues (any name with "reserve" + matching ordinal).
      const sameTierReserveLeagueIds: string[] = [];
      // Same-tier non-reserve team leagues (for bye candidates), with id↔code map.
      const sameTierTeamLeagueIdToCode = new Map<string, string>();
      for (const l of leaguesList) {
        const t = tierOf(l);
        if (!targetTier || t !== targetTier) continue;
        if (/reserves?/i.test(l.name)) {
          sameTierReserveLeagueIds.push(l.id);
        } else if (l.id !== teamLeagueId) {
          sameTierTeamLeagueIdToCode.set(l.id, l.code);
        }
      }

      // 6) Find teams on bye this week (same tier only).
      const byeLeagueIds: string[] = [];
      if (platformAssocId && fixtureDate && sameTierTeamLeagueIdToCode.size > 0) {
        const fx = new Date(fixtureDate);
        const from = new Date(fx); from.setDate(from.getDate() - 3);
        const to = new Date(fx); to.setDate(to.getDate() + 3);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const { data: byeFixtures } = await (supabase as any)
          .from("platform_league_fixtures")
          .select("home_team_code, away_team_code, status, fixture_date")
          .eq("association_id", platformAssocId)
          .gte("fixture_date", fmt(from))
          .lte("fixture_date", fmt(to));
        const tierCodes = new Set(Array.from(sameTierTeamLeagueIdToCode.values()));
        const byeCodes = new Set<string>();
        for (const f of (byeFixtures || []) as any[]) {
          const home = (f.home_team_code || "").toString();
          const away = (f.away_team_code || "").toString();
          if (away === "__BYE__" && home && home !== teamCode && tierCodes.has(home)) byeCodes.add(home);
          else if (home === "__BYE__" && away && away !== teamCode && tierCodes.has(away)) byeCodes.add(away);
          else if (f.status === "bye") {
            if (home && home !== "__BYE__" && home !== teamCode && tierCodes.has(home)) byeCodes.add(home);
            if (away && away !== "__BYE__" && away !== teamCode && tierCodes.has(away)) byeCodes.add(away);
          }
        }
        for (const [id, code] of sameTierTeamLeagueIdToCode.entries()) {
          if (byeCodes.has(code)) byeLeagueIds.push(id);
        }
      }

      // 7) Pull registrations:
      //    - reserves rows for ANY same-tier reserves league
      //    - squad rows (is_reserve = false) of same-tier teams that are on bye
      const reserveLeagueIdSet = new Set(sameTierReserveLeagueIds);
      const candidateLeagueIds = [...new Set([...sameTierReserveLeagueIds, ...byeLeagueIds])];
      if (candidateLeagueIds.length === 0) return [];
      const { data: regs } = await (supabase as any)
        .from("member_league_registrations")
        .select("club_member_id, league_id, league_association_number, ssa_number, player_rank, is_reserve")
        .in("league_id", candidateLeagueIds);

      const filteredRegs = ((regs || []) as any[]).filter((r) => {
        if (reserveLeagueIdSet.has(r.league_id)) return true; // include all reserve-league rows
        return r.is_reserve !== true; // bye-team squad players only
      });

      const regMemberIds = [...new Set(filteredRegs.map((r) => r.club_member_id))];
      if (regMemberIds.length === 0) return [];

      const { data: members } = await supabase
        .from("club_members")
        .select("id, name, club_member_number")
        .in("id", regMemberIds);
      const memberMap = new Map((members || []).map((m: any) => [m.id, m]));

      interface Info { reserve: boolean; byeFrom?: string; code: string; rank?: number }
      const regInfo = new Map<string, Info>();
      for (const r of filteredRegs) {
        const code = (r.league_association_number || r.ssa_number || "").toString().toUpperCase();
        const isReserve = reserveLeagueIdSet.has(r.league_id);
        const byeFrom = !isReserve ? sameTierTeamLeagueIdToCode.get(r.league_id) : undefined;
        const existing = regInfo.get(r.club_member_id);
        if (existing) {
          if (isReserve) existing.reserve = true;
          if (byeFrom && !existing.byeFrom) existing.byeFrom = byeFrom;
          if (!existing.code && code) existing.code = code;
          if ((r.player_rank || 99) < (existing.rank ?? 99)) existing.rank = r.player_rank;
        } else {
          regInfo.set(r.club_member_id, { reserve: isReserve, byeFrom, code, rank: r.player_rank });
        }
      }

      const out: SwapCandidate[] = [];
      for (const id of regMemberIds) {
        const m = memberMap.get(id);
        const info = regInfo.get(id);
        if (!m || !info) continue;
        const code = (info.code || m.club_member_number || "").toString().toUpperCase();
        out.push({
          memberId: id,
          name: m.name || "Unknown",
          code,
          rank: info.rank,
          squad: false,
          reserve: info.reserve,
          byeFrom: info.byeFrom,
        });
      }
      return out;
    },
    enabled: open && !!teamCode,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (candidates || []).map((c) => ({
      ...c,
      inUse: inUseCodes.get(c.code.toUpperCase()) || null,
    }));
    const match = q
      ? list.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      : list;
    // Sort: reserves first, then by rank, then name
    return match.sort((a, b) => {
      if (!!a.reserve !== !!b.reserve) return a.reserve ? -1 : 1;
      const ra = a.rank ?? 99; const rb = b.rank ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [candidates, inUseCodes, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            Swap player · {teamCode} · {side === "home" ? "Home" : "Visitors"} #{position}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Currently: <span className="font-medium text-foreground">{currentName || "—"}</span>
            {currentCode && <span className="text-muted-foreground"> ({currentCode})</span>}
            <span className="block text-[10px] text-muted-foreground mt-1">
              Reserves for this league and players from teams on a bye this week.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name or NSF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-6">
              No reserves or bye-team players available for this team.
            </p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
              {filtered.map((c) => {
                const isCurrent = !!currentCode && c.code.toUpperCase() === currentCode.toUpperCase();
                const elsewhere = c.inUse && !(c.inUse.side === side && c.inUse.position === position);
                return (
                  <button
                    key={c.memberId}
                    disabled={isCurrent}
                    onClick={() => {
                      if (elsewhere) {
                        toast.warning(`${c.name} is in ${c.inUse!.side === "home" ? "Home" : "Visitors"} #${c.inUse!.position} — they will be moved.`);
                      }
                      onSelect(c);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{c.name}</span>
                        {c.reserve ? (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">Reserve</Badge>
                        ) : c.byeFrom ? (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">Bye · {c.byeFrom}</Badge>
                        ) : null}
                        {c.rank != null && (
                          <span className="text-[10px] text-muted-foreground">#{c.rank}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        {c.code || "no NSF"}
                        {isCurrent && <span className="italic text-primary">current</span>}
                        {elsewhere && (
                          <span className="text-amber-600">
                            in {c.inUse!.side === "home" ? "H" : "V"}#{c.inUse!.position}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {onClear && currentCode && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => { onClear(); onOpenChange(false); }}
            >
              <UserMinus className="w-3 h-3 mr-1" /> Clear this position
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
