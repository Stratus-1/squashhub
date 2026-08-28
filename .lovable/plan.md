# Result emails: admin CC, backfill, then publish

## What you asked for
1. CC the club admin on the post-match congratulations / hard-luck emails.
2. Send those emails for championship games already played over the last couple of days (they were played before the feature went live, so nothing was queued).
3. Publish.

## Current state (verified)
- The post-match email trigger exists and queues into the email outbox with kind `champ_result`. No `champ_result` emails have been queued in the last 7 days, so nothing has gone out yet.
- Championship matches completed with a play date of 27 Aug (6) and 28 Aug (8) — these are the "last couple of days" games to backfill.
- The outbox and the sending function have no CC concept today; every queued message goes to exactly one recipient.

## Plan

### 1. Add CC support to club emails
- Add a `cc_emails` (text array) column to the email outbox.
- The sender passes those addresses as real CC recipients on the message, so the admin sees the same email the player got (rather than a duplicate copy).

### 2. CC the club admin automatically
- The result-email trigger fills `cc_emails` with the club's admin address: the club's configured contact/notification email if set, otherwise the club's active admin members' emails (de-duplicated, capped at 3 to keep the header sane).
- Applies to both winner and loser emails.

### 3. Backfill the last couple of days
- Queue result emails for completed, non-bye championship matches played on 27 and 28 Aug that have a winner recorded, using the exact same wording and the same admin CC.
- Existing de-duplication (one row per match per member) prevents anyone getting two copies.
- Emails drain through the existing paced sender, so the backfill will trickle out rather than burst.

### 4. Publish
Before publishing I need a decision from you: the security scan still shows 3 unresolved critical findings in the billing layer, where members can mark their own fees/credits as paid:
- club fee payments — self set `paid = true`
- platform fee payments — self set `paid = true`
- member credit transactions — self insert with `status = 'confirmed'`

Options: (a) I fix these first with guard triggers restricting the money columns to admin/gateway writes, then publish; or (b) publish now and address them next. Tell me which and I'll proceed — the default I'd recommend is (a).

## Technical notes
- Migration: `alter table public.email_outbox add column cc_emails text[]`; update `queue_champ_result_emails()`; add a one-off backfill statement scoped to `scheduled_date in ('2026-08-27','2026-08-28')`.
- Sender change in `supabase/functions/process-email-outbox/index.ts` plus the `cc` field in `supabase/functions/email-notifications/index.ts` send path.
- No RLS weakening; the outbox stays admin/service-role readable.
