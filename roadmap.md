# Roadmap

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
- [x] Diagnose: booking blocked by minimum-balance gate, member redirected to top-up, slot never created.
- [x] Restore Kouthar Baderoen's 01 Sep 17:00 booking (Court 1, lights on).
- [x] Stash the in-progress booking before the top-up redirect and resume it on return.
- [x] Clearer wording: "your slot is not booked yet" in the top-up prompt.

## St John's Squash Club (Zimbabwe)
- [x] Create tenant with slug `stjohns`, currency USD ($).
- [x] First person to register at stjohns becomes club admin automatically.
