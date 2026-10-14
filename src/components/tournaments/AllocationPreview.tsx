import { useState } from "react";
import { GripVertical, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { blockAt, fixtureEligibility, individuallyBooked, minutesOf, previewSwap, timeOf, validateAllocation, type AllocationContext, type AllocationMatch, type AllocationSlot } from "@/lib/tournaments/allocation-preview";
import { FixtureCalendar, type CalEvent } from "./FixtureCalendar";

export function AllocationPreview({ context, events }: { context: AllocationContext; events?: CalEvent[] }) {
  const [selectedId, select] = useState<string | null>(null);
  const [review, setReview] = useState<Array<{ match: AllocationMatch; slot: AllocationSlot }> | null>(null);
  const selected = context.matches.find((m) => m.id === selectedId);
  const matches = context.matches.filter((m) => m.champ_id === context.tournamentId);
  const blocks = context.blocks;
  const choose = (m: AllocationMatch) => { if (!fixtureEligibility(context, m)) { select(m.id); setReview(null); } };
  const drop = (slot: AllocationSlot, target?: AllocationMatch) => {
    if (!selected) return;
    const reason = target ? previewSwap(context, selected, target) : validateAllocation(context, selected, slot);
    if (reason) return;
    setReview([{ match: selected, slot }, ...(target ? [{ match: target, slot: { date: selected.scheduled_date ?? "", time: selected.scheduled_time ?? "", courtId: selected.court_id ?? 0 } }] : [])]);
  };
  const label = (m: AllocationMatch) => m.title ?? `${m.category ?? "Fixture"} · ${m.scheduled_date} ${m.scheduled_time?.slice(0, 5)} C${m.court_id}`;
  return <section className="space-y-3 border-t border-border pt-3" data-testid="allocation-preview">
    {events && <FixtureCalendar events={events} preview={{ eligible: (id) => { const m = matches.find((x) => x.id === id); return !!m && !fixtureEligibility(context, m); }, start: (id) => { const m = matches.find((x) => x.id === id); if (m) choose(m); }, canDrop: (id) => { const m = matches.find((x) => x.id === id); return !!selected && !!m && !previewSwap(context, selected, m); }, drop: (id) => { const m = matches.find((x) => x.id === id); if (m) drop({ date: m.scheduled_date ?? "", time: m.scheduled_time ?? "", courtId: m.court_id ?? 0 }, m); } }} />}
    <h3 className="text-sm font-semibold">Move / Swap preview</h3>
    <p className="text-xs font-medium text-warning" role="status">Preview only — no changes saved</p>
    {!context.complete && <p className="text-xs text-destructive">Availability or ownership could not be read completely. Targets are unavailable.</p>}
    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>Verified block capacity</span><span>Individually booked</span><span>Unreserved / externally occupied</span><span>Ownership verification required</span></div>
    <div className="grid gap-2 sm:grid-cols-2">
      {matches.map((m) => {
        const reason = fixtureEligibility(context, m);
        const slot = { date: m.scheduled_date ?? "", time: m.scheduled_time ?? "", courtId: m.court_id ?? 0 };
        const targetReason = selected ? previewSwap(context, selected, m) : reason;
        return <div key={m.id} data-testid="allocation-fixture" onDragOver={(e) => { if (selected && !targetReason) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); drop(slot, m); }} className={`flex flex-wrap items-center gap-2 border p-2 text-xs ${selectedId === m.id ? "border-primary bg-primary/10" : selected && !targetReason ? "border-success bg-success/10" : "border-border"}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" draggable={!reason} disabled={!!reason} aria-label={`Drag ${label(m)}`} title={reason ?? "Drag fixture to preview"} onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; choose(m); }}><GripVertical className="h-4 w-4" /></Button>
          <span className="min-w-0 flex-1 break-words">{label(m)}<span className="block text-muted-foreground">{reason ?? "Verified tournament block"}</span></span>
          <Button variant="outline" size="sm" disabled={!!reason} onClick={() => choose(m)} aria-label={`Move match ${label(m)}`}><Move className="mr-1 h-3 w-3" />Move match</Button>
          {selected && selected.id !== m.id && <Button variant="outline" size="sm" disabled={!!targetReason} title={targetReason ?? "Preview swap"} onClick={() => drop(slot, m)}>Preview swap</Button>}
          {selected && selected.id !== m.id && targetReason && <span className="w-full text-muted-foreground">{targetReason}</span>}
        </div>;
      })}
    </div>
    {selected && <><div className="flex items-center gap-2 text-xs"><span>Selected: {label(selected)}</span><Button variant="outline" size="sm" onClick={() => { select(null); setReview(null); }}>Cancel preview</Button></div>
      <div className="grid gap-2 sm:grid-cols-3" aria-label="Available allocation targets">
        {blocks.flatMap((b) => {
          const duration = selected.duration ?? 0;
          if (!duration) return [];
          const start = minutesOf(b.start_time), end = minutesOf(b.end_time);
          const slots = Array.from({ length: Math.min(96, Math.max(0, Math.floor((end - start - duration) / 15) + 1)) }, (_, i) => ({ date: b.date, time: timeOf(start + i * 15), courtId: b.court_id }));
          return slots.map((slot) => {
            const reason = validateAllocation(context, selected, slot);
            return <div key={`${b.id}:${slot.time}`} onDragOver={(e) => { if (!reason) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); drop(slot); }} className={`border p-2 text-xs ${reason ? "border-border bg-muted/30" : "border-success bg-success/10"}`}>
              <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal p-1 text-left" disabled={!!reason} onClick={() => drop(slot)} aria-label={`Preview target ${slot.date} ${slot.time} Court ${slot.courtId}`}>{slot.date} {slot.time} · Court {slot.courtId}</Button>
              <p className="text-[11px] text-muted-foreground">{reason ?? "Available within verified block"}</p>
            </div>;
          });
        })}
      </div></>}
    {!blocks.length && <p className="text-xs text-muted-foreground">No verified tournament-owned block found. Legacy reservations need ownership verification; no target is automatically claimed.</p>}
    <details className="text-xs"><summary>Booking classification</summary><ul className="mt-2 space-y-1">{context.bookings.map((b) => <li key={b.id}>{b.date} {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} · Court {b.court_id} · {individuallyBooked(b) ? "Individually booked — member arrangement required" : blocks.some((x) => x.id === b.id) ? "Verified tournament block" : b.external_id?.startsWith("sbs:") || /championship/i.test(b.guest_name ?? b.external_booker_name ?? "") ? "Ownership verification required" : "Externally occupied / unverified"}</li>)}</ul></details>
    <Dialog open={!!review} onOpenChange={(open) => { if (!open) setReview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{review?.length === 2 ? "Proposed swap" : "Proposed move"}</DialogTitle><DialogDescription>Preview only — no changes saved. Block reservation remains unchanged.</DialogDescription></DialogHeader>
      {review?.map(({ match, slot }) => <dl key={match.id} className="space-y-1 border-b border-border pb-3 text-sm"><dt className="font-semibold">{label(match)}</dt><dd>From: {match.scheduled_date} {match.scheduled_time?.slice(0, 5)} · Court {match.court_id}</dd><dd>To: {slot.date} {slot.time.slice(0, 5)} · Court {slot.courtId}</dd><dd>{match.duration} minutes · {blockAt(context, slot, match.duration ?? 0)?.envelope}</dd></dl>)}
      <p className="text-xs text-muted-foreground">No fixtures, bookings, results or notifications will be changed.</p><Button variant="outline" onClick={() => { setReview(null); select(null); }}>Close preview</Button>
    </DialogContent></Dialog>
  </section>;
}