/**
 * "Draw everything on one page" — every outstanding next-round draw, together.
 *
 * When the whole set of ready draws is small enough to fit (see
 * `allDrawsFitOnePage`), the organiser should not be walked through a queue:
 * they see all division/pool boards at once, can arrange each one, and confirm
 * the lot in a single pass. Bigger rounds fall back to the step-by-step queue.
 *
 * Each board is still its own confirmed draw — fixtures, round metadata and the
 * audit trail are written per scope exactly as the single-scope dialog does, so
 * nothing about the data model changes here.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import { notifyRoundDraw } from "@/lib/tournaments/round-notify";
import { supabase } from "@/integrations/supabase/client";
import { DrawBoard } from "./DrawBoard";
import { typeForPlayers, type SectionProgression } from "@/lib/tournaments/knockout-progression";
import { qualifierEntrants } from "@/lib/tournaments/round-draw";
import {
  drawAuditSnapshot,
  drawToMatchRows,
  suggestNextRoundBoard,
  validateDrawBoard,
  type DrawBoard as DrawBoardModel,
  type DrawEntrant,
} from "@/lib/tournaments/draw-board";
import {
  defaultPlayBy,
  suggestStageName,
  type NextRoundScope,
} from "@/lib/tournaments/next-round-setup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  /** The outstanding scopes, in queue order. */
  scopes: NextRoundScope[];
  /** Live progression for every section of the tournament. */
  states: SectionProgression[];
  selfScheduled?: boolean;
  /**
   * The tournament's configured play-by date per round number
   * (`round_play_by` from setup). Always preferred over the +7-day guess.
   */
  playByForRound?: (round: number) => string | null;
  scopeLabel: (groupNumber: number, section: number) => string;
  /** Called once every board has been confirmed, with the keys that were done. */
  onConfirmed?: (keys: string[]) => void;
}

type ScopeDraft = {
  label: string;
  playBy: string;
  board: DrawBoardModel;
  suggested: DrawBoardModel;
};

