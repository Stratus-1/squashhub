import { useState, useEffect } from "react";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings, Mail, Shield, Save, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface PlatformSettings {
  platform_sender_email: string;
  platform_sender_name: string;
  platform_smtp_host: string;
  platform_smtp_port: string;
  platform_smtp_user: string;
  platform_smtp_pass: string;
  hcaptcha_enabled: string;
  hcaptcha_site_key: string;
}

export default function SuperAdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>({
    platform_sender_email: "",
    platform_sender_name: "",
    platform_smtp_host: "",
    platform_smtp_port: "587",
    platform_smtp_user: "",
    platform_smtp_pass: "",
    hcaptcha_enabled: "true",
    hcaptcha_site_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "platform_sender_email",
        "platform_sender_name",
        "platform_smtp_host",
        "platform_smtp_port",
        "platform_smtp_user",
        "platform_smtp_pass",
        "hcaptcha_enabled",
        "hcaptcha_site_key",
      ]);

    if (data) {
      const mapped: Record<string, string> = {};
      data.forEach((row) => (mapped[row.key] = row.value));
      setSettings((prev) => ({ ...prev, ...mapped }));
    }
    setLoading(false);
  };

  const saveSetting = async (key: string, value: string) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(settings).map(([key, value]) => saveSetting(key, value))
      );
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SEO title="Settings — Super Admin" noIndex />
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SEO title="Settings — Super Admin" noIndex />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Platform Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Global configuration for email and security
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save All"}
        </Button>
      </div>

      {/* Email Settings */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Platform Email (No-Reply)</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Used for club creation confirmations and system emails when a club has
          not configured its own email settings.
        </p>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sender-name">Sender Name</Label>
            <Input
              id="sender-name"
              placeholder="SquashHub"
              value={settings.platform_sender_name}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_sender_name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="sender-email">Sender Email</Label>
            <Input
              id="sender-email"
              type="email"
              placeholder="noreply@squashhub.co.za"
              value={settings.platform_sender_email}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_sender_email: e.target.value }))
              }
            />
          </div>
        </div>
        <Separator />
        <h4 className="font-medium text-sm text-foreground">SMTP Configuration</h4>
        <p className="text-xs text-muted-foreground">
          Configure the SMTP server used to send platform emails. Required for
          sending confirmation and system emails.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="smtp-host">SMTP Host</Label>
            <Input
              id="smtp-host"
              placeholder="smtp.example.com"
              value={settings.platform_smtp_host}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_smtp_host: e.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="smtp-port">SMTP Port</Label>
            <Input
              id="smtp-port"
              type="number"
              placeholder="587"
              value={settings.platform_smtp_port}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_smtp_port: e.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="smtp-user">SMTP Username</Label>
            <Input
              id="smtp-user"
              placeholder="user@example.com"
              value={settings.platform_smtp_user}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_smtp_user: e.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="smtp-pass">SMTP Password</Label>
            <Input
              id="smtp-pass"
              type="password"
              placeholder="••••••••"
              value={settings.platform_smtp_pass}
              onChange={(e) =>
                setSettings((s) => ({ ...s, platform_smtp_pass: e.target.value }))
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Clubs that configure their own SMTP settings in Club Admin will use
          those for member communications instead of the platform defaults.
        </p>
      </Card>

      {/* hCaptcha Settings */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">hCaptcha Protection</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Protects login and signup forms against automated abuse.
        </p>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable hCaptcha</p>
            <p className="text-xs text-muted-foreground">
              When enabled, users must complete a captcha challenge on auth pages
            </p>
          </div>
          <Switch
            checked={settings.hcaptcha_enabled === "true"}
            onCheckedChange={(checked) =>
              setSettings((s) => ({
                ...s,
                hcaptcha_enabled: checked ? "true" : "false",
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor="hcaptcha-site-key">Site Key (Public)</Label>
          <Input
            id="hcaptcha-site-key"
            placeholder="Enter your hCaptcha site key"
            value={settings.hcaptcha_site_key}
            onChange={(e) =>
              setSettings((s) => ({ ...s, hcaptcha_site_key: e.target.value }))
            }
          />
          <p className="text-xs text-muted-foreground mt-1">
            Get your site key from{" "}
            <a
              href="https://dashboard.hcaptcha.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              hCaptcha Dashboard
            </a>
            . The secret key is stored securely as a backend secret.
          </p>
        </div>
      </Card>
    </div>
  );
}
