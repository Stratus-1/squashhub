// GoBook Lights top-up.
//   create  { club_id, club_member_id, amount, method: card|eft|account, confirmed: true }  (signed-in member)
//   process {}  (woken by the database when a top-up is ready; hourly backstop) — only sends rows
//               already marked ready by a confirmed payment, so it is safe to call without a user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  lightsPaymentBody, lightsReference, lightsTransferLines, mapGoBookPaymentStatus,
} from "../_shared/gobook-lights-topup.ts";
import { cardTopupExpiryCutoff } from "../_shared/lights-topup-expiry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const API_BASE = "https://api.gobook.co.za";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const tokens = new Map<string, string>();
async function clubToken(clubId: string): Promise<string> {
  const cached = tokens.get(clubId);
  if (cached) return cached;
  const { data: s } = await admin.from("club_secrets")
    .select("gobook_api_username, gobook_api_password").eq("club_id", clubId).maybeSingle();
  if (!s?.gobook_api_username || !s?.gobook_api_password) throw new Error("No GoBook API credentials saved for this club");
  const res = await fetch(`${API_BASE}/Authentication/Token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: s.gobook_api_username, password: s.gobook_api_password }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token) throw new Error(`GoBook sign-in failed (${res.status})`);
  tokens.set(clubId, body.token);
  return body.token;
}

async function queryPayment(token: string, q: string) {
  const res = await fetch(`${API_BASE}/Financials/Payment?${q}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (res.status === 204 || res.status === 404) return null;
  const text = await res.text();
  // GoBook answers an unknown reference with 400 "Payment not found" — that means "not sent yet".
  if (res.status === 400 && /payment not found/i.test(text)) return null;
  if (!res.ok) throw new Error(`GoBook payment query failed (${res.status}): ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return null; }
}

// Statement line "Court lights top-up sent to GoBook": the existing journal trigger posts
// debtors Dr / light_fees_income Cr, so the member's paid top-up nets to zero.
async function postTransfer(row: any): Promise<void> {
  if (row.transfer_journal_ref) return;
  const { data: tx, error } = await admin.from("member_credit_transactions").insert({
    club_id: row.club_id, club_member_id: row.club_member_id, amount: Number(row.amount),
    type: "credit", method: "system", status: "confirmed", confirmed_at: new Date().toISOString(),
    description: `Court lights top-up sent to GoBook (${row.reference})`, reference: row.reference,
  }).select("id").single();
  if (error) throw new Error(`Could not record transfer: ${error.message}`);
  await admin.from("gobook_lights_topups").update({ transfer_journal_ref: tx.id }).eq("id", row.id);
}

async function reverseTransfer(row: any) {
  if (!row.transfer_journal_ref || row.reversal_journal_ref) return;
  const desc = `GoBook rejected court lights top-up (${row.reference}) - returned to account`;
  const { data: tx, error } = await admin.from("member_credit_transactions").insert({
    club_id: row.club_id, club_member_id: row.club_member_id, amount: Number(row.amount),
    type: "debit", method: "system", status: "confirmed", confirmed_at: new Date().toISOString(),
    description: desc, reference: `${row.reference}-R`,
  }).select("id").single();
  if (error) throw new Error(`Could not reverse transfer: ${error.message}`);
  const { data: orig } = await admin.from("club_journal_entries").select("journal_ref")
    .eq("transaction_id", row.transfer_journal_ref).limit(1).maybeSingle();
  const ref = crypto.randomUUID();
  const lines = lightsTransferLines(Number(row.amount)).map((l) => ({
    account: l.account, debit: l.credit, credit: l.debit, club_id: row.club_id,
    club_member_id: row.club_member_id, journal_ref: ref, transaction_id: tx.id,
    reverses_journal_ref: orig?.journal_ref ?? null, description: desc,
  }));
  const { error: jErr } = await admin.from("club_journal_entries").insert(lines);
  if (jErr) throw new Error(`Could not reverse journal: ${jErr.message}`);
  await admin.from("gobook_lights_topups").update({ reversal_journal_ref: tx.id }).eq("id", row.id);
}

async function applyStatus(row: any, payment: any) {
  const state = mapGoBookPaymentStatus(payment?.status);
  if (state === "cancelled") await reverseTransfer(row);
  await admin.from("gobook_lights_topups").update({
    status: state, gobook_status: payment?.status ?? null,
    gobook_payment_id: payment?.paymentId ?? row.gobook_payment_id,
    cancellation_reason: payment?.cancellationReasons ?? null, last_error: null, updated_at: new Date().toISOString(),
  }).eq("id", row.id);
}

async function sendOne(row: any) {
  const token = await clubToken(row.club_id);
  // Already reached GoBook (e.g. crash after sending)? Never send the same reference twice.
  const existing = await queryPayment(token, `reference=${encodeURIComponent(row.reference)}`);
  if (!existing) {
    const res = await fetch(`${API_BASE}/Financials/MakePayment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(lightsPaymentBody(Number(row.gobook_client_id), Number(row.amount), row.reference)),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success === false) {
      const msg = body?.messages?.join(", ") || `GoBook payment failed (${res.status})`;
      await admin.from("gobook_lights_topups").update({ status: "failed", last_error: msg, updated_at: new Date().toISOString() }).eq("id", row.id);
      return;
    }
    await admin.from("gobook_lights_topups").update({ gobook_payment_id: body?.id ?? null, status: "submitted", gobook_status: "Paid" }).eq("id", row.id);
  }
  await postTransfer(row);
  const payment = existing ?? await queryPayment(token, `reference=${encodeURIComponent(row.reference)}`);
  const { data: fresh } = await admin.from("gobook_lights_topups").select("*").eq("id", row.id).single();
  if (payment) await applyStatus(fresh, payment);
}

