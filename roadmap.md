# Roadmap

## Current: CSIR tournament invite extras + build fixes
- [x] Add `invite_extra_details` column to `tournaments`
- [x] Render extras inside auto-generated tournament details block in invites
- [x] Textarea UI in "Invites & messaging" section
- [x] Confirm saving tournament does NOT auto-send emails/invites
- [ ] Fix remaining Supabase Edge Function build errors
  - [x] court-lights, create-club, email-notifications, nsa-scrape-positions, process-email-queue
  - [ ] ai-assistant, gobook-sync, league-player-signup, mcp, nsa-submit-result, router-poll, stitch-return-target, stitch-webhook, yoco-verify-checkout
- [ ] Run full frontend typecheck and build

## Important user constraints
- **Do NOT send out emails automatically** — tournament saves/updates must not trigger email sends. The existing "Send invites now" manual action remains the only send path.

## Backlog
- Bar / POS payment options (mostly complete)
- Visitor open tab for the evening
