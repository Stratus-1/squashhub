import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableAccountPicker } from "@/components/club-admin/finance/SearchableAccountPicker";
import { INVOICE_OTHER_ACCOUNTS, otherLineAmount, type OtherLineInput } from "@/lib/bar/invoice-other-lines";
import type { ClubGLAccount } from "@/hooks/use-club-gl-accounts";

export const EMPTY_OTHER_LINE: OtherLineInput = { description: "", account: "", amount: "" };

/** Non-stock items on the same supplier invoice (cleaning materials etc.), posted to a chosen expense account. */
export function PurchaseOtherLines({ lines, onChange, customAccounts, money, disabled }: {
  lines: OtherLineInput[];
  onChange: (lines: OtherLineInput[]) => void;
  customAccounts: ClubGLAccount[];
  money: (n: number) => string;
  disabled?: boolean;
}) {
  const update = (idx: number, patch: Partial<OtherLineInput>) => onChange(lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const clubExpense = customAccounts.filter(a => a.is_active && a.category === "Expense" && !a.reporting_category);
  const groups = [
    { heading: "Expense accounts", options: INVOICE_OTHER_ACCOUNTS },
    { heading: "Club accounts", options: clubExpense.map(a => ({ value: `custom:${a.id}`, label: a.name })) },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold">Other items on this invoice (not stock)</Label>
          <p className="text-[11px] text-muted-foreground">E.g. cleaning materials. Recorded as an expense and paid the same way as this invoice.</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-6 text-xs shrink-0" disabled={disabled}
          onClick={() => onChange([...lines, { ...EMPTY_OTHER_LINE }])}>
          <Plus className="w-3 h-3 mr-1" />Add other item
        </Button>
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="rounded-md border p-2 space-y-2">
          <div className="flex gap-2">
            <Input className="h-8 text-xs flex-1" placeholder="Description, e.g. Cleaning materials" maxLength={120}
              aria-label="Other item description" value={line.description} disabled={disabled}
              onChange={e => update(idx, { description: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Remove other item" disabled={disabled}
              onClick={() => onChange(lines.filter((_, i) => i !== idx))}>
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2">
            <SearchableAccountPicker value={line.account} onChange={v => update(idx, { account: v })} groups={groups} placeholder="Choose expense account..." />
            <Input type="number" min={0} step={0.01} className="h-9 text-xs" placeholder="Amount (R)" aria-label="Other item amount"
              value={line.amount} disabled={disabled} onChange={e => update(idx, { amount: e.target.value })} />
          </div>
          {otherLineAmount(line) > 0 && <p className="text-[11px] text-muted-foreground text-right">{money(otherLineAmount(line))}</p>}
        </div>
      ))}
    </div>
  );
}
