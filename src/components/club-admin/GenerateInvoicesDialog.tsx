import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Info } from "lucide-react";

interface Props {
  open: boolean;
  clubId: string;
  onClose: () => void;
  onConfirm: (categoryIds: string[]) => void;
  isPending?: boolean;
}

interface Category {
  id: string;
  name: string;
  annual_fee: number;
  due_month: number;
  due_day: number;
  active: boolean;
  member_count?: number;
}

export function GenerateInvoicesDialog({ open, clubId, onClose, onConfirm, isPending }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["fee-categories-for-invoicing", clubId],
    enabled: open,
    queryFn: async () => {
      const { data: cats, error } = await supabase
        .from("member_fee_categories")
        .select("id, name, annual_fee, due_month, due_day, active")
        .eq("club_id", clubId)
        .eq("active", true)
        .gt("annual_fee", 0)
        .order("name");
      if (error) throw error;

      // member counts per category
      const { data: members } = await supabase
        .from("club_members")
        .select("fee_category_id")
        .eq("club_id", clubId)
        .not("fee_category_id", "is", null);

      const counts = new Map<string, number>();
      (members || []).forEach((m: any) => {
        if (m.fee_category_id) counts.set(m.fee_category_id, (counts.get(m.fee_category_id) || 0) + 1);
      });

      return (cats || []).map((c: any) => ({ ...c, member_count: counts.get(c.id) || 0 })) as Category[];
    },
  });

  // default-select all when opened
  useEffect(() => {
    if (open && categories.length > 0 && selected.size === 0) {
      setSelected(new Set(categories.map(c => c.id)));
    }
    if (!open) setSelected(new Set());
  }, [open, categories]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(prev => prev.size === categories.length ? new Set() : new Set(categories.map(c => c.id)));
  };

  const totalMembers = useMemo(
    () => categories.filter(c => selected.has(c.id)).reduce((s, c) => s + (c.member_count || 0), 0),
    [categories, selected]
  );

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDue = (m: number, d: number) => `${d} ${months[(m || 1) - 1]}`;
  const fmtAmt = (n: number) => `R ${Number(n || 0).toFixed(0)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Renewal Invoices</DialogTitle>
          <DialogDescription>
            Select which membership fee categories to invoice for the next renewal cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-amber-900 dark:text-amber-200">
            <strong>Before generating:</strong> make sure every member is assigned to the correct fee category
            on the <em>Members</em> tab. An invoice is created using the category currently linked to each member —
            so a wrongly-categorised member will get a wrong invoice. League &amp; National Body fees are handled
            automatically per affiliation and are not part of this step.
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-2 flex items-center justify-between text-xs">
          <button type="button" onClick={toggleAll} className="font-medium underline">
            {selected.size === categories.length ? "Deselect all" : "Select all"}
          </button>
          <span className="text-muted-foreground">
            <Info className="w-3 h-3 inline mr-1" />
            <strong>{selected.size}</strong> categor{selected.size === 1 ? "y" : "ies"} · <strong>{totalMembers}</strong> member{totalMembers === 1 ? "" : "s"} will receive invoices
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : categories.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No active membership fee categories with a fee &gt; R0 found. Add categories on the Fees tab first.
            </p>
          ) : categories.map(c => (
            <label key={c.id} className="flex items-center gap-3 p-2.5 hover:bg-accent/40 cursor-pointer">
              <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">Due {fmtDue(c.due_month, c.due_day)}</div>
              </div>
              <Badge variant="outline" className="text-[10px]">{c.member_count} member{c.member_count === 1 ? "" : "s"}</Badge>
              <div className="text-sm font-mono w-20 text-right">{fmtAmt(c.annual_fee)}</div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onConfirm(Array.from(selected))} disabled={isPending || selected.size === 0}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Generate invoices ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
