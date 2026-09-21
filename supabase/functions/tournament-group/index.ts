// Tournament WhatsApp group — server side.
//
// Three jobs, all of them deliberately conservative:
//
//  * send_join_links  — organiser action. Sends the group invite link to the
//                       people who have actually ENTERED the tournament (never
//                       to merely invited prospects) and logs what was sent.
//  * request_link     — a player taps "Enter" or "Withdraw" in the group and
//                       gives their membership number + last 4 digits of their
//                       mobile. That is a LOOKUP ONLY: the personal link is
//                       sent to their full registered number, never shown to
//                       whoever typed the digits.
//  * withdraw_request — once fixtures exist or entries are locked, nothing is
//                       cancelled here; a request is filed for the organiser
//                       so the draw is never silently broken.
//
// Existing WhatsApp sending, templates, opt-outs and billing are reused
// unchanged through the send-whatsapp / send-sms functions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ENTERED = new Set(["paid", "confirmed", "entered", "accepted", "pending_payment"]);

function rootHost(subdomain?: string | null) {
  return subdomain ? `https://${subdomain}.squashhub.co.za` : "https://squashhub.co.za";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const notify = async (payload: Record<string, unknown>, fn: "send-whatsapp" | "send-sms") => {
    const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`${fn} [${resp.status}] ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(payload.action ?? "");
    const champId = String(payload.champ_id ?? "");
    if (!champId) return json({ error: "champ_id is required" }, 400);

    const { data: champ } = await admin
      .from("club_champs")
      .select("id, name, club_id, status, entries_locked")
      .eq("id", champId)
      .maybeSingle();
    if (!champ) return json({ error: "Tournament not found" }, 404);

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, subdomain")
      .eq("id", (champ as any).club_id)
      .maybeSingle();
    const base = rootHost((club as any)?.subdomain);

    // ---------------------------------------------------------------- admin
    if (action === "send_join_links") {
      const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
      if (!bearer) return json({ error: "Not authenticated" }, 401);
      const { data: userData } = await admin.auth.getUser(bearer);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: canManage } = await admin.rpc("can_manage_tournament", {
        _user_id: userId,
        _tournament_id: champId,
      });
      if (!canManage) return json({ error: "Only the organiser can do this" }, 403);

      const { data: group } = await admin
        .from("tournament_whatsapp_groups")
        .select("id, invite_url, status, group_name")
        .eq("champ_id", champId)
        .maybeSingle();
      if (!group?.invite_url) return json({ error: "Add the group invite link first" }, 400);
      if ((group as any).status !== "active") {
        return json({ error: "This group is closed — reopen it before sending invites" }, 400);
      }

      const { data: regs } = await admin
        .from("club_champs_registrations")
        .select("club_member_id, status, whatsapp_group_opt_in")
        .eq("champ_id", champId);

      const paidOnly = payload.paid_only === true;
      const recipients = (regs ?? []).filter((r: any) => {
        const s = String(r.status ?? "").toLowerCase();
        if (!r.club_member_id) return false;
        // Players who unticked the WhatsApp group box at entry are never sent the link.
        if (r.whatsapp_group_opt_in === false) return false;
        return paidOnly ? s === "paid" : ENTERED.has(s);
      });

      const skipExisting = payload.resend !== true;
      let already: string[] = [];
      if (skipExisting) {
        const { data: sent } = await admin
          .from("tournament_whatsapp_group_invites")
          .select("club_member_id")
          .eq("group_id", (group as any).id)
          .not("sent_at", "is", null);
        already = (sent ?? []).map((r: any) => r.club_member_id);
      }

      const todo = recipients.filter((r: any) => !already.includes(r.club_member_id));
      const owner = (club as any)?.name ?? "";
      const message =
        `${owner ? `${owner}: ` : ""}You are entered for ${(champ as any).name}. ` +
        `Join the tournament WhatsApp group for draws, times and results: ${(group as any).invite_url}`;

      let sent = 0;
      let failed = 0;
      for (const r of todo) {
        let error: string | null = null;
        try {
          const res = await notify(
            {
              club_id: (champ as any).club_id,
              recipients: [{ member_id: r.club_member_id }],
              body: message,
              kind: "tournament_group_invite",
              category: "utility",
              template_key: "club_notice",
              template_variables: { message },
            },
            "send-whatsapp",
          );
          if (Number(res?.sent ?? 0) > 0) sent += 1;
          else {
            failed += 1;
            error = res?.results?.[0]?.error ?? "not delivered";
          }
        } catch (e) {
          failed += 1;
          error = e instanceof Error ? e.message : String(e);
        }

        await admin.from("tournament_whatsapp_group_invites").upsert(
          {
            group_id: (group as any).id,
            champ_id: champId,
            club_member_id: r.club_member_id,
            channel: "whatsapp",
            sent_at: error ? null : new Date().toISOString(),
            send_error: error,
          },
          { onConflict: "group_id,club_member_id" },
        );
      }

      return json({ total: todo.length, sent, failed, skipped: already.length });
    }

    // --------------------------------------------------------------- public
    if (action === "request_link" || action === "withdraw_request") {
      const memberNumber = String(payload.member_number ?? "").trim();
      const last4 = String(payload.last4 ?? "").replace(/\D/g, "");
      const wanted = payload.intent === "withdraw" ? "withdraw" : "enter";

      const { data: lookup, error: lookupErr } = await admin.rpc("tournament_member_lookup", {
        p_champ_id: champId,
        p_member_number: memberNumber,
        p_last4: last4,
      });
      if (lookupErr) return json({ error: lookupErr.message }, 500);
      if (!(lookup as any)?.found) {
        // Deliberately vague — never confirm whether a membership number exists.
        return json({ found: false, reason: (lookup as any)?.reason ?? "no_match" });
      }

      // Resolve the member again (the lookup returns no identifiers on purpose).
      const { data: candidates } = await admin
        .from("club_members")
        .select("id, phone, club_id, user_id")
        .eq("club_member_number", memberNumber);
      const member = (candidates ?? []).find((m: any) => {
        const digits = String(m.phone ?? "").replace(/\D/g, "");
        return digits.length >= 4 && digits.slice(-4) === last4;
      });
      if (!member) return json({ found: false, reason: "no_match" });

      const { data: reg } = await admin
        .from("club_champs_registrations")
        .select("id, status, invite_token")
        .eq("champ_id", champId)
        .eq("club_member_id", (member as any).id)
        .maybeSingle();

      // Withdrawing after the draw exists must never rewrite fixtures here.
      if (wanted === "withdraw") {
        const { count: fixtures } = await admin
          .from("club_champs_matches")
          .select("id", { count: "exact", head: true })
          .eq("champ_id", champId);
        const locked = (champ as any).entries_locked === true || (fixtures ?? 0) > 0;
        if (locked) {
          if (!reg) return json({ found: true, outcome: "no_entry" });
          await admin.from("tournament_withdrawal_requests").insert({
            champ_id: champId,
            club_member_id: (member as any).id,
            registration_id: (reg as any).id,
            source: "deep_link",
            reason: String(payload.reason ?? "").slice(0, 500) || null,
          });
          return json({ found: true, outcome: "request_filed" });
        }
        if (!reg) return json({ found: true, outcome: "no_entry" });
      }

      // Make sure there is a personal link to send.
      let token = (reg as any)?.invite_token ?? null;
      let registrationId = (reg as any)?.id ?? null;
      if (!token) {
        const { data: newToken } = await admin.rpc("new_invite_token");
        token = newToken as unknown as string;
        if (registrationId) {
          await admin
            .from("club_champs_registrations")
            .update({ invite_token: token, invite_token_created_at: new Date().toISOString() })
            .eq("id", registrationId);
        } else {
          const { data: created, error: createErr } = await admin
            .from("club_champs_registrations")
            .insert({
              champ_id: champId,
              club_member_id: (member as any).id,
              status: "invited",
              invited_at: new Date().toISOString(),
              invite_token: token,
              invite_token_created_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (createErr) return json({ error: createErr.message }, 500);
          registrationId = (created as any)?.id ?? null;
        }
      }

      const link = `${base}/i/${token}`;
      const text =
        wanted === "withdraw"
          ? `Withdraw from ${(champ as any).name}: open your personal link and confirm — ${link}`
          : `Enter ${(champ as any).name}: open your personal link to complete your entry — ${link}`;

      let delivered = false;
      try {
        const res = await notify(
          {
            club_id: (champ as any).club_id,
            recipients: [{ member_id: (member as any).id }],
            body: text,
            kind: "tournament_group_action",
            category: "utility",
            template_key: "club_notice",
            template_variables: { message: text },
            system: true,
          },
          "send-whatsapp",
        );
        delivered = Number(res?.sent ?? 0) > 0;
      } catch {
        delivered = false;
      }
      if (!delivered) {
        try {
          const res = await notify(
            {
              club_id: (champ as any).club_id,
              recipients: [{ member_id: (member as any).id }],
              body: text,
              kind: "tournament_group_action",
              critical: true,
            },
            "send-sms",
          );
          delivered = Number(res?.sent ?? 0) > 0;
        } catch {
          delivered = false;
        }
      }

      return json({
        found: true,
        outcome: delivered ? "link_sent" : "link_not_sent",
        masked_phone: (lookup as any).masked_phone,
        has_entry: (lookup as any).has_entry === true,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("tournament-group error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
