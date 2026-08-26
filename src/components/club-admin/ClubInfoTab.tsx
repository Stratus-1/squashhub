import { useState, useRef, useEffect } from "react";
import { Club, useUpdateClub, useClubMembers, ClubMember } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCY_OPTIONS, getCurrencyOption } from "@/lib/currency";
import { SetupSection } from "./setup/SetupSection";
import { SetupField } from "./setup/SetupField";
import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";

export function ClubInfoTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: members = [] } = useClubMembers(clubId);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState("identity");
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = () => ({
    name: club.name || "",
    address: club.address || "",
    email: club.email || "",
    contact_person_name: (club as any).contact_person_name || "",
    phone: club.phone || "",
    chairman_member_id: club.chairman_member_id || "",
    secretary_member_id: club.secretary_member_id || "",
    club_captain_member_id: club.club_captain_member_id || "",
    treasurer_member_id: club.treasurer_member_id || "",
    logo_url: club.logo_url || "",
    show_delegates_on_landing: club.show_delegates_on_landing ?? true,
    currency_code: ((club as any).currency_code || "ZAR") as string,
    currency_symbol: ((club as any).currency_symbol || "R") as string,
  });

  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.id]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const isEditing = (k: string) => !!editing[k];
  const startEdit = (k: string) => setEditing(p => ({ ...p, [k]: true }));
  const cancelEdit = (k: string) => { setForm(initial()); setEditing(p => ({ ...p, [k]: false })); };

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

  const save = async (sectionKey: string, fields: string[]) => {
    try {
      const payload: any = { id: club.id };
      fields.forEach(f => {
        let v = (form as any)[f];
        if (typeof v === "string" && v.trim() === "") v = null;
        payload[f] = v;
      });
      await updateClub.mutateAsync(payload);
      setEditing(p => ({ ...p, [sectionKey]: false }));
      toast.success("Saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const getMemberLabel = (m: ClubMember) => {
    const name = m.name || m.profiles?.name || "Unknown";
    const phone = m.phone || m.profiles?.phone || "";
    return phone ? `${name} (${phone})` : name;
  };
  const memberName = (id: string) => {
    const m = members.find(x => x.id === id);
    return m ? getMemberLabel(m) : "";
  };

  const SearchableMemberSelect = ({ label, value, field }: { label: string; value: string; field: string }) => {
    const [open, setOpen] = useState(false);
    const selected = members.find(m => m.id === value);
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
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
      </div>
    );
  };

  const steps: SetupStep[] = [
    { id: "identity", label: "Identity", description: "Give the club its name and upload the logo that appears on the app, invoices and emails.", complete: !!form.name && !!form.logo_url },
    { id: "contact", label: "Contact details", description: "Where members and visitors reach the club — address, phone, email and who to speak to.", complete: !!form.address && !!form.email && !!form.phone },
    { id: "bearers", label: "Office bearers", description: "Link the chairman, secretary and club captain to their member records, and choose whether they show on your public page.", complete: !!form.chairman_member_id || !!form.secretary_member_id || !!form.club_captain_member_id },
    { id: "currency", label: "Currency", description: "Pick the currency used for every fee, invoice, statement and bar sale.", complete: !!form.currency_code },
  ];

  return (
    <div className="space-y-4 mt-4">
      <SetupSteps steps={steps} value={step} onChange={setStep} />

      {step === "identity" && (
        <SetupSection
          title="Club name & logo"
          description="This is how the club is identified everywhere in the app."
          complete={!!form.name && !!form.logo_url}
          editing={isEditing("identity")}
          onEdit={() => startEdit("identity")}
          onCancel={() => cancelEdit("identity")}
          onSave={() => save("identity", ["name", "logo_url"])}
          saving={updateClub.isPending}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <SetupField label="Club Name" editing={isEditing("identity")} value={form.name}>
              <Input value={form.name} onChange={set("name")} />
            </SetupField>
            <div className="space-y-1">
              <Label className="text-xs">Club Logo</Label>
              <div className="flex items-center gap-4">
                {form.logo_url ? (
                  <div className="relative">
                    <img src={form.logo_url} alt="Club logo" className="w-20 h-20 object-contain rounded-md border" />
                    {isEditing("identity") && (
                      <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full" onClick={() => setForm(p => ({ ...p, logo_url: "" }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
                {isEditing("identity") && (
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      <Upload className="w-4 h-4 mr-1" />{uploading ? "Uploading..." : "Upload Logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">Max 2MB, JPG/PNG</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SetupSection>
      )}

      {step === "contact" && (
        <SetupSection
          title="Contact details"
          description="Shown on your club page, invoices and outgoing emails."
          complete={!!form.address && !!form.email && !!form.phone}
          editing={isEditing("contact")}
          onEdit={() => startEdit("contact")}
          onCancel={() => cancelEdit("contact")}
          onSave={() => save("contact", ["address", "email", "phone", "contact_person_name"])}
          saving={updateClub.isPending}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SetupField label="Address" editing={isEditing("contact")} value={form.address}>
              <Input value={form.address} onChange={set("address")} />
            </SetupField>
            <SetupField label="Email" editing={isEditing("contact")} value={form.email}>
              <Input type="email" value={form.email} onChange={set("email")} />
            </SetupField>
            <SetupField label="Phone" editing={isEditing("contact")} value={form.phone}>
              <Input type="tel" value={form.phone} onChange={set("phone")} />
            </SetupField>
            <SetupField label="Contact Person Name" editing={isEditing("contact")} value={form.contact_person_name}>
              <Input value={form.contact_person_name} onChange={set("contact_person_name")} placeholder="e.g. John Smith" />
            </SetupField>
          </div>
        </SetupSection>
      )}

      {step === "bearers" && (
        <SetupSection
          title="Office bearers"
          description="Chairman, secretary and club captain — pulled from your member list."
          complete={!!form.chairman_member_id || !!form.secretary_member_id || !!form.club_captain_member_id}
          editing={isEditing("bearers")}
          onEdit={() => startEdit("bearers")}
          onCancel={() => cancelEdit("bearers")}
          onSave={() => save("bearers", ["chairman_member_id", "secretary_member_id", "club_captain_member_id", "show_delegates_on_landing"])}
          saving={updateClub.isPending}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isEditing("bearers") ? (
                <>
                  <SearchableMemberSelect label="Chairman" value={form.chairman_member_id} field="chairman_member_id" />
                  <SearchableMemberSelect label="Secretary" value={form.secretary_member_id} field="secretary_member_id" />
                  <SearchableMemberSelect label="Club Captain" value={form.club_captain_member_id} field="club_captain_member_id" />
                </>
              ) : (
                <>
                  <SetupField label="Chairman" editing={false} value={memberName(form.chairman_member_id)}><span /></SetupField>
                  <SetupField label="Secretary" editing={false} value={memberName(form.secretary_member_id)}><span /></SetupField>
                  <SetupField label="Club Captain" editing={false} value={memberName(form.club_captain_member_id)}><span /></SetupField>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-delegates"
                disabled={!isEditing("bearers")}
                checked={form.show_delegates_on_landing}
                onCheckedChange={(checked) => setForm(p => ({ ...p, show_delegates_on_landing: checked }))}
              />
              <Label htmlFor="show-delegates" className="text-xs font-normal cursor-pointer">
                Show office bearers on the public club landing page
              </Label>
            </div>
          </div>
        </SetupSection>
      )}

      {step === "currency" && (
        <SetupSection
          title="Currency"
          description="All fees, invoices, statements and bar sales display in this currency."
          complete={!!form.currency_code}
          editing={isEditing("currency")}
          onEdit={() => startEdit("currency")}
          onCancel={() => cancelEdit("currency")}
          onSave={() => save("currency", ["currency_code", "currency_symbol"])}
          saving={updateClub.isPending}
        >
          <div className="max-w-sm">
            <SetupField
              label="Currency"
              editing={isEditing("currency")}
              value={`${form.currency_symbol} — ${getCurrencyOption(form.currency_code).name} (${form.currency_code})`}
            >
              <Select
                value={form.currency_code}
                onValueChange={(code) => {
                  const opt = getCurrencyOption(code);
                  setForm(p => ({ ...p, currency_code: opt.code, currency_symbol: opt.symbol }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map(o => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.symbol} — {o.name} ({o.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SetupField>
          </div>
        </SetupSection>
      )}

      <SetupStepNav steps={steps} value={step} onChange={setStep} />
    </div>
  );
}
