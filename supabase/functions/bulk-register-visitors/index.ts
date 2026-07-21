// bulk-register-visitors
// ---------------------------------------------------------------
// Admin-only endpoint that bulk-registers doubles/singles tournament
// entrants for a club. For each entrant:
//   • matches against existing club_members and profiles
//   • if already a member of this club → skips
//   • if exists at another club → adds a visitor club_members row
//     reusing the existing user_id (no new auth account)
//   • if brand new → creates auth user (email pre-confirmed, no password),
//     profile, and visitor club_members row
//   • generates a magic-link and enqueues a tournament confirmation email
//
// Caller must be authenticated as a club admin of the target club.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Entrant {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  home_club_name?: string | null;
  division?: string | null;
  partner_name?: string | null;
}

interface RowResult {
  index: number;
  email: string;
  name: string;
  status: "already_member" | "linked_visitor" | "created" | "error" | "skipped";
  user_id?: string;
  club_member_id?: string;
  magic_link?: string;
  email_queued?: boolean;
  message?: string;
  phone?: string | null;
  division?: string | null;
  partner_name?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  // Verify caller is a club admin.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json({ error: "Not authenticated" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
  const callerId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const clubId = String(body.club_id || "").trim();
  const tournamentId = body.tournament_id ? String(body.tournament_id).trim() : null;
  const entrants: Entrant[] = Array.isArray(body.entrants) ? body.entrants : [];
  const dryRun = !!body.dry_run;

  if (!clubId) return json({ error: "club_id required" }, 400);
  if (entrants.length === 0) return json({ error: "entrants[] required" }, 400);

  // Admin check — role='admin' in club_members or has_role platform admin.
  const { data: adminMember } = await admin
    .from("club_members")
    .select("id, role")
    .eq("club_id", clubId)
    .eq("user_id", callerId)
    .maybeSingle();
  const { data: isSuper } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
  const isAdmin = adminMember?.role === "admin" || !!isSuper;
  if (!isAdmin) return json({ error: "Not authorized (club admin required)" }, 403);

  // Load club for subdomain + name.
  const { data: club } = await admin
    .from("clubs")
    .select("id, name, subdomain, email")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return json({ error: "Club not found" }, 404);

  const clubName = club.name || "the club";
  const subdomain = (club as any).subdomain || null;
  const clubUrl = subdomain
    ? `https://${subdomain}.squashhub.co.za`
    : "https://squashhub.co.za";
  // Magic-link redirect MUST be on Supabase's allowed-redirect list, otherwise
  // GoTrue silently falls back to the project Site URL (squashhub.lovable.app).
  // The production root + /auth/callback is allowlisted; a bootstrap script in
  // index.html bounces the user to the tenant subdomain using ?tenant=<sub>.
  const magicRedirect = subdomain
    ? `https://www.squashhub.co.za/auth/callback?tenant=${encodeURIComponent(subdomain)}`
    : `https://www.squashhub.co.za/auth/callback`;

  // Optional tournament context for email body.
  let tournamentName: string | null = null;
  let tournamentStart: string | null = null;
  if (tournamentId) {
    const { data: t } = await admin
      .from("club_champs")
      .select("name, start_date, start_time")
      .eq("id", tournamentId)
      .maybeSingle();
    if (t) {
      tournamentName = t.name || null;
      const parts: string[] = [];
      if (t.start_date) parts.push(t.start_date);
      if (t.start_time) parts.push(String(t.start_time).slice(0, 5));
      tournamentStart = parts.length ? parts.join(" at ") : null;
    }
  }

  const results: RowResult[] = [];

