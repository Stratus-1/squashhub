import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Send, Clock, AlertTriangle, CheckCircle2, Ban } from "lucide-react";

/**
 * Club email delivery monitor.
 *
 * Two data sources:
 *  - email_send_log  : what actually left (or failed) at the SMTP layer
 *  - email_outbox    : what is still queued, paced ~90s apart per club so that
 *                      mail providers (Gmail especially) don't throttle a club
 *                      mid-batch, which silently dropped invites in the past.
 */

type RangeKey = "24h" | "7d" | "30d";
const RANGES: Record<RangeKey, number> = { "24h": 1, "7d": 7, "30d": 30 };

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type OutboxRow = {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  kind: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  sending: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  dlq: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  bounced: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  suppressed: "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLES[status] || STATUS_STYLES.pending}>{status}</Badge>;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const CLUB_ONLY_TEMPLATES = ["club-notification", "club-smtp"];

// A "sent" row keeps the provider's acceptance reply (e.g. "250 2.0.0 OK") in the
// same column as real failures — only colour it red when the send actually failed.
const PROBLEM_STATUSES = ["failed", "dlq", "bounced", "suppressed", "complained"];

export function EmailLogTab({ clubId, mode = "club" }: { clubId: string; mode?: "club" | "association" }) {
  const qc = useQueryClient();
  const [range, setRange] = useState<RangeKey>("7d");
  const [status, setStatus] = useState<string>("all");
  const [template, setTemplate] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const isAssociation = mode === "association";

  const since = useMemo(
    () => new Date(Date.now() - RANGES[range] * 86_400_000).toISOString(),
    [range],
  );

  const { data: rawLogs = [], isFetching } = useQuery({
    queryKey: ["email-log", clubId, since, mode],
    queryFn: async () => {
      let q = supabase
        .from("email_send_log")
        .select("id,message_id,template_name,recipient_email,status,error_message,created_at")
        .eq("club_id", clubId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (isAssociation) {
        q = q.not("template_name", "in", `(${CLUB_ONLY_TEMPLATES.map(t => `"${t}"`).join(",")})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      // One email produces several rows sharing a message_id; keep the latest.
      const seen = new Map<string, LogRow>();
      for (const row of (data || []) as LogRow[]) {
        const key = row.message_id || row.id;
        if (!seen.has(key)) seen.set(key, row);
      }
      return Array.from(seen.values());
    },
  });

  const { data: outbox = [] } = useQuery({
    queryKey: ["email-outbox", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_outbox")
        .select("id,recipient_email,recipient_name,subject,status,scheduled_for,attempts,last_error,kind")
        .eq("club_id", clubId)
        .in("status", ["queued", "sending", "failed"])
        .order("scheduled_for", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as OutboxRow[];
    },
    refetchInterval: 30_000,
  });

  const templates = useMemo(
    () => Array.from(new Set(rawLogs.map((l) => l.template_name).filter(Boolean) as string[])).sort(),
    [rawLogs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawLogs.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (template !== "all" && l.template_name !== template) return false;
      if (q && !l.recipient_email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rawLogs, status, template, search]);

  const stats = useMemo(() => {
    const s = { total: rawLogs.length, sent: 0, failed: 0, suppressed: 0 };
    for (const l of rawLogs) {
      if (l.status === "sent") s.sent++;
      else if (["failed", "dlq", "bounced"].includes(l.status)) s.failed++;
      else if (l.status === "suppressed") s.suppressed++;
    }
    return s;
  }, [rawLogs]);

  const failedRows = filtered.filter((l) => ["failed", "dlq"].includes(l.status));

  const requeueFailed = async () => {
    if (failedRows.length === 0) return;
    setBusy(true);
    try {
      // Never invent content: a resend must carry the ORIGINAL subject/body/link.
      // Recover it from the last outbox row we hold for that recipient.
      const emails = Array.from(new Set(failedRows.map((l) => l.recipient_email)));
      const { data: originals, error: originalsError } = await supabase
        .from("email_outbox")
        .select("recipient_email,recipient_name,subject,body,url,cta_label,kind,club_member_id,ref_id,created_at")
        .eq("club_id", clubId)
        .in("recipient_email", emails)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (originalsError) throw originalsError;

      const latest = new Map<string, NonNullable<typeof originals>[number]>();
      for (const o of originals || []) {
        if (!latest.has(o.recipient_email)) latest.set(o.recipient_email, o);
      }

      const base = Date.now() + 60_000;
      const rows: Record<string, unknown>[] = [];
      const skipped: string[] = [];
      for (const l of failedRows) {
        const original = latest.get(l.recipient_email);
        if (!original) {
          skipped.push(l.recipient_email);
          continue;
        }
        rows.push({
          club_id: clubId,
          club_member_id: original.club_member_id,
          recipient_email: l.recipient_email,
          recipient_name: original.recipient_name,
          subject: original.subject,
          body: original.body,
          url: original.url,
          cta_label: original.cta_label,
          ref_id: original.ref_id,
          kind: original.kind || l.template_name || "admin",
          scheduled_for: new Date(base + rows.length * 90_000).toISOString(),
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("email_outbox").insert(rows as never);
        if (error) throw error;
        toast.success(`${rows.length} email(s) queued — sending about 40 per hour.`);
        qc.invalidateQueries({ queryKey: ["email-outbox", clubId] });
      }
      if (skipped.length > 0) {
        toast.warning(
          `${skipped.length} email(s) skipped — the original message content is no longer available. Resend those from the screen that created them (e.g. tournament invitations).`,
        );
      }
    } catch (e: any) {
      toast.error(e.message || "Could not queue the resend");
    } finally {
      setBusy(false);
    }
  };


  const retryOutbox = async (row: OutboxRow) => {
    const { error } = await supabase
      .from("email_outbox")
      .update({ status: "queued", attempts: 0, scheduled_for: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Queued for the next send window");
      qc.invalidateQueries({ queryKey: ["email-outbox", clubId] });
    }
  };

  const cancelOutbox = async (row: OutboxRow) => {
    const { error } = await supabase.from("email_outbox").update({ status: "cancelled" }).eq("id", row.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["email-outbox", clubId] });
  };

  return (
    <div className="space-y-4 text-[13px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Emails", value: stats.total, icon: Send },
          { label: "Delivered", value: stats.sent, icon: CheckCircle2 },
          { label: "Failed", value: stats.failed, icon: AlertTriangle },
          { label: "In queue", value: outbox.filter((o) => o.status !== "failed").length, icon: Clock },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-3">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-lg font-semibold leading-none">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
                {r === "24h" ? "Last 24h" : r === "7d" ? "7 days" : "30 days"}
              </Button>
            ))}
          </div>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {templates.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dlq">Expired</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-52"
            placeholder="Search recipient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["email-log", clubId] })}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" disabled={busy || failedRows.length === 0} onClick={requeueFailed}>
            Resend {failedRows.length} failed
          </Button>
        </CardContent>
      </Card>

      {outbox.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Send queue ({outbox.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Recipient</th>
                  <th className="p-2">Subject</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Goes out</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {outbox.slice(0, 100).map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="p-2">{o.recipient_name || o.recipient_email}</td>
                    <td className="p-2">
                      {o.subject}
                      {o.last_error && <div className="text-xs text-red-600">{o.last_error.slice(0, 140)}</div>}
                    </td>
                    <td className="p-2"><StatusBadge status={o.status} /></td>
                    <td className="p-2 whitespace-nowrap">{fmt(o.scheduled_for)}</td>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => retryOutbox(o)}>Send now</Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelOutbox(o)}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Delivery log ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">Recipient</th>
                <th className="p-2">Status</th>
                <th className="p-2">When</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{l.template_name || "—"}</td>
                  <td className="p-2">{l.recipient_email}</td>
                  <td className="p-2"><StatusBadge status={l.status} /></td>
                  <td className="p-2 whitespace-nowrap">{fmt(l.created_at)}</td>
                  <td
                    className={`p-2 text-xs ${
                      PROBLEM_STATUSES.includes(l.status) ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {l.error_message?.slice(0, 160) || ""}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No emails in this period.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export default EmailLogTab;
