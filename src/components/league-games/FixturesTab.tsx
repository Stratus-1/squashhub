import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Wand2, CalendarPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { RoundConfigDialog, type RoundDraft } from "./fixtures/RoundConfigDialog";
import { FixtureEditorTable, type EditableFixture } from "./fixtures/FixtureEditorTable";
import { allPairsOnce, allocateSlots } from "./fixtures/scheduler";
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
        notes: r.notes ?? null,
        created_by: activeMember?.id ?? null,
      };
      if (r.id) {
        const { error } = await fromExt("league_rounds").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("league_rounds").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", associationId] });
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
          <Button
            size="sm"
            onClick={() => {
              setEditingRound({ round_number: nextRoundNumber, name: `Round ${nextRoundNumber}` });
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add round
          </Button>
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
          onDelete={() => {
            if (confirm(`Delete ${r.name}?`)) deleteRound.mutate(r.id);
          }}
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
  const [autoCreateBookings, setAutoCreateBookings] = useState(false);

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
        .select("id, home_team_code, away_team_code, court_id, start_time")
        .eq("round_id", round.id)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EditableFixture[];
    },
    enabled: open,
  });

  const [selectedTeams, setSelectedTeams] = useState<string[]>(teams.map((t) => t.code));
  const [draft, setDraft] = useState<EditableFixture[] | null>(null);
  const list = draft ?? fixtures ?? [];

  const autoDistribute = () => {
    const pairs = allPairsOnce(selectedTeams);
    const slots = allocateSlots(pairs, round.court_ids, round.start_time, round.end_time, round.slot_minutes);
    setDraft(
      slots.map((s) => ({
        home_team_code: s.home,
        away_team_code: s.away,
        court_id: s.courtId,
        start_time: s.startTime,
      })),
    );
    toast.success(`Generated ${slots.length} fixtures`);
  };

  const saveFixtures = useMutation({
    mutationFn: async () => {
      // Replace strategy: delete existing, insert new (carry-through edits & auto-gen alike)
      const { error: delErr } = await fromExt("platform_league_fixtures").delete().eq("round_id", round.id);
      if (delErr) throw delErr;

      if (!list.length) return;

      const rows = list.map((f) => ({
        association_id: round.association_id,
        round_id: round.id,
        fixture_date: round.round_date,
        venue_name: round.venue_name || "Home",
        home_team_code: f.home_team_code,
        away_team_code: f.away_team_code,
        division: f.home_team_code,
        status: "scheduled",
        court_id: f.court_id,
        start_time: f.start_time,
      }));
      const { data: inserted, error } = await fromExt("platform_league_fixtures").insert(rows).select("id, court_id, start_time");
      if (error) throw error;

      if (autoCreateBookings && inserted) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        for (let i = 0; i < inserted.length; i++) {
          const f = inserted[i];
          if (!f.court_id || !f.start_time) continue;
          // compute end time
          const [h, m] = String(f.start_time).split(":").map(Number);
          const startMin = h * 60 + m;
          const endMin = startMin + round.slot_minutes;
          const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
          const { data: booking, error: bErr } = await supabase
            .from("bookings")
            .insert({
              court_id: f.court_id,
              user_id: user.id,
              date: round.round_date,
              start_time: String(f.start_time).slice(0, 5),
              end_time: endTime,
              status: "active",
              is_friendly: false,
              club_id: clubId,
              guest_name: `League: ${list[i].home_team_code} vs ${list[i].away_team_code}`,
            })
            .select("id")
            .single();
          if (!bErr && booking) {
            await fromExt("platform_league_fixtures").update({ booking_id: booking.id }).eq("id", f.id);
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
          <Badge variant="outline" className="text-[10px]">{round.status}</Badge>
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
              <div className="text-xs font-medium">Teams in this round</div>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <label key={t.code} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={selectedTeams.includes(t.code)}
                      onCheckedChange={(v) =>
                        setSelectedTeams((prev) =>
                          v ? [...new Set([...prev, t.code])] : prev.filter((x) => x !== t.code),
                        )
                      }
                    />
                    {t.name}
                  </label>
                ))}
                {!teams.length && <span className="text-xs text-muted-foreground">No teams in this association</span>}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={autoCreateBookings} onCheckedChange={(v) => setAutoCreateBookings(!!v)} />
                  <CalendarPlus className="h-3.5 w-3.5" /> Auto-create court bookings on save
                </label>
                <Button size="sm" variant="secondary" onClick={autoDistribute} disabled={selectedTeams.length < 2}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-distribute
                </Button>
              </div>
            </div>
          )}

          {isAdmin ? (
            <>
              <FixtureEditorTable
                fixtures={list}
                teams={teams}
                courts={courts ?? []}
                onChange={setDraft}
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
            <ReadOnlyFixtures fixtures={fixtures ?? []} courts={courts ?? []} teams={teams} />
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
}: {
  fixtures: EditableFixture[];
  courts: { id: number; name: string }[];
  teams: { code: string; name: string }[];
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
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-2">Time</th>
            <th className="p-2">Court</th>
            <th className="p-2">Home</th>
            <th className="p-2">Away</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f, i) => (
            <tr key={i} className="border-t">
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
