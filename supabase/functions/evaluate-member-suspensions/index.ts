// Evaluate all clubs' members for arrears, send warning/suspension notifications,
// and flip suspension_status when thresholds are crossed. Runs daily via pg_cron.
//
// Notifications cadence per club rules.notification_days (default [7,3,1]).
// Suspended members get a reminder every rules.suspended_reminder_days (default 7).
// Uses `member_suspension_log` for per-day dedup on `automatic=true` rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface Rules {
  enabled: boolean;
  grace_days: number;
  amount_threshold: number;
  age_days_threshold: number;
  exempt_with_mandate: boolean;
  blocks: string[];
  grace_message: string;
  notification_days: number[];
  channels: string[]; // email | push | in_app
  suspended_reminder_days: number;
}

const DEFAULTS: Rules = {
  enabled: false,
  grace_days: 30,
  amount_threshold: 500,
  age_days_threshold: 60,
  exempt_with_mandate: true,
  blocks: ["bookings", "door", "league", "challenges", "events", "bar"],
  grace_message: "Your account is in arrears. Please settle outstanding fees to restore access.",
  notification_days: [7, 3, 1],
  channels: ["email", "push", "in_app"],
  suspended_reminder_days: 7,
};

const todayISO = () => new Date().toISOString().slice(0, 10);

async function alreadyLoggedToday(memberId: string, kind: string) {
  const start = todayISO() + "T00:00:00Z";
  const { data } = await supa
    .from("member_suspension_log")
    .select("id")
    .eq("club_member_id", memberId)
    .eq("reason", kind)
    .gte("created_at", start)
    .limit(1);
  return (data || []).length > 0;
}

async function logAction(args: {
  club_id: string;
  club_member_id: string;
  previous_status: string;
  new_status: string;
  kind: string;
  outstanding: number;
}) {
  await supa.from("member_suspension_log").insert([{
    club_id: args.club_id,
    club_member_id: args.club_member_id,
    previous_status: args.previous_status as any,
    new_status: args.new_status as any,
    reason: args.kind,
    outstanding: args.outstanding,
    automatic: true,
  }]);
}

async function sendEmail(recipient: string, data: Record<string, any>, key: string) {
  try {
    await supa.functions.invoke("send-transactional-email", {
      body: {
        templateName: "arrears-warning",
        recipientEmail: recipient,
        idempotencyKey: key,
        templateData: data,
      },
    });
  } catch (e) {
    console.warn("[arrears] email failed:", e);
  }
}

async function insertNotification(args: {
  user_id: string | null;
  club_member_id: string;
  title: string;
  message: string;
  isSuspended: boolean;
}) {
  await supa.from("notifications").insert([{
    user_id: args.user_id,
    club_member_id: args.club_member_id,
    title: args.title,
    message: args.message,
    type: "arrears",
    url: "/account#fees",
    data: { suspended: args.isSuspended } as any,
  }]);
}

async function sendPush(userId: string, title: string, message: string) {
  try {
    await supa.functions.invoke("push-notifications", {
      body: { user_id: userId, title, body: message, url: "/account#fees" },
    });
  } catch (e) {
    console.warn("[arrears] push failed:", e);
  }
}

