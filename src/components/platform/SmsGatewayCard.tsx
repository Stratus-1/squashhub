import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Save, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const KEYS = [
  "sms_enabled",
  "sms_provider",
  "sms_sender_id",
  "sms_default_country_code",
  "sms_api_base",
  "sms_unit_cost",
  "sms_private_api_key",
  "sms_private_api_secret",
] as const;

type Settings = Record<(typeof KEYS)[number], string>;

const DEFAULTS: Settings = {
  sms_enabled: "false",
  sms_provider: "smsportal",
  sms_sender_id: "SquashHub",
  sms_default_country_code: "27",
  sms_api_base: "",
  sms_unit_cost: "0.25",
  sms_private_api_key: "",
  sms_private_api_secret: "",
};

const PROVIDERS = [
  { value: "smsportal", label: "SMSPortal", key: "Client ID", secret: "API secret" },
  { value: "clickatell", label: "Clickatell", key: "API key", secret: "Not used" },
  { value: "bulksms", label: "BulkSMS", key: "Username / token id", secret: "Password / token secret" },
  { value: "winsms", label: "WinSMS", key: "API key", secret: "Not used" },
  { value: "twilio", label: "Twilio SMS", key: "Account SID", secret: "Auth token" },
  { value: "gatewayapi", label: "GatewayAPI", key: "API token", secret: "Not used" },
  { value: "generic", label: "Other portal (JSON endpoint)", key: "Bearer token (optional)", secret: "Not used" },
];

export function SmsGatewayCard() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key, value").in("key", [...KEYS]);
      const mapped: Record<string, string> = {};
      (data ?? []).forEach((r) => (mapped[r.key] = String(r.value ?? "").replace(/^"|"$/g, "")));
      setSettings((prev) => ({ ...prev, ...mapped }));
      setLoading(false);
    })();
  }, []);

  const set = (key: keyof Settings, value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const provider = PROVIDERS.find((p) => p.value === settings.sms_provider) ?? PROVIDERS[0];

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = KEYS
        // Never overwrite a stored credential with a blank field.
        .filter((k) => !(k.includes("private") && settings[k] === ""))
        .map((k) => ({ key: k, value: settings[k] }));
      const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      toast.success("SMS gateway settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the SMS settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testNumber.trim()) {
      toast.error("Enter a mobile number to send the test to");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          platform: true,
          recipients: [{ phone: testNumber.trim() }],
          body: "SquashHub test message — your SMS gateway is working.",
          kind: "test",
          critical: true,
        },
      });
      if (error) throw error;
      const result = data as { sent?: number; results?: Array<{ error?: string }> };
      if ((result?.sent ?? 0) > 0) toast.success("Test SMS sent");
      else toast.error(result?.results?.[0]?.error || "The gateway did not accept the message");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">SMS gateway</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Short, time-critical notices (booking confirmations, match results, payment reminders) go out
        by SMS. Credentials are stored server-side and are never sent to members' browsers.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">SMS sending enabled</Label>
              <p className="text-xs text-muted-foreground">Nothing is sent while this is off.</p>
            </div>
            <Switch
              checked={settings.sms_enabled === "true"}
              onCheckedChange={(v) => set("sms_enabled", v ? "true" : "false")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Provider</Label>
              <Select value={settings.sms_provider} onValueChange={(v) => set("sms_provider", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sender name / number</Label>
              <Input
                value={settings.sms_sender_id}
                onChange={(e) => set("sms_sender_id", e.target.value)}
                placeholder="SquashHub"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{provider.key}</Label>
              <Input
                type="password"
                value={settings.sms_private_api_key}
                onChange={(e) => set("sms_private_api_key", e.target.value)}
                placeholder="Leave blank to keep the saved value"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{provider.secret}</Label>
              <Input
                type="password"
                value={settings.sms_private_api_secret}
                onChange={(e) => set("sms_private_api_secret", e.target.value)}
                placeholder="Leave blank to keep the saved value"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default country code</Label>
              <Input
                value={settings.sms_default_country_code}
                onChange={(e) => set("sms_default_country_code", e.target.value)}
                placeholder="27"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cost per message (ZAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={settings.sms_unit_cost}
                onChange={(e) => set("sms_unit_cost", e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">API endpoint (optional override)</Label>
              <Input
                value={settings.sms_api_base}
                onChange={(e) => set("sms_api_base", e.target.value)}
                placeholder="Leave blank to use the provider default"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save settings"}
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Test number</Label>
                <Input
                  className="w-44"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="082 123 4567"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                <Send className="h-4 w-4 mr-1" /> {testing ? "Sending…" : "Send test SMS"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