export function AllNextRoundDrawsDialog({
  open,
  onOpenChange,
  champId,
  scopes,
  states,
  selfScheduled,
  scopeLabel,
  onConfirmed,
}: Props) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, ScopeDraft>>({});
  const [saving, setSaving] = useState(false);

  const stateOf = (scope: NextRoundScope) =>
    states.find((s) => s.groupNumber === scope.groupNumber && s.section === scope.section) ?? null;

  const ids = useMemo(
    () => Array.from(new Set(scopes.flatMap((s) => s.qualifierIds))),
    [scopes],
  );

  const { data: nameMap = {} } = useQuery({
    queryKey: ["draw-entrant-names", champId, ids.join(",")],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members").select("id, name, ladder_position").in("id", ids);
      if (error) throw error;
      const out: Record<string, { name: string; ladder: number | null }> = {};
      for (const r of (data || []) as any[]) out[r.id] = { name: r.name, ladder: r.ladder_position ?? null };
      return out;
    },
    enabled: open && ids.length > 0,
  });

  /** Entrants per scope, named once the member lookup resolves. */
  const entrantsByScope = useMemo(() => {
    const out: Record<string, DrawEntrant[]> = {};
    for (const scope of scopes) {
      const state = stateOf(scope);
      if (!state) continue;
      out[scope.key] = qualifierEntrants(state, () => "Player").map((e) => ({
        ...e,
        name: nameMap[e.id]?.name || e.name,
        partnerName: e.partnerId ? nameMap[e.partnerId]?.name ?? null : null,
        rankLabel: nameMap[e.id]?.ladder ? `Ladder ${nameMap[e.id]!.ladder}` : null,
      }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopes, states, nameMap]);

  // Suggested boards + round metadata, seeded once per opening.
  useEffect(() => {
    if (!open) return;
    setDrafts((prev) => {
      const next: Record<string, ScopeDraft> = {};
      for (const scope of scopes) {
        const state = stateOf(scope);
        if (!state) continue;
        const existing = prev[scope.key];
        const suggested = suggestNextRoundBoard({
          groupNumber: scope.groupNumber,
          section: scope.section,
          round: scope.roundNumber,
          winners: entrantsByScope[scope.key] || [],
        });
        next[scope.key] = existing
          ? { ...existing, suggested }
          : {
              label: suggestStageName({
                plannedLabel: state.nextRound?.label,
                roundNumber: scope.roundNumber,
                qualifiers: scope.qualifiers,
              }),
              // Priority: saved round row → configured round deadline → +7d guess.
              playBy: state.nextRound?.play_by
                ? String(state.nextRound.play_by).slice(0, 10)
                : playByForRound?.(scope.roundNumber) ?? defaultPlayBy(),
              board: suggested,
              suggested,
            };
        // Names arriving later must not wipe a manual arrangement.
        if (existing && existing.board.matches.length === 0) next[scope.key].board = suggested;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopes, entrantsByScope]);

  const today = new Date().toISOString().slice(0, 10);

  const problems = useMemo(() => {
    const out: string[] = [];
    for (const scope of scopes) {
      const draft = drafts[scope.key];
      const entrants = entrantsByScope[scope.key] || [];
      const label = scopeLabel(scope.groupNumber, scope.section);
      if (!draft) continue;
      if (!draft.label.trim()) out.push(`${label}: give this round a name.`);
      if (selfScheduled && !draft.playBy) out.push(`${label}: set the play-by date.`);
      const v = validateDrawBoard(draft.board, entrants);
      if (!v.ok) out.push(`${label}: ${v.errors?.[0] || "this draw is not valid yet"}`);
    }
    return out;
  }, [scopes, drafts, entrantsByScope, selfScheduled, scopeLabel]);

  const totalMatches = useMemo(
    () =>
      Object.values(drafts).reduce(
        (t, d) => t + d.board.matches.filter((m) => m.a || m.b).length,
        0,
      ),
    [drafts],
  );

  const patch = (key: string, next: Partial<ScopeDraft>) =>
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...next } }));

  const confirmAll = async () => {
    if (problems.length > 0) return;
    setSaving(true);
    const done: string[] = [];
    let notifiedPlayers = 0;
    let notifyFailures = 0;
    let waFailures = 0;
    try {
      for (const scope of scopes) {
        const state = stateOf(scope);
        const draft = drafts[scope.key];
        const entrants = entrantsByScope[scope.key] || [];
        if (!state || !draft) continue;

        // 1. Round metadata (same shape the single-scope setup popup writes).
        let roundId = state.nextRound?.id ?? null;
        const roundPayload = {
          champ_id: champId,
          group_number: scope.groupNumber,
          section_number: scope.section,
          round_number: scope.roundNumber,
          round_type: typeForPlayers(Math.max(2, scope.qualifiers)),
          label: draft.label.trim(),
          play_by: draft.playBy || null,
          scheduling_mode: selfScheduled ? "self" : "club",
          status: "pending",
        };
        if (roundId) {
          const { error } = await fromExt("club_champs_rounds")
            .update({
              label: roundPayload.label,
              play_by: roundPayload.play_by,
              round_type: roundPayload.round_type,
            })
            .eq("id", roundId);
          if (error) throw error;
        } else {
          const { data, error } = await fromExt("club_champs_rounds")
            .insert(roundPayload as any)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          roundId = (data as any)?.id ?? null;
        }

        // 2. Fixtures — never twice for the same division/section/round.
        const multiSection =
          states.filter((s) => s.groupNumber === scope.groupNumber && s.section > 0).length > 1;
        const rows = drawToMatchRows({
          champId,
          board: draft.board,
          entrants,
          multiSection,
          playBy: draft.playBy || null,
          roundId,
        });
        if (rows.length === 0) throw new Error(`${scopeLabel(scope.groupNumber, scope.section)}: nothing to generate`);
        const { data: existing, error: exErr } = await fromExt("club_champs_matches")
          .select("id")
          .eq("champ_id", champId)
          .eq("group_number", draft.board.groupNumber)
          .eq("round_number", draft.board.round)
          .in("section_number", Array.from(new Set(rows.map((r) => r.section_number))))
          .limit(1);
        if (exErr) throw exErr;
        if (existing && existing.length > 0) {
          // Another tab (or an earlier click) already made this one — skip it
          // rather than duplicating the round.
          done.push(scope.key);
          continue;
        }
        const { error: insErr } = await fromExt("club_champs_matches").insert(rows as any);
        if (insErr) throw insErr;
        done.push(scope.key);

        // Notify both players in every fixture of this scope through the
        // channels enabled for this tournament (in-app / email / WhatsApp).
        try {
          const notified = await notifyRoundDraw({
            champId,
            roundNumber: draft.board.round,
            groupNumber: draft.board.groupNumber,
            sections: Array.from(new Set(rows.map((r) => r.section_number))).filter(
              (s) => typeof s === "number",
            ) as number[],
          });
          notifiedPlayers += notified.sent;
          waFailures += notified.whatsappFailed;
        } catch {
          notifyFailures += 1;
        }

        // 3. Audit — never allowed to block a valid draw.
        try {
          const { data: auth } = await supabase.auth.getUser();
          const { data: champ } = await fromExt("tournaments")
            .select("draw_version")
            .eq("id", champId)
            .maybeSingle();
          const version = (champ?.draw_version ?? 0) + 1;
          await fromExt("tournament_draw_versions").insert({
            tournament_id: champId,
            version,
            created_by: auth?.user?.id ?? null,
            note: `Confirmed draw (one page) — ${scopeLabel(scope.groupNumber, scope.section)}, round ${draft.board.round}`,
            match_count: rows.length,
            snapshot: drawAuditSnapshot({
              board: draft.board,
              suggested: draft.suggested,
              entrants,
              divisionLabel: scopeLabel(scope.groupNumber, scope.section),
            }) as any,
          });
          await fromExt("tournaments").update({ draw_version: version }).eq("id", champId);
        } catch {
          /* audit is best-effort */
        }
      }

      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["club-champ-rounds", champId] });
      qc.invalidateQueries({ queryKey: ["champ-draw-versions", champId] });
      toast.success(
        done.length === 1
          ? "Draw confirmed — fixtures created. Next: set dates & courts."
          : `${done.length} draws confirmed — fixtures created. Next: set dates & courts.`,
      );
      if (notifiedPlayers > 0) toast.success(`Notified ${notifiedPlayers} player${notifiedPlayers === 1 ? "" : "s"} of their next opponent.`);
      if (notifyFailures > 0) toast.warning(`${notifyFailures} draw(s) confirmed but players could not be notified.`);
      if (waFailures > 0) toast.warning(`${waFailures} WhatsApp message(s) failed.`);
      onOpenChange(false);
      onConfirmed?.(done);
    } catch (e: any) {
      // Whatever succeeded stays done — the queue picks up the rest.
      if (done.length > 0) onConfirmed?.(done);
      toast.error(e?.message || "Could not confirm these draws");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Arrange all {scopes.length} draws
          </DialogTitle>
          <DialogDescription>
            Every draw that is ready fits on this page. Name each round, set its play-by date and drag players into the
            matchups you want. Nothing is created until you confirm — then all {scopes.length} draws are generated
            together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {scopes.map((scope, i) => {
            const draft = drafts[scope.key];
            const entrants = entrantsByScope[scope.key] || [];
            if (!draft) return null;
            return (
              <div key={scope.key} className="rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    Draw {i + 1} of {scopes.length}
                  </Badge>
                  <span className="text-xs font-medium">{scopeLabel(scope.groupNumber, scope.section)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {scope.qualifiers} qualifiers · {scope.matchups} matches
                  </span>
                </div>

                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`label-${scope.key}`} className="text-xs">Round / stage name</Label>
                    <Input
                      id={`label-${scope.key}`}
                      value={draft.label}
                      maxLength={60}
                      onChange={(e) => patch(scope.key, { label: e.target.value })}
                      placeholder={scope.stageLabel}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`playby-${scope.key}`} className="text-xs">
                      Play by {selfScheduled ? "" : "(optional)"}
                    </Label>
                    <Input
                      id={`playby-${scope.key}`}
                      type="date"
                      value={draft.playBy}
                      min={today}
                      onChange={(e) => patch(scope.key, { playBy: e.target.value })}
                    />
                  </div>
                </div>

                <DrawBoard
                  board={draft.board}
                  entrants={entrants}
                  onChange={(next) => patch(scope.key, { board: next })}
                  onReset={() => patch(scope.key, { board: draft.suggested })}
                />
              </div>
            );
          })}

          {problems.map((p) => (
            <p key={p} className="text-[11px] text-destructive">{p}</p>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            {totalMatches} fixture{totalMatches === 1 ? "" : "s"} will be created across {scopes.length} draws.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmAll} disabled={saving || problems.length > 0}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Confirm all draws
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
