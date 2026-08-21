# Invites: separate "audience" from "sending"

Today one dropdown called **Invite actions** mixes three different things: who gets invited, when they get invited, and test sends. Choosing recipients can also fire a real send immediately (the "Send to selected members" dialog sends the moment you confirm). That is the confusion.

The new layout in the Invites & messaging step, top to bottom:

## 1. Invite audience (choosing only — never sends)
Renamed from "Invite actions" to **Invite audience**.

- Radio: All club members / Selected league teams / Selected individual members.
- Each option reveals its picker inline (league team tree, or the member checkbox list).
- **Selected individual members** uses the existing member picker, but the dialog button becomes **Save selection** instead of "Send to N members" — it only stages recipients, nothing goes out.
- Live summary underneath: "Will reach N members — X active members, excluded: 43 visitors, 2 inactive."
- Nothing in this block can trigger an email or notification.

## 2. Invite delivery method
Unchanged (in-app / email / WhatsApp), stays where it is.

## 3. When to send invites (the actions)
Moved to sit directly **below** the audience block, and gains the actual trigger:

- Manual — I'll trigger later (default)
- Send immediately on save
- Schedule for date + time
- **[Send invites now]** button — the one and only bulk trigger. Shows the resolved recipient count on the button ("Send invites now (192)") and opens a confirmation listing audience, count, and delivery channels before anything is sent.
- The button is disabled until the tournament is saved and the audience resolves to at least one member.
- Sending marks recipients as invited so a repeat click does not re-mail people already invited (existing behaviour retained), and the block shows "Last sent: <date>, N recipients".

## 4. Test invite (separate, clearly marked)
A small **Send test invite** action of its own, outside the audience and timing blocks, with a "test only — does not create entries" caption. Keeps the current single option: send test as an invited player to an email you type.

## Technical notes
All changes are in `src/components/club-admin/ClubChampsTab.tsx`:

- Remove the `DropdownMenu` "Invite actions" trigger and its radio group; render the audience radios + pickers as an inline card (the inline audience card already exists at the top of the invites step — this becomes the single instance, removing the duplicate in the dropdown).
- Invitee picker footer: replace the `sendChampInvites(..., { mode: "selected" })` call with a state commit into the staged individual-audience set. `openInviteePicker`'s roster materialisation stays (it still needs registration ids) but must not notify.
- `sendChampInvites` is called from exactly two places afterwards: the new **Send invites now** button, and the existing `inviteTiming === "now"` path on save.
- Move the `registrationRequired` "When to send invites" block so it renders after the audience block, and add the send button + last-sent metadata inside it.
- `sendTestInvite` / `openTestInviteDialog` keep working, just relocated to their own row.
- No database or edge-function changes; audience resolution (`resolveInviteAudience`) and recipient filtering stay exactly as they are.
