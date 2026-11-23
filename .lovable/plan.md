# Club agreement (SLA): Stitch payment gateway clause

## What changes
Add a new section to the SquashHub agreement clubs sign, called **"11. Payment Gateways (Stitch)"**. The old sections 11–13 move down to 12–14.

Draft wording:

> **11. Payment Gateways (Stitch)**
> - The Provider only assists the Club to apply for, and connect to the Service, the Stitch payment gateway ("Stitch"), for example by preparing the application and supplying the Club's documents with the Club's consent.
> - Any agreement for payment services is solely between the Club and Stitch, on Stitch's own terms, including the Stitch Express Terms and Conditions (stitch.money/express-legal/terms-and-conditions) and the Stitch Terms of Use (stitch.money/legal/terms-of-use). The Provider is not a party to that agreement and does not act as Stitch's agent, reseller or representative.
> - The Provider has no financial or other interest in Stitch. It receives no commission, referral fee, rebate or any other payment or back payment from Stitch for the Club's application or transactions.
> - Any bulk or volume fee discounts the Provider negotiates with Stitch are passed on in full to the Club.
> - The Provider is not responsible for Stitch's services, including approval or refusal of applications, verification checks, transaction fees, settlements and payouts, refunds, chargebacks, account suspension or service interruptions. These are matters between the Club and Stitch. The Provider will still help with any problem in the SquashHub side of the connection.
> - The Club may choose not to use Stitch, or to use another payment method the Service supports. The same principles apply to any other third-party payment provider the Club connects.

## Version and existing clubs
- The agreement goes from **version 1.5 to 1.6**, with a new effective date.
- Clubs that have already signed (e.g. Uitsig, CSIR) **stay signed**. Their saved version stays as it was, and nothing gets blocked or asks them to sign again. New sign-ups accept v1.6.
- Section 12 of the agreement says material changes must be communicated 30 days in advance. This clause only clarifies and protects the club (no new costs or duties), but I can draft a short notice for office bearers. Nothing will be sent without your approval.

## Technical details
- Edit `src/components/SquashHubSlaContent.tsx`: insert the section, renumber the later headings, set `SLA_VERSION = "1.6"` and `SLA_EFFECTIVE_DATE` as chosen. The Stitch links open in a new tab.
- `sla_version` is only recorded on acceptance (`ClubParticipationCard.tsx`) and is never compared against the current version, so existing acceptances keep working. Adjust the frequency test only if it depends on the current version.
- No database or balance changes.
