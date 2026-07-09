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
import { CreditCard, Eye, EyeOff, Info, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildYocoReturnUrl, openYocoCheckout, rememberPendingYocoSession } from "@/lib/yoco-native-checkout";
import { buildStitchReturnUrl, openStitchCheckout, rememberPendingStitchSession } from "@/lib/stitch-checkout";
import { useMemberContext } from "@/contexts/MemberContext";

import StitchOnboardingCard from "./StitchOnboardingCard";

// ─── Gateway Registry ───────────────────────────────────────
type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;
  helperText?: string;
  type?: "text" | "checkbox" | "textarea";
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
      { key: "public_key", label: "Public Key", placeholder: "pk_live_...", helperText: "Yoco Dashboard → Sell Online → Developers → API keys → copy the Public Key (starts with pk_live_)." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true, helperText: "Same Developers screen → reveal & copy the Secret Key (sk_live_). Treat it like a password — never share it." },
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
  {
    id: "stitch",
    name: "Stitch Express",
    description: "SA hosted payment links (cards + PayByBank) via the Stitch Express API. Lowest-fee EFT and instant card checkout.",
    website: "https://express.stitch.money",
    fields: [
      { key: "test_mode", label: "Test mode (sandbox credentials)", placeholder: "", type: "checkbox", helperText: "Enable while using a Stitch Express test client (Client ID starts with 'test-'). Disable before going live." },
      { key: "client_id", label: "Client ID", placeholder: "test-958fd377-...", helperText: "Stitch Express Dashboard → Settings → API credentials → copy the Client ID." },
      { key: "client_secret", label: "Client Secret", placeholder: "Your Stitch Express secret", sensitive: true, helperText: "Same screen → reveal & copy the Client Secret. WARNING: viewing the secret in Stitch regenerates it — paste it here immediately and Save. The previous secret stops working the moment you view a new one." },
      { key: "webhook_secret", label: "Webhook Signing Secret", placeholder: "whsec_...", sensitive: true, helperText: "Stitch Express Dashboard → Settings → Webhooks → copy the Signing Secret. Used to verify webhook events are genuinely from Stitch." },
      { key: "merchant_payer_reference", label: "Statement Reference (optional)", placeholder: "e.g. NSQ", helperText: "Up to 12 chars used as the merchantReference prefix. Defaults to the club name." },

    ],
  },
];

