/**
 * Platform-wide WhatsApp template registry.
 *
 * WhatsApp (Meta) only delivers two kinds of outbound messages: free-form text
 * inside a 24h reply window, and pre-approved templates. Every cold message the
 * app generates therefore routes through one of these templates. Submitting
 * them here creates the Content templates on Twilio and sends them to Meta for
 * approval.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TemplateRow = {
  id: string;
  key: string;
  friendly_name: string;
  description: string | null;
  category: string;
  body: string;
  variables: string[] | null;
  content_sid: string | null;
  approval_status: string;
  approval_error: string | null;
  last_synced_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  created: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export function WhatsAppTemplatesCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select(
          "id, key, friendly_name, description, category, body, variables, content_sid, approval_status, approval_error, last_synced_at",
        )
        .order("key");
      if (error) throw error;
      return (data ?? []) as unknown as TemplateRow[];
    },
  });

  const sync = useMutation({
    mutationFn: async (keys?: string[]) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates-sync", {
        body: keys?.length ? { keys } : {},
      });
      if (error) throw error;
      return data as { total: number; approved: number };
    },
    onSuccess: (res) => {
      toast.success(`${res.total} template(s) checked — ${res.approved} approved.`);
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MessageSquareText className="h-5 w-5 text-emerald-600 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">WhatsApp message templates</h2>
            <p className="text-sm text-muted-foreground">
              WhatsApp only allows pre-approved templates for messages people did not ask for in the
              last 24 hours. Submit these once; every club then sends through them.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              sync.mutate(undefined);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh status
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              sync.mutate(undefined);
            }}
          >
            <Send className="h-4 w-4 mr-1" /> Create &amp; submit
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{t.friendly_name}</div>
                <Badge
                  variant="outline"
                  className={STATUS_TONE[t.approval_status] ?? "bg-muted text-muted-foreground"}
                >
                  {t.approval_status}
                </Badge>
              </div>
              {t.description && (
                <p className="text-xs text-muted-foreground">{t.description}</p>
              )}
              <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded p-2">{t.body}</pre>
              <p className="text-[11px] text-muted-foreground">
                {t.category} · fills in: {(t.variables ?? []).join(", ") || "none"}
                {t.content_sid ? ` · ${t.content_sid}` : ""}
              </p>
              {t.approval_error && (
                <p className="text-[11px] text-destructive">{t.approval_error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
