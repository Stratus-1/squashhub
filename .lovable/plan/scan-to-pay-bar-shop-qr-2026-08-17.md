# Scan-to-Pay Bar & Shop (QR)

Yes, this is possible — and the club-ambiguity problem is solved by not relying on the product's own barcode as the identity.

The QR code the customer scans is not the product barcode. It is a club-generated URL/short-code that contains the club identity plus the product. For example:

```text
https://nelspruit.squashhub.co.za/s/abc123
```

That `abc123` maps to one row: **Nelspruit club + Castle Light + R45**. Even if another club also sells Castle Light, their QR code will have a different short code and a different URL. The product barcode is only used to help the admin find the product in the catalogue quickly; the printed QR code is always club-specific.

Two label modes, both generated in the admin bar screen:

- **Per-product labels** — one sticker per product/shelf tag. Scan straight to that item.
- **One venue poster** — a single "Nelspruit Bar" QR next to the fridge. Scan it to open that club's full bar menu, then tap items into a basket.

The venue poster is the cheapest to roll out and also gives us the club context for the *optional* barcode path: once you've scanned the venue QR, the page can use the phone camera to read normal product barcodes (EAN) and match them against that club's item list. So barcodes work, but only inside a venue session — never as a standalone identity.

Geofencing is added as a **safety check, not the identifier**: if the phone's location is far from the club, the page shows a warning ("You don't appear to be at Nelspruit Squash Club") but still allows payment, since GPS indoors is unreliable and some people block location.

## What the user experience looks like

Visitor (not logged in):
1. Scan QR at the bar.
2. Public page opens: club name/logo, item, price, quantity, optional basket.
3. A notice appears at the top: *"Are you a member? Log in to charge this to your club account."* with two buttons — **Log in** (goes to sign-in and returns to this same item afterwards) and **No, continue as guest**. The choice is remembered on that phone so it isn't nagged on every scan.
4. Guest continues: enter name + cell (for the sale record), tap Pay.
5. Card payment via the club's existing payment gateway.
6. Success page + stock decremented + sale recorded as a visitor bar sale.

Member (logged in, same QR):
- No prompt. The page recognises the session and offers a choice: **Pay by card** or **Charge to my account** (existing bar tab flow, credited to My Account).
- After logging in from the prompt, the user lands back on the same product page — no need to re-scan, though re-scanning also works.

## Admin side — printing the stickers

Yes: Nelspruit's admin can print their own labels straight from the club admin bar tab.

- "QR labels" action per item, and a **Print labels** sheet that lays the selected items out as an A4 grid of stickers (fits standard peel-off label sheets).
- Each sticker shows: club logo/name, product name, price, and the QR code.
- Choose which items to include, and how many copies of each (e.g. 6 Castle Light shelf tags).
- One larger **Venue poster** (A4/A5) QR for the fridge or bar counter.
- Ability to regenerate a code if a label is damaged or compromised — the old sticker then stops working.
- Printing uses the browser print dialog, so any normal printer works; output can also be saved as PDF and sent to a print shop.
- Scan-to-pay sales appear in the same bar reports/ledger as today, tagged with the source (QR vs manual).


## Shop reuse

The same short-code table serves a future shop: items just get a different category/type, and the same public product page and checkout are reused. Shipping/collection can be added later without changing the scanning model.

## Technical notes

- New table `bar_qr_codes` (or generic `qr_short_codes`): `code`, `club_id`, `bar_item_id` (nullable = venue-level), `kind`, `active`, `created_at`, with GRANTs and RLS: public `SELECT` on active codes only, club-admin write.
- Optional `barcode` (EAN) column on `bar_items` for the in-venue camera barcode match.
- Optional `latitude`/`longitude`/`radius_m` on `clubs` for the soft location check; reuse the existing proximity helper used for door access.
- New public route `/s/:code` — resolves the code server-side, renders the item/menu, works unauthenticated.
- Guest checkout goes through the existing club payment gateway flow (same as visitor payments today); on webhook success, insert into `bar_visitor_sales` and decrement stock via the existing function.
- Member path reuses the current `bar_tab_entries` charge-to-account logic unchanged.
- QR generated client-side at print time; codes are short, random and non-guessable.

## Suggested build order

1. Short-code table + `/s/:code` public page + venue poster QR (menu view, member charge-to-account only).
2. Guest card checkout via the gateway + visitor sale recording.
3. Per-product label printing sheet.
4. Optional: in-venue EAN barcode scanning and the soft geofence warning.
