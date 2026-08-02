import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PROSPECT_STATUSES, STATUS_LABEL, CONTACT_ROLES } from "@/lib/outreach-templates";
import { Plus, Trash2 } from "lucide-react";

export interface ProspectRecord {
  id: string;
  club_name: string;
  association: string | null;
  city: string | null;
  country: string;
  courts: number | null;
  website: string | null;
  club_subdomain: string | null;
  is_nsa: boolean;
  source: string | null;
  tags: string[];
  notes: string | null;
  status: string;
  follow_up_date: string | null;
}

interface ContactRow {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  opted_out?: boolean;
  bounced?: boolean;
}

const BLANK: Omit<ProspectRecord, "id"> = {
  club_name: "", association: "", city: "", country: "South Africa", courts: null,
  website: "", club_subdomain: "", is_nsa: false, source: "", tags: [], notes: "", status: "new", follow_up_date: null,
};

export function ProspectEditorDialog({
  open, onOpenChange, prospect, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: ProspectRecord | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Omit<ProspectRecord, "id">>(BLANK);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemoved([]);
    if (prospect) {
      const { id, ...rest } = prospect;
      setForm({ ...rest, association: rest.association ?? "", city: rest.city ?? "", website: rest.website ?? "", club_subdomain: rest.club_subdomain ?? "", source: rest.source ?? "", notes: rest.notes ?? "" });
      supabase
        .from("outreach_contacts")
        .select("id,name,role,email,phone,is_primary,opted_out,bounced")
        .eq("prospect_id", id)
        .order("is_primary", { ascending: false })
        .then(({ data }) =>
          setContacts(
            (data ?? []).map((c) => ({
              id: c.id, name: c.name ?? "", role: c.role ?? "", email: c.email,
              phone: c.phone ?? "", is_primary: c.is_primary, opted_out: c.opted_out, bounced: c.bounced,
            })),
          ),
        );
    } else {
      setForm(BLANK);
      setContacts([{ name: "", role: "Chairman", email: "", phone: "", is_primary: true }]);
    }
  }, [open, prospect]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.club_name.trim()) {
      toast({ title: "Club name is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        club_name: form.club_name.trim(),
        association: form.association || null,
        city: form.city || null,
        country: form.country || "South Africa",
        courts: form.courts,
        website: form.website || null,
        club_subdomain: form.club_subdomain?.trim() || null,
        is_nsa: form.is_nsa,
        source: form.source || null,
        tags: form.tags,
        notes: form.notes || null,
        status: form.status,
        follow_up_date: form.follow_up_date || null,
      };

      let prospectId = prospect?.id;
      if (prospectId) {
        const { error } = await supabase.from("outreach_prospects").update(payload).eq("id", prospectId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("outreach_prospects").insert(payload).select("id").single();
        if (error) throw error;
        prospectId = data.id;
      }

      if (removed.length) {
        await supabase.from("outreach_contacts").delete().in("id", removed);
      }

      for (const c of contacts) {
        if (!c.email.trim()) continue;
        const row = {
          prospect_id: prospectId!,
          name: c.name || null,
          role: c.role || null,
          email: c.email.trim().toLowerCase(),
          phone: c.phone || null,
          is_primary: c.is_primary,
        };
        if (c.id) {
          const { error } = await supabase.from("outreach_contacts").update(row).eq("id", c.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("outreach_contacts").insert(row);
          if (error) throw error;
        }
      }

      toast({ title: prospect ? "Club updated" : "Club added" });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: "Could not save", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prospect ? "Edit club" : "Add club"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Club name *</Label>
            <Input value={form.club_name} onChange={(e) => set("club_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Association / province</Label>
            <Input value={form.association ?? ""} onChange={(e) => set("association", e.target.value)} placeholder="Squash Northerns" />
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Courts</Label>
            <Input
              type="number"
              value={form.courts ?? ""}
              onChange={(e) => set("courts", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label className="text-xs">Website</Label>
            <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">SquashHub club slug</Label>
            <Input
              value={form.club_subdomain ?? ""}
              onChange={(e) => set("club_subdomain", e.target.value.toLowerCase().trim())}
              placeholder="e.g. csi"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {form.club_subdomain
                ? `${form.club_subdomain}.squashhub.co.za — used by {{club_link}} / {{club_url}}`
                : "Leave blank if the club isn't live yet."}
            </p>
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Input value={form.source ?? ""} onChange={(e) => set("source", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Tags (comma separated)</Label>
            <Input
              value={form.tags.join(", ")}
              onChange={(e) => set("tags", e.target.value.split(/[,;]/).map((t) => t.trim()).filter(Boolean))}
              placeholder="nsa-pretoria, gauteng"
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROSPECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Follow up on</Label>
            <Input
              type="date"
              value={form.follow_up_date ?? ""}
              onChange={(e) => set("follow_up_date", e.target.value || null)}
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch checked={form.is_nsa} onCheckedChange={(v) => set("is_nsa", v)} />
            <Label className="text-xs">NSA affiliated</Label>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold">Contacts</Label>
            <Button
              size="sm" variant="outline"
              onClick={() => setContacts((c) => [...c, { name: "", role: "Secretary", email: "", phone: "", is_primary: false }])}
            >
              <Plus className="h-3 w-3 mr-1" /> Add contact
            </Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={c.id ?? `new-${i}`} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-3" placeholder="Name" value={c.name}
                  onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <Select
                  value={c.role || "Other"}
                  onValueChange={(v) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, role: v } : x)))}
                >
                  <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="col-span-4" placeholder="email@club.co.za" value={c.email}
                  onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                />
                <Input
                  className="col-span-2" placeholder="Phone" value={c.phone}
                  onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                />
                <Button
                  size="icon" variant="ghost" className="col-span-1"
                  onClick={() => {
                    if (c.id) setRemoved((r) => [...r, c.id!]);
                    setContacts((p) => p.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
                {(c.opted_out || c.bounced) && (
                  <p className="col-span-12 text-[11px] text-amber-500">
                    {c.opted_out ? "Opted out — will not be emailed. " : ""}
                    {c.bounced ? "Address bounced — will not be emailed." : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
