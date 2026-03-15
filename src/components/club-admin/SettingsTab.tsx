import { useState, useEffect } from "react";
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
    challenge_levels_up: club.challenge_levels_up ?? 2,
    sender_email: "",
    sender_name: "",
    smtp_host: "",
    smtp_port: "" as string | number,
    smtp_user: "",
    smtp_pass: "",
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
        challenge_levels_up: form.challenge_levels_up,
      });

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
      </Card>

      {/* Email Sender Settings */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Email Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Configure your club's outgoing email settings for member communications.
          If left blank, the platform default will be used.
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

      <Button onClick={handleSave} disabled={updateClub.isPending || updateSecrets.isPending} className="w-full md:w-auto">
        {updateClub.isPending || updateSecrets.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
