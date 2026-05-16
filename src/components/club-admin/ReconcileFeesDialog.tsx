import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Search, Save, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FeeRow {
  id: string;
  club_member_id: string;
  fee_type: string;
  fee_label: string;
  amount: number;
  paid: boolean;
}
interface MemberRow {
  id: string;
  name: string | null;
  club_member_number: string | null;
  fee_category_id: string | null;
}
interface FeeCategory {
  id: string;
  name: string;
  annual_fee: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 }).format(n);

export function ReconcileFeesDialog({
  clubId,
  open,
  onOpenChange,
}: {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({}); // fee_id -> paid?
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["reconcile-members", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, club_member_number, fee_category_id")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as MemberRow[];
    },
    enabled: open && !!clubId,
  });

  const { data: feeCategories = [] } = useQuery({
    queryKey: ["reconcile-fee-categories", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_fee_categories")
        .select("id, name, annual_fee")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as FeeCategory[];
    },
    enabled: open && !!clubId,
  });

  const memberIds = useMemo(() => members.map(m => m.id), [members]);

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["reconcile-fees", clubId, memberIds.length],
    queryFn: async () => {
      if (memberIds.length === 0) return [] as FeeRow[];
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, club_member_id, fee_type, fee_label, amount, paid")
        .in("club_member_id", memberIds);
      if (error) throw error;
      return (data || []) as FeeRow[];
    },
    enabled: open && memberIds.length > 0,
  });

  useEffect(() => {
    if (!open) {
      setOverrides({});
      setExpanded(new Set());
      setSearch("");
    }
  }, [open]);

  const feesByMember = useMemo(() => {
    const m = new Map<string, FeeRow[]>();
    fees.forEach(f => {
      if (!m.has(f.club_member_id)) m.set(f.club_member_id, []);
      m.get(f.club_member_id)!.push(f);
    });
    return m;
  }, [fees]);

  const isPaid = (f: FeeRow) => (overrides[f.id] ?? f.paid);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .map(m => {
        const memFees = feesByMember.get(m.id) || [];
        const owed = memFees.reduce((s, f) => s + Number(f.amount || 0), 0);
        const paid = memFees.filter(isPaid).reduce((s, f) => s + Number(f.amount || 0), 0);
        return { member: m, fees: memFees, owed, paid };
      })
      .filter(r => r.fees.length > 0)
      .filter(r => {
        if (!q) return true;
        return (
          (r.member.name || "").toLowerCase().includes(q) ||
          (r.member.club_member_number || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.member.name || "").localeCompare(b.member.name || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, feesByMember, search, overrides]);

  const totals = useMemo(() => {
    let owed = 0, paid = 0;
    filtered.forEach(r => { owed += r.owed; paid += r.paid; });
    return { owed, paid, outstanding: Math.max(owed - paid, 0) };
  }, [filtered]);

  const dirtyCount = Object.keys(overrides).filter(id => {
    const f = fees.find(ff => ff.id === id);
    return f && overrides[id] !== f.paid;
  }).length;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleFee = (f: FeeRow, next: boolean) => {
    setOverrides(prev => {
      const n = { ...prev };
      if (next === f.paid) delete n[f.id];
      else n[f.id] = next;
      return n;
    });
  };

  const setAllForMember = (memberId: string, next: boolean) => {
    const memFees = feesByMember.get(memberId) || [];
    setOverrides(prev => {
      const n = { ...prev };
      memFees.forEach(f => {
        if (next === f.paid) delete n[f.id];
        else n[f.id] = next;
      });
      return n;
    });
  };

  const handleSave = async () => {
    const changes = Object.entries(overrides).filter(([id, paid]) => {
      const f = fees.find(ff => ff.id === id);
      return f && paid !== f.paid;
    });
    if (changes.length === 0) {
      toast.info("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const paidIds = changes.filter(([, p]) => p).map(([id]) => id);
      const unpaidIds = changes.filter(([, p]) => !p).map(([id]) => id);
      if (paidIds.length > 0) {
        const { error } = await fromExt("club_member_fee_payments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .in("id", paidIds);
        if (error) throw error;
      }
      if (unpaidIds.length > 0) {
        const { error } = await fromExt("club_member_fee_payments")
          .update({ paid: false, paid_at: null })
          .in("id", unpaidIds);
        if (error) throw error;
      }
      toast.success(`Reconciled ${changes.length} fee${changes.length !== 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["reconcile-fees"] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
      qc.invalidateQueries({ queryKey: ["association-fee-payments"] });
      setOverrides({});
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Reconcile Member Fees</DialogTitle>
          <DialogDescription>
            Tick a fee to mark it <strong>paid</strong>, untick to mark it <strong>outstanding</strong>. Save when done.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or member #"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span>Billable: <strong>{fmt(totals.owed)}</strong></span>
            <span className="text-emerald-600">Paid: {fmt(totals.paid)}</span>
            <span className="text-amber-600">Outstanding: {fmt(totals.outstanding)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <p className="text-center py-10 text-xs text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-10 text-xs text-muted-foreground">No fees to reconcile.</p>
          ) : (
            <div className="divide-y">
              {filtered.map(({ member, fees: memFees, owed, paid }) => {
                const isOpen = expanded.has(member.id);
                const allPaid = memFees.every(isPaid);
                const nonePaid = memFees.every(f => !isPaid(f));
                const outstanding = Math.max(owed - paid, 0);
                return (
                  <div key={member.id} className="py-1.5">
                    <div
                      className="flex items-center gap-2 cursor-pointer hover:bg-accent/40 rounded px-2 py-1.5"
                      onClick={() => toggleExpand(member.id)}
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span className="font-medium text-sm flex-1 truncate">{member.name}</span>
                      {member.club_member_number && (
                        <Badge variant="outline" className="text-[10px] font-mono">#{member.club_member_number}</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground tabular-nums">{memFees.length} fees</span>
                      <span className="text-[11px] text-emerald-600 tabular-nums w-20 text-right">{fmt(paid)}</span>
                      <span className={cn("text-[11px] tabular-nums w-20 text-right font-semibold", outstanding > 0 ? "text-amber-600" : "text-muted-foreground")}>
                        {fmt(outstanding)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2"
                        onClick={(e) => { e.stopPropagation(); setAllForMember(member.id, !allPaid); }}
                      >
                        {allPaid ? "Mark all unpaid" : nonePaid ? "Mark all paid" : "Mark all paid"}
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="ml-7 mr-2 mt-1 mb-2 border rounded overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody>
                            {memFees.map(f => {
                              const checked = isPaid(f);
                              const dirty = overrides[f.id] !== undefined && overrides[f.id] !== f.paid;
                              return (
                                <tr key={f.id} className={cn("border-t first:border-t-0", dirty && "bg-amber-500/5")}>
                                  <td className="px-2 py-1 w-8">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(c) => toggleFee(f, !!c)}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <span className="font-medium">{f.fee_label}</span>
                                    <span className="ml-2 text-[10px] text-muted-foreground uppercase tracking-wide">{f.fee_type}</span>
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums">{fmt(Number(f.amount))}</td>
                                  <td className="px-2 py-1 w-20 text-right">
                                    <span className={cn("text-[10px] font-semibold", checked ? "text-emerald-600" : "text-amber-600")}>
                                      {checked ? "PAID" : "OWING"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""}` : "No changes"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
