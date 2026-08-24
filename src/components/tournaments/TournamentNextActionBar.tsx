/**
 * The one-line "what do I do next?" prompt for a whole tournament.
 *
 * Rendered on the admin tournament card AND at the top of the tournament page
 * so the two can never disagree: both derive their state from
 * `tournamentNextAction`, which reads the live match rows and round plan.
 *
 * On the card the CTA deep-links into the tournament page (scheduling, results
 * or generation); on the page itself the generate CTA runs the same idempotent
 * round-generation hook every other surface uses, so clicking twice can never
 * create a duplicate round.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, CheckCircle2, ClipboardList, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { useChampRounds } from "@/hooks/use-champ-rounds";
import { useGenerateNextRound } from "@/hooks/use-generate-next-round";
import { sectionProgression } from "@/lib/tournaments/knockout-progression";
import { tournamentNextAction } from "@/lib/tournaments/round-control";

interface Props {
  champId: string;
  canManage: boolean;
  /** Tournament status — a closed tournament never shows progression. */
  status?: string | null;
  selfScheduled?: boolean;
  /** "card" deep-links to the tournament page, "detail" acts in place. */
  mode?: "card" | "detail";
  /** Open the setup wizard (initial draw / rebuild). */
  onSetup?: () => void;
  /** Bring the admin to the fixtures list (scheduling & results). */
  onFocusFixtures?: () => void;
  className?: string;
}

export function TournamentNextActionBar({
  champId,
  canManage,
  status,
  selfScheduled = false,
  mode = "card",
  onSetup,
  onFocusFixtures,
  className,
}: Props) {
  const navigate = useNavigate();
  const { data: rounds = [] } = useChampRounds(champId);
  const { data: matches = [] } = useQuery({
    queryKey: ["club-champ-matches", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches").select("*").eq("champ_id", champId);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champId,
    staleTime: 15_000,
  });

  const koMatches = useMemo(
    () => (matches as any[]).filter((m) => (m.stage || "") === "ko"),
    [matches],
  );
  const states = useMemo(() => sectionProgression(koMatches, rounds as any), [koMatches, rounds]);
  const generate = useGenerateNextRound({ champId, states, selfScheduled });

  const na = useMemo(
    () => tournamentNextAction(matches as any[], rounds as any, { selfScheduled, status }),
    [matches, rounds, selfScheduled, status],
  );

  const Icon =
    na.complete ? CheckCircle2
      : na.action === "generate" ? Sparkles
        : na.action === "schedule" ? CalendarClock
          : ClipboardList;

  const goToDetail = (focus: string) => navigate(`/club-champs/${champId}?focus=${focus}`);

  const onClick = () => {
    if (na.action === "setup") {
      if (onSetup) return onSetup();
      return goToDetail("setup");
    }
    if (mode === "card") return goToDetail(na.action === "generate" ? "progress" : "fixtures");
    if (na.action === "generate" && na.groupNumber !== null && na.section !== null) {
      return generate.mutate({ groupNumber: na.groupNumber, section: na.section });
    }
    if (onFocusFixtures) return onFocusFixtures();
    return goToDetail("fixtures");
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={na.complete ? "default" : "secondary"} className="text-[10px]">
            <Icon className="mr-1 h-3 w-3" />
            {na.status}
          </Badge>
        </div>
        <p className="text-xs text-foreground">{na.headline}</p>
        {na.disabled && na.blockedReason && (
          <p className="text-[11px] text-muted-foreground">Outstanding: {na.blockedReason}</p>
        )}
      </div>

      {canManage && na.ctaLabel && (
        <Button
          size="sm"
          variant={na.action === "generate" && !na.disabled ? "default" : "secondary"}
          disabled={na.disabled || generate.isPending}
          title={na.disabled ? na.blockedReason || undefined : undefined}
          onClick={onClick}
          className="shrink-0"
        >
          {generate.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Icon className="mr-1 h-4 w-4" />}
          {na.ctaLabel}
        </Button>
      )}
    </div>
  );
}
