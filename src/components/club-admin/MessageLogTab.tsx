import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Send, CheckCircle2, AlertTriangle, Inbox } from "lucide-react";
import { EmailLogTab } from "./EmailLogTab";

/**
 * Club messaging monitor: Email (existing outbox/SMTP view), WhatsApp and SMS.
 *
 * WhatsApp and SMS rows are provider acceptance records — a "sent" row means the
 * provider accepted the message, not that the handset received it. Delivery
 * failures reported back by the provider land in the same row's status/error.
 */

type RangeKey = "24h" | "7d" | "30d";
const RANGES: Record<RangeKey, number> = { "24h": 1, "7d": 7, "30d": 30 };

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  received: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  undelivered: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLES[status] || STATUS_STYLES.queued}>{status}</Badge>;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

type ChannelRow = {
  id: string;
  created_at: string;
  to_phone: string | null;
  member_id: string | null;
  kind: string | null;
  body: string | null;
  status: string;
  error: string | null;
  direction?: string | null;
  segments?: number | null;
};

function ChannelLog({
  clubId,
  table,
  emptyLabel,
}: {
  clubId: string;
  table: "whatsapp_send_log" | "sms_send_log";
  emptyLabel: string;
}) {
  const qc = useQueryClient();
  const [range, setRange] = useState<RangeKey>("7d");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const since = useMemo(() => new Date(Date.now() - RANGES[range] * 86_400_000).toISOString(), [range]);
  const queryKey = [table, clubId, since];

  const { data: rows = [], isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const cols =
        table === "whatsapp_send_log"
          ? "id,created_at,to_phone,member_id,kind,body,status,error,direction"
          : "id,created_at,to_phone,member_id,kind,body,status,error,segments";
      const { data, error } = await supabase
        .from(table)
        .select(cols)
        .eq("club_id", clubId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as ChannelRow[];
    },
  });

  const memberIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.member_id).filter(Boolean) as string[])),
    [rows],
  );

  const { data: names = {} } = useQuery({
    queryKey: [table, "names", clubId, memberIds.length, memberIds[0] ?? ""],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id,name")
        .in("id", memberIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const m of data || []) map[m.id] = (m.name ?? "").trim();
      return map;
    },
  });

  const kinds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.kind).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const [kind, setKind] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (q) {
        const who = `${r.to_phone ?? ""} ${names[r.member_id ?? ""] ?? ""}`.toLowerCase();
        if (!who.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, kind, search, names]);

  const stats = useMemo(() => {
    const s = { total: 0, sent: 0, failed: 0, incoming: 0 };
    for (const r of rows) {
      if (r.direction === "inbound" || r.status === "received") {
        s.incoming++;
        continue;
      }
      s.total++;
      if (["sent", "delivered"].includes(r.status)) s.sent++;
      else if (["failed", "undelivered"].includes(r.status)) s.failed++;
    }
    return s;
  }, [rows]);

  return (
    <div className="space-y-4 text-[13px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Messages out", value: stats.total, icon: Send },
          { label: "Accepted", value: stats.sent, icon: CheckCircle2 },
          { label: "Failed", value: stats.failed, icon: AlertTriangle },
          { label: "Replies in", value: stats.incoming, icon: Inbox },
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
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="received">Replies</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-52"
            placeholder="Search name or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey })}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardContent>
      </Card>

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
                <th className="p-2">Message</th>
                <th className="p-2">Status</th>
                <th className="p-2">When</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{r.kind || "—"}</td>
                  <td className="p-2 whitespace-nowrap">
                    {names[r.member_id ?? ""] || r.to_phone || "—"}
                    {names[r.member_id ?? ""] && r.to_phone && (
                      <div className="text-[11px] text-muted-foreground">{r.to_phone}</div>
                    )}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{(r.body || "").slice(0, 120)}</td>
                  <td className="p-2"><StatusBadge status={r.status} /></td>
                  <td className="p-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                  <td className="p-2 text-xs text-red-600">{r.error?.slice(0, 160) || ""}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">{emptyLabel}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export function MessageLogTab({ clubId, mode = "club" }: { clubId: string; mode?: "club" | "association" }) {
  return (
    <Tabs defaultValue="email" className="space-y-4">
      <TabsList>
        <TabsTrigger value="email">Emails</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="sms">SMS</TabsTrigger>
      </TabsList>
      <TabsContent value="email">
        <EmailLogTab clubId={clubId} mode={mode} />
      </TabsContent>
      <TabsContent value="whatsapp">
        <ChannelLog clubId={clubId} table="whatsapp_send_log" emptyLabel="No WhatsApp messages in this period." />
      </TabsContent>
      <TabsContent value="sms">
        <ChannelLog clubId={clubId} table="sms_send_log" emptyLabel="No SMS messages in this period." />
      </TabsContent>
    </Tabs>
  );
}

export default MessageLogTab;