async function processAll() {
  const results: Record<string, string> = {};
  // Unpaid card checkouts older than 24h can't be resumed: close them as "Not paid".
  const { data: expired } = await admin.from("gobook_lights_topups")
    .update({ status: "abandoned", cancellation_reason: "Card payment not completed within 24 hours", updated_at: new Date().toISOString() })
    .eq("method", "card").eq("status", "awaiting_payment").lt("created_at", cardTopupExpiryCutoff()).select("reference");
  for (const row of expired ?? []) results[row.reference] = "expired";
  // Claim ready rows (and stale 'submitting' ones) atomically.
  const staleCut = new Date(Date.now() - 5 * 60_000).toISOString();
  await admin.from("gobook_lights_topups").update({ status: "ready" }).eq("status", "submitting").lt("updated_at", staleCut);
  const { data: claimed } = await admin.from("gobook_lights_topups")
    .update({ status: "submitting", updated_at: new Date().toISOString() }).eq("status", "ready").select("*");
  for (const row of claimed ?? []) {
    try { await sendOne(row); results[row.reference] = "sent"; }
    catch (e) {
      await admin.from("gobook_lights_topups").update({ status: "ready", last_error: String((e as Error).message).slice(0, 300) }).eq("id", row.id);
      results[row.reference] = "retry later";
    }
  }
  const { data: open } = await admin.from("gobook_lights_topups").select("*").eq("status", "submitted").limit(100);
  for (const row of open ?? []) {
    try {
      const token = await clubToken(row.club_id);
      const p = await queryPayment(token, row.gobook_payment_id ? `paymentId=${row.gobook_payment_id}` : `reference=${encodeURIComponent(row.reference)}`);
      if (p) await applyStatus(row, p);
    } catch (e) { console.error("status check failed", row.reference, (e as Error).message); }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const payload = await req.json().catch(() => ({}));
    if (payload.action === "process") return json({ success: true, results: await processAll() });
    if (payload.action !== "create") return json({ error: "Unknown action" }, 400);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Please log in again to top up your Lights." }, 401);

    const clubId = String(payload.club_id ?? "");
    const memberId = String(payload.club_member_id ?? "");
    const method = String(payload.method ?? "");
    const amount = Math.round(Number(payload.amount) * 100) / 100;
    if (!clubId || !memberId) return json({ error: "club_id and club_member_id are required" }, 400);
    if (!["card", "eft", "account"].includes(method)) return json({ error: "Choose a payment method" }, 400);
    if (!Number.isFinite(amount) || amount < 10 || amount > 10000) return json({ error: "Amount must be between R10 and R10,000" }, 400);
    if (payload.confirmed !== true) return json({ error: "Please confirm this is your GoBook account" }, 400);

    const { data: club } = await admin.from("clubs").select("uses_gobook, gobook_api_enabled").eq("id", clubId).maybeSingle();
    if (!club?.uses_gobook || !club?.gobook_api_enabled) return json({ error: "GoBook is not enabled for this club" }, 403);
    const { data: member } = await admin.from("club_members").select("id, gobook_client_id")
      .eq("id", memberId).eq("club_id", clubId).eq("user_id", u.user.id).eq("status", "active").maybeSingle();
    if (!member) return json({ error: "You can only top up your own Lights account" }, 403);
    const clientId = Number(member.gobook_client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return json({ error: "Your GoBook account is not linked" }, 400);

    const { data: gate } = await admin.rpc("member_account_gate", { _club_member_id: memberId, _extra: amount });
    const g = Array.isArray(gate) ? gate[0] : gate;
    if (method === "account") {
      if (!g || Number(g.shortfall) > 0) {
        return json({ error: "Not enough available on your account. Choose card or EFT instead." }, 400);
      }
    }
    // Card/EFT: fresh money earmarked for Lights; the matching transfer nets it to zero, so an
    // outstanding balance never blocks it (renewal auto-settlement excludes these amounts).

    const id = crypto.randomUUID();
    const { data: row, error } = await admin.from("gobook_lights_topups").insert({
      id, club_id: clubId, club_member_id: memberId, gobook_client_id: clientId, amount, method,
      status: method === "account" ? "ready" : "awaiting_payment",
      reference: lightsReference(id), created_by: u.user.id,
    }).select("id, reference, status, amount").single();
    if (error) throw error;
    return json({ success: true, topup: row });
  } catch (e) {
    console.error("gobook-lights-topup", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
