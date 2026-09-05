# Adding SMS alongside WhatsApp and email

## The idea

SMS becomes a fourth message channel next to email, WhatsApp and in-app. It is cheap, needs no template approval, and always arrives — so it is ideal for short, time-critical, one-way notices. WhatsApp stays for richer, conversational or reply-driven messages.

## When each channel is used

| Situation | Channel |
| --- | --- |
| Booking confirmed / changed / cancelled | SMS (+ in-app) |
| Booking reminder shortly before play | SMS |
| Court lights / door access codes | SMS |
| Invoice due reminder, payment received | Email first, SMS as the nudge one day before due |
| Club champs / tournament entry confirmed, match scheduled, result or win | SMS |
| League team selection, sub requests, availability requests (needs a reply) | WhatsApp |
| Newsletters, rules, statements, anything long or with attachments | Email |
| Marketing / campaigns to many members | Email, WhatsApp opt-in only |

Guiding rules:
- Under 160 characters, no reply needed, must arrive now -> SMS.
- Needs a Yes/No reply, images, or a conversation -> WhatsApp.
- Long, formal, or has a document -> Email.
- Never send the same notice on two paid channels; SMS is the fallback when WhatsApp is unavailable or the recipient has no WhatsApp.
- Members keep a per-channel preference and can opt out of SMS (except critical account/payment notices).

## What gets built

1. **Super Admin -> SMS gateway settings**
   A new card where you save the SMS portal details: provider, API key/username+password or token, sender name (alpha sender ID), default country code, test recipient, and an enable switch. Credentials are stored encrypted server-side, never in the browser. A "Send test SMS" button confirms it works and shows the balance if the provider reports one.

2. **A sending service**
   One backend function that all features call to send an SMS, with delivery logging, retries, opt-out checks, and per-club metering so SMS usage can be billed the same way WhatsApp is.

3. **SMS as a channel in Communications**
   SMS appears next to email/WhatsApp/in-app in templates and campaigns, with a character counter and segment/credit estimate, reachability count (members with a valid mobile number), and entries in the delivery log.

4. **Wire up the priority notices**
   Booking confirmation, booking reminder, championship entry/result, and the invoice-due reminder get an SMS version, following the routing table above.

5. **Per-club controls**
   Club admins switch SMS on/off, choose their sender name, and see their SMS usage and cost. Platform-level notices (subscription invoices) always use your platform gateway.

## Technical notes

- New `sms_gateway` settings stored in the restricted secrets table (platform-level) plus per-club overrides in `club_secrets`.
- New edge function `send-sms`, mirroring `send-whatsapp`: validates input, normalises MSISDN to E.164, checks suppression/opt-out, writes to a delivery log table, and returns provider status/body verbatim on failure.
- `CommsChannel` gains `"sms"`; `validation.ts`, `render.ts`, `send-comms-campaign` and the campaign UI extend to it.
- Metering rows reuse the WhatsApp billing pattern (cost + margin per segment).
- Provider adapter layer so the portal can be swapped (SMSPortal, Clickatell, BulkSMS, Twilio, GatewayAPI) without touching feature code.

## Question before building

Which SMS portal do you use? I will build the adapter for it first and leave the others as options.