// ─── Component ──────────────────────────────────────────────
export function BankingTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const { activeMember } = useMemberContext();
  const [testing, setTesting] = useState(false);

  const handleTestPayment = async () => {
    if (gateway !== "yoco" && gateway !== "stitch") {
      toast.error("Test payment is only wired up for Yoco and Stitch.");
      return;
    }
    if (!activeMember?.id) {
      toast.error("No club membership found on your account to test with.");
      return;
    }
    setTesting(true);
    try {
      if (gateway === "yoco") {
        const return_url = buildYocoReturnUrl("/club-admin?tab=banking");
        const { data, error } = await supabase.functions.invoke("yoco-create-checkout", {
          body: {
            club_id: clubId, club_member_id: activeMember.id,
            amount: 10, purpose: "topup",
            description: "Yoco test payment (R10)", return_url,
          },
        });
        if (error) throw new Error(error.message || "Could not start test checkout");
        if ((data as any)?.error) throw new Error((data as any).error);
        const redirect = (data as any)?.redirect_url;
        if (!redirect) throw new Error("Yoco did not return a redirect URL");
        rememberPendingYocoSession((data as any).session_id, "/club-admin?tab=banking");
        toast.success("Opening Yoco test checkout…");
        await openYocoCheckout(redirect);
      } else {
        // Stitch Express validates the exact redirect URL on the hosted payment
        // page. Use the member account return URL, which is the allow-listed
        // payment callback for this tenant, instead of the admin tab URL.
        const return_url = buildStitchReturnUrl("/my-account");
        const { data, error } = await supabase.functions.invoke("stitch-create-payment", {
          body: {
            club_id: clubId, club_member_id: activeMember.id,
            amount: 10, purpose: "topup", method: "paybybank",
            description: "Stitch test payment (R10)", return_url,
          },
        });
        if (error) throw new Error(error.message || "Could not start test checkout");
        if ((data as any)?.error) throw new Error((data as any).error);
        const redirect = (data as any)?.redirect_url;
        if (!redirect) throw new Error("Stitch did not return a redirect URL");
        rememberPendingStitchSession((data as any).session_id, "/my-account");
        toast.success("Opening Stitch test checkout…");
        await openStitchCheckout(redirect);
      }
    } catch (err: any) {
      toast.error(err.message || "Test payment failed");
    } finally {
      setTesting(false);
    }
  };

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
  const [acceptedMethods, setAcceptedMethods] = useState<Set<string>>(
    new Set(((club as any).accepted_payment_methods as string[]) || ["cash", "eft", "online"])
  );

  const toggleMethod = (m: string) =>
    setAcceptedMethods(p => {
      const n = new Set(p);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });

  // Resync dropdown when club data finishes loading or changes (e.g. after a save).
  useEffect(() => {
    setGateway(club.payment_gateway || "");
    setAcceptedMethods(new Set(((club as any).accepted_payment_methods as string[]) || ["cash", "eft", "online"]));
  }, [club.payment_gateway, (club as any).accepted_payment_methods]);

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
        accepted_payment_methods: Array.from(acceptedMethods),
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
      {/* Accepted Payment Methods */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Accepted Payment Methods</h3>
        <p className="text-xs text-muted-foreground">
          Choose which payment methods members can use to settle fees. Unchecked methods are hidden from member-facing payment screens.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { key: "cash", label: "Cash", hint: "Admin records cash receipts manually." },
            { key: "eft", label: "EFT / Bank Transfer", hint: "Members pay via bank details below." },
            { key: "online", label: "Online (Card / PayByBank)", hint: "Requires payment gateway configured below." },
          ].map(m => (
            <label
              key={m.key}
              className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50 ${acceptedMethods.has(m.key) ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acceptedMethods.has(m.key)}
                onChange={() => toggleMethod(m.key)}
              />
              <div className="space-y-0.5">
                <div className="text-xs font-medium">{m.label}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </Card>


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
            {selectedGateway.id === "yoco" && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">How to get your Yoco API keys</p>
                <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-0.5">
                  <li>Sign in at <a href="https://portal.yoco.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">portal.yoco.com</a> with your Yoco merchant account.</li>
                  <li>Go to <strong>Sell Online → Developers → API keys</strong>.</li>
                  <li>Copy the <strong>Public Key</strong> (pk_live_…) and <strong>Secret Key</strong> (sk_live_…) into the fields below.</li>
                  <li>Use <em>test</em> keys (pk_test_/sk_test_) while trialling; switch to live keys before collecting real payments.</li>
                </ol>
              </div>
            )}
            {selectedGateway.id === "stitch" && (
              <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2 space-y-1">
                <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400">How to get your Stitch Express credentials</p>
                <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-0.5">
                  <li>Sign in at <a href="https://express.stitch.money" target="_blank" rel="noopener noreferrer" className="text-primary underline">express.stitch.money</a> (this is the <strong>Express</strong> product, not Enterprise).</li>
                  <li>Open <strong>Settings → API credentials</strong> and copy the <strong>Client ID</strong>.</li>
                  <li>Click <strong>View Client Secret</strong> — Stitch regenerates the secret each time you view it, so paste it into the field below and Save immediately.</li>
                  <li>Register the exact tenant account URL, for example <code className="text-[10px]">https://gb.squashhub.co.za/my-account</code>, under <strong>Settings → Redirect URLs</strong> in the Stitch Express dashboard. Do not include <code className="text-[10px]">?stitch_session=…</code> or other payment parameters.</li>
                  <li>For server-confirmed settlements, add the webhook URL <code className="text-[10px]">https://squashhub.co.za/functions/v1/stitch-webhook</code> under <strong>Settings → Webhooks</strong>, then paste the webhook Signing Secret into the field below.</li>
                  <li>Use the <em>test</em> client (Client ID starts with <code>test-</code>) while trialling; switch to <em>live</em> before collecting real money.</li>

                </ol>
              </div>
            )}
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
              {selectedGateway.fields.map(field => {
                if (field.type === "checkbox") {
                  const checked = credentials[field.key] === "true";
                  return (
                    <label
                      key={field.key}
                      className={`md:col-span-2 flex items-start gap-2 rounded-md border p-2 cursor-pointer ${checked ? "border-amber-500 bg-amber-500/10" : "border-border"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={(e) => setCred(field.key, e.target.checked ? "true" : "false")}
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium">{field.label}</div>
                        {field.helperText && <div className="text-[10px] text-muted-foreground">{field.helperText}</div>}
                      </div>
                    </label>
                  );
                }
                if (field.type === "textarea") {
                  const visible = visibleFields.has(field.key);
                  return (
                    <div key={field.key} className="space-y-1 md:col-span-2">
                      <Label className="text-xs flex items-center justify-between">
                        <span>{field.label}</span>
                        {field.sensitive && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => toggleVisible(field.key)}
                          >
                            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </Label>
                      <textarea
                        className="w-full min-h-[120px] rounded-md border bg-background px-2 py-1.5 text-[11px] font-mono"
                        style={field.sensitive && !visible ? { WebkitTextSecurity: "disc" } as any : undefined}
                        value={credentials[field.key] || ""}
                        onChange={e => setCred(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        spellCheck={false}
                      />
                      {field.helperText && (
                        <p className="text-[10px] text-muted-foreground">{field.helperText}</p>
                      )}
                    </div>
                  );
                }
                return (
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
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={isSaving} size="sm" className="text-xs">
          {isSaving ? "Saving..." : "Save Banking Settings"}
        </Button>
        {(gateway === "yoco" || gateway === "stitch") && (
          <Button
            onClick={handleTestPayment}
            disabled={testing || isSaving}
            size="sm"
            variant="outline"
            className="text-xs gap-1"
          >
            <Zap className="h-3.5 w-3.5" />
            {testing ? `Opening ${gateway === "yoco" ? "Yoco" : "Stitch"}…` : "Send Test R10 Payment"}
          </Button>
        )}
        {(gateway === "yoco" || gateway === "stitch") && (
          <span className="text-[10px] text-muted-foreground">
            Uses the saved {gateway === "yoco" ? "Yoco" : "Stitch"} keys (test or live). Save first if you just changed them.
          </span>
        )}
      </div>

      

      <StitchOnboardingCard
        clubId={clubId}
        clubName={club.name}
        clubSubdomain={(club as any).subdomain ?? null}
        defaultEmail={(club as any).contact_email || (secrets as any)?.sender_email || null}
        defaultCell={(club as any).contact_phone || null}
        defaultContactName={(club as any).contact_name || null}
      />
    </div>
  );
}
