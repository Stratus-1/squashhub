import { useState, useRef } from "react";
import { Club, useUpdateClub, useClubMembers, ClubMember } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

export function ClubInfoTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: members = [] } = useClubMembers(clubId);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: club.name || "",
    address: club.address || "",
    email: club.email || "",
    phone: club.phone || "",
    chairman_member_id: club.chairman_member_id || "",
    secretary_member_id: club.secretary_member_id || "",
    club_captain_member_id: club.club_captain_member_id || "",
    logo_url: club.logo_url || "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const setSelect = (k: string) => (value: string) =>
    setForm(p => ({ ...p, [k]: value === "__none__" ? "" : value }));

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
      if (!payload.chairman_member_id) payload.chairman_member_id = null;
      if (!payload.secretary_member_id) payload.secretary_member_id = null;
      if (!payload.club_captain_member_id) payload.club_captain_member_id = null;
      if (!payload.logo_url) payload.logo_url = null;
      await updateClub.mutateAsync({ id: club.id, ...payload });
      toast.success("Club info saved");
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
        <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
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
              <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full" onClick={() => setForm(p => ({ ...p, logo_url: "" }))}>
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
              <Upload className="w-4 h-4 mr-1" />{uploading ? "Uploading..." : "Upload Logo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Max 2MB, JPG/PNG</p>
          </div>
        </div>
      </Card>

      {/* Club Information */}
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

      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Club Info"}
      </Button>
    </div>
  );
}
