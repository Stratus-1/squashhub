import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, Printer } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import { thisFinancialYear, previousFinancialYear, financialYearStart } from "@/lib/finance/financial-year";
import { buildBalanceSheet, type BSLine, type BSAccountMeta } from "@/lib/finance/balance-sheet";

interface Props {
  clubName?: string;
  endMonth: number;
  lines: BSLine[];
  accounts: Record<string, BSAccountMeta>;
  customAccounts: { id: string; name: string; category: string }[];
}

type Preset = "this_fy" | "prev_fy" | "custom";

export function BalanceSheetTab({ clubName, endMonth, lines, accounts, customAccounts }: Props) {
  const { format: money } = useClubCurrency();
  const [preset, setPreset] = useState<Preset>("this_fy");
  const [asAt, setAsAt] = useState(thisFinancialYear(endMonth).to);

  const apply = (p: Preset) => {
    setPreset(p);
    if (p === "this_fy") setAsAt(thisFinancialYear(endMonth).to);
    if (p === "prev_fy") setAsAt(previousFinancialYear(endMonth).to);
  };

  const bs = useMemo(() => {
    const d = new Date(asAt + "T12:00:00");
    const fy = financialYearStart(endMonth, d);
    const fyStart = `${fy.year}-${String(fy.month).padStart(2, "0")}-01`;
    const toIso = (s: string) => new Date(s + "T00:00:00+02:00").toISOString();
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const norm = lines.map(l => ({ ...l, created_at: new Date(l.created_at).toISOString() }));
    return buildBalanceSheet(norm, (l) => {
      if (l.custom_account_id) {
        const c = customAccounts.find(a => a.id === l.custom_account_id);
        return c ? { key: `custom:${c.id}`, meta: { label: c.name, category: c.category as any } } : null;
      }
      const m = accounts[l.account];
      return m ? { key: l.account, meta: m } : null;
    }, toIso(nextStr), toIso(fyStart));
  }, [asAt, endMonth, lines, accounts, customAccounts]);

  const Section = ({ title, rows, total }: { title: string; rows: { key: string; label: string; amount: number }[]; total: number }) => (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/60 border-b text-xs font-semibold">{title}</div>
      {rows.map(r => (
        <div key={r.key} className="flex justify-between px-3 py-1.5 text-xs border-b last:border-b-0">
          <span>{r.label}</span><span className="tabular-nums">{money(r.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between px-3 py-2 text-xs font-bold bg-muted/30 border-t">
        <span>Total {title.toLowerCase()}</span><span className="tabular-nums">{money(total)}</span>
      </div>
    </div>
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm mr-auto">Balance Sheet{clubName ? ` — ${clubName}` : ""}</h3>
        <Select value={preset} onValueChange={v => apply(v as Preset)}>
          <SelectTrigger className="w-[190px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_fy">This financial year (to today)</SelectItem>
            <SelectItem value="prev_fy">Previous financial year end</SelectItem>
            <SelectItem value="custom">Custom date</SelectItem>
          </SelectContent>
        </Select>
        <Label className="text-[10px] text-muted-foreground">As at</Label>
        <Input type="date" value={asAt} onChange={e => { setAsAt(e.target.value); setPreset("custom"); }} className="h-8 text-xs w-[140px]" />
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Button>
      </div>
      <Section title="Assets" rows={bs.assets} total={bs.totalAssets} />
      <Section title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} />
      <Section title="Equity" rows={bs.equity} total={bs.totalEquity} />
      <div className="flex justify-between px-3 py-2 text-xs font-bold border rounded-lg">
        <span>Total liabilities and equity</span>
        <span className="tabular-nums">{money(bs.totalLiabilities + bs.totalEquity)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {bs.balanced ? "✅ Balance sheet balances" : "⚠️ Assets do not equal liabilities and equity — check the trial balance"}
      </p>
    </Card>
  );
}
