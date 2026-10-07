import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";

type Member = { id: string; name: string | null; email: string | null };

/** Club-scoped connectivity-loss alerts: up to two member recipients, emailed via the club's SMTP. */
export function IotConnectivityAlerts({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["iot-alert-settings", clubId],
    queryFn: async () => (await supabase.from("club_iot_alert_settings").select("*").eq("club_id", clubId).maybeSingle()).data,
  });
  const { data: health } = useQuery({
    queryKey: ["iot-health", clubId],
    queryFn: async () => (await supabase.from("club_iot_device_health").select("device_id,label,online,offline_since,last_checked_at").eq("club_id", clubId)).data ?? [],
  });
  const [enabled, setEnabled] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [grace, setGrace] = useState("5");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.enabled); setIds(cfg.recipient_member_ids ?? []); setGrace(String(cfg.grace_minutes ?? 5));
  }, [cfg]);

  const { data: members = [] } = useQuery({
    queryKey: ["iot-alert-members", clubId, search, ids.join(",")],
    queryFn: async () => {
      const out: Member[] = [];
      if (ids.length) out.push(...(((await supabase.from("club_members").select("id,name,email").eq("club_id", clubId).in("id", ids)).data ?? []) as Member[]));
      if (search.trim().length >= 2) {
        const q = search.trim().replace(/[%,]/g, "");
        out.push(...(((await supabase.from("club_members").select("id,name,email").eq("club_id", clubId).or(`name.ilike.%${q}%,email.ilike.%${q}%`).limit(8)).data ?? []) as Member[]));
      }
      return out;
    },
  });
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const name = (m?: Member) => (m ? m.name?.trim() || "Member" : "Member");

  const save = async () => {
    const g = Math.min(60, Math.max(2, Number(grace) || 5));
    setSaving(true);
    const { error } = await supabase.from("club_iot_alert_settings").upsert({ club_id: clubId, enabled, recipient_member_ids: ids.slice(0, 2), grace_minutes: g, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Connectivity alerts saved");
    qc.invalidateQueries({ queryKey: ["iot-alert-settings", clubId] });
  };
  const test = async () => {
    const { data, error } = await supabase.functions.invoke("iot-connectivity-monitor", { body: { action: "test_email", club_id: clubId } });
    if (error || data?.error) return toast.error(data?.error || error?.message || "Test failed");
    toast.success(`Test email sent to ${data.sent} recipient(s)`);
  };
  const offline = (health ?? []).filter((h: any) => h.online === false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4 text-primary" /> Connectivity alerts</CardTitle>
        <p className="text-xs text-muted-foreground">Email up to two members when an installed device loses its Wi-Fi/internet connection, and again when it is back. Sent from the club's email settings. Not used for lights switching on or off.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><Switch id="iot-alerts" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="iot-alerts">Notify when connection is lost</Label></div>
        <div className="space-y-1">
          <Label>Recipients (max 2)</Label>
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                {name(byId.get(id))}{byId.get(id)?.email ? ` · ${byId.get(id)!.email}` : " · no email"}
                <button type="button" aria-label={`Remove ${name(byId.get(id))}`} onClick={() => setIds(ids.filter((x) => x !== id))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          {ids.length < 2 && (
            <>
              <Input placeholder="Search members by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
              {search.trim().length >= 2 && (
                <div className="rounded border border-border">
                  {members.filter((m) => !ids.includes(m.id)).map((m) => (
                    <button key={m.id} type="button" className="block w-full px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { setIds([...ids, m.id].slice(0, 2)); setSearch(""); }}>
                      {name(m)} <span className="text-muted-foreground">{m.email || "no email"}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2"><Label htmlFor="iot-grace" className="text-xs">Confirm offline after</Label><Input id="iot-grace" type="number" min={2} max={60} value={grace} onChange={(e) => setGrace(e.target.value)} className="h-8 w-20" /><span className="text-xs text-muted-foreground">minutes</span></div>
        {offline.length > 0 && <p className="text-xs text-destructive">Currently offline: {offline.map((h: any) => h.label || h.device_id).join(", ")}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>Save</Button>
          <Button size="sm" variant="outline" onClick={test} disabled={!cfg?.recipient_member_ids?.length}>Send test email</Button>
        </div>
      </CardContent>
    </Card>
  );
}
