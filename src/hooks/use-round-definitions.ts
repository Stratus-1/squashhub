/**
 * The tournament's central round definitions and championship milestones.
 *
 * Every screen READS from here and only the central editor WRITES, so a round
 * date can never be entered twice in two places and quietly disagree.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import {
  centralDateImpact,
  definitionFor,
  fromLegacyDeadlines,
  parseMilestones,
  parseRoundDefinitions,
  serializeRoundDefinitions,
  type MilestoneKey,
  type MilestonePlayBy,
  type RoundDefinition,
} from "@/lib/tournaments/round-definitions";
import { parseRoundDeadlines } from "@/lib/tournaments/round-deadlines";

export type CentralRounds = {
  definitions: RoundDefinition[];
  milestones: MilestonePlayBy;
  /** True while the tournament still only has the legacy positional list. */
  fromLegacy: boolean;
};

export function useRoundDefinitions(champId?: string | null) {
  return useQuery<CentralRounds>({
    queryKey: ["champ-round-definitions", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments")
        .select("round_definitions, milestone_play_by, round_play_by")
        .eq("id", champId!)
        .maybeSingle();
      if (error) throw error;
      const row = (data || {}) as Record<string, unknown>;
      const stored = parseRoundDefinitions(row.round_definitions);
      // Tournaments created before the central list keep working: their old
      // positional plan is read as definitions until the organiser saves.
      const legacy = stored.length === 0;
      return {
        definitions: legacy ? fromLegacyDeadlines(parseRoundDeadlines(row.round_play_by)) : stored,
        milestones: parseMilestones(row.milestone_play_by),
        fromLegacy: legacy,
      };
    },
    enabled: !!champId,
    staleTime: 30_000,
  });
}

export type SaveCentralRoundsVars = {
  definitions: RoundDefinition[];
  milestones: MilestonePlayBy;
};

/**
 * Save the central list. Every changed round date is recorded — who moved it,
 * from what to what, and how many fixtures it touched — and fixtures that are
 * already played or booked are counted as protected, never rewritten.
 */
export function useSaveRoundDefinitions(opts: { champId: string; clubId?: string | null }) {
  const { champId, clubId } = opts;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ definitions, milestones }: SaveCentralRoundsVars) => {
      const { data: before, error: readErr } = await fromExt("tournaments")
        .select("club_id, round_definitions, milestone_play_by, round_play_by")
        .eq("id", champId)
        .maybeSingle();
      if (readErr) throw readErr;
      const prevRow = (before || {}) as Record<string, unknown>;
      const prevDefs = parseRoundDefinitions(prevRow.round_definitions).length
        ? parseRoundDefinitions(prevRow.round_definitions)
        : fromLegacyDeadlines(parseRoundDeadlines(prevRow.round_play_by));
      const prevMilestones = parseMilestones(prevRow.milestone_play_by);
      const club = clubId || (prevRow.club_id as string | undefined) || null;

      const payload = serializeRoundDefinitions(definitions);
      const { error } = await fromExt("tournaments")
        .update({ round_definitions: payload, milestone_play_by: milestones } as any)
        .eq("id", champId);
      if (error) throw error;

      // --- audit ------------------------------------------------------
      const changedRounds = payload.filter(
        (d) => (definitionFor(prevDefs, d.round)?.play_by ?? null) !== (d.play_by ?? null),
      );
      const changedMilestones = (["quarter_final", "semi_final", "final"] as MilestoneKey[]).filter(
        (k) => (prevMilestones[k] ?? null) !== (milestones[k] ?? null),
      );
      if (changedRounds.length === 0 && changedMilestones.length === 0) return { audited: 0 };

      const { data: fixtures } = await fromExt("club_champs_matches")
        .select("round_number, status, scheduled_date, court_id, booking_id, play_by")
        .eq("champ_id", champId);
      const rows = ((fixtures as any[]) || []) as any[];
      const { data: auth } = await supabase.auth.getUser();

      const entries = [
        ...changedRounds.map((d) => {
          const impact = centralDateImpact(rows, d.round);
          return {
            champ_id: champId,
            club_id: club,
            changed_by: auth?.user?.id ?? null,
            scope: "round",
            round_number: d.round,
            stage_key: "early",
            old_play_by: definitionFor(prevDefs, d.round)?.play_by ?? null,
            new_play_by: d.play_by ?? null,
            fixtures_affected: impact.affected,
            fixtures_protected: impact.protected,
          };
        }),
        ...changedMilestones.map((k) => ({
          champ_id: champId,
          club_id: club,
          changed_by: auth?.user?.id ?? null,
          scope: "milestone",
          round_number: null,
          stage_key: k,
          old_play_by: prevMilestones[k] ?? null,
          new_play_by: milestones[k] ?? null,
          fixtures_affected: 0,
          fixtures_protected: 0,
        })),
      ].filter((e) => !!e.club_id);

      if (entries.length > 0) {
        // Never let an audit failure undo a save the organiser already made.
        const { error: auditErr } = await fromExt("champ_round_date_audit").insert(entries as any);
        if (auditErr) console.warn("round date audit failed", auditErr);
      }
      return { audited: entries.length };
    },
    onSuccess: () => {
      toast.success("Round dates saved for the whole tournament.");
      qc.invalidateQueries({ queryKey: ["champ-round-definitions", champId] });
      qc.invalidateQueries({ queryKey: ["club-champ-rounds", champId] });
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the round dates"),
  });
}
