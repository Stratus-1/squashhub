# Club subscription invoicing: what's wrong and how to fix it

## What I found

### 1. The Super Admin table doesn't match the club screens
The invoices themselves are correct. The Super Admin **Club Subscriptions** table is reading the wrong things.

| Club | What's really owed | What Super Admin shows |
|---|---|---|
| Gordon's Bay | 1 unpaid: October R222 (due 7 Oct) | Unpaid (1), R222. Correct by chance |
| Highveld | 2 unpaid: September R120 (overdue since 7 Sep) and October R120, so **R240** | Overdue (1), **R120** |
| Nelspruit | Paid upfront for 6 months, through 1 Mar 2027. R0 owed | "Standard Monthly", **R872** |
| Riverside | Paid upfront for 6 months, through 28 Feb 2027. R0 owed | "Standard Monthly", **R570** |

Why:
- The **Amount Due** column doesn't add up unpaid invoices. It shows a guess at next month's fee, worked out from today's member count at the monthly rate.
- The **Plan** column shows the plan's default cycle (monthly). It ignores each club's chosen cycle (6-monthly for Nelspruit and Riverside).
- The **Payment** badge only counts the overdue invoice when something is overdue, so Highveld shows "(1)" when it actually has 2 unpaid.

### 2. WhatsApp was left off the October invoices, and SMS has never been billed
September usage that nobody has been billed for yet:

| Club | WhatsApp | SMS |
|---|---|---|
| Nelspruit | 230 messages, R103.50 | 109 messages, R43.50 |
| CSIR | 250, R112.50 | none |
| Gordon's Bay | 101, R45.45 | none |
| Riverside | 7, R3.50 | 5, R1.50 |

Why:
- **WhatsApp:** invoices go out on the 25th. The billing run then looks at the *previous* month's messages. On 25 September it checked **August** (there were none) instead of September. So the October invoices had no WhatsApp line. As things stand, September's messages would only show up on the **November** invoice, a month late. For Nelspruit they would appear on a separate messaging-only invoice in late October.
- **SMS:** the billing run never looks at SMS at all. There's no SMS line on any invoice, and SMS messages are never marked as billed.
- **Nelspruit:** no subscription is due until March, so no invoice was created for October. Its messaging usage was never picked up.

## What I'll change

1. **Super Admin table matches reality**
   - Amount Due = the total of the club's unpaid invoices. The projected next fee moves into the hover text.
   - Payment badge: "Overdue (n)" or "Unpaid (n)" using the full unpaid count, e.g. Highveld becomes "Overdue (1) · 2 unpaid, R240".
   - Plan column shows the club's actual cycle, e.g. "Standard 6-monthly".
2. **Messaging billed on time**
   - On the 25th, the run bills every message from the current month up to that moment. Anything sent after that rolls onto the next invoice. Nothing is skipped or counted twice, because each message is marked with the invoice that billed it.
   - Add an **SMS line** next to the WhatsApp line ("SMS messages: n messages"), at the price already recorded for each message.
   - Clubs paid upfront, like Nelspruit, get a monthly **messaging-only invoice** whenever they have usage.
3. **Catch up September (only with your go-ahead)**
   - Option A: issue one catch-up messaging invoice now for each of Nelspruit, CSIR, Gordon's Bay and Riverside.
   - Option B: leave it, and September usage goes onto the 25 October run.
   - I won't change any invoice that's already been issued (Gordon's Bay R222, Highveld R120 x2).

## Technical details
- `supabase/functions/run-subscription-billing/index.ts`: use the run month (up to the run moment) instead of `previousMonthRange(billingDate)`, while still sweeping any older unbilled messages. Read billable sent rows from `sms_send_log` (`unit_cost * segments`). Stamp the billed messages after the invoice is inserted.
- Migration: add a nullable `platform_invoice_id` to `sms_send_log`, plus an index. Add `sms_amount` and `sms_message_count` to `platform_subscription_invoices`.
- `consolidated.ts`: new `sms` line kind, with the invoice kind set to `combined`/`messaging`. Extend `src/test/consolidated-billing.test.ts`.
- `SuperAdminSubscriptions.tsx`: amount due from the unpaid invoice totals in `invoiceState`, a fuller badge, and the plan label from the club's cycle.
- The invoice view and PDF render the new SMS line. Stitch and EFT payment flows stay unchanged.
- Add an entry to the issue log. Nothing gets published until you ask.
