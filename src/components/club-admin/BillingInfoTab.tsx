import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Save, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useClubBillingProfile,
  useSaveClubBillingProfile,
  useFinanceContacts,
  type ClubBillingProfile,
} from "@/hooks/use-club-billing";
import { useMemberContext } from "@/contexts/MemberContext";

const EMPTY: Omit<ClubBillingProfile, "club_id"> = {
  contact_name: "",
  company_name: "",
  emails: [],
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
  vat_number: "",
  po_number: "",
};

export function BillingInfoTab({ clubId, clubName }: { clubId: string; clubName?: string }) {
  const { data: profile, isLoading } = useClubBillingProfile(clubId);
  const { data: financeContacts = [] } = useFinanceContacts(clubId);
  const save = useSaveClubBillingProfile();
  const memberCtx: any = useMemberContext();
  const actorName =
    memberCtx?.activeMember?.name || memberCtx?.member?.name || "Club admin";

  const [form, setForm] = useState<Omit<ClubBillingProfile, "club_id">>(EMPTY);
  const [newEmail, setNewEmail] = useState("");

  // Seed the form: saved profile first, otherwise default from finance-permission members.
  useEffect(() => {
    if (isLoading) return;
    if (profile) {
      setForm({ ...EMPTY, ...profile, emails: profile.emails || [] });
    } else {
      const primary = financeContacts[0];
      setForm({
        ...EMPTY,
        contact_name: primary?.name || "",
        company_name: clubName || "",
        phone: primary?.phone || "",
        emails: Array.from(
          new Set(financeContacts.map((c: any) => (c.email || "").trim().toLowerCase()).filter(Boolean))
        ),
      });
    }
  }, [profile, isLoading, financeContacts, clubName]);

  const set = (k: keyof typeof EMPTY, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const addEmail = (raw?: string) => {
    const e = (raw ?? newEmail).trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast.error("Enter a valid email address");
    if (form.emails.includes(e)) return toast.info("That email is already on the list");
    set("emails", [...form.emails, e]);
    setNewEmail("");
  };

  const missingFinanceEmails = useMemo(
    () =>
      financeContacts
        .map((c: any) => (c.email || "").trim().toLowerCase())
        .filter((e: string) => e && !form.emails.includes(e)),
    [financeContacts, form.emails]
  );

  const onSave = async () => {
    if (form.emails.length === 0) return toast.error("Add at least one billing email");
    try {
      await save.mutateAsync({
        clubId,
        values: form,
        previous: profile ?? null,
        actorName,
      });
      toast.success("Billing information saved — future invoices will use these details");
    } catch (e: any) {
      toast.error(e?.message || "Could not save billing information");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading billing information…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {financeContacts.length > 0 && (
        <Card className="p-3 border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20">
          <div className="flex items-start gap-2">
            <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold">Defaults from members with Finance permission</div>
              <div className="text-muted-foreground">
                {financeContacts.map((c: any) => `${c.name}${c.email ? ` (${c.email})` : ""}`).join(", ")}
              </div>
              {missingFinanceEmails.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs mt-2"
                  onClick={() => set("emails", [...form.emails, ...missingFinanceEmails])}
                >
                  <Plus className="w-3 h-3 mr-1" /> Add {missingFinanceEmails.length} finance email
                  {missingFinanceEmails.length === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Billing contact name" value={form.contact_name} onChange={(v) => set("contact_name", v)} />
          <Field label="Company / legal entity" value={form.company_name} onChange={(v) => set("company_name", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
          <Field label="VAT / Tax number" value={form.vat_number} onChange={(v) => set("vat_number", v)} />
          <Field label="PO number" value={form.po_number} onChange={(v) => set("po_number", v)} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Billing emails — every invoice is sent to all of these</Label>
          <div className="flex flex-wrap gap-1.5">
            {form.emails.length === 0 && (
              <span className="text-xs text-muted-foreground">No emails added yet.</span>
            )}
            {form.emails.map((e) => (
              <Badge key={e} variant="secondary" className="gap-1 text-xs">
                {e}
                <button
                  onClick={() => set("emails", form.emails.filter((x) => x !== e))}
                  className="hover:text-destructive"
                  aria-label={`Remove ${e}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              placeholder="billing@club.co.za"
              className="h-8 text-xs max-w-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addEmail()}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Address line 1" value={form.address_line1} onChange={(v) => set("address_line1", v)} />
          <Field label="Address line 2" value={form.address_line2} onChange={(v) => set("address_line2", v)} />
          <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
          <Field label="Province / State" value={form.province} onChange={(v) => set("province", v)} />
          <Field label="Postal code" value={form.postal_code} onChange={(v) => set("postal_code", v)} />
          <Field label="Country" value={form.country} onChange={(v) => set("country", v)} />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <p className="text-[11px] text-muted-foreground">
            These details appear on all future invoices. Past invoices keep the details captured at the time and stay downloadable.
          </p>
          <Button size="sm" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-8 text-xs" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
