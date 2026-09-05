import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Receipt, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
        .select("id, whatsapp_enabled, whatsapp_opted_in_at, whatsapp_rate_override, whatsapp_sender_mode")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ownMode = club?.whatsapp_sender_mode === "own";

  const { data: secrets } = useQuery({
    queryKey: ["club-whatsapp-secrets", clubId],
    enabled: !!club?.whatsapp_enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_secrets")
        .select("whatsapp_account_sid, whatsapp_from, whatsapp_auth_token")
        .eq("club_id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  useEffect(() => {
    setSid(secrets?.whatsapp_account_sid ?? "");
    setSenderNumber(secrets?.whatsapp_from ?? "");
    setToken("");
  }, [secrets?.whatsapp_account_sid, secrets?.whatsapp_from]);

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

  const setMode = useMutation({
    mutationFn: async (mode: "platform" | "own") => {
      const { error } = await supabase.from("clubs").update({ whatsapp_sender_mode: mode }).eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-whatsapp-settings", clubId] });
      toast({ title: "Sender updated" });
    },
    onError: (e: Error) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const saveOwn = useMutation({
    mutationFn: async () => {
      const patch = {
        club_id: clubId,
        whatsapp_account_sid: sid.trim() || null,
        whatsapp_from: senderNumber.trim() || null,
        ...(token.trim() ? { whatsapp_auth_token: token.trim() } : {}),
      };
      const { error } = await supabase.from("club_secrets").upsert([patch], { onConflict: "club_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setToken("");
      qc.invalidateQueries({ queryKey: ["club-whatsapp-secrets", clubId] });
      toast({ title: "WhatsApp account saved" });
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
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
              Send fee reminders, event invites and tournament entries straight to members on WhatsApp — they
              reply with a Yes/No button and the answer lands back in the app automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-medium">When WhatsApp is used</p>
                <ul className="list-disc pl-3 mt-1 space-y-0.5 text-muted-foreground">
                  <li>Event invites & tournament entries with Yes/No replies</li>
                  <li>Conversational reminders where members must reply</li>
                  <li>Rich notices with buttons or links</li>
                </ul>
                <p className="mt-1.5 font-medium">Costs (platform sender)</p>
                <p className="text-muted-foreground">
                  {money(rates?.whatsapp_rate_service ?? 0.15)} reply /{" "}
                  {money(rates?.whatsapp_rate_utility ?? 0.45)} notice /{" "}
                  {money(rates?.whatsapp_rate_marketing ?? 0.8)} marketing
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

      {club?.whatsapp_enabled && (
        <div className="rounded border border-border p-2 space-y-2">
          <p className="text-xs font-semibold">Which number do messages come from?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode.mutate("platform")}
              className={`text-left rounded border p-2 text-xs ${!ownMode ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="font-semibold block">Shared SquashHub number</span>
              <span className="text-muted-foreground">Nothing to set up. Billed per message below.</span>
            </button>
            <button
              type="button"
              onClick={() => setMode.mutate("own")}
              className={`text-left rounded border p-2 text-xs ${ownMode ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="font-semibold block">Our own WhatsApp Business</span>
              <span className="text-muted-foreground">Your own number and provider bill. No SquashHub fee.</span>
            </button>
          </div>

          {ownMode && (
            <div className="space-y-2 pt-1">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-[11px]">Account SID</Label>
                  <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="AC…" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[11px]">Auth token</Label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={secrets?.whatsapp_auth_token ? "•••••• (saved)" : "Auth token"}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">WhatsApp sender number</Label>
                  <Input
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    placeholder="+27…"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Point your provider's inbound webhook at SquashHub so Yes/No replies still reach the app.
                </p>
                <Button size="sm" className="h-7 text-xs" onClick={() => saveOwn.mutate()} disabled={saveOwn.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!ownMode && (
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
      )}

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
              {ownMode ? (
                "Billed by your provider"
              ) : (
                <>
                  {money(subtotal + vat)} <span className="text-muted-foreground font-normal">incl. VAT</span>
                </>
              )}
            </span>
          </div>
          {!ownMode && (
            <p className="text-[10px] text-muted-foreground">
              Estimated at {money(rate)} per notice. Final amount is confirmed on your month-end invoice.
            </p>
          )}
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
