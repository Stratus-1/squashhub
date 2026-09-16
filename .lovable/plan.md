# Booking confirmations, reminders and visitor fees

Two new booking rules for each club, plus a per-booking choice for the member.

## 1. Confirmation and reminder messages

Today a court booking sends nothing when it is made, and the day-before reminder always goes out as an in-app notification plus email. This becomes configurable.

**Club setting (Courts -> Booking rules, new "Booking messages" card)**

- Send a confirmation when a booking is made: on/off, plus the default channels (in-app, email, SMS, WhatsApp).
- Send a reminder before the booking: on/off, default channels, and how many hours before (free number, default 24).
- Only channels the club actually has are offered: WhatsApp appears only when the club has WhatsApp switched on, SMS only when SMS is available. In-app and email are always available.

**Member choice at booking time (booking dialog)**

Under the booking options, a small "Remind me" row:

- Confirm now: yes/no
- Remind me: off, or a number of hours before
- Channel dropdown: in-app / email / SMS / WhatsApp (only what the club allows)

It opens pre-filled with the club's defaults, so a member who changes nothing just gets the club behaviour. The member's last choice is remembered for their next booking.

Both the booker and the opponent (when the opponent is a linked member) get the confirmation and the reminder, each on their own saved preference.

## 2. Visitor fee on bookings and visitor registration

The club already has a visitor fee amount under Visitors. It is currently never charged. Changes:

- **Booking with a visitor**: the second-player picker lets the member choose a registered visitor **or type a new name**, which creates a visitor record for the club. A name is compulsory once "Visitor" is chosen — the booking cannot be saved without one.
- A clear note in the dialog: "A visitor fee of R<amount> will be charged to your account for bringing a visitor." Nothing is shown when the club's fee is 0.
- **Charging**: the fee is added to the booking member's account **after the booking slot has passed**, so a cancelled booking never costs anything. This runs in the existing daily job, once per booking, and posts to the club's ledger the same way other member charges do.
- **Visitor registering at the club** (walk-in visitor, not brought by a member): the same fee is raised against that visitor's own record so the club can collect it. Whether they pay on the spot or later stays a club matter for now — the charge is simply recorded as outstanding.
- The Visitors admin screen gets a tooltip on the fee field explaining both cases.

## Technical notes

- New `clubs` columns: `booking_confirm_enabled`, `booking_confirm_channels` (text[]), `booking_reminder_enabled`, `booking_reminder_channels` (text[]), `booking_reminder_hours` (int, default 24). Existing `visitor_booking_fee` is reused unchanged.
- New per-booking columns on `bookings`: `notify_channels` (text[]), `reminder_hours` (int), `confirm_sent_at`, `reminder_sent_at`, `visitor_fee_charged_at`.
- Sending goes through the existing paths: notifications table (in-app + its email bridge), `send-whatsapp`, and the SMS sender. No new send infrastructure.
- Reminder dispatch moves into the existing `reminders` edge function, driven by `reminder_hours` per booking rather than a fixed "tomorrow" window; the daily cron stays as is, with the function checking each booking's own window. Dedup keys per booking prevent repeats.
- Visitor fee posting is a SECURITY DEFINER RPC called from the same function, idempotent on `visitor_fee_charged_at`, writing a member account charge plus the matching ledger entry; club-scoped and RLS-safe.
- No change to challenges, events, tournaments, other gateways or the webhook paths.
