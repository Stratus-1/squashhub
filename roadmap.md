# Roadmap

## Current: registration fee signup verification + Wi-Fi member list + audit fix
- [x] Verify once-off registration fee is billed to every genuinely new member at signup.
- [x] Add a "Members paying Wi-Fi" tab/list in club admin Wi-Fi settings.
- [x] Harden `audit_events` INSERT policy so only trusted server-side paths can write audit records.

## Current: CSIR tournament invite extras + build fixes
- [x] Add `invite_extra_details` column to `tournaments`
- [x] Render extras inside auto-generated tournament details block in invites
- [x] Textarea UI in "Invites & messaging" section
- [x] Confirm saving tournament does NOT auto-send emails/invites
- [x] Fix all Supabase Edge Function build errors
- [x] Frontend TypeScript check and production build pass
- [x] Move `invite_extra_details` to appear BEFORE tournament details block with paragraph spacing (no bullets)
- [x] Update backend invite email (`send_tournament_invites_via_platform`) to include extras before standard message
- [x] Deploy `send-tournament-invite-email` edge function

## Important user constraints
- **Do NOT send out emails automatically** — tournament saves/updates must not trigger email sends. The existing "Send invites now" manual action remains the only send path.

## Backlog
- Bar / POS payment options (mostly complete)
- Visitor open tab for the evening
- [x] Tournament save fails with tournaments_invite_audience_check when invite audience = "clubs" — allow the value in DB constraint.

## NEW: Tournament invite audience member tree
- [x] Expandable member tree under every audience option (regional league / selected clubs / selected teams).
- [x] Flat member list under each expanded node (no extra team grouping).
- [x] Only email-reachable members shown (user login OR manager email on file).
- [x] Individual select/unselect per member; selection persists with the audience choice.
- [x] When eligibility scope = "association" (regional league), hide unaffiliated clubs from the "Selected clubs" tree — only show clubs that belong to the regional league.

## Current: GBSQ member onboarding and recurring-payment recovery
- [x] Persist a server-assigned club number when an existing member completes onboarding.
- [x] Restore the affected Gordons Bay member as GBSQ0036 and verify the wizard stays complete.
- [ ] Verify the member's R1,000 Stitch top-up against the provider before crediting it.
- [x] Route post-registration payment through the ordinary My Account top-up flow.
- [x] Keep once-off top-ups separate from the recurring card mandate flow.

## Stitch once-off payment settlement (Capitec Pay style)
- [x] Store the Stitch collection webhook signing secret (Svix) so recurring events verify.
- [x] Confirm all quarantined webhook events were already settled (nothing to replay).
- [x] Shared settlement helpers (`_shared/stitch-settlement.ts`) used by verify + sweep.
- [x] `stitch-sweep-pending-payments` cron (every 10 min) re-checks once-off sessions unverified after 15 min and settles them.

## Gordons Bay: paid top-up but booking not saved (K Baderoen)
- [x] Diagnose: booking blocked by minimum-balance gate, member redirected to top-top, slot never created.
- [x] Restore Kouthar Baderoen's 01 Sep 17:00 booking (Court 1, lights on).
- [x] Stash the in-progress booking before the top-up redirect and resume it on return.
- [x] Clearer wording: "your slot is not booked yet" in the top-up prompt.

## St John's Squash Club (Zimbabwe)
- [x] Create tenant with slug `stjohns`, currency USD ($).
- [x] First person to register at stjohns becomes club admin automatically.
- [x] Doubles invite UX: make partner selection explicit on accept button + post-accept callout (Grant missed it)

## NEW: Gmail sending block (club SMTP throttling)
- [x] Cap club-mailbox sends per hour (Gmail 20/h, Outlook 30/h) and spill overflow to the SquashHub sender.
- [x] Keep club branding (name, logo, signature, disclaimer) on platform-sent fallback emails.
- [ ] Re-send the invites that Gmail blocked (421) for CSIR.

## Email sending (paused 2 Sep 2026)
- [ ] Tournament invite platform cron jobs (nsc-champs-invites-platform-am/pm) are DISABLED after Gmail + platform rate-limit blocks. Re-enable only with strict pacing.
- [ ] 24 CSIR Bells Doubles invites still unsent (rate_limited at 06:29 UTC 2 Sep) — resend slowly when clear.
- [ ] Cron invite jobs pass the anon key; send-tournament-invite-email now also accepts the internal secret. Update the cron commands before re-enabling.

## NEW: De-duplicate association settings UI
- [x] Annual league fee removed from Setup + Association Info (Fees is the single source).
- [x] Member numbering removed from Setup (Preferences → Member numbering is the single source).

## Completed: Association member rankings directory and navigation clarity
- [x] Add an association member tree grouped by affiliated club with NSF, national ranking, and regional ranking fields.
- [x] Replace repeated association admin tile rows with one compact section selector.
- [x] Make Fee Schedule the canonical home for annual fee amount, renewal month, and payable day; propagate changes to affiliated clubs.
