import { useState, useRef } from "react";
import { Club, useUpdateClub, useClubMembers, ClubMember } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function ClubDetailsTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: members = [] } = useClubMembers(clubId);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: club.name || "",
    address: club.address || "",
    email: club.email || "",
    phone: club.phone || "",
    bank_name: club.bank_name || "",
    bank_account_name: club.bank_account_name || "",
    bank_account_number: club.bank_account_number || "",
    bank_branch_code: club.bank_branch_code || "",
    bank_reference: club.bank_reference || "",
    payment_gateway: club.payment_gateway || "",
    payment_gateway_public_key: club.payment_gateway_public_key || "",
    payment_gateway_secret_key: club.payment_gateway_secret_key || "",
    chairman_member_id: club.chairman_member_id || "",
    secretary_member_id: club.secretary_member_id || "",
    club_captain_member_id: club.club_captain_member_id || "",
    logo_url: club.logo_url || "",
    member_number_prefix: club.member_number_prefix || "",
    member_number_length: club.member_number_length ?? 4,
    member_number_start: club.member_number_start ?? 1,
    challenge_levels_up: club.challenge_levels_up ?? 2,
    light_fee_per_hour: club.light_fee_per_hour ?? 0,
    shelly_auth_key: club.shelly_auth_key || "",
    sender_email: (club as any).sender_email || "",
    sender_name: (club as any).sender_name || "",
    smtp_host: (club as any).smtp_host || "",
    smtp_port: (club as any).smtp_port ?? "",
    smtp_user: (club as any).smtp_user || "",
    smtp_pass: (club as any).smtp_pass || "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const setSelect = (k: string) => (value: string) =>
    setForm(p => ({ ...p, [k]: value === "__none__" ? "" : value }));

  const setNumber = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: parseInt(e.target.value) || 0 }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${clubId}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("club-logos").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("club-logos").getPublicUrl(path);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      setForm(p => ({ ...p, logo_url: logoUrl }));
      // Auto-save logo to database immediately
      await updateClub.mutateAsync({ id: club.id, logo_url: logoUrl });
      toast.success("Logo uploaded & saved");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload: any = { ...form };
      // Convert empty strings to null for FK fields
      if (!payload.chairman_member_id) payload.chairman_member_id = null;
      if (!payload.secretary_member_id) payload.secretary_member_id = null;
      if (!payload.club_captain_member_id) payload.club_captain_member_id = null;
      if (!payload.logo_url) payload.logo_url = null;
      if (!payload.payment_gateway) payload.payment_gateway = null;
      if (!payload.payment_gateway_public_key) payload.payment_gateway_public_key = null;
      if (!payload.payment_gateway_secret_key) payload.payment_gateway_secret_key = null;
      if (!payload.shelly_auth_key) payload.shelly_auth_key = null;
      if (!payload.sender_email) payload.sender_email = null;
      if (!payload.sender_name) payload.sender_name = null;
      if (!payload.smtp_host) payload.smtp_host = null;
      if (payload.smtp_port === "" || payload.smtp_port === 0) payload.smtp_port = null;
      else payload.smtp_port = parseInt(payload.smtp_port) || null;
      if (!payload.smtp_user) payload.smtp_user = null;
      if (!payload.smtp_pass) payload.smtp_pass = null;
      await updateClub.mutateAsync({ id: club.id, ...payload });
      toast.success("Club details saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const getMemberLabel = (m: ClubMember) => {
    const name = m.name || m.profiles?.name || "Unknown";
    const phone = m.phone || m.profiles?.phone || "";
    return phone ? `${name} (${phone})` : name;
  };

  const MemberSelect = ({ label, value, field }: { label: string; value: string; field: string }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || "__none__"} onValueChange={setSelect(field)}>
        <SelectTrigger>
          <SelectValue placeholder="Select member" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {members.map(m => (
            <SelectItem key={m.id} value={m.id}>{getMemberLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && members.find(m => m.id === value) && (
        <p className="text-xs text-muted-foreground">
          Tel: {members.find(m => m.id === value)?.phone || members.find(m => m.id === value)?.profiles?.phone || "N/A"}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 mt-4">
      {/* Logo */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Club Logo</h3>
        <div className="flex items-center gap-4">
          {form.logo_url ? (
            <div className="relative">
              <img src={form.logo_url} alt="Club logo" className="w-20 h-20 object-contain rounded-md border" />
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full"
                onClick={() => setForm(p => ({ ...p, logo_url: "" }))}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground/50" />
            </div>
          )}
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? "Uploading..." : "Upload Logo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Max 2MB, JPG/PNG</p>
          </div>
        </div>
      </Card>

      {/* Club Info */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Club Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Club Name</Label><Input value={form.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={set("phone")} /></div>
        </div>
      </Card>

      {/* Office Bearers */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Office Bearers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MemberSelect label="Chairman" value={form.chairman_member_id} field="chairman_member_id" />
          <MemberSelect label="Secretary" value={form.secretary_member_id} field="secretary_member_id" />
          <MemberSelect label="Club Captain" value={form.club_captain_member_id} field="club_captain_member_id" />
        </div>
      </Card>

      {/* Bank Details */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Bank Name</Label><Input value={form.bank_name} onChange={set("bank_name")} /></div>
          <div className="space-y-1"><Label>Account Name</Label><Input value={form.bank_account_name} onChange={set("bank_account_name")} /></div>
          <div className="space-y-1"><Label>Account Number</Label><Input value={form.bank_account_number} onChange={set("bank_account_number")} /></div>
          <div className="space-y-1"><Label>Branch Code</Label><Input value={form.bank_branch_code} onChange={set("bank_branch_code")} /></div>
          <div className="space-y-1"><Label>Payment Reference</Label><Input value={form.bank_reference} onChange={set("bank_reference")} /></div>
        </div>
      </Card>

      {/* Payment Gateway */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Payment Gateway</h3>
        <p className="text-sm text-muted-foreground">Configure an online payment gateway (e.g. Yoco) for collecting fees.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Gateway Provider</Label>
            <Select value={form.payment_gateway || "__none__"} onValueChange={setSelect("payment_gateway")}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                <SelectItem value="yoco">Yoco</SelectItem>
                <SelectItem value="payfast">PayFast</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-1"><Label>Public / Publishable Key</Label><Input value={form.payment_gateway_public_key} onChange={set("payment_gateway_public_key")} placeholder="pk_live_..." /></div>
          <div className="space-y-1"><Label>Secret Key</Label><Input type="password" value={form.payment_gateway_secret_key} onChange={set("payment_gateway_secret_key")} placeholder="sk_live_..." /></div>
        </div>
      </Card>

      {/* Member Numbering */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Member Numbering</h3>
        <p className="text-sm text-muted-foreground">Configure how member numbers are generated (e.g. WRT-0001).</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Prefix</Label>
            <Input value={form.member_number_prefix} onChange={set("member_number_prefix")} placeholder="e.g. WRT" />
          </div>
          <div className="space-y-1">
            <Label>Number Length (digits)</Label>
            <Input type="number" min={1} max={10} value={form.member_number_length} onChange={setNumber("member_number_length")} />
          </div>
          <div className="space-y-1">
            <Label>Start From</Label>
            <Input type="number" min={0} value={form.member_number_start} onChange={setNumber("member_number_start")} />
          </div>
        </div>
        {form.member_number_prefix && (
          <p className="text-xs text-muted-foreground">
            Preview: <span className="font-mono font-semibold text-foreground">{form.member_number_prefix}-{String(form.member_number_start).padStart(form.member_number_length, "0")}</span>
          </p>
        )}
      </Card>

      {/* Court Lights */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Court Lights</h3>
        <p className="text-sm text-muted-foreground">Configure automatic court light control via Shelly smart relays.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Light Fee per Hour (R)</Label>
            <Input type="number" min={0} step={0.01} value={form.light_fee_per_hour} onChange={setNumber("light_fee_per_hour")} placeholder="e.g. 50" />
          </div>
          <div className="flex items-end">
            <p className="text-sm text-muted-foreground pb-2">
              {form.light_fee_per_hour > 0
                ? <>Members will be charged <span className="font-semibold text-foreground">R{form.light_fee_per_hour}</span>/hour when lights are enabled.</>
                : "No light fee configured — lights are free."}
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Shelly Cloud Auth Key</Label>
            <Input type="password" value={form.shelly_auth_key} onChange={set("shelly_auth_key")} placeholder="Paste your Shelly Cloud auth key" />
            <p className="text-xs text-muted-foreground">
              Find this in <a href="https://control.shelly.cloud" target="_blank" rel="noopener noreferrer" className="underline text-primary">Shelly Cloud</a> → Settings → Authorization Cloud Key. Required for automatic court light switching.
            </p>
          </div>
        </div>
      </Card>

      {/* Challenge Rules */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Challenge Rules</h3>
        <p className="text-sm text-muted-foreground">How many ladder positions up can a player challenge?</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Levels Up Allowed</Label>
            <Input type="number" min={1} max={10} value={form.challenge_levels_up} onChange={setNumber("challenge_levels_up")} />
          </div>
          <div className="flex items-end">
            <p className="text-sm text-muted-foreground pb-2">
              Players can challenge up to <span className="font-semibold text-foreground">{form.challenge_levels_up}</span> position{form.challenge_levels_up !== 1 ? "s" : ""} above them.
            </p>
          </div>
        </div>
      </Card>

      {/* Email Sender Settings */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Email Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Configure your club's outgoing email settings for member communications (login confirmations, match reminders, etc.).
          If left blank, the platform default (noreply@squashhub.co.za) will be used.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Sender Name</Label>
            <Input value={form.sender_name} onChange={set("sender_name")} placeholder="e.g. CSIR Squash Club" />
          </div>
          <div className="space-y-1">
            <Label>Sender Email</Label>
            <Input type="email" value={form.sender_email} onChange={set("sender_email")} placeholder="e.g. noreply@csir-squash.co.za" />
          </div>
          <div className="space-y-1">
            <Label>SMTP Host</Label>
            <Input value={form.smtp_host} onChange={set("smtp_host")} placeholder="e.g. smtp.gmail.com" />
          </div>
          <div className="space-y-1">
            <Label>SMTP Port</Label>
            <Input type="number" value={form.smtp_port} onChange={e => setForm(p => ({ ...p, smtp_port: e.target.value }))} placeholder="587" />
          </div>
          <div className="space-y-1">
            <Label>SMTP Username</Label>
            <Input value={form.smtp_user} onChange={set("smtp_user")} placeholder="SMTP username" />
          </div>
          <div className="space-y-1">
            <Label>SMTP Password</Label>
            <Input type="password" value={form.smtp_pass} onChange={set("smtp_pass")} placeholder="SMTP password" />
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Club Details"}
      </Button>

      <CourtsSection clubId={clubId} />
    </div>
  );
}

function CourtsSection({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [newCourt, setNewCourt] = useState("");
  const [editingRelay, setEditingRelay] = useState<Record<number, string>>({});

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string; relay_device_id: string | null; relay_server: string | null }[];
    },
  });

  const handleAdd = async () => {
    if (!newCourt.trim()) return;
    const { error } = await fromExt("courts").insert({ name: newCourt.trim(), club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Court added"); setNewCourt(""); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this court?")) return;
    const { error } = await fromExt("courts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Court removed"); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleSaveRelay = async (courtId: number) => {
    const deviceId = editingRelay[courtId] ?? "";
    const { error } = await fromExt("courts").update({ relay_device_id: deviceId || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success("Relay device saved");
      setEditingRelay(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Courts ({courts.length})</h3>
      <p className="text-xs text-muted-foreground">
        💡 To enable automatic court lights, add the Shelly device ID for each court.
        Get this from your Shelly Cloud account under Device Settings → Device ID.
      </p>
      <div className="space-y-3">
        {courts.map(c => {
          const courtId = c.id;
          const relayValue = editingRelay[courtId] ?? c.relay_device_id ?? "";
          return (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  value={relayValue}
                  onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                  placeholder="Shelly Device ID (e.g. 98cdac123456)"
                  className="flex-1 text-xs h-8"
                />
                {editingRelay[courtId] !== undefined && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleSaveRelay(courtId)}>
                    Save
                  </Button>
                )}
              </div>
              {c.relay_device_id && editingRelay[courtId] === undefined && (
                <p className="text-[10px] text-muted-foreground">✅ Relay configured — lights will auto-switch</p>
              )}
            </div>
          );
        })}
        {courts.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No courts added yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
    </Card>
  );
}
