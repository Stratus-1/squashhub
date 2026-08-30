/**
 * The ONE way a later knockout round is created.
 *
 * Every surface (knockout card, progress card, standings) calls this hook, so
 * there is a single code path, a single toast and a single cache invalidation.
 * It never rebuilds the tournament: it only inserts the fixtures of the next
 * round, and it refuses to run twice by re-checking the database first.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { buildLeagueFinals, buildNextRound, sectionLetter } from "@/lib/tournaments/knockout";
import { buildGraduatedNextRound } from "@/lib/tournaments/graduated";
import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import type { SectionProgression } from "@/lib/tournaments/knockout-progression";

/**
 * Every newly created round tells its players who they play, through exactly
 * the channels the tournament enabled (in-app / email / WhatsApp). Never let a
 * notification failure undo a round that was already saved.
 */
async function announceRound(
  champId: string,
  roundNumber: number,
  groupNumber: number,
  section?: number,
) {
  try {
    const res = await notifyRoundDraw({
      champId,
      roundNumber,
      groupNumber,
      sections: typeof section === "number" ? [section] : null,
    });
    if (res.sent > 0) toast.success(roundNotifySummary(res));
    if (res.whatsappFailed > 0) toast.warning(`${res.whatsappFailed} WhatsApp message(s) failed.`);
  } catch (e: any) {
    toast.warning(`Round created, but players could not be notified: ${e?.message || e}`);
  }
}

/**
 * Strength order for a section, taken from its opening round: the earlier a
 * player appears on the round-1 board, the stronger they were seeded. Used by
 * the graduated draw so survivors are re-ranked by original strength.
 */
async function seedOrderForSection(champId: string, groupNumber: number, section: number) {
  const { data } = await fromExt("club_champs_matches")
    .select("bracket_position, player_a_member_id, player_b_member_id")
    .eq("champ_id", champId)
    .eq("group_number", groupNumber)
    .eq("section_number", section)
    .eq("round_number", 1)
    .order("bracket_position", { ascending: true });
  const order = new Map<string, number>();
  for (const m of (data as any[]) || []) {
    for (const id of [m.player_a_member_id, m.player_b_member_id]) {
      if (id && !order.has(id)) order.set(id, order.size + 1);
    }
  }
  return (memberId: string) => order.get(memberId) ?? order.size + 1;
}

/** Is this division set up as a graduated ("fair entry") knockout? */
async function isGraduatedDivision(champId: string, groupNumber: number) {
  const { data } = await fromExt("tournaments")
    .select("league_draw_styles")
    .eq("id", champId)
    .maybeSingle();
  const styles = ((data as any)?.league_draw_styles || {}) as Record<string, unknown>;
  return styles[String(groupNumber)] === "graduated";
}

export type GenerateNextRoundVars = { groupNumber: number; section?: number };

