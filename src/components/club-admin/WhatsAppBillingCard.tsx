import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Receipt } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

const money = (n: number) =>
  `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function WhatsAppBillingCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { start, end } = useMemo(() => monthBounds(), []);

  const { data: club } = useQuery({
    queryKey: ["club-whatsapp-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, whatsapp_enabled, whatsapp_opted_in_at, whatsapp_rate_override")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rates } = useQuery({
    queryKey: ["whatsapp-rates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["whatsapp_rate_utility", "whatsapp_rate_service", "whatsapp_rate_marketing"]);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => (map[r.key] = Number(r.value)));
      return map;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["whatsapp-usage", clubId, start],
    enabled: !!club?.whatsapp_enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_club_whatsapp_usage", {
        _club_id: clubId,
        _period_start: start,
        _period_end: end,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["whatsapp-invoices", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_whatsapp_invoices")
        .select("*")
        .eq("club_id", clubId)
        .order("period_start", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = useMutation({
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
      qc.invalidateQueries({ queryKey: ["club-whatsapp-settings", clubId] });
      toast({ title: enabled ? "WhatsApp sending enabled" : "WhatsApp sending disabled" });
    },
    onError: (e: Error) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const rate = club?.whatsapp_rate_override ?? rates?.whatsapp_rate_utility ?? 0.45;
  const subtotal = Number(usage?.subtotal ?? 0);
  const vat = subtotal * 0.15;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MessageCircle className="w-4 h-4 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold">WhatsApp messaging</p>
            <p className="text-xs text-muted-foreground">
              Send fee reminders, fixture notices and tournament pairings straight to members on WhatsApp.
              Messages are metered and billed to your club at the end of each month.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="wa-optin" className="text-xs">
            {club?.whatsapp_enabled ? "On" : "Off"}
          </Label>
          <Switch
            id="wa-optin"
            checked={!!club?.whatsapp_enabled}
            onCheckedChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">Notice / reminder</p>
          <p className="font-semibold">{money(club?.whatsapp_rate_override ?? rates?.whatsapp_rate_utility ?? 0.45)}</p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">Reply (24h window)</p>
          <p className="font-semibold">{money(club?.whatsapp_rate_override ?? rates?.whatsapp_rate_service ?? 0.15)}</p>
        </div>
        <div className="rounded border border-border p-2">
          <p className="text-muted-foreground">Promotional</p>
          <p className="font-semibold">{money(club?.whatsapp_rate_override ?? rates?.whatsapp_rate_marketing ?? 0.8)}</p>
        </div>
      </div>

      {club?.whatsapp_enabled && (
        <div className="rounded border border-border p-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">This month so far</p>
            <Badge variant="secondary" className="text-[10px]">
              {usage?.message_count ?? 0} messages
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {usage?.utility_count ?? 0} notices · {usage?.service_count ?? 0} replies ·{" "}
              {usage?.marketing_count ?? 0} promotional
            </span>
            <span className="font-semibold text-foreground">
              {money(subtotal + vat)} <span className="text-muted-foreground font-normal">incl. VAT</span>
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Estimated at {money(rate)} per notice. Final amount is confirmed on your month-end invoice.
          </p>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" /> WhatsApp invoices
          </p>
          {invoices.map((inv: any) => (
            <div key={inv.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span>{inv.period_start} → {inv.period_end}</span>
              <span className="text-muted-foreground">{inv.message_count} msgs</span>
              <span className="font-semibold">{money(inv.total)}</span>
              <Badge variant={inv.status === "paid" ? "secondary" : "outline"} className="text-[10px]">
                {inv.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
