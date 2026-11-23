# Nelspruit Shop: T-shirt orders

## What members will see
- A **Shop** tile/page at Nelspruit showing the club T-shirt (photo added when it arrives), price **R300**.
- Order form per shirt:
  - **Fit**: Men's or Ladies'.
  - **Size**: Men's XS–5XL, Ladies' S–4XL.
  - A **size chart** button showing the Bondipix measurements (half chest, full chest, body length, sleeve length) for the chosen fit, with the "how to measure" note.
  - **Name on the back**: pre-filled with the member's name and the question "Is this the name you want on the back?" The member must type/confirm the exact text (max ~20 characters, shown in capitals preview) before ordering.
  - Quantity; several shirts (e.g. for family) can be ordered, each with its own size and back name.
- "My orders" list with status: Ordered → With printer → Ready for collection → Collected.

## What the club sees (Club Admin → Bar/Shop)
- **Shop** division created for Nelspruit with category **T-shirts** and item "Club T-shirt": sell R300, cost R275 (margin R25).
- Orders list with filters by status, and a **printer list download** (fit, size, back name, count per size) to send to Bondipix.
- Change order status; cancel an order before it goes to the printer.

## Money
- Members pay using the same payment methods Nelspruit has switched on in Bar/POS (e.g. member account, card/online, cash at counter); only enabled methods are shown, and payment works exactly as a normal bar purchase. Shop sales land in **Shop income**, cost in **Shop cost of sales**, never in Bar. Existing balances are not touched.
- No stock is held: orders are made-to-order, so no stock count goes negative.

## Technical details
- Data: create `club_bar_divisions` "Shop" + `club_bar_categories` "T-shirts" + `bar_items` row for Nelspruit via data insert.
- New tables `shop_orders` / `shop_order_lines` (club_id, member_id, item_id, fit, size, back_name, qty, unit_price, unit_cost, status, timestamps), GRANTs + RLS: members read/insert own; Bar/Finance permission holders manage club-wide.
- Size options and measurements stored as item variant config (JSON on the item) so other clubs can reuse it for other garments.
- Charging goes through the existing Bar/POS payment path at order time posting balanced journal via existing `post_journal`; idempotent request id; validation with zod (back name trimmed, 1–20 chars).
- Tests for price R300/cost R275 posting and back-name validation.
- T-shirt photo uploaded as a CDN asset once received.
