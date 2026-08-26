import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CalendarClock, Receipt } from "lucide-react";

export type BillingRunResult = {
  subscription_id?: string;
  club?: string;
  invoice_number?: string;
  billing_month?: string;
  billing_cycle?: string;
  invoice_kind?: string;
  period_start?: string;
  period_end?: string;
  next_renewal?: string;
  issue_date?: string;
  due_date?: string;
  subscription_due?: boolean;
  member_count?: number;
  currency?: string;
  subscription_amount?: number;
  whatsapp_amount?: number;
  whatsapp_message_count?: number;
  subtotal?: number;
  vat?: number;
  total?: number;
  status?: string;
  reason?: string;
  error?: string;
};

export type BillingRunSummary = {
  dryRun?: boolean;
  run_date?: string;
  issue_date?: string;
  billing_month?: string;
  advance_days?: number;
  in_advance_window?: boolean;
  processed?: number;
  issued?: number;
  skipped?: number;
  failed?: number;
  results?: BillingRunResult[];
  clubLabel?: string;
};

const CYCLE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  biannual: "6-monthly",
  biannual_upfront: "6-monthly upfront",
  annual: "Annual",
  annual_upfront: "Annual upfront",
};

export const cycleLabel = (c?: string) => (c ? CYCLE_LABEL[c] || c : "—");

const money = (n?: number) =>
  typeof n === "number" ? `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const day = (d?: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Short human confirmation of the next invoice for a preview row. */
export function nextInvoiceSentence(r: BillingRunResult): string {
  const cycle = cycleLabel(r.billing_cycle).toLowerCase();
  if (r.status === "skipped") {
    return `${r.club || "Club"}: nothing to invoice now — next ${cycle} renewal ${day(r.next_renewal)}.`;
  }
  return `${r.club || "Club"}: invoice dated ${day(r.issue_date)} for ${money(r.total)} (${cycle}), covering ${day(
    r.period_start,
  )} – ${day(r.period_end)}, due ${day(r.due_date)}.`;
}

export function BillingRunPreviewDialog({
  open,
  onOpenChange,
  run,
  onConfirmSend,
  sending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run: BillingRunSummary | null;
  onConfirmSend?: () => void;
  sending?: boolean;
}) {
  const rows = run?.results || [];
  const billable = rows.filter(r => r.status === "dry-run");
  const grandTotal = billable.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Invoice preview {run?.clubLabel ? `— ${run.clubLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <CalendarClock className="h-3 w-3" />
            Run {day(run?.run_date || run?.issue_date)}
          </Badge>
          <Badge variant="outline">
            Each invoice is dated on the club's renewal date (issued up to {run?.advance_days ?? 0} days early)
          </Badge>

          <Badge variant="outline">{billable.length} to invoice</Badge>
          <Badge variant="outline">{rows.length - billable.length} skipped</Badge>
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Total {money(grandTotal)}</Badge>
          <span className="text-muted-foreground">Nothing has been created or emailed yet.</span>
        </div>

        <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs min-w-[190px]">Club</TableHead>
              <TableHead className="text-xs whitespace-nowrap">Cycle</TableHead>
              <TableHead className="text-xs">Period covered</TableHead>
              <TableHead className="text-xs">Invoice date</TableHead>
              <TableHead className="text-xs">Due</TableHead>
              <TableHead className="text-xs text-right">Subscription</TableHead>
              <TableHead className="text-xs text-right">WhatsApp</TableHead>
              <TableHead className="text-xs text-right">VAT</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">
                  No subscriptions matched this run.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => {
              const skipped = r.status !== "dry-run";
              return (
                <TableRow key={`${r.subscription_id || i}`} className={skipped ? "opacity-60" : ""}>
                  <TableCell className="text-xs font-medium align-top">
                    <div className="whitespace-nowrap">{r.club || "—"}</div>
                    {r.invoice_number && <div className="text-[10px] text-muted-foreground font-mono">{r.invoice_number}</div>}
                    {skipped && <div className="text-[10px] text-amber-600 whitespace-nowrap">{r.reason || r.error || r.status}</div>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">{cycleLabel(r.billing_cycle)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">
                    {skipped ? `Next renewal ${day(r.next_renewal)}` : `${day(r.period_start)} – ${day(r.period_end)}`}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">{day(r.issue_date)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">{day(r.due_date)}</TableCell>
                  <TableCell className="text-xs text-right font-mono align-top">{money(r.subscription_amount)}</TableCell>
                  <TableCell className="text-xs text-right font-mono align-top">
                    {r.whatsapp_amount ? `${money(r.whatsapp_amount)} (${r.whatsapp_message_count || 0})` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono align-top">{money(r.vat)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold align-top">{money(r.total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>


        {billable.some(r => r.subscription_due === false) && (
          <p className="flex items-start gap-2 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Rows marked with a future renewal are previewed for inspection only — a live run would bill usage only.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onConfirmSend && billable.length > 0 && (
            <Button size="sm" disabled={sending} onClick={onConfirmSend}>
              Generate &amp; email {billable.length} invoice{billable.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
