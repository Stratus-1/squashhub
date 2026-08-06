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
  auth_url: string | null;
  created_at: string;
  club_members?: { full_name: string | null; club_member_number: string | null; phone?: string | null } | null;
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
        .select("id, name, club_member_number, phone")
        .eq("club_id", clubId);
      const map = new Map<string, { full_name: string | null; club_member_number: string | null; phone: string | null }>();
      (data || []).forEach((m: any) => map.set(m.id, { full_name: m.name, club_member_number: m.club_member_number, phone: m.phone }));
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
  const mandates = mandatesRaw
    ? (attachMember(mandatesRaw) as Mandate[]).filter(m => m.status !== "failed" && m.status !== "cancelled")
    : undefined;

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

  // --- Pending mandate helpers (admin can help members finish setup) ---
  const checkMandate = async (id: string) => {
    setBusy(`chk-${id}`);
    const { data, error } = await supabase.functions.invoke("stitch-refresh-mandate", {
      body: { mandate_id: id },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const payload = (data as any) || {};
    if (payload.error === "MANDATE_NOT_FOUND") {
      return toast.error(
        "Stitch can't confirm this one — its API has no lookup for Express authorisations. If the member says they finished, use \"Mark authorised\".",
        { duration: 8000 },
      );
    }
    if (payload.error) return toast.error(String(payload.error));
    if (payload.status === "active") toast.success("Mandate is now active");
    else toast.info(`Still ${payload.status || "pending"} — authorisation not completed yet`);
    refresh();
  };

  const markMandate = async (id: string, action: "confirm" | "reject") => {
    if (action === "confirm" && !confirm("Mark this mandate as authorised? Only do this once the member confirms they completed the Stitch flow (and the R20 verification charge went off).")) return;
    setBusy(`mark-${id}`);
    const { data, error } = await supabase.functions.invoke("stitch-refresh-mandate", {
      body: { mandate_id: id, action },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const payload = (data as any) || {};
    if (payload.error) return toast.error(String(payload.error));
    toast.success(action === "confirm" ? "Marked as authorised" : "Mandate cancelled");
    refresh();
  };


  const copyAuthLink = async (m: Mandate) => {
    if (!m.auth_url) return toast.error("No authorisation link on this mandate — ask the member to start setup again.");
    await navigator.clipboard.writeText(m.auth_url);
    toast.success("Authorisation link copied");
  };

  const whatsappAuthLink = (m: Mandate) => {
    if (!m.auth_url) return toast.error("No authorisation link on this mandate.");
    const name = m.club_members?.full_name || "there";
    const msg = `Hi ${name}, please finish setting up your monthly club payment here: ${m.auth_url}`;
    const raw = (m.club_members?.phone || "").replace(/[^0-9]/g, "");
    const num = raw.startsWith("0") ? `27${raw.slice(1)}` : raw;
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
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
    const { data, error } = await supabase.functions.invoke("stitch-cancel-mandate", { body: { mandate_id: id } });
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Failed to cancel");
    }
    refresh();
  };

  // --- Duplicate mandate detection -------------------------------------
  // A member should only ever have ONE live mandate. Extra ones (usually
  // created when someone retried a failed setup) can cause double debits.
  const duplicateGroups = (() => {
    const byMember = new Map<string, Mandate[]>();
    (mandates || []).forEach(m => {
      const list = byMember.get(m.club_member_id) || [];
      list.push(m);
      byMember.set(m.club_member_id, list);
    });
    return Array.from(byMember.entries())
      .filter(([, list]) => list.length > 1)
      .map(([memberId, list]) => {
        const sorted = [...list].sort((a, b) => {
          // Prefer an active mandate, then the most recently created.
          if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return { memberId, keep: sorted[0], extras: sorted.slice(1) };
      });
  })();

  const cancelDuplicates = async (group: { keep: Mandate; extras: Mandate[] }) => {
    const name = group.keep.club_members?.full_name || "this member";
    if (!confirm(
      `Cancel ${group.extras.length} duplicate mandate${group.extras.length > 1 ? "s" : ""} for ${name}?\n\n` +
      `Keeping: ${group.keep.status} · max ${fmt(group.keep.max_amount_cents)} · day ${group.keep.debit_day ?? "—"} ` +
      `(started ${new Date(group.keep.created_at).toLocaleDateString("en-ZA")}).`
    )) return;
    setBusy(`dup-${group.keep.club_member_id}`);
    let ok = 0; let failed = 0;
    for (const m of group.extras) {
      const { data, error } = await supabase.functions.invoke("stitch-cancel-mandate", { body: { mandate_id: m.id } });
      if (error || (data as any)?.error) failed++; else ok++;
    }
    setBusy(null);
    if (ok) toast.success(`Cancelled ${ok} duplicate mandate${ok > 1 ? "s" : ""}`);
    if (failed) toast.error(`${failed} could not be cancelled — try individually`);
    refresh();
  };

  const cancelAllDuplicates = async () => {
    const total = duplicateGroups.reduce((n, g) => n + g.extras.length, 0);
    if (!confirm(`Cancel ${total} duplicate mandate(s) across ${duplicateGroups.length} member(s)? The newest active mandate for each member is kept.`)) return;
    setBusy("dup-all");
    let ok = 0; let failed = 0;
    for (const g of duplicateGroups) {
      for (const m of g.extras) {
        const { data, error } = await supabase.functions.invoke("stitch-cancel-mandate", { body: { mandate_id: m.id } });
        if (error || (data as any)?.error) failed++; else ok++;
      }
    }
    setBusy(null);
    if (ok) toast.success(`Cancelled ${ok} duplicate mandate(s)`);
    if (failed) toast.error(`${failed} could not be cancelled — try individually`);
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

      {/* Duplicate mandate warning */}
      {duplicateGroups.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-xs font-semibold flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Duplicate mandates ({duplicateGroups.length} member{duplicateGroups.length > 1 ? "s" : ""})
            </h4>
            {duplicateGroups.length > 1 && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                disabled={busy !== null} onClick={cancelAllDuplicates}>
                {busy === "dup-all" ? "Cleaning…" : "Cancel all duplicates"}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            These members have more than one live mandate — usually from retrying a failed setup. Only one should stay active, otherwise they can be debited twice.
          </p>
          <div className="border rounded divide-y text-xs bg-background">
            {duplicateGroups.map(g => (
              <div key={g.memberId} className="px-2 py-1.5 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{g.keep.club_members?.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Keep: <Badge variant="secondary" className={`px-1 py-0 text-[9px] ${statusTone[g.keep.status] || ""}`}>{g.keep.status}</Badge>{" "}
                    max {fmt(g.keep.max_amount_cents)} · day {g.keep.debit_day ?? "—"} · {new Date(g.keep.created_at).toLocaleDateString("en-ZA")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Cancel {g.extras.length}: {g.extras.map(e => `${e.status} ${new Date(e.created_at).toLocaleDateString("en-ZA")}`).join(", ")}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                  disabled={busy !== null} onClick={() => cancelDuplicates(g)}>
                  {busy === `dup-${g.memberId}` ? "Cancelling…" : "Keep newest, cancel rest"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}


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

      {/* Pending mandate setups */}
      {(mandates || []).some(m => m.status === "pending") && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Awaiting authorisation ({(mandates || []).filter(m => m.status === "pending").length})
          </h4>
          <p className="text-[11px] text-muted-foreground">
            These members started a monthly payment setup but haven't completed it at Stitch. Re-send their link or re-check the status.
          </p>
          <div className="border rounded divide-y text-xs">
            {(mandates || []).filter(m => m.status === "pending").map(m => (
              <div key={m.id} className="px-2 py-1.5 flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.club_members?.full_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    max {fmt(m.max_amount_cents)} · day {m.debit_day ?? "—"} · started {new Date(m.created_at).toLocaleDateString("en-ZA")}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                  disabled={busy === `chk-${m.id}`} onClick={() => checkMandate(m.id)}>
                  {busy === `chk-${m.id}` ? "Checking…" : "Check status"}
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                  disabled={busy === `mark-${m.id}`} onClick={() => markMandate(m.id, "confirm")}>
                  {busy === `mark-${m.id}` ? "Saving…" : "Mark authorised"}
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => whatsappAuthLink(m)}>
                  WhatsApp link
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => copyAuthLink(m)}>
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => cancelMandate(m.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandates */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium">All mandates ({(mandates || []).filter(m => m.status === "active").length} active)</h4>
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
