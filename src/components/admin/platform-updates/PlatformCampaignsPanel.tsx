import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PLATFORM_CHANNELS, deliveryCsv, dispatchPlatformCampaign } from "@/lib/platform-updates";

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  failed: "bg-destructive/15 text-destructive",
};

export function PlatformCampaignsPanel({ onDuplicate }: { onDuplicate: (c: any) => void }) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<any>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["platform-update-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_update_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["platform-update-recipients", detail?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_update_recipients").select("*").eq("campaign_id", detail.id).order("club_name");
      return data ?? [];
    },
    enabled: !!detail?.id,
  });

  const send = useMutation({
    mutationFn: ({ id, failedOnly }: { id: string; failedOnly?: boolean }) => dispatchPlatformCampaign(id, failedOnly),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["platform-update-campaigns"] });
      qc.invalidateQueries({ queryKey: ["platform-update-recipients"] });
      toast({ title: "Campaign dispatched", description: `${res.sent} sent · ${res.failed} failed · ${res.skipped} skipped` });
    },
    onError: (e: any) => toast({ title: "Send failed", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_update_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-update-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const exportCsv = () => {
    const blob = new Blob([deliveryCsv(rows as any[])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${detail.name.replace(/\W+/g, "-")}-delivery.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card className="p-3">
      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && !campaigns.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">No platform updates sent yet.</p>
      )}

      <div className="space-y-2">
        {campaigns.map((c: any) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded border border-border">
            <button className="flex-1 min-w-0 text-left" onClick={() => setDetail(c)}>
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {(c.channels ?? []).map((ch: string) => PLATFORM_CHANNELS.find((p) => p.key === ch)?.label ?? ch).join(" · ")}
                {" · "}{c.audience_type}
                {c.sent_at && ` · ${new Date(c.sent_at).toLocaleString()}`}
              </p>
              {c.last_error && <p className="text-[11px] text-destructive truncate">{c.last_error}</p>}
            </button>
            <div className="text-[11px] text-muted-foreground whitespace-nowrap">
              {c.sent_count}/{c.total_recipients}
            </div>
            <Badge variant="secondary" className={`text-[10px] ${TONE[c.status] ?? ""}`}>{c.status}</Badge>
            {["draft"].includes(c.status) && (
              <Button size="sm" variant="ghost" title="Send now" onClick={() => send.mutate({ id: c.id })} disabled={send.isPending}>
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}
            {c.failed_count > 0 && (
              <Button size="sm" variant="ghost" title="Resend to failed only"
                onClick={() => send.mutate({ id: c.id, failedOnly: true })} disabled={send.isPending}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" title="Duplicate" onClick={() => onDuplicate(c)}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${c.name}"?`)) remove.mutate(c.id); }}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {detail && (
        <Dialog open onOpenChange={() => setDetail(null)}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{detail.name}</DialogTitle></DialogHeader>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Sender: SquashHub Platform Updates</p>
              <p>Audience: {detail.audience_type} · {(detail.targeted_club_ids ?? []).length} clubs</p>
              <p>{detail.sent_count} sent · {detail.failed_count} failed · {detail.skipped_count} skipped of {detail.total_recipients}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1" />Export results</Button>
              {detail.failed_count > 0 && (
                <Button size="sm" onClick={() => send.mutate({ id: detail.id, failedOnly: true })} disabled={send.isPending}>
                  Resend to failed
                </Button>
              )}
            </div>
            <ScrollArea className="h-80">
              <div className="space-y-1 pr-2">
                {(rows as any[]).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-border">
                    <span className="flex-1 truncate">{r.recipient_name} · {r.club_name}</span>
                    <span className="text-muted-foreground">{r.channel}</span>
                    <Badge variant="secondary" className={`text-[10px] ${TONE[r.status] ?? ""}`}>{r.status}</Badge>
                    {r.read_at && <span className="text-emerald-600">read</span>}
                    {r.error_message && <span className="text-destructive truncate max-w-[40%]">{r.error_message}</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
