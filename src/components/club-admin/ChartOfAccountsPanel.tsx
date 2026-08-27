import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListTree, Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClubGLAccounts, useClubGLAccountMutations, type ClubGLAccount, type GLCategory } from "@/hooks/use-club-gl-accounts";

type AccountMeta = { label: string; type: "BS" | "IS"; category: GLCategory; normal: "Dr" | "Cr" };

const CATEGORIES: GLCategory[] = ["Asset", "Liability", "Income", "Expense"];

const categoryColor: Record<string, string> = {
  Asset: "text-blue-600",
  Liability: "text-amber-600",
  Income: "text-green-600",
  Expense: "text-destructive",
};

interface Props {
  clubId: string;
  accounts: Record<string, AccountMeta>;
  getBalance: (account: string) => number;
  getCustomBalance: (customAccountId: string) => number;
  money: (n: number) => string;
}

export function ChartOfAccountsPanel({ clubId, accounts, getBalance, getCustomBalance, money }: Props) {
  const { data: customAccounts = [], isLoading } = useClubGLAccounts(clubId);
  const mutations = useClubGLAccountMutations(clubId);

  const [editing, setEditing] = useState<null | Partial<ClubGLAccount>>(null);
  const [busy, setBusy] = useState(false);

  const standardKeys = Object.keys(accounts);
  const rollupOptions = (category: GLCategory) =>
    standardKeys.filter((k) => accounts[k].category === category);

  const openNew = () => setEditing({ name: "", category: "Expense", base_account: "general_expense", description: "" });

  const save = async () => {
    if (!editing) return;
    const name = (editing.name || "").trim();
    if (!name) return toast.error("Give the account a name");
    if (!editing.base_account) return toast.error("Pick a standard account it rolls up into");
    setBusy(true);
    try {
      if (editing.id) {
        await mutations.update(editing.id, {
          name,
          category: editing.category as GLCategory,
          base_account: editing.base_account,
          description: editing.description ?? null,
          is_active: editing.is_active !== false,
        });
        toast.success("Account updated");

      } else {
        await mutations.create({
          name,
          category: editing.category as GLCategory,
          base_account: editing.base_account,
          description: editing.description ?? null,
        });
        toast.success("Account added");
      }
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "An account with that name already exists" : e?.message || "Could not save account");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (acc: ClubGLAccount) => {
    if (!confirm(`Delete "${acc.name}"? Existing entries stay in the ledger under ${accounts[acc.base_account]?.label || acc.base_account}.`)) return;
    try {
      await mutations.remove(acc.id);
      toast.success("Account deleted");
    } catch (e: any) {
      toast.error(e?.message || "Could not delete account");
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Chart of Accounts</h3>
        </div>
        <div className="flex items-center gap-2">
          {onOpeningBalances && (
            <Button size="sm" variant="outline" onClick={onOpeningBalances} className="gap-1.5 h-8">
              <BookOpen className="w-3.5 h-3.5" /> Opening Balances
            </Button>
          )}
          <Button size="sm" onClick={openNew} className="gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </Button>
        </div>
      </div>


      {CATEGORIES.map((category) => {
        const std = standardKeys.filter((a) => accounts[a].category === category);
        const custom = customAccounts.filter((a) => a.category === category);
        return (
          <div key={category}>
            <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", categoryColor[category])}>{category}</h4>
            <div className="border rounded-lg overflow-hidden mb-3">
              <div className="grid grid-cols-[1fr_60px_70px_90px_64px] gap-1 px-3 py-1.5 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Account</span>
                <span>Type</span>
                <span>Normal</span>
                <span className="text-right">Balance</span>
                <span />
              </div>

              {std.map((account) => {
                const meta = accounts[account];
                const balance = getBalance(account);
                return (
                  <div key={account} className="grid grid-cols-[1fr_60px_70px_90px_64px] gap-1 px-3 py-2 text-xs items-center border-b last:border-b-0">
                    <span className="font-medium">{meta.label}</span>
                    <Badge variant="outline" className="text-[10px] w-fit">{meta.type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{meta.normal}</span>
                    <span className={cn("text-right tabular-nums font-medium",
                      balance > 0 ? (meta.category === "Expense" ? "text-destructive" : "text-green-600") :
                      balance < 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {money(Math.abs(balance))}{balance < 0 ? " Cr" : balance > 0 ? " Dr" : ""}
                    </span>
                    <span />
                  </div>
                );
              })}

              {custom.map((acc) => {
                const meta = accounts[acc.base_account];
                const balance = getCustomBalance(acc.id);
                const normal: "Dr" | "Cr" = acc.category === "Asset" || acc.category === "Expense" ? "Dr" : "Cr";
                return (
                  <div key={acc.id} className="grid grid-cols-[1fr_60px_70px_90px_64px] gap-1 px-3 py-2 text-xs items-center border-b last:border-b-0 bg-primary/[0.03]">
                    <span className="font-medium flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{acc.name}</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">Club</Badge>
                      {!acc.is_active && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Inactive</Badge>}
                    </span>
                    <Badge variant="outline" className="text-[10px] w-fit">{acc.category === "Income" || acc.category === "Expense" ? "IS" : "BS"}</Badge>
                    <span className="text-[10px] text-muted-foreground">{normal}</span>
                    <span className={cn("text-right tabular-nums font-medium",
                      balance > 0 ? (acc.category === "Expense" ? "text-destructive" : "text-green-600") :
                      balance < 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {money(Math.abs(balance))}{balance < 0 ? " Cr" : balance > 0 ? " Dr" : ""}
                    </span>
                    <span className="flex items-center justify-end gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(acc)} aria-label={`Edit ${acc.name}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(acc)} aria-label={`Delete ${acc.name}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
            {meta_hint(category, custom.length, isLoading)}
          </div>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit account" : "Add club account"}</DialogTitle>
            <DialogDescription>
              Club accounts appear alongside the standard chart and can be used on transactions and bank statement imports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-xs">Account name</Label>
              <Input
                className="mt-1"
                value={editing?.name || ""}
                placeholder="e.g. Coaching Income"
                onChange={(e) => setEditing((s) => ({ ...(s || {}), name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={editing?.category || "Expense"}
                  onValueChange={(v) => setEditing((s) => ({
                    ...(s || {}),
                    category: v as GLCategory,
                    base_account: rollupOptions(v as GLCategory)[0],
                  }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Reports under</Label>
                <Select
                  value={editing?.base_account || ""}
                  onValueChange={(v) => setEditing((s) => ({ ...(s || {}), base_account: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Standard account" /></SelectTrigger>
                  <SelectContent>
                    {rollupOptions((editing?.category as GLCategory) || "Expense").map((k) => (
                      <SelectItem key={k} value={k}>{accounts[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={editing?.description || ""}
                onChange={(e) => setEditing((s) => ({ ...(s || {}), description: e.target.value }))}
              />
            </div>
            {editing?.id && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-xs">Active</span>
                <Button
                  size="sm"
                  variant={editing.is_active === false ? "outline" : "default"}
                  className="h-7 text-xs"
                  onClick={() => setEditing((s) => ({ ...(s || {}), is_active: !(s?.is_active !== false) }))}
                >
                  {editing.is_active === false ? "Inactive" : "Active"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function meta_hint(category: GLCategory, customCount: number, loading: boolean) {
  if (loading || customCount > 0) return null;
  return (
    <p className="text-[10px] text-muted-foreground -mt-2 mb-3">
      No club-specific {category.toLowerCase()} accounts yet.
    </p>
  );
}

export default ChartOfAccountsPanel;
