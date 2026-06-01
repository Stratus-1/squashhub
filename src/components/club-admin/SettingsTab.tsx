import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";


export function SettingsTab({ club, clubId }: { club: Club; clubId: string }) {
  const { user } = useAuth();
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState(user?.email || "");

  const [form, setForm] = useState({
    member_number_prefix: club.member_number_prefix || "",
    member_number_length: club.member_number_length ?? 4,
    member_number_start: club.member_number_start ?? 1,
    auto_number_existing_onboarding: (club as any).auto_number_existing_onboarding ?? false,
    challenge_levels_up: club.challenge_levels_up ?? 2,
    sender_email: "",
    sender_name: "",
    smtp_host: "",
    smtp_port: "" as string | number,
    smtp_user: "",
    smtp_pass: "",
    email_signature_html: (club as any).email_signature_html || "",
    email_disclaimer: (club as any).email_disclaimer || "This email and any attachments are confidential and intended solely for the addressee. If you are not the intended recipient, please notify the sender and delete this email.",
  });

  // Populate SMTP fields from secrets when loaded
  useEffect(() => {
    if (secrets) {
      setForm(p => ({
        ...p,
        sender_email: secrets.sender_email || "",
        sender_name: secrets.sender_name || "",
        smtp_host: secrets.smtp_host || "",
        smtp_port: secrets.smtp_port ?? "",
        smtp_user: secrets.smtp_user || "",
        smtp_pass: secrets.smtp_pass || "",
      }));
    }
  }, [secrets]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const setNumber = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: parseInt(e.target.value) || 0 }));

  const handleSave = async () => {
    try {
      // Save non-sensitive settings to clubs table
      await updateClub.mutateAsync({
        id: club.id,
        member_number_prefix: form.member_number_prefix,
        member_number_length: form.member_number_length,
        member_number_start: form.member_number_start,
        auto_number_existing_onboarding: form.auto_number_existing_onboarding,
        challenge_levels_up: form.challenge_levels_up,
        email_signature_html: form.email_signature_html || null,
        email_disclaimer: form.email_disclaimer || null,
      } as any);

      // Save sensitive SMTP settings to club_secrets table
      await updateSecrets.mutateAsync({
        club_id: clubId,
        sender_email: form.sender_email || null,
        sender_name: form.sender_name || null,
        smtp_host: form.smtp_host || null,
        smtp_port: form.smtp_port === "" || form.smtp_port === 0 ? null : (parseInt(String(form.smtp_port)) || null),
        smtp_user: form.smtp_user || null,
        smtp_pass: form.smtp_pass || null,
      } as any);

      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const generateSignature = () => {
    const c: any = club;
    const name = c.name || "";
    const contact = c.contact_person_name || "";
    const email = c.email || "";
    const phone = c.phone || "";
    const address = c.address || "";
    const logo = c.logo_url || "";
    const disclaimer = form.email_disclaimer || "";

    const html = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1f2937; line-height: 1.5;">
  <tr>
    ${logo ? `<td style="padding-right: 16px; vertical-align: middle;"><img src="${logo}" alt="${name}" style="display: block; max-width: 160px; max-height: 90px; width: auto; height: auto; object-fit: contain;" /></td>` : ""}
    <td style="vertical-align: top; border-left: 3px solid #1E3A5F; padding-left: 16px;">
      ${contact ? `<div style="font-weight: 700; font-size: 14px; color: #0f172a;">${contact}</div>` : ""}
      <div style="font-weight: 600; color: #1E3A5F; margin-top: 2px;">${name}</div>
      ${phone ? `<div style="margin-top: 6px;">📞 <a href="tel:${phone}" style="color: #1f2937; text-decoration: none;">${phone}</a></div>` : ""}
      ${email ? `<div>✉️ <a href="mailto:${email}" style="color: #1E3A5F; text-decoration: none;">${email}</a></div>` : ""}
      ${address ? `<div style="margin-top: 4px; color: #4b5563;">📍 ${address}</div>` : ""}
    </td>
  </tr>
  ${disclaimer ? `<tr><td colspan="2" style="padding-top: 14px;"><div style="border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 11px; color: #6b7280; font-style: italic;">${disclaimer}</div></td></tr>` : ""}
</table>`;

    setForm(p => ({ ...p, email_signature_html: html }));
    toast.success("Signature generated — review the preview and click Save Settings");
  };

  const copySignature = async () => {
    if (!form.email_signature_html) return;
    try {
      await navigator.clipboard.writeText(form.email_signature_html);
      toast.success("Signature HTML copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSendTestEmail = async () => {
    if (!form.sender_email || !form.smtp_host || !form.smtp_user || !form.smtp_pass) {
      toast.error("Please fill in all SMTP fields before sending a test email");
      return;
    }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-notifications", {
        body: {
          action: "test",
          clubId,
          sender_name: form.sender_name || club.name,
          sender_email: form.sender_email,
          smtp_host: form.smtp_host,
          smtp_port: parseInt(String(form.smtp_port)) || 587,
          smtp_user: form.smtp_user,
          smtp_pass: form.smtp_pass,
          to: testEmailTo || user?.email,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Test email sent to ${testEmailTo || user?.email}`);
      } else {
        toast.error(data?.reason || data?.error || "Failed to send test email — check your SMTP settings");
      }
    } catch (err: any) {
      const msg = err?.message || err?.context?.body || String(err);
      toast.error(msg || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
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
        <div className="flex items-start justify-between gap-4 pt-3 border-t">
          <div className="space-y-0.5">
            <Label htmlFor="auto-num-existing" className="text-sm font-medium">
              Allocate to existing members onboarding who don't have a number yet
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, pre-existing members (admin-created or imported) without a club number
              will be auto-allocated one when they complete the onboarding wizard.
            </p>
          </div>
          <Switch
            id="auto-num-existing"
            checked={form.auto_number_existing_onboarding}
            onCheckedChange={(v) => setForm(p => ({ ...p, auto_number_existing_onboarding: v }))}
          />
        </div>
      </Card>

      {/* Email Sender Settings */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Email Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Configure your club's outgoing email settings for member communications.
          If left blank, the platform default will be used.
        </p>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-xs">
          <p className="font-medium text-amber-700 dark:text-amber-400">How to set this up</p>
          <div>
            <p className="font-medium text-foreground">Using Gmail / Google Workspace?</p>
            <ol className="list-decimal pl-4 text-muted-foreground space-y-0.5 mt-1">
              <li>Enable 2-Step Verification on your Google account (required).</li>
              <li>Visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline">myaccount.google.com/apppasswords</a>.</li>
              <li>Create an App Password for "Mail" — copy the 16-character password.</li>
              <li>Use <code className="bg-muted px-1 rounded">smtp.gmail.com</code>, port <code className="bg-muted px-1 rounded">587</code>, your full Gmail address as Username, and the App Password as Password.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Using another provider (cPanel, Outlook, hosting)?</p>
            <p className="text-muted-foreground mt-1">
              Ask your IT/email provider for the <strong>outgoing mail (SMTP) server</strong> details:
              host (e.g. <code className="bg-muted px-1 rounded">mail.yourdomain.co.za</code>),
              port (usually <code className="bg-muted px-1 rounded">587</code> TLS or <code className="bg-muted px-1 rounded">465</code> SSL),
              username (typically your full email address) and password.
            </p>
          </div>
          <p className="text-muted-foreground">
            Credentials are stored encrypted in our secrets vault and only used to send emails on your club's behalf. Use the <strong>Send Test Email</strong> button below to verify your settings.
          </p>
        </div>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="space-y-1 flex-1 w-full sm:w-auto">
            <Label htmlFor="test-email-to">Send Test To</Label>
            <Input
              id="test-email-to"
              type="email"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestEmail}
            disabled={sendingTest || !form.sender_email || !form.smtp_host || !testEmailTo}
            className="shrink-0"
          >
            <Send className="w-4 h-4 mr-2" />
            {sendingTest ? "Sending..." : "Send Test Email"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sends a test email to verify your SMTP settings work.
        </p>
      </Card>

      {/* Email Signature Generator */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-semibold">Email Signature</h3>
            <p className="text-sm text-muted-foreground">
              Auto-generated from your Club Information (logo, contact person, phone, email, address).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={generateSignature}>Generate / Refresh</Button>
            {form.email_signature_html && <Button variant="ghost" size="sm" onClick={copySignature}>Copy HTML</Button>}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Disclaimer</Label>
          <textarea
            className="w-full min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
            value={form.email_disclaimer}
            onChange={(e) => setForm(p => ({ ...p, email_disclaimer: e.target.value }))}
            placeholder="Confidentiality / legal disclaimer shown at the bottom of the signature"
          />
        </div>
        {form.email_signature_html ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="rounded-md border bg-white p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.email_signature_html) }} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">View HTML source</summary>
              <pre className="mt-2 p-2 bg-muted rounded text-[11px] overflow-x-auto whitespace-pre-wrap">{form.email_signature_html}</pre>
            </details>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Click <strong>Generate / Refresh</strong> to build a signature from your club info. Make sure your Club Info tab has the logo, contact person, phone, email, and address filled in first.
          </p>
        )}
      </Card>

      <Button onClick={handleSave} disabled={updateClub.isPending || updateSecrets.isPending} className="w-full md:w-auto">
        {updateClub.isPending || updateSecrets.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
