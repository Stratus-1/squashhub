import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, ChevronRight, ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { useClubCurrency } from "@/hooks/use-currency";
import { supabase } from "@/integrations/supabase/client";

import { type TradingCostBasis, type SaleCostSummary, type StockPurchaseReference } from "@/lib/finance/division-margin";

import { groupedIncome, DEFAULT_INCOME_STATEMENT_BASIS } from "@/lib/finance/grouped-income";
import { useClubGLAccounts } from "@/hooks/use-club-gl-accounts";

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
  const { data: customAccounts = [], isLoading: accountsLoading, isError: accountsError } = useClubGLAccounts(clubId);
  const [preset, setPreset] = useState<Preset>("ytd");
  const [basis, setBasis] = useState<TradingCostBasis>(DEFAULT_INCOME_STATEMENT_BASIS);
  const [expandedSalaries, setExpandedSalaries] = useState(false);
  const { format: money, symbol: currencySymbol, code: currencyCode } = useClubCurrency();
  const today = new Date();
  const [from, setFrom] = useState<string>(format(startOfYear(today), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(today, "yyyy-MM-dd"));
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set());
  const toggleTip = (key: string) => setExpandedTips(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

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

  const { data: entries, isLoading, isError: ledgerError } = useQuery({
    queryKey: ["income-statement", clubId, from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00+02:00").toISOString();
      const toIso = new Date(to + "T23:59:59.999+02:00").toISOString();
      const allEntries: { account: string; debit: number; credit: number; created_at: string; journal_ref: string; description: string | null; custom_account_id: string | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
      const { data, error } = await fromExt("club_journal_entries")
        .select("account, debit, credit, created_at, journal_ref, description, custom_account_id")
        .eq("club_id", clubId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso).order("id").range(offset, offset + 999);
      if (error) throw error;
      allEntries.push(...(data || []));
      if ((data || []).length < 1000) break;
      }
      return allEntries;
    },
    enabled: !!clubId && !!from && !!to,
  });

  const { data: stockPurchases = [], isLoading: purchasesLoading, isError: purchasesError } = useQuery({
    queryKey: ["income-statement-stock-purchases", clubId],
    enabled: Boolean(clubId),
    queryFn: async (): Promise<StockPurchaseReference[]> => {
      const rows: StockPurchaseReference[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("bar_stock_purchases")
          .select("id, bar_items!bar_stock_purchases_bar_item_id_fkey(division)")
          .eq("club_id", clubId).order("id").range(offset, offset + 999);
        if (error) throw error;
        for (const row of data ?? []) rows.push({ id: row.id, division: row.bar_items?.division ?? "bar" });
        if ((data ?? []).length < 1000) break;
      }
      return rows;
    },
  });

  const { data: hasShop = false } = useQuery({
    queryKey: ["income-statement-shop", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_items").select("id").eq("club_id", clubId).eq("division", "shop").limit(1);
      if (error) throw error;
      return Boolean(data?.length);
    }, enabled: !!clubId,
  });
  const { data: saleCosts = [], isLoading: costsLoading, isError: costsError } = useQuery({
    queryKey: ["income-statement-sale-costs", clubId, from, to],
    enabled: Boolean(clubId && from && to && basis === "cost_of_sales"),
    queryFn: async (): Promise<SaleCostSummary[]> => {
      const end = new Date(to + "T00:00:00+02:00");
      end.setUTCDate(end.getUTCDate() + 1);
      const { data, error } = await supabase.rpc("income_statement_sale_costs", {
        _club: clubId, _from: new Date(from + "T00:00:00+02:00").toISOString(), _to: end.toISOString(),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const report = groupedIncome(entries || [], accounts, hasShop, basis, saleCosts, stockPurchases, customAccounts);
  const margins = report.divisions;
  const { netProfit } = report;
  const missingCosts = basis === "cost_of_sales" ? margins.reduce((sum, row) => sum + row.uncostedLines, 0) : 0;
  const reportLoading = accountsLoading || isLoading || purchasesLoading || (basis === "cost_of_sales" && costsLoading);
  const reportError = accountsError || ledgerError || purchasesError || (basis === "cost_of_sales" && costsError);
  const basisLabel = basis === "purchases" ? "Purchases" : "Cost of sales";

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push(`Income Statement`);
    if (clubName) lines.push(`Club,${clubName}`);
    lines.push(`Period,${from} to ${to}`);
    lines.push(`Trading-cost basis,${basisLabel}`);
    if (missingCosts) lines.push(`Provisional costs,${missingCosts} sale lines have no recorded cost`);
    lines.push("");
    const csvRow = (label: string, amount: number) => lines.push(`"${label.replace(/"/g, '""')}",${amount.toFixed(2)}`);
    lines.push(`Item,Amount (${currencyCode})`, "PRIMARY INCOME");
    report.primary.forEach(row => csvRow(row.label, row.amount));
    csvRow("Primary gross income", report.primaryTotal);
    for (const row of margins) {
      lines.push("", row.division === "shop" ? "SHOP" : "BAR");
      csvRow("Sales", row.sales);
      row.tipIncome.forEach(tip => csvRow(tip.label, tip.amount));
      csvRow(`Less: ${basis === "purchases" ? "Stock purchases" : "Cost of sales — Items"}`, -row.tradingCost);
      row.allocated.forEach(cost => csvRow(`Less: ${cost.label}`, -cost.amount));
      csvRow("Gross profit / (loss)", row.profit);
    }
    lines.push("");
    csvRow("Total gross income", report.grossIncome);
    lines.push("", "GENERAL EXPENSES");
    report.expenses.forEach(row => csvRow(row.label, row.amount));
    csvRow("Total general expenses", report.generalExpenses);
    csvRow("Net profit / (loss)", netProfit);
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
          <Select value={basis} onValueChange={value => setBasis(value as TradingCostBasis)}>
            <SelectTrigger aria-label="Trading-cost basis" className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="purchases">Purchases basis</SelectItem>
              <SelectItem value="cost_of_sales">Cost of sales basis</SelectItem>
            </SelectContent>
          </Select>
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
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={reportLoading || reportError} className="gap-1.5 h-8">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={printPdf} disabled={reportLoading || reportError} className="gap-1.5 h-8">
            <FileText className="w-3.5 h-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="text-center space-y-0.5 hidden print:block">
        <h2 className="text-lg font-bold">{clubName || "Club"}</h2>
        <p className="text-sm font-semibold">Income Statement</p>
        <p className="text-xs text-muted-foreground">For the period {format(new Date(from), "dd MMM yyyy")} to {format(new Date(to), "dd MMM yyyy")}</p>
        <p className="text-xs text-muted-foreground">{basisLabel} basis</p>
      </div>

      {reportError ? <p role="alert" className="text-sm text-destructive">Could not load the statement. Please try again.</p> : reportLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {missingCosts > 0 && <p role="status" className="text-xs text-destructive">Provisional: {missingCosts} sale lines have no average cost and no cost price. Enter a cost price on those items (Bar → Items, marked “Enter a cost price”). Gross profit may be overstated.</p>}
          <section className="border rounded-lg overflow-hidden" aria-label="Primary income">
            <h4 className="px-3 py-2 bg-muted border-b text-xs font-bold">Primary income</h4>
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Amount ({currencySymbol})</th></tr></thead>
              <tbody>
                {report.primary.map(row => <tr key={row.label} className="border-b"><td className="px-3 py-2">{row.label}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(row.amount)}</td></tr>)}
                <tr className="bg-muted/40 font-bold"><th className="px-3 py-2 text-left">Primary gross income</th><td className="px-3 py-2 text-right tabular-nums">{money(report.primaryTotal)}</td></tr>
              </tbody>
            </table>
          </section>
          {margins.map(row => <section key={row.division} className="border rounded-lg overflow-hidden" aria-label={row.division === "shop" ? "Shop gross profit" : "Bar gross profit"}>
            <h4 className="px-3 py-2 bg-muted border-b text-xs font-bold">{row.division === "shop" ? "Shop" : "Bar"}</h4>
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Amount ({currencySymbol})</th></tr></thead>
              <tbody>
                <tr className="border-b"><td className="px-3 py-2">Sales</td><td className="px-3 py-2 text-right tabular-nums">{money(row.sales)}</td></tr>
                {row.tipIncome.map(tip => {
                  const key = `${row.division}:${tip.label}`;
                  const open = expandedTips.has(key);
                  return (
                    <Fragment key={tip.label}>
                      <tr className="border-b">
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => toggleTip(key)} aria-expanded={open} className="inline-flex items-center gap-1 hover:text-primary">
                            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {tip.label}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(tip.amount)}</td>
                      </tr>
                      {open && (<>
                        <tr className="border-b bg-muted/20 text-muted-foreground"><td className="px-3 py-1.5 pl-8">Received</td><td className="px-3 py-1.5 text-right tabular-nums">{money(tip.received)}</td></tr>
                        <tr className="border-b bg-muted/20 text-muted-foreground"><td className="px-3 py-1.5 pl-8">Paid out</td><td className="px-3 py-1.5 text-right tabular-nums">{money(-tip.paid)}</td></tr>
                        <tr className="border-b bg-muted/20 font-semibold"><td className="px-3 py-1.5 pl-8">Outstanding</td><td className="px-3 py-1.5 text-right tabular-nums">{money(tip.amount)}</td></tr>
                      </>)}
                    </Fragment>
                  );
                })}
                <tr className="border-b"><td className="px-3 py-2">Less: {basis === "purchases" ? "Stock purchases" : "Cost of sales — Items"}</td><td className="px-3 py-2 text-right tabular-nums">{money(-row.tradingCost)}</td></tr>
                {row.allocated.map(cost => <tr key={cost.label} className="border-b"><td className="px-3 py-2 break-words">Less: {cost.label}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(-cost.amount)}</td></tr>)}
                <tr className="bg-muted/40 font-bold"><th className="px-3 py-2 text-left">Gross profit / (loss){row.margin === null ? "" : ` · ${row.margin.toFixed(1)}%`}</th><td className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap", row.profit < 0 && "text-destructive")}>{money(row.profit)}</td></tr>
              </tbody>
            </table>
          </section>)}
          <div className="flex items-center justify-between gap-3 border-y py-3 font-bold text-sm"><span>Total gross income</span><span className="tabular-nums whitespace-nowrap">{money(report.grossIncome)}</span></div>
          <section className="border rounded-lg overflow-hidden" aria-label="General expenses">
            <h4 className="px-3 py-2 bg-muted border-b text-xs font-bold">General expenses</h4>
            <table className="w-full text-xs">
              <thead><tr className="border-b"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Amount ({currencySymbol})</th></tr></thead>
              <tbody>
                {report.expenses.map(row => <Fragment key={row.label}>
                  <tr className="border-b"><td className="px-3 py-2">
                    {row.label === "Salaries & Wages" ? <Button type="button" variant="ghost" size="sm" className="h-auto p-0 gap-1 text-xs" aria-expanded={expandedSalaries} onClick={() => setExpandedSalaries(value => !value)}>
                      {expandedSalaries ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{row.label}
                    </Button> : row.label}
                  </td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(row.amount)}</td></tr>
                  {row.label === "Salaries & Wages" && expandedSalaries && report.salaryDetails.map(detail => <tr key={detail.label} className="border-b bg-muted/20 text-muted-foreground"><td className="px-3 py-1.5 pl-8 break-words">{detail.label}</td><td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{money(detail.amount)}</td></tr>)}
                </Fragment>)}
                <tr className="bg-muted/40 font-bold"><th className="px-3 py-2 text-left">Total general expenses</th><td className="px-3 py-2 text-right tabular-nums">{money(report.generalExpenses)}</td></tr>
              </tbody>
            </table>
          </section>

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
              {money(Math.abs(netProfit))}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
