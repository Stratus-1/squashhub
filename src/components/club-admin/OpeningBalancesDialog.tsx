import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useClubGLAccounts } from "@/hooks/use-club-gl-accounts";
import { openingBalanceAccounts, openingBalanceValues, openingBalanceRows, OB_PREFIX, OB_BALANCING_DESC } from "@/lib/opening-balances";

interface AccountMeta {
  label: string;
  type: "BS" | "IS";
  category: "Asset" | "Liability" | "Income" | "Expense";
  normal: "Dr" | "Cr";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  accounts: Record<string, AccountMeta>;
}

export function OpeningBalancesDialog({ open, onOpenChange, clubId, accounts }: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const { data: customAccounts, isLoading: accountsLoading, error: accountsError } = useClubGLAccounts(clubId);
  const accountList = useMemo(() => openingBalanceAccounts(accounts, customAccounts ?? [], clubId), [accounts, customAccounts, clubId]);

  // Pull existing opening-balance entries (so admin can edit, not double-post)
  const { data: existing, refetch, isLoading: balancesLoading, error: balancesError } = useQuery({
    queryKey: ["club-opening-balances", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_journal_entries")
        .select("account, custom_account_id, debit, credit, description, created_at")
        .eq("club_id", clubId)
        .or(`description.ilike.${OB_PREFIX}%,description.eq.${OB_BALANCING_DESC}`);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!clubId,
  });

  // Hydrate the form from existing rows whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    const next = openingBalanceValues(existing || [], accountList);
    let latest: string | null = null;
    for (const row of existing || []) {
      if (row.description === OB_BALANCING_DESC) continue;
      if (!latest || new Date(row.created_at) > new Date(latest)) latest = row.created_at;
    }
    setValues(next);
    if (latest) setDate(format(new Date(latest), "yyyy-MM-dd"));
  }, [open, existing, accountList]);

  // Live balance check (sum of signed values; positive contra goes to OBE)
  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const { code, meta } of accountList) {
      if (code === "opening_balance_equity") continue;
      const v = parseFloat(values[code] || "0");
      if (!v) continue;
      if (meta.normal === "Dr") {
        if (v >= 0) dr += v; else cr += -v;
      } else {
        if (v >= 0) cr += v; else dr += -v;
      }
    }
    return { dr, cr, contra: dr - cr };
  }, [values, accountList]);

  const fmt = (n: number) => `R ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSave = async () => {
    if (!date) { toast.error("Pick an opening date"); return; }
    setSubmitting(true);
    try {
      // Validate/build before replacing entries, and retain each custom account's identity.
      const journal_ref = crypto.randomUUID();
      const created_at = new Date(`${date}T00:00:00`).toISOString();
      const rows = openingBalanceRows(accountList, values, clubId, journal_ref, created_at);
      // 1. Wipe prior opening-balance entries for this club
      const { error: delErr } = await fromExt("club_journal_entries")
        .delete()
        .eq("club_id", clubId)
        .or(`description.ilike.${OB_PREFIX}%,description.eq.${OB_BALANCING_DESC}`);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await fromExt("club_journal_entries").insert(rows);
        if (insErr) throw insErr;
      }

      toast.success(`Saved opening balances (${rows.length} entries)`);
      qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
      qc.invalidateQueries({ queryKey: ["club-opening-balances", clubId] });
      await refetch();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save opening balances");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Opening Balances</DialogTitle>
          <DialogDescription>
            Enter the GL balance for each account as at the opening date. Each value is auto-paired against
            <em> Opening Balance Equity</em> so the books stay balanced. Re-saving replaces the previous opening entries.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">Opening date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-44 text-xs" />
          </div>

          {(accountsError || balancesError) && <p role="alert" className="text-sm text-destructive">Could not load all opening-balance accounts. Close and try again.</p>}
          <ScrollArea className="h-[360px] rounded border">
            <div className="divide-y">
              {(["Asset", "Liability", "Income", "Expense"] as const).map(cat => {
                const list = accountList.filter(a => a.meta.category === cat && a.code !== "opening_balance_equity");
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="p-2">
                    <p className="text-[10px] uppercase font-semibold text-muted-foreground px-1 mb-1">{cat}</p>
                    <div className="grid gap-1">
                      {list.map(({ code, meta }) => (
                        <div key={code} className="grid grid-cols-[1fr_140px] items-center gap-2 px-1 py-0.5">
                          <span className="text-xs truncate">
                            {meta.label}
                            <span className="text-[10px] text-muted-foreground ml-2">({meta.normal})</span>
                          </span>
                          <Input
                            aria-label={`Opening balance for ${meta.label}`}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={values[code] || ""}
                            onChange={(e) => setValues(v => ({ ...v, [code]: e.target.value }))}
                            className="h-7 text-xs text-right tabular-nums"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between text-xs bg-muted/50 px-3 py-2 rounded">
            <div className="flex gap-4">
              <span>Total Dr: <strong className="tabular-nums">{fmt(totals.dr)}</strong></span>
              <span>Total Cr: <strong className="tabular-nums">{fmt(totals.cr)}</strong></span>
            </div>
            <div className={cn("text-muted-foreground", totals.contra !== 0 && "text-foreground")}>
              Opening Equity contra: <strong className="tabular-nums">{fmt(Math.abs(totals.contra))}</strong>
              {totals.contra !== 0 && <span className="ml-1">({totals.contra > 0 ? "Cr" : "Dr"})</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting || accountsLoading || balancesLoading || !!accountsError || !!balancesError}>
            {submitting ? "Saving..." : "Save Opening Balances"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
