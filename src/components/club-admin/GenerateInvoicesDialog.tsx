import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Info } from "lucide-react";

export type GenerateSelection = {
  categoryIds: string[];
  leagueAssocIds: string[];
  nationalBodyIds: string[];
};

interface Props {
  open: boolean;
  clubId: string;
  onClose: () => void;
  onConfirm: (sel: GenerateSelection) => void;
  isPending?: boolean;
}

interface Item {
  id: string;
  kind: "category" | "league" | "national";
  name: string;
  amount: number;
  due_month: number;
  due_day: number;
  member_count: number;
}

const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function GenerateInvoicesDialog({ open, clubId, onClose, onConfirm, isPending }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["fee-items-for-invoicing", clubId],
    enabled: open,
    queryFn: async (): Promise<Item[]> => {
      const [catsRes, leaguesRes, nbfRes, membersRes, affRes] = await Promise.all([
        supabase
          .from("member_fee_categories")
          .select("id, name, annual_fee, due_month, due_day")
          .eq("club_id", clubId)
          .eq("active", true)
          .gt("annual_fee", 0)
          .order("name"),
        supabase
          .from("league_associations")
          .select("id, name, abbreviation, fee_annual, fee_due_month, due_day")
          .eq("club_id", clubId)
          .eq("active", true)
          .gt("fee_annual", 0)
          .order("name"),
        supabase
          .from("national_body_fees")
          .select("id, body_name, abbreviation, fee_annual, fee_due_month, due_day, fee_type")
          .eq("club_id", clubId)
          .eq("active", true)
          .neq("fee_type", "registration")
          .gt("fee_annual", 0)
          .order("body_name"),
        supabase
          .from("club_members")
          .select("id, fee_category_id")
          .eq("club_id", clubId),
        supabase
          .from("member_association_affiliations")
          .select("association_id, club_member_id, league_association_number, active, club_members!inner(club_id)")
          .eq("active", true)
          .eq("club_members.club_id", clubId),
      ]);

      const catCounts = new Map<string, number>();
      (membersRes.data || []).forEach((m: any) => {
        if (m.fee_category_id) catCounts.set(m.fee_category_id, (catCounts.get(m.fee_category_id) || 0) + 1);
      });

      const leagueCounts = new Map<string, number>();
      const membersWithLeagueNumber = new Set<string>();
      (affRes.data || []).forEach((a: any) => {
        leagueCounts.set(a.association_id, (leagueCounts.get(a.association_id) || 0) + 1);
        if (a.league_association_number) membersWithLeagueNumber.add(a.club_member_id);
      });
      const nbfMemberCount = membersWithLeagueNumber.size;

      const out: Item[] = [
        ...(catsRes.data || []).map((c: any) => ({
          id: c.id, kind: "category" as const,
          name: c.name, amount: Number(c.annual_fee) || 0,
          due_month: c.due_month || 3, due_day: c.due_day || 1,
          member_count: catCounts.get(c.id) || 0,
        })),
        ...(leaguesRes.data || []).map((l: any) => ({
          id: l.id, kind: "league" as const,
          name: l.abbreviation ? `${l.name} (${l.abbreviation})` : l.name,
          amount: Number(l.fee_annual) || 0,
          due_month: l.fee_due_month || 1, due_day: l.due_day || 1,
          member_count: leagueCounts.get(l.id) || 0,
        })),
        ...(nbfRes.data || []).map((n: any) => ({
          id: n.id, kind: "national" as const,
          name: n.abbreviation ? `${n.body_name} (${n.abbreviation})` : n.body_name,
          amount: Number(n.fee_annual) || 0,
          due_month: n.fee_due_month || 1, due_day: n.due_day || 1,
          member_count: nbfMemberCount,
        })),
      ];
      return out;
    },
  });

  useEffect(() => {
    if (open && items.length > 0 && selected.size === 0) {
      setSelected(new Set(items.map(i => `${i.kind}:${i.id}`)));
    }
    if (!open) setSelected(new Set());
  }, [open, items]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(prev => prev.size === items.length
      ? new Set()
      : new Set(items.map(i => `${i.kind}:${i.id}`)));
  };

  const { selectedItems, totalLines, typeTotals, grandTotal } = useMemo(() => {
    const sel = items.filter(i => selected.has(`${i.kind}:${i.id}`));
    const lines = sel.reduce((s, i) => s + i.member_count, 0);
    const tt: Record<Item["kind"], number> = {
      category: 0, league: 0, national: 0,
    };
    sel.forEach(i => { tt[i.kind] += i.amount * i.member_count; });
    const gt = tt.category + tt.league + tt.national;
    return { selectedItems: sel, totalLines: lines, typeTotals: tt, grandTotal: gt };
  }, [items, selected]);

  const fmtDue = (m: number, d: number) => `${d} ${months[(m || 1) - 1]}`;
  const fmtAmt = (n: number) => `R ${Number(n || 0).toFixed(0)}`;

  const sectionLabel = (k: Item["kind"]) =>
    k === "category" ? "Membership categories"
    : k === "league" ? "League associations"
    : "National body fees";

  const grouped: Record<Item["kind"], Item[]> = {
    category: items.filter(i => i.kind === "category"),
    league: items.filter(i => i.kind === "league"),
    national: items.filter(i => i.kind === "national"),
  };

  const handleConfirm = () => {
    const sel: GenerateSelection = { categoryIds: [], leagueAssocIds: [], nationalBodyIds: [] };
    items.forEach(i => {
      if (!selected.has(`${i.kind}:${i.id}`)) return;
      if (i.kind === "category") sel.categoryIds.push(i.id);
      else if (i.kind === "league") sel.leagueAssocIds.push(i.id);
      else sel.nationalBodyIds.push(i.id);
    });
    onConfirm(sel);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Renewal Invoices</DialogTitle>
          <DialogDescription>
            Select which annual fees to invoice for the next renewal cycle — membership categories, league associations, and national body fees.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-amber-900 dark:text-amber-200">
            <strong>Before generating:</strong> make sure every member is in the correct fee category and has the right league/national affiliations.
            League invoices are only sent to members affiliated to that league. National body invoices are only sent to members who hold an active regional league registration number.
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-2 flex items-center justify-between text-xs">
          <button type="button" onClick={toggleAll} className="font-medium underline">
            {selected.size === items.length ? "Deselect all" : "Select all"}
          </button>
          <span className="text-muted-foreground">
            <Info className="w-3 h-3 inline mr-1" />
            <strong>{selected.size}</strong> fee{selected.size === 1 ? "" : "s"} · approx <strong>{totalLines}</strong> invoice line{totalLines === 1 ? "" : "s"}
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto border rounded-md">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No active annual fees found. Add a membership category, league or national body fee on the Fees tab first.
            </p>
          ) : (
            (["category","league","national"] as const).map(kind => {
              const list = grouped[kind];
              if (list.length === 0) return null;
              return (
                <div key={kind}>
                  <div className="px-2.5 py-1.5 bg-muted/50 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border-b">
                    {sectionLabel(kind)}
                  </div>
                  <div className="divide-y">
                    {list.map(i => {
                      const key = `${i.kind}:${i.id}`;
                      return (
                        <label key={key} className="flex items-center gap-3 p-2.5 hover:bg-accent/40 cursor-pointer">
                          <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{i.name}</div>
                            <div className="text-[11px] text-muted-foreground">Due {fmtDue(i.due_month, i.due_day)}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {i.member_count} member{i.member_count === 1 ? "" : "s"}
                          </Badge>
                          <div className="text-sm font-mono w-20 text-right">{fmtAmt(i.amount)}</div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selected.size > 0 && (
          <div className="rounded-md border bg-muted/20 divide-y text-xs">
            {typeTotals.category > 0 && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">Membership categories total</span>
                <span className="font-mono font-medium">{fmtAmt(typeTotals.category)}</span>
              </div>
            )}
            {typeTotals.league > 0 && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">League associations total</span>
                <span className="font-mono font-medium">{fmtAmt(typeTotals.league)}</span>
              </div>
            )}
            {typeTotals.national > 0 && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-muted-foreground">National body fees total</span>
                <span className="font-mono font-medium">{fmtAmt(typeTotals.national)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-2 bg-muted/40 font-semibold">
              <span>Grand total</span>
              <span className="font-mono">{fmtAmt(grandTotal)}</span>
            </div>
          </div>
        )}


        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isPending || selected.size === 0}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Generate invoices ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