  for (let i = 0; i < entrants.length; i++) {
    const e = entrants[i];
    const first = String(e.first_name || "").trim();
    const last = String(e.last_name || "").trim();
    const email = String(e.email || "").trim().toLowerCase();
    const phone = e.phone ? String(e.phone).trim() : null;
    const gender = String(e.gender || "").trim().toLowerCase() === "ladies" ? "Ladies" : "Men";
    const homeClub = e.home_club_name ? String(e.home_club_name).trim() : "";
    const division = e.division ? String(e.division).trim() : null;
    const partnerName = e.partner_name ? String(e.partner_name).trim() : null;
    const fullName = `${first} ${last}`.trim();

    const row: RowResult = { index: i, email, name: fullName, status: "error", phone, division, partner_name: partnerName };

    if (!email || !email.includes("@") || !first || !last) {
      row.message = "Missing name or email";
      results.push(row);
      continue;
    }

    try {
      // 1. Already a member of THIS club?
      const { data: sameClub } = await admin
        .from("club_members")
        .select("id, user_id")
        .eq("club_id", clubId)
        .ilike("email", email)
        .maybeSingle();

      if (sameClub?.user_id) {
        row.status = "already_member";
        row.user_id = sameClub.user_id;
        row.club_member_id = sameClub.id;
        results.push(row);
        continue;
      }

      // 2. Look up existing profile by email.
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id, email, name")
        .ilike("email", email)
        .maybeSingle();

      let userId: string | null = existingProfile?.id || null;

      // 3. Look up existing auth user by email if no profile.
      if (!userId) {
        try {
          // @ts-ignore — newer supabase-js admin API
          const byEmail: any = await (admin.auth.admin as any).getUserByEmail?.(email);
          if (byEmail?.data?.user?.id) userId = byEmail.data.user.id;
        } catch (_) { /* ignore */ }
        if (!userId) {
          try {
            const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const match = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email);
            if (match?.id) userId = match.id;
          } catch (_) { /* ignore */ }
        }
      }

      if (dryRun) {
        row.status = userId ? "linked_visitor" : "created";
        results.push(row);
        continue;
      }

      // 4. Create auth user if brand new.
      let createdNew = false;
      if (!userId) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            name: fullName,
            phone: phone || undefined,
            terms_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString(),
            needs_password_setup: true,
            invited_club_subdomain: club?.subdomain || undefined,
          },
        });
        if (createErr || !created?.user) {
          row.message = createErr?.message || "Failed to create auth user";
          results.push(row);
          continue;
        }
        userId = created.user.id;
        createdNew = true;
      }

      // 5. Upsert profile.
      await admin.from("profiles").upsert({
        id: userId,
        email,
        name: fullName,
        phone: phone || null,
      }, { onConflict: "id" });

      // 6. Insert visitor club_members row for this club.
      const insertPayload: Record<string, any> = {
        club_id: clubId,
        user_id: userId,
        role: "visitor",
        name: fullName,
        email,
        phone: phone || null,
        gender,
        home_club_name: homeClub || null,
      };
      const { data: inserted, error: memberErr } = await admin
        .from("club_members")
        .insert(insertPayload)
        .select("id")
        .single();

      if (memberErr) {
        row.message = "Failed to create visitor membership: " + memberErr.message;
        results.push(row);
        continue;
      }

      row.user_id = userId;
      row.club_member_id = inserted.id;
      row.status = createdNew ? "created" : "linked_visitor";

      // 7. Generate magic-link.
      let magicLink: string | undefined;
      try {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: magicRedirect },
        });
        if (!linkErr && (linkData as any)?.properties?.action_link) {
          magicLink = (linkData as any).properties.action_link;
        }
      } catch (err) {
        console.error("[bulk-register-visitors] generateLink failed:", err);
      }
      row.magic_link = magicLink;

      // 8. Enqueue confirmation email.
      try {
        const emailBody = {
          templateName: "tournament-entry-confirmation",
          recipientEmail: email,
          idempotencyKey: `tournament-entry-${tournamentId || clubId}-${userId}`,
          templateData: {
            playerName: first || fullName,
            clubName,
            tournamentName: tournamentName || "the tournament",
            division: division || undefined,
            partnerName: partnerName || undefined,
            startInfo: tournamentStart || undefined,
            venue: clubName,
            magicLink,
            clubUrl,
            contactEmail: (club as any).email || undefined,
          },
        };
        const resp = await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(emailBody),
        });
        row.email_queued = resp.ok;
        if (!resp.ok) {
          const txt = await resp.text();
          console.error("[bulk-register-visitors] email send failed:", resp.status, txt);
          row.message = `Email failed: ${resp.status}`;
        }
      } catch (err) {
        console.error("[bulk-register-visitors] email invoke error:", err);
        row.email_queued = false;
      }

      results.push(row);
    } catch (err: any) {
      row.status = "error";
      row.message = err?.message || String(err);
      results.push(row);
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    linked: results.filter((r) => r.status === "linked_visitor").length,
    already: results.filter((r) => r.status === "already_member").length,
    errors: results.filter((r) => r.status === "error").length,
    emails_queued: results.filter((r) => r.email_queued).length,
  };

  // Send an admin-copy summary email to the club contact so admins can see who was emailed.
  if (!dryRun) {
    try {
      const adminEmail = (club as any).email as string | null;
      // Also include the importing admin's email if we can resolve it.
      let importerEmail: string | null = null;
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(callerId);
        importerEmail = authUser?.user?.email || null;
      } catch { /* ignore */ }

      const recipients = Array.from(new Set([adminEmail, importerEmail].filter(Boolean))) as string[];
      const entriesPayload = results.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone || undefined,
        status: r.status,
        division: r.division || undefined,
        partner: r.partner_name || undefined,
        emailed: !!r.email_queued,
        message: r.message || undefined,
      }));

      for (const to of recipients) {
        const emailBody = {
          templateName: "tournament-entry-import-summary",
          recipientEmail: to,
          idempotencyKey: `tournament-import-summary-${tournamentId || clubId}-${Date.now()}-${to}`,
          templateData: {
            clubName,
            tournamentName: tournamentName || "the tournament",
            importedBy: importerEmail || undefined,
            summary,
            entries: entriesPayload,
          },
        };
        try {
          await fetch(`${supaUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(emailBody),
          });
        } catch (err) {
          console.error("[bulk-register-visitors] admin summary send failed:", err);
        }
      }
    } catch (err) {
      console.error("[bulk-register-visitors] admin summary block error:", err);
    }
  }

  return json({ ok: true, dryRun, summary, results });
});
