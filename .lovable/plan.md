# Communications Engine (multi-channel templates, campaigns, actions)

One engine every future SquashHub communication uses: shared merge fields, shared actions, per-channel versions (Email / WhatsApp / In-app), and a single send pipeline with drafts, scheduling and a delivery log.

## What the admin sees

**Communications tab → four sub-tabs**

1. **Templates** — a template is one message with up to three channel versions.
   - Email version: subject + rich body
   - WhatsApp version: plain text body (or approved template SID)
   - In-app version: title + short message
   - Shared across versions: merge fields and **actions**
   - Missing versions are shown as grey "not set up" chips so gaps are obvious before send time.

2. **Campaigns (send wizard)** — 5 steps:
   - Pick template
   - Choose recipients (all members / selected / league / skills filter)
   - **Tick channels for this send** (only ticked channels are ever used — WhatsApp-only means WhatsApp only)
   - Preview each ticked channel side by side, rendered with a real recipient's data
   - Send now, or schedule for a date/time (saved as `scheduled`), or save as `draft`

   Validation: ticking a channel with no template version, or with no reachable recipients for that channel (no phone / no email / no linked app user), shows a blocking warning listing exactly what is missing. The Send button stays disabled until the channel is unticked or the version is added.

3. **Delivery log** — every message attempt across all channels: recipient, channel, status (queued/sent/failed/skipped), reason, timestamp. Filterable by campaign and channel.

4. **Scheduled & drafts** — upcoming sends with edit/cancel, plus unfinished drafts.

## Actions (the call-to-action)

Templates store an **action type**, never a raw URL.

- Admin picks from a registry, e.g. *My Profile → Skills & Expertise*, *My Fees*, *Court Bookings*, *Tournament entry*, *League fixtures*, plus an *External link* escape hatch.
- The engine resolves each action per channel:
  - **In-app**: taps straight to the in-app screen/section (deep link, no browser)
  - **Email**: rendered as a branded button
  - **WhatsApp**: the same URL appended as a short line
- Routes live in one registry file. If a route changes later, it changes in one place and every existing template keeps working.
- A campaign may define one primary action (and optional secondary).

## Technical design

**Registries (single source of truth, `src/lib/comms/`)**
- `merge-fields.ts` — one shared field catalogue (existing 13 fields + action fields), used by editor chips, preview and server render.
- `actions.ts` — action registry: `key`, label, group, in-app route builder, web URL builder, optional param schema (e.g. `tournament_id`). Resolution helper `resolveAction(action, { channel, clubSubdomain })`.
- `render.ts` — pure merge/render used by both client preview and edge function (mirrored in `supabase/functions/_shared/comms-render.ts`) so preview and delivery never diverge.
- `validation.ts` — `validateCampaign(template, channels, recipients)` returning structured warnings.

**Database (new migration, all with GRANTs + RLS scoped by `is_club_admin`)**
- `comms_templates` — club_id, name, category, action config (jsonb), timestamps. Existing `club_email_templates` rows are migrated in as email versions.
- `comms_template_versions` — template_id, channel (`email`|`whatsapp`|`in_app`), subject, body, unique (template_id, channel).
- `comms_campaigns` — club_id, template_id, name, channels text[], audience config, status (`draft`|`scheduled`|`sending`|`sent`|`partial`|`failed`|`cancelled`), `scheduled_for`, per-channel counters, action snapshot.
- `comms_deliveries` — campaign_id, club_member_id, channel, target (email/phone/user_id), status, error, sent_at. This is the delivery log.
- Existing email campaign tables stay for history; the new UI reads the new tables.

**Edge functions**
- `send-comms-campaign` — the single dispatcher: verifies club admin, expands recipients once, then per ticked channel renders that channel's version and fans out to Email (club SMTP, existing paced logic), WhatsApp (existing `send-whatsapp`), and In-app (`notifications` insert with resolved deep link). Writes one `comms_deliveries` row per recipient per channel. Idempotent per (campaign, member, channel).
- `run-scheduled-comms` — cron every 5 minutes, claims due `scheduled` campaigns and calls the dispatcher.

**In-app deep link hardening**
- `notifications.url` gets the resolved in-app route; `notification-navigation.ts` is extended to honour campaign actions and scroll to the target section.
- The Profile page gains a `#skills` section anchor so *My Profile → Skills & Expertise* lands directly on it.

**Reuse**
- A small helper `sendComms({ clubId, templateKey, recipients, channels, vars, action })` so future features (fees, fixtures, tournaments) send through this engine rather than ad-hoc code.

**Tests**
- merge rendering, action resolution per channel, channel-selection isolation (WhatsApp-only sends nothing else), validation warnings, scheduling claim logic.

## Not in this pass
- Per-recipient A/B or drip sequences
- Replacing existing transactional emails (they keep working; they migrate onto the engine incrementally)
