import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone } from "lucide-react";
import {
  CommsTemplateEditor,
  EMPTY_TEMPLATE,
  useCommsTemplates,
  type TemplateRecord,
} from "./comms/CommsTemplateEditor";
import { CommsTemplatesPanel } from "./comms/CommsTemplatesPanel";
import { CommsCampaignsPanel } from "./comms/CommsCampaignsPanel";
import { CommsCampaignWizard } from "./comms/CommsCampaignWizard";
import { CommsDeliveryLog } from "./comms/CommsDeliveryLog";

/**
 * Communications module — one engine for every SquashHub message.
 *
 * Templates hold channel-specific versions (email / WhatsApp / in-app) that
 * share one merge-field catalogue and one logical action. Campaigns pick a
 * template, an audience and the channels for THAT send.
 */
export function CommunicationsTab({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState("templates");
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [sending, setSending] = useState<TemplateRecord | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: templates = [], isLoading } = useCommsTemplates(clubId);

  const { data: club } = useQuery({
    queryKey: ["comms-club", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clubs").select("name,email,phone,subdomain").eq("id", clubId).maybeSingle();
      return data;
    },
    enabled: !!clubId,
  });

  const openWizard = (t: TemplateRecord | null) => {
    setSending(t);
    setWizardOpen(true);
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Megaphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span>
            Build a template once with email, WhatsApp and in-app versions — they share the same merge fields and the
            same call to action. When you send, tick only the channels you want for that send.
          </span>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="queue">Scheduled & drafts</TabsTrigger>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-3">
          <CommsTemplatesPanel
            clubId={clubId}
            templates={templates}
            isLoading={isLoading}
            onNew={() => setEditing({ ...EMPTY_TEMPLATE })}
            onEdit={setEditing}
            onSend={openWizard}
          />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-3">
          <CommsCampaignsPanel clubId={clubId} mode="history" onNew={() => openWizard(null)} />
        </TabsContent>

        <TabsContent value="queue" className="mt-3">
          <CommsCampaignsPanel clubId={clubId} mode="queue" onNew={() => openWizard(null)} />
        </TabsContent>

        <TabsContent value="log" className="mt-3">
          <CommsDeliveryLog clubId={clubId} />
        </TabsContent>
      </Tabs>

      {editing && (
        <CommsTemplateEditor
          clubId={clubId}
          clubSubdomain={club?.subdomain}
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {wizardOpen && (
        <CommsCampaignWizard
          clubId={clubId}
          club={club ?? null}
          templates={templates}
          initialTemplate={sending}
          onClose={() => { setWizardOpen(false); setSending(null); }}
        />
      )}
    </div>
  );
}
