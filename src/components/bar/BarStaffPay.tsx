/**
 * Bar staff pay — monthly salaries and the monthly tips+salary payout.
 * On the club's chosen pay day a payout run is prepared automatically;
 * management reviews, adjusts and confirms it here. Confirming settles each
 * person's outstanding tips and records salary + tips under Bar cost of sales.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isPayrollAmountInput, payrollAmount, payrollLineError } from "@/lib/bar/payroll";

interface StaffPay { id: string; name: string; salary: number; earned: number; paid: number; remaining: number }
interface PayrollLine { id: string; staff_id: string; name: string; salary: number; tips: number }
interface PendingRun { id: string; period: string; lines: PayrollLine[] }
interface ConfirmedRun { id: string; period: string; confirmed_at: string; lines: { name: string; salary: number; tips: number }[] }
interface Overview { payday: number | null; staff: StaffPay[]; pending_run: PendingRun | null; confirmed_runs: ConfirmedRun[] }

const money = (n: number) => `R${Number(n).toFixed(2)}`;
const monthLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

export function BarStaffPay({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [payday, setPayday] = useState<string | null>(null);
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({});
  const [lineEdits, setLineEdits] = useState<Record<string, { salary: string; tips: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bar-staff-pay", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_staff_pay_overview" as any, { _club_id: clubId });
      if (error) throw error;
      return data as unknown as Overview | null;
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["bar-staff-pay", clubId] });
    await qc.invalidateQueries({ queryKey: ["bar-staff-tips"] });
    await qc.invalidateQueries({ queryKey: ["income-statement"] });
  };

  async function savePayday() {
    const day = payday === null || payday === "" ? null : Number(payday);
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) { toast.error("Pay day must be between 1 and 31"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_set_staff_payday" as any, { _club_id: clubId, _day: day });
      if (error) throw error;
      await refresh();
      toast.success(day ? `Pay day set to the ${day}th of each month` : "Automatic monthly payout switched off");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save pay day"); }
    finally { setBusy(false); }
  }

  async function saveSalary(person: StaffPay) {
    const raw = salaryEdits[person.id];
    if (raw === undefined) return;
    const amount = payrollAmount(raw);
    if (Number.isNaN(amount)) { toast.error("Enter a valid salary"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_set_staff_salary" as any, { _club_id: clubId, _staff_id: person.id, _amount: amount });
      if (error) throw error;
      setSalaryEdits(prev => { const next = { ...prev }; delete next[person.id]; return next; });
      await refresh();
      toast.success(`${person.name}'s monthly salary saved`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save salary"); }
    finally { setBusy(false); }
  }

  const run = data?.pending_run ?? null;
  const edits = useMemo(() => lineEdits ?? Object.fromEntries((run?.lines ?? []).map(l => [l.id, { salary: String(Number(l.salary).toFixed(2)), tips: String(Number(l.tips).toFixed(2)) }])), [lineEdits, run]);
  const lineErrors = useMemo(() => Object.fromEntries((run?.lines ?? []).map(l => {
    const e = edits[l.id] ?? { salary: "0", tips: "0" };
    const maxTips = Number(data?.staff.find(s => s.id === l.staff_id)?.remaining ?? l.tips);
    return [l.id, payrollLineError(e.salary, e.tips, Math.max(maxTips, Number(l.tips)))];
  })), [run, edits, data]);
  const totals = (run?.lines ?? []).reduce((acc, l) => {
    const e = edits[l.id] ?? { salary: "0", tips: "0" };
    return { salary: acc.salary + (payrollAmount(e.salary) || 0), tips: acc.tips + (payrollAmount(e.tips) || 0) };
  }, { salary: 0, tips: 0 });

  async function confirmRun() {
    if (!run) return;
    if (Object.values(lineErrors).some(Boolean)) { toast.error("Fix the highlighted amounts first"); return; }
    setBusy(true);
    try {
      const lines = run.lines.map(l => ({ id: l.id, salary: payrollAmount(edits[l.id]?.salary ?? "0") || 0, tips: payrollAmount(edits[l.id]?.tips ?? "0") || 0 }));
      const { error } = await supabase.rpc("bar_confirm_payroll_run" as any, { _run_id: run.id, _lines: lines });
      if (error) throw error;
      setLineEdits(null);
      await refresh();
      toast.success(`Payout for ${monthLabel(run.period)} confirmed — salaries and tips recorded under Bar cost of sales`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not confirm the payout"); }
    finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-muted-foreground text-xs">Loading…</p>;
  if (error) return <p role="alert" className="text-destructive text-xs">Could not load staff pay.</p>;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Monthly pay day</h3>
        <p className="text-xs text-muted-foreground">
          On this day each month the payout is prepared automatically with each person's monthly salary and outstanding
          tips. You then review, adjust and confirm it below — nothing is paid out or recorded until you confirm.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="staff-payday" className="text-[11px]">Day of month (1–31; shorter months use their last day)</Label>
            <Input id="staff-payday" inputMode="numeric" className="h-9 w-24" value={payday ?? String(data?.payday ?? "")}
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setPayday(v); }} disabled={busy} />
          </div>
          <Button size="sm" className="h-9" disabled={busy || payday === null} onClick={savePayday}>Save</Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Staff salaries &amp; tips</h3>
        <p className="text-xs text-muted-foreground">Set each barman's monthly salary next to their counter PIN name. Outstanding tips are what they have not yet taken in cash.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b">
              <th className="text-left py-2">Staff</th><th className="text-right">Monthly salary</th><th className="text-right">Tips earned</th><th className="text-right">Tips paid</th><th className="text-right">Outstanding tips</th><th />
            </tr></thead>
            <tbody>{(data?.staff ?? []).map(person => {
              const edited = salaryEdits[person.id];
              return (
                <tr className="border-b" key={person.id}>
                  <td className="py-2">{person.name}</td>
                  <td className="text-right px-1">
                    <Input inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={edited ?? (Number(person.salary) ? Number(person.salary).toFixed(2) : "")}
                      placeholder="0.00" disabled={busy}
                      onChange={e => { if (isPayrollAmountInput(e.target.value)) setSalaryEdits(prev => ({ ...prev, [person.id]: e.target.value })); }} />
                  </td>
                  <td className="text-right tabular-nums px-1">{money(person.earned)}</td>
                  <td className="text-right tabular-nums px-1">{money(person.paid)}</td>
                  <td className="text-right tabular-nums px-1">{money(person.remaining)}</td>
                  <td className="text-right"><Button size="sm" variant="outline" disabled={busy || edited === undefined} onClick={() => saveSalary(person)}>Save</Button></td>
                </tr>
              );
            })}</tbody>
          </table>
          {!data?.staff?.length && <p className="text-muted-foreground text-xs py-3">No bar staff yet — add counter PINs above first.</p>}
        </div>
      </Card>

      {run && (
        <Card className="p-4 space-y-3 border-primary/40">
          <div>
            <h3 className="text-sm font-semibold">Payout ready — {monthLabel(run.period)}</h3>
            <p className="text-xs text-muted-foreground">Review and adjust the amounts, then confirm. Confirming pays each person's outstanding tips with their salary and records both under Bar cost of sales (paid from the bank).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="text-left py-2">Staff</th><th className="text-right">Salary (R)</th><th className="text-right">Tips (R)</th><th className="text-right">Total</th></tr></thead>
              <tbody>{run.lines.map(l => {
                const e = edits[l.id] ?? { salary: "0", tips: "0" };
                const err = lineErrors[l.id];
                const total = (payrollAmount(e.salary) || 0) + (payrollAmount(e.tips) || 0);
                return (
                  <tr className="border-b" key={l.id}>
                    <td className="py-2">{l.name}{err && <p className="text-destructive text-[11px]">{err}</p>}</td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} salary`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.salary} disabled={busy}
                      onChange={ev => { if (isPayrollAmountInput(ev.target.value)) setLineEdits(prev => ({ ...(prev ?? edits), [l.id]: { ...(prev ?? edits)[l.id], salary: ev.target.value } })); }} /></td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} tips`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.tips} disabled={busy}
                      onChange={ev => { if (isPayrollAmountInput(ev.target.value)) setLineEdits(prev => ({ ...(prev ?? edits), [l.id]: { ...(prev ?? edits)[l.id], tips: ev.target.value } })); }} /></td>
                    <td className="text-right tabular-nums px-1">{money(total)}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr>
                <td className="py-2 font-semibold">Total payout</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.salary)}</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.tips)}</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.salary + totals.tips)}</td>
              </tr></tfoot>
            </table>
          </div>
          <Button onClick={confirmRun} disabled={busy || Object.values(lineErrors).some(Boolean)}>Confirm payout</Button>
        </Card>
      )}

      {Boolean(data?.confirmed_runs?.length) && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Previous payouts</h3>
          {data!.confirmed_runs.map(r => (
            <details key={r.id} className="border rounded-md p-2">
              <summary className="text-xs font-medium cursor-pointer">{monthLabel(r.period)} — confirmed {new Date(r.confirmed_at).toLocaleDateString("en-ZA")}</summary>
              <table className="w-full text-xs mt-2">
                <tbody>{r.lines.map((l, i) => (
                  <tr className="border-b last:border-0" key={i}><td className="py-1">{l.name}</td><td className="text-right tabular-nums px-1">Salary {money(l.salary)}</td><td className="text-right tabular-nums px-1">Tips {money(l.tips)}</td></tr>
                ))}</tbody>
              </table>
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
