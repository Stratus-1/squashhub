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
- [ ] Persist a server-assigned club number when an existing member completes onboarding.
- [ ] Restore the affected Gordons Bay member as GBSQ0036 and verify the wizard stays complete.
- [ ] Trace the captured Stitch mandate payment that was not credited in SquashHub.
- [ ] Reconcile the real provider charge idempotently and prevent future captured-but-uncredited mandates.
- [ ] Keep the pending EFT top-up separate from the recurring card mandate flow.
