import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessagesSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * One switch for member messaging. The club never chooses WhatsApp vs SMS —
 * SquashHub sends a WhatsApp when a reply is expected and an SMS when it is a
 * one-way notice.
 */
export function MessagingCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();

  const { data: club } = useQuery({
    queryKey: ["club-messaging-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, whatsapp_enabled, sms_enabled")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; whatsapp_enabled: boolean | null; sms_enabled: boolean | null } | null;
    },
  });

  const on = !!(club?.whatsapp_enabled || club?.sms_enabled);

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("clubs")
        .update({
          whatsapp_enabled: enabled,
          sms_enabled: enabled,
          whatsapp_opted_in_at: enabled ? new Date().toISOString() : null,
          whatsapp_opted_in_by: enabled ? auth.user?.id ?? null : null,
        })
        .eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      qc.invalidateQueries({ queryKey: ["club-messaging-settings", clubId] });
      qc.invalidateQueries({ queryKey: ["club-whatsapp-settings", clubId] });
      qc.invalidateQueries({ queryKey: ["club-sms-settings", clubId] });
      qc.invalidateQueries({ queryKey: ["club-whatsapp-enabled", clubId] });
      toast({ title: enabled ? "Member messaging is on" : "Member messaging is off" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Member messaging</h2>
        </div>
        <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        One switch for messages to your members' phones. You don't choose the channel — SquashHub
        picks it for each message.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-md border p-3">
          <p className="font-semibold">WhatsApp — when a reply is needed</p>
          <p className="text-muted-foreground mt-1">
            Tournament launches and invites, RSVPs, anything with Yes/No or a link the member must
            act on.
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="font-semibold">SMS — when it's just a notice</p>
          <p className="text-muted-foreground mt-1">
            Next round is starting, please make your booking, well done on your win, result and
            payment reminders.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="text-sm">Send messages to members' phones</Label>
          <p className="text-xs text-muted-foreground">
            Billed per message. Switch off and only email and in-app notices are used.
          </p>
        </div>
        <Switch checked={on} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate(v)} />
      </div>
    </Card>
  );
}
