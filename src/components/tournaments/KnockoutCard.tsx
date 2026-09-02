import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { looksLikePhone } from "@/lib/member-display";
import { sectionLetter, type KnockoutMatchLike } from "@/lib/tournaments/knockout";
import {

  progressSummary,
  sectionProgression,
  type ChampRound,
} from "@/lib/tournaments/knockout-progression";
import { useGenerateNextRound } from "@/hooks/use-generate-next-round";
import { ELIMINATED_NAME_CLASS } from "@/lib/tournaments/elimination";
import { prepareActionLabel, roundRedrawState } from "@/lib/tournaments/round-draw";
import { NextRoundDrawDialog, type NextRoundDrawMode } from "./NextRoundDrawDialog";
import { NextRoundSetupDialog, type NextRoundReady } from "./NextRoundSetupDialog";


interface KnockoutCardProps {
  champId: string;
  /** All matches of the tournament (knockout rows are filtered out here). */
  matches: any[];
  canManage: boolean;
  /** Configured round plan (`club_champs_rounds`). Empty falls back to bracket maths. */
  rounds?: ChampRound[];
  /** Renders one match row using the page's shared renderer. */
  renderMatchRow: (m: any) => ReactNode;
  /** League label resolver (group_number → display name). */
  groupLabel: (gn: number) => string;
  /** Knockout + players arrange their own court/date/time. */
  selfScheduled?: boolean;
  /** Deadline for a given round number (self-scheduled knockouts). */
  playByForRound?: (round: number) => string | null;
}

/** Display name for a member id, harvested from the embedded match relations. */
function buildNameMap(matches: any[]): Map<string, string> {
  const map = new Map<string, string>();
  const put = (id?: string | null, rel?: any) => {
    if (!id) return;
    const name = rel?.profiles?.name || rel?.name;
    // Never surface phone-number placeholder names (imported shells).
    if (name && !looksLikePhone(name) && !map.has(id)) map.set(id, name);
  };
  for (const m of matches) {
    put(m.player_a_member_id, m.player_a);
    put(m.player_b_member_id, m.player_b);
    put(m.partner_a_member_id, m.partner_a);
    put(m.partner_b_member_id, m.partner_b);
  }
  return map;
}

/**
 * Knockout draw — planned, not guessed.
 *
 * The organiser's configured rounds decide what the next stage is; this card
 * only offers to generate it once every match of the current round is
 * resolved. Knocked-out players stay listed (struck through) so the draw keeps
 * its full history instead of quietly dropping people.
 */
