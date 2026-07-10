import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { useClubCurrency } from "@/hooks/use-currency";

interface AccountMeta {
  label: string;
  category: "Income" | "Expense" | "Asset" | "Liability";
  normal: "Dr" | "Cr";
}

interface Props {
  clubId: string;
  clubName?: string;
  accounts: Record<string, AccountMeta>;
}

type Preset = "this_month" | "last_month" | "qtd" | "ytd" | "last_12" | "custom";

export function IncomeStatementTab({ clubId, clubName, accounts }: Props) {
  const [preset, setPreset] = useState<Preset>("ytd");
  const today = new Date();
  const [from, setFrom] = useState<string>(format(startOfYear(today), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(today, "yyyy-MM-dd"));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    switch (p) {
      case "this_month":
        setFrom(format(startOfMonth(now), "yyyy-MM-dd"));
        setTo(format(endOfMonth(now), "yyyy-MM-dd"));
        break;
      case "last_month": {
        const lm = subMonths(now, 1);
        setFrom(format(startOfMonth(lm), "yyyy-MM-dd"));
        setTo(format(endOfMonth(lm), "yyyy-MM-dd"));
        break;
      }
      case "qtd":
        setFrom(format(startOfQuarter(now), "yyyy-MM-dd"));
        setTo(format(endOfQuarter(now), "yyyy-MM-dd"));
        break;
      case "ytd":
        setFrom(format(startOfYear(now), "yyyy-MM-dd"));
        setTo(format(now, "yyyy-MM-dd"));
        break;
      case "last_12":
        setFrom(format(subMonths(now, 12), "yyyy-MM-dd"));
        setTo(format(now, "yyyy-MM-dd"));
        break;
      case "custom":
        break;
    }
  };

  const { data: entries, isLoading } = useQuery({
    queryKey: ["income-statement", clubId, from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59.999").toISOString();
      const { data, error } = await fromExt("club_journal_entries")
        .select("account, debit, credit, created_at")
        .eq("club_id", clubId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId && !!from && !!to,
  });

  const { incomeRows, expenseRows, totalIncome, totalExpense, netProfit } = useMemo(() => {
    const tally: Record<string, { debit: number; credit: number }> = {};
    for (const e of (entries || []) as any[]) {
      if (!tally[e.account]) tally[e.account] = { debit: 0, credit: 0 };
      tally[e.account].debit += Number(e.debit || 0);
      tally[e.account].credit += Number(e.credit || 0);
    }
    const incomeRows: { account: string; label: string; amount: number }[] = [];
    const expenseRows: { account: string; label: string; amount: number }[] = [];
    for (const [account, meta] of Object.entries(accounts)) {
      // Income statement only shows Income & Expense accounts (P&L).
      // Skip balance sheet accounts (Assets like Bank/Debtors, Liabilities like Creditors).
      if (meta.category !== "Income" && meta.category !== "Expense") continue;
      const t = tally[account] || { debit: 0, credit: 0 };
      // Income: credit - debit. Expense: debit - credit.
      const amt = meta.category === "Income" ? t.credit - t.debit : t.debit - t.credit;
      if (Math.abs(amt) < 0.005) continue;
      const row = { account, label: meta.label, amount: amt };
      if (meta.category === "Income") incomeRows.push(row);
      else expenseRows.push(row);
    }
    incomeRows.sort((a, b) => b.amount - a.amount);
    expenseRows.sort((a, b) => b.amount - a.amount);
    const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
    return { incomeRows, expenseRows, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
  }, [entries, accounts]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push(`Income Statement`);
    if (clubName) lines.push(`Club,${clubName}`);
    lines.push(`Period,${from} to ${to}`);
    lines.push("");
    lines.push("INCOME");
    lines.push("Account,Amount (R)");
    incomeRows.forEach(r => lines.push(`"${r.label}",${r.amount.toFixed(2)}`));
    lines.push(`Total Income,${totalIncome.toFixed(2)}`);
    lines.push("");
    lines.push("EXPENSES");
    lines.push("Account,Amount (R)");
    expenseRows.forEach(r => lines.push(`"${r.label}",${r.amount.toFixed(2)}`));
    lines.push(`Total Expenses,${totalExpense.toFixed(2)}`);
    lines.push("");
    lines.push(`Net Profit / (Loss),${netProfit.toFixed(2)}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `income-statement_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPdf = () => window.print();

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Income Statement</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onValueChange={v => applyPreset(v as Preset)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="qtd">Quarter to Date</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_12">Last 12 Months</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset("custom"); }} className="h-8 text-xs w-[140px]" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset("custom"); }} className="h-8 text-xs w-[140px]" />
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5 h-8">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={printPdf} className="gap-1.5 h-8">
            <FileText className="w-3.5 h-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="text-center space-y-0.5 hidden print:block">
        <h2 className="text-lg font-bold">{clubName || "Club"}</h2>
        <p className="text-sm font-semibold">Income Statement</p>
        <p className="text-xs text-muted-foreground">For the period {format(new Date(from), "dd MMM yyyy")} to {format(new Date(to), "dd MMM yyyy")}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* INCOME */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-green-600/10 border-b flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Income</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount (R)</span>
            </div>
            {incomeRows.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No income in this period.</p>
            ) : (
              incomeRows.map(r => (
                <div key={r.account} className="grid grid-cols-[1fr_140px] px-3 py-2 text-xs items-center border-b last:border-b-0">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-right tabular-nums text-green-600 font-medium">R{r.amount.toFixed(2)}</span>
                </div>
              ))
            )}
            <div className="grid grid-cols-[1fr_140px] px-3 py-2.5 text-sm items-center bg-muted/40 font-bold border-t-2">
              <span>Total Income</span>
              <span className="text-right tabular-nums text-green-700">R{totalIncome.toFixed(2)}</span>
            </div>
          </div>

          {/* EXPENSES */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-destructive/10 border-b flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-destructive">Expenses</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount (R)</span>
            </div>
            {expenseRows.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No expenses in this period.</p>
            ) : (
              expenseRows.map(r => (
                <div key={r.account} className="grid grid-cols-[1fr_140px] px-3 py-2 text-xs items-center border-b last:border-b-0">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-right tabular-nums text-destructive font-medium">R{r.amount.toFixed(2)}</span>
                </div>
              ))
            )}
            <div className="grid grid-cols-[1fr_140px] px-3 py-2.5 text-sm items-center bg-muted/40 font-bold border-t-2">
              <span>Total Expenses</span>
              <span className="text-right tabular-nums text-destructive">R{totalExpense.toFixed(2)}</span>
            </div>
          </div>

          {/* NET PROFIT */}
          <div className={cn(
            "border-2 rounded-lg p-4 flex items-center justify-between",
            netProfit >= 0 ? "border-green-600 bg-green-600/5" : "border-destructive bg-destructive/5"
          )}>
            <span className="text-sm font-bold uppercase tracking-wider">
              Net {netProfit >= 0 ? "Profit" : "Loss"}
            </span>
            <span className={cn(
              "text-2xl font-bold tabular-nums",
              netProfit >= 0 ? "text-green-600" : "text-destructive"
            )}>
              R{Math.abs(netProfit).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
