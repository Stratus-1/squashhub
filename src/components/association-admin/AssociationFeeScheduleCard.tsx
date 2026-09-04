import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowDownLeft, ArrowUpRight, CalendarDays } from "lucide-react";

export interface FeeItem {
  id: string;
  association_club_id: string;
  direction: "receivable" | "payable";
  basis: "member" | "club" | "league_team";
  label: string;
  amount: number;
  season_year: number | null;
  due_month: number | null;
  due_day: number | null;
  notes: string | null;
  active: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmtDueDate = (item: FeeItem) =>
  item.due_month && item.due_day ? `${item.due_day} ${MONTHS[item.due_month - 1]}` : "—";

export const BASIS_LABEL: Record<FeeItem["basis"], string> = {
  member: "Per member",
  club: "Per club",
  league_team: "Per league team",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);

const emptyDraft = (direction: FeeItem["direction"]): Partial<FeeItem> => ({
  direction,
  basis: "member",
  label: "",
  amount: 0,
  season_year: new Date().getFullYear(),
  due_month: null,
  due_day: null,
  notes: "",
  active: true,
});

export function useAssociationFeeItems(clubId: string) {
  return useQuery({
    queryKey: ["association-fee-items", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_fee_items")
        .select("*")
        .eq("association_club_id", clubId)
        .order("direction")
        .order("basis")
        .order("label");
      if (error) throw error;
      return (data || []) as FeeItem[];
    },
  });
}

export function AssociationFeeScheduleCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useAssociationFeeItems(clubId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<FeeItem>>(emptyDraft("receivable"));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["association-fee-items", clubId] });

  const save = useMutation({
    mutationFn: async (d: Partial<FeeItem>) => {
      const dueMonth = d.due_month ? Number(d.due_month) : null;
      const dueDay = d.due_day ? Number(d.due_day) : null;
      if ((dueMonth && !dueDay) || (!dueMonth && dueDay)) throw new Error("Set both a renewal month and day, or leave both empty");
      const payload = {
        association_club_id: clubId,
        direction: d.direction,
        basis: d.basis,
        label: (d.label || "").trim(),
        amount: Number(d.amount || 0),
        season_year: d.season_year ? Number(d.season_year) : null,
        due_month: dueMonth,
        due_day: dueDay,
        notes: d.notes || null,
        active: d.active ?? true,
      };
      if (!payload.label) throw new Error("Description is required");
      if (d.id) {
        const { error } = await fromExt("association_fee_items").update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await fromExt("association_fee_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); setOpen(false); toast.success("Fee saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("association_fee_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Fee removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = (direction: FeeItem["direction"]) => { setDraft(emptyDraft(direction)); setOpen(true); };
  const openEdit = (item: FeeItem) => { setDraft(item); setOpen(true); };

  const section = (direction: FeeItem["direction"]) => {
    const list = items.filter(i => i.direction === direction);
    const isRec = direction === "receivable";
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              {isRec ? <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> : <ArrowUpRight className="w-4 h-4 text-amber-600" />}
              {isRec ? "Additional fees receivable" : "Fees payable"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isRec
                ? "Optional charges alongside the annual league fee — per member, per club or per league team."
                : "Amounts the association pays out, charged per member."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openNew(direction)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No {isRec ? "additional receivable" : "payable"} fees captured yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Description</th>
                <th className="text-left px-2 py-1.5 font-medium">Charged</th>
                <th className="text-left px-2 py-1.5 font-medium">Season</th>
                <th className="text-right px-2 py-1.5 font-medium">Amount</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id} className="border-t hover:bg-accent/30">
                  <td className="px-2 py-1.5">
                    {i.label}
                    {!i.active && <Badge variant="outline" className="ml-1.5 text-[9px]">inactive</Badge>}
                    {i.notes && <div className="text-[10px] text-muted-foreground">{i.notes}</div>}
                  </td>
                  <td className="px-2 py-1.5"><Badge variant="secondary" className="text-[10px]">{BASIS_LABEL[i.basis]}</Badge></td>
                  <td className="px-2 py-1.5">{i.season_year || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmt(Number(i.amount || 0))}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(i)} aria-label={`Edit ${i.label}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove.mutate(i.id)} aria-label={`Remove ${i.label}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> Annual league fee
            </h3>
            <p className="text-xs text-muted-foreground">
              The single annual member fee and renewal date. Saving this pushes the month and day to every affiliated club.
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">Canonical schedule</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Annual fee per member</Label>
            <Input type="number" min={0} step="0.01" value={annualFee} onChange={(e) => setAnnualFee(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>Renewal month</Label>
            <Select value={String(dueMonth)} onValueChange={(value) => setDueMonth(Number(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((month, index) => <SelectItem key={month} value={String(index + 1)}>{month}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payable on day</Label>
            <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)} />
          </div>
        </div>
        <div>
          <Button size="sm" onClick={() => saveAnnual.mutate()} disabled={saveAnnual.isPending}>
            {saveAnnual.isPending ? "Saving…" : "Save annual schedule"}
          </Button>
        </div>
      </Card>

      {section("receivable")}
      {section("payable")}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><span /></DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit fee" : "New fee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={draft.direction}
                  onValueChange={(v) => setDraft({ ...draft, direction: v as FeeItem["direction"], basis: v === "payable" ? "member" : draft.basis })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receivable">Receivable (income)</SelectItem>
                    <SelectItem value="payable">Payable (expense)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Charged per</Label>
                <Select
                  value={draft.basis}
                  onValueChange={(v) => setDraft({ ...draft, basis: v as FeeItem["basis"] })}
                  disabled={draft.direction === "payable"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Per member</SelectItem>
                    {draft.direction === "receivable" && <SelectItem value="club">Per club</SelectItem>}
                    {draft.direction === "receivable" && <SelectItem value="league_team">Per league team</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={draft.label || ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. League team entry fee" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (R)</Label>
                <Input type="number" min={0} step="0.01" value={draft.amount ?? 0} onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Season year</Label>
                <Input type="number" value={draft.season_year ?? ""} onChange={(e) => setDraft({ ...draft, season_year: parseInt(e.target.value, 10) || null })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
