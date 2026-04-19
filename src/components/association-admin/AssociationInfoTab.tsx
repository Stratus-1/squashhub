import { useState, useRef } from "react";
import { Club, useUpdateClub, useClubMembers, ClubMember } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Upload, X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssociationInfoTab({ club, clubId }: { club: Club; clubId: string }) {
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
    league_member_annual_fee: club.league_member_annual_fee ?? 0,
    league_fee_due_month: club.league_fee_due_month ?? 1,
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

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
      payload.league_member_annual_fee = Number(payload.league_member_annual_fee) || 0;
      payload.league_fee_due_month = Math.min(12, Math.max(1, Number(payload.league_fee_due_month) || 1));
      await updateClub.mutateAsync({ id: club.id, ...payload });
      toast.success("Association info saved — fee propagated to all affiliated clubs");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const getMemberLabel = (m: ClubMember) => {
    const name = m.name || m.profiles?.name || "Unknown";
    const phone = m.phone || m.profiles?.phone || "";
    return phone ? `${name} (${phone})` : name;
  };

  const SearchableMemberSelect = ({ label, value, field }: { label: string; value: string; field: string }) => {
    const [open, setOpen] = useState(false);
    const selected = members.find(m => m.id === value);

    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
              {selected ? getMemberLabel(selected) : "Select member..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search member..." />
              <CommandList>
                <CommandEmpty>No member found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={() => { setForm(p => ({ ...p, [field]: "" })); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                    — None —
                  </CommandItem>
                  {members.map(m => (
                    <CommandItem key={m.id} value={getMemberLabel(m)} onSelect={() => { setForm(p => ({ ...p, [field]: m.id })); setOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                      {getMemberLabel(m)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected && (
          <p className="text-xs text-muted-foreground">
            Tel: {selected.phone || selected.profiles?.phone || "N/A"}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Logo */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Association Logo</h3>
        <div className="flex items-center gap-4">
          {form.logo_url ? (
            <div className="relative">
              <img src={form.logo_url} alt="Association logo" className="w-20 h-20 object-contain rounded-md border" />
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

      {/* Association Information */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Association Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Association Name</Label><Input value={form.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={set("phone")} /></div>
        </div>
      </Card>

      {/* Annual League Fee */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Annual League Fee</h3>
          <p className="text-xs text-muted-foreground mt-1">
            This fee will automatically appear in every affiliated club's fee list and be billed to members who opt into this league.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Annual Fee per Member (R)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.league_member_annual_fee}
              onChange={(e) => setForm(p => ({ ...p, league_member_annual_fee: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Fee Due Month (1=Jan, 12=Dec)</Label>
            <Input
              type="number"
              min="1"
              max="12"
              step="1"
              value={form.league_fee_due_month}
              onChange={(e) => setForm(p => ({ ...p, league_fee_due_month: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Card>

      {/* Office Bearers */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Office Bearers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchableMemberSelect label="Chairman" value={form.chairman_member_id} field="chairman_member_id" />
          <SearchableMemberSelect label="Secretary" value={form.secretary_member_id} field="secretary_member_id" />
          <SearchableMemberSelect label="President" value={form.club_captain_member_id} field="club_captain_member_id" />
        </div>
      </Card>

      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Association Info"}
      </Button>
    </div>
  );
}