export function KnockoutCard({
  champId,
  matches,
  canManage,
  rounds = [],
  renderMatchRow,
  groupLabel,
  selfScheduled = false,
  playByForRound,
}: KnockoutCardProps) {
  const koMatches: KnockoutMatchLike[] = useMemo(
    () => (matches || []).filter((m: any) => (m.stage || "") === "ko"),
    [matches],
  );
  const names = useMemo(() => buildNameMap(matches || []), [matches]);
  const states = useMemo(() => sectionProgression(koMatches, rounds), [koMatches, rounds]);

  const leagues = useMemo(() => {
    const byLeague = new Map<number, typeof states>();
    for (const s of states) {
      if (!byLeague.has(s.groupNumber)) byLeague.set(s.groupNumber, [] as any);
      byLeague.get(s.groupNumber)!.push(s);
    }
    return Array.from(byLeague.entries()).sort((a, b) => a[0] - b[0]);
  }, [states]);

  const generate = useGenerateNextRound({ champId, states, selfScheduled, playByForRound });
  const [draw, setDraw] = useState<{ key: string; mode: NextRoundDrawMode } | null>(null);
  const keyOf = (s: { groupNumber: number; section: number }) => `${s.groupNumber}-${s.section}`;
  const drawState = draw ? states.find((s) => keyOf(s) === draw.key) ?? null : null;
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [setup, setSetup] = useState<NextRoundReady | null>(null);
  const setupState = setupKey ? states.find((s) => keyOf(s) === setupKey) ?? null : null;



  if (koMatches.length === 0) return null;

  return (
    <Card key="knockout" className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" /> Knockout draw
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {leagues.map(([gn, sections]) => {
          const draws = sections.filter((s) => s.section > 0).sort((a, b) => a.section - b.section);
          const finals = sections.find((s) => s.section === 0);
          const allDecided = draws.length > 1 && draws.every((s) => s.complete);
          const champion = finals?.complete ? finals.winner : draws.length === 1 ? draws[0].winner : null;
          return (
            <div key={gn} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupLabel(gn)}</div>
                {champion && (
                  <Badge className="text-[10px]">Winner: {names.get(champion) || "decided"}</Badge>
                )}
              </div>

              {draws.map((s) => {
                const rows = koMatches
                  .filter((m: any) => m.group_number === gn && m.section_number === s.section)
                  .sort(
                    (a: any, b: any) =>
                      (a.round_number ?? 0) - (b.round_number ?? 0) ||
                      (a.bracket_position ?? 0) - (b.bracket_position ?? 0),
                  );
                const alive = s.entrants.filter((e) => !e.eliminated).length;
                return (
                  <div key={s.section} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
                      {draws.length > 1 && <span>Section {sectionLetter(s.section)}</span>}
                      <span>{progressSummary(s)}</span>
                    </div>
                    {rows.map((m: any) => renderMatchRow(m))}

                    {s.entrants.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Draw participants · {alive} still in
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {s.entrants.map((e) => (
                            <span
                              key={e.memberId}
                              className={cn("text-[11px]", e.eliminated && ELIMINATED_NAME_CLASS)}
                              title={
                                e.eliminated
                                  ? `Knocked out in round ${e.eliminatedInRound}`
                                  : "Still in this division"
                              }
                            >
                              {names.get(e.memberId) || "Player"}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {canManage && s.canGenerateNext && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generate.isPending}
                        onClick={() => setSetupKey(keyOf(s))}
                      >
                        {prepareActionLabel(s.nextRound?.label, (s.currentRound || 0) + 1)}
                      </Button>
                    )}
                    {canManage && !s.canGenerateNext && !s.complete && roundRedrawState(s.currentRoundMatches).canRedraw && (
                      <Button size="sm" variant="ghost" onClick={() => setDraw({ key: keyOf(s), mode: "redraw" })}>
                        Review / redraw round
                      </Button>
                    )}
                    {canManage && !s.canGenerateNext && s.blockedReason && !s.complete && (
                      <p className="text-[11px] text-muted-foreground">{s.blockedReason}</p>
                    )}
                  </div>
                );
              })}

              {finals && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">League final</div>
                  {koMatches
                    .filter((m: any) => m.group_number === gn && m.section_number === 0)
                    .sort((a: any, b: any) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0))
                    .map((m: any) => renderMatchRow(m))}
                </div>
              )}

              {canManage && allDecided && !finals && (
                <Button size="sm" disabled={generate.isPending} onClick={() => generate.mutate({ groupNumber: gn })}>
                  Generate league final ({draws.length} section winners)
                </Button>
              )}
            </div>
          );
        })}
        {canManage && (
          <p className="text-[11px] text-muted-foreground">
            Rounds are created one at a time, following the round plan for this tournament — new matches start
            unscheduled.
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
            plannedPlayBy={
              playByForRound?.(setupState.nextRound?.round_number ?? setupState.currentRound + 1) ?? null
            }
            divisionLabel={`${groupLabel(setupState.groupNumber)} · Pool ${sectionLetter(setupState.section)}`}
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
            multiSection={
              states.filter((s) => s.groupNumber === drawState.groupNumber && s.section > 0).length > 1
            }
            selfScheduled={selfScheduled}
            divisionLabel={`${groupLabel(drawState.groupNumber)} · Pool ${sectionLetter(drawState.section)}`}
            setup={draw.mode === "prepare" ? setup : null}
            onConfirmed={() => {
              setDraw(null);
              setSetup(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
