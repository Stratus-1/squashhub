import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

const money = (n: number) =>
  `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SmsMessagingCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const since = useMemo(() => monthStart(), []);

  const { data: club } = useQuery({
    queryKey: ["club-sms-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, sms_enabled, sms_sender_id")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; sms_enabled: boolean | null; sms_sender_id: string | null } | null;
    },
  });

  // Platform message rates (public, non-private app settings) — used to show
  // the club clear per-message cost guidance so they can decide per channel.
  const { data: rates } = useQuery({
    queryKey: ["messaging-rates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["sms_unit_cost", "whatsapp_rate_service", "whatsapp_rate_utility", "whatsapp_rate_marketing"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r: { key: string; value: string | null }) => [r.key, Number(r.value || 0)]));
      return {
        sms: map.get("sms_unit_cost") ?? 0.25,
        waService: map.get("whatsapp_rate_service") ?? 0.15,
        waUtility: map.get("whatsapp_rate_utility") ?? 0.45,
        waMarketing: map.get("whatsapp_rate_marketing") ?? 0.80,
      };
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["club-sms-usage", clubId, since],
    enabled: !!club?.sms_enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_send_log")
        .select("segments, unit_cost, status")
        .eq("club_id", clubId)
        .gte("created_at", since);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ segments: number | null; unit_cost: number | null; status: string }>;
      const sent = rows.filter((r) => r.status === "sent");
      return {
        messages: sent.length,
        segments: sent.reduce((t, r) => t + (r.segments ?? 1), 0),
        cost: sent.reduce((t, r) => t + Number(r.unit_cost ?? 0), 0),
        failed: rows.length - sent.length,
      };
    },
  });

  const [sender, setSender] = useState("");
  useEffect(() => setSender(club?.sms_sender_id ?? ""), [club?.sms_sender_id]);

  const save = useMutation({
    mutationFn: async (patch: { sms_enabled?: boolean; sms_sender_id?: string | null }) => {
      const { error } = await supabase.from("clubs").update(patch).eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-sms-settings", clubId] });
      toast({ title: "SMS settings saved" });
    },
    onError: (e: unknown) =>
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      }),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">SMS messages</h2>
        </div>
        <Badge variant={club?.sms_enabled ? "default" : "secondary"}>
          {club?.sms_enabled ? "On" : "Off"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        SMS is a separate channel from WhatsApp. It is used for short, urgent notices — booking
        confirmations and reminders, match and championship results, and payment reminders. Longer
        or conversational messages stay on email and WhatsApp. Members who opt out of SMS are
        skipped automatically.
      </p>

      {rates && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          <p className="text-xs font-medium">What each message costs your club</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-background border p-2">
              <p className="font-semibold">{money(rates.sms)} <span className="font-normal text-muted-foreground">/ SMS</span></p>
              <p className="text-[11px] text-muted-foreground">
                Per segment (±160 characters). Works on every phone, no app or data needed.
              </p>
            </div>
            <div className="rounded-md bg-background border p-2">
              <p className="font-semibold">{money(rates.waService)}–{money(rates.waUtility)} <span className="font-normal text-muted-foreground">/ WhatsApp</span></p>
              <p className="text-[11px] text-muted-foreground">
                Service replies are cheapest; template messages cost more ({money(rates.waMarketing)} for marketing).
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Guideline: use SMS for one-way, time-sensitive notices (bookings, results, payment
            reminders); use WhatsApp when members must reply or for richer content; email is free for
            anything long or formal. You can switch SMS off at any time — your club only pays for
            what it sends.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="text-sm">Send SMS for this club</Label>
          <p className="text-xs text-muted-foreground">Each message is billed per segment.</p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-medium">When SMS is used</p>
                <ul className="list-disc pl-3 mt-1 space-y-0.5 text-muted-foreground">
                  <li>Short, time-sensitive one-way notices</li>
                  <li>Booking confirmations and reminders</li>
                  <li>Match / championship result alerts</li>
                  <li>Payment reminders (no reply needed)</li>
                </ul>
                <p className="mt-1.5 font-medium">Cost</p>
                <p className="text-muted-foreground">
                  {money(rates?.sms ?? 0.25)} per segment (±160 characters). Long messages use
                  more segments.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Switch
            checked={!!club?.sms_enabled}
            onCheckedChange={(v) => save.mutate({ sms_enabled: v })}
          />
        </div>
      </div>

      {club?.sms_enabled && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Sender name shown to members (optional)</Label>
              <Input
                className="w-56"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="Club short name"
                maxLength={11}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => save.mutate({ sms_sender_id: sender.trim() || null })}
              disabled={save.isPending}
            >
              Save sender
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-3">
              <p className="text-lg font-semibold">{usage?.messages ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Sent this month</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-lg font-semibold">{usage?.segments ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Segments</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-lg font-semibold">{money(usage?.cost ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">Cost this month</p>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
