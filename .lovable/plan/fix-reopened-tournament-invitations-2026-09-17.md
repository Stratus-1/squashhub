# Fix reopened tournament invitations

## What will change
- Repair Willem’s current Bells invitation so the existing short link opens as an active invitation again.
- When any previously declined or withdrawn player is deliberately re-invited, clear the old decline/withdrawal markers together with reopening the status.
- Add a database safeguard so this remains correct even if re-invites are initiated from an older published screen.
- Record the cause and fix in the project issue log.

## Verification
- Confirm the Bells invitation payload is actionable for Willem’s current short link.
- Add a focused regression check for reopening a withdrawn registration.
- Confirm the preview builds successfully.

## Scope
No changes to tournament eligibility, audience selection, payments, draws, WhatsApp delivery, or other competition workflows. Publishing is not included.
