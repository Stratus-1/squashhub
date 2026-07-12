import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Trophy, Swords, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  clubId?: string;
}

/**
 * Shows total "sets" (games) played by the club across:
 *   - Internal/league fixtures (sum of home_games_won + away_games_won per rubber where our team plays)
 *   - Club tournaments (sum of game entries in club_champs_matches.game_scores)
 *   - Combined total
 */
export function ClubSetsPlayedCard({ clubId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["club-sets-played", clubId],
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!clubId) return null;

      // -------- League sets --------
      let leagueSets = 0;
      const { data: leagues } = await supabase
        .from("leagues")
        .select("association_id, code, nsa_team_code")
        .eq("club_id", clubId);

      const codes = Array.from(
        new Set(
          (leagues || [])
            .flatMap((l: any) => [l.code, l.nsa_team_code])
            .filter((c): c is string => !!c)
            .map((c) => c.toUpperCase()),
        ),
      );
      const assocIds = Array.from(
        new Set((leagues || []).map((l: any) => l.association_id).filter(Boolean)),
      ) as string[];

      if (codes.length > 0 && assocIds.length > 0) {
        // Resolve platform association ids
        const { data: assocs } = await supabase
          .from("league_associations")
          .select("id, platform_association_id")
          .in("id", assocIds);
        const platformIds = Array.from(
          new Set(
            (assocs || [])
              .map((a: any) => a.platform_association_id || a.id)
              .filter(Boolean),
          ),
        ) as string[];

        if (platformIds.length > 0) {
          const { data: fixtures } = await supabase
            .from("platform_league_fixtures")
            .select("id, home_team_code, away_team_code")
            .in("association_id", platformIds);

          const ourFixtureIds = (fixtures || [])
            .filter((f: any) => {
              const h = (f.home_team_code || "").toUpperCase();
              const a = (f.away_team_code || "").toUpperCase();
              return codes.includes(h) || codes.includes(a);
            })
            .map((f: any) => f.id);

          // Page in chunks of 500
          for (let i = 0; i < ourFixtureIds.length; i += 500) {
            const ids = ourFixtureIds.slice(i, i + 500);
            const { data: rubbers } = await supabase
              .from("league_match_results")
              .select("home_games_won, away_games_won")
              .in("fixture_id", ids);
            (rubbers || []).forEach((r: any) => {
              leagueSets += (r.home_games_won || 0) + (r.away_games_won || 0);
            });
          }
        }
      }

      // -------- Tournament sets --------
      let tournamentSets = 0;
      const { data: champs } = await supabase
        .from("club_champs")
        .select("id")
        .eq("club_id", clubId);
      const champIds = (champs || []).map((c: any) => c.id);
      for (let i = 0; i < champIds.length; i += 200) {
        const ids = champIds.slice(i, i + 200);
        if (ids.length === 0) break;
        const { data: matches } = await supabase
          .from("club_champs_matches")
          .select("game_scores, status, score, side_a_points, side_b_points, is_bye")
          .in("champ_id", ids)
          .eq("status", "completed");
        (matches || []).forEach((m: any) => {
          if (m.is_bye) return;
          // Standard format: game_scores JSON array — one entry per set
          if (m.game_scores) {
            try {
              const parsed = typeof m.game_scores === "string" ? JSON.parse(m.game_scores) : m.game_scores;
              if (Array.isArray(parsed) && parsed.length > 0) {
                tournamentSets += parsed.length;
                return;
              }
            } catch {
              /* fall through */
            }
          }
          // Bells / time-capped: one completed match = one set played
          tournamentSets += 1;
        });
      }

      return {
        league: leagueSets,
        tournament: tournamentSets,
        total: leagueSets + tournamentSets,
      };
    },
  });

  if (!clubId) return null;

  const stats = [
    { label: "League Sets", value: data?.league ?? 0, icon: Swords, color: "text-primary bg-primary/10" },
    { label: "Tournament Sets", value: data?.tournament ?? 0, icon: Trophy, color: "text-amber-600 bg-amber-500/10" },
    { label: "Total Sets", value: data?.total ?? 0, icon: Layers, color: "text-emerald-600 bg-emerald-500/10" },
  ];

  return (
    <Card className="p-3 bg-white border-slate-200 text-slate-900 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sets played by the club
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-1 rounded-md border border-slate-200 bg-white p-2"
          >
            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", s.color)}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-base font-bold leading-none tabular-nums text-slate-900">
              {isLoading ? "—" : s.value.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 leading-tight text-center">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
