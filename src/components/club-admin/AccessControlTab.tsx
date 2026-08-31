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
import { AlertCircle, KeyRound, ScanFace, CreditCard, Lock, HelpCircle, Copy, Webhook, DoorOpen, Wifi, MapPin } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { formatLatLngDM, toDMS } from "@/lib/geo-format";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

const ACCESS_METHODS = [
  { value: "none", label: "No Access Control", icon: Lock, description: "Courts are open — no electronic access system" },
  { value: "key", label: "Physical Key / Lock", icon: KeyRound, description: "Traditional key-based access. No integration needed." },
  { value: "tap_card", label: "Tap Card / Fob", icon: CreditCard, description: "RFID / NFC card readers (HID, Salto, Paxton, etc.)" },
  { value: "pin", label: "PIN Code", icon: KeyRound, description: "Keypad entry with member-specific PINs" },
  { value: "face_recognition", label: "Face Recognition", icon: ScanFace, description: "Biometric facial recognition for court access" },
  { value: "remote_trigger", label: "Remote Door Trigger (Fluss+)", icon: DoorOpen, description: "WiFi relay opens the gate/door on demand from the SquashHub app" },
  { value: "shelly_relay", label: "Shelly Cloud Relay (1 Mini / Plus 1)", icon: Wifi, description: "Low-cost WiFi relay (Shelly 1 Mini Gen3) — SquashHub pulses the relay via Shelly Cloud and logs which member opened the door" },
  { value: "other", label: "Other", icon: HelpCircle, description: "Custom system — contact SquashHub for integration" },
] as const;



type AccessType = typeof ACCESS_METHODS[number]["value"];

const FACE_PROVIDERS = [
  { value: "zkbio", label: "ZKTeco — ZKBio CVSecurity / ZKBio Access", note: "Free for up to 10 devices. Open REST API. Runs on a dedicated on-site PC — its URL must be reachable from the internet (or a VPN/tunnel) for direct sync." },
  { value: "zk_push", label: "ZKTeco — Standalone terminal (Push protocol)", note: "Best for LAN-only installs. The terminal posts events to our webhook URL on its heartbeat. No port-forwarding needed." },
  { value: "hikvision", label: "Hikvision (ISAPI)", note: "Recommended when you need photo-based enrolment from a passport-style picture. Requires the device IP/credentials." },
  { value: "generic", label: "Generic / Manual", note: "Just track face enrolment in SquashHub. No automatic sync to a device." },
] as const;

import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";
import { EditLock, useEditLock } from "./setup/EditLock";

