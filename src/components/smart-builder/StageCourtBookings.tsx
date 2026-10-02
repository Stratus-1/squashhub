import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { bookableSlots, bookPlanSlots, findConflicts, loadPlanBookings, releasePlanBookings, type BookableStage, type SlotConflict } from "@/lib/smart-builder/stage-bookings";

/** Explicit "Book courts now" for scheduled stages; otherwise the schedule stays a plan. */
export function StageCourtBookings({ clubId, planId, label, stages, courtName }: { clubId: string; planId: string; label: string; stages: BookableStage[]; courtName: (id: number) => string }) {
  const slots = bookableSlots(planId, stages);
  const sig = slots.map((s) => `${s.externalId}|${s.date}|${s.start}|${s.end}`).join(",");
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<SlotConflict[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const rows = await loadPlanBookings(clubId, planId);
      // Booked only when the reservation still matches the planned date/time.
      setBooked(new Set(rows.filter((r: any) => slots.some((s) => s.externalId === r.external_id && s.date === r.date && s.start === r.start_time && s.end === r.end_time)).map((r: any) => r.external_id)));
      setConflicts(await findConflicts(clubId, slots));
    } catch { /* read failure: keep showing as planned */ }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, [clubId, planId, sig]);

  if (slots.length === 0) return <p className="text-xs text-muted-foreground">Court bookings: add a scheduled stage with a date, time window and courts to be able to book courts now. Until then nothing is reserved.</p>;

  const pending = slots.filter((s) => !booked.has(s.externalId));
  const book = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await bookPlanSlots(clubId, planId, label, slots);
      setNote(`Booked ${r.booked} court slot${r.booked === 1 ? "" : "s"}${r.removed ? `, removed ${r.removed} no longer in the schedule` : ""}${r.conflicts.length ? `. ${r.conflicts.length} not booked because of a clash.` : "."}`);
      await refresh();
    } catch (e) { setNote(`Could not book courts: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  const release = async () => {
    setBusy(true); setNote(null);
    try { await releasePlanBookings(clubId, planId); setNote("All court bookings from this plan were released. The schedule stays as a plan."); await refresh(); }
    catch (e) { setNote(`Could not release: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="stage-court-bookings">
      <div className="text-sm font-semibold">Court bookings</div>
      <p className="text-xs text-muted-foreground">Scheduled stages are only a plan until you book them. Booking reserves these courts in Court Bookings so you don't have to enter them again. Courts that are already taken are never double-booked — they're listed below.</p>
      <ul className="space-y-1 text-xs">
        {slots.map((s) => {
          const c = conflicts.find((x) => x.externalId === s.externalId);
          const isBooked = booked.has(s.externalId);
          return <li key={s.externalId} className="flex flex-wrap items-center gap-2">
            <span className={isBooked ? "rounded bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground" : c ? "rounded bg-destructive/15 px-1.5 py-0.5 text-destructive" : "rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground"}>{isBooked ? "Booked" : c ? "Clash" : "Planned"}</span>
            <span>{s.stageName} · {s.date} {s.start.slice(0, 5)}–{s.end.slice(0, 5)} · {courtName(s.courtId)}</span>
            {c && !isBooked && <span className="text-destructive">— {c.reason}</span>}
          </li>;
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || pending.length === 0} onClick={book}>{booked.size ? "Update court bookings" : "Book courts now"}</Button>
        {booked.size > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={release}>Release bookings</Button>}
      </div>
      {note && <p className="text-xs">{note}</p>}
    </div>
  );
}
