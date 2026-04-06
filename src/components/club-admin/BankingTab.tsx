import { useState, useEffect, useMemo } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, Eye, EyeOff, Info } from "lucide-react";

// ─── Gateway Registry ───────────────────────────────────────
type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;
  helperText?: string;
};

type GatewayDef = {
  id: string;
  name: string;
  description: string;
  website: string;
  fields: FieldDef[];
};

const GATEWAYS: GatewayDef[] = [
  {
    id: "payfast",
    name: "PayFast",
    description: "SA's leading online payment gateway. Supports once-off & recurring payments.",
    website: "https://payfast.co.za",
    fields: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "10000100" },
      { key: "merchant_key", label: "Merchant Key", placeholder: "46f0cd694581a", sensitive: true },
      { key: "passphrase", label: "Passphrase", placeholder: "Your PayFast passphrase", sensitive: true, helperText: "Set in PayFast dashboard → Settings → Security" },
    ],
  },
  {
    id: "yoco",
    name: "Yoco",
    description: "Modern card payments for SA businesses. Inline checkout & payment links.",
    website: "https://yoco.com",
    fields: [
      { key: "public_key", label: "Public Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
    ],
  },
  {
    id: "peach",
    name: "Peach Payments",
    description: "Enterprise-grade payment processing for SA. Cards, EFT, mobile money.",
    website: "https://peachpayments.com",
    fields: [
      { key: "entity_id", label: "Entity ID", placeholder: "8ac7a4c..." },
      { key: "authorization", label: "Authorization Bearer", placeholder: "OGFjN2E0Y...", sensitive: true },
    ],
  },
  {
    id: "ozow",
    name: "Ozow",
    description: "Instant EFT payments. Customers pay directly from their bank account.",
    website: "https://ozow.com",
    fields: [
      { key: "site_code", label: "Site Code", placeholder: "XXXXXX" },
      { key: "private_key", label: "Private Key", placeholder: "Your Ozow private key", sensitive: true },
      { key: "api_key", label: "API Key", placeholder: "Your Ozow API key", sensitive: true },
    ],
  },
  {
    id: "snapscan",
    name: "SnapScan",
    description: "QR code payments. Members scan to pay instantly.",
    website: "https://snapscan.co.za",
    fields: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Your SnapScan merchant ID" },
      { key: "api_key", label: "API Key", placeholder: "Your SnapScan API key", sensitive: true },
    ],
  },
  {
    id: "paystack",
    name: "Paystack",
    description: "Payments for African businesses. Cards, bank transfer, mobile money.",
    website: "https://paystack.com",
    fields: [
      { key: "public_key", label: "Public Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Global payment platform. Limited SA availability but supported.",
    website: "https://stripe.com",
    fields: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────
export function BankingTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [bankForm, setBankForm] = useState({
    bank_name: (secrets as any)?.bank_name || "",
    bank_account_name: (secrets as any)?.bank_account_name || "",
    bank_account_number: (secrets as any)?.bank_account_number || "",
    bank_branch_code: (secrets as any)?.bank_branch_code || "",
    bank_reference: (secrets as any)?.bank_reference || "",
  });

  const [gateway, setGateway] = useState(club.payment_gateway || "");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());

  const selectedGateway = useMemo(() => GATEWAYS.find(g => g.id === gateway), [gateway]);

  // Load saved credentials from secrets
  useEffect(() => {
    if (secrets) {
      // Load bank details from secrets
      setBankForm({
        bank_name: (secrets as any).bank_name || "",
        bank_account_name: (secrets as any).bank_account_name || "",
        bank_account_number: (secrets as any).bank_account_number || "",
        bank_branch_code: (secrets as any).bank_branch_code || "",
        bank_reference: (secrets as any).bank_reference || "",
      });
      const saved = (secrets as any).payment_gateway_credentials;
      if (saved && typeof saved === "object") {
        setCredentials(saved);
      }
      // Backward compat: if old payment_gateway_secret_key exists and gateway is set
      if (!saved && secrets.payment_gateway_secret_key && club.payment_gateway) {
        const compat: Record<string, string> = {};
        if (club.payment_gateway_public_key) {
          compat.public_key = club.payment_gateway_public_key;
        }
        compat.secret_key = secrets.payment_gateway_secret_key;
        setCredentials(compat);
      }
    }
  }, [secrets, club.payment_gateway, club.payment_gateway_public_key]);

  const setBank = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBankForm(p => ({ ...p, [k]: e.target.value }));

  const setCred = (key: string, value: string) =>
    setCredentials(p => ({ ...p, [key]: value }));

  const toggleVisible = (key: string) =>
    setVisibleFields(p => {
      const next = new Set(p);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleGatewayChange = (value: string) => {
    const newGateway = value === "__none__" ? "" : value;
    setGateway(newGateway);
    setCredentials({});
    setVisibleFields(new Set());
  };

  const handleSave = async () => {
    try {
      // Save selected gateway to clubs table (non-sensitive)
      await updateClub.mutateAsync({
        id: club.id,
        payment_gateway: gateway || null,
        payment_gateway_public_key: null, // migrated to credentials JSON
      } as any);

      // Save bank details + credentials to club_secrets
      await updateSecrets.mutateAsync({
        club_id: clubId,
        bank_name: bankForm.bank_name || null,
        bank_account_name: bankForm.bank_account_name || null,
        bank_account_number: bankForm.bank_account_number || null,
        bank_branch_code: bankForm.bank_branch_code || null,
        bank_reference: bankForm.bank_reference || null,
        payment_gateway_credentials: credentials,
      } as any);

      toast.success("Banking settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const isSaving = updateClub.isPending || updateSecrets.isPending;

  return (
    <div className="space-y-4 mt-4">
      {/* Bank Details */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Bank Details</h3>
        <p className="text-xs text-muted-foreground">Shown to members for EFT payments.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Bank Name</Label><Input className="h-8 text-xs" value={bankForm.bank_name} onChange={setBank("bank_name")} /></div>
          <div className="space-y-1"><Label className="text-xs">Account Name</Label><Input className="h-8 text-xs" value={bankForm.bank_account_name} onChange={setBank("bank_account_name")} /></div>
          <div className="space-y-1"><Label className="text-xs">Account Number</Label><Input className="h-8 text-xs" value={bankForm.bank_account_number} onChange={setBank("bank_account_number")} /></div>
          <div className="space-y-1"><Label className="text-xs">Branch Code</Label><Input className="h-8 text-xs" value={bankForm.bank_branch_code} onChange={setBank("bank_branch_code")} /></div>
          <div className="space-y-1"><Label className="text-xs">Payment Reference</Label><Input className="h-8 text-xs" value={bankForm.bank_reference} onChange={setBank("bank_reference")} placeholder="e.g. Club name + member number" /></div>
        </div>
      </Card>

      {/* Payment Gateway */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Payment Gateway</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure an online payment gateway for collecting membership fees, court light fees, and other payments from members.
        </p>

        {/* Gateway Selector */}
        <div className="space-y-1">
          <Label className="text-xs">Gateway Provider</Label>
          <Select value={gateway || "__none__"} onValueChange={handleGatewayChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {GATEWAYS.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Gateway Info */}
        {selectedGateway && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] h-5">{selectedGateway.name}</Badge>
              <a href={selectedGateway.website} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">
                {selectedGateway.website}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{selectedGateway.description}</p>
          </div>
        )}

        {/* Dynamic Credential Fields */}
        {selectedGateway && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Enter your {selectedGateway.name} credentials below. Secret keys are stored securely and never exposed.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedGateway.fields.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs">{field.label}</Label>
                  <div className="relative">
                    <Input
                      className="h-8 text-xs font-mono pr-8"
                      type={field.sensitive && !visibleFields.has(field.key) ? "password" : "text"}
                      value={credentials[field.key] || ""}
                      onChange={e => setCred(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                    {field.sensitive && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleVisible(field.key)}
                      >
                        {visibleFields.has(field.key) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  {field.helperText && (
                    <p className="text-[10px] text-muted-foreground">{field.helperText}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Button onClick={handleSave} disabled={isSaving} size="sm" className="text-xs">
        {isSaving ? "Saving..." : "Save Banking Settings"}
      </Button>
    </div>
  );
}
