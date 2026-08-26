import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHANNEL_LABEL } from "@/lib/comms/validation";
import type { CommsChannel } from "@/lib/comms/actions";

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  queued: "bg-muted text-muted-foreground",
};

export function CommsDeliveryLog({ clubId }: { clubId: string }) {
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["comms-deliveries", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_deliveries")
        .select("*, comms_campaigns(name)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
  });

  const filtered = useMemo(
    () =>
      rows.filter((r: any) => {
        if (channel !== "all" && r.channel !== channel) return false;
        if (status !== "all" && r.status !== status) return false;
        if (search && !`${r.recipient_name ?? ""} ${r.target ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [rows, channel, status, search],
  );

  const stats = useMemo(() => {
    const s = { total: filtered.length, sent: 0, failed: 0, skipped: 0 };
    for (const r of filtered as any[]) {
      if (r.status === "sent") s.sent++;
      else if (r.status === "failed") s.failed++;
      else if (r.status === "skipped") s.skipped++;
    }
    return s;
  }, [filtered]);

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-52" placeholder="Search recipient…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="in_app">In-app</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Total", value: stats.total },
          { label: "Sent", value: stats.sent },
          { label: "Failed", value: stats.failed },
          { label: "Skipped", value: stats.skipped },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="text-lg font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="p-2">Campaign</th>
              <th className="p-2">Recipient</th>
              <th className="p-2">Channel</th>
              <th className="p-2">Status</th>
              <th className="p-2">When</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && !filtered.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nothing sent yet.</td></tr>
            )}
            {filtered.map((r: any) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="p-2 truncate max-w-[180px]">{r.comms_campaigns?.name ?? "—"}</td>
                <td className="p-2">
                  <div className="truncate max-w-[200px]">{r.recipient_name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.target ?? ""}</div>
                </td>
                <td className="p-2">{CHANNEL_LABEL[r.channel as CommsChannel] ?? r.channel}</td>
                <td className="p-2">
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[r.status] ?? ""}`}>{r.status}</Badge>
                  {r.error_message && <div className="text-[11px] text-destructive mt-0.5 max-w-[220px]">{r.error_message}</div>}
                </td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">
                  {new Date(r.sent_at ?? r.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
