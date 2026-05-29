import { useState, useEffect } from "react";
import { Club } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, KeyRound, ScanFace, CreditCard, Lock, HelpCircle, Copy, Webhook, DoorOpen } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

const ACCESS_METHODS = [
  { value: "none", label: "No Access Control", icon: Lock, description: "Courts are open — no electronic access system" },
  { value: "key", label: "Physical Key / Lock", icon: KeyRound, description: "Traditional key-based access. No integration needed." },
  { value: "tap_card", label: "Tap Card / Fob", icon: CreditCard, description: "RFID / NFC card readers (HID, Salto, Paxton, etc.)" },
  { value: "pin", label: "PIN Code", icon: KeyRound, description: "Keypad entry with member-specific PINs" },
  { value: "face_recognition", label: "Face Recognition", icon: ScanFace, description: "Biometric facial recognition for court access" },
  { value: "remote_trigger", label: "Remote Door Trigger (Fluss+)", icon: DoorOpen, description: "WiFi relay opens the gate/door on demand from the SquashHub app" },
  { value: "other", label: "Other", icon: HelpCircle, description: "Custom system — contact SquashHub for integration" },
] as const;


type AccessType = typeof ACCESS_METHODS[number]["value"];

const FACE_PROVIDERS = [
  { value: "zkbio", label: "ZKTeco — ZKBio CVSecurity / ZKBio Access", note: "Free for up to 10 devices. Open REST API. Runs on a dedicated on-site PC — its URL must be reachable from the internet (or a VPN/tunnel) for direct sync." },
  { value: "zk_push", label: "ZKTeco — Standalone terminal (Push protocol)", note: "Best for LAN-only installs. The terminal posts events to our webhook URL on its heartbeat. No port-forwarding needed." },
  { value: "hikvision", label: "Hikvision (ISAPI)", note: "Recommended when you need photo-based enrolment from a passport-style picture. Requires the device IP/credentials." },
  { value: "generic", label: "Generic / Manual", note: "Just track face enrolment in SquashHub. No automatic sync to a device." },
] as const;

