/**
 * Live tournament control card — "what do I do next?".
 *
 * Once the draw exists the organiser works from here, not from the setup
 * wizard: current stage, how many are still in, and the single next action
 * (generate → schedule → play → results → generate again). Every action calls
 * the same underlying round-generation hook the knockout card uses, so no
 * surface can disagree with another.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Loader2, Shuffle, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { useChampRounds } from "@/hooks/use-champ-rounds";
import { useGenerateNextRound } from "@/hooks/use-generate-next-round";
import { sectionProgression, type SectionProgression } from "@/lib/tournaments/knockout-progression";
import { divisionControls, groupStageControl, type ChampionScope, type SectionControl } from "@/lib/tournaments/round-control";
import { prepareActionLabel, roundRedrawState } from "@/lib/tournaments/round-draw";
import { NextRoundDrawDialog, type NextRoundDrawMode } from "./NextRoundDrawDialog";
import { NextRoundSetupDialog, type NextRoundReady } from "./NextRoundSetupDialog";
import { sectionLetter } from "@/lib/tournaments/knockout";


interface Props {
  champId: string;
  canManage: boolean;
  /** Players arrange their own court/date/time. */
  selfScheduled?: boolean;
  /** Where the ultimate winner is decided (per league or per pool). */
  championScope?: ChampionScope;
  /** Division label resolver. */
  groupLabel?: (gn: number) => string;
  /** Limit the card to one division (used at the top of that division's standings). */
  onlyGroup?: number;
  /** Take the admin to the scheduling view for the newly generated fixtures. */
  onSchedule?: (groupNumber: number) => void;
  /** Optional pool-stage hand-off (play-off generation) where that flow exists. */
  onGeneratePlayoffs?: (groupNumber: number) => void;
  /** Compact inline treatment (standings header) instead of a full card. */
  compact?: boolean;
  className?: string;
}

