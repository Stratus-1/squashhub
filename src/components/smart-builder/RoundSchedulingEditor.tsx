import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import {
  applyPlayBy, applyTimed, diffRound, loadRoundState, proposeTimed, roundsForStage, saveStageSettings,
  type Allocation, type LiveMatch, type LiveRound, type StageSchedule,
} from "@/lib/tournaments/round-scheduling";

type State = Awaited<ReturnType<typeof loadRoundState>>;
type Review =
  | { kind: "play_by"; stage: StageSchedule; rounds: LiveRound[]; diff: ReturnType<typeof diffRound> }
  | { kind: "ask_generate"; stage: StageSchedule; rounds: LiveRound[] }
  | { kind: "timed"; stage: StageSchedule; rounds: LiveRound[]; proposal: Allocation };

/**
 * Round SCHEDULE management (never pairings). "Save & Apply to Fixtures" saves settings and reconciles the round's
 * matches; "Refresh Fixtures & Log" reconciles settings saved earlier. Timed allocations are previewed and approved.
 */
export function RoundSchedulingEditor({ clubId, tournamentId }: { clubId: string; tournamentId: string }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<State | null>(null);
  const [courts, setCourts] = useState<Array<{ id: number; name: string }>>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState({ mode: "play_by" as "play_by" | "scheduled", deadline: "", date: "", from: "18:00", to: "21:00", courtIds: [] as number[] });
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => { const s = await loadRoundState(tournamentId); setSt(s); return s; };
  useEffect(() => {
    reload().catch(() => setSt(null));
    fromExt("courts").select("id, name").eq("club_id", clubId).order("name").then(({ data }) => setCourts((data ?? []) as any));
  }, [clubId, tournamentId]);

  const rows = useMemo(() => (st ? st.stages.map((s) => { const rounds = roundsForStage(s, st.rounds); return { s, rounds, diff: diffRound(s, rounds, st.matches) }; }).filter((r) => r.rounds.length) : []), [st]);
  if (!st || !rows.length) return null;

  const courtName = (id: number) => courts.find((c) => c.id === id)?.name ?? `Court ${id}`;
  const matchLabel = (id: string) => {
    const m = st.matches.find((x) => x.id === id) as LiveMatch | undefined;
    return m ? `${names[m.player_a_member_id ?? ""] ?? "Player"} vs ${names[m.player_b_member_id ?? ""] ?? "Player"}` : id.slice(0, 8);
  };
  const loadNames = async (ids: string[]) => {
    const ms = st.matches.filter((m) => ids.includes(m.id));
    const pids = [...new Set(ms.flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean))] as string[];
    if (!pids.length) return;
    const { data } = await fromExt("club_members").select("id, first_name, last_name").in("id", pids);
    setNames((n) => ({ ...n, ...Object.fromEntries(((data ?? []) as any[]).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()])) }));
  };
  const done = async () => { setReview(null); setEdit(null); await reload(); qc.invalidateQueries(); };

  const startEdit = (s: StageSchedule) => {
    const w = s.windows[0];
    setForm({ mode: s.mode, deadline: s.deadline ?? "", date: w?.date ?? "", from: w?.from ?? "18:00", to: w?.to ?? "21:00", courtIds: w?.courtIds ?? [] });
    setEdit(s.id);
  };

  /** Reconcile one stage with its (already saved) settings: preview first, nothing written yet. */
  const reconcile = async (s: StageSchedule, rounds: LiveRound[], fromSwitch = false) => {
    const fresh = await reload();
    const stage = fresh.stages.find((x) => x.id === s.id) ?? s;
    const live = roundsForStage(stage, fresh.rounds);
    const diff = diffRound(stage, live, fresh.matches);
    if (stage.mode === "play_by") {
      if (!stage.deadline) { toast.error("Set a play-by date for this round first"); return; }
      if (diff.inSync) { toast.success(`${stage.name} is already up to date`); return; }
      await loadNames([...diff.clearAllocations, ...diff.keepPlayerBookings]);
      setReview({ kind: "play_by", stage, rounds: live, diff });
    } else if (fromSwitch) {
      setReview({ kind: "ask_generate", stage, rounds: live });
    } else {
      if (diff.inSync) { toast.success(`${stage.name} is already up to date`); return; }
      const proposal = await proposeTimed(stage, live, fresh.matches, fresh.minutes);
      await loadNames(proposal.assign.map((a) => a.matchId).concat(proposal.unplaced.map((u) => u.matchId)));
      setReview({ kind: "timed", stage, rounds: live, proposal });
    }
  };

  const saveAndApply = async (s: StageSchedule, rounds: LiveRound[]) => {
    setBusy(true);
    try {
      if (form.mode === "play_by") {
        if (!form.deadline) throw new Error("Choose a play-by date");
        await saveStageSettings(tournamentId, s.id, { mode: "play_by", deadline: form.deadline });
      } else {
        if (!form.date || !form.courtIds.length) throw new Error("Choose a date and at least one court");
        await saveStageSettings(tournamentId, s.id, { mode: "scheduled", date: form.date, from: form.from, to: form.to, courtIds: form.courtIds.map(String) });
      }
      toast.success("Round settings saved");
      await reconcile(s, rounds, form.mode === "scheduled" && s.mode === "play_by");
    } catch (e: any) { toast.error(e?.message || "Could not save round settings"); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!review) return;
    setBusy(true);
    try {
      if (review.kind === "play_by") {
        const r = await applyPlayBy(review.rounds, review.stage.deadline!);
        toast.success(`${review.stage.name}: ${r.matches} fixture(s) updated, ${r.released} court/time allocation(s) released${r.kept_player_bookings ? `, ${r.kept_player_bookings} player booking(s) kept` : ""}${r.notified ? `, ${r.notified} schedule-change notice(s)` : ""}.`);
        await done();
      } else if (review.kind === "ask_generate") {
        const fresh = await reload();
        const proposal = await proposeTimed(review.stage, review.rounds, fresh.matches, fresh.minutes);
        await loadNames(proposal.assign.map((a) => a.matchId).concat(proposal.unplaced.map((u) => u.matchId)));
        setReview({ kind: "timed", stage: review.stage, rounds: review.rounds, proposal });
      } else {
        const r = await applyTimed(review.rounds, review.proposal, st.minutes);
        if (r.failed.length || review.proposal.unplaced.length) toast.warning(`${r.booked} placed. ${r.failed.length + review.proposal.unplaced.length} still need a slot${r.failed[0] ? `: ${r.failed[0].reason}` : ""}.`);
        else toast.success(`${r.booked} fixture(s) given a court and time.`);
        await done();
      }
    } catch (e: any) { toast.error(e?.message || "Could not apply"); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-md border border-border p-3 space-y-2">
      <h3 className="text-sm font-semibold">Round scheduling</h3>
      <p className="text-xs text-muted-foreground">Schedule only — pairings, results and locks are never changed here. Draws are generated separately. Tournament block bookings and personally named bookings are never cancelled.</p>
      {rows.map(({ s, rounds, diff }) => (
        <div key={s.id} className="rounded border border-border p-2 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{s.name}</strong> · {s.mode === "play_by" ? `Play by ${s.deadline ?? "—"}` : `Timed · ${s.windows.map((w) => `${w.date} ${w.from}–${w.to}`).join(", ") || "no window"}`}
              {" · "}<span className={diff.inSync ? "text-muted-foreground" : "text-destructive"}>{diff.inSync ? "Fixtures in sync" : "Fixtures need refresh"}</span>
            </span>
            {edit !== s.id && (
              <span className="flex gap-1">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => reconcile(s, rounds).catch((e) => toast.error(e?.message))}>Refresh Fixtures & Log</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(s)}>Edit</Button>
              </span>
            )}
          </div>
          {edit === s.id && (
            <div className="space-y-2">
              <div className="flex gap-2" role="radiogroup" aria-label="Scheduling">
                <Button size="sm" role="radio" aria-checked={form.mode === "play_by"} variant={form.mode === "play_by" ? "default" : "outline"} onClick={() => setForm({ ...form, mode: "play_by" })}>Play by date</Button>
                <Button size="sm" role="radio" aria-checked={form.mode === "scheduled"} variant={form.mode === "scheduled" ? "default" : "outline"} onClick={() => setForm({ ...form, mode: "scheduled" })}>Fixed court & time</Button>
              </div>
              {form.mode === "play_by" ? (
                <label className="block">Play by <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <label>Date <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                  <label>From <Input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
                  <label>To <Input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
                  <div className="col-span-3 flex flex-wrap gap-1">
                    {courts.map((c) => (
                      <Button key={c.id} size="sm" aria-pressed={form.courtIds.includes(c.id)} variant={form.courtIds.includes(c.id) ? "default" : "outline"}
                        onClick={() => setForm((f) => ({ ...f, courtIds: f.courtIds.includes(c.id) ? f.courtIds.filter((x) => x !== c.id) : [...f.courtIds, c.id] }))}>{c.name}</Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => saveAndApply(s, rounds)}>{busy ? "Saving…" : "Save & Apply to Fixtures"}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      ))}

      <Dialog open={!!review} onOpenChange={(o) => !o && !busy && setReview(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {review?.kind === "play_by" ? `Apply play-by date to ${review.stage.name}` : review?.kind === "ask_generate" ? "Generate court and time allocations for this round now?" : `Review allocations · ${review?.stage.name}`}
            </DialogTitle>
            <DialogDescription>No pairings, results or locks change. Nothing is saved until you approve.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto text-xs space-y-2">
            {review?.kind === "play_by" && (
              <>
                <p>Deadline {review.stage.deadline} for {review.diff.deadlineUpdates.length} open fixture(s).</p>
                {review.diff.clearAllocations.length > 0 && <div><p className="font-medium">Court/time removed ({review.diff.clearAllocations.length}):</p><ul className="list-disc pl-4">{review.diff.clearAllocations.map((id) => <li key={id}>{matchLabel(id)}</li>)}</ul></div>}
                {review.diff.keepPlayerBookings.length > 0 && <div><p className="font-medium">Players' own bookings kept ({review.diff.keepPlayerBookings.length}):</p><ul className="list-disc pl-4">{review.diff.keepPlayerBookings.map((id) => <li key={id}>{matchLabel(id)}</li>)}</ul></div>}
                <p className="text-muted-foreground">{review.diff.untouched} completed/live fixture(s) untouched. Tournament block bookings stay in place.</p>
              </>
            )}
            {review?.kind === "ask_generate" && <p>A proposal is built from the saved dates, times, courts and block availability. You will review it before anything is booked. Choose “Not now” to leave fixtures without slots and use Refresh later.</p>}
            {review?.kind === "timed" && (
              <>
                {review.proposal.assign.length === 0 && review.proposal.unplaced.length === 0 && <p>No confirmed fixtures need a slot.</p>}
                <ul className="space-y-1">
                  {review.proposal.assign.map((a) => (
                    <li key={a.matchId} className="flex justify-between gap-2"><span>{matchLabel(a.matchId)}</span><span>{a.date} {a.time} · {courtName(a.courtId)}{a.source === "unreserved" ? " · unreserved court" : " · block"}</span></li>
                  ))}
                </ul>
                {review.proposal.unplaced.length > 0 && <div className="text-destructive"><p className="font-medium">Cannot place ({review.proposal.unplaced.length}):</p><ul className="list-disc pl-4">{review.proposal.unplaced.map((u) => <li key={u.matchId}>{matchLabel(u.matchId)} — {u.reason}</li>)}</ul></div>}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setReview(null)}>{review?.kind === "ask_generate" ? "Not now" : "Cancel"}</Button>
            <Button disabled={busy || (review?.kind === "timed" && review.proposal.assign.length === 0)} onClick={approve}>
              {busy ? "Working…" : review?.kind === "ask_generate" ? "Build proposal" : "Approve & apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
