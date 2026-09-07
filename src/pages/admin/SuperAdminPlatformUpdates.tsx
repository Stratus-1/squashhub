import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Megaphone, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  EMPTY_PLATFORM_TEMPLATE, PlatformTemplateEditor, type PlatformTemplate,
} from "@/components/admin/platform-updates/PlatformTemplateEditor";
import { PlatformCampaignWizard } from "@/components/admin/platform-updates/PlatformCampaignWizard";
import { PlatformCampaignsPanel } from "@/components/admin/platform-updates/PlatformCampaignsPanel";
import { htmlToText } from "@/lib/platform-updates";

export default function SuperAdminPlatformUpdates() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("templates");
  const [editing, setEditing] = useState<PlatformTemplate | null>(null);
  const [wizard, setWizard] = useState<{ template?: PlatformTemplate | null; duplicate?: any } | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["platform-update-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_update_templates").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const duplicate = useMutation({
    mutationFn: async (t: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("platform_update_templates").insert({
        name: `${t.name} (copy)`, subject: t.subject, body_html: t.body_html,
        action_label: t.action_label, action_url: t.action_url, created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-update-templates"] });
      toast({ title: "Template duplicated" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_update_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-update-templates"] });
      toast({ title: "Template deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Platform Updates</h1>
          <p className="text-xs text-white/60">
            Product releases, action-required notices and training material sent from SquashHub to club administrators.
          </p>
        </div>
        <Button size="sm" onClick={() => setWizard({})}>
          <Send className="w-3.5 h-3.5 mr-1" />New campaign
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-3">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1">
                <Megaphone className="w-4 h-4 text-primary" />Templates ({templates.length})
              </p>
              <Button size="sm" onClick={() => setEditing({ ...EMPTY_PLATFORM_TEMPLATE })}>
                <Plus className="w-3.5 h-3.5 mr-1" />New template
              </Button>
            </div>

            {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
            {!isLoading && !templates.length && (
              <p className="text-xs text-muted-foreground py-6 text-center">No templates yet.</p>
            )}

            <div className="space-y-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded border border-border">
                  <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(t as PlatformTemplate)}>
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.subject || htmlToText(t.body_html).slice(0, 80)}
                    </p>
                  </button>
                  <Button size="sm" variant="outline" onClick={() => setWizard({ template: t as PlatformTemplate })}>
                    Use
                  </Button>
                  <Button size="sm" variant="ghost" title="Duplicate" onClick={() => duplicate.mutate(t)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-3">
          <PlatformCampaignsPanel onDuplicate={(c) => setWizard({ duplicate: c })} />
        </TabsContent>
      </Tabs>

      {editing && <PlatformTemplateEditor template={editing} onClose={() => setEditing(null)} />}
      {wizard && (
        <PlatformCampaignWizard
          initialTemplate={wizard.template ?? null}
          duplicateOf={wizard.duplicate ?? null}
          onClose={() => setWizard(null)}
        />
      )}
    </div>
  );
}
