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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { useChampRounds } from "@/hooks/use-champ-rounds";
import { useGenerateNextRound } from "@/hooks/use-generate-next-round";
import { sectionProgression } from "@/lib/tournaments/knockout-progression";
import { tournamentNextAction, type ChampionScope } from "@/lib/tournaments/round-control";
import { NextRoundDrawDialog } from "./NextRoundDrawDialog";
import { NextRoundSetupDialog, type NextRoundReady } from "./NextRoundSetupDialog";
import { prepareActionLabel } from "@/lib/tournaments/round-draw";
import { sectionLabelOf } from "@/lib/tournaments/draw-board";
import { readyNextRoundScopes } from "@/lib/tournaments/next-round-setup";


interface Props {
  champId: string;
  canManage: boolean;
  /** Tournament status — a closed tournament never shows progression. */
  status?: string | null;
  selfScheduled?: boolean;
  /** Where the ultimate winner is decided (per league or per pool). */
  championScope?: ChampionScope;
  /** "card" deep-links to the tournament page, "detail" acts in place. */
  mode?: "card" | "detail";
  /** Open the setup wizard (initial draw / rebuild). */
  onSetup?: () => void;
  /** Bring the admin to the fixtures list (scheduling & results). */
  onFocusFixtures?: () => void;
  /** Division label resolver for multi-division next-round selection. */
  groupLabel?: (groupNumber: number) => string;
  className?: string;
}

export function TournamentNextActionBar({
  champId,
  canManage,
  status,
  selfScheduled = false,
  championScope,
  mode = "card",
  onSetup,
  onFocusFixtures,
  groupLabel,
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
    () => tournamentNextAction(matches as any[], rounds as any, { selfScheduled, status, championScope }),
    [matches, rounds, selfScheduled, status, championScope],
  );

  const Icon =
    na.complete ? CheckCircle2
      : na.action === "generate" ? Sparkles
        : na.action === "schedule" ? CalendarClock
          : ClipboardList;

  // ── Visual draw review for the round that is about to be generated ────────
  const [setupOpen, setSetupOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [setup, setSetup] = useState<NextRoundReady | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Scopes confirmed in this session — the match rows can lag a refetch, so the
  // guided queue never re-offers a draw the organiser has just confirmed.
  const [preparedKeys, setPreparedKeys] = useState<string[]>([]);
  const readyScopes = useMemo(() => readyNextRoundScopes(states), [states]);
  const outstanding = useMemo(
    () => remainingNextRoundScopes(readyScopes, preparedKeys),
    [readyScopes, preparedKeys],
  );
  const defaultReviewKey =
    na.action === "generate" && na.groupNumber !== null && na.section
      ? `${na.groupNumber}-${na.section}`
      : null;
  const reviewState = useMemo(() => {
    const key = reviewKey ?? defaultReviewKey;
    return key ? states.find((s) => `${s.groupNumber}-${s.section}` === key) ?? null : null;
  }, [states, reviewKey, defaultReviewKey]);
  const scopeLabel = (groupNumber: number, section: number) =>
    `${groupLabel?.(groupNumber) || `Division ${groupNumber}`} · ${sectionLabelOf(section)}`;
  const goToDetail = (focus: string) => navigate(`/club-champs/${champId}?focus=${focus}`);

  const openScope = (key: string) => {
    setReviewKey(key);
    setScopeOpen(false);
    setSetupOpen(true);
  };

  const onClick = () => {
    if (na.action === "setup") {
      if (onSetup) return onSetup();
      return goToDetail("setup");
    }
    if (na.action === "generate" && na.groupNumber !== null && na.section !== null) {
      // Never navigate away first: the organiser defines the round here (name +
      // play-by date), then the visual draw for exactly that round opens, then
      // Dates & Courts. The league final between section winners has a single
      // possible pairing set, so it is generated directly.
      if (na.section > 0 && outstanding.length > 1) return setScopeOpen(true);
      if (na.section > 0 && outstanding.length === 1) return openScope(outstanding[0].key);
      if (na.section > 0 && reviewState) {
        setReviewKey(`${reviewState.groupNumber}-${reviewState.section}`);
        return setSetupOpen(true);
      }
      if (mode === "card") return goToDetail("progress");
      return generate.mutate({ groupNumber: na.groupNumber, section: na.section });
    }
    if (mode === "card") return goToDetail("fixtures");
    if (onFocusFixtures) return onFocusFixtures();
    return goToDetail("fixtures");
  };


  const opensDrawBoard = na.action === "generate" && (na.section ?? 0) > 0 && !!reviewState;
  const queueNote = opensDrawBoard ? outstandingDrawsHeadline(outstanding.length) : null;
  const ctaLabel = opensDrawBoard && outstanding.length > 1
    ? `Prepare next rounds (${outstanding.length})`
    : opensDrawBoard
    ? prepareActionLabel(reviewState?.nextRound?.label, (reviewState?.currentRound ?? 0) + 1)
    : na.ctaLabel;


  return (
    <>
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
          {queueNote && <p className="text-[11px] font-medium text-foreground">{queueNote}</p>}
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
            {ctaLabel}
          </Button>
        )}
      </div>

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a division and pool</DialogTitle>
            <DialogDescription>
              {readyScopes.reduce((total, scope) => total + scope.qualifiers, 0)} qualifiers are ready across {readyScopes.length} draws. Each draw is confirmed separately so no pool is hidden or mixed.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {readyScopes.map((scope) => (
              <Button
                key={scope.key}
                variant="outline"
                className="h-auto w-full justify-between px-3 py-2 text-left"
                onClick={() => {
                  setReviewKey(scope.key);
                  setScopeOpen(false);
                  setSetupOpen(true);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{scopeLabel(scope.groupNumber, scope.section)}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {scope.stageLabel} · {scope.qualifiers} qualifiers / {scope.matchups} matches
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {reviewState && setupOpen && (
        <NextRoundSetupDialog
          open
          onOpenChange={setSetupOpen}
          champId={champId}
          state={reviewState}
          qualifiers={reviewState.activeCount}
          selfScheduled={selfScheduled}
          divisionLabel={scopeLabel(reviewState.groupNumber, reviewState.section)}
          onReady={(v) => {
            setSetup(v);
            setReviewOpen(true);
          }}
        />
      )}

      {reviewState && reviewOpen && (
        <NextRoundDrawDialog
          open
          onOpenChange={setReviewOpen}
          champId={champId}
          state={reviewState}
          mode="prepare"
          multiSection={states.filter((s) => s.groupNumber === reviewState.groupNumber && s.section > 0).length > 1}
          selfScheduled={selfScheduled}
          divisionLabel={scopeLabel(reviewState.groupNumber, reviewState.section)}
          setup={setup}
          onConfirmed={() => {
            setReviewOpen(false);
            setSetup(null);
            setReviewKey(null);
            // Guided flow continues at Dates & Courts for these fixtures.
            if (mode === "card") goToDetail("fixtures");
            else if (onFocusFixtures) onFocusFixtures();
          }}
        />
      )}
    </>
  );
}