export function AccessControlTab({ club, clubId }: { club: Club; clubId: string }) {
  const [step, setStep] = useState("method");
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

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
  const [geofence, setGeofence] = useState({
    enabled: false,
    lat: "",
    lng: "",
    radius: "150",
    autoRadius: "5",
    auto: false,
  });

  const [locating, setLocating] = useState(false);
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
        fluss_api_token: s.fluss_api_token || "",
        fluss_default_device_id: s.fluss_default_device_id || "",
      });

    }
  }, [secrets]);

  useEffect(() => {
    setFaceEnrolmentRequired(!!(club as any)?.face_enrolment_required);
    const c = club as any;
    setGeofence({
      enabled: !!c?.door_geofence_enabled,
      lat: c?.door_latitude != null ? String(c.door_latitude) : "",
      lng: c?.door_longitude != null ? String(c.door_longitude) : "",
      radius: String(c?.door_geofence_radius_m ?? 150),
      autoRadius: String(c?.door_auto_unlock_radius_m ?? 5),
      auto: !!c?.door_auto_unlock_enabled,
    });
  }, [club]);

  const resetSecretsForm = () => {
    const s = (secrets || {}) as any;
    setForm(p => ({
      ...p,
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
      fluss_api_token: s.fluss_api_token || "",
      fluss_default_device_id: s.fluss_default_device_id || "",
    }));
  };
  const resetGeofence = () => {
    const c = club as any;
    setGeofence({
      enabled: !!c?.door_geofence_enabled,
      lat: c?.door_latitude != null ? String(c.door_latitude) : "",
      lng: c?.door_longitude != null ? String(c.door_longitude) : "",
      radius: String(c?.door_geofence_radius_m ?? 150),
      autoRadius: String(c?.door_auto_unlock_radius_m ?? 5),
      auto: !!c?.door_auto_unlock_enabled,
    });
  };

  const methodLock = useEditLock(resetSecretsForm);
  const deviceLock = useEditLock(resetSecretsForm);
  const locationLock = useEditLock(resetGeofence);
  

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This device can't report a location");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeofence((p) => ({
          ...p,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        toast.success(`Pinned to your position (±${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location");
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  };

  const generateSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const s = Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
    setForm(p => ({ ...p, zk_webhook_secret: s }));
  };

  const webhookUrl = form.zk_webhook_secret
    ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/access-zk-push?club_id=${clubId}&secret=${form.zk_webhook_secret}`
    : "";

  const handleSave = async (onDone?: () => void) => {
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
        fluss_api_token: form.fluss_api_token || null,
        fluss_default_device_id: form.fluss_default_device_id || null,
      } as any);


      if (form.access_control_type === "face_recognition") {
        await fromExt("clubs").update({ face_enrolment_required: faceEnrolmentRequired }).eq("id", clubId);
      } else if ((club as any)?.face_enrolment_required) {
        await fromExt("clubs").update({ face_enrolment_required: false }).eq("id", clubId);
      }

      const latNum = geofence.lat.trim() === "" ? null : Number(geofence.lat);
      const lngNum = geofence.lng.trim() === "" ? null : Number(geofence.lng);
      if (geofence.enabled && (latNum == null || lngNum == null || Number.isNaN(latNum) || Number.isNaN(lngNum))) {
        throw new Error("Pin the door location before enabling proximity unlock");
      }
      await fromExt("clubs")
        .update({
          door_geofence_enabled: geofence.enabled,
          door_latitude: latNum,
          door_longitude: lngNum,
          // Phone GPS is accurate to ~10–30 m, so anything under 25 m makes the
          // "Open Door" tile effectively impossible to reach. Keep a sane floor.
          door_geofence_radius_m: Math.max(25, Math.min(2000, Number(geofence.radius) || 150)),
          door_auto_unlock_radius_m: Math.max(8, Math.min(500, Number(geofence.autoRadius) || 8)),
          door_auto_unlock_enabled: geofence.enabled && geofence.auto,

        } as any)
        .eq("id", clubId);

      toast.success("Access control settings saved");
      onDone?.();
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
  const isFluss = form.access_control_type === "remote_trigger";
  const isShelly = form.access_control_type === "shelly_relay";
  const isSimple = ["none", "key"].includes(form.access_control_type);
  const providerInfo = FACE_PROVIDERS.find(p => p.value === form.access_provider);


  const steps: SetupStep[] = [
    { id: "method", label: "Access method", description: "Step one — choose how members get into the venue: a key, a tap card, a PIN, face recognition or a smart relay on the door.", complete: form.access_control_type !== "none" },
    { id: "device", label: "Device setup", description: "Enter the details of the hardware you chose — API keys, provider endpoint or the door relay's device ID.", complete: !isSimple },
    { id: "location", label: "Door location", description: "Pin the door's GPS position so the Open Door tile only appears when a member is actually standing at the club.", complete: !!(club as any)?.door_latitude },
    
  ];

  return (
    <div className="space-y-4 mt-4">
      <SetupSteps steps={steps} value={step} onChange={setStep} />
      <Card className="p-6 space-y-4">

        {step === "method" && (
        <EditLock
          editing={methodLock.editing}
          onEdit={methodLock.edit}
          onCancel={methodLock.cancel}
          onSave={() => handleSave(methodLock.done)}
          saving={updateSecrets.isPending}
          title="access method"
        >
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
        </EditLock>
        )}

        {step === "device" && (
        <EditLock
          editing={deviceLock.editing}
          onEdit={deviceLock.edit}
          onCancel={deviceLock.cancel}
          onSave={() => handleSave(deviceLock.done)}
          saving={updateSecrets.isPending}
          locked={isSimple}
          lockedHint="This access method needs no hardware setup — pick a card, PIN, face or relay method on step 1 to configure a device."
          title="device settings"
        >
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

        {isFluss && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
              <DoorOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">Fluss+ Remote Trigger</p>
                <p>
                  Fluss+ is a WiFi relay (made in South Africa) that opens your gate or door on demand.
                  SquashHub triggers the device when a member with an active booking taps "Open court".
                </p>
                <p>
                  Get your <strong>API token</strong> and <strong>device IDs</strong> from your Fluss
                  account at <a href="https://fluss.io" target="_blank" rel="noreferrer" className="underline">fluss.io</a>.
                  Trigger-only — Fluss does not track who walked through; the booking is the audit record.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label>Fluss API Token</Label>
                <Input
                  type="password"
                  value={form.fluss_api_token}
                  onChange={e => setForm(p => ({ ...p, fluss_api_token: e.target.value }))}
                  placeholder="Bearer token from your Fluss account"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Default Device ID</Label>
                <Input
                  value={form.fluss_default_device_id}
                  onChange={e => setForm(p => ({ ...p, fluss_default_device_id: e.target.value }))}
                  placeholder="e.g. front-gate"
                />
                <p className="text-[10px] text-muted-foreground">
                  Used when a court doesn't have its own Fluss device. Set per-court device IDs in
                  <strong> Courts → Edit court</strong> to map specific Fluss+ relays to each court.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!form.fluss_api_token || !form.fluss_default_device_id}
              onClick={async () => {
                try {
                  const { error } = await supabase.functions.invoke("fluss-trigger", {
                    body: { club_id: clubId, device_id: form.fluss_default_device_id },
                  });
                  if (error) throw error;
                  toast.success("Trigger sent to Fluss");
                } catch (err: any) {
                  toast.error(err.message || "Trigger failed");
                }
              }}
            >
              Test trigger (default device)
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Shelly door setup moved</p>
            <p className="text-xs text-muted-foreground">
              The Shelly relay fields now live in the IoT / Shelly tile, alongside court lights and registered devices.
            </p>
            <a href="/club-admin?tab=devices" className="text-xs font-medium text-primary underline">
              Open IoT / Shelly
            </a>
          </div>
        </div>

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
        </EditLock>
        )}

        {step === "location" && (
        <EditLock
          editing={locationLock.editing}
          onEdit={locationLock.edit}
          onCancel={locationLock.cancel}
          onSave={() => handleSave(locationLock.done)}
          saving={updateSecrets.isPending}
          locked={!(isShelly || isFluss)}
          lockedHint="Door location only applies to smart-relay doors (Shelly or Fluss). Choose one on step 1 first."
          title="door location"
        >
        {(isShelly || isFluss) && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Proximity unlock (GPS)
                </p>
                <p className="text-xs text-muted-foreground">
                  Only prompt members to open the door when their phone is near the club.
                  Club admins can still unlock remotely.
                </p>
              </div>
              <Switch
                checked={geofence.enabled}
                onCheckedChange={(v) => setGeofence((p) => ({ ...p, enabled: v }))}
              />
            </div>

            {geofence.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input
                      value={geofence.lat}
                      onChange={(e) => setGeofence((p) => ({ ...p, lat: e.target.value }))}
                      placeholder="-25.474"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input
                      value={geofence.lng}
                      onChange={(e) => setGeofence((p) => ({ ...p, lng: e.target.value }))}
                      placeholder="30.970"
                    />
                  </div>
                </div>
                {Number.isFinite(parseFloat(geofence.lat)) &&
                  Number.isFinite(parseFloat(geofence.lng)) && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatLatLngDM(parseFloat(geofence.lat), parseFloat(geofence.lng))}
                      {" · "}
                      {toDMS(parseFloat(geofence.lat), "lat")} {toDMS(parseFloat(geofence.lng), "lng")}
                    </p>
                  )}
                <div className="space-y-1">
                  <Label>Button radius (metres)</Label>
                  <Input
                    type="number"
                    min={25}
                    max={2000}
                    value={geofence.radius}
                    onChange={(e) => setGeofence((p) => ({ ...p, radius: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    How close a member must be for the "Open Door" tile to appear. 50–150 m works
                    well. Phone GPS is only accurate to about 10–30 m, so anything under 25 m
                    hides the tile even when the member is standing at the door (minimum 25 m).
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Auto-unlock radius (metres)</Label>
                  <Input
                    type="number"
                    min={8}
                    max={500}
                    value={geofence.autoRadius}
                    onChange={(e) => setGeofence((p) => ({ ...p, autoRadius: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Tight ring right at the door (10–15 m) where the door opens by itself. Must be
                    smaller than the button radius.
                  </p>
                </div>

                <Button type="button" variant="outline" size="sm" disabled={locating} onClick={useMyLocation} className="gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {locating ? "Getting location…" : "Use my current location (stand at the door)"}
                </Button>

                <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Auto-unlock at the door</p>
                    <p className="text-xs text-muted-foreground">
                      Opens automatically only once the member reaches the auto-unlock
                      radius — not on entering the wider button radius. Fires once per
                      visit and re-arms after they leave the area (or 30 minutes later).
                    </p>
                  </div>
                  <Switch
                    checked={geofence.auto}
                    onCheckedChange={(v) => setGeofence((p) => ({ ...p, auto: v }))}
                  />
                </div>

              </div>
            )}
          </div>
        )}
        </EditLock>
        )}


      </Card>
      <SetupStepNav steps={steps} value={step} onChange={setStep} />
    </div>
  );
}
