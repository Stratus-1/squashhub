import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { TrendingUp, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";


interface RankingEntry {
  label?: string;
  position?: number;
  people?: number;
  points?: number;
  system?: string;
}

interface Props {
  memberId: string | null;
  personId: string | null | undefined;
}

/**
 * Shows the member's SportyHQ rating + best national/regional rankings.
 * Renders nothing when no SportyHQ profile is linked to the member.
 */
export function DashboardSportyhqCard({ memberId, personId }: Props) {
  const { data: profile, isFetched, refetch } = useQuery({
    queryKey: ["my-sportyhq-profile", memberId, personId],
    queryFn: async () => {
      const filters = [
        personId ? `person_id.eq.${personId}` : null,
        memberId ? `club_member_id.eq.${memberId}` : null,
      ].filter(Boolean) as string[];
      const { data, error } = await (supabase as any)
        .from("sportyhq_profiles")
        .select(
          "sportyhq_user_id, name, rating, rating_confidence, matches_all_time, wins_all_time, rankings, club_label, profile_path, fetched_at",
        )
        .or(filters.join(","))
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!memberId || !!personId,
    staleTime: 5 * 60 * 1000,
  });

  // New registrations (e.g. members who never came through an NSA/association import)
  // have no SportyHQ profile yet — kick off a one-off background lookup and store it.
  const triggered = useRef(false);
  useEffect(() => {
    if (!memberId || !isFetched || profile || triggered.current) return;
    const key = `sh.sportyhq.autolink.${memberId}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    triggered.current = true;
    localStorage.setItem(key, String(Date.now()));
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("sportyhq-lookup", {
          body: { action: "auto_link", club_member_id: memberId },
        });
        if ((data as any)?.status === "saved") refetch();
      } catch {
        /* silent — this is a best-effort enrichment */
      }
    })();
  }, [memberId, isFetched, profile, refetch]);

  if (!profile) return null;


  const rankings: RankingEntry[] = Array.isArray(profile.rankings) ? profile.rankings : [];
  const valid = rankings.filter((r) => typeof r.position === "number" && r.position > 0);
  // Prefer a national ranking, then the best (lowest) position overall.
  const national =
    valid.find((r) => /national|south africa/i.test(r.label || "")) ||
    valid.slice().sort((a, b) => (a.position || 99999) - (b.position || 99999))[0];
  const regional = valid.find(
    (r) => r !== national && !/national|south africa/i.test(r.label || ""),
  );
  const shown = [national, regional].filter(Boolean).slice(0, 2) as RankingEntry[];

  const winLoss =
    profile.matches_all_time != null && profile.wins_all_time != null
      ? `${profile.wins_all_time}W / ${profile.matches_all_time - profile.wins_all_time}L`
      : null;

  return (
    <Card className="p-3 rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          SportyHQ Ranking
        </span>
        {profile.profile_path && (
          <a
            href={`https://www.sportyhq.com${profile.profile_path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="View full SportyHQ profile"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 flex flex-col items-center min-w-[76px]">
          <TrendingUp className="w-4 h-4 text-primary mb-0.5" />
          <span className="text-2xl font-heading font-bold text-foreground tabular-nums">
            {profile.rating != null ? Math.round(profile.rating) : "—"}
          </span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Rating</span>
        </div>

        <div className="flex-1 space-y-1.5 min-w-0">
          {shown.length > 0 ? (
            shown.map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-xs text-muted-foreground truncate">{r.label}</span>
                <span className="text-sm font-heading font-bold text-foreground tabular-nums whitespace-nowrap">
                  #{r.position}
                  {typeof r.people === "number" && r.people > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground"> / {r.people}</span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No ranking positions yet</span>
          )}
          {winLoss && (
            <div className="text-[10px] text-muted-foreground">All-time: {winLoss}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
