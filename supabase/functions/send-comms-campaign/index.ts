// deno-lint-ignore-file no-explicit-any
//
// Single dispatcher for the SquashHub Communications engine.
//
// Renders the campaign for each channel ticked on THAT send and fans out:
//   email    -> club SMTP
//   whatsapp -> send-whatsapp function
//   in_app   -> notifications row with the resolved in-app route
//
// Only the ticked channels are ever used. Every recipient/channel attempt is
// written to comms_deliveries (the delivery log) and is idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { EmailAPIError, sendLovableEmail } from "npm:@lovable.dev/email-js@0.1.0";
import { clubWebBase, renderChannel, resolveAction, type CommsChannel } from "../_shared/comms-render.ts";
import { matchDayEmailBlock, matchDayLinks } from "../_shared/match-day.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);
const VALID_CHANNELS: CommsChannel[] = ["email", "whatsapp", "sms", "in_app"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function normalisePhone(raw?: string | null, cc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = cc + s.slice(1);
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

async function expandRecipients(clubId: string, campaign: any) {
  let q = admin
    .from("club_members")
    .select("id,name,email,phone,club_member_number,id_number,user_id,skills,occupation,volunteer_willing")
    .eq("club_id", clubId);

  const audience = campaign.audience_type as string;
  if (audience === "selected") {
    const ids = (campaign.audience_member_ids ?? []) as string[];
    if (!ids.length) return [];
    q = q.in("id", ids);
  } else if (audience === "league") {
    if (!campaign.audience_league_id) return [];
    const { data: regs } = await admin
      .from("member_league_registrations")
      .select("club_member_id")
      .eq("league_id", campaign.audience_league_id);
    const ids = (regs ?? []).map((r: any) => r.club_member_id).filter(Boolean);
    if (!ids.length) return [];
    q = q.in("id", ids);
  } else if (audience === "unlinked") {
    // Authoritative: active memberships with NO linked login, evaluated now (at send time).
    q = q.is("user_id", null).eq("status", "active");
  }

  const { data } = await q;
  let members = data ?? [];

  if (audience === "skills") {
    const filter = campaign.audience_filter ?? {};
    const wantedSkills: string[] = Array.isArray(filter.skills) ? filter.skills : [];
    const volunteersOnly = !!filter.volunteer_willing;
    members = members.filter((m: any) => {
      if (volunteersOnly && !m.volunteer_willing) return false;
      if (wantedSkills.length) {
        const own = Array.isArray(m.skills) ? m.skills : [];
        if (!wantedSkills.some((s) => own.includes(s))) return false;
      }
      return true;
    });
  }

  return members;
}

async function mergeVarsFor(member: any, club: any, leagueId: string | null) {
  const full = String(member.name || "").trim();
  const [first, ...rest] = full.split(/\s+/);
  let leagueName = "", leagueNumber = "";
  const regQ = admin
    .from("member_league_registrations")
    .select("league_association_number, leagues(name)")
    .eq("club_member_id", member.id);
  const { data: reg } = leagueId
    ? await regQ.eq("league_id", leagueId).maybeSingle()
    : await regQ.limit(1).maybeSingle();
  if (reg) {
    leagueNumber = String((reg as any).league_association_number || "");
    leagueName = String((reg as any).leagues?.name || "");
  }
  return {
    name: full,
    first_name: first || "",
    surname: rest.join(" "),
    title: "",
    member_number: String(member.club_member_number || ""),
    email: String(member.email || ""),
    phone: String(member.phone || ""),
    id_number: String(member.id_number || ""),
    league_name: leagueName,
    league_number: leagueNumber,
    club_name: String(club?.name || ""),
    club_email: String(club?.email || ""),
    club_phone: String(club?.phone || ""),
    action_label: "",
    action_url: "",
  } as Record<string, string>;
}

async function personalOnboardingAction(action: any, m: any, subdomain: string | null | undefined, campaignId: string) {
  const base = clubWebBase(subdomain);
  if (m.user_id) return { ...action, appPath: "/auth", webUrl: `${base}/auth` };
  const { data: token, error } = await admin.rpc("issue_member_activation_token", {
    _club_member_id: m.id, _campaign_id: campaignId, _issued_by: null, _days: 14,
  });
  if (error || !token) throw new Error("Could not create a personal activation link");
  return { ...action, appPath: "/activate", webUrl: `${base}/activate?t=${encodeURIComponent(String(token))}` };
}

async function logDelivery(row: {
  campaign_id: string; club_id: string; club_member_id: string | null; channel: CommsChannel;
  recipient_name?: string | null; target?: string | null; status: string; error_message?: string | null;
}) {
  await admin.from("comms_deliveries").upsert(
    { ...row, sent_at: row.status === "sent" ? new Date().toISOString() : null },
    { onConflict: "campaign_id,club_member_id,channel" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const isInternal = !!SERVICE_KEY && bearer === SERVICE_KEY;

    const body = await req.json().catch(() => ({}));
    const campaignId = body?.campaign_id;
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    const { data: campaign } = await admin
      .from("comms_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaign) return json({ error: "Campaign not found" }, 404);

    if (!isInternal) {
      const { data: userData } = await admin.auth.getUser(bearer);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: isAdmin } = await admin.rpc("is_club_admin", {
        _user_id: userId, _club_id: campaign.club_id,
      });
      if (!isAdmin) return json({ error: "Not a club admin" }, 403);
    }

    // Large sends run in time-boxed chunks; a chunk hands over to the next by
    // re-invoking itself internally with `resume`. A stale "sending" campaign
    // (no chunk alive for 5 min) may also be resumed by an admin.
    const startedMs = campaign.started_at ? new Date(campaign.started_at).getTime() : 0;
    const resumable = campaign.status === "sending" &&
      ((isInternal && body?.resume === true) || Date.now() - startedMs > 5 * 60_000);
    if (!resumable && (campaign.status === "sending" || campaign.status === "sent")) {
      return json({ error: `Campaign is already ${campaign.status}` }, 400);
    }

    const channels = (campaign.channels ?? []).filter((c: string) =>
      VALID_CHANNELS.includes(c as CommsChannel)) as CommsChannel[];
    if (!channels.length) return json({ error: "No channels selected for this send" }, 400);

    const content = (campaign.content ?? {}) as Record<string, { subject?: string; body?: string }>;
    for (const ch of channels) {
      const v = content[ch];
      if (!v || !String(v.body || "").replace(/<[^>]*>/g, "").trim()) {
        return json({ error: `No ${ch} version exists for this campaign. Untick that channel or add the version.` }, 400);
      }
    }

    const { data: club } = await admin
      .from("clubs")
      .select("name,email,phone,subdomain,email_signature_html,email_disclaimer")
      .eq("id", campaign.club_id).maybeSingle();

    const action = resolveAction(campaign.action, club?.subdomain);

    const recipients = await expandRecipients(campaign.club_id, campaign);
    if (!recipients.length) {
      await admin.from("comms_campaigns").update({
        status: "failed", total_recipients: 0, last_error: "No recipients matched", sent_at: new Date().toISOString(),
      }).eq("id", campaignId);
      return json({ error: "No recipients matched this audience" }, 400);
    }

    await admin.from("comms_campaigns").update({
      status: "sending", total_recipients: recipients.length, started_at: new Date().toISOString(), last_error: null,
    }).eq("id", campaignId);

    // ---- Email transport (only when email is ticked) ----
    // Clubs with their own SMTP send from their own address. Clubs without one
    // fall back to the main SquashHub email domain (managed sending), so
    // activation and other comms still reach members before the club sets up email.
    let transporter: any = null;
    let fromHeader = "";
    let useManagedEmail = false;
    let sigBlock = "", disclaimerBlock = "";
    if (channels.includes("email")) {
      const { data: secrets } = await admin
        .from("club_secrets")
        .select("smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email")
        .eq("club_id", campaign.club_id).maybeSingle();
      if (!secrets?.smtp_host || !secrets?.smtp_user || !secrets?.smtp_pass || !secrets?.sender_email) {
        if (!Deno.env.get("LOVABLE_API_KEY")) {
          await admin.from("comms_campaigns").update({
            status: "failed", last_error: "Club SMTP not configured",
          }).eq("id", campaignId);
          return json({ error: "Club email (SMTP) is not configured. Set it up in Club Settings, or untick Email." }, 400);
        }
        useManagedEmail = true;
      }
      if (!useManagedEmail) {
        const port = Number(secrets?.smtp_port) || 587;
        if (!ALLOWED_SMTP_PORTS.has(port)) return json({ error: `SMTP port ${port} not allowed` }, 400);
        const nodemailer = await import("npm:nodemailer@6.9.14");
        transporter = nodemailer.default.createTransport({
          host: secrets.smtp_host, port, secure: port === 465, requireTLS: port === 587,
          auth: { user: secrets.smtp_user, pass: secrets.smtp_pass },
        });
        fromHeader = `${secrets.sender_name || club?.name || "Club"} <${secrets.sender_email}>`;
      }
      sigBlock = club?.email_signature_html
        ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${club.email_signature_html}</div>` : "";
      disclaimerBlock = club?.email_disclaimer
        ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(club.email_disclaimer)}</p>` : "";
    }

    let sent = 0, failed = 0, skipped = 0;
    const deadline = Date.now() + 100_000; // stay well inside the edge wall-clock limit
    let outOfTime = false;

    // Re-dispatch (retry) never re-sends to a recipient/channel already delivered.
    const { data: prior } = await admin.from("comms_deliveries")
      .select("club_member_id,channel").eq("campaign_id", campaignId).eq("status", "sent");
    const alreadySent = new Set((prior ?? []).map((d: any) => `${d.club_member_id}:${d.channel}`));
    // Optional per-recipient merge values (e.g. tournament partner / amount due), selected audiences only.
    const memberVars: Record<string, Record<string, unknown>> =
      campaign.audience_type === "selected" && campaign.audience_filter && typeof campaign.audience_filter.member_vars === "object"
        ? campaign.audience_filter.member_vars : {};

    for (const m of recipients) {
      if (Date.now() > deadline && channels.some((c) => !alreadySent.has(`${m.id}:${c}`))) { outOfTime = true; break; }
      const vars = await mergeVarsFor(m, club, campaign.audience_league_id);
      for (const [k, v] of Object.entries(memberVars[m.id] ?? {})) {
        if (/^[a-z_]{1,40}$/.test(k) && (typeof v === "string" || typeof v === "number")) vars[k] = String(v).slice(0, 4000);
      }

      // Existing-member onboarding: every recipient gets their OWN link. Unclaimed
      // members get a single-use personal activation code (only its hash is stored);
      // members who already have a login get the plain sign-in page. Other actions
      // keep the shared club URL unchanged.
      // Onboarding audiences re-check linked state right before each send: anyone who
      // activated after the audience was previewed (or mid-send) is excluded.
      const recheckLinked = campaign.audience_type === "unlinked" || campaign.audience_filter?.purpose === "activation";
      if (recheckLinked) {
        const { data: fresh } = await admin.from("club_members").select("user_id,status").eq("id", m.id).maybeSingle();
        if (!fresh || fresh.user_id || (campaign.audience_type === "unlinked" && fresh.status !== "active")) {
          for (const ch of channels) {
            if (alreadySent.has(`${m.id}:${ch}`)) continue;
            skipped++;
            await logDelivery({ campaign_id: campaignId, club_id: campaign.club_id, club_member_id: m.id, channel: ch,
              recipient_name: m.name ?? null, target: null, status: "skipped", error_message: "Already linked to a SquashHub account" });
          }
          continue;
        }
      }

      let recipientAction = action;
      if (action.key === "register_existing_member" && channels.some((c) => !alreadySent.has(`${m.id}:${c}`))) {
        try {
          recipientAction = await personalOnboardingAction(action, m, club?.subdomain, campaignId);
        } catch (err) {
          for (const ch of channels) {
            if (alreadySent.has(`${m.id}:${ch}`)) continue;
            failed++;
            await logDelivery({ campaign_id: campaignId, club_id: campaign.club_id, club_member_id: m.id, channel: ch,
              recipient_name: m.name ?? null, target: null, status: "failed", error_message: String((err as Error)?.message || err).slice(0, 500) });
          }
          continue;
        }
      }

      for (const ch of channels) {
        if (alreadySent.has(`${m.id}:${ch}`)) { sent++; continue; }
        const rendered = renderChannel(ch, content[ch] ?? {}, vars, recipientAction);
        const base = {
          campaign_id: campaignId, club_id: campaign.club_id, club_member_id: m.id,
          channel: ch, recipient_name: m.name ?? null,
        };

        try {
          if (ch === "email") {
            if (!m.email || !String(m.email).includes("@")) {
              skipped++; await logDelivery({ ...base, target: null, status: "skipped", error_message: "No email address" });
              continue;
            }
            // Match Day Access: fixture/round emails for a competition with access
            // enabled get an "Open scoring" button + QR (persistent token, deep-linked
            // to the recipient's match/court when member_vars carry md_match_id/md_court).
            let mdBlock = "";
            const af = campaign.audience_filter || {};
            const mdKind = af.league_season_id ? "league_season" : af.tournament_id ? "tournament" : null;
            if (mdKind && !String(af.purpose || "").includes("invite")) {
              const mv: any = memberVars[m.id] ?? {};
              const links = await matchDayLinks(admin, {
                kind: mdKind, competitionId: String(af.league_season_id || af.tournament_id),
                subdomain: club?.subdomain, court: mv.md_court != null ? Number(mv.md_court) : null, matchId: mv.md_match_id ?? null,
              }).catch(() => null);
              if (links) mdBlock = matchDayEmailBlock(links);
            }
            const html = `${rendered.body}${mdBlock}${sigBlock}${disclaimerBlock}`;
            if (useManagedEmail) {
              // Main SquashHub domain (managed sending): suppression and rate
              // limits are enforced server-side; a suppressed recipient is skipped.
              let outcome: "sent" | "skipped" | null = null;
              for (let attempt = 0; attempt < 3 && !outcome; attempt++) {
                try {
                  await sendLovableEmail({
                    to: m.email,
                    from: `SquashHub <noreply@squashhub.co.za>`,
                    sender_domain: "reg.squashhub.co.za",
                    subject: rendered.subject,
                    html,
                    text: rendered.text,
                    purpose: "transactional",
                    label: `comms-${campaignId}`,
                    idempotency_key: `${campaignId}:${m.id}:email`,
                  }, { apiKey: Deno.env.get("LOVABLE_API_KEY")!, sendUrl: Deno.env.get("LOVABLE_SEND_URL") });
                  outcome = "sent";
                } catch (e) {
                  if (e instanceof EmailAPIError && e.code === "recipient_suppressed") {
                    outcome = "skipped";
                    break;
                  }
                  const wait = e instanceof EmailAPIError && e.status === 429 ? Math.min(e.retryAfterSeconds ?? 60, 30) : 0;
                  if (wait && attempt < 2) { await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
                  throw e;
                }
              }
              if (outcome === "skipped") {
                skipped++; await logDelivery({ ...base, target: m.email, status: "skipped", error_message: "Recipient suppressed (unsubscribed/bounced)" });
              } else {
                sent++; await logDelivery({ ...base, target: m.email, status: "sent" });
              }
            } else {
              await transporter.sendMail({
                from: fromHeader, to: m.email, subject: rendered.subject, html,
                text: rendered.text,
              });
              sent++; await logDelivery({ ...base, target: m.email, status: "sent" });
              await new Promise((r) => setTimeout(r, 250)); // pace the mailbox
            }
          } else if (ch === "whatsapp") {
            const phone = normalisePhone(m.phone);
            if (!phone) {
              skipped++; await logDelivery({ ...base, target: null, status: "skipped", error_message: "No mobile number" });
              continue;
            }
            const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
              body: JSON.stringify({
                club_id: campaign.club_id,
                recipients: [{ member_id: m.id, phone: m.phone }],
                body: rendered.body,
                template_key: "club_notice",
                template_variables: { message: rendered.body, link: rendered.url || "" },
                kind: "campaign",
                category: "marketing",
              }),
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok || (out?.sent ?? 0) < 1) {
              failed++;
              await logDelivery({ ...base, target: phone, status: "failed", error_message: String(out?.error || out?.results?.[0]?.error || "WhatsApp send failed").slice(0, 500) });
            } else {
              sent++; await logDelivery({ ...base, target: phone, status: "sent" });
            }
          } else if (ch === "sms") {
            const phone = normalisePhone(m.phone);
            if (!phone) {
              skipped++; await logDelivery({ ...base, target: null, status: "skipped", error_message: "No mobile number" });
              continue;
            }
            const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
              body: JSON.stringify({
                club_id: campaign.club_id,
                recipients: [{ member_id: m.id, phone: m.phone }],
                body: rendered.text || rendered.body,
                kind: "campaign",
              }),
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok || (out?.sent ?? 0) < 1) {
              failed++;
              await logDelivery({ ...base, target: phone, status: "failed", error_message: String(out?.error || out?.results?.[0]?.error || "SMS send failed").slice(0, 500) });
            } else {
              sent++; await logDelivery({ ...base, target: phone, status: "sent" });
            }
          } else {
            if (!m.user_id) {
              skipped++; await logDelivery({ ...base, target: null, status: "skipped", error_message: "No linked app account" });
              continue;
            }
            const { error } = await admin.from("notifications").insert({
              user_id: m.user_id,
              club_member_id: m.id,
              title: rendered.subject,
              message: rendered.body,
              type: "campaign",
              url: rendered.url || "/notifications",
              data: {
                campaign_id: campaignId,
                action_key: action.key,
                action_label: action.label,
                action_url: recipientAction.webUrl,
                app_path: recipientAction.appPath,
                // Per-recipient buttons (e.g. Pay now, Join WhatsApp group) from member_vars.
                actions: (() => {
                  const mv = (memberVars[m.id] ?? {}) as Record<string, unknown>;
                  const out: Array<{ kind: string; label: string; url: string }> = [];
                  const pay = typeof mv.pay_url === "string" ? mv.pay_url : "";
                  if (pay.startsWith("/")) out.push({ kind: "pay", label: String(mv.pay_label || "Pay now"), url: pay });
                  const wa = typeof mv.wa_url === "string" ? mv.wa_url : "";
                  if (/^https:\/\/chat\.whatsapp\.com\//.test(wa)) out.push({ kind: "whatsapp", label: "Join WhatsApp group", url: wa });
                  return out;
                })(),
              },
            });
            if (error) throw error;
            sent++; await logDelivery({ ...base, target: m.user_id, status: "sent" });
          }
        } catch (err) {
          failed++;
          await logDelivery({ ...base, status: "failed", error_message: String((err as Error)?.message || err).slice(0, 500) });
        }
      }
    }

    if (outOfTime) {
      await admin.from("comms_campaigns").update({
        status: "sending", started_at: new Date().toISOString(), sent_count: sent, failed_count: failed, skipped_count: skipped,
      }).eq("id", campaignId);
      const next = fetch(`${SUPABASE_URL}/functions/v1/send-comms-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ campaign_id: campaignId, resume: true }),
      }).catch(() => null);
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(next);
      return json({ ok: true, status: "sending", continuing: true, sent, failed, skipped, channels, recipients: recipients.length });
    }

    const status = sent === 0 ? "failed" : failed > 0 ? "partial" : "sent";
    await admin.from("comms_campaigns").update({
      status, sent_count: sent, failed_count: failed, skipped_count: skipped,
      sent_at: new Date().toISOString(),
    }).eq("id", campaignId);

    return json({ ok: true, status, sent, failed, skipped, channels, recipients: recipients.length });
  } catch (err) {
    return json({ error: (err as Error)?.message || String(err) }, 500);
  }
});
