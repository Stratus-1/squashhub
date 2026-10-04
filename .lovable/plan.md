# Step-by-Step builder: choose WHO gets the invitation, then actually send it

Today the builder's **Invite / Inform players** stage (invite mode) only shows the message preview with a disabled "Send invitations" button — "isn't connected yet". The setup's "Who is invited" dropdown picks a *kind* of audience (all members / selected clubs / selected players …) but there is no way to pick *which* players, clubs or individuals, and nothing is ever sent.

## What you'll get

In the Invite stage of Tournament Management:

1. **Invite audience** — choose who gets the invitation:
   - **All club members** (every active member; visitors/inactive/placeholder rows are excluded automatically, with the count shown)
   - **Selected clubs** (regional/national tournaments only — tick clubs in the association tree; members are resolved server-side, contact details never shown)
   - **Selected league teams** (tick leagues/teams)
   - **Selected individuals** (searchable player picker; cross-club search uses the existing privacy-safe directory — names and clubs only, never emails/phones)
   - A live summary line: "Will reach N members — excluded: X visitors, Y inactive."
2. **Send by** — in-app / email / WhatsApp / SMS, same channel chips and reachability counts as the Inform panel.
3. **Preview** — exactly what one recipient will receive, with a per-recipient preview switcher.
4. **Send invitations (N)** — one confirmation dialog listing audience, count and channels; then each invitee gets a registration row (status "invited", or "pending payment" when the fee must be paid first) and their personal message with their own entry link. Sending is logged per recipient so you can see who was reached and resend to individuals.
5. After sending: per-player status (Sent / Not reached + reason), "Send again" to selected or individuals, and "Record: I invited them outside SquashHub" stays.

## Rules kept (existing safeguards, not new inventions)

- A "selected" send can never widen to the whole club — fail-closed, exactly like the legacy tournament invite fix.
- Visitors, resigned/suspended members and placeholder rows are never invited.
- Category gender eligibility still applies.
- Re-inviting someone who declined reopens their row instead of silently skipping them.
- No invitation is ever auto-sent; every send needs the confirmation click.
- No changes to scoring, draws, fixtures, payments or the legacy (non-beta) tournament flow.

## Technical notes

- New `StepInvitePanel.tsx` in `src/components/smart-builder/`, rendered by `StepTournamentManagement.tsx` in place of the disabled preview block (invite mode only; the Inform panel for already-entered players is untouched).
- Audience resolution reuses the tested `resolveInviteAudience` (`src/lib/tournaments/invite-audience.ts`), the scope tree (`invite-scope-tree.ts` / `LeagueSourceTree.tsx`) and the privacy-safe `tournament_invite_directory` RPC — no new data access paths.
- Sending reuses the Communications engine path already used by `sendInform` (comms_campaigns → send-comms-campaign → per-recipient comms_deliveries), plus the registration-row materialisation rules from `sendChampInvites` (upsert invite rows, reopen declined, never touch paid/confirmed rows).
- The audience choice is stored in the tournament's beta lifecycle/handover so reopening the stage restores it.
- Focused tests: all-club excludes visitors/inactive; selected-individuals send reaches exactly those picked; selected-clubs resolves server-side members; re-invite after decline; send is idempotent on double-click; counts match the summary.
- Not published until the focused tests pass.
