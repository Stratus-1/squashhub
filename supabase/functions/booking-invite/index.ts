import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    // Verify JWT
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { bookingId, inviteeEmail, inviteeName, channel } = body;

    if (!bookingId) throw new Error("Missing bookingId");
    if (channel === "email" && !inviteeEmail) throw new Error("Missing inviteeEmail for email channel");

    // Get booking details
    const { data: booking, error: bookErr } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();
    if (bookErr || !booking) throw new Error("Booking not found");

    // Get inviter profile
    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("name,email")
      .eq("id", user.id)
      .single();

    // Create the invite record
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("booking_invites")
      .insert({
        booking_id: bookingId,
        inviter_id: user.id,
        invitee_email: inviteeEmail || null,
        invitee_name: inviteeName || null,
        channel: channel || "email",
      })
      .select()
      .single();
    if (invErr) throw invErr;

    const siteUrl = (Deno.env.get("SITE_URL") || "https://gordon-s-bay-squash-hub.vercel.app").trim();
    const inviteToken = (invite as any).token;

    const acceptUrl = `${siteUrl}/booking-response?token=${inviteToken}&action=accept`;
    const declineUrl = `${siteUrl}/booking-response?token=${inviteToken}&action=decline`;

    const dateStr = String((booking as any).date);
    const startTime = String((booking as any).start_time || "").slice(0, 5);
    const endTime = String((booking as any).end_time || "").slice(0, 5);
    const courtId = (booking as any).court_id;
    const inviterName = inviter?.name || "A player";

    if (channel === "whatsapp") {
      // Return WhatsApp deep link for client to open
      const msg = encodeURIComponent(
        `🏸 You're invited to play squash!\n\n` +
        `${inviterName} has booked Court ${courtId} on ${dateStr} from ${startTime} to ${endTime}.\n\n` +
        `Accept: ${acceptUrl}\nDecline: ${declineUrl}`
      );
      const whatsappUrl = inviteeEmail
        ? `https://wa.me/?text=${msg}`
        : `https://wa.me/?text=${msg}`;

      return new Response(JSON.stringify({ ok: true, whatsappUrl, inviteId: (invite as any).id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Resend
    const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, reason: "Email sending not configured (RESEND_API_KEY missing)" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = (Deno.env.get("EMAIL_FROM") || "GB Squash <onboarding@resend.dev>").trim();
    const subject = `🏸 Squash Invitation from ${escapeHtml(inviterName)}`;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.5;color:#0f172a;max-width:480px;margin:0 auto">
        <div style="background:#1a5c3a;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;font-size:20px">🏸 Squash Court Invitation</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px">
          <p style="margin:0 0 16px;font-size:16px">
            <strong>${escapeHtml(inviterName)}</strong> has invited ${inviteeName ? escapeHtml(inviteeName) : "you"} to play squash!
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 20px">
            <p style="margin:0 0 6px;font-size:14px"><strong>📅 Date:</strong> ${escapeHtml(dateStr)}</p>
            <p style="margin:0 0 6px;font-size:14px"><strong>🕐 Time:</strong> ${escapeHtml(startTime)} – ${escapeHtml(endTime)}</p>
            <p style="margin:0;font-size:14px"><strong>🏟️ Court:</strong> Court ${courtId}</p>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#1a5c3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 8px 0">
              ✅ Accept
            </a>
            <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 0 8px 0">
              ❌ Decline
            </a>
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:center">
            Gordon's Bay Squash Hub
          </p>
        </div>
      </div>
    `.trim();

    const text = `Squash Invitation from ${inviterName}\n\nDate: ${dateStr}\nTime: ${startTime}-${endTime}\nCourt: Court ${courtId}\n\nAccept: ${acceptUrl}\nDecline: ${declineUrl}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [inviteeEmail], subject, html, text }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, reason: errBody || `Resend error ${res.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, inviteId: (invite as any).id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("booking-invite error:", error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
