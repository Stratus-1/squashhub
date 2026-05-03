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
  inUse?: { side: "home" | "away"; position: number } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamCode: string;        // e.g. "CSI001"
  side: "home" | "away";
  position: number;        // 1..4
  currentName: string;
  currentCode: string;
  /** Codes already assigned in this fixture, so we can mark "in use" */
  inUseCodes: Map<string, { side: "home" | "away"; position: number }>;
  onSelect: (c: SwapCandidate) => void;
  onClear?: () => void;
}

export function LineupSwapDialog({
  open, onOpenChange, teamCode, side, position,
  currentName, currentCode, inUseCodes, onSelect, onClear,
}: Props) {
  const [search, setSearch] = useState("");

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["lineup-swap-candidates", teamCode],
    queryFn: async (): Promise<SwapCandidate[]> => {
      if (!teamCode) return [];

      // 1) Find the league in our system that matches this team code
      const { data: leagueRow } = await (supabase as any)
        .from("leagues")
        .select("id, code, club_id")
        .eq("code", teamCode)
        .maybeSingle();
      if (!leagueRow?.club_id) return [];

      const clubId = leagueRow.club_id as string;
      const teamLeagueId = leagueRow.id as string;

      // 2) Find every league in this club with the same alpha prefix (the reserve pool)
      const prefix = (teamCode.match(/^([A-Za-z]+)/)?.[1] || "").toUpperCase();
      const { data: clubLeagues } = await (supabase as any)
        .from("leagues")
        .select("id, code")
        .eq("club_id", clubId);
      const sameClubSamePrefixIds = ((clubLeagues || []) as any[])
        .filter((l) => (l.code || "").toUpperCase().startsWith(prefix))
        .map((l) => l.id as string);

      // 3) Pull all member registrations across that pool
      const { data: regs } = await (supabase as any)
        .from("member_league_registrations")
        .select("club_member_id, league_id, league_association_number, ssa_number, player_rank")
        .in("league_id", sameClubSamePrefixIds.length > 0 ? sameClubSamePrefixIds : [teamLeagueId]);

      const memberIds = [...new Set(((regs || []) as any[]).map((r) => r.club_member_id))];
      if (memberIds.length === 0) return [];

      const { data: members } = await supabase
        .from("club_members")
        .select("id, name, club_member_number")
        .in("id", memberIds);
      const memberMap = new Map((members || []).map((m: any) => [m.id, m]));

      // Build one entry per member; squad = registered specifically for this team-league
      const seen = new Map<string, SwapCandidate>();
      for (const r of (regs || []) as any[]) {
        const m = memberMap.get(r.club_member_id) as any;
        if (!m) continue;
        const code = (r.league_association_number || r.ssa_number || m.club_member_number || "").toString().toUpperCase();
        const isSquad = r.league_id === teamLeagueId;
        const existing = seen.get(r.club_member_id);
        if (existing) {
          if (isSquad) existing.squad = true;
          if (!existing.code && code) existing.code = code;
          if ((r.player_rank || 99) < (existing.rank ?? 99)) existing.rank = r.player_rank;
        } else {
          seen.set(r.club_member_id, {
            memberId: r.club_member_id,
            name: m.name || "Unknown",
            code,
            rank: r.player_rank,
            squad: isSquad,
          });
        }
      }
      return [...seen.values()];
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
    // Sort: squad first, then by rank, then name
    return match.sort((a, b) => {
      if (a.squad !== b.squad) return a.squad ? -1 : 1;
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
              No registered players found for this team's club.
            </p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
              {filtered.map((c) => {
                const isCurrent = c.code.toUpperCase() === currentCode.toUpperCase();
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
                        {c.squad ? (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">Squad</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">Reserve</Badge>
                        )}
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
