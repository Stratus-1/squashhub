import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessagesSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Channel selection for member messaging: the club picks WhatsApp and/or SMS.
 * SquashHub still picks the right channel per message — a WhatsApp when a
 * reply is expected, an SMS for a one-way notice — but only among the channels
 * the club has switched on.
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["club-messaging-settings", clubId] });
    qc.invalidateQueries({ queryKey: ["club-whatsapp-settings", clubId] });
    qc.invalidateQueries({ queryKey: ["club-sms-settings", clubId] });
    qc.invalidateQueries({ queryKey: ["club-whatsapp-enabled", clubId] });
  };

  const fail = (e: unknown) =>
    toast({
      title: "Could not update",
      description: e instanceof Error ? e.message : "Please try again",
      variant: "destructive",
    });

  const setWhatsApp = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("clubs")
        .update({
          whatsapp_enabled: enabled,
          whatsapp_opted_in_at: enabled ? new Date().toISOString() : null,
          whatsapp_opted_in_by: enabled ? auth.user?.id ?? null : null,
        })
        .eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      invalidate();
      toast({ title: enabled ? "WhatsApp messaging is on" : "WhatsApp messaging is off" });
    },
    onError: fail,
  });

  const setSms = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from("clubs").update({ sms_enabled: enabled }).eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      invalidate();
      toast({ title: enabled ? "SMS messaging is on" : "SMS messaging is off" });
    },
    onError: fail,
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
        Select the channels your club may use — WhatsApp, SMS, or both. You don't choose the
        channel for each message: SquashHub sends a WhatsApp when a reply is expected and an SMS
        when it is a one-way notice. Billed per message; with both off only email and in-app
        notices are used.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="font-semibold">WhatsApp — when a reply is needed</Label>
              <p className="text-muted-foreground mt-1">
                Tournament launches and invites, RSVPs, anything with Yes/No or a link the member
                must act on.
              </p>
            </div>
            <Switch
              checked={!!club?.whatsapp_enabled}
              disabled={setWhatsApp.isPending}
              aria-label="WhatsApp messages"
              onCheckedChange={(v) => setWhatsApp.mutate(v)}
            />
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="font-semibold">SMS — when it's just a notice</Label>
              <p className="text-muted-foreground mt-1">
                Next round is starting, please make your booking, well done on your win, result
                and payment reminders.
              </p>
            </div>
            <Switch
              checked={!!club?.sms_enabled}
              disabled={setSms.isPending}
              aria-label="SMS messages"
              onCheckedChange={(v) => setSms.mutate(v)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
