import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Wrench, Search } from "lucide-react";
import { toast } from "sonner";

interface Row {
  club_id: string;
  club_member_id: string | null;
  invoice_number: string;
  fee_payment_id: string | null;
  gl_amount: number;
  sub_amount: number;
  status: "missing_in_gl" | "missing_in_sub_ledger" | "amount_mismatch" | "ok";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n || 0);

const STATUS_LABEL: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  missing_in_gl: { label: "Missing in GL", variant: "destructive" },
  missing_in_sub_ledger: { label: "Missing in member a/c", variant: "destructive" },
  amount_mismatch: { label: "Amount mismatch", variant: "secondary" },
};

export function LedgerReconciliationDialog({
  clubId,
  open,
  onOpenChange,
}: {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [fixingId, setFixingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["ledger-reconciliation", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("v_ledger_reconciliation" as any)
        .select("*")
        .eq("club_id", clubId)
        .neq("status", "ok");
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: open && !!clubId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["recon-member-names", clubId],
    queryFn: async () => {
      const { data } = await fromExt("club_members").select("id, name").eq("club_id", clubId);
      return data || [];
    },
    enabled: open && !!clubId,
  });
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    (members as any[]).forEach((x) => m.set(x.id, x.name || ""));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoice_number?.toLowerCase().includes(q) ||
        (nameOf.get(r.club_member_id || "") || "").toLowerCase().includes(q),
    );
  }, [rows, search, nameOf]);

  const handleFix = async (r: Row) => {
    if (!r.fee_payment_id) {
      toast.error("Cannot auto-fix — no linked fee invoice");
      return;
    }
    setFixingId(r.fee_payment_id);
    try {
      const { data, error } = await supabase.rpc("issue_member_invoice" as any, {
        _fee_payment_id: r.fee_payment_id,
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error);
      toast.success("Re-posted to both ledgers");
      await refetch();
      qc.invalidateQueries({ queryKey: ["journal"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to reconcile");
    } finally {
      setFixingId(null);
    }
  };

  const [fixingAll, setFixingAll] = useState(false);
  const handleFixAll = async () => {
    setFixingAll(true);
    let ok = 0, fail = 0;
    for (const r of filtered) {
      if (!r.fee_payment_id) { fail++; continue; }
      try {
        const { data, error } = await supabase.rpc("issue_member_invoice" as any, { _fee_payment_id: r.fee_payment_id });
        if (error || (data as any)?.ok === false) fail++; else ok++;
      } catch { fail++; }
    }
    setFixingAll(false);
    toast.success(`Re-posted ${ok}${fail ? `, ${fail} failed` : ""}`);
    await refetch();
    qc.invalidateQueries({ queryKey: ["journal"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Ledger Reconciliation
          </DialogTitle>
          <DialogDescription>
            Invoices where the member sub-ledger and the General Ledger don't match. Re-post to fix.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or member"
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5 h-9">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleFixAll}
            disabled={fixingAll || filtered.length === 0}
            className="gap-1.5 h-9"
          >
            {fixingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
            Fix all ({filtered.length})
          </Button>
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border rounded-lg">
              ✅ All invoice charges reconcile cleanly between the member sub-ledger and the GL.
            </div>
          ) : (
            filtered.map((r, i) => {
              const meta = STATUS_LABEL[r.status];
              const key = `${r.invoice_number}-${i}`;
              return (
                <div key={key} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{nameOf.get(r.club_member_id || "") || "—"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">{r.invoice_number}</div>
                    </div>
                    <Badge variant={meta?.variant || "outline"} className="text-[10px] shrink-0">
                      {meta?.label || r.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex gap-3">
                      <span><span className="text-muted-foreground">GL:</span> <span className="tabular-nums font-medium">{fmt(r.gl_amount)}</span></span>
                      <span><span className="text-muted-foreground">Member:</span> <span className="tabular-nums font-medium">{fmt(r.sub_amount)}</span></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!r.fee_payment_id || fixingId === r.fee_payment_id || fixingAll}
                      onClick={() => handleFix(r)}
                      className="h-8 text-xs gap-1"
                    >
                      {fixingId === r.fee_payment_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wrench className="w-3 h-3" />
                      )}
                      Re-post
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
