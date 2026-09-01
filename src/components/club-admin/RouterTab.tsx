import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Router, Wifi, WifiOff, RefreshCw, Signal, Clock, Database, Bell, Users } from "lucide-react";
import {
  ROUTER_DRIVERS,
  computeUsage,
  formatData,
  formatUptime,
  useActiveBundle,
  useBundleHistory,
  useRecentPolls,
  useRouterConfig,
} from "@/hooks/use-router-monitor";
import { ClubWifiSettingsCard } from "./ClubWifiSettingsCard";
import type { Club } from "@/hooks/use-club";
import { formatCurrency } from "@/lib/currency";

export function RouterTab({ clubId, club }: { clubId: string; club?: Club }) {
  const qc = useQueryClient();
  const { data: config } = useRouterConfig(clubId);
  const { data: bundle } = useActiveBundle(clubId);
  const { data: history } = useBundleHistory(clubId);
  const { data: polls } = useRecentPolls(clubId);
  const [busy, setBusy] = useState(false);

  const { data: wifiMembers } = useQuery({
    enabled: !!clubId,
    queryKey: ["club-wifi-subscriptions", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_wifi_subscriptions")
        .select("*, member:club_member_id(id, name, club_member_number)")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data || []) as {
        id: string;
        club_member_id: string;
        active: boolean;
        auto_renew: boolean;
        started_at: string;
        current_period_end: string;
        last_billed_period: string;
        monthly_fee: number;
        cancelled_at: string | null;
        member: { id: string; name: string; club_member_number: string | null } | null;
      }[];
    },
  });

  const [form, setForm] = useState({
    enabled: false,
    driver: "generic_http",
    model: "",
    host: "",
    port: "",
    use_https: false,
    poll_interval_minutes: "15",
    notes: "",
  });
  const [creds, setCreds] = useState({ username: "", password: "", token: "" });
  const [newBundle, setNewBundle] = useState({
    size_mb: "",
    purchased_at: new Date().toISOString().slice(0, 10),
    cost: "",
    notes: "",
  });
  const [alerts, setAlerts] = useState({
    thresholds: "75, 90, 95",
    notify_email: true,
    notify_push: true,
    notify_offline: true,
    recipients: "",
  });

  useEffect(() => {
    if (!config) return;
    setForm({
      enabled: config.enabled,
      driver: config.driver || "generic_http",
      model: config.model || "",
      host: config.host || "",
      port: config.port ? String(config.port) : "",
      use_https: config.use_https,
      poll_interval_minutes: String(config.poll_interval_minutes ?? 15),
      notes: config.notes || "",
    });
  }, [config]);

  const { data: secretMeta } = useQuery({
    enabled: !!clubId,
    queryKey: ["router-secrets", clubId],
    queryFn: async () => {
      const { data } = await fromExt("club_secrets")
        .select("router_username, router_password, router_api_token")
        .eq("club_id", clubId)
        .maybeSingle();
      return data as { router_username?: string; router_password?: string; router_api_token?: string } | null;
    },
  });

  useEffect(() => {
    if (!secretMeta) return;
    setCreds({
      username: secretMeta.router_username || "",
      password: secretMeta.router_password || "",
      token: secretMeta.router_api_token || "",
    });
  }, [secretMeta]);

  const { data: alertSettings } = useQuery({
    enabled: !!clubId,
    queryKey: ["router-alert-settings", clubId],
    queryFn: async () => {
      const { data } = await fromExt("club_router_alert_settings")
        .select("*")
        .eq("club_id", clubId)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (!alertSettings) return;
    setAlerts({
      thresholds: (alertSettings.thresholds || [75, 90, 95]).join(", "),
      notify_email: alertSettings.notify_email,
      notify_push: alertSettings.notify_push,
      notify_offline: alertSettings.notify_offline,
      recipients: (alertSettings.recipients || []).join(", "),
    });
  }, [alertSettings]);

  const usage = computeUsage(bundle);
  const last = polls?.[0];

  const saveConfig = async () => {
    setBusy(true);
    try {
      const { error } = await fromExt("club_router_configs").upsert(
        {
          club_id: clubId,
          enabled: form.enabled,
          driver: form.driver,
          model: form.model || null,
          host: form.host || null,
          port: form.port ? Number(form.port) : null,
          use_https: form.use_https,
          poll_interval_minutes: Math.max(5, Number(form.poll_interval_minutes) || 15),
          notes: form.notes || null,
        },
        { onConflict: "club_id" },
      );
      if (error) throw error;
      const { error: sErr } = await fromExt("club_secrets").upsert(
        {
          club_id: clubId,
          router_username: creds.username || null,
          router_password: creds.password || null,
          router_api_token: creds.token || null,
        },
        { onConflict: "club_id" },
      );
      if (sErr) throw sErr;
      qc.invalidateQueries({ queryKey: ["router-config", clubId] });
      toast({ title: "Router settings saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runPoll = async (test = false) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("router-poll", {
        body: { action: test ? "test" : "poll", clubId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      qc.invalidateQueries({ queryKey: ["router-polls", clubId] });
      qc.invalidateQueries({ queryKey: ["router-active-bundle", clubId] });
      qc.invalidateQueries({ queryKey: ["router-config", clubId] });
      const res = data as any;
      toast({
        title: res?.error ? "Router unreachable" : "Router polled",
        description: res?.error || `Online: ${res?.online ? "yes" : "no"}`,
        variant: res?.error ? "destructive" : undefined,
      });
    } catch (e: any) {
      toast({ title: "Poll failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const purchaseBundle = async () => {
    if (!newBundle.size_mb) {
      toast({ title: "Enter the bundle size in MB", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await rpcExt("purchase_data_bundle", {
        _club_id: clubId,
        _size_mb: Number(newBundle.size_mb),
        _purchased_at: newBundle.purchased_at,
        _cost: newBundle.cost ? Number(newBundle.cost) : null,
        _notes: newBundle.notes || null,
      });
      if (error) throw error;
      setNewBundle({ size_mb: "", purchased_at: new Date().toISOString().slice(0, 10), cost: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["router-active-bundle", clubId] });
      qc.invalidateQueries({ queryKey: ["router-bundle-history", clubId] });
      toast({ title: "New bundle activated", description: "Previous bundle archived and baseline reset." });
    } catch (e: any) {
      toast({ title: "Could not save bundle", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveAlerts = async () => {
    setBusy(true);
    try {
      const thresholds = alerts.thresholds
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
      const recipients = alerts.recipients
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const { error } = await fromExt("club_router_alert_settings").upsert(
        {
          club_id: clubId,
          thresholds: thresholds.length ? thresholds : [75, 90, 95],
          notify_email: alerts.notify_email,
          notify_push: alerts.notify_push,
          notify_offline: alerts.notify_offline,
          recipients,
        },
        { onConflict: "club_id" },
      );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["router-alert-settings", clubId] });
      toast({ title: "Alert settings saved" });
    } catch (e: any) {
      toast({ title: "Could not save alerts", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Router className="w-4 h-4 text-primary" /> Internet status
            {last && (
              <Badge variant={last.online ? "default" : "destructive"} className="ml-1">
                {last.online ? "Online" : "Offline"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat icon={last?.online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              label="Status" value={last ? (last.online ? "Online" : "Offline") : "No data"} />
            <Stat icon={<Signal className="w-3.5 h-3.5" />} label="Signal"
              value={last?.signal_strength != null ? `${last.signal_strength} ${last.signal_unit || "dBm"}` : "—"} />
            <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Uptime" value={formatUptime(last?.uptime_seconds)} />
            <Stat icon={<Database className="w-3.5 h-3.5" />} label="Used this bundle"
              value={usage ? formatData(usage.usedMb) : "—"} />
          </div>

          {usage && (
            <div className="space-y-1">
              <Progress value={usage.percentUsed} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{usage.percentUsed.toFixed(1)}% used of {formatData(usage.sizeMb)}</span>
                <span>
                  {formatData(usage.remainingMb)} left
                  {usage.daysLeft != null ? ` · ~${usage.daysLeft} days` : ""}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => runPoll(false)} disabled={busy}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Poll now
            </Button>
            <Button size="sm" variant="outline" onClick={() => runPoll(true)} disabled={busy}>
              Test connection
            </Button>
            {config?.last_polled_at && (
              <span className="text-[11px] text-muted-foreground">
                Last poll: {new Date(config.last_polled_at).toLocaleString()}
              </span>
            )}
          </div>
          {last?.error && <p className="text-[11px] text-destructive">{last.error}</p>}
        </CardContent>
      </Card>

      {/* Club Wi-Fi sharing settings */}
      <ClubWifiSettingsCard clubId={clubId} />

      {/* Members paying for Wi-Fi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Members paying Wi-Fi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wifiMembers && wifiMembers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1">Member</th>
                    <th>Number</th>
                    <th>Started</th>
                    <th>Period end</th>
                    <th>Auto-renew</th>
                    <th className="text-right">Monthly fee</th>
                  </tr>
                </thead>
                <tbody>
                  {wifiMembers.map((sub) => (
                    <tr key={sub.id} className="border-t border-border/60">
                      <td className="py-1 font-medium">{sub.member?.name || "—"}</td>
                      <td>{sub.member?.club_member_number || "—"}</td>
                      <td>{sub.started_at ? new Date(sub.started_at).toLocaleDateString() : "—"}</td>
                      <td>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</td>
                      <td>
                        {sub.auto_renew ? (
                          <Badge variant="default" className="text-[10px]">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="text-right">{formatCurrency(sub.monthly_fee, club)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No members are currently paying for Wi-Fi access. Members can activate this from their dashboard once Wi-Fi billing is enabled.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Router configuration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Router configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <div>
              <Label className="text-xs">Monitoring enabled</Label>
              <p className="text-[11px] text-muted-foreground">Poll this router automatically.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Router type / API">
              <Select value={form.driver} onValueChange={(v) => setForm({ ...form, driver: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUTER_DRIVERS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model">
              <Input value={form.model} placeholder="e.g. Huawei B535"
                onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
            <Field label="IP address / hostname">
              <Input value={form.host} placeholder="192.168.8.1 or router.myclub.co.za"
                onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </Field>
            <Field label="Port (optional)">
              <Input value={form.port} inputMode="numeric" placeholder="80"
                onChange={(e) => setForm({ ...form, port: e.target.value })} />
            </Field>
            <Field label="Polling interval (minutes)">
              <Input value={form.poll_interval_minutes} inputMode="numeric"
                onChange={(e) => setForm({ ...form, poll_interval_minutes: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.use_https} onCheckedChange={(v) => setForm({ ...form, use_https: v })} />
              <Label className="text-xs">Use HTTPS</Label>
            </div>
            <Field label="Username">
              <Input value={creds.username} autoComplete="off"
                onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
            </Field>
            <Field label="Password">
              <Input type="password" value={creds.password} autoComplete="new-password"
                onChange={(e) => setCreds({ ...creds, password: e.target.value })} />
            </Field>
            <Field label="API token (if used instead of a password)">
              <Input type="password" value={creds.token} autoComplete="off"
                onChange={(e) => setCreds({ ...creds, token: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Credentials are stored in the club's restricted secrets area. The router must be reachable from the
            internet (public IP, DDNS hostname or a small on-site agent) for automatic polling to work.
          </p>
          <Button size="sm" onClick={saveConfig} disabled={busy}>Save router settings</Button>
        </CardContent>
      </Card>

      {/* Data bundle */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data bundle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bundle ? (
            <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
              <div className="font-semibold">
                {formatData(Number(bundle.size_mb))} purchased {new Date(bundle.purchased_at).toLocaleDateString()}
              </div>
              {usage && (
                <div className="text-muted-foreground">
                  {formatData(usage.usedMb)} used · {formatData(usage.remainingMb)} remaining ·{" "}
                  {usage.dailyMb ? `${formatData(usage.dailyMb)}/day` : "no usage yet"} ·{" "}
                  {usage.daysLeft != null ? `${usage.daysLeft} days left` : "days left unknown"}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active bundle yet — capture the current one below.</p>
          )}

          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Bundle size (MB)">
              <Input value={newBundle.size_mb} inputMode="numeric" placeholder="50000"
                onChange={(e) => setNewBundle({ ...newBundle, size_mb: e.target.value })} />
            </Field>
            <Field label="Purchase date">
              <Input type="date" value={newBundle.purchased_at}
                onChange={(e) => setNewBundle({ ...newBundle, purchased_at: e.target.value })} />
            </Field>
            <Field label="Cost (optional)">
              <Input value={newBundle.cost} inputMode="decimal"
                onChange={(e) => setNewBundle({ ...newBundle, cost: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Input value={newBundle.notes} onChange={(e) => setNewBundle({ ...newBundle, notes: e.target.value })} />
            </Field>
          </div>
          <Button size="sm" onClick={purchaseBundle} disabled={busy}>
            Record new bundle purchase
          </Button>

          {!!history?.length && (
            <div className="pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Bundle history
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1">Purchased</th><th>Size</th><th>Used</th><th>Cost</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((b) => (
                      <tr key={b.id} className="border-t border-border/60">
                        <td className="py-1">{new Date(b.purchased_at).toLocaleDateString()}</td>
                        <td>{formatData(Number(b.size_mb))}</td>
                        <td>{formatData(Number(b.used_bytes || 0) / (1024 * 1024))}</td>
                        <td>{b.cost ?? "—"}</td>
                        <td>{b.is_active ? <Badge variant="default">Active</Badge> : "Archived"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Usage alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Thresholds (% used, comma separated)">
              <Input value={alerts.thresholds} onChange={(e) => setAlerts({ ...alerts, thresholds: e.target.value })} />
            </Field>
            <Field label="Extra email recipients (comma separated)">
              <Input value={alerts.recipients} placeholder="treasurer@club.co.za"
                onChange={(e) => setAlerts({ ...alerts, recipients: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Toggle label="Email" checked={alerts.notify_email} onChange={(v) => setAlerts({ ...alerts, notify_email: v })} />
            <Toggle label="Push" checked={alerts.notify_push} onChange={(v) => setAlerts({ ...alerts, notify_push: v })} />
            <Toggle label="Alert when offline" checked={alerts.notify_offline} onChange={(v) => setAlerts({ ...alerts, notify_offline: v })} />
          </div>
          <Button size="sm" onClick={saveAlerts} disabled={busy}>Save alert settings</Button>
        </CardContent>
      </Card>

      {/* Poll history */}
      {!!polls?.length && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent polls</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1">When</th><th>Status</th><th>Signal</th><th>Uptime</th><th>Total data</th><th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {polls.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-1">{new Date(p.polled_at).toLocaleString()}</td>
                      <td>{p.online ? "Online" : "Offline"}</td>
                      <td>{p.signal_strength ?? "—"}</td>
                      <td>{formatUptime(p.uptime_seconds)}</td>
                      <td>{p.total_bytes ? formatData(Number(p.total_bytes) / (1024 * 1024)) : "—"}</td>
                      <td className="text-destructive">{p.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
