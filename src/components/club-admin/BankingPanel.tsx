import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Landmark, FileUp, BookOpen, Receipt, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fromExt } from "@/lib/supabase-ext";
import { cn } from "@/lib/utils";

export interface MoneyAccount {
  account: string;
  label: string;
  balance: number;
  display: string;
}

interface Props {
  clubId: string;
  moneyAccounts: MoneyAccount[];
  money: (n: number) => string;
  onImport: () => void;
  onOpeningBalances: () => void;
  /** Opens the GL ledger filtered to a specific bank/cash account */
  onViewLedger: (account: string) => void;
}

/**
 * Dedicated Banking workspace — bank & cash accounts, statement imports and
 * per-statement transaction reporting, separate from the general GL views.
 */
export function BankingPanel({
  clubId,
  moneyAccounts,
  money,
  onImport,
  onOpeningBalances,
  onViewLedger,
}: Props) {
  const [openStatementId, setOpenStatementId] = useState<string | null>(null);

  const { data: statements, isLoading } = useQuery({
    queryKey: ["club-bank-statements", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_bank_statements")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: txns, isLoading: txnsLoading } = useQuery({
    queryKey: ["club-bank-transactions", openStatementId],
    enabled: !!openStatementId,
    queryFn: async () => {
      const { data, error } = await fromExt("club_bank_transactions")
        .select("*")
        .eq("statement_id", openStatementId!)
        .order("txn_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const openStatement = (statements || []).find((s) => s.id === openStatementId);

  if (openStatement) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpenStatementId(null)} className="gap-1.5 h-8 -ml-2">
            <ArrowLeft className="w-4 h-4" /> All statements
          </Button>
          <div className="text-xs text-muted-foreground">
            {openStatement.file_name} · {openStatement.row_count} lines
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="p-2"><p className="text-[10px] text-muted-foreground">Period</p><p className="text-xs font-semibold">{openStatement.period_start ? format(new Date(openStatement.period_start), "dd MMM yyyy") : "—"} → {openStatement.period_end ? format(new Date(openStatement.period_end), "dd MMM yyyy") : "—"}</p></Card>
          <Card className="p-2"><p className="text-[10px] text-muted-foreground">Opening</p><p className="text-xs font-semibold tabular-nums">{money(Number(openStatement.opening_balance || 0))}</p></Card>
          <Card className="p-2"><p className="text-[10px] text-muted-foreground">Closing</p><p className="text-xs font-semibold tabular-nums">{money(Number(openStatement.closing_balance || 0))}</p></Card>
          <Card className="p-2"><p className="text-[10px] text-muted-foreground">Format</p><p className="text-xs font-semibold uppercase">{openStatement.source_format}</p></Card>
        </div>

        <div className="overflow-hidden border rounded-lg">
          <div className="grid grid-cols-[100px_1fr_110px_90px_90px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Date</span>
            <span>Description</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Balance</span>
          </div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {txnsLoading ? (
              <p className="text-xs text-muted-foreground p-3">Loading…</p>
            ) : (txns || []).length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No transactions on this statement.</p>
            ) : (txns || []).map((t) => (
              <div key={t.id} className="grid grid-cols-[100px_1fr_110px_90px_90px] gap-1 px-3 py-2 text-xs items-center">
                <span className="text-[11px] tabular-nums text-muted-foreground">{format(new Date(t.txn_date), "dd MMM yyyy")}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.description}</p>
                  {t.reference && <p className="text-[10px] text-muted-foreground truncate">{t.reference}</p>}
                </div>
                <Badge variant="outline" className="text-[10px] w-fit capitalize">{t.status || "imported"}</Badge>
                <span className={cn("text-right tabular-nums font-medium", Number(t.amount) >= 0 ? "text-green-600" : "text-destructive")}>
                  {money(Number(t.amount || 0))}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {t.balance != null ? money(Number(t.balance)) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Bank & Cash Accounts</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={onImport} className="gap-1.5 h-8">
              <FileUp className="w-3.5 h-3.5" /> Import Bank Statement
            </Button>
            <Button size="sm" variant="outline" onClick={onOpeningBalances} className="gap-1.5 h-8">
              <BookOpen className="w-3.5 h-3.5" /> Opening Balances
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {moneyAccounts.map((a) => (
            <button
              key={a.account}
              onClick={() => onViewLedger(a.account)}
              className="text-left rounded-lg border bg-card hover:border-primary/50 hover:shadow-sm transition-all p-3"
            >
              <p className="text-xs font-semibold">{a.label}</p>
              <p className={cn("text-lg font-bold tabular-nums", a.balance >= 0 ? "text-green-600" : "text-destructive")}>
                {a.display}
              </p>
              <p className="text-[10px] text-muted-foreground">View ledger transactions</p>
            </button>
          ))}
          {moneyAccounts.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No bank or cash accounts yet.</p>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Imported Statements</h3>
          <Badge variant="outline" className="text-[10px]">{(statements || []).length}</Badge>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (statements || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No statements imported yet. Use <strong>Import Bank Statement</strong> above to upload a CSV, OFX or QIF export.
          </p>
        ) : (
          <div className="overflow-hidden border rounded-lg">
            <div className="grid grid-cols-[1fr_150px_80px_100px_100px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>File</span>
              <span>Period</span>
              <span className="text-right">Lines</span>
              <span className="text-right">Opening</span>
              <span className="text-right">Closing</span>
            </div>
            <div className="divide-y max-h-[420px] overflow-y-auto">
              {(statements || []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOpenStatementId(s.id)}
                  className="w-full grid grid-cols-[1fr_150px_80px_100px_100px] gap-1 px-3 py-2 text-xs items-center text-left hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(s.created_at), "dd MMM yyyy HH:mm")}
                      {s.is_first_statement && " · opening statement"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {s.period_start ? format(new Date(s.period_start), "dd MMM") : "—"} → {s.period_end ? format(new Date(s.period_end), "dd MMM yy") : "—"}
                  </span>
                  <span className="text-right tabular-nums">{s.row_count}</span>
                  <span className="text-right tabular-nums">{money(Number(s.opening_balance || 0))}</span>
                  <span className="text-right tabular-nums font-medium">{money(Number(s.closing_balance || 0))}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
