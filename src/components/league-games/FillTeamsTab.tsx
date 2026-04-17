import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, MapPin, UserPlus, X } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";

type Props = {
  clubId: string;
  platformAssocIds: string[];
  clubLeagues: Array<{ id: string; code: string | null; name: string }>;
};

export function FillTeamsTab({ clubId, platformAssocIds, clubLeagues }: Props) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const twoWeeksOut = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const codeToLeague = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string | null }>();
    for (const l of clubLeagues) if (l.code) m.set(l.code, l);
    return m;
  }, [clubLeagues]);

  const teamCodes = useMemo(
    () => clubLeagues.map((l) => l.code).filter(Boolean) as string[],
    [clubLeagues]
  );

  // Fetch upcoming fixtures involving this club
  const { data: fixtures, isLoading } = useQuery({
    queryKey: ["fill-teams-fixtures", today, twoWeeksOut, platformAssocIds.join(","), teamCodes.join(",")],
    queryFn: async () => {
      if (platformAssocIds.length === 0 || teamCodes.length === 0) return [];
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .in("association_id", platformAssocIds)
        .gte("fixture_date", today)
        .lte("fixture_date", twoWeeksOut)
        .order("fixture_date");
      if (error) throw error;
      const codes = new Set(teamCodes);
      return (data || []).filter((f) => codes.has(f.home_team_code) || codes.has(f.away_team_code));
    },
    enabled: platformAssocIds.length > 0 && teamCodes.length > 0,
  });

  // Get all player registrations for this club's leagues
  const leagueIds = clubLeagues.map((l) => l.id);
  const { data: registrations } = useQuery({
    queryKey: ["club-league-registrations", leagueIds.join(",")],
    queryFn: async () => {
      if (leagueIds.length === 0) return [];
      const { data, error } = await fromExt("member_league_registrations")
        .select("id, club_member_id, league_id, player_rank")
        .in("league_id", leagueIds);
      if (error) throw error;
      return data || [];
    },
    enabled: leagueIds.length > 0,
  });

  // Get player names
  const memberIds = useMemo<string[]>(
    () => Array.from(new Set(((registrations || []) as any[]).map((r) => r.club_member_id as string))),
    [registrations]
  );
  const { data: members } = useQuery({
    queryKey: ["league-pool-members", memberIds.join(",")],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, gender")
        .in("id", memberIds);
      if (error) throw error;
      return data || [];
    },
    enabled: memberIds.length > 0,
  });

  const memberMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string | null }>();
    for (const mb of members || []) m.set(mb.id, mb);
    return m;
  }, [members]);

  // Group eligible players per league
  const playersByLeague = useMemo(() => {
    const m = new Map<string, Array<{ id: string; name: string; rank: number | null }>>();
    for (const r of (registrations || []) as any[]) {
      const list = m.get(r.league_id) || [];
      const mb = memberMap.get(r.club_member_id);
      if (mb) list.push({ id: r.club_member_id, name: mb.name || "Unknown", rank: r.player_rank });
      m.set(r.league_id, list);
    }
    for (const [k, v] of m) v.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return m;
  }, [registrations, memberMap]);

  // Fetch existing lineups for all club fixtures
  const fixtureIds = (fixtures || []).map((f) => f.id);
  const { data: lineups } = useQuery({
    queryKey: ["fixture-lineups", fixtureIds.join(",")],
    queryFn: async () => {
      if (fixtureIds.length === 0) return [];
      const { data, error } = await fromExt("league_fixture_lineups")
        .select("id, fixture_id, league_id, position, club_member_id")
        .in("fixture_id", fixtureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fixtureIds.length > 0,
  });

  const lineupMap = useMemo(() => {
    // key: `${fixtureId}|${leagueId}|${position}` => club_member_id
    const m = new Map<string, { id: string; club_member_id: string }>();
    for (const l of (lineups || []) as any[]) {
      m.set(`${l.fixture_id}|${l.league_id}|${l.position}`, { id: l.id, club_member_id: l.club_member_id });
    }
    return m;
  }, [lineups]);

  const upsertLineup = useMutation({
    mutationFn: async (input: {
      fixture_id: string;
      league_id: string;
      position: number;
      club_member_id: string;
    }) => {
      const existing = lineupMap.get(`${input.fixture_id}|${input.league_id}|${input.position}`);
      if (existing) {
        const { error } = await fromExt("league_fixture_lineups")
          .update({ club_member_id: input.club_member_id })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("league_fixture_lineups").insert({
          fixture_id: input.fixture_id,
          league_id: input.league_id,
          position: input.position,
          club_member_id: input.club_member_id,
          club_id: clubId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fixture-lineups"] });
      toast.success("Lineup updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update lineup"),
  });

  const removeLineup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("league_fixture_lineups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fixture-lineups"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to remove player"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if ((fixtures || []).length === 0) {
    return (
      <Card className="p-8 text-center">
        <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No upcoming fixtures to fill teams for.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Assign players to positions 1–4 for each upcoming fixture. Pool is drawn from members registered to that team.
      </p>

      {(fixtures || []).map((f) => {
        const homeLeague = codeToLeague.get(f.home_team_code);
        const awayLeague = codeToLeague.get(f.away_team_code);
        const ourSide = homeLeague ? "home" : "away";
        const ourLeague = homeLeague || awayLeague;
        if (!ourLeague) return null;
        const ourTeamCode = ourSide === "home" ? f.home_team_code : f.away_team_code;
        const opponentCode = ourSide === "home" ? f.away_team_code : f.home_team_code;
        const pool = playersByLeague.get(ourLeague.id) || [];
        // Track players already picked for this fixture so they don't double-up
        const pickedIds = new Set<string>();
        for (let p = 1; p <= 4; p++) {
          const lk = lineupMap.get(`${f.id}|${ourLeague.id}|${p}`);
          if (lk) pickedIds.add(lk.club_member_id);
        }

        return (
          <Card key={f.id} className="p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span className="text-primary">{ourTeamCode}</span>
                  <span className="text-xs text-muted-foreground font-normal">vs</span>
                  <span>{opponentCode}</span>
                  <Badge variant="outline" className="text-[10px] ml-1">{f.division}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{format(parseISO(f.fixture_date), "EEE dd MMM")}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {f.venue_name}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((position) => {
                const lk = lineupMap.get(`${f.id}|${ourLeague.id}|${position}`);
                const currentId = lk?.club_member_id || "";
                const availablePool = pool.filter(
                  (p) => p.id === currentId || !pickedIds.has(p.id)
                );
                return (
                  <div key={position} className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0 w-8 justify-center">#{position}</Badge>
                    <Select
                      value={currentId}
                      onValueChange={(val) =>
                        upsertLineup.mutate({
                          fixture_id: f.id,
                          league_id: ourLeague.id,
                          position,
                          club_member_id: val,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select player…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePool.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No players in pool</div>
                        )}
                        {availablePool.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.rank ? ` (R${p.rank})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {lk && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeLineup.mutate(lk.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
