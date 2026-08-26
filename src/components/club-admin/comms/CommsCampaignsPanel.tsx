import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { dispatchCampaign } from "@/lib/comms/send";
import { CHANNEL_LABEL } from "@/lib/comms/validation";
import type { CommsChannel } from "@/lib/comms/actions";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  sending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  failed: "bg-destructive/15 text-destructive",
};

export function useCommsCampaigns(clubId: string) {
  return useQuery({
    queryKey: ["comms-campaigns", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_campaigns")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
  });
}

export function CommsCampaignsPanel({
  clubId,
  onNew,
  mode,
}: {
  clubId: string;
  onNew: () => void;
  /** "history" = everything that has been sent; "queue" = scheduled + drafts. */
  mode: "history" | "queue";
}) {
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useCommsCampaigns(clubId);
  const rows = all.filter((c: any) =>
    mode === "queue" ? ["draft", "scheduled"].includes(c.status) : !["draft", "scheduled"].includes(c.status),
  );

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comms_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-campaigns", clubId] });
      toast({ title: "Campaign deleted" });
    },
  });

  const sendNow = useMutation({
    mutationFn: (id: string) => dispatchCampaign(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["comms-campaigns", clubId] });
      qc.invalidateQueries({ queryKey: ["comms-deliveries", clubId] });
      toast({ title: "Campaign sent", description: `${res.sent} delivered · ${res.failed} failed` });
    },
    onError: (e: any) => toast({ title: "Send failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">
          {mode === "queue" ? "Scheduled & drafts" : "Campaigns"} ({rows.length})
        </p>
        <Button size="sm" onClick={onNew}><Plus className="w-3.5 h-3.5 mr-1" />New campaign</Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && !rows.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          {mode === "queue" ? "Nothing scheduled or drafted." : "No campaigns sent yet."}
        </p>
      )}

      <div className="space-y-2">
        {rows.map((c: any) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {(c.channels ?? []).map((ch: CommsChannel) => CHANNEL_LABEL[ch] ?? ch).join(" · ") || "No channels"}
                {c.scheduled_for && ` · sends ${new Date(c.scheduled_for).toLocaleString()}`}
                {c.sent_at && !c.scheduled_for && ` · ${new Date(c.sent_at).toLocaleString()}`}
              </p>
              {c.last_error && <p className="text-[11px] text-destructive truncate">{c.last_error}</p>}
            </div>
            <div className="text-[11px] text-muted-foreground whitespace-nowrap">
              {c.sent_count}/{c.total_recipients}
            </div>
            <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[c.status] ?? ""}`}>
              {c.status === "scheduled" && <CalendarClock className="w-3 h-3 mr-1" />}
              {c.status}
            </Badge>
            {["draft", "scheduled"].includes(c.status) && (
              <Button size="sm" variant="ghost" title="Send now" onClick={() => sendNow.mutate(c.id)} disabled={sendNow.isPending}>
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { if (confirm(`Delete "${c.name}"?`)) remove.mutate(c.id); }}
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
