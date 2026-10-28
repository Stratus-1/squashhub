import { useFinancialAccess } from "@/hooks/use-financial-access";
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
import { isPayrollAmountInput, payrollAmount, payrollLineError, payrollLinePayable, suggestedPay, editPayrollReview, type PayrollReview, type PayBasis } from "@/lib/bar/payroll";
import { StaffAttendanceLog } from "@/components/bar/StaffAttendanceLog";
import { downloadPayrollReport } from "@/lib/bar/payroll-report";

const basisLabel = (b?: PayBasis | string | null) => b === "hourly" ? "Per hour" : b === "shift" ? "Per shift" : "Monthly salary";

interface StaffPay { id: string; name: string; pay_basis: PayBasis; salary: number; shift_rate: number; hourly_rate: number; hours: number; shifts: number; earned: number; paid: number; remaining: number }
interface PayrollLine { id: string; staff_id: string; name: string; salary: number; tips: number; pay_basis?: PayBasis; hours?: number; hourly_rate?: number; shifts?: number | null; shift_rate?: number | null; calculated_salary?: number | null }
interface PendingRun { id: string; period: string; lines: PayrollLine[] }
interface PayrollReviewSnapshot { original?: { hours: number; shifts: number; rate: number; salary: number; tips: number }; approved?: { quantity: number; rate: number; salary: number; tips: number; total: number } }
interface ConfirmedRun { id: string; period: string; confirmed_at: string; lines: { review?: PayrollReviewSnapshot; name: string; salary: number; tips: number; pay_basis?: PayBasis; hours?: number; hourly_rate?: number; shifts?: number | null; shift_rate?: number | null; calculated_salary?: number | null }[] }
interface Overview { payday: number | null; opening?: string; shifts_since?: string; staff: StaffPay[]; pending_run: PendingRun | null; confirmed_runs: ConfirmedRun[] }

const money = (n: number) => `R${Number(n).toFixed(2)}`;
const monthLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

