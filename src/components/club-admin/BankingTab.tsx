import { useState, useEffect, useMemo } from "react";
import { Club, useClubMembers, useUpdateClub } from "@/hooks/use-club";
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

const DEFAULT_FEE_PCT: Record<string, number> = { yoco: 3.34, stitch: 3.39, paynow: 3.5 };

// Per-method gateway rates (local SA market defaults, VAT-inclusive: list rate x 1.15)
const METHOD_FEE_FIELDS = [
  { key: "gateway_fee_pct_card_local", label: "Card — local", default: 3.39 },
  { key: "gateway_fee_pct_card_intl", label: "Card — international", default: 3.91 },
  { key: "gateway_fee_pct_wallet", label: "Apple Pay / Google Pay", default: 3.39 },
  { key: "gateway_fee_pct_capitec", label: "Capitec Pay", default: 2.19 },
] as const;
type MethodFeeKey = (typeof METHOD_FEE_FIELDS)[number]["key"];
const methodFeesFromClub = (club: any): Record<string, string> =>
  Object.fromEntries(
    METHOD_FEE_FIELDS.map(f => [f.key, club?.[f.key] != null ? String(club[f.key]) : ""])
  );

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
  {
    id: "paynow",
    name: "Paynow (Zimbabwe)",
    description: "Zimbabwe payment aggregator. One integration covers EcoCash, OneMoney, InnBucks, Zimswitch and Visa/Mastercard.",
    website: "https://paynow.co.zw",
    fields: [
      { key: "integration_id", label: "Integration ID", placeholder: "12345", helperText: "Paynow Dashboard → Sellers → Integrations → copy the Integration ID." },
      { key: "integration_key", label: "Integration Key", placeholder: "Your Paynow integration key", sensitive: true, helperText: "Same screen → reveal & copy the Integration Key. Treat it like a password." },
      { key: "test_mode", label: "Test mode (no real money)", placeholder: "", type: "checkbox", helperText: "Every new Paynow integration starts in test mode automatically. Keep this on until Paynow has reviewed and approved the integration for live payments, then switch it off." },
    ],
  },
  {
    id: "ecocash",
    name: "EcoCash (Zimbabwe)",
    description: "Direct Econet EcoCash merchant C2B API. Requires a merchant account onboarded with Econet. Checkout wiring coming soon — credentials are stored securely now.",
    website: "https://developers.ecocash.co.zw",
    fields: [
      { key: "merchant_code", label: "Merchant Code", placeholder: "Your EcoCash merchant code", helperText: "Provided by Econet when your merchant account is approved." },
      { key: "merchant_number", label: "Merchant Number", placeholder: "e.g. 263771234567", helperText: "The MSISDN linked to the merchant account (international format)." },
      { key: "api_key", label: "API Key", placeholder: "Your EcoCash API key", sensitive: true, helperText: "Econet developer portal → your app → API credentials." },
      { key: "api_secret", label: "API Secret", placeholder: "Your EcoCash API secret", sensitive: true },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────
import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";
import { EditLock, useEditLock } from "./setup/EditLock";

export function BankingTab({ club, clubId }: { club: Club; clubId: string }) {
  const [step, setStep] = useState("methods");
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const { activeMember } = useMemberContext();
  const [testing, setTesting] = useState(false);
  const { data: members = [] } = useClubMembers(clubId);

  // Prefill board members for the Stitch onboarding card from the club's key office bearers
  const boardMemberNames = useMemo(() => {
    const officials: Array<[string, string | null | undefined]> = [
      ["Chairman", (club as any).chairman_member_id],
      ["Secretary", (club as any).secretary_member_id],
      ["Club Captain", (club as any).club_captain_member_id],
      ["Treasurer", (club as any).treasurer_member_id],
    ];
    const byId = new Map(
      members.map((m: any) => [m.id, (m.name || m.profiles?.name || "").trim()])
    );
    return officials
      .map(([role, id]) => {
        const name = id ? byId.get(id) : "";
        return name ? `${name} - ${role}` : null;
      })
      .filter((name): name is string => Boolean(name));
  }, [club, members]);

  const handleTestPayment = async () => {
    if (gateway !== "yoco" && gateway !== "stitch" && gateway !== "paynow") {
      toast.error("Test payment is only wired up for Yoco, Stitch and Paynow.");
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
        await openStitchCheckout(redirect, (data as any).session_id, "/my-account");
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
  const [feePercent, setFeePercent] = useState(
    (club as any).payment_gateway_fee_percent != null ? String((club as any).payment_gateway_fee_percent) : ""
  );
  const [methodFees, setMethodFees] = useState<Record<string, string>>(() => methodFeesFromClub(club));
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  // Additional gateways the club also offers alongside the primary one.
  const [extraGateways, setExtraGateways] = useState<string[]>(
    () => (((club as any).payment_gateways as string[]) || []).filter(g => g && g !== club.payment_gateway)
  );
  const [extraCreds, setExtraCreds] = useState<Record<string, Record<string, string>>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [acceptedMethods, setAcceptedMethods] = useState<Set<string>>(
    new Set(((club as any).accepted_payment_methods as string[]) || ["cash", "eft", "online"])
  );

  const setExtraCred = (gwId: string, key: string, value: string) =>
    setExtraCreds(p => ({ ...p, [gwId]: { ...(p[gwId] || {}), [key]: value } }));
  const addExtraGateway = (gwId: string) =>
    setExtraGateways(p => (p.includes(gwId) || gwId === gateway ? p : [...p, gwId]));
  const removeExtraGateway = (gwId: string) => {
    setExtraGateways(p => p.filter(g => g !== gwId));
    setExtraCreds(p => { const n = { ...p }; delete n[gwId]; return n; });
  };


  const toggleMethod = (m: string) =>
    setAcceptedMethods(p => {
      const n = new Set(p);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });

  // Resync dropdown when club data finishes loading or changes (e.g. after a save).
  useEffect(() => {
    setGateway(club.payment_gateway || "");
    setFeePercent((club as any).payment_gateway_fee_percent != null ? String((club as any).payment_gateway_fee_percent) : "");
    setMethodFees(methodFeesFromClub(club));
    setExtraGateways((((club as any).payment_gateways as string[]) || []).filter(g => g && g !== club.payment_gateway));
    setAcceptedMethods(new Set(((club as any).accepted_payment_methods as string[]) || ["cash", "eft", "online"]));
  }, [club.payment_gateway, (club as any).payment_gateways, (club as any).accepted_payment_methods]);

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
        const { __gateways, ...flat } = saved as Record<string, any>;
        setCredentials(flat as Record<string, string>);
        setExtraCreds(__gateways && typeof __gateways === "object" ? __gateways : {});
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
    setFeePercent(newGateway ? String(DEFAULT_FEE_PCT[newGateway] ?? 3.5) : "");
    setMethodFees(
      newGateway
        ? Object.fromEntries(METHOD_FEE_FIELDS.map(f => [f.key, String(f.default)]))
        : Object.fromEntries(METHOD_FEE_FIELDS.map(f => [f.key, ""]))
    );
    setCredentials({});
    setVisibleFields(new Set());
  };

  const resetBank = () => setBankForm({
    bank_name: (secrets as any)?.bank_name || "",
    bank_account_name: (secrets as any)?.bank_account_name || "",
    bank_account_number: (secrets as any)?.bank_account_number || "",
    bank_branch_code: (secrets as any)?.bank_branch_code || "",
    bank_reference: (secrets as any)?.bank_reference || "",
  });
  const resetGateway = () => {
    setGateway(club.payment_gateway || "");
    setFeePercent((club as any).payment_gateway_fee_percent != null ? String((club as any).payment_gateway_fee_percent) : "");
    setMethodFees(methodFeesFromClub(club));
    const saved = (secrets as any)?.payment_gateway_credentials;
    const { __gateways, ...flat } = (saved && typeof saved === "object" ? saved : {}) as Record<string, any>;
    setCredentials(flat as Record<string, string>);
    setExtraCreds(__gateways && typeof __gateways === "object" ? __gateways : {});
    setExtraGateways((((club as any).payment_gateways as string[]) || []).filter((g: string) => g && g !== club.payment_gateway));
  };
  const resetMethods = () =>
    setAcceptedMethods(new Set(((club as any).accepted_payment_methods as string[]) || ["cash", "eft", "online"]));

  const methodsLock = useEditLock(resetMethods);
  const bankLock = useEditLock(resetBank);
  const gatewayLock = useEditLock(resetGateway);
  const extraLock = useEditLock(resetGateway);

  // The Stitch Express partner offer only applies to South African clubs.
  const isSouthAfrican =
    String((club as any).currency_code || "ZAR").toUpperCase() === "ZAR";

  const handleSave = async (onDone?: () => void) => {
    try {
      // Save selected gateway to clubs table (non-sensitive)
      await updateClub.mutateAsync({
        id: club.id,
        payment_gateway: gateway || null,
        payment_gateways: extraGateways.filter(g => g && g !== gateway),
        payment_gateway_public_key: null, // migrated to credentials JSON
        payment_gateway_fee_percent: feePercent.trim() === "" ? null : Number(feePercent),
        ...Object.fromEntries(
          METHOD_FEE_FIELDS.map(f => [
            f.key,
            (methodFees[f.key] ?? "").trim() === "" ? null : Number(methodFees[f.key]),
          ])
        ),
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
        payment_gateway_credentials: {
          ...credentials,
          __gateways: Object.fromEntries(
            extraGateways.filter(g => g && g !== gateway).map(g => [g, extraCreds[g] || {}])
          ),
        },
      } as any);

      toast.success("Banking settings saved");
      onDone?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const isSaving = updateClub.isPending || updateSecrets.isPending;

  const steps: SetupStep[] = [
    { id: "methods", label: "Payment methods", description: "Step one — tick the ways your members are allowed to pay: cash, EFT or online card payments.", complete: acceptedMethods.size > 0 },
    { id: "bank", label: "Bank details", description: "The account members see when they choose EFT. Nothing here is charged automatically.", complete: !!bankForm.bank_account_number },
    { id: "gateway", label: "Online payments", description: "Connect a payment gateway so members can pay by card and set up monthly debit orders.", complete: gateway !== "none" },
  ];

  return (
    <div className="space-y-4 mt-4">
      <SetupSteps steps={steps} value={step} onChange={setStep} />
      {step === "methods" && (
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Accepted Payment Methods</h3>
        <p className="text-xs text-muted-foreground">
          Choose which payment methods members can use to settle fees. Unchecked methods are hidden from member-facing payment screens.
        </p>
        <EditLock
          editing={methodsLock.editing}
          onEdit={methodsLock.edit}
          onCancel={methodsLock.cancel}
          onSave={() => handleSave(methodsLock.done)}
          saving={isSaving}
          title="payment methods"
        >
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
        </EditLock>
      </Card>
      )}

      {step === "bank" && (
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Bank Details</h3>
        <p className="text-xs text-muted-foreground">Shown to members for EFT payments.</p>
        <EditLock
          editing={bankLock.editing}
          onEdit={bankLock.edit}
          onCancel={bankLock.cancel}
          onSave={() => handleSave(bankLock.done)}
          saving={isSaving}
          locked={!acceptedMethods.has("eft")}
          lockedHint="Tick “EFT / Bank Transfer” on step 1 before capturing bank details."
          title="bank details"
        >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Bank Name</Label><Input className="h-8 text-xs" value={bankForm.bank_name} onChange={setBank("bank_name")} /></div>
          <div className="space-y-1"><Label className="text-xs">Account Name</Label><Input className="h-8 text-xs" value={bankForm.bank_account_name} onChange={setBank("bank_account_name")} /></div>
          <div className="space-y-1"><Label className="text-xs">Account Number</Label><Input className="h-8 text-xs" value={bankForm.bank_account_number} onChange={setBank("bank_account_number")} /></div>
          <div className="space-y-1"><Label className="text-xs">Branch Code</Label><Input className="h-8 text-xs" value={bankForm.bank_branch_code} onChange={setBank("bank_branch_code")} /></div>
          <div className="space-y-1"><Label className="text-xs">Payment Reference</Label><Input className="h-8 text-xs" value={bankForm.bank_reference} onChange={setBank("bank_reference")} placeholder="e.g. Club name + member number" /></div>
        </div>
        </EditLock>
      </Card>
      )}

      {step === "gateway" && (<>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Payment Gateway</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure an online payment gateway for collecting membership fees, court light fees, and other payments from members.
        </p>

        <EditLock
          editing={gatewayLock.editing}
          onEdit={gatewayLock.edit}
          onCancel={gatewayLock.cancel}
          onSave={() => handleSave(gatewayLock.done)}
          saving={isSaving}
          locked={!acceptedMethods.has("online")}
          lockedHint="Tick “Online (Card / PayByBank)” on step 1 before setting up a gateway."
          title="payment gateway"
        >
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

        {/* Gateway transaction fees per payment method */}
        {gateway && (
          <div className="space-y-2">
            <Label className="text-xs">Transaction fees (%) per payment method — enter VAT-inclusive rates</Label>
            <p className="text-[10px] text-muted-foreground">
              Gateways quote rates excluding VAT. Multiply the quoted rate by 1.15 (e.g. 2.95% → 3.39%).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {METHOD_FEE_FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="20"
                    className="h-8 text-xs"
                    value={methodFees[f.key] ?? ""}
                    onChange={(e) => setMethodFees(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={String(f.default)}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Fallback rate (other / unknown method)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="20"
                className="h-8 text-xs"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                placeholder={String(DEFAULT_FEE_PCT[gateway] ?? 3.5)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              The matching rate is booked automatically on every card payment:
              debit Payment Gateway Fees, credit Current Account — so your bank balance matches
              what actually settles and no month-end reconciliation is needed.
              Typical: local card 2.95%, international card 3.4%, Apple/Google Pay 2.95%, Capitec Pay 1.9%.
            </p>
          </div>
        )}


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
        </EditLock>
      </Card>

      {/* Additional gateways — members get to choose at checkout */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Additional payment gateways</h3>
          <Badge variant="secondary" className="text-[10px] h-5">Optional</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Offer more than one gateway — for example Paynow <em>and</em> EcoCash. Members then pick
          which one to pay with at checkout. The gateway above stays the default.
        </p>
        <EditLock
          editing={extraLock.editing}
          onEdit={extraLock.edit}
          onCancel={extraLock.cancel}
          onSave={() => handleSave(extraLock.done)}
          saving={isSaving}
          locked={!acceptedMethods.has("online") || !gateway}
          lockedHint="Choose a main gateway above first."
          title="additional gateways"
        >
        <div className="space-y-3">
          {extraGateways.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No additional gateways yet.</p>
          )}
          {extraGateways.map(gwId => {
            const def = GATEWAYS.find(g => g.id === gwId);
            if (!def) return null;
            return (
              <div key={gwId} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{def.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{def.description}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => removeExtraGateway(gwId)}>
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {def.fields.map(field => {
                    const fkey = `${gwId}.${field.key}`;
                    const val = extraCreds[gwId]?.[field.key] || "";
                    if (field.type === "checkbox") {
                      const checked = val === "true";
                      return (
                        <label
                          key={fkey}
                          className={`md:col-span-2 flex items-start gap-2 rounded-md border p-2 cursor-pointer ${checked ? "border-amber-500 bg-amber-500/10" : "border-border"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={(e) => setExtraCred(gwId, field.key, e.target.checked ? "true" : "false")}
                          />
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium">{field.label}</div>
                            {field.helperText && <div className="text-[10px] text-muted-foreground">{field.helperText}</div>}
                          </div>
                        </label>
                      );
                    }
                    return (
                      <div key={fkey} className="space-y-1">
                        <Label className="text-xs">{field.label}</Label>
                        <div className="relative">
                          <Input
                            className="h-8 text-xs font-mono pr-8"
                            type={field.sensitive && !visibleFields.has(fkey) ? "password" : "text"}
                            value={val}
                            onChange={(e) => setExtraCred(gwId, field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                          {field.sensitive && (
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => toggleVisible(fkey)}
                            >
                              {visibleFields.has(fkey) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        {field.helperText && <p className="text-[10px] text-muted-foreground">{field.helperText}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="space-y-1">
            <Label className="text-xs">Add another gateway</Label>
            <Select value="__add__" onValueChange={(v) => v !== "__add__" && addExtraGateway(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__add__">— Select a provider —</SelectItem>
                {GATEWAYS.filter(g => g.id !== gateway && !extraGateways.includes(g.id)).map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </EditLock>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
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

      

      {isSouthAfrican && (
        <StitchOnboardingCard
          clubId={clubId}
          clubName={club.name}
          clubSubdomain={(club as any).subdomain ?? null}
          defaultEmail={(club as any).email || (secrets as any)?.sender_email || null}
          defaultCell={(club as any).phone || null}
          defaultContactName={(club as any).contact_person_name || null}
          defaultBoardMembers={boardMemberNames}
        />
      )}

      </>)}
      <SetupStepNav steps={steps} value={step} onChange={setStep} />
    </div>
  );
}
