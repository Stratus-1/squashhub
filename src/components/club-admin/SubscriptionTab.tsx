import { useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, FileText, ExternalLink, Copy, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useMyClub } from "@/hooks/use-club";
import { ClubParticipationCard } from "@/components/club-admin/ClubParticipationCard";
import { openStitchCheckout, buildStitchReturnUrl } from "@/lib/stitch-checkout";

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  billing_cycle: string;
  plan_name: string;
  member_count: number;
  price_per_member: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  issued: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  void: "bg-muted text-muted-foreground",
  draft: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const fmtMoney = (n: number, ccy = "ZAR") =>
  `${ccy === "ZAR" ? "R " : ccy + " "}${(n || 0).toFixed(2)}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export function SubscriptionTab({ clubId }: { clubId: string }) {
  const { data: myClub } = useMyClub();
  const club = myClub?.club;
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const verifiedRef = useRef<string | null>(null);

  const { data: invoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["club-platform-invoices", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_subscription_invoices")
        .select("*")
        .eq("club_id", clubId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Invoice[];
    },
  });

  const { data: bank } = useQuery({
    queryKey: ["platform-invoice-settings-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "platform_invoice_settings")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (!data?.value) return null;
      try {
        return JSON.parse(data.value) as Record<string, string>;
      } catch {
        return null;
      }
    },
  });

  const outstanding = useMemo(
    () => invoices.filter((i) => i.status !== "paid" && i.status !== "void"),
    [invoices]
  );
  const totalOutstanding = outstanding.reduce((s, i) => s + Number(i.total || 0), 0);
  const outstandingCurrency = (outstanding[0] as any)?.currency || "ZAR";

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} to clipboard`),
      () => toast.error("Copy failed")
    );
  };

  const openInvoice = (inv: Invoice) => {
    const html = renderInvoiceHtml(inv, club?.name || "Your Club", bank || {});
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      toast.error("Popup blocked — allow popups to view the invoice");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handlePayStitch = async (inv: Invoice) => {
    const t = toast.loading("Creating Stitch payment link…");
    try {
      const return_url = buildStitchReturnUrl("/club-admin?tab=subscription");
      const { data, error } = await supabase.functions.invoke("stitch-pay-platform-invoice", {
        body: { invoice_id: inv.id, return_url },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.redirect_url;
      if (!url) throw new Error("No payment URL returned");
      toast.success("Opening Stitch checkout…", { id: t });
      await openStitchCheckout(url);
    } catch (e: any) {
      toast.error(e?.message || "Failed to start Stitch payment", { id: t });
    }
  };

  // On return from Stitch (URL has reference=INV-... or payment_id=...), poll to confirm payment
  useEffect(() => {
    const reference = searchParams.get("reference");
    const payment_id = searchParams.get("payment_id");
    if (!reference && !payment_id) return;
    const key = `${reference || ""}|${payment_id || ""}`;
    if (verifiedRef.current === key) return;
    verifiedRef.current = key;

    let cancelled = false;
    const toastId = toast.loading("Confirming your payment with Stitch…");

    (async () => {
      const maxAttempts = 12;
      for (let attempt = 1; attempt <= maxAttempts && !cancelled; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("stitch-verify-platform-invoice", {
            body: { invoice_number: reference, payment_id },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          const status = (data as any)?.status;
          const stitchState = (data as any)?.stitch_state;
          if (status === "paid") {
            toast.success(
              (data as any)?.already ? "Payment already recorded." : "Payment received — thank you!",
              { id: toastId }
            );
            qc.invalidateQueries({ queryKey: ["club-platform-invoices", clubId] });
            // Clean the query string so refreshes don't re-poll
            const next = new URLSearchParams(searchParams);
            next.delete("reference");
            next.delete("payment_id");
            setSearchParams(next, { replace: true });
            return;
          }
          if (stitchState === "EXPIRED" || stitchState === "CANCELLED") {
            toast.error(`Payment ${stitchState.toLowerCase()}. Please try again.`, { id: toastId });
            return;
          }
        } catch (e: any) {
          if (attempt === maxAttempts) {
            toast.error(e?.message || "Could not confirm payment.", { id: toastId });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!cancelled) {
        toast.message("Still waiting on Stitch. Refresh in a moment to see the updated status.", { id: toastId });
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, clubId, qc, setSearchParams]);

  return (
    <div className="space-y-6 mt-4">
      {club && <ClubParticipationCard club={club} />}

      {/* Outstanding summary */}
      {outstanding.length > 0 && (
        <Card className="p-4 border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-sm">Outstanding subscription invoices</h3>
              <p className="text-xs text-muted-foreground">
                {outstanding.length} invoice{outstanding.length === 1 ? "" : "s"} awaiting payment
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total due</div>
              <div className="text-lg font-bold text-amber-800 dark:text-amber-300">
                {fmtMoney(totalOutstanding, outstandingCurrency)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Invoice list */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Subscription Invoices</h3>
        </div>

        {invLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices…
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">
            No invoices yet. Invoices are generated by the platform once your subscription begins.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const unpaid = inv.status !== "paid" && inv.status !== "void";
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => openInvoice(inv)}
                        >
                          {inv.invoice_number}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}
                        <div className="text-[10px] uppercase text-muted-foreground">
                          {inv.billing_cycle}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">{inv.member_count}</TableCell>
                      <TableCell className="text-right font-semibold text-xs">
                        {fmtMoney(Number(inv.total), inv.currency)}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(inv.due_date)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[inv.status] || ""} variant="secondary">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openInvoice(inv)}
                            title="View / Print / Download"
                          >
                            <Printer className="w-3 h-3 mr-1" /> View
                          </Button>
                          {unpaid && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs"
                              onClick={() => handlePayStitch(inv)}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Pay via Stitch
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => copy(inv.invoice_number, "Invoice #")}
                            title="Copy invoice reference"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* EFT bank details */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">EFT / Bank Payment Details</h3>
        </div>
        {!bank || !bank.bank_account_number ? (
          <p className="text-xs text-muted-foreground">
            Bank details have not been published yet. Please contact the platform administrator.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <BankRow label="Bank" value={bank.bank_name} onCopy={copy} />
            <BankRow label="Account Name" value={bank.bank_account_name} onCopy={copy} />
            <BankRow label="Account #" value={bank.bank_account_number} onCopy={copy} mono />
            <BankRow label="Branch Code" value={bank.bank_branch_code} onCopy={copy} mono />
            {bank.bank_swift && <BankRow label="SWIFT" value={bank.bank_swift} onCopy={copy} mono />}
            {bank.vat_number && <BankRow label="VAT #" value={bank.vat_number} onCopy={copy} mono />}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-1 border-t">
          Use your <strong>invoice number</strong> as the payment reference so we can allocate your
          EFT correctly.
        </p>
      </Card>
    </div>
  );
}

function BankRow({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value?: string;
  onCopy: (v: string, label?: string) => void;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-sm ${mono ? "font-mono" : "font-medium"} truncate`}>{value}</div>
      </div>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onCopy(value, label)}>
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  );
}

function renderInvoiceHtml(inv: Invoice, clubName: string, bank: Record<string, string>) {
  const money = (n: number) => fmtMoney(n, inv.currency);
  const platformName = bank.company_name || "SquashHub / HKFT Services";
  const platformAddr = bank.company_address || "";
  const vatNo = bank.vat_number ? `VAT No: ${bank.vat_number}` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Invoice ${inv.invoice_number}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;padding:32px;max-width:800px;margin:0 auto;background:#fff}
  h1{color:#1E3A5F;margin:0 0 4px;font-size:26px}
  h2{color:#1E3A5F;margin:20px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1E3A5F;padding-bottom:16px;margin-bottom:20px}
  .muted{color:#64748b;font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
  .box{border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;font-size:13px}
  th{background:#f1f5f9;color:#334155;text-transform:uppercase;font-size:11px;letter-spacing:.05em}
  .right{text-align:right}
  .totals{margin-left:auto;width:280px;margin-top:12px}
  .totals td{border:none;padding:4px 0}
  .total-row td{border-top:2px solid #1E3A5F;font-weight:700;font-size:15px;padding-top:8px}
  .status{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase}
  .paid{background:#d1fae5;color:#065f46}
  .unpaid{background:#fef3c7;color:#92400e}
  .actions{margin:20px 0;display:flex;gap:8px}
  .actions button{padding:8px 16px;border-radius:6px;border:1px solid #1E3A5F;background:#1E3A5F;color:#fff;cursor:pointer;font-weight:600}
  .actions button.ghost{background:#fff;color:#1E3A5F}
  @media print{.actions{display:none}body{padding:0}}
</style></head>
<body>
  <div class="actions">
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>
  <div class="head">
    <div>
      <h1>TAX INVOICE</h1>
      <div class="muted">${escapeHtml(inv.invoice_number)}</div>
      <div class="muted">Issued: ${fmtDate(inv.issued_at)}</div>
      <div class="muted">Due: ${fmtDate(inv.due_date)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:700;color:#1E3A5F">${escapeHtml(platformName)}</div>
      ${platformAddr ? `<div class="muted">${escapeHtml(platformAddr)}</div>` : ""}
      ${vatNo ? `<div class="muted">${escapeHtml(vatNo)}</div>` : ""}
      <div style="margin-top:8px">
        <span class="status ${inv.status === "paid" ? "paid" : "unpaid"}">${escapeHtml(inv.status)}</span>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h2 style="margin-top:0">Bill To</h2>
      <div style="font-weight:600">${escapeHtml(clubName)}</div>
      <div class="muted">Billing period: ${fmtDate(inv.period_start)} → ${fmtDate(inv.period_end)}</div>
      <div class="muted">Cycle: ${escapeHtml(inv.billing_cycle)}</div>
    </div>
    <div class="box">
      <h2 style="margin-top:0">Payment</h2>
      ${bank.bank_name ? `<div class="muted">Bank: <b>${escapeHtml(bank.bank_name)}</b></div>` : ""}
      ${bank.bank_account_name ? `<div class="muted">Account Name: <b>${escapeHtml(bank.bank_account_name)}</b></div>` : ""}
      ${bank.bank_account_number ? `<div class="muted">Account #: <b>${escapeHtml(bank.bank_account_number)}</b></div>` : ""}
      ${bank.bank_branch_code ? `<div class="muted">Branch: <b>${escapeHtml(bank.bank_branch_code)}</b></div>` : ""}
      <div class="muted" style="margin-top:6px">Reference: <b>${escapeHtml(inv.invoice_number)}</b></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>
          <div style="font-weight:600">${escapeHtml(inv.plan_name)}</div>
          <div class="muted">Subscription — ${fmtDate(inv.period_start)} → ${fmtDate(inv.period_end)}</div>
        </td>
        <td class="right">${inv.member_count}</td>
        <td class="right">${money(Number(inv.price_per_member))}</td>
        <td class="right">${money(Number(inv.subtotal))}</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="right">${money(Number(inv.subtotal))}</td></tr>
    <tr><td>VAT</td><td class="right">${money(Number(inv.vat_amount))}</td></tr>
    <tr class="total-row"><td>Total Due</td><td class="right">${money(Number(inv.total))}</td></tr>
    ${inv.paid_at ? `<tr><td class="muted">Paid</td><td class="right muted">${fmtDate(inv.paid_at)}</td></tr>` : ""}
  </table>

  <p class="muted" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px">
    Thank you. Please use invoice number <b>${escapeHtml(inv.invoice_number)}</b> as your EFT reference,
    or pay online via Stitch from the Subscription tab.
  </p>
</body></html>`;
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}
