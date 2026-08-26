import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { COMMS_ACTION_MAP, COMMS_CHANNELS } from "@/lib/comms/actions";
import type { TemplateRecord } from "./CommsTemplateEditor";

export function CommsTemplatesPanel({
  clubId,
  templates,
  isLoading,
  onNew,
  onEdit,
  onSend,
}: {
  clubId: string;
  templates: TemplateRecord[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (t: TemplateRecord) => void;
  onSend: (t: TemplateRecord) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comms_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-templates", clubId] });
      toast({ title: "Template deleted" });
    },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Templates ({templates.length})</p>
        <Button size="sm" onClick={onNew}><Plus className="w-3.5 h-3.5 mr-1" />New template</Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && !templates.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No templates yet. Create one with email, WhatsApp and in-app versions.
        </p>
      )}

      <div className="space-y-2">
        {templates.map((t) => {
          const actionDef = COMMS_ACTION_MAP[t.action?.key || "none"];
          return (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {t.category || "general"}
                  {actionDef && actionDef.key !== "none" && ` · ${actionDef.label}`}
                </p>
              </div>
              <div className="flex gap-1">
                {COMMS_CHANNELS.map((c) => (
                  <Badge
                    key={c.key}
                    variant={t.versions[c.key] ? "secondary" : "outline"}
                    className={`text-[10px] ${t.versions[c.key] ? "" : "opacity-40"}`}
                  >
                    {c.label}
                  </Badge>
                ))}
              </div>
              <Button size="sm" variant="ghost" title="Send as campaign" onClick={() => onSend(t)}><Send className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(t)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${t.name}"?`)) del.mutate(t.id); }}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
