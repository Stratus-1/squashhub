import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Search, Eye } from "lucide-react";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";

interface Props { clubId: string }

type Filter = "all" | "pending" | "sent" | "paid";

export function RenewalInvoicesTab({ clubId }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["renewal-invoices", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_member_fee_payments")
        .select(`
          id, fee_label, amount, paid, season_year,
          invoice_number, invoice_due_date, invoice_send_date,
          invoice_issued_at, invoice_email_sent_at, invoice_email_status,
          club_members!inner ( id, name, club_id )
        `)
        .eq("fee_type", "renewal")
        .eq("club_members.club_id", clubId)
        .not("invoice_number", "is", null)
        .order("invoice_due_date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_member_renewal_invoices", { p_club_id: clubId });
      if (error) throw error;
      return data as { created: number; updated: number; skipped_paid: number; skipped_sent: number };
    },
    onSuccess: (d) => {
      toast.success(`Invoices: ${d.created} created, ${d.updated} updated, ${d.skipped_paid} paid, ${d.skipped_sent} already sent`);
      qc.invalidateQueries({ queryKey: ["renewal-invoices", clubId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to generate invoices"),
  });

  const sendNow = async (id: string) => {
    setSendingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("send-renewal-invoices", { body: { ids: [id] } });
      if (error) throw error;
      const r = data as any;
      if (r.sent) toast.success("Invoice email sent");
      else if (r.failed) toast.error("Failed to send invoice");
      else toast.message("Nothing to send");
      qc.invalidateQueries({ queryKey: ["renewal-invoices", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally {
      setSendingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (filter === "paid" && !r.paid) return false;
      if (filter === "sent" && !r.invoice_email_sent_at) return false;
      if (filter === "pending" && (r.paid || r.invoice_email_sent_at)) return false;
      if (q) {
        const name = r.club_members?.name?.toLowerCase() || "";
        const inv = r.invoice_number?.toLowerCase() || "";
        const lab = r.fee_label?.toLowerCase() || "";
        if (!name.includes(q) && !inv.includes(q) && !lab.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r: any) => !r.paid && !r.invoice_email_sent_at).length,
    sent: rows.filter((r: any) => r.invoice_email_sent_at && !r.paid).length,
    paid: rows.filter((r: any) => r.paid).length,
  }), [rows]);

  const fmtAmt = (n: number) => `R ${Number(n || 0).toFixed(2)}`;
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Annual Renewals</h3>
          <p className="text-[11px] text-muted-foreground">
            Generate next-cycle membership invoices. Emails are sent automatically the reminder-days before each due date.
          </p>
        </div>
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending} className="gap-1.5 h-8">
          {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Generate / Regenerate Invoices
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatChip label="Total upcoming" value={stats.total} />
        <StatChip label="Pending send" value={stats.pending} />
        <StatChip label="Sent" value={stats.sent} />
        <StatChip label="Paid" value={stats.paid} />
      </div>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1">
            {(["all", "pending", "sent", "paid"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="h-7 text-[11px] capitalize"
                onClick={() => setFilter(f)}>
                {f === "pending" ? "Pending send" : f}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="h-7 text-xs pl-7 w-56" placeholder="Search member / invoice…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No renewal invoices yet. Click <strong>Generate / Regenerate Invoices</strong> to create them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Member</TableHead>
                  <TableHead className="text-[11px]">Item</TableHead>
                  <TableHead className="text-[11px] text-right">Amount</TableHead>
                  <TableHead className="text-[11px]">Invoice #</TableHead>
                  <TableHead className="text-[11px]">Send</TableHead>
                  <TableHead className="text-[11px]">Due</TableHead>
                  <TableHead className="text-[11px]">Status</TableHead>
                  <TableHead className="text-[11px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const status = r.paid ? "Paid" : r.invoice_email_sent_at ? "Sent" : r.invoice_email_status === "failed" ? "Failed" : "Pending";
                  const variant: any = r.paid ? "default" : status === "Sent" ? "secondary" : status === "Failed" ? "destructive" : "outline";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.club_members?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{r.fee_label}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtAmt(r.amount)}</TableCell>
                      <TableCell className="text-xs font-mono">{r.invoice_number}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.invoice_send_date)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.invoice_due_date)}</TableCell>
                      <TableCell><Badge variant={variant} className="text-[10px]">{status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                            onClick={() => setPreviewId(r.id)}>
                            <Eye className="w-3 h-3" /> Preview
                          </Button>
                          {!r.paid && !r.invoice_email_sent_at && (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                              disabled={sendingId === r.id} onClick={() => sendNow(r.id)}>
                              {sendingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Send now
                            </Button>
                          )}
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
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </Card>
  );
}
