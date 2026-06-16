import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoicePreviewDialog({ invoiceId, onClose }: Props) {
  const open = !!invoiceId;

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-preview", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from("club_member_fee_payments")
        .select(`
          id, fee_label, amount, paid, season_year,
          invoice_number, invoice_due_date, invoice_send_date,
          invoice_issued_at, invoice_email_sent_at,
          club_members!inner (
            id, name, email, club_id,
            clubs:club_id ( name, logo_url, address, email, phone )
          )
        `)
        .eq("id", invoiceId!)
        .maybeSingle();
      if (error) throw error;

      const clubId = (inv as any)?.club_members?.club_id;
      let secrets: any = {};
      if (clubId) {
        const { data: s } = await supabase
          .from("club_secrets")
          .select("bank_name, bank_account_name, bank_account_number, bank_branch_code, bank_reference")
          .eq("club_id", clubId)
          .maybeSingle();
        secrets = s || {};
      }
      return { inv: inv as any, secrets };
    },
  });

  const fmtAmt = (n: number) => `R ${Number(n || 0).toFixed(2)}`;
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const handlePrint = () => {
    const node = document.getElementById("invoice-print-area");
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(`<html><head><title>${data?.inv?.invoice_number || "Invoice"}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
      th{background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      .right{text-align:right}.muted{color:#666;font-size:12px}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px}
      .row{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
      .box{background:#f9f9f9;padding:12px;border-radius:6px;font-size:12px;line-height:1.6}
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
  };

  const inv = data?.inv;
  const cm = inv?.club_members;
  const club = cm?.clubs;
  const secrets = data?.secrets || {};

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        {isLoading || !inv ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div id="invoice-print-area" className="bg-background border rounded-md p-6 text-sm">
            <div className="row flex justify-between items-start gap-6 border-b pb-4">
              <div className="flex items-center gap-3">
                {club?.logo_url && <img src={club.logo_url} alt={club.name} className="h-14 w-14 object-contain" />}
                <div>
                  <h1 className="text-xl font-bold">{club?.name}</h1>
                  {club?.address && <p className="muted text-xs text-muted-foreground">{club.address}</p>}
                  {club?.email && <p className="muted text-xs text-muted-foreground">{club.email}</p>}
                  {club?.phone && <p className="muted text-xs text-muted-foreground">{club.phone}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice</p>
                <p className="font-mono font-semibold">{inv.invoice_number}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Issue date</p>
                <p className="text-xs">{fmtDate(inv.invoice_send_date)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Due date</p>
                <p className="text-xs font-semibold">{fmtDate(inv.invoice_due_date)}</p>
              </div>
            </div>

            <div className="row flex justify-between gap-6 mt-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Billed to</p>
                <p className="font-semibold">{cm?.name}</p>
                {cm?.email && <p className="text-xs text-muted-foreground">{cm.email}</p>}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Season</p>
                <p className="text-xs">{inv.season_year}</p>
              </div>
            </div>

            <table className="w-full mt-6">
              <thead>
                <tr>
                  <th className="text-left">Description</th>
                  <th className="right text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{inv.fee_label}</td>
                  <td className="right text-right font-mono">{fmtAmt(inv.amount)}</td>
                </tr>
                <tr>
                  <td className="text-right font-semibold">Total due</td>
                  <td className="right text-right font-mono font-bold">{fmtAmt(inv.amount)}</td>
                </tr>
              </tbody>
            </table>

            {(secrets.bank_name || secrets.bank_account_number) && (
              <>
                <h2 className="text-sm font-semibold mt-6 mb-2">Banking details</h2>
                <div className="box bg-muted/40 rounded p-3 text-xs space-y-1">
                  {secrets.bank_name && <div><span className="text-muted-foreground">Bank:</span> {secrets.bank_name}</div>}
                  {secrets.bank_account_name && <div><span className="text-muted-foreground">Account name:</span> {secrets.bank_account_name}</div>}
                  {secrets.bank_account_number && <div><span className="text-muted-foreground">Account no:</span> <span className="font-mono">{secrets.bank_account_number}</span></div>}
                  {secrets.bank_branch_code && <div><span className="text-muted-foreground">Branch code:</span> <span className="font-mono">{secrets.bank_branch_code}</span></div>}
                  <div><span className="text-muted-foreground">Reference:</span> <span className="font-mono font-semibold">{secrets.bank_reference || inv.invoice_number}</span></div>
                </div>
              </>
            )}

            <p className="muted text-[11px] text-muted-foreground mt-6 text-center">
              Thank you for being part of {club?.name}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} disabled={!inv} className="gap-1.5">
            <Printer className="w-4 h-4" /> Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
