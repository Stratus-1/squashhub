import { useState, useEffect } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function BankingTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [form, setForm] = useState({
    bank_name: club.bank_name || "",
    bank_account_name: club.bank_account_name || "",
    bank_account_number: club.bank_account_number || "",
    bank_branch_code: club.bank_branch_code || "",
    bank_reference: club.bank_reference || "",
    payment_gateway: club.payment_gateway || "",
    payment_gateway_public_key: club.payment_gateway_public_key || "",
    payment_gateway_secret_key: "",
  });

  // Populate secret key from club_secrets when loaded
  useEffect(() => {
    if (secrets) {
      setForm(p => ({
        ...p,
        payment_gateway_secret_key: secrets.payment_gateway_secret_key || "",
      }));
    }
  }, [secrets]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const setSelect = (k: string) => (value: string) =>
    setForm(p => ({ ...p, [k]: value === "__none__" ? "" : value }));

  const handleSave = async () => {
    try {
      // Save non-sensitive banking settings to clubs table
      const clubPayload: any = {
        id: club.id,
        bank_name: form.bank_name || null,
        bank_account_name: form.bank_account_name || null,
        bank_account_number: form.bank_account_number || null,
        bank_branch_code: form.bank_branch_code || null,
        bank_reference: form.bank_reference || null,
        payment_gateway: form.payment_gateway || null,
        payment_gateway_public_key: form.payment_gateway_public_key || null,
      };
      await updateClub.mutateAsync(clubPayload);

      // Save secret key to club_secrets table
      await updateSecrets.mutateAsync({
        club_id: clubId,
        payment_gateway_secret_key: form.payment_gateway_secret_key || null,
      } as any);

      toast.success("Banking settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Bank Details */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Bank Details</h3>
        <p className="text-sm text-muted-foreground">These details are shown to members when they make EFT payments.</p>
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

      <Button onClick={handleSave} disabled={updateClub.isPending || updateSecrets.isPending} className="w-full md:w-auto">
        {updateClub.isPending || updateSecrets.isPending ? "Saving..." : "Save Banking Settings"}
      </Button>
    </div>
  );
}
