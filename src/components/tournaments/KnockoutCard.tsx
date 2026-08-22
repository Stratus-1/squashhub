import { useMemo, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Swords } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import {
  buildLeagueFinals,
  buildNextRound,
  knockoutState,
  roundLabel,
  sectionLetter,
  winnerOf,
  type KnockoutMatchLike,
} from "@/lib/tournaments/knockout";

interface KnockoutCardProps {
  champId: string;
  /** All matches of the tournament (knockout rows are filtered out here). */
  matches: any[];
  canManage: boolean;
  /** Renders one match row using the page's shared renderer. */
  renderMatchRow: (m: any) => ReactNode;
  /** League label resolver (group_number → display name). */
  groupLabel: (gn: number) => string;
  /** Knockout + players arrange their own court/date/time. */
  selfScheduled?: boolean;
  /** Deadline for a given round number (self-scheduled knockouts). */
  playByForRound?: (round: number) => string | null;
}

/**
 * Knockout draw — phased.
 *
 * Only the first round of every section exists up front. When a round is
 * finished the admin generates the next one, so the draw always reflects who
 * actually got through. Once every section of a league is decided, the
 * section winners meet in a league final.
 */
export function KnockoutCard({
  champId,
  matches,
  canManage,
  renderMatchRow,
  groupLabel,
  selfScheduled = false,
  playByForRound,
}: KnockoutCardProps) {
  const qc = useQueryClient();
  const koMatches: KnockoutMatchLike[] = useMemo(
    () => (matches || []).filter((m: any) => (m.stage || "") === "ko"),
    [matches],
  );

  const states = useMemo(() => knockoutState(koMatches), [koMatches]);

  const leagues = useMemo(() => {
    const byLeague = new Map<number, typeof states>();
    for (const s of states) {
      if (!byLeague.has(s.groupNumber)) byLeague.set(s.groupNumber, [] as any);
      byLeague.get(s.groupNumber)!.push(s);
    }
    return Array.from(byLeague.entries()).sort((a, b) => a[0] - b[0]);
  }, [states]);

  const generate = useMutation({
    mutationFn: async (opts: { groupNumber: number; section?: number }) => {
      const { groupNumber, section } = opts;
      const mine = states.filter((s) => s.groupNumber === groupNumber);

      // Next round of one section.
      if (section !== undefined) {
        const st = mine.find((s) => s.section === section);
        if (!st || !st.canGenerateNext) throw new Error("This round is not finished yet");
        const multi = mine.filter((s) => s.section > 0).length > 1;
        const rows = buildNextRound({
          champId,
          groupNumber,
          section,
          roundMatches: st.latestRoundMatches,
          sectionLabel: multi ? `Section ${sectionLetter(section)}` : undefined,
          playBy: selfScheduled
            ? playByForRound?.((Number(st.latestRoundMatches[0]?.round_number) || 1) + 1) ?? null
            : null,
        });
        if (rows.length === 0) throw new Error("Nothing to generate");
        const { error } = await fromExt("club_champs_matches").insert(rows as any);
        if (error) throw error;
        return rows.length;
      }

      // League final between section winners.
      const sections = mine.filter((s) => s.section > 0);
      if (sections.length < 2) throw new Error("This league only has one section");
      if (!sections.every((s) => s.sectionComplete)) throw new Error("Every section must be decided first");
      if (mine.some((s) => s.section === 0)) throw new Error("The league final already exists");
      const deepest = Math.max(...sections.map((s) => s.latestRound));
      const rows = buildLeagueFinals({
        champId,
        groupNumber,
        round: deepest + 1,
        sectionWinners: sections.map((s) => {
          const m = s.latestRoundMatches[0];
          const w = s.sectionWinner!;
          const partner =
            m?.player_a_member_id === w ? m?.partner_a_member_id : m?.player_b_member_id === w ? m?.partner_b_member_id : null;
          return { section: s.section, memberId: w, partnerId: partner ?? null };
        }),
      });
      if (rows.length === 0) throw new Error("Nothing to generate");
      const { error } = await fromExt("club_champs_matches").insert(rows as any);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(
        selfScheduled
          ? `Created ${n} match${n === 1 ? "" : "es"}. Players arrange their own court and time.`
          : `Created ${n} match${n === 1 ? "" : "es"}. Assign courts and times from the fixture list.`,
      );
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
    },
    onError: (e: any) => toast.error(e.message || "Could not generate the next round"),
  });

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
          const allDecided = draws.length > 1 && draws.every((s) => s.sectionComplete);
          const champion = finals?.sectionComplete ? finals.sectionWinner : draws.length === 1 ? draws[0].sectionWinner : null;
          return (
            <div key={gn} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupLabel(gn)}</div>
                {champion && <Badge className="text-[10px]">Winner decided</Badge>}
              </div>

              {draws.map((s) => {
                const rows = koMatches
                  .filter((m) => m.group_number === gn && m.section_number === s.section)
                  .sort(
                    (a, b) =>
                      (a.round_number ?? 0) - (b.round_number ?? 0) ||
                      (a.bracket_position ?? 0) - (b.bracket_position ?? 0),
                  );
                return (
                  <div key={s.section} className="space-y-1.5">
                    {draws.length > 1 && (
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Section {sectionLetter(s.section)}
                        {s.sectionComplete ? " — decided" : s.roundComplete ? " — round complete" : ""}
                      </div>
                    )}
                    {rows.map((m: any) => renderMatchRow(m))}
                    {canManage && s.canGenerateNext && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generate.isPending}
                        onClick={() => generate.mutate({ groupNumber: gn, section: s.section })}
                      >
                        Generate {roundLabel(s.latestRoundMatches.length).toLowerCase()} winners →{" "}
                        {roundLabel(Math.max(2, s.latestRoundMatches.length))}
                      </Button>
                    )}
                    {!s.roundComplete && (
                      <p className="text-[11px] text-muted-foreground">
                        {s.latestRoundMatches.filter((m) => !winnerOf(m)).length} match(es) still to play in this round.
                      </p>
                    )}
                  </div>
                );
              })}

              {finals && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">League final</div>
                  {koMatches
                    .filter((m) => m.group_number === gn && m.section_number === 0)
                    .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0))
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
            Rounds are created one at a time — new matches start unscheduled, so give them a court and time in the fixture
            list once they appear.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
