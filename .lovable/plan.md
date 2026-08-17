# Scan-to-Pay Bar & Shop (QR)

Yes, this is possible — and the club-ambiguity problem is solved by not relying on the product's own barcode as the identity.

## The core idea

A Castle Light barcode is the same everywhere, so it can never identify a venue. Instead the club prints its **own QR labels** from the app. Each label encodes a link like:

```text
https://nelspruit.squashhub.co.za/s/<short-code>
```

where `<short-code>` maps to one row: this club + this item + this price. Scanning with the phone camera (no app, no login) opens a public product page with the club's branding, price and a Pay button.

Two label modes, both generated in the admin bar screen:

- **Per-product labels** — one sticker per product/shelf tag. Scan straight to that item.
- **One venue poster** — a single "Nelspruit Bar" QR next to the fridge. Scan it to open that club's full bar menu, then tap items into a basket.

The venue poster is the cheapest to roll out and also gives us the club context for the *optional* barcode path: once you've scanned the venue QR, the page can use the phone camera to read normal product barcodes (EAN) and match them against that club's item list. So barcodes work, but only inside a venue session — never as a standalone identity.

Geofencing is added as a **safety check, not the identifier**: if the phone's location is far from the club, the page shows a warning ("You don't appear to be at Nelspruit Squash Club") but still allows payment, since GPS indoors is unreliable and some people block location.

## What the user experience looks like

Visitor (not logged in):
1. Scan QR at the bar.
2. Public page opens: club name/logo, item, price, quantity, optional basket.
3. Enter name + cell (for the sale record), tap Pay.
4. Card payment via the club's existing payment gateway.
5. Success page + stock decremented + sale recorded as a visitor bar sale.

Member (logged in, same QR):
- Page recognises the session and offers a choice: **Pay by card** or **Charge to my account** (existing bar tab flow, credited to My Account).

## Admin side

In the club admin bar tab:
- "QR labels" action per item and a "Print all labels" sheet (A4 grid of stickers with name, price, QR).
- One "Venue poster" QR for the whole bar.
- Ability to regenerate a code if a label is compromised.
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