export function AccessControlTab({ club, clubId }: { club: Club; clubId: string }) {
  const { data: secrets } = useClubSecrets(clubId);
  const [form, setForm] = useState({
    access_control_type: "none" as AccessType,
    access_control_api_key: "",
    access_control_api_url: "",
    access_provider: "zkbio",
    zk_base_url: "",
    zk_username: "",
    zk_password: "",
    zk_area_id: "",
    zk_door_group: "",
    zk_webhook_secret: "",
    fluss_api_token: "",
    fluss_default_device_id: "",
  });



  const [faceEnrolmentRequired, setFaceEnrolmentRequired] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (secrets) {
      const s = secrets as any;
      setForm({
        access_control_type: (s.access_control_type || "none") as AccessType,
        access_control_api_key: s.access_control_api_key || "",
        access_control_api_url: s.access_control_api_url || "",
        access_provider: s.access_provider || "zkbio",
        zk_base_url: s.zk_base_url || "",
        zk_username: s.zk_username || "",
        zk_password: s.zk_password || "",
        zk_area_id: s.zk_area_id || "",
        zk_door_group: s.zk_door_group || "",
        zk_webhook_secret: s.zk_webhook_secret || "",
      });
    }
  }, [secrets]);

  useEffect(() => {
    setFaceEnrolmentRequired(!!(club as any)?.face_enrolment_required);
  }, [club]);

  const generateSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const s = Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
    setForm(p => ({ ...p, zk_webhook_secret: s }));
  };

  const webhookUrl = form.zk_webhook_secret
    ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/access-zk-push?club_id=${clubId}&secret=${form.zk_webhook_secret}`
    : "";

  const handleSave = async () => {
    try {
      await updateSecrets.mutateAsync({
        club_id: clubId,
        access_control_type: form.access_control_type,
        access_control_api_key: form.access_control_api_key || null,
        access_control_api_url: form.access_control_api_url || null,
        access_provider: form.access_provider,
        zk_base_url: form.zk_base_url || null,
        zk_username: form.zk_username || null,
        zk_password: form.zk_password || null,
        zk_area_id: form.zk_area_id || null,
        zk_door_group: form.zk_door_group || null,
        zk_webhook_secret: form.zk_webhook_secret || null,
      } as any);

      if (form.access_control_type === "face_recognition") {
        await fromExt("clubs").update({ face_enrolment_required: faceEnrolmentRequired }).eq("id", clubId);
      } else if ((club as any)?.face_enrolment_required) {
        await fromExt("clubs").update({ face_enrolment_required: false }).eq("id", clubId);
      }

      toast.success("Access control settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Minimal client-side probe — actual auth happens server-side at sync time.
      if (!form.zk_base_url) throw new Error("Set the device/server URL first");
      const r = await fetch(form.zk_base_url, { method: "HEAD", mode: "no-cors" }).catch(() => null);
      toast.success(r ? "URL is reachable from your browser. Server credentials will be tested on first sync." : "URL was not reachable from your browser — it may still be reachable from the server. Try a sync.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { data: members } = await fromExt("club_members")
        .select("id, avatar_url")
        .eq("club_id", clubId)
        .not("avatar_url", "is", null);
      const list = (members as any[]) || [];
      let ok = 0, fail = 0;
      for (const m of list) {
        const { error } = await supabase.functions.invoke("access-provision-member", {
          body: { club_id: clubId, club_member_id: m.id },
        });
        if (error) fail++; else ok++;
      }
      toast.success(`Sync complete — ${ok} pushed, ${fail} failed`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const selected = ACCESS_METHODS.find(m => m.value === form.access_control_type);
  const needsApi = ["tap_card", "pin"].includes(form.access_control_type);
  const isFaceRec = form.access_control_type === "face_recognition";
  const isOther = form.access_control_type === "other";
  const isSimple = ["none", "key"].includes(form.access_control_type);
  const providerInfo = FACE_PROVIDERS.find(p => p.value === form.access_provider);

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Court Access Control</h3>
        <p className="text-sm text-muted-foreground">
          Configure how members access the courts at your venue.
        </p>

        <div className="space-y-1">
          <Label>Access Method</Label>
          <Select
            value={form.access_control_type}
            onValueChange={(v: AccessType) => setForm(p => ({ ...p, access_control_type: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCESS_METHODS.map(m => {
                const Icon = m.icon;
                return (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" />
                      {m.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{selected?.description}</p>
        </div>

        {needsApi && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>API Endpoint URL</Label>
              <Input
                value={form.access_control_api_url}
                onChange={e => setForm(p => ({ ...p, access_control_api_url: e.target.value }))}
                placeholder="https://api.your-access-system.com/v1"
              />
            </div>
            <div className="space-y-1">
              <Label>API Key / Token</Label>
              <Input
                type="password"
                value={form.access_control_api_key}
                onChange={e => setForm(p => ({ ...p, access_control_api_key: e.target.value }))}
                placeholder="Your access system API key"
              />
            </div>
          </div>
        )}

        {isFaceRec && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
              <ScanFace className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">Face Recognition Integration</p>
                <p>
                  Members enrol a face photo in SquashHub (selfie or upload). The photo and identity are then pushed
                  to your access provider so the door terminal can recognise them.
                </p>
                <p>
                  Biometric data has <strong>POPIA implications</strong> — members must give explicit consent during enrolment.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Provider</Label>
              <Select
                value={form.access_provider}
                onValueChange={(v) => setForm(p => ({ ...p, access_provider: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FACE_PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{providerInfo?.note}</p>
            </div>

            {form.access_provider === "zkbio" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label>ZKBio Server URL</Label>
                  <Input
                    placeholder="http://your-server-ip:8088"
                    value={form.zk_base_url}
                    onChange={e => setForm(p => ({ ...p, zk_base_url: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The ZKBio software runs on a dedicated PC at the club. For SquashHub to push enrolments,
                    this URL must be reachable from the internet (port-forward, VPN or tunnel). If it's LAN-only,
                    use the <strong>Standalone Push</strong> provider instead.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>API Username</Label>
                  <Input value={form.zk_username} onChange={e => setForm(p => ({ ...p, zk_username: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>API Password</Label>
                  <Input type="password" value={form.zk_password} onChange={e => setForm(p => ({ ...p, zk_password: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Default Area / Department ID</Label>
                  <Input value={form.zk_area_id} onChange={e => setForm(p => ({ ...p, zk_area_id: e.target.value }))} placeholder="1" />
                </div>
                <div className="space-y-1">
                  <Label>Default Door / Access Group</Label>
                  <Input value={form.zk_door_group} onChange={e => setForm(p => ({ ...p, zk_door_group: e.target.value }))} placeholder="Members" />
                </div>
              </div>
            )}

            {form.access_provider === "zk_push" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={form.zk_webhook_secret}
                    placeholder="Click Generate to create a shared secret"
                  />
                  <Button type="button" variant="outline" onClick={generateSecret}>Generate</Button>
                </div>
                {webhookUrl && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Webhook className="w-3.5 h-3.5" /> Configure your ZK terminal to post to:
                    </div>
                    <div className="flex gap-2">
                      <Input readOnly value={webhookUrl} className="text-[11px] font-mono" />
                      <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copied"); }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      In your ZK device's "Cloud Server" / "Push" settings, set the server URL to the host portion
                      above and the path to <code>/access-zk-push</code>. Pass <code>club_id</code> and <code>secret</code>
                      as the query string shown.
                    </p>
                  </div>
                )}
              </div>
            )}

            {form.access_provider === "hikvision" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label>Device / NVR URL</Label>
                  <Input
                    placeholder="http://device-ip"
                    value={form.zk_base_url}
                    onChange={e => setForm(p => ({ ...p, zk_base_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input value={form.zk_username} onChange={e => setForm(p => ({ ...p, zk_username: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input type="password" value={form.zk_password} onChange={e => setForm(p => ({ ...p, zk_password: e.target.value }))} />
                </div>
                <p className="text-[11px] text-muted-foreground md:col-span-2">
                  Hikvision integration via ISAPI — supports enrolling members from a photograph. Push from SquashHub
                  to the device will be enabled in the next update; for now this saves your credentials.
                </p>
              </div>
            )}

            {(form.access_provider === "zkbio" || form.access_provider === "hikvision") && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing}>
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                <Button type="button" variant="outline" onClick={handleSyncAll} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync all enrolled members"}
                </Button>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                id="face-enrolment"
                checked={faceEnrolmentRequired}
                onCheckedChange={(checked) => setFaceEnrolmentRequired(!!checked)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="face-enrolment" className="text-sm font-medium cursor-pointer">
                  Require face enrolment during member registration
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  New and existing members will be prompted to complete face enrolment before gaining court access.
                </p>
              </div>
            </div>
          </div>
        )}

        {isOther && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Custom Access System</p>
              <p className="text-xs text-muted-foreground">
                Using a system not listed here? Contact us at{" "}
                <a href="mailto:support@squashhub.co.za" className="underline text-primary">support@squashhub.co.za</a>{" "}
                with details about your hardware and we'll work with you to integrate it.
              </p>
            </div>
          </div>
        )}

        {!isSimple && (
          <Button onClick={handleSave} disabled={updateSecrets.isPending} className="w-full md:w-auto">
            {updateSecrets.isPending ? "Saving..." : "Save Access Settings"}
          </Button>
        )}

        {isSimple && form.access_control_type !== (secrets as any)?.access_control_type && (
          <Button onClick={handleSave} disabled={updateSecrets.isPending} className="w-full md:w-auto">
            {updateSecrets.isPending ? "Saving..." : "Save"}
          </Button>
        )}
      </Card>
    </div>
  );
}
