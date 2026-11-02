// Public pay-link for an issued, unpaid invoice (no login needed).
// GET ?i=<fee_payment_id>&t=<signed token>  ->  302 to PayFast checkout.
// The amount always comes from the invoice row; settlement happens via payfast-itn.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import { PAYFAST_LIVE_PROCESS, PAYFAST_SANDBOX_PROCESS, isSandboxCreds, pfEncode, pfSignature } from "../_shared/payfast.ts";
import { verifyInvoicePayToken } from "../_shared/invoice-pay-token.ts";

const UUID = /^[0-9a-f-]{36}$/i;

function page(title: string, msg: string, status = 200) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>` +
      `<body style="font-family:Arial,sans-serif;background:#fff;color:#1E3A5F;max-width:480px;margin:40px auto;padding:0 20px"><h2>${esc(title)}</h2><p>${esc(msg)}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("i") || "";
    const token = url.searchParams.get("t") || "";
    if (!UUID.test(id) || !(await verifyInvoicePayToken(id, token))) {
      return page("Link not valid", "This payment link is not valid. Please sign in to the app and pay from My Account.", 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: fee } = await admin
      .from("club_member_fee_payments")
      .select("id, amount, paid, fee_label, invoice_number, invoice_issued_at, club_member_id, club_members:club_member_id ( id, name, email, user_id, club_id )")
      .eq("id", id)
      .maybeSingle();
    const cm: any = fee?.club_members;
    if (!fee || !cm) return page("Invoice not found", "We could not find this invoice.", 404);
    if (fee.paid) return page("Already paid", "Thank you — this invoice has already been paid.");
    if (!fee.invoice_issued_at) return page("Not available", "This invoice is not open for payment yet.", 400);
    const amt = Number(fee.amount);
    if (!(amt > 0)) return page("Nothing to pay", "There is no amount due on this invoice.");

    const { data: club } = await admin
      .from("clubs").select("id, name, subdomain, payment_gateway, payment_gateways, currency_code")
      .eq("id", cm.club_id).maybeSingle();
    if (!club || !gatewayEnabled(club, "payfast")) {
      return page("Online payment unavailable", "Online payment is not set up for this club. Please pay by EFT using the details in your invoice email.", 400);
    }
    const { data: secrets } = await admin.from("club_secrets").select("payment_gateway_credentials").eq("club_id", club.id).maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "payfast");
    const merchantId = (creds.merchant_id || "").trim();
    const merchantKey = (creds.merchant_key || "").trim();
    if (!merchantId || !merchantKey) {
      return page("Online payment unavailable", "Please pay by EFT using the details in your invoice email.", 400);
    }

    const description = `${fee.fee_label}${fee.invoice_number ? ` (${fee.invoice_number})` : ""}`;
    const { data: session, error } = await admin.from("payfast_payment_sessions").insert({
      club_id: club.id,
      club_member_id: cm.id,
      user_id: cm.user_id ?? null,
      amount: amt,
      currency: (club as any).currency_code || "ZAR",
      purpose: "fee",
      fee_ids: [fee.id],
      description,
      status: "created",
    }).select("id").single();
    if (error || !session) return page("Something went wrong", "Please try again in a moment.", 500);

    const origin = club.subdomain ? `https://${club.subdomain}.squashhub.co.za` : "https://squashhub.co.za";
    const fields: Array<[string, string]> = [
      ["merchant_id", merchantId],
      ["merchant_key", merchantKey],
      ["return_url", `${origin}/?invoice_paid=1`],
      ["cancel_url", `${origin}/?invoice_cancelled=1`],
      ["notify_url", `${Deno.env.get("SUPABASE_URL")}/functions/v1/payfast-itn`],
      ["name_first", String(cm.name || "").split(" ")[0].slice(0, 100)],
      ["name_last", String(cm.name || "").split(" ").slice(1).join(" ").slice(0, 100)],
      ["email_address", String(cm.email || "").slice(0, 100)],
      ["m_payment_id", session.id],
      ["amount", amt.toFixed(2)],
      ["item_name", `${club.name} — ${description}`.slice(0, 100)],
    ];
    const signature = pfSignature(fields, (creds.passphrase || "").trim());
    const base = isSandboxCreds(creds) ? PAYFAST_SANDBOX_PROCESS : PAYFAST_LIVE_PROCESS;
    const query = fields.filter(([, v]) => String(v || "").trim() !== "")
      .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`).join("&");
    const redirectUrl = `${base}?${query}&signature=${signature}`;
    await admin.from("payfast_payment_sessions").update({ payfast_redirect_url: redirectUrl, updated_at: new Date().toISOString() }).eq("id", session.id);

    return new Response(null, { status: 302, headers: { Location: redirectUrl } });
  } catch (e) {
    console.error("invoice-pay error", e);
    return page("Something went wrong", "Please try again in a moment.", 500);
  }
});
