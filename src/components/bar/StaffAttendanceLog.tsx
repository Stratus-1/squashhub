import { Fragment, useMemo, useState } from "react";
import { useFinancialAccess } from "@/hooks/use-financial-access";
import { ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CollapsibleSection } from "@/components/ui/collapsible-card";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
interface Attendance { id: string; name: string; start: string; end: string | null; hours: number | null; kind: string; split_tips: boolean; tip_sharing_mode?: "own" | "hours" | "equal"; reason: string | null; paid?: boolean }
const local = (s: string) => new Date(Date.parse(s) + 7_200_000).toISOString().slice(0, 16);
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });
export function StaffAttendanceLog({ clubId }: { clubId: string }) {
  const { canChange } = useFinancialAccess(clubId);
  const qc = useQueryClient();
  const [row, setRow] = useState<Attendance | null>(null);
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const review = useQuery({ queryKey: ["bar-shared-tip-review", clubId], queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_work_shift_status" as any, { _club_id: clubId, _token: null });
    if (error) throw error; return data as unknown as { unallocated_tips: number };
  }});
  const { data = [], isLoading, error } = useQuery({ queryKey: ["bar-attendance-log", clubId], queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_staff_attendance_log" as any, { _club_id: clubId });
    if (error) throw error; return data as unknown as Attendance[];
  }});
  async function save() {
    if (!row) return; setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_correct_staff_attendance" as any, { _id: row.id, _start: new Date(`${start}+02:00`).toISOString(), _end: new Date(`${end}+02:00`).toISOString(), _reason: reason });
      if (error) throw error; setRow(null);
      await Promise.all(["bar-attendance-log", "bar-staff-pay", "bar-shared-tip-review"].map(k => qc.invalidateQueries({ queryKey: [k, clubId] })));
      toast.success("Attendance correction saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save attendance"); } finally { setBusy(false); }
  }
  const visible = history ? data : data.filter(a => !a.paid);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const byPerson = useMemo(() => {
    const m = new Map<string, Attendance[]>();
    for (const a of visible) { const arr = m.get(a.name); if (arr) arr.push(a); else m.set(a.name, [a]); }
    return [...m.entries()];
  }, [visible]);
  return <section className="space-y-2">
    <CollapsibleSection
      defaultOpen={false}
      header={<>
        <h3 className="text-sm font-semibold">{history ? "Working hours history" : "Working hours since last payout"}<span className="ml-1 text-xs font-normal text-muted-foreground">({byPerson.length} {byPerson.length === 1 ? "person" : "people"})</span></h3>
        <Button size="sm" variant="outline" className="ml-auto" onClick={e => { e.stopPropagation(); setHistory(v => !v); setOpenPerson(null); }}>{history ? "Current period" : "History"}</Button>
      </>}
    >
      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : error ? <p role="alert" className="text-xs text-destructive">Could not load attendance.</p> : !byPerson.length ? <p className="text-xs text-muted-foreground">No logged working hours yet.</p> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="text-left py-2">Staff</th><th className="text-right">Shifts</th><th className="text-right">Hours</th><th /></tr></thead><tbody>{byPerson.map(([name, rows]) => {
        const open = openPerson === name;
        const hours = rows.reduce((s, a) => s + (a.hours ?? 0), 0);
        return (
          <Fragment key={name}>
            <tr className="border-b cursor-pointer select-none" onClick={() => setOpenPerson(open ? null : name)}>
              <td className="py-2 font-medium">{name}</td>
              <td className="text-right tabular-nums">{rows.length}</td>
              <td className="text-right tabular-nums">{hours.toFixed(2)}</td>
              <td className="text-right"><ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform inline-block ${open ? "rotate-180" : ""}`} /></td>
            </tr>
            {open && <tr className="border-b last:border-0"><td colSpan={4} className="py-1 pl-4">
              <table className="w-full text-xs"><tbody>{rows.map(a => <tr key={a.id} className="border-b last:border-0">
                <td className="py-1">{a.kind === "special" ? "Special" : "Normal"}{a.split_tips ? a.tip_sharing_mode === "equal" ? " · Equal tips" : " · Tips by hours" : a.kind === "special" ? " · Own tips" : ""}</td>
                <td className="whitespace-nowrap px-2">{when(a.start)}</td>
                <td className="whitespace-nowrap px-2">{a.end ? when(a.end) : "Open · review before pay"}</td>
                <td className="text-right tabular-nums">{a.hours == null ? "—" : Number(a.hours).toFixed(2)}</td>
                <td className="text-right">{a.paid ? "Paid" : canChange ? <Button size="sm" variant="outline" onClick={() => { setRow(a); setStart(local(a.start)); setEnd(a.end ? local(a.end) : ""); setReason(""); }}>Correct</Button> : null}</td>
              </tr>)}</tbody></table>
            </td></tr>}
          </Fragment>
        );
      })}</tbody></table></div>}
    </CollapsibleSection>
    {Number(review.data?.unallocated_tips ?? 0) > 0 && <div className="border rounded-md p-3 space-y-2 text-xs"><p className="text-destructive">R{Number(review.data?.unallocated_tips).toFixed(2)} shared tips await working-hours review.</p><Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const { error } = await supabase.rpc("bar_review_shift_tips" as any, { _club_id: clubId }); if (error) throw error; await Promise.all(["bar-shared-tip-review", "bar-staff-pay", "bar-staff-tips", "income-statement"].map(k => qc.invalidateQueries({ queryKey: [k] }))); toast.success("Shared tips reviewed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not review tips"); } finally { setBusy(false); } }}>Allocate reviewed tips</Button></div>}
    <Dialog open={Boolean(row)} onOpenChange={o => { if (!o && !busy) setRow(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Correct hours · {row?.name}</DialogTitle><DialogDescription>Johannesburg time · unpaid, unallocated attendance only</DialogDescription></DialogHeader><Label htmlFor="attendance-start">Paid start</Label><Input id="attendance-start" type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /><Label htmlFor="attendance-end">End</Label><Input id="attendance-end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /><Label htmlFor="attendance-reason">Reason</Label><Input id="attendance-reason" value={reason} onChange={e => setReason(e.target.value)} /><Button disabled={busy || !start || !end || !reason.trim()} onClick={save}>Save correction</Button></DialogContent></Dialog>
  </section>;
}