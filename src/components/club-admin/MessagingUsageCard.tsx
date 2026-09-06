import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessagesSquare } from "lucide-react";
import { useMessagingRates } from "@/hooks/use-messaging-rates";

function monthBounds(d = new Date()) {
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: fmt(start), end: fmt(end), startIso: start.toISOString() };
}

/**
 * Month-to-date WhatsApp + SMS usage for the club, priced in the club's own
 * currency. Shown inside Subscription so a club sees everything it is paying
 * for this month in one place.
 */
export function MessagingUsageCard({ clubId }: { clubId: string }) {
  const { start, end, startIso } = useMemo(() => monthBounds(), []);
  const rates = useMessagingRates();
  const money = rates.money;

  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const { data: wa } = useQuery({
    queryKey: ["subscription-wa-usage", clubId, start],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_club_whatsapp_usage", {
        _club_id: clubId,
        _period_start: start,
        _period_end: end,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as
        | { message_count?: number; utility_count?: number; service_count?: number; marketing_count?: number; subtotal?: number }
        | null;
    },
  });

  const { data: sms } = useQuery({
    queryKey: ["subscription-sms-usage", clubId, startIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_send_log")
        .select("segments, unit_cost, status")
        .eq("club_id", clubId)
        .gte("created_at", startIso);
      if (error) throw error;
      const sent = (data ?? []).filter((r: { status: string }) => r.status === "sent");
      return {
        messages: sent.length,
        segments: sent.reduce((t: number, r: { segments: number | null }) => t + (r.segments ?? 1), 0),
        cost: sent.reduce((t: number, r: { unit_cost: number | null }) => t + Number(r.unit_cost ?? 0), 0),
      };
    },
  });

  // Price usage in the club's own currency from counts. Logged unit_cost values
  // are stored in ZAR, so summing them directly mis-prices USD/EUR clubs.
  const waCost =
    Number(wa?.utility_count ?? 0) * rates.waUtility +
    Number(wa?.service_count ?? 0) * rates.waService +
    Number(wa?.marketing_count ?? 0) * rates.waMarketing;
  const smsCost = Number(sms?.segments ?? 0) * rates.sms;
  const total = waCost + smsCost;
  const messages = Number(wa?.message_count ?? 0) + Number(sms?.messages ?? 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Messaging usage — {monthLabel}</h3>
        </div>
        <Badge variant="secondary" className="text-[10px]">{messages} messages</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">WhatsApp</p>
          <p className="font-semibold">{money(waCost)}</p>
          <p className="text-[10px] text-muted-foreground">
            {wa?.utility_count ?? 0} notices · {wa?.service_count ?? 0} replies · {wa?.marketing_count ?? 0} promo
          </p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">SMS</p>
          <p className="font-semibold">{money(smsCost)}</p>
          <p className="text-[10px] text-muted-foreground">
            {sms?.messages ?? 0} sent · {sms?.segments ?? 0} segments
          </p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">Total so far</p>
          <p className="font-semibold">{money(total)}</p>
          <p className="text-[10px] text-muted-foreground">excl. VAT · billed monthly</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Priced in {rates.currency} at {money(rates.sms)} per SMS segment and {money(rates.waService)}–
        {money(rates.waMarketing)} per WhatsApp message. Final amounts are confirmed on your month-end invoice.
      </p>
    </Card>
  );
}