export function useGenerateNextRound(opts: {
  champId: string;
  states: SectionProgression[];
  selfScheduled?: boolean;
  playByForRound?: (round: number) => string | null;
  onGenerated?: (count: number, vars: GenerateNextRoundVars) => void;
}) {
  const { champId, states, selfScheduled = false, playByForRound, onGenerated } = opts;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupNumber, section }: GenerateNextRoundVars) => {
      const mine = states.filter((s) => s.groupNumber === groupNumber);
      // Section 0 is the league finals bracket. Asking for it before it exists
      // means "create the cross-pool decider", which is the branch below.
      const wantsLeagueFinal = section === 0 && !mine.some((s) => s.section === 0);

      if (section !== undefined && !wantsLeagueFinal) {

        const st = mine.find((s) => s.section === section);
        if (!st) throw new Error("This section has no draw yet");
        if (!st.canGenerateNext) throw new Error(st.blockedReason || "This round is not finished yet");
        const nextNumber = st.nextRound!.round_number;

        // Idempotency: the round may already have been created from another
        // surface (or a double click) since this component last rendered.
        const { data: existing, error: exErr } = await fromExt("club_champs_matches")
          .select("id")
          .eq("champ_id", champId)
          .eq("group_number", groupNumber)
          .eq("section_number", section)
          .eq("round_number", nextNumber)
          .limit(1);
        if (exErr) throw exErr;
        if (existing && existing.length > 0) {
          throw new Error(`${st.nextRound?.label || "The next round"} already exists`);
        }

        const multi = mine.filter((s) => s.section > 0).length > 1;
        const sectionLabel = multi ? `Section ${sectionLetter(section)}` : undefined;
        const playBy = selfScheduled
          ? st.nextRound?.play_by ?? playByForRound?.(nextNumber) ?? null
          : null;

        if (await isGraduatedDivision(champId, groupNumber)) {
          const seedOf = await seedOrderForSection(champId, groupNumber, section);
          const gRows = buildGraduatedNextRound({
            champId,
            groupNumber,
            section,
            roundMatches: st.currentRoundMatches,
            seedOf,
            sectionLabel,
            playBy,
          });
          if (gRows.length === 0) throw new Error("Nothing to generate");
          const gWithRound = st.nextRound?.id
            ? gRows.map((r) => ({ ...r, round_id: st.nextRound!.id }))
            : gRows;
          const { error: gErr } = await fromExt("club_champs_matches").insert(gWithRound as any);
          if (gErr) throw gErr;
          await announceRound(champId, nextNumber, groupNumber, section);
          return gRows.length;
        }

        const rows = buildNextRound({
          champId,
          groupNumber,
          section,
          roundMatches: st.currentRoundMatches,
          sectionLabel,
          playBy,
        });
        if (rows.length === 0) throw new Error("Nothing to generate");
        const withRound = st.nextRound?.id ? rows.map((r) => ({ ...r, round_id: st.nextRound!.id })) : rows;
        const { error } = await fromExt("club_champs_matches").insert(withRound as any);
        if (error) throw error;
        await announceRound(champId, nextNumber, groupNumber, section);
        return rows.length;
      }

      // League final between section winners.
      const sections = mine.filter((s) => s.section > 0);
      if (sections.length < 2) throw new Error("This league only has one section");
      if (!sections.every((s) => s.complete)) throw new Error("Every section must be decided first");
      if (mine.some((s) => s.section === 0)) throw new Error("The league final already exists");
      const deepest = Math.max(...sections.map((s) => s.currentRound));
      const { data: existingFinal, error: fErr } = await fromExt("club_champs_matches")
        .select("id")
        .eq("champ_id", champId)
        .eq("group_number", groupNumber)
        .eq("section_number", 0)
        .limit(1);
      if (fErr) throw fErr;
      if (existingFinal && existingFinal.length > 0) throw new Error("The league final already exists");
      const rows = buildLeagueFinals({
        champId,
        groupNumber,
        round: deepest + 1,
        sectionWinners: sections.map((s) => {
          const m = s.currentRoundMatches[0];
          const w = s.winner!;
          const partner =
            m?.player_a_member_id === w
              ? m?.partner_a_member_id
              : m?.player_b_member_id === w
                ? m?.partner_b_member_id
                : null;
          return { section: s.section, memberId: w, partnerId: partner ?? null };
        }),
      });
      if (rows.length === 0) throw new Error("Nothing to generate");
      const { error } = await fromExt("club_champs_matches").insert(rows as any);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n, vars) => {
      toast.success(
        selfScheduled
          ? `Created ${n} match${n === 1 ? "" : "es"}. Players arrange their own court and time.`
          : `Created ${n} match${n === 1 ? "" : "es"}. Next: set dates and courts.`,
      );
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["club-champ-rounds", champId] });
      onGenerated?.(n, vars);
    },
    onError: (e: any) => toast.error(e.message || "Could not generate the next round"),
  });
}
