import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CounterShiftStatus {
  club_id: string; opening: string;
  attendance: { id: string; paid_start: string } | null;
  shift: { id: string; kind: "normal" | "special"; split_tips: boolean } | null;
}

export function ShiftStartDialog({ token, status, onStarted, onExit }: { token: string; status: CounterShiftStatus; onStarted: () => void; onExit: () => void }) {
  const [kind, setKind] = useState<"normal" | "special">(status.shift?.kind ?? "normal");
  const [start, setStart] = useState("");
  const [split, setSplit] = useState(status.shift?.split_tips ?? false);
  const [busy, setBusy] = useState(false);
  async function begin() {
    setBusy(true);
    try {
      const day = new Date(Date.now() + 7_200_000).toISOString().slice(0, 10);
      const { error } = await supabase.rpc("bar_counter_start_shift" as any, { _token: token, _kind: kind, _start: kind === "special" ? new Date(`${day}T${start}:00+02:00`).toISOString() : null, _split: kind === "special" && split });
      if (error) throw error;
      onStarted();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not start the shift"); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onExit(); }}><DialogContent className="max-w-sm" onInteractOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
    <DialogHeader><DialogTitle>Start shift</DialogTitle><DialogDescription>{status.shift ? "Join the current staff shift." : "Paid working time · Johannesburg"}</DialogDescription></DialogHeader>
    <div className="flex gap-2"><Button className="flex-1" variant={kind === "normal" ? "default" : "outline"} disabled={busy || Boolean(status.shift)} onClick={() => setKind("normal")}>Normal shift</Button><Button className="flex-1" variant={kind === "special" ? "default" : "outline"} disabled={busy || Boolean(status.shift)} onClick={() => setKind("special")}>Special shift</Button></div>
    {kind === "normal" ? <p className="text-xs text-muted-foreground">Paid time from {status.opening.slice(0, 5)}, or your entry time if later.</p> : <><Label htmlFor="special-shift-start">Paid start time</Label><Input id="special-shift-start" type="time" value={start} disabled={busy} onChange={e => setStart(e.target.value)} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={split} disabled={busy || Boolean(status.shift)} onCheckedChange={v => setSplit(v === true)} />Split tips by hours worked</label></>}
    <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onExit}>Exit counter mode</Button><Button disabled={busy || (kind === "special" && !start)} onClick={begin}>Start working</Button></div>
  </DialogContent></Dialog>;
}