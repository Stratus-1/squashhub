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
import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { NextRoundDrawDialog } from "./NextRoundDrawDialog";
import { NextRoundSetupDialog, type NextRoundReady } from "./NextRoundSetupDialog";
import { prepareActionLabel } from "@/lib/tournaments/round-draw";
import { sectionLabelOf } from "@/lib/tournaments/draw-board";
import {
  allDrawsFitOnePage,
  nextOutstandingScope,
  outstandingDrawsHeadline,
  readyNextRoundScopes,
  remainingNextRoundScopes,
} from "@/lib/tournaments/next-round-setup";
import { AllNextRoundDrawsDialog } from "./AllNextRoundDrawsDialog";



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
  /** Configured play-by date per round (`round_play_by`) — beats the +7-day guess. */
  playByForRound?: (round: number, stageLabel?: string | null) => string | null;
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
  playByForRound,
  className,
}: Props) {
  const navigate = useNavigate();
  const { data: rounds = [] } = useChampRounds(champId);
  const { data: matches = [] } = useQuery({
    // Distinct cache slot: this join-less select must never overwrite the page's
    // joined match rows (player/court names). Prefix invalidations still hit it.
    queryKey: ["club-champ-matches", champId, "progress-lite"],
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
  // "Send now": draws saved without notifying (organiser was testing) can be announced later.
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const drawnRounds = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of matches as any[]) {
      if (!x.player_a_member_id || !x.player_b_member_id) continue;
      const r = Number(x.round_number) || 1;
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [matches]);
  const sendRound = async (round: number) => {
    if (!window.confirm(`Send the Round ${round} draw emails / notifications to the players now?`)) return;
    setSending(round);
    try {
      const r = await notifyRoundDraw({ champId, roundNumber: round, skipPrompt: true });
      toast.success(roundNotifySummary(r));
      if (r.whatsappFailed > 0) toast.warning(`${r.whatsappFailed} WhatsApp message(s) failed.`);
    } catch (e: any) {
      toast.error(`Players were not notified: ${e?.message || e}`);
    } finally { setSending(null); }
  };
  const generate = useGenerateNextRound({ champId, states, selfScheduled, playByForRound });

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
  const [allOpen, setAllOpen] = useState(false);
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
  // Small sets of ready draws are arranged together on one page; bigger ones
  // stay a guided one-by-one queue.
  const onePage = useMemo(() => allDrawsFitOnePage(outstanding), [outstanding]);
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
      if (na.section > 0 && outstanding.length > 1 && onePage.fits) return setAllOpen(true);
      if (na.section > 0 && outstanding.length > 1) return setScopeOpen(true);
      if (na.section > 0 && outstanding.length === 1) return openScope(outstanding[0].key);
      if (na.section > 0 && reviewState) {
        setReviewKey(`${reviewState.groupNumber}-${reviewState.section}`);
        return setSetupOpen(true);
      }
      if (mode === "card" || na.section === 0) return goToDetail("progress");
      return generate.mutate({ groupNumber: na.groupNumber, section: na.section });
    }
    if (mode === "card") return goToDetail("fixtures");
    if (onFocusFixtures) return onFocusFixtures();
    return goToDetail("fixtures");
  };


  const opensDrawBoard = na.action === "generate" && (na.section ?? 0) > 0 && !!reviewState;
  const queueNote = opensDrawBoard ? outstandingDrawsHeadline(outstanding.length) : null;
  const ctaLabel = opensDrawBoard && outstanding.length > 1 && onePage.fits
    ? `Draw all next rounds (${outstanding.length})`
    : opensDrawBoard && outstanding.length > 1
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

        <div className="flex shrink-0 flex-wrap gap-2">
        {canManage && drawnRounds.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}>
            <Send className="mr-1 h-4 w-4" /> Send draw to players
          </Button>
        )}
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
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send draw to players</DialogTitle>
            <DialogDescription>
              Tell players their opponent, contact number and play-by date for a round, using the tournament's message
              channels. Use this once you've checked the draw. Sending again repeats the message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {drawnRounds.map(([round, n]) => (
              <Button key={round} variant="outline" className="w-full justify-between" disabled={sending !== null} onClick={() => sendRound(round)}>
                <span>Round {round} · {n} game{n === 1 ? "" : "s"}</span>
                {sending === round ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {preparedKeys.length > 0 ? "Continue — the next draw" : "Choose a division and pool"}
            </DialogTitle>
            <DialogDescription>
              {outstandingDrawsHeadline(outstanding.length)}{" "}
              {outstanding.reduce((total, scope) => total + scope.qualifiers, 0)} qualifiers are waiting. Each draw is
              confirmed separately so no pool is hidden or mixed.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {outstanding.map((scope, i) => (
              <Button
                key={scope.key}
                variant={i === 0 ? "default" : "outline"}
                className="h-auto w-full justify-between px-3 py-2 text-left"
                onClick={() => openScope(scope.key)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{scopeLabel(scope.groupNumber, scope.section)}</span>
                  <span className="block text-[11px] opacity-80">
                    {i + 1} of {outstanding.length} · {scope.stageLabel} · {scope.qualifiers} qualifiers / {scope.matchups} matches
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Button>
            ))}
          </div>
          {onePage.fits && outstanding.length > 1 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setScopeOpen(false);
                setAllOpen(true);
              }}
            >
              Draw all {outstanding.length} on one page
            </Button>
          )}
          {preparedKeys.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setScopeOpen(false);
                if (mode === "card") goToDetail("fixtures");
                else if (onFocusFixtures) onFocusFixtures();
              }}
            >
              Stop here — go to Dates & Courts
            </Button>
          )}
        </DialogContent>
      </Dialog>


      {allOpen && outstanding.length > 0 && (
        <AllNextRoundDrawsDialog
          open
          onOpenChange={setAllOpen}
          champId={champId}
          scopes={outstanding}
          states={states}
          selfScheduled={selfScheduled}
          playByForRound={playByForRound}
          scopeLabel={scopeLabel}
          onConfirmed={(keys) => {
            const nextPrepared = Array.from(new Set([...preparedKeys, ...keys]));
            setPreparedKeys(nextPrepared);
            if (nextOutstandingScope(readyScopes, nextPrepared)) return setScopeOpen(true);
            if (mode === "card") goToDetail("fixtures");
            else if (onFocusFixtures) onFocusFixtures();
          }}
        />
      )}

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
            const doneKey = `${reviewState.groupNumber}-${reviewState.section}`;
            const nextPrepared = Array.from(new Set([...preparedKeys, doneKey]));
            setPreparedKeys(nextPrepared);
            setReviewOpen(false);
            setSetup(null);
            setReviewKey(null);
            // Guided queue: go straight on to the next outstanding draw so no
            // pool can be overlooked; only then hand over to Dates & Courts.
            if (nextOutstandingScope(readyScopes, nextPrepared)) return setScopeOpen(true);
            if (mode === "card") goToDetail("fixtures");
            else if (onFocusFixtures) onFocusFixtures();
          }}

        />
      )}
    </>
  );
}

