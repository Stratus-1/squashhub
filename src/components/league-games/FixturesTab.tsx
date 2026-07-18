import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Wand2, CalendarPlus, Download, Share2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { RoundConfigDialog, type RoundDraft } from "./fixtures/RoundConfigDialog";
import { FixtureEditorTable, type EditableFixture } from "./fixtures/FixtureEditorTable";
import { ConfirmDeleteDialog } from "./fixtures/ConfirmDeleteDialog";
import { DuplicateRoundsDialog } from "./fixtures/DuplicateRoundsDialog";
import {
  allocateRoundRobinByDate,
  allocatePairingsWithCourtFairness,
  buildPriorCourtUsage,
  reversePairingsFromPrior,
  inferTiersFromPriorFixtures,
  fairCourtAssignmentForExistingFixtures,
  roundRobin,
  type PriorFixture,
} from "./fixtures/scheduler";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsClubAdmin } from "@/hooks/use-club";

type Props = {
  clubId: string;
  associationId: string;
};

type Round = RoundDraft & {
  id: string;
  status: string;
  club_id: string;
  association_id: string;
};

export function FixturesTab({ clubId, associationId }: Props) {
  const qc = useQueryClient();
  const { activeMember, isAdmin: isClubAdmin } = useMemberContext();
  const isAdmin = useIsClubAdmin() || isClubAdmin;
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<Partial<RoundDraft> | undefined>();
  const [pendingDeleteRound, setPendingDeleteRound] = useState<Round | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const { data: rounds } = useQuery({
    queryKey: ["league-rounds", associationId],
    queryFn: async () => {
      const { data, error } = await fromExt("league_rounds")
        .select("*")
        .eq("association_id", associationId)
        .order("round_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Round[];
    },
    enabled: !!associationId,
  });

  const { data: leagues } = useQuery({
    queryKey: ["assoc-leagues-for-fixtures", associationId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select("id, code, name")
        .eq("club_id", clubId)
        .eq("association_id", associationId);
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
    enabled: !!associationId && !!clubId,
  });

  const teams = useMemo(
    () => (leagues ?? []).filter((l) => l.code).map((l) => ({ code: l.code, name: l.name })),
    [leagues],
  );

  const saveRound = useMutation({
    mutationFn: async (r: RoundDraft) => {
      const payload = {
        club_id: clubId,
        association_id: associationId,
        round_number: r.round_number,
        name: r.name,
        round_date: r.round_date,
        end_date: r.end_date,
        venue_name: r.venue_name,
        court_ids: r.court_ids,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_minutes: r.slot_minutes,
        play_dows: r.play_dows ?? [],
        notes: r.notes ?? null,
        auto_create_bookings: r.auto_create_bookings ?? false,
        created_by: activeMember?.id ?? null,
      };
      if (r.id) {
        // Capture previous defaults to detect a time shift we should cascade.
        const prev = (rounds ?? []).find((x) => x.id === r.id);
        const prevStart = prev?.start_time ? String(prev.start_time).slice(0, 5) : null;
        const prevEnd = prev?.end_time ? String(prev.end_time).slice(0, 5) : null;
        const newStart = r.start_time ? String(r.start_time).slice(0, 5) : null;
        const newEndDefault = r.end_time ? String(r.end_time).slice(0, 5) : null;

        const { error } = await fromExt("league_rounds").update(payload).eq("id", r.id);
        if (error) throw error;

        // Cascade round time edits onto all fixtures and linked court bookings.
        // Also cancel stale duplicate bookings left by previous fixture re-saves,
        // so the court grid cannot keep showing the old time.
        if (newStart && (prevStart !== newStart || prevEnd !== newEndDefault || Number(prev?.slot_minutes) !== Number(r.slot_minutes))) {
          const { data: fixtures } = await fromExt("platform_league_fixtures")
            .select("id, start_time, booking_id, fixture_date, court_id, away_team_code")
            .eq("round_id", r.id);
          const playableFixtures = ((fixtures ?? []) as Array<{ id: string; start_time: string | null; booking_id: string | null; fixture_date: string | null; court_id: number | null; away_team_code: string }>).filter(
            (f) => f.away_team_code !== "__BYE__" && f.court_id && f.fixture_date,
          );
          const bookingIds = playableFixtures.map((f) => f.booking_id).filter(Boolean) as string[];
          const [h, m] = newStart.split(":").map(Number);
          const endMin = h * 60 + m + Number(r.slot_minutes || prev?.slot_minutes || 120);
          const computedEnd = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
          const newEnd = `${newEndDefault ?? computedEnd}:00`;

          if (playableFixtures.length > 0) {
            const { error: fxErr } = await fromExt("platform_league_fixtures")
              .update({ start_time: newStart, end_time: newEndDefault ?? computedEnd })
              .in("id", playableFixtures.map((f) => f.id));
            if (fxErr) throw fxErr;
          }

          if (bookingIds.length > 0) {
            const { error: bErr } = await supabase
              .from("bookings")
              .update({ start_time: `${newStart}:00`, end_time: newEnd })
              .in("id", bookingIds);
            if (bErr) throw bErr;

            for (const f of playableFixtures) {
              const stale = await supabase
                .from("bookings")
                .update({ status: "cancelled" })
                .eq("club_id", clubId)
                .eq("date", f.fixture_date!)
                .eq("court_id", f.court_id!)
                .eq("status", "active")
                .like("guest_name", `${r.name} - %`)
                .neq("id", f.booking_id || "00000000-0000-0000-0000-000000000000");
              if (stale.error) throw stale.error;
            }
          }
        }
      } else {
        const { error } = await fromExt("league_rounds").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
      qc.invalidateQueries({ queryKey: ["round-fixtures"] });
      toast.success("Round saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });


  const deleteRound = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("league_rounds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
      toast.success("Round deleted");
    },
  });

  const nextRoundNumber = (rounds?.length ?? 0) + 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rounds & fixtures</h3>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {(rounds?.length ?? 0) > 0 && (
              <Button size="sm" variant="outline" onClick={() => setDuplicateOpen(true)}>
                Duplicate rounds
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                {
                  const ord = (n: number) => {
                    const s = ["th", "st", "nd", "rd"], v = n % 100;
                    return n + (s[(v - 20) % 10] || s[v] || s[0]);
                  };
                  setEditingRound({ round_number: nextRoundNumber, name: `${ord(nextRoundNumber)} League Round ${nextRoundNumber}` });
                }
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add round
            </Button>
          </div>
        )}
      </div>

      {!rounds?.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAdmin ? <>No rounds scheduled yet. Click <strong>Add round</strong> to get started.</> : <>No rounds scheduled yet.</>}
        </Card>
      )}

      {rounds?.map((r) => (
        <RoundCard
          key={r.id}
          round={r}
          teams={teams}
          clubId={clubId}
          isAdmin={isAdmin}
          open={openRoundId === r.id}
          onToggle={() => setOpenRoundId(openRoundId === r.id ? null : r.id)}
          onEdit={() => {
            setEditingRound(r);
            setDialogOpen(true);
          }}
          onDelete={() => setPendingDeleteRound(r)}
        />
      ))}

      <RoundConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clubId={clubId}
        associationId={associationId}
        initial={editingRound}
        onSave={async (r) => {
          await saveRound.mutateAsync(r);
        }}
      />

      <ConfirmDeleteDialog
        open={!!pendingDeleteRound}
        onOpenChange={(o) => { if (!o) setPendingDeleteRound(null); }}
        title={`Delete ${pendingDeleteRound?.name ?? "round"}?`}
        description={
          <span>
            This permanently deletes <strong>{pendingDeleteRound?.name}</strong> and all its
            fixtures. This action cannot be undone.
          </span>
        }
        confirmLabel="Delete round"
        onConfirm={async () => {
          if (pendingDeleteRound) await deleteRound.mutateAsync(pendingDeleteRound.id);
          setPendingDeleteRound(null);
        }}
      />
    </div>
  );
}

function RoundCard({
  round,
  teams,
  clubId,
  isAdmin,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  round: Round;
  teams: { code: string; name: string }[];
  clubId: string;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [autoCreateBookings, setAutoCreateBookings] = useState<boolean>(!!(round as any).auto_create_bookings);
  

  const { data: courts } = useQuery({
    queryKey: ["round-courts", clubId, round.court_ids],
    queryFn: async () => {
      if (!round.court_ids?.length) return [];
      const { data, error } = await supabase
        .from("courts")
        .select("id, name")
        .in("id", round.court_ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: fixtures, refetch } = useQuery({
    queryKey: ["round-fixtures", round.id],
    queryFn: async () => {
      const { data, error } = await fromExt("platform_league_fixtures")
        .select("id, home_team_code, away_team_code, court_id, start_time, end_time, fixture_date")
        .eq("round_id", round.id)
        .order("fixture_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EditableFixture[];
    },
    enabled: open,
  });

  // Lightweight count so the collapsed row can hint "click to create fixtures"
  // vs. showing "X fixtures" when they already exist.
  const { data: fixtureCount } = useQuery({
    queryKey: ["round-fixture-count", round.id],
    queryFn: async () => {
      const { count, error } = await fromExt("platform_league_fixtures")
        .select("id", { count: "exact", head: true })
        .eq("round_id", round.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const [selectedTeams, setSelectedTeams] = useState<string[]>(teams.map((t) => t.code));
  const [draft, setDraft] = useState<EditableFixture[] | null>(null);
  const [tier, setTier] = useState<string>("__all__");
  const [reverseFromPrev, setReverseFromPrev] = useState<boolean>(false);
  const [showTeamGrid, setShowTeamGrid] = useState<boolean>(false);

  // Prior rounds in the same association (read-only — never mutated).
  const { data: priorFixtures } = useQuery({
    queryKey: ["prior-round-fixtures", round.association_id, round.round_number],
    queryFn: async () => {
      const { data: roundRows, error: rErr } = await fromExt("league_rounds")
        .select("id, round_number, name")
        .eq("association_id", round.association_id)
        .lt("round_number", round.round_number);
      if (rErr) throw rErr;
      const priorRoundIds = (roundRows ?? []).map((r: any) => r.id);
      if (!priorRoundIds.length) return [] as PriorFixture[];
      const meta = new Map<string, { round_number: number; name: string }>(
        (roundRows ?? []).map((r: any) => [r.id as string, { round_number: r.round_number, name: r.name }]),
      );
      const { data: fxs, error: fErr } = await fromExt("platform_league_fixtures")
        .select("home_team_code, away_team_code, court_id, fixture_date, start_time, round_id")
        .in("round_id", priorRoundIds);
      if (fErr) throw fErr;
      return ((fxs ?? []) as any[]).map((f) => ({
        ...f,
        round_number: meta.get(f.round_id)?.round_number ?? null,
        round_name: meta.get(f.round_id)?.name ?? null,
      })) as PriorFixture[];
    },
    enabled: open && !!round.association_id,
  });

  const tierGroups = useMemo(
    () => inferTiersFromPriorFixtures(priorFixtures ?? []),
    [priorFixtures],
  );

  // Keep the team checkboxes aligned with saved fixtures when viewing a round.
  useEffect(() => {
    if (!open || !teams.length || draft || fixtures === undefined) return;
    const savedCodes = new Set<string>();
    for (const fixture of fixtures) {
      if (fixture.home_team_code && fixture.home_team_code !== "__BYE__") savedCodes.add(fixture.home_team_code);
      if (fixture.away_team_code && fixture.away_team_code !== "__BYE__") savedCodes.add(fixture.away_team_code);
    }
    setSelectedTeams(savedCodes.size ? teams.filter((t) => savedCodes.has(t.code)).map((t) => t.code) : teams.map((t) => t.code));
  }, [open, fixtures, teams, draft]);

  // Selecting a tier auto-checks exactly that tier's teams.
  useEffect(() => {
    if (tier === "__all__" || tier === "__custom__") return;
    const codes = tierGroups.get(tier) ?? [];
    const valid = codes.filter((c) => teams.some((t) => t.code === c));
    if (valid.length) setSelectedTeams(valid);
  }, [tier, tierGroups, teams]);

  const list = draft ?? fixtures ?? [];

  const autoDistribute = () => {
    if (selectedTeams.length < 2) {
      toast.error("Select at least 2 teams to distribute.");
      return;
    }
    if (!round.court_ids?.length) {
      toast.error("No courts assigned to this round. Edit the round and pick at least one court.");
      return;
    }
    if (!round.start_time || !round.end_time || !round.slot_minutes) {
      toast.error("Round is missing start/end time or slot length.");
      return;
    }
    const teamSet = new Set(selectedTeams);
    const prior = priorFixtures ?? [];
    const priorUsage = buildPriorCourtUsage(prior, teamSet);

    let allocation;
    if (reverseFromPrev) {
      const reversed = reversePairingsFromPrior(prior, teamSet);
      if (!reversed) {
        toast.error("No matching previous round found for these teams. Falling back to round-robin.");
      }
      if (reversed) {
        // Treat as one batch (same matchday). Spread across dates if multiple.
        allocation = allocatePairingsWithCourtFairness(
          [reversed],
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          priorUsage,
        );
      }
    }
    if (!allocation) {
      // Use fairness allocator over full round-robin batches when prior usage exists,
      // otherwise fall back to the simple modulo allocator.
      if (priorUsage.size > 0) {
        const batches = roundRobin(selectedTeams);
        allocation = allocatePairingsWithCourtFairness(
          batches,
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          priorUsage,
        );
      } else {
        allocation = allocateRoundRobinByDate(
          selectedTeams,
          round.court_ids,
          round.start_time,
          round.end_time,
          round.slot_minutes,
          round.round_date,
          round.end_date,
          (round as any).play_dows ?? [],
          false,
        );
      }
    }
    const { slots, byes, error } = allocation;
    console.log("[autoDistribute]", { selectedTeams, court_ids: round.court_ids, start: round.start_time, end: round.end_time, slot: round.slot_minutes, range: [round.round_date, round.end_date], play_dows: (round as any).play_dows, slots, byes });
    if (error) {
      toast.error(error);
      return;
    }
    if (!slots.length) {
      toast.error("Couldn't generate fixtures — check the time window and slot length.");
      return;
    }
    const addMinutes = (hhmm: string, mins: number) => {
      const [h, m] = hhmm.split(":").map(Number);
      const total = h * 60 + m + mins;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const generated: EditableFixture[] = slots.map((s) => ({
      home_team_code: s.home,
      away_team_code: s.away,
      court_id: s.courtId,
      start_time: s.startTime,
      end_time: addMinutes(s.startTime, round.slot_minutes),
      fixture_date: s.date,
    }));

    const byeRows: EditableFixture[] = byes.map((bye) => ({
      home_team_code: bye.team,
      away_team_code: "__BYE__",
      court_id: null,
      start_time: null,
      end_time: null,
      fixture_date: bye.date,
    }));

    setDraft([...generated, ...byeRows]);
    const dayCount = new Set(slots.map((s) => s.date)).size;
    toast.success(
      `Generated ${generated.length} fixtures across ${dayCount} day(s)` +
        (byeRows.length ? ` · ${byeRows.length} bye(s)` : ""),
    );
  };

  /**
   * Re-balance courts on the current fixtures using a fairness scorer that
   * considers prior-round usage. Only court_id changes; pairings/dates/times
   * are preserved. Prior rounds are read only.
   */
  const rotateCourtsOnly = () => {
    const courtIds = round.court_ids ?? [];
    if (courtIds.length < 2) {
      toast.error("Need at least 2 courts assigned to this round to rotate.");
      return;
    }
    if (!list.length) {
      toast.error("No fixtures to rotate yet — generate or save fixtures first.");
      return;
    }
    const teamSet = new Set<string>();
    list.forEach((f) => { if (f.home_team_code) teamSet.add(f.home_team_code); if (f.away_team_code && f.away_team_code !== "__BYE__") teamSet.add(f.away_team_code); });
    const priorUsage = buildPriorCourtUsage(priorFixtures ?? [], teamSet);
    const assignments = fairCourtAssignmentForExistingFixtures(
      list.map((f, i) => ({ ...f, id: f.id ?? `idx:${i}` })) as any,
      courtIds,
      priorUsage,
    );
    const byKey = new Map(assignments.map((a) => [a.id, a.court_id] as const));
    const next = list.map((f, i) => {
      if (!f.fixture_date || !f.start_time || f.away_team_code === "__BYE__") return f;
      const k = f.id ?? `idx:${i}`;
      const c = byKey.get(k);
      return c ? { ...f, court_id: c } : f;
    });
    setDraft(next);
    const dateCount = new Set(list.map((f) => f.fixture_date).filter(Boolean)).size;
    toast.success(`Re-balanced courts across ${dateCount} date(s) using prior-round usage — pairings unchanged.`);
  };

  const saveFixtures = useMutation({
    mutationFn: async () => {
      // ─────────────────────────────────────────────────────────────
      // Non-destructive save (protects captain-submitted scorecards):
      //  • Existing fixtures are UPDATED in place — fixture_id stays
      //    stable so league_fixture_results / lineups stay linked.
      //  • Draft rows without an id are matched to an existing fixture
      //    by (home_team_code, away_team_code) and updated; otherwise
      //    inserted as new.
      //  • Existing fixtures missing from the draft are deleted only
      //    if they have NO saved results, lineups or match rubbers.
      //    If any do, the save aborts with a clear error.
      // ─────────────────────────────────────────────────────────────

      const { data: existingFixtures, error: existingErr } = await fromExt("platform_league_fixtures")
        .select("id, home_team_code, away_team_code, booking_id, fixture_date, court_id, start_time, end_time")
        .eq("round_id", round.id);
      if (existingErr) throw existingErr;
      type ExRow = { id: string; home_team_code: string; away_team_code: string; booking_id: string | null; fixture_date: string | null; court_id: number | null; start_time: string | null; end_time: string | null };
      const existing = (existingFixtures ?? []) as ExRow[];

      // Match draft rows to existing fixtures.
      const usedExistingIds = new Set<string>();
      const matchedPairs: { draft: EditableFixture; existingRow: ExRow }[] = [];
      const toInsert: EditableFixture[] = [];

      for (const d of list) {
        if (d.id) {
          const row = existing.find((e) => e.id === d.id && !usedExistingIds.has(e.id));
          if (row) { matchedPairs.push({ draft: d, existingRow: row }); usedExistingIds.add(row.id); continue; }
        }
        const pairMatch = existing.find(
          (e) => !usedExistingIds.has(e.id)
            && e.home_team_code === d.home_team_code
            && e.away_team_code === d.away_team_code,
        );
        if (pairMatch) { matchedPairs.push({ draft: d, existingRow: pairMatch }); usedExistingIds.add(pairMatch.id); }
        else { toInsert.push(d); }
      }

      const toDelete = existing.filter((e) => !usedExistingIds.has(e.id));

      // GUARD: refuse to drop fixtures that have any saved results / lineups / rubbers.
      if (toDelete.length) {
        const ids = toDelete.map((e) => e.id);
        const [{ data: resRows }, { data: lineupRows }, { data: matchRows }] = await Promise.all([
          fromExt("league_fixture_results").select("fixture_id").in("fixture_id", ids),
          fromExt("league_fixture_lineups").select("fixture_id").in("fixture_id", ids),
          fromExt("league_match_results").select("fixture_id").in("fixture_id", ids),
        ]);
        const protectedIds = new Set<string>([
          ...((resRows ?? []) as any[]).map((r) => r.fixture_id),
          ...((lineupRows ?? []) as any[]).map((r) => r.fixture_id),
          ...((matchRows ?? []) as any[]).map((r) => r.fixture_id),
        ]);
        const blocked = toDelete.filter((e) => protectedIds.has(e.id));
        if (blocked.length) {
          const labels = blocked.map((e) => `${e.home_team_code} vs ${e.away_team_code}`).join(", ");
          throw new Error(
            `${blocked.length} fixture(s) have saved scorecards or lineups and cannot be removed: ${labels}. ` +
            `Edit those fixtures in place instead, or clear their saved results first.`,
          );
        }
      }

      // Ensure platform association linkage (needed for inserts).
      const { data: platformAssocId, error: linkErr } = await supabase.rpc(
        "ensure_platform_association_for_league" as any,
        { _association_id: round.association_id },
      );
      if (linkErr) throw linkErr;
      if (!platformAssocId) throw new Error("Could not link league to platform association.");

      // 1) Delete safe (no-result) unmatched fixtures + cancel their bookings.
      const bookingIdsToCancel = toDelete.map((e) => e.booking_id).filter(Boolean) as string[];
      if (bookingIdsToCancel.length) {
        const { error: cancelErr } = await supabase
          .from("bookings").update({ status: "cancelled" }).in("id", bookingIdsToCancel);
        if (cancelErr) throw cancelErr;
      }
      if (toDelete.length) {
        const { error: delErr } = await fromExt("platform_league_fixtures")
          .delete().in("id", toDelete.map((e) => e.id));
        if (delErr) throw delErr;
      }

      // 2) In-place UPDATE for matched fixtures (id and saved results survive).
      type ActiveRow = { id: string; court_id: number | null; start_time: string | null; end_time: string | null; fixture_date: string | null; home_team_code: string; away_team_code: string; booking_id: string | null };
      const updatedRows: ActiveRow[] = [];
      for (const { draft: d, existingRow } of matchedPairs) {
        const isBye = d.away_team_code === "__BYE__";
        const patch = {
          fixture_date: d.fixture_date || round.round_date,
          home_team_code: d.home_team_code,
          away_team_code: d.away_team_code,
          division: d.home_team_code,
          status: isBye ? "bye" : "scheduled",
          court_id: isBye ? null : d.court_id,
          start_time: isBye ? null : d.start_time,
          end_time: isBye ? null : (d.end_time ?? null),
        };
        const { error: upErr } = await fromExt("platform_league_fixtures").update(patch).eq("id", existingRow.id);
        if (upErr) throw upErr;
        updatedRows.push({ ...existingRow, ...patch });
      }

      // 3) INSERT brand-new fixtures.
      let insertedRows: ActiveRow[] = [];
      if (toInsert.length) {
        const rows = toInsert.map((f) => {
          const isBye = f.away_team_code === "__BYE__";
          return {
            association_id: platformAssocId,
            round_id: round.id,
            fixture_date: f.fixture_date || round.round_date,
            venue_name: round.venue_name || "Home",
            home_team_code: f.home_team_code,
            away_team_code: f.away_team_code,
            division: f.home_team_code,
            status: isBye ? "bye" : "scheduled",
            court_id: isBye ? null : f.court_id,
            start_time: isBye ? null : f.start_time,
            end_time: isBye ? null : (f.end_time ?? null),
          };
        });
        const { data: inserted, error } = await fromExt("platform_league_fixtures")
          .insert(rows)
          .select("id, court_id, start_time, end_time, fixture_date, home_team_code, away_team_code, booking_id");
        if (error) throw error;
        insertedRows = (inserted ?? []) as any;
      }

      // 4) Booking sync: update existing bookings in place, create new ones where needed.
      const allActive = [...updatedRows, ...insertedRows];
      if (autoCreateBookings && allActive.length) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          for (const f of allActive) {
            if (!f.court_id || !f.start_time) continue;
            let endTime: string;
            if (f.end_time) {
              endTime = String(f.end_time).slice(0, 5);
            } else {
              const [h, m] = String(f.start_time).split(":").map(Number);
              const startMin = h * 60 + m;
              const endMin = startMin + round.slot_minutes;
              endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
            }
            const homeName = teams.find((t) => t.code === f.home_team_code)?.name?.trim();
            const awayName = teams.find((t) => t.code === f.away_team_code)?.name?.trim();
            const matchup = homeName && awayName ? `${homeName} vs ${awayName}` : "";
            const guestName = matchup ? `${round.name} - ${matchup}` : round.name;
            const startStr = String(f.start_time).slice(0, 5);

            if (f.booking_id) {
              await supabase.from("bookings").update({
                court_id: f.court_id,
                date: f.fixture_date || round.round_date,
                start_time: `${startStr}:00`,
                end_time: `${endTime}:00`,
                guest_name: guestName,
                status: "active",
              }).eq("id", f.booking_id);
            } else {
              const { data: booking, error: bErr } = await supabase
                .from("bookings")
                .insert({
                  court_id: f.court_id, user_id: user.id,
                  date: f.fixture_date || round.round_date,
                  start_time: `${startStr}:00`, end_time: `${endTime}:00`,
                  status: "active", is_friendly: false,
                  club_id: clubId, guest_name: guestName,
                })
                .select("id").single();
              if (!bErr && booking) {
                await fromExt("platform_league_fixtures").update({ booking_id: booking.id }).eq("id", f.id);
              }
            }
          }
        }
      }
    },
    onSuccess: () => {
      setDraft(null);
      refetch();
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Fixtures saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const buildAndExportPdf = async (mode: "download" | "share") => {
    try {
      const [{ data: fxRows, error: fxErr }, { data: courtRows }] = await Promise.all([
        fromExt("platform_league_fixtures")
          .select("home_team_code, away_team_code, court_id, start_time, fixture_date")
          .eq("round_id", round.id)
          .order("fixture_date", { ascending: true })
          .order("start_time", { ascending: true }),
        round.court_ids?.length
          ? supabase.from("courts").select("id, name").in("id", round.court_ids)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      if (fxErr) throw fxErr;
      const fx = (fxRows ?? []) as Array<{ home_team_code: string; away_team_code: string; court_id: string | null; start_time: string | null; fixture_date: string | null }>;
      if (!fx.length) { toast.error("No fixtures to export."); return; }

      const courtName = (id: string | null) => (courtRows ?? []).find((c: any) => c.id === id)?.name ?? "—";
      const teamName = (code: string) => teams.find((t) => t.code === code)?.name ?? code;

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const dateLine =
        format(parseISO(round.round_date), "EEE d MMM yyyy") +
        (round.end_date && round.end_date !== round.round_date ? ` – ${format(parseISO(round.end_date), "EEE d MMM yyyy")}` : "");

      doc.setFontSize(16);
      doc.text(round.name, 40, 50);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${dateLine}  ·  ${round.start_time}–${round.end_time}${round.venue_name ? `  ·  ${round.venue_name}` : ""}`, 40, 68);
      doc.setTextColor(0);

      const rows = fx.map((f) => {
        const isBye = f.away_team_code === "__BYE__";
        return [
          f.fixture_date ? format(parseISO(f.fixture_date), "EEE d MMM") : "—",
          isBye ? "—" : (f.start_time ?? "").slice(0, 5),
          isBye ? "—" : courtName(f.court_id),
          teamName(f.home_team_code),
          isBye ? "BYE" : "vs",
          isBye ? "" : teamName(f.away_team_code),
        ];
      });

      autoTable(doc, {
        startY: 90,
        head: [["Date", "Time", "Court", "Home", "", "Away"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [30, 58, 95] },
      });

      const filename = `${round.name.replace(/[^a-z0-9]+/gi, "-")}-fixtures.pdf`;

      if (mode === "share" && (navigator as any).canShare) {
        const blob = doc.output("blob");
        const file = new File([blob], filename, { type: "application/pdf" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({ files: [file], title: round.name, text: `${round.name} fixtures` });
          return;
        }
      }
      doc.save(filename);
      if (mode === "share") toast.message("Sharing not supported here — downloaded instead.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export fixtures");
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <div className="font-medium text-sm">{round.name}</div>
            <div className="text-xs text-muted-foreground">
              {format(parseISO(round.round_date), "EEE d MMM")}{round.end_date && round.end_date !== round.round_date ? ` – ${format(parseISO(round.end_date), "EEE d MMM")}` : ""} · {round.start_time}–{round.end_time} · {round.court_ids.length} court{round.court_ids.length === 1 ? "" : "s"}
              {round.venue_name && ` · ${round.venue_name}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(fixtureCount ?? 0) > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {fixtureCount} fixture{fixtureCount === 1 ? "" : "s"} · click to {open ? "hide" : "view"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {isAdmin ? "Click to create fixtures" : "No fixtures yet"}
            </Badge>
          )}
          {(fixtureCount ?? 0) > 0 && (
            <>
              <Button
                size="icon"
                variant="ghost"
                title="Download as PDF"
                onClick={(e) => { e.stopPropagation(); void buildAndExportPdf("download"); }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Share"
                onClick={(e) => { e.stopPropagation(); void buildAndExportPdf("share"); }}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {isAdmin && (
            <>
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </button>

      {open && (
        <div className="p-3 border-t space-y-3">
          {isAdmin && (
            <div className="rounded border bg-muted/20 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-medium">Teams in this round</div>
                {tierGroups.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Tier</Label>
                    <Select value={tier} onValueChange={setTier}>
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="Pick a tier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All teams</SelectItem>
                        {Array.from(tierGroups.keys()).map((t) => (
                          <SelectItem key={t} value={t}>
                            {t} ({tierGroups.get(t)?.length ?? 0})
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {selectedTeams.length
                  ? selectedTeams
                      .map((c) => teams.find((t) => t.code === c)?.name ?? c)
                      .join(" · ")
                  : <span className="text-muted-foreground">No teams selected</span>}
              </div>
              <button
                type="button"
                className="text-[11px] underline text-muted-foreground"
                onClick={() => setShowTeamGrid((v) => !v)}
              >
                {showTeamGrid ? "Hide team list" : "Edit team list"}
              </button>
              {showTeamGrid && (
                <div className="flex flex-wrap gap-2 pt-1 border-t">
                  {teams.map((t) => (
                    <label key={t.code} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={selectedTeams.includes(t.code)}
                        onCheckedChange={(v) => {
                          setTier("__custom__");
                          setSelectedTeams((prev) =>
                            v ? [...new Set([...prev, t.code])] : prev.filter((x) => x !== t.code),
                          );
                        }}
                      />
                      {t.name}
                    </label>
                  ))}
                  {!teams.length && <span className="text-xs text-muted-foreground">No teams in this association</span>}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap border-t">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={autoCreateBookings} onCheckedChange={(v) => setAutoCreateBookings(!!v)} />
                    <CalendarPlus className="h-3.5 w-3.5" /> Auto-create court bookings on save
                  </label>
                  {(priorFixtures?.length ?? 0) > 0 && (
                    <label className="flex items-center gap-2 text-xs" title="Swap home/away from the most recent prior round covering these teams">
                      <Checkbox checked={reverseFromPrev} onCheckedChange={(v) => setReverseFromPrev(!!v)} />
                      Reverse home/away from previous round
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rotateCourtsOnly}
                    disabled={!list.length || (round.court_ids?.length ?? 0) < 2}
                    title="Shift courts across dates without changing pairings or times"
                  >
                    Re-balance courts
                  </Button>
                  <Button size="sm" variant="secondary" onClick={autoDistribute} disabled={selectedTeams.length < 2}>
                    <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-distribute
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isAdmin ? (
            <>
              <div className="flex justify-end gap-2">
                {draft && (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>
                )}
                <Button size="sm" onClick={() => saveFixtures.mutate()} disabled={saveFixtures.isPending}>
                  {saveFixtures.isPending ? "Saving…" : "Save fixtures"}
                </Button>
              </div>
              <FixtureEditorTable
                fixtures={list}
                teams={teams}
                courts={courts ?? []}
                onChange={setDraft}
                defaultDate={round.round_date}
                minDate={round.round_date}
                maxDate={round.end_date || round.round_date}
                defaultStart={round.start_time as any}
                defaultEnd={(round as any).end_time}
              />
              <div className="flex justify-end gap-2">
                {draft && (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>
                )}
                <Button size="sm" onClick={() => saveFixtures.mutate()} disabled={saveFixtures.isPending}>
                  {saveFixtures.isPending ? "Saving…" : "Save fixtures"}
                </Button>
              </div>
            </>
          ) : (
            <ReadOnlyFixtures fixtures={fixtures ?? []} courts={courts ?? []} teams={teams} fallbackDate={round.round_date} />
          )}
        </div>
      )}
    </Card>
  );
}

function ReadOnlyFixtures({
  fixtures,
  courts,
  teams,
  fallbackDate,
}: {
  fixtures: EditableFixture[];
  courts: { id: number; name: string }[];
  teams: { code: string; name: string }[];
  fallbackDate?: string;
}) {
  if (!fixtures.length) {
    return (
      <div className="rounded border p-4 text-center text-xs text-muted-foreground">
        No fixtures published yet.
      </div>
    );
  }
  const teamName = (code: string) => teams.find((t) => t.code === code)?.name ?? code;
  const courtName = (id: number | null) => (id ? courts.find((c) => c.id === id)?.name ?? `Court ${id}` : "—");
  const fmtDate = (d?: string | null) => {
    const v = d || fallbackDate;
    if (!v) return "—";
    try { return format(parseISO(v), "EEE d MMM"); } catch { return v; }
  };
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">Date</th>
            <th className="p-2">Time</th>
            <th className="p-2">Court</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{fmtDate(f.fixture_date)}</td>
              <td className="p-2">{f.start_time?.slice(0, 5) ?? "—"}</td>
              <td className="p-2">{courtName(f.court_id)}</td>
              <td className="p-2">{teamName(f.home_team_code)}</td>
              <td className="p-2">{teamName(f.away_team_code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
