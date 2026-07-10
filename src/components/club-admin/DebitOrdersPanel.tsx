import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Banknote, CheckCircle2, Clock, AlertTriangle, RefreshCw, X } from "lucide-react";

type Mandate = {
  id: string;
  club_member_id: string;
  rail: string;
  max_amount_cents: number;
  debit_day: number | null;
  status: string;
  consecutive_failures: number;
  suspended_at: string | null;
  last_collection_at: string | null;
  club_members?: { full_name: string | null; club_member_number: string | null } | null;
};
type Collection = {
  id: string;
  club_member_id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  approval_required: boolean;
  failed_reason: string | null;
  attempt_number: number;
  created_at: string;
  club_members?: { full_name: string | null } | null;
};

const fmt = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const statusTone: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  queued: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  approved: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  submitted: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export default function DebitOrdersPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: memberMap } = useQuery({
    queryKey: ["club-members-names", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("id, full_name, club_member_number")
        .eq("club_id", clubId);
      const map = new Map<string, { full_name: string | null; club_member_number: string | null }>();
      (data || []).forEach((m: any) => map.set(m.id, { full_name: m.full_name, club_member_number: m.club_member_number }));
      return map;
    },
  });

  const attachMember = <T extends { club_member_id: string }>(rows: T[]): (T & { club_members: any })[] =>
    rows.map(r => ({ ...r, club_members: memberMap?.get(r.club_member_id) || null }));

  const { data: mandatesRaw } = useQuery({
    queryKey: ["stitch_mandates", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stitch_mandates").select("*")
        .eq("club_id", clubId).order("created_at", { ascending: false });
      return (data || []) as unknown as Mandate[];
    },
  });
  const mandates = mandatesRaw ? attachMember(mandatesRaw) as Mandate[] : undefined;

  const { data: collectionsRaw } = useQuery({
    queryKey: ["stitch_collections", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stitch_collections").select("*")
        .eq("club_id", clubId).order("created_at", { ascending: false }).limit(50);
      return (data || []) as unknown as Collection[];
    },
  });
  const collections = collectionsRaw ? attachMember(collectionsRaw) as Collection[] : undefined;

  const pending = (collections || []).filter(c => c.status === "queued" && c.approval_required);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["stitch_mandates", clubId] });
    qc.invalidateQueries({ queryKey: ["stitch_collections", clubId] });
  };

  const runQueue = async () => {
    setBusy("queue");
    const { error } = await supabase.functions.invoke("stitch-queue-collections", { body: { club_id: clubId } });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Queued new collections");
    refresh();
  };
  const runSubmit = async () => {
    setBusy("submit");
    const { error } = await supabase.functions.invoke("stitch-submit-collections", { body: { club_id: clubId } });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Submitted due collections");
    refresh();
  };

  const approve = async (id: string) => {
    await supabase.from("stitch_collections").update({
      status: "approved", approved_at: new Date().toISOString(), approval_required: false,
    }).eq("id", id);
    refresh();
  };
  const cancel = async (id: string) => {
    await supabase.from("stitch_collections").update({ status: "cancelled" }).eq("id", id);
    refresh();
  };
  const cancelMandate = async (id: string) => {
    if (!confirm("Cancel this mandate? Future debits will stop.")) return;
    const { error } = await supabase.functions.invoke("stitch-cancel-mandate", { body: { mandate_id: id } });
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recurring Card Payments</h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={runQueue} disabled={busy !== null}>
            <RefreshCw className="h-3 w-3" /> {busy === "queue" ? "Queueing…" : "Queue collections"}
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={runSubmit} disabled={busy !== null}>
            <CheckCircle2 className="h-3 w-3" /> {busy === "submit" ? "Submitting…" : "Submit due"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cron auto-runs daily. Pending rows older than 2 days are auto-approved unless you cancel or edit them.
      </p>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" /> Pending approval ({pending.length})</h4>
          <div className="border rounded text-xs divide-y">
            {pending.map(c => (
              <div key={c.id} className="px-2 py-1.5 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.club_members?.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{fmt(c.amount_cents)} · due {c.due_date}</div>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => approve(c.id)}>Approve</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => cancel(c.id)}><X className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandates */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium">Active mandates ({(mandates || []).filter(m => m.status === "active").length})</h4>
        {(mandates || []).length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">No mandates yet. Members set them up from My Account.</p>
        ) : (
          <div className="border rounded divide-y text-xs">
            {mandates!.map(m => (
              <div key={m.id} className="px-2 py-1.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {m.club_members?.full_name || "—"}
                    {m.club_members?.club_member_number && (
                      <span className="text-muted-foreground"> · {m.club_members.club_member_number}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.rail} · max {fmt(m.max_amount_cents)} · day {m.debit_day ?? "—"}
                    {m.consecutive_failures > 0 && (
                      <span className="ml-1 text-red-600">· {m.consecutive_failures} fail(s)</span>
                    )}
                  </div>
                </div>
                <Badge className={`text-[10px] ${statusTone[m.status] || ""}`} variant="secondary">{m.status}</Badge>
                {m.suspended_at && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                {m.status === "active" && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => cancelMandate(m.id)}>Cancel</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent collections */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium">Recent collections</h4>
        {(collections || []).length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">No collections yet.</p>
        ) : (
          <div className="border rounded divide-y text-xs max-h-72 overflow-y-auto">
            {collections!.map(c => (
              <div key={c.id} className="px-2 py-1.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{c.club_members?.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {fmt(c.amount_cents)} · due {c.due_date}
                    {c.attempt_number > 1 && <span> · retry #{c.attempt_number}</span>}
                    {c.failed_reason && <span className="text-red-600"> · {c.failed_reason}</span>}
                  </div>
                </div>
                <Badge className={`text-[10px] ${statusTone[c.status] || ""}`} variant="secondary">{c.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
