# Outreach CRM — Super Admin

A new **Outreach** section at `/admin/outreach` for direct marketing to squash clubs (NSA Pretoria first, then the rest of SA and international), with sending, open/click tracking and reply logging.

## What you get

### 1. Prospect database
Per club: club name, association/province, city, country, courts, website, NSA affiliated (yes/no), source, notes, status (New / Contacted / Opened / Clicked / Replied / Interested / Not interested / Bounced / Unsubscribed), owner, next follow-up date.

Per contact: name, role (Chairman / Secretary / League convener / Coach / Other), email, phone, primary contact flag, opt-out flag.

Screens:
- Table with search and filters on association, country, NSA yes/no, status, tag.
- **Paste/CSV import** — paste a block from your ChatGPT research or upload a CSV. A mapping step shows the parsed rows, flags duplicates by email and club name, and lets you fix or skip rows before committing.
- Add/edit a club or contact by hand.
- Tags (`nsa-pretoria`, `wp`, `university`, `international`) for building send lists.
- Export the filtered list back out as CSV.

### 2. Campaign builder
- Create a campaign: name, subject, HTML body, audience (saved filter or tag selection).
- Two starter templates pre-loaded — **NSA clubs (Pretoria)** and **General / international** — editable in the console.
- The NSA template leads with the approval and testing angle: SquashHub integrates directly with the NSA system *with NSA's approval and tested in live league play* — captains mark the scorecard on their phone in the NSA's own layout and submit the result straight to the NSA site from the app. No paper, no re-typing, no second login to NSA after the game, no Sunday-night emailing of scorecards to a convener.
- Merge fields: `{{club_name}}`, `{{contact_name}}`, `{{role}}`, `{{association}}`, `{{city}}`.
- **Video block**: paste your YouTube desktop-HD and mobile-HD URLs plus a thumbnail; the builder inserts a clickable thumbnail linked to the video (no MP4 attachment — it strips and hurts deliverability).
- **Preview** against a real prospect, and **Send test to myself** before any real send.
- **Throttled send**: emails per day and delay between sends, so a 200-club list drips out instead of burning your domain reputation. A daily job picks up where it left off.
- Every recipient gets an unsubscribe link that sets the opt-out flag and blocks future campaigns to that address.

### 3. Tracking
- **Opens** — invisible pixel per recipient; first open, last open, open count. Labelled "indicative" since Apple/Gmail proxies distort it.
- **Clicks** — every link rewritten to a logging redirect, so you see exactly which chairmen watched the video.
- **Replies — logged by you.** On any recipient row: mark Replied / Interested / Not interested / Bounced, add a note, set a follow-up date. The prospect status updates automatically.
- Bounces detected from SMTP failures mark the contact bounced and stop future sends.

### 4. Dashboard
Per campaign: sent, delivered, opened (unique + rate), clicked (unique + rate), replied, unsubscribed, bounced. A recipient table showing each club's status, open count, clicks and last activity — sortable and filterable, so "who opened and who didn't" is one click. Plus a **Needs follow-up** view listing everyone contacted 4+ days ago with no reply.

## Technical notes

**Sending** uses the platform SMTP already in Super Admin → Settings (`platform_smtp_host/port/user/pass`, `platform_sender_email/name` in `app_settings`) — same nodemailer pattern as `send-club-campaign`.

**New tables** (platform-scoped, RLS restricted to `is_platform_admin()`, with GRANTs):
- `outreach_prospects`, `outreach_contacts`, `outreach_campaigns`, `outreach_recipients` (per-contact send/open/click/reply state), `outreach_events` (append-only log), `outreach_links`

**New edge functions:**
- `outreach-send` — builds and sends a throttled batch, records per-recipient state (admin-authenticated)
- `outreach-track` — public: pixel (`/open`), click redirect (`/click`), unsubscribe (`/u`)
- Daily cron on `outreach-send` to continue drip campaigns

**Routing:** `/admin/outreach`, `/admin/outreach/campaigns`, `/admin/outreach/campaigns/:id`, added to the Super Admin menu.

**Deliverability guardrails:** daily send cap, duplicate-email blocking, suppression on unsubscribe/bounce, warning banner if SPF/DKIM aren't set on the sending domain.

## Out of scope
Automatic inbound reply capture (needs a mailbox/IMAP integration) — replies are logged manually for now.
