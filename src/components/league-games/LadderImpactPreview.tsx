import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowDown, ArrowUp, Minus, AlertTriangle, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  computeLadderImpact,
  type Rubber,
  type LadderImpactResult,
  type SkipReason,
} from "@/lib/ladder-impact";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixtureId: string;
}

type LoadedState = {
  affectsLadder: boolean;
  associationId: string | null;
  associationName: string;
  clubId: string | null;
  rubbers: Rubber[];
  memberNames: Map<string, string>;
  initialLadder: Map<string, number>;
  fixtureLabel: string;
};

const skipLabel: Record<SkipReason, string> = {
  forfeit: "Forfeit — skipped",
  no_winner: "No winner recorded",
  missing_player_code: "Missing player code on one side",
  not_original_home: "Home player is a sub/external",
  not_original_away: "Away player is a sub/external",
  no_ladder_position: "Player has no ladder position",
  winner_already_higher: "Winner already ranked higher — no movement",
};

export function LadderImpactPreview({ open, onOpenChange, fixtureId }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [state, setState] = useState<LoadedState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setState(null);
      try {
        const loaded = await loadImpactData(fixtureId);
        if (!cancelled) setState(loaded);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load ladder preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fixtureId]);

  const impact: LadderImpactResult | null = useMemo(() => {
    if (!state) return null;
    return computeLadderImpact(state.rubbers, state.initialLadder, state.memberNames);
  }, [state]);

  const handleApply = async () => {
    if (!state || !impact || !state.clubId) return;
    if (impact.finalChanges.length === 0) {
      toast.info("No ladder changes to apply");
      return;
    }
    setApplying(true);
    try {
      const adjustments = impact.finalChanges.map((c) => ({
        member_id: c.memberId,
        old_position: c.oldPosition,
        new_position: c.newPosition,
        reason: `Internal league leapfrog (${state.associationName})`,
      }));
      const { error: rpcErr } = await supabase.rpc("apply_ladder_adjustments" as any, {
        _club_id: state.clubId,
        _association_id: state.associationId,
        _fixture_id: fixtureId,
        _adjustments: adjustments,
        _summary: `Internal league leapfrog — ${state.fixtureLabel}`,
      });
      if (rpcErr) throw rpcErr;
      toast.success(`Applied ${impact.finalChanges.length} ladder change${impact.finalChanges.length === 1 ? "" : "s"}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply ladder changes");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Preview ladder impact
          </DialogTitle>
          <DialogDescription className="text-xs">
            Dry-run leapfrog of tonight's rubbers against the current club ladder. Nothing is changed until you press <b>Apply</b>.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && state && impact && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-2">
              {!state.affectsLadder && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    This association does <b>not</b> have <i>Affects club ladder</i> enabled. Showing a preview only — Apply will refuse.
                  </span>
                </div>
              )}

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Leapfrog swaps ({impact.swaps.length})
                </h4>
                {impact.swaps.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No swaps — every winner was already ranked at or above their opponent.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {impact.swaps.map((s, i) => (
                      <li key={i} className="rounded border bg-card p-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">Pos {s.position}</Badge>
                          <span className="font-medium">{s.winnerName}</span>
                          <span className="text-muted-foreground">beat</span>
                          <span>{s.loserName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-emerald-600" />
                            <b>{s.winnerName}</b>: #{s.winnerOldPos} → #{s.winnerNewPos}
                          </span>
                          {s.shiftedDownMemberIds.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ArrowDown className="w-3 h-3 text-amber-600" />
                              {s.shiftedDownMemberIds.length} shifted down
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Final ladder changes ({impact.finalChanges.length})
                </h4>
                {impact.finalChanges.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No net ladder movement.</p>
                ) : (
                  <ul className="divide-y rounded border">
                    {impact.finalChanges.map((c) => {
                      const delta = c.newPosition - c.oldPosition;
                      const up = delta < 0;
                      return (
                        <li key={c.memberId} className="flex items-center justify-between px-2 py-1.5 text-xs">
                          <span className="font-medium">{c.name}</span>
                          <span className="inline-flex items-center gap-2 tabular-nums">
                            <span className="text-muted-foreground">#{c.oldPosition}</span>
                            {up ? (
                              <ArrowUp className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-amber-600" />
                            )}
                            <span className="font-semibold">#{c.newPosition}</span>
                            <Badge variant={up ? "default" : "secondary"} className="text-[10px]">
                              {up ? `+${Math.abs(delta)}` : `-${Math.abs(delta)}`}
                            </Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {impact.skipped.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Skipped rubbers ({impact.skipped.length})
                  </h4>
                  <ul className="space-y-1">
                    {impact.skipped.map((s, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <Minus className="w-3 h-3" />
                        <span>Pos {s.position}: {skipLabel[s.reason]}{s.detail ? ` — ${s.detail}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={applying}>
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={
              applying ||
              loading ||
              !state?.affectsLadder ||
              !impact ||
              impact.finalChanges.length === 0
            }
          >
            {applying && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Apply {impact?.finalChanges.length ?? 0} change{(impact?.finalChanges.length ?? 0) === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------
async function loadImpactData(fixtureId: string): Promise<LoadedState> {
  const { data: fixture, error: fxErr } = await supabase
    .from("platform_league_fixtures")
    .select("id, association_id, home_team_code, away_team_code, fixture_date, division")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fxErr) throw fxErr;
  if (!fixture) throw new Error("Fixture not found");

  const { data: assoc } = await supabase
    .from("league_associations" as any)
    .select("id, name, scope, affects_ladder")
    .eq("id", fixture.association_id)
    .maybeSingle();

  const affectsLadder = !!(assoc as any)?.affects_ladder && (assoc as any)?.scope === "internal";

  const homeCode = (fixture.home_team_code || "").toUpperCase();
  const awayCode = (fixture.away_team_code || "").toUpperCase();

  // Find the leagues that correspond to this fixture's two team codes within this association.
  const { data: leagues } = await supabase
    .from("leagues")
    .select("id, club_id, code, nsa_team_code, name")
    .eq("association_id", fixture.association_id);
  const matchLeague = (code: string) =>
    (leagues || []).find((l: any) =>
      (l.nsa_team_code || "").toUpperCase() === code ||
      (l.code || "").toUpperCase() === code
    ) as any;
  const homeLeague = matchLeague(homeCode);
  const awayLeague = matchLeague(awayCode);

  // For internal leagues both sides should share a club; pick it.
  const clubId: string | null = homeLeague?.club_id || awayLeague?.club_id || null;

  // Lineup snapshot (original players) by fixture+league.
  const { data: lineups } = await supabase
    .from("league_fixture_lineups" as any)
    .select("league_id, position, club_member_id")
    .eq("fixture_id", fixtureId);

  const originalByPos = {
    home: new Map<number, string>(),
    away: new Map<number, string>(),
  };
  for (const row of (lineups || []) as any[]) {
    if (homeLeague && row.league_id === homeLeague.id) originalByPos.home.set(row.position, row.club_member_id);
    if (awayLeague && row.league_id === awayLeague.id) originalByPos.away.set(row.position, row.club_member_id);
  }

  // Match results.
  const { data: matches } = await supabase
    .from("league_match_results" as any)
    .select("position, home_player_code, away_player_code, home_player_name, away_player_name, winner, is_forfeit")
    .eq("fixture_id", fixtureId)
    .order("position");

  // Resolve actual played members by club_member_number within the involved club(s).
  const codeKeys = new Set<string>();
  for (const m of (matches || []) as any[]) {
    if (m.home_player_code) codeKeys.add(String(m.home_player_code).toUpperCase());
    if (m.away_player_code) codeKeys.add(String(m.away_player_code).toUpperCase());
  }
  const clubIds = [homeLeague?.club_id, awayLeague?.club_id].filter(Boolean) as string[];
  const codeToMember = new Map<string, string>();
  const memberNames = new Map<string, string>();
  if (codeKeys.size > 0 && clubIds.length > 0) {
    const { data: cms } = await supabase
      .from("club_members")
      .select("id, club_member_number, name, ladder_position")
      .in("club_id", clubIds);
    for (const cm of (cms || []) as any[]) {
      const num = (cm.club_member_number || "").toUpperCase();
      if (num && codeKeys.has(num)) codeToMember.set(num, cm.id);
      if (cm.name) memberNames.set(cm.id, cm.name);
    }
  }

  // Resolve initial ladder snapshot for ALL involved members (original + actual).
  const involvedIds = new Set<string>();
  for (const id of originalByPos.home.values()) involvedIds.add(id);
  for (const id of originalByPos.away.values()) involvedIds.add(id);
  for (const id of codeToMember.values()) involvedIds.add(id);

  // We need the FULL ladder to leapfrog correctly (members between winner & loser shift down).
  const initialLadder = new Map<string, number>();
  if (clubId) {
    const { data: ladderRows } = await supabase
      .from("club_members")
      .select("id, ladder_position, name")
      .eq("club_id", clubId)
      .not("ladder_position", "is", null);
    for (const row of (ladderRows || []) as any[]) {
      initialLadder.set(row.id, row.ladder_position);
      if (row.name && !memberNames.has(row.id)) memberNames.set(row.id, row.name);
    }
  }

  // Build Rubber[].
  const rubbers: Rubber[] = ((matches || []) as any[]).map((m) => {
    const homeCodeKey = String(m.home_player_code || "").toUpperCase();
    const awayCodeKey = String(m.away_player_code || "").toUpperCase();
    return {
      fixtureId,
      position: m.position,
      winnerSide: m.winner === "home" || m.winner === "away" ? m.winner : ("" as any),
      homeMemberId: codeToMember.get(homeCodeKey) || null,
      awayMemberId: codeToMember.get(awayCodeKey) || null,
      homeOriginalMemberId: originalByPos.home.get(m.position) || null,
      awayOriginalMemberId: originalByPos.away.get(m.position) || null,
      isForfeit: !!m.is_forfeit,
      homeName: m.home_player_name || homeCodeKey,
      awayName: m.away_player_name || awayCodeKey,
    };
  });

  return {
    affectsLadder,
    associationId: (assoc as any)?.id ?? fixture.association_id,
    associationName: (assoc as any)?.name ?? "Internal League",
    clubId,
    rubbers,
    memberNames,
    initialLadder,
    fixtureLabel: `${homeCode} vs ${awayCode} — ${fixture.fixture_date}`,
  };
}
