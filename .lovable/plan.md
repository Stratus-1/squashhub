# Court Booking Rules — revised plan (for review, not started)

## 1. Status: what exists vs what is outstanding
| Item | Status |
|---|---|
| Per-day peak hours on the club's real slot times (e.g. 45 min) | Built in preview: per-day storage, server-side peak cap, `PeakHoursEditor` |
| No default weekday/weekend pickers; existing times kept | Built in preview |
| Solo booking wording; free visitor bookings per year | Built in preview |
| Publication of the above | Unconfirmed. The live site still shows the old screen. |
| Everything in sections 2–5 below | **Not built and never approved before.** This plan is the first one for it. |

No earlier plan covered the penalty items, so they were missing.

## 2. Layout of Court Booking Rules (Club Admin only)
Sections in order:
1. Slot length and booking hours
2. Per-member daily limits
3. **Member Created Events / sessions** (moved up from section 4)
4. **Peak Hours per Day** (standalone card)
5. **Peak-Hour Cancellation and No-Show Penalty Fees** (new standalone card, directly after Peak Hours)
6. Visitor settings (in their own card, separate from member rules)
7. Messaging (shows which channels are active, e.g. "Email: on · WhatsApp: off · In-app: on", using the club's real settings)

Presentation:
- More spacing and clearer headings.
- Even two-column balance on desktop and a single column on phone.
- Light and dark contrast both checked.

**Booking hours clarity.** This line is worked out from the club's slot length, opening time and last-slot settings, never hard-coded:

```text
First booking starts 05:15 · Last booking starts 21:45 · Courts close 22:30 (45-min slots)
```

## 3. Peak Hours per Day card
- Read-only summary by default: Mon–Sun, each showing "Peak start – Peak end" or "No peak time".
- **Edit** unlocks the card. **Save** stores only this card. **Cancel** throws away unsaved changes.
- Nothing can be changed accidentally, and the main page save never touches this card.
- Times are chosen only from the club's real slot times.
- Existing per-day data is reused, so current club times stay exactly as they are.

## 4. Peak-Hour Cancellation and No-Show Penalty Fees card (NEW, missing until now)
This card works like Peak Hours: read-only until **Edit**, then its own **Save** and **Cancel**.

Fields:
- **Allow late cancellation of peak-hour bookings.** Default **OFF**.
- **Late-cancellation penalty fee (R).** Only used when the toggle above is ON.
- **Peak-hour no-show penalty fee (R).** Separate from the late-cancellation fee.

Rules:
- **Opt-in:** the whole card is switched off by default for every existing and new club, with fees at R0. While it is off, cancellations work exactly as they do today.
- **Late window.** It starts at the beginning of the slot immediately before the booking. It is one configured slot length (45 min at Uitsig, 60 min at an hourly club), never a fixed hour, with no grace period.
- **Toggle OFF:** once the late window starts, the member cannot cancel. The button explains why. Authorised admins may still cancel with no penalty; who, when, why and the waiver are logged.
- **Toggle ON:** the member may cancel in the late window. The late-cancellation fee is charged once.
- **Non-peak bookings:** current cancellation behaviour stays unchanged, with no fees. This card applies to peak-hour bookings only.
- **One penalty per booking:** a booking can get a late-cancellation fee OR a no-show fee, never both and never twice. The backend enforces this with one penalty record per booking.
- **Penalties are not backdated:** they apply only to bookings made after the settings are saved. Existing bookings, fees and club settings stay untouched.

### How a no-show is established
A no-show is never decided automatically from silence. The booking needs either:
- (a) no check-in/attendance record, using the existing door/access or check-in events where the club has them, from the booking start with no grace period, **and**
- (b) confirmation by an authorised admin in a "Possible no-shows" list.

Clubs with no attendance source rely on admin confirmation alone. The penalty is posted only after confirmation.

### Slot taken over by another member
- The original booking is marked a no-show (or late-cancelled) and its court time is released.
- The replacement booking is a new booking for the released time only. The existing overlap check stops two bookings occupying the same court.
- Liability stays with the **original booker**. The replacement member is never charged a penalty and pays only normal booking fees. The original booker gets at most one penalty.

## 5. Accounting, notifications and appeals
- Penalties post through the existing member-account ledger as a normal fee with a reason and booking reference.
- Waivers and appeals use the existing audited reversal. Nothing is ever deleted.
- The member is notified through the club's active channels when a penalty is charged, with the booking, amount and how to appeal.
- Admins can waive a penalty, with a reason, and it is logged.
- Before saving the card, admins see a short preview of the rules.

## Technical details
- New club settings fields, added without changing existing data: `peak_penalties_enabled` (default false), `peak_late_cancel_allowed` (default false), `peak_late_cancel_fee` (default 0), `peak_no_show_fee` (default 0). There is no grace-period field. No existing club gets values filled in beyond these defaults.
- Admin late cancellations write an audit row recording actor, time, reason and `waived`.
- New `booking_penalties` table: one row per booking (unique `booking_id`), with kind (`late_cancel` | `no_show`), amount, ledger reference, status (`charged` | `waived`) and actor. RLS is scoped to the club.
- Late-window and cancel checks run on the backend in the cancel action, using the same peak function as the booking cap. The browser check is only a convenience.
- The no-show list comes from bookings plus existing attendance/access events. Admin confirmation calls an idempotent backend function.
- Late window = start of booking minus one configured slot length.
- Tests:
  - late window at 45/60/90-min slots
  - toggle OFF blocks, toggle ON charges once
  - no double penalty
  - non-peak unaffected
  - takeover charges the original booker only and creates no overlap
  - waiver creates a reversal
  - no backdating
  - Peak card Edit/Save/Cancel isolation
  - booking-hours label for Uitsig (21:45 start, 22:30 close)
- No publishing until Willem approves.

## Final decisions (8 Oct)
- No grace period of any kind. The half-slot default has been removed.
- Authorised admins may cancel in the late window with no penalty. Who, when, why and the waiver are all logged.
- Rollout leaves every club's existing courts, bookings, fees and booking rules exactly as they are. The whole penalty feature is opt-in and switched off for existing and new clubs, with fees at R0. No penalty is posted until an admin turns it on and sets it up. Nothing is backdated.

## 6. Booking platform vs lighting provider (added 8 Oct)
Two separate settings replace the single master switch. Both are OFF by default for every club:

| Setting | What it does | Which clubs |
|---|---|---|
| **A. Restrict peak-hour late cancellations** | Members can't cancel in the SquashHub app once the slot before starts, with no grace period. Admins may override; the override and reason are logged. | Any club. Covers SquashHub bookings **and** GoBook/external bookings shown in SquashHub. |
| **B. Charge peak-hour penalty fees** (late cancellation and no-show) | SquashHub posts penalty fees to member accounts | **Only clubs whose court lights SquashHub runs**, and only after an admin turns it on and sets amounts. Hidden or locked for other clubs. |

- "Allow late cancellation with a fee" is only available when B is on. Without B, setting A simply blocks the late cancel.
- **Who counts as a SquashHub-lighting club** is decided by the club's lights being controlled through SquashHub's own court-lights system. It is never decided by the booking platform. A club linked to GoBook is not assumed to have SquashHub-managed lights. Step 1 of the build confirms the exact setting that identifies this, before anything is written.
- **No SquashHub penalties for GoBook, Court Manager or other external providers.** They charge their own fees, and SquashHub never writes fees or changes data in their systems.

What the GoBook connection supports (checked in code):
- SquashHub can send a cancellation to GoBook, so the in-app cancel button can be blocked during the late window.
- GoBook already enforces its own rule of roughly 1 hour before start.
- Cancellations made directly on GoBook only show up when the next sync removes the booking. SquashHub **cannot block them**, and the app will not claim it can. Admins see a note saying so.
- Court Manager: no connection found in the code, so it is listed as "restriction not available" until a connection exists.

Rollout stays the same: existing settings, bookings and fees are untouched, nothing is backdated, and there is no grace period.

## Nothing else to confirm
Splitting the switch into A and B resolves the earlier master-switch question. Both start OFF, so every club behaves exactly as it does today until an admin deliberately changes it.
