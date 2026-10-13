import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CHANNEL_LABEL } from "@/lib/comms/validation";
import type { CommsChannel } from "@/lib/comms/actions";

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  queued: "bg-muted text-muted-foreground",
};

type Kind = "tournament" | "league" | "general";
const KIND_LABEL: Record<Kind, string> = { tournament: "Tournament", league: "League", general: "General" };

/** Classify a campaign as tournament / league / general from its saved action + audience. */
export function campaignKind(c: any): { kind: Kind; competitionId: string | null } {
  const params = c?.action?.params ?? {};
  const purpose = String(c?.audience_filter?.purpose ?? "");
  if (params.tournament_id) return { kind: "tournament", competitionId: params.tournament_id };
  if (purpose.startsWith("step_beta") || purpose.includes("tournament")) return { kind: "tournament", competitionId: null };
  const leagueId = c?.audience_league_id ?? params.league_id ?? null;
  if (leagueId || purpose.includes("league")) return { kind: "league", competitionId: leagueId };
  return { kind: "general", competitionId: null };
}

export function CommsDeliveryLog({ clubId }: { clubId: string }) {
  const initialCompetition =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("comms_competition") : null;
  const [kind, setKind] = useState<string>("all");
  const [competition, setCompetition] = useState<string | null>(initialCompetition);
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["comms-deliveries", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_deliveries")
        .select("*, comms_campaigns(id, name, action, audience_filter, audience_league_id, created_at, sent_at)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
  });

  const filtered = useMemo(
    () =>
      rows.filter((r: any) => {
        const k = campaignKind(r.comms_campaigns);
        if (kind !== "all" && k.kind !== kind) return false;
        if (competition && k.competitionId !== competition) return false;
        if (channel !== "all" && r.channel !== channel) return false;
        if (status !== "all" && r.status !== status) return false;
        if (search) {
          const hay = `${r.recipient_name ?? ""} ${r.target ?? ""} ${r.comms_campaigns?.name ?? ""}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, kind, competition, channel, status, search],
  );

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; when: string; kind: Kind; rows: any[] }>();
    for (const r of filtered as any[]) {
      const id = r.campaign_id ?? r.comms_campaigns?.id ?? "none";
      let g = map.get(id);
      if (!g) {
        g = {
          id,
          name: r.comms_campaigns?.name ?? "Untitled send",
          when: r.comms_campaigns?.sent_at ?? r.comms_campaigns?.created_at ?? r.created_at,
          kind: campaignKind(r.comms_campaigns).kind,
          rows: [],
        };
        map.set(id, g);
      }
      g.rows.push(r);
    }
    return [...map.values()].sort((a, b) => +new Date(b.when) - +new Date(a.when));
  }, [filtered]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, sent: 0, failed: 0, skipped: 0 };
    for (const r of filtered as any[]) {
      if (r.status === "sent") s.sent++;
      else if (r.status === "failed") s.failed++;
      else if (r.status === "skipped") s.skipped++;
    }
    return s;
  }, [filtered]);

  const perChannel = (rs: any[]) => {
    const c: Record<string, number> = {};
    for (const r of rs) if (r.status === "sent") c[r.channel] = (c[r.channel] ?? 0) + 1;
    return c;
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap gap-1">
        {(["all", "tournament", "league", "general"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`h-8 px-3 rounded-md text-[13px] border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {k === "all" ? "All" : `${KIND_LABEL[k]}s`}
          </button>
        ))}
        {competition && (
          <button onClick={() => setCompetition(null)} className="h-8 px-3 rounded-md text-[13px] border border-border">
            Showing one competition · clear ✕
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-52" placeholder="Search recipient or send…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          { label: "Deliveries", value: stats.total },
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

      {isLoading && <p className="p-6 text-center text-muted-foreground text-[13px]">Loading…</p>}
      {!isLoading && !groups.length && <p className="p-6 text-center text-muted-foreground text-[13px]">Nothing sent yet.</p>}

      <div className="space-y-1">
        {groups.map((g) => {
          const isOpen = !!open[g.id];
          const pc = perChannel(g.rows);
          const players = new Set(g.rows.map((r: any) => r.club_member_id ?? r.recipient_name ?? r.target)).size;
          const failed = g.rows.filter((r: any) => r.status === "failed").length;
          return (
            <div key={g.id} className="rounded border border-border">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                className="w-full flex flex-wrap items-center gap-2 p-2 text-left text-[13px]"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Badge variant="outline" className="text-[10px]">{KIND_LABEL[g.kind]}</Badge>
                <span className="font-medium truncate max-w-[340px]">{g.name}</span>
                <span className="text-muted-foreground">{new Date(g.when).toLocaleString()}</span>
                <span className="ml-auto text-muted-foreground">
                  {players} players ·{" "}
                  {Object.entries(pc).map(([ch, n]) => `${n} ${CHANNEL_LABEL[ch as CommsChannel] ?? ch}`).join(" · ") || "0 sent"}
                  {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
                </span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="p-2">Recipient</th>
                        <th className="p-2">Channel</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r: any) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2">
                            <div className="truncate max-w-[220px]">{r.recipient_name ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{r.target ?? ""}</div>
                          </td>
                          <td className="p-2">{CHANNEL_LABEL[r.channel as CommsChannel] ?? r.channel}</td>
                          <td className="p-2">
                            <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[r.status] ?? ""}`}>{r.status}</Badge>
                            {r.error_message && <div className="text-[11px] text-destructive mt-0.5 max-w-[240px]">{r.error_message}</div>}
                          </td>
                          <td className="p-2 text-muted-foreground whitespace-nowrap">{new Date(r.sent_at ?? r.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