export function BarStaffPay({ clubId }: { clubId: string }) {
  const { canChange } = useFinancialAccess(clubId);
  const qc = useQueryClient();
  const [payday, setPayday] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({});
  const [basisEdits, setBasisEdits] = useState<Record<string, PayBasis>>({});
  const [lineEdits, setLineEdits] = useState<Record<string, PayrollReview> | null>(null);
  const [previewMonthEnd, setPreviewMonthEnd] = useState(false);
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
    const basis = basisEdits[person.id] ?? person.pay_basis;
    const raw = salaryEdits[person.id] ?? String(basis === "hourly" ? person.hourly_rate : basis === "shift" ? person.shift_rate : person.salary);
    const amount = payrollAmount(raw);
    if (Number.isNaN(amount)) { toast.error("Enter a valid salary"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_set_staff_pay" as any, { _club_id: clubId, _staff_id: person.id, _basis: basis, _amount: amount });
      if (error) throw error;
      setSalaryEdits(prev => { const next = { ...prev }; delete next[person.id]; return next; });
      setBasisEdits(prev => { const next = { ...prev }; delete next[person.id]; return next; });
      await refresh();
      toast.success(`${person.name}'s pay rate saved`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save salary"); }
    finally { setBusy(false); }
  }

  const previewRun: PendingRun | null = data ? { id: "preview", period: new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date()) + "-01", lines: data.staff.map(p => ({ id: p.id, staff_id: p.id, name: p.name, pay_basis: p.pay_basis, hours: p.hours, shifts: p.shifts, hourly_rate: p.hourly_rate, shift_rate: p.shift_rate, salary: suggestedPay(p.pay_basis, p.salary, p.shift_rate, p.shifts, p.hourly_rate, p.hours), tips: Math.max(0, Number(p.remaining)), calculated_salary: suggestedPay(p.pay_basis, p.salary, p.shift_rate, p.shifts, p.hourly_rate, p.hours) })) } : null;
  const run = previewMonthEnd ? previewRun : data?.pending_run ?? null;
  const edits = useMemo(() => lineEdits ?? Object.fromEntries((run?.lines ?? []).map(l => [l.id, { quantity: String(Number(l.pay_basis === "hourly" ? l.hours ?? 0 : l.pay_basis === "shift" ? l.shifts ?? 0 : 1).toFixed(l.pay_basis === "shift" ? 0 : 2)), rate: Number(l.pay_basis === "hourly" ? l.hourly_rate ?? 0 : l.pay_basis === "shift" ? l.shift_rate ?? 0 : l.salary).toFixed(2), salary: Number(l.salary).toFixed(2), tips: Number(l.tips).toFixed(2), total: (Number(l.salary) + Number(l.tips)).toFixed(2) }])), [lineEdits, run]);
  const lineErrors = useMemo(() => Object.fromEntries((run?.lines ?? []).map(l => {
    const e = edits[l.id] ?? { salary: "0", tips: "0" };
    const maxTips = Number(data?.staff.find(s => s.id === l.staff_id)?.remaining ?? l.tips);
    const review = edits[l.id];
    const invalidQuantity = review && (!isPayrollAmountInput(review.quantity) || review.quantity === "" || (l.pay_basis === "shift" && !Number.isInteger(Number(review.quantity))));
    return [l.id, invalidQuantity || (review && (!isPayrollAmountInput(review.rate) || review.rate === "")) ? "Enter valid hours, shifts and rate" : payrollLineError(e.salary, e.tips, maxTips)];
  })), [run, edits, data]);
  // Only lines with something payable are shown or can block confirmation.
  const payableLines = (run?.lines ?? []).filter(l => payrollLinePayable(edits[l.id]?.salary ?? String(l.salary ?? 0), edits[l.id]?.tips ?? String(l.tips ?? 0)));
  const hasLineErrors = payableLines.some(l => lineErrors[l.id]);
  const totals = (run?.lines ?? []).reduce((acc, l) => {
    const e = edits[l.id] ?? { salary: "0", tips: "0" };
    return { salary: acc.salary + (payrollAmount(e.salary) || 0), tips: acc.tips + (payrollAmount(e.tips) || 0) };
  }, { salary: 0, tips: 0 });

  const reportLines = (src: PendingRun) => src.lines.map(l => {
    const e = edits[l.id];
    return { name: l.name, basis: basisLabel(l.pay_basis), quantity: l.pay_basis === "monthly" || !l.pay_basis ? "" : `${e?.quantity ?? ""}${l.pay_basis === "hourly" ? " h" : ""}`, salary: payrollAmount(e?.salary ?? "0") || 0, tips: payrollAmount(e?.tips ?? "0") || 0 };
  });

  async function submitLines(runId: string, mapId: (l: PendingRun["lines"][number]) => string | undefined, src: PendingRun) {
    const lines = src.lines.flatMap(l => { const id = mapId(l); if (!id) return []; return [{ id, salary: payrollAmount(edits[l.id]?.salary ?? "0") || 0, tips: payrollAmount(edits[l.id]?.tips ?? "0") || 0, quantity: Number(edits[l.id]?.quantity ?? 0), rate: payrollAmount(edits[l.id]?.rate ?? "0") || 0 }]; });
    const { error } = await supabase.rpc("bar_confirm_payroll_run" as any, { _run_id: runId, _lines: lines });
    if (error) throw error;
    downloadPayrollReport(monthLabel(src.period), reportLines(src));
    setLineEdits(null);
    setPreviewMonthEnd(false);
    await refresh();
    toast.success(`Payroll for ${monthLabel(src.period)} processed — salaries and tips recorded under Cost of sales — Bar`);
  }

  async function confirmRun() {
    if (!run || previewMonthEnd) return;
    if (hasLineErrors) { toast.error("Fix the highlighted amounts first"); return; }
    setBusy(true);
    try { await submitLines(run.id, l => l.id, run); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not confirm the payout"); }
    finally { setBusy(false); }
  }

  async function processPreview() {
    if (!run || !previewMonthEnd) return;
    if (hasLineErrors) { toast.error("Fix the highlighted amounts first"); return; }
    setBusy(true);
    try {
      const { data: runId, error } = await supabase.rpc("bar_prepare_payroll_run_now" as any, { _club_id: clubId });
      if (error) throw error;
      const { data: saved, error: lErr } = await (supabase as any).from("bar_payroll_run_lines").select("id, staff_id").eq("run_id", runId);
      if (lErr) throw lErr;
      const byStaff = new Map<string, string>((saved ?? []).map((s: any) => [s.staff_id, s.id]));
      const missing = run.lines.filter(l => !byStaff.has(l.staff_id) && ((payrollAmount(edits[l.id]?.salary ?? "0") || 0) > 0 || (payrollAmount(edits[l.id]?.tips ?? "0") || 0) > 0));
      if (missing.length) throw new Error(`No pay set up for ${missing.map(m => m.name).join(", ")} — save their pay first`);
      await submitLines(runId as string, l => byStaff.get(l.staff_id), run);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not process payroll"); }
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
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setPayday(v); }} disabled={!canChange || busy} />
          </div>
          <Button size="sm" className="h-9" disabled={!canChange || busy || payday === null} onClick={savePayday}>Save</Button>
        </div>
      </Card>

      <section className="space-y-2"><h3 className="text-sm font-semibold">Normal daily shift opening</h3><div className="flex items-end gap-2"><div><Label htmlFor="normal-shift-opening">Johannesburg time</Label><Input id="normal-shift-opening" type="time" value={opening ?? data?.opening?.slice(0, 5) ?? "16:00"} onChange={e => setOpening(e.target.value)} disabled={!canChange || busy} /></div><Button size="sm" disabled={!canChange || busy || !opening} onClick={async () => { setBusy(true); try { const { error } = await supabase.rpc("bar_set_normal_shift_opening" as any, { _club_id: clubId, _time: opening }); if (error) throw error; setOpening(null); await refresh(); toast.success("Normal opening time saved"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save opening time"); } finally { setBusy(false); } }}>Save</Button></div></section>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Staff pay &amp; tips</h3>
        <p className="text-xs text-muted-foreground">Since last payout{data?.shifts_since ? ` · ${new Date(data.shifts_since).toLocaleDateString("en-ZA")}` : ""} · Completed working hours</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b">
              <th className="text-left py-2">Staff</th><th className="text-left px-1">Paid</th><th className="text-right">Amount (R)</th><th className="text-right">Shifts / hours</th><th className="text-right">Pay so far</th><th className="text-right">Tips earned</th><th className="text-right">Tips paid</th><th className="text-right">Outstanding tips</th><th />
            </tr></thead>
            <tbody>{(data?.staff ?? []).map(person => {
              const edited = salaryEdits[person.id];
              const basis = basisEdits[person.id] ?? person.pay_basis;
              const stored = basis === "hourly" ? Number(person.hourly_rate ?? 0) : basis === "shift" ? Number(person.shift_rate) : Number(person.salary);
              const amountNow = edited !== undefined ? payrollAmount(edited) || 0 : stored;
              const dirty = edited !== undefined || basis !== person.pay_basis;
              return (
                <tr className="border-b" key={person.id}>
                  <td className="py-2">{person.name}</td>
                  <td className="px-1">
                    <select aria-label={`${person.name} pay basis`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={basis} disabled={!canChange || busy}
                      onChange={e => { const b = e.target.value as PayBasis; setBasisEdits(prev => ({ ...prev, [person.id]: b })); setSalaryEdits(prev => { const n = { ...prev }; delete n[person.id]; return n; }); }}>
                      <option value="monthly">Monthly salary</option><option value="shift">Per shift</option><option value="hourly">Per hour</option>
                    </select>
                  </td>
                  <td className="text-right px-1">
                    <Input aria-label={`${person.name} amount`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={edited ?? (stored ? stored.toFixed(2) : "")}
                      placeholder="0.00" disabled={!canChange || busy}
                      onChange={e => { if (isPayrollAmountInput(e.target.value)) setSalaryEdits(prev => ({ ...prev, [person.id]: e.target.value })); }} />
                  </td>
                  <td className="text-right tabular-nums px-1">{basis === "hourly" ? `${Number(person.hours ?? 0).toFixed(2)} h` : basis === "shift" ? person.shifts : "—"}</td>
                  <td className="text-right tabular-nums px-1">{money(suggestedPay(basis, amountNow, amountNow, person.shifts, amountNow, Number(person.hours ?? 0)))}</td>
                  <td className="text-right tabular-nums px-1">{money(person.earned)}</td>
                  <td className="text-right tabular-nums px-1">{money(person.paid)}</td>
                  <td className="text-right tabular-nums px-1">{money(person.remaining)}</td>
                  <td className="text-right"><Button size="sm" variant="outline" disabled={!canChange || busy || !dirty} onClick={() => saveSalary(person)}>Save</Button></td>
                </tr>
              );
            })}</tbody>
          </table>
          {!data?.staff?.length && <p className="text-muted-foreground text-xs py-3">No bar staff yet — add counter PINs above first.</p>}
        </div>
      </Card>

      <StaffAttendanceLog clubId={clubId} />
      <Button variant="outline" disabled={busy || !data} onClick={() => { setLineEdits(null); setPreviewMonthEnd(v => !v); }}>{previewMonthEnd ? "Close month-end preview" : "Run month end — preview"}</Button>

      {run && (
        <Card className="p-4 space-y-3 border-primary/40">
          <div>
            <h3 className="text-sm font-semibold">{previewMonthEnd ? "Month-end preview" : "Payout ready"} — {monthLabel(run.period)}</h3>
            <p className="text-xs text-muted-foreground">{previewMonthEnd ? "Check accrued pay and outstanding tips so far. No payout is prepared or processed." : "Review hours, rate, pay and tips before confirming the bank payout."}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="text-left py-2">Staff</th><th className="text-right">Hours / shifts</th><th className="text-right">Rate (R)</th><th className="text-right">Pay (R)</th><th className="text-right">Tips (R)</th><th className="text-right">Total</th></tr></thead>
              <tbody>{payableLines.map(l => {
                const e = edits[l.id];
                if (!e) return null;
                const change = (field: keyof PayrollReview, value: string) => { if (isPayrollAmountInput(value)) setLineEdits(prev => ({ ...(prev ?? edits), [l.id]: editPayrollReview((prev ?? edits)[l.id], field, value, l.pay_basis ?? "monthly") })); };
                const err = lineErrors[l.id];
                return (
                  <tr className="border-b" key={l.id}>
                    <td className="py-2">{l.name}
                      <p className="text-muted-foreground text-[11px]">{l.pay_basis === "hourly" ? `${Number(l.hours ?? 0).toFixed(2)} h × ${money(Number(l.hourly_rate ?? 0))} = ${money(Number(l.calculated_salary ?? 0))}` : l.pay_basis === "shift" ? `${l.shifts ?? 0} shift${l.shifts === 1 ? "" : "s"} × ${money(Number(l.shift_rate ?? 0))} = ${money(Number(l.calculated_salary ?? 0))}` : "Monthly salary"}{l.calculated_salary != null && Math.abs((payrollAmount(e.salary) || 0) - Number(l.calculated_salary)) > 0.004 ? " · overridden" : ""}</p>
                      {err && <p className="text-destructive text-[11px]">{err}</p>}</td>
                    <td className="text-right px-1">{l.pay_basis === "monthly" ? "—" : <Input aria-label={`${l.name} ${l.pay_basis === "shift" ? "shifts" : "hours"}`} inputMode="decimal" className="h-8 w-24 ml-auto text-right" value={e.quantity} disabled={!canChange || busy} onChange={ev => change("quantity", ev.target.value)} />}</td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} payout rate`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.rate} disabled={!canChange || busy} onChange={ev => change("rate", ev.target.value)} /></td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} salary`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.salary} disabled={!canChange || busy}
                      onChange={ev => change("salary", ev.target.value)} /></td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} tips`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.tips} disabled={!canChange || busy}
                      onChange={ev => change("tips", ev.target.value)} /></td>
                    <td className="text-right px-1"><Input aria-label={`${l.name} payout total`} inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={e.total} disabled={!canChange || busy} onChange={ev => change("total", ev.target.value)} /></td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr>
                <td colSpan={3} className="py-2 font-semibold">Total payout</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.salary)}</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.tips)}</td>
                <td className="text-right tabular-nums px-1 font-semibold">{money(totals.salary + totals.tips)}</td>
              </tr></tfoot>
            </table>
          </div>
          {previewMonthEnd
            ? <div className="space-y-1"><Button onClick={processPreview} disabled={!canChange || busy || hasLineErrors}>Process payroll & generate report</Button><p className="text-[11px] text-muted-foreground">Records these salaries and tips under Cost of sales — Bar and downloads the paymaster report.</p></div>
            : <Button onClick={confirmRun} disabled={!canChange || busy || hasLineErrors}>Confirm payout & generate report</Button>}
        </Card>
      )}

      {Boolean(data?.confirmed_runs?.length) && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Previous payouts</h3>
          {data?.confirmed_runs.map(r => (
            <details key={r.id} className="border rounded-md p-2">
              <summary className="text-xs font-medium cursor-pointer">{monthLabel(r.period)} — confirmed {new Date(r.confirmed_at).toLocaleDateString("en-ZA")}</summary>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => downloadPayrollReport(monthLabel(r.period), r.lines.map(l => ({ name: l.name, basis: basisLabel(l.pay_basis), quantity: l.pay_basis === "hourly" ? `${Number(l.hours ?? 0).toFixed(2)} h` : l.pay_basis === "shift" ? `${l.shifts ?? 0}` : "", salary: Number(l.salary), tips: Number(l.tips) })), new Date(r.confirmed_at))}>Download paymaster report</Button>
              <table className="w-full text-xs mt-2">
                <tbody>{r.lines.map((l, i) => (
                  <tr className="border-b last:border-0" key={i}><td className="py-1">{l.name}</td><td className="text-right tabular-nums px-1">{l.pay_basis === "hourly" ? `${Number(l.hours ?? 0).toFixed(2)} h · ` : l.pay_basis === "shift" ? `${l.shifts ?? 0} shifts · ` : ""}Pay {money(l.salary)}{l.review?.original && <p className="text-muted-foreground">Original pay {money(l.review.original.salary)} · Rate {money(l.review.original.rate)}</p>}{l.review?.approved && <p className="text-muted-foreground">Approved {l.review.approved.quantity} × {money(l.review.approved.rate)} · Total {money(l.review.approved.total)}</p>}</td><td className="text-right tabular-nums px-1">Tips {money(l.tips)}</td></tr>
                ))}</tbody>
              </table>
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