export function TournamentProgressCard({
  champId,
  canManage,
  selfScheduled = false,
  championScope,
  groupLabel,
  onlyGroup,
  onSchedule,
  onGeneratePlayoffs,
  compact = false,
  className,
}: Props) {
  const { data: rounds = [] } = useChampRounds(champId);
  const { data: matches = [] } = useQuery({
    queryKey: ["club-champ-matches", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("*")
        .eq("champ_id", champId);
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
  const [draw, setDraw] = useState<{ key: string; mode: NextRoundDrawMode } | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [setup, setSetup] = useState<NextRoundReady | null>(null);
  const keyOf = (s: { groupNumber: number; section: number }) => `${s.groupNumber}-${s.section}`;
  const drawState = draw ? states.find((s) => keyOf(s) === draw.key) ?? null : null;
  const setupState = setupKey ? states.find((s) => keyOf(s) === setupKey) ?? null : null;


  const divisions = useMemo(
    () => divisionControls(koMatches, rounds as any, { selfScheduled, championScope }),
    [koMatches, rounds, selfScheduled, championScope],
  );

  const shown = onlyGroup !== undefined ? divisions.filter((d) => d.groupNumber === Number(onlyGroup)) : divisions;

  // No knockout yet — fall back to the pool-stage hand-off for the divisions
  // that actually have group fixtures.
  const poolOnly = useMemo(() => {
    if (shown.length > 0) return [];
    const gns = Array.from(
      new Set(
        (matches as any[])
          .filter((m) => (m.stage || "group") === "group")
          .map((m) => Number(m.group_number)),
      ),
    ).filter((gn) => onlyGroup === undefined || gn === Number(onlyGroup));
    return gns
      .sort((a, b) => a - b)
      .map((gn) => groupStageControl(matches as any[], gn))
      .filter(Boolean) as NonNullable<ReturnType<typeof groupStageControl>>[];
  }, [shown.length, matches, onlyGroup]);

  if (shown.length === 0 && poolOnly.length === 0) return null;

  const label = (gn: number) => groupLabel?.(gn) || `Division ${gn}`;

  const stateFor = (s: SectionControl): SectionProgression | null =>
    states.find((x) => x.groupNumber === s.groupNumber && x.section === s.section) ?? null;

  const renderSection = (s: SectionControl, multi: boolean) => {
    const st = stateFor(s);
    // Section draws go through the visual board; the cross-pool league final
    // (section 0) has only one possible pairing set, so it is generated direct.
    const viaBoard = !!st && s.section > 0;
    const safety = st ? roundRedrawState(st.currentRoundMatches as any[]) : null;
    const canRedraw = !!st && s.section > 0 && s.action !== "generate" && !s.decided && !!safety?.canRedraw;

    return (
    <div
      key={`${s.groupNumber}-${s.section}`}
      className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {onlyGroup === undefined && (
            <Badge variant="outline" className="text-[10px]">{label(s.groupNumber)}</Badge>
          )}
          {multi && s.section > 0 && (
            <Badge variant="secondary" className="text-[10px]">Pool {sectionLetter(s.section)}</Badge>
          )}
          {s.section === 0 && <Badge variant="secondary" className="text-[10px]">Finals</Badge>}
          {s.decided && <Badge className="text-[10px]"><Trophy className="mr-1 h-3 w-3" />Decided</Badge>}
        </div>
        <p className="text-xs text-foreground">{s.headline}</p>
        {!s.decided && s.action === "await_results" && s.blockedReason && (
          <p className="text-[11px] text-muted-foreground">{s.blockedReason}</p>
        )}
        {canManage && safety && !safety.canRedraw && safety.played > 0 && !s.decided && s.section > 0 && (
          <p className="text-[11px] text-muted-foreground">{safety.reason}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        {canManage && canRedraw && (
          <Button size="sm" variant="ghost" onClick={() => setDraw({ key: keyOf(s), mode: "redraw" })}>
            <Shuffle className="mr-1 h-4 w-4" /> Review / redraw round
          </Button>
        )}
        {canManage && s.action === "generate" && (
          <Button
            size="sm"
            disabled={generate.isPending}
            onClick={() =>
              viaBoard
                ? setSetupKey(keyOf(s))
                : generate.mutate({ groupNumber: s.groupNumber, section: s.section })
            }
          >
            {generate.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {viaBoard ? prepareActionLabel(s.nextStageLabel, (st?.currentRound ?? 0) + 1) : s.actionLabel}
          </Button>
        )}
        {canManage && s.action === "schedule" && onSchedule && (
          <Button size="sm" variant="secondary" onClick={() => onSchedule(s.groupNumber)}>
            <CalendarClock className="mr-1 h-4 w-4" /> {s.actionLabel}
          </Button>
        )}
      </div>
    </div>
    );
  };


  const body = (
    <div className="space-y-2">
      {shown.map((d) => {
        const multi = d.sections.filter((s) => s.section > 0).length > 1;
        return d.sections.map((s) => renderSection(s, multi));
      })}

      {poolOnly.map((g) => (
        <div
          key={`pool-${g.groupNumber}`}
          className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-0.5">
            {onlyGroup === undefined && (
              <Badge variant="outline" className="text-[10px]">{label(g.groupNumber)}</Badge>
            )}
            <p className="text-xs text-foreground">{g.headline}</p>
          </div>
          {canManage && g.action === "generate" && onGeneratePlayoffs && (
            <Button size="sm" onClick={() => onGeneratePlayoffs(g.groupNumber)}>
              <Sparkles className="mr-1 h-4 w-4" /> {g.actionLabel}
            </Button>
          )}
        </div>
      ))}

      {canManage && (
        <p className="text-[11px] text-muted-foreground">
          Later rounds are advanced here — the setup wizard's rebuild only recreates the first fixture list.
        </p>
      )}

      {setupState && setupKey && (
        <NextRoundSetupDialog
          open
          onOpenChange={(o) => !o && setSetupKey(null)}
          champId={champId}
          state={setupState}
          qualifiers={setupState.activeCount}
          selfScheduled={selfScheduled}
          divisionLabel={label(setupState.groupNumber)}
          onReady={(v) => {
            setSetup(v);
            setSetupKey(null);
            setDraw({ key: keyOf(setupState), mode: "prepare" });
          }}
        />
      )}

      {drawState && draw && (
        <NextRoundDrawDialog
          open
          onOpenChange={(o) => !o && setDraw(null)}
          champId={champId}
          state={drawState}
          mode={draw.mode}
          multiSection={states.filter((s) => s.groupNumber === drawState.groupNumber && s.section > 0).length > 1}
          selfScheduled={selfScheduled}
          divisionLabel={label(drawState.groupNumber)}
          setup={draw.mode === "prepare" ? setup : null}
          onConfirmed={() => {
            setDraw(null);
            setSetup(null);
            onSchedule?.(drawState.groupNumber);
          }}
        />
      )}
    </div>
  );


  if (compact) return <div className={cn("space-y-2", className)}>{body}</div>;

  return (
    <Card className={cn("border-primary/40", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Tournament progress — what's next
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