async function processClub(club: any) {
  const rules: Rules = { ...DEFAULTS, ...((club.suspension_rules as Partial<Rules>) || {}) };
  if (!rules.enabled) return { skipped: true };

  const { data: members } = await supa
    .from("club_members")
    .select("id, user_id, name, email, suspension_status, suspension_manual")
    .eq("club_id", club.id)
    .eq("is_active", true);

  if (!members?.length) return { processed: 0 };

  const memberIds = members.map((m: any) => m.id);
  const [{ data: fees }, { data: mandates }] = await Promise.all([
    supa
      .from("club_member_fee_payments")
      .select("club_member_id, amount, invoice_due_date, created_at")
      .in("club_member_id", memberIds)
      .eq("paid", false),
    supa
      .from("stitch_mandates")
      .select("club_member_id")
      .in("club_member_id", memberIds)
      .in("status", ["active", "pending"]),
  ]);

  const mandateSet = new Set((mandates || []).map((m: any) => m.club_member_id));
  const byMember = new Map<string, any[]>();
  for (const f of fees || []) {
    const arr = byMember.get(f.club_member_id) || [];
    arr.push(f);
    byMember.set(f.club_member_id, arr);
  }

  const now = Date.now();
  const graceMs = rules.grace_days * 86400000;
  let counter = 0;

  for (const m of members) {
    if (m.suspension_manual) continue; // don't auto-touch manual holds

    const fs = byMember.get(m.id) || [];
    let outstanding = 0;
    let oldestAgeDays = 0;
    for (const f of fs) {
      const due = f.invoice_due_date
        ? new Date(f.invoice_due_date).getTime()
        : new Date(f.created_at).getTime();
      if (now - due < graceMs) continue;
      outstanding += Number(f.amount || 0);
      const ageDays = Math.floor((now - due) / 86400000);
      if (ageDays > oldestAgeDays) oldestAgeDays = ageDays;
    }

    const exempt = rules.exempt_with_mandate && mandateSet.has(m.id);
    const overAmount = outstanding >= rules.amount_threshold;
    const overAge = oldestAgeDays >= rules.age_days_threshold;
    const shouldSuspend = !exempt && (overAmount || overAge);

    // Days until suspension: min days needed to breach the age threshold OR
    // just report 0 if amount already breaches.
    let daysRemaining = 999;
    if (overAmount) {
      daysRemaining = 0;
    } else if (outstanding > 0) {
      daysRemaining = Math.max(0, rules.age_days_threshold - oldestAgeDays);
    }

    const payUrl = `https://squashhub.co.za/account#fees`;
    const displayName = m.name || "Member";

    // 1) Transition to suspended
    if (shouldSuspend && m.suspension_status !== "suspended") {
      await supa.from("club_members").update({
        suspension_status: "suspended",
        suspension_outstanding: outstanding,
        suspension_reason: overAmount ? `R${outstanding.toFixed(0)} outstanding` : `${oldestAgeDays} days overdue`,
        suspended_at: new Date().toISOString(),
      }).eq("id", m.id);

      await logAction({
        club_id: club.id, club_member_id: m.id,
        previous_status: m.suspension_status, new_status: "suspended",
        kind: "auto_suspend", outstanding,
      });

      if (rules.channels.includes("email") && m.email) {
        await sendEmail(m.email, {
          memberName: displayName, clubName: club.name, outstanding,
          isSuspended: true, graceMessage: rules.grace_message, payUrl,
        }, `arrears-suspend-${m.id}-${todayISO()}`);
      }
      if (rules.channels.includes("in_app")) {
        await insertNotification({
          user_id: m.user_id, club_member_id: m.id,
          title: "Account suspended",
          message: `Your account is suspended for arrears. Outstanding R${outstanding.toFixed(0)}. Pay to restore access.`,
          isSuspended: true,
        });
      }
      if (rules.channels.includes("push") && m.user_id) {
        await sendPush(m.user_id, "Account suspended",
          `R${outstanding.toFixed(0)} outstanding — pay to restore access.`);
      }
      counter++;
      continue;
    }

    // 2) Clear back to active if paid up
    if (!shouldSuspend && m.suspension_status !== "active") {
      await supa.from("club_members").update({
        suspension_status: "active",
        suspension_outstanding: outstanding,
        suspension_cleared_at: new Date().toISOString(),
        suspension_reason: null,
      }).eq("id", m.id);
      await logAction({
        club_id: club.id, club_member_id: m.id,
        previous_status: m.suspension_status, new_status: "active",
        kind: "auto_clear", outstanding,
      });
      if (rules.channels.includes("in_app")) {
        await insertNotification({
          user_id: m.user_id, club_member_id: m.id,
          title: "Access restored",
          message: "Thanks — your account is up to date and access has been restored.",
          isSuspended: false,
        });
      }
      counter++;
      continue;
    }

    // 3) Already suspended — periodic reminder
    if (m.suspension_status === "suspended") {
      if (rules.suspended_reminder_days <= 0) continue;
      const kind = "suspended_reminder";
      if (await alreadyLoggedToday(m.id, kind)) continue;
      // dedup weekly — check log within the last N days
      const cutoff = new Date(now - rules.suspended_reminder_days * 86400000).toISOString();
      const { data: recent } = await supa
        .from("member_suspension_log")
        .select("id")
        .eq("club_member_id", m.id)
        .eq("reason", kind)
        .gte("created_at", cutoff)
        .limit(1);
      if ((recent || []).length > 0) continue;

      await logAction({
        club_id: club.id, club_member_id: m.id,
        previous_status: "suspended", new_status: "suspended",
        kind, outstanding,
      });
      if (rules.channels.includes("email") && m.email) {
        await sendEmail(m.email, {
          memberName: displayName, clubName: club.name, outstanding,
          isSuspended: true, graceMessage: rules.grace_message, payUrl,
        }, `arrears-reminder-${m.id}-${todayISO()}`);
      }
      if (rules.channels.includes("in_app")) {
        await insertNotification({
          user_id: m.user_id, club_member_id: m.id,
          title: "Still suspended",
          message: `R${outstanding.toFixed(0)} outstanding. Pay to restore access.`,
          isSuspended: true,
        });
      }
      if (rules.channels.includes("push") && m.user_id) {
        await sendPush(m.user_id, "Account still suspended",
          `R${outstanding.toFixed(0)} outstanding — pay to restore access.`);
      }
      counter++;
      continue;
    }

    // 4) Warning on scheduled days
    if (outstanding > 0 && rules.notification_days.includes(daysRemaining)) {
      const kind = `warn_${daysRemaining}d`;
      if (await alreadyLoggedToday(m.id, kind)) continue;

      await logAction({
        club_id: club.id, club_member_id: m.id,
        previous_status: m.suspension_status, new_status: m.suspension_status,
        kind, outstanding,
      });
      if (rules.channels.includes("email") && m.email) {
        await sendEmail(m.email, {
          memberName: displayName, clubName: club.name, outstanding,
          daysRemaining, isSuspended: false,
          graceMessage: rules.grace_message, payUrl,
        }, `arrears-warn-${m.id}-${todayISO()}`);
      }
      if (rules.channels.includes("in_app")) {
        await insertNotification({
          user_id: m.user_id, club_member_id: m.id,
          title: `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} until suspension`,
          message: `R${outstanding.toFixed(0)} outstanding. Please settle to avoid suspension.`,
          isSuspended: false,
        });
      }
      if (rules.channels.includes("push") && m.user_id) {
        await sendPush(m.user_id, `${daysRemaining}d until suspension`,
          `R${outstanding.toFixed(0)} outstanding.`);
      }
      counter++;
    }
  }

  return { processed: counter };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: clubs, error } = await supa
      .from("clubs")
      .select("id, name, suspension_rules");
    if (error) throw error;

    const summary: any[] = [];
    for (const club of clubs || []) {
      try {
        const res = await processClub(club);
        summary.push({ club_id: club.id, name: club.name, ...res });
      } catch (e) {
        console.error("[arrears] club failed", club.id, e);
        summary.push({ club_id: club.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
