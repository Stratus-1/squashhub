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
import { AlertCircle, KeyRound, ScanFace, CreditCard, Lock, HelpCircle } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";

const ACCESS_METHODS = [
  { value: "none", label: "No Access Control", icon: Lock, description: "Courts are open — no electronic access system" },
  { value: "key", label: "Physical Key / Lock", icon: KeyRound, description: "Traditional key-based access. No integration needed." },
  { value: "tap_card", label: "Tap Card / Fob", icon: CreditCard, description: "RFID / NFC card readers (HID, Salto, Paxton, etc.)" },
  { value: "pin", label: "PIN Code", icon: KeyRound, description: "Keypad entry with member-specific PINs" },
  { value: "face_recognition", label: "Face Recognition", icon: ScanFace, description: "Biometric facial recognition for court access" },
  { value: "other", label: "Other", icon: HelpCircle, description: "Custom system — contact SquashHub for integration" },
] as const;

type AccessType = typeof ACCESS_METHODS[number]["value"];

export function AccessControlTab({ club, clubId }: { club: Club; clubId: string }) {
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [form, setForm] = useState({
    access_control_type: "none" as AccessType,
    access_control_api_key: "",
    access_control_api_url: "",
  });

  const [faceEnrolmentRequired, setFaceEnrolmentRequired] = useState(false);

  useEffect(() => {
    if (secrets) {
      setForm({
        access_control_type: ((secrets as any).access_control_type || "none") as AccessType,
        access_control_api_key: (secrets as any).access_control_api_key || "",
        access_control_api_url: (secrets as any).access_control_api_url || "",
      });
    }
  }, [secrets]);

  useEffect(() => {
    setFaceEnrolmentRequired(!!(club as any)?.face_enrolment_required);
  }, [club]);

  const handleSave = async () => {
    try {
      await updateSecrets.mutateAsync({
        club_id: clubId,
        access_control_type: form.access_control_type,
        access_control_api_key: form.access_control_api_key || null,
        access_control_api_url: form.access_control_api_url || null,
      } as any);

      // Save face enrolment flag on clubs table
      if (form.access_control_type === "face_recognition") {
        await fromExt("clubs").update({ face_enrolment_required: faceEnrolmentRequired }).eq("id", clubId);
      } else if ((club as any)?.face_enrolment_required) {
        // Turn off if switching away from face recognition
        await fromExt("clubs").update({ face_enrolment_required: false }).eq("id", clubId);
      }

      toast.success("Access control settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const selected = ACCESS_METHODS.find(m => m.value === form.access_control_type);
  const needsApi = ["tap_card", "pin", "face_recognition"].includes(form.access_control_type);
  const isFaceRec = form.access_control_type === "face_recognition";
  const isOther = form.access_control_type === "other";
  const isSimple = ["none", "key"].includes(form.access_control_type);

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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
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

        {/* API fields for integrable systems */}
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

        {/* Face recognition notice + enrolment checkbox */}
        {isFaceRec && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
              <ScanFace className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Face Recognition Integration</p>
                <p className="text-xs text-muted-foreground">
                  Face recognition requires camera hardware at your venue and enrolment of each member's facial data
                  during the registration process. This has <strong>POPIA compliance implications</strong> — biometric data
                  requires explicit consent.
                </p>
                <p className="text-xs text-muted-foreground">
                  Contact <a href="mailto:support@squashhub.co.za" className="underline text-primary">support@squashhub.co.za</a>{" "}
                  to discuss setup, hardware recommendations, and compliance requirements.
                </p>
              </div>
            </div>

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
                  When enabled, new and existing members will be required to complete face recognition enrolment
                  as part of the sign-up process before gaining court access.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Other system notice */}
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
