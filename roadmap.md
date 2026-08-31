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
- [ ] **NEW** Tournament invite audience selector: expand any option (regional league / selected clubs / selected teams) into a member tree with individual select/unselect capability.
