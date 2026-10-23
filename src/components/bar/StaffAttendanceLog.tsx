import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
interface Attendance { id: string; name: string; start: string; end: string | null; hours: number | null; kind: string; split_tips: boolean; reason: string | null }
const local = (s: string) => new Date(Date.parse(s) + 7_200_000).toISOString().slice(0, 16);
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });
export function StaffAttendanceLog({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [row, setRow] = useState<Attendance | null>(null);
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["bar-attendance-log", clubId], queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_staff_attendance_log" as any, { _club_id: clubId });
    if (error) throw error; return data as unknown as Attendance[];
  }});
  async function save() {
    if (!row) return; setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_correct_staff_attendance" as any, { _id: row.id, _start: new Date(`${start}+02:00`).toISOString(), _end: new Date(`${end}+02:00`).toISOString(), _reason: reason });
      if (error) throw error; setRow(null);
      await Promise.all(["bar-attendance-log", "bar-staff-pay"].map(k => qc.invalidateQueries({ queryKey: [k, clubId] })));
      toast.success("Attendance correction saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save attendance"); } finally { setBusy(false); }
  }
  return <section className="space-y-2"><h3 className="text-sm font-semibold">Working hours since last payout</h3>
    {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : error ? <p role="alert" className="text-xs text-destructive">Could not load attendance.</p> : !data.length ? <p className="text-xs text-muted-foreground">No logged working hours yet.</p> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="text-left py-2">Staff</th><th className="text-left">Shift</th><th className="text-left">Paid start</th><th className="text-left">End</th><th className="text-right">Hours</th><th /></tr></thead><tbody>{data.map(a => <tr key={a.id} className="border-b"><td className="py-2">{a.name}</td><td>{a.kind === "special" ? "Special" : "Normal"}{a.split_tips ? " · Shared tips" : ""}</td><td className="whitespace-nowrap px-2">{when(a.start)}</td><td className="whitespace-nowrap px-2">{a.end ? when(a.end) : "Open · review before pay"}</td><td className="text-right tabular-nums">{a.hours == null ? "—" : Number(a.hours).toFixed(2)}</td><td className="text-right"><Button size="sm" variant="outline" onClick={() => { setRow(a); setStart(local(a.start)); setEnd(a.end ? local(a.end) : ""); setReason(""); }}>Correct</Button></td></tr>)}</tbody></table></div>}
    <Dialog open={Boolean(row)} onOpenChange={o => { if (!o && !busy) setRow(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Correct hours · {row?.name}</DialogTitle><DialogDescription>Johannesburg time · unpaid, unallocated attendance only</DialogDescription></DialogHeader><Label htmlFor="attendance-start">Paid start</Label><Input id="attendance-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /><Label htmlFor="attendance-end">End</Label><Input id="attendance-end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /><Label htmlFor="attendance-reason">Reason</Label><Input id="attendance-reason" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={busy || !start || !end || !reason.trim()} onClick={save}>Save correction</Button></DialogContent></Dialog>
  </section>;
}