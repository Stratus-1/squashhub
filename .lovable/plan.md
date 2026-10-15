# Bar & Shop orders with delivery tracking

## What changes

Add **Use order process** to Bar Setup, off by default.

- **Off:** the current self-service bar/shop experience stays unchanged. No staff order list or delivery checklist.
- **On:** customers submit orders from their phones; authorised counter staff see all submitted orders for that club, including orders on customer-opened tabs, and tick off what has been delivered.
- The setting enables the whole order workflow; a second overlapping “orders enabled” switch is unnecessary.
- Turning it off requires all outstanding orders to be completed or explicitly cancelled first, so an unfinished burger cannot disappear.

This request is **plan only**. No application changes, club settings, orders, payments, stock movements, backend changes or publishing now.

## Customer experience

1. Open the existing bar/shop menu through the QR code or app.
2. Add items, for example one hamburger, two Cokes and one brandy.
3. Choose **Collect at bar** or **Deliver to me**. Delivery requires a location such as “Court 1” or a table; allow a short order note.
4. Submit explicitly using **Place order**. Items merely added to a basket are not orders.
5. See an order number, location, payment state and each item's progress. Further purchases create another order on the same tab rather than merging into an already delivered order.

Only the club's existing enabled payment methods are offered: member account, online payment, cash or swipe at the counter. Delivery does not mark a purchase paid, and paying does not mark it delivered.

## Staff experience

Counter Mode gains **Orders**, alongside its existing tabs, visible only when the order process is enabled.

- Show **Open** and **Completed** views, with oldest outstanding orders first.
- Each order shows customer/tab name, order number, elapsed time, collection/delivery location, notes and payment state.
- Staff can accept/start an order, mark an item ready, then record the quantity handed over or delivered. A collection order is complete only when collected, not merely prepared.
- Example: tick the brandy delivered and set Cokes to **2 of 2 delivered**; the hamburger remains outstanding. Delivering the hamburger completes the order automatically.
- For two Cokes, allow **1 of 2** as well as **2 of 2**; one checkbox must not incorrectly fulfil both.
- Different authorised staff/devices share the same club order list. It is not restricted to tabs opened by that barman or that counter.
- Completed orders remain available for recent history. Corrections and cancellations record who acted and when.
- New orders update the list automatically, with an optional sound enabled by staff. Reconnection reloads the authoritative state; no silent loss of orders.

## Poster and QR setup

Reuse the existing Poster (PDF), heading choice and large menu QR.

- Order process **on:** use **“SCAN TO ORDER”**, with **“Place your order for delivery or collection”** and instructions to choose items, select a location/collection, and place the order.
- Order process **off:** retain the existing scan-to-pay/self-service wording; do not promise delivery.
- Both versions list only the enabled payment methods, including cash/swipe at the counter where allowed.
- The poster download reflects the currently saved setting. Already printed posters cannot update automatically; show a reminder to reprint after changing it.

## What the inspection found

The existing counter board already lists server-saved open guest tabs, including customer-opened Scan-to-Pay tabs. It does **not** have a separate preparation/delivery queue: purchases currently have payment/tab state, not fulfilment state.

Member running baskets can remain local to the customer's phone until submission/settlement. The new workflow must save submitted member orders for staff without changing how ordinary self-service baskets behave when the switch is off.

## Technical approach

- Introduce club-scoped order headers, order lines and delivery audit events. An order groups one submission, not an entire tab. Lines reference the existing sale/account-entry records where applicable; preserve item identity and snapshot the displayed name, price and ordered quantity.
- Keep fulfilment separate from the existing guest tabs, member account charges and payment records. A paid or closed tab may still have an undelivered order; order visibility must not depend on tab status.
- Extend the counter's existing server-validated PIN/session and bar-permission boundary. Validate its club on every queue read/change; a browser-stored token alone never grants access. Customers may read only their own orders through their existing authenticated/member or validated guest-tab context.
- Reuse existing stock and sale/account logic exactly once at the current authoritative purchase commitment. Delivery/ready clicks must never deduct stock, create charges or post ledger income again.
- Successful online payment releases its order to staff only after authoritative verification. Failed/abandoned payments do not create actionable duplicate orders. Open-tab, cash and swipe orders retain their existing eligibility and settlement rules, with unpaid status clear to staff.
- Member order submission must create the server-visible order and its authoritative purchase linkage safely; later tab settlement must reuse that linkage, not charge the same lines again.
- Each submission has an idempotency key, so double taps, reconnects and delayed callbacks cannot duplicate it. Quantity updates use atomic server checks to prevent two staff delivering more than ordered.
- Cancel only undelivered quantities, using existing audited sale/stock reversal rules; paid cancellations need an explicit refund/credit outcome, never an automatic fictional refund. Preserve delivered quantities and historical prices.
- Refresh through club-scoped realtime with a bounded polling fallback and refresh on reconnect. No fulfilment updates queued silently while offline.
- This feature needs an additive backend change. Preview and the published app share the backend, so a true isolated pilot needs a draft/test backend; a preview-only screen is not backend isolation.

## Proposed delivery stages — after approval

1. **Isolated pilot:** use Riverside test orders, no live Uitsig settings or real charges. Add the off-by-default switch, orders and quantity tracking behind it; verify customer and counter visibility.
2. **Connect all submission paths:** customer/self-opened guest tabs, member orders, counter-entered orders and enabled payment methods, preserving existing stock/accounting behaviour.
3. **Finish presentation:** customer progress, staff open/completed views, delivery/collection locations and setting-aware PDFs.
4. **Review and separate activation:** demonstrate the workflow, then obtain explicit approval before any Uitsig/live activation or publishing. No club-name hardcoding.

## Acceptance checks

- Hamburger + two Cokes + brandy: partial deliveries remain open until the last item is handed over.
- One of two Cokes delivered, multiple orders on one tab, and orders from multiple customers/devices.
- Self-opened guest tabs and member orders appear to authorised staff; other clubs and unrelated customers cannot see them.
- Two staff updating the same item, repeated submission and payment callbacks, disconnect/reconnect: no duplicate order, charge or stock deduction.
- Paying before delivery, delivering before permitted settlement and closing a tab do not erase outstanding work.
- Cancellation/reversal and paid-order refund/credit handling remain auditable.
- Switch off preserves today's flow; pending orders block disabling until resolved.
- On/off poster wording and all enabled payment combinations match saved settings; downloaded PDFs stay single-page and scannable.
- Verify customer phone and counter tablet/desktop layouts, web/PWA, and Android/iOS downloads before claiming those platforms verified.

## Approval boundary

No decision is needed to finish this plan. Implementation and an isolated test backend require further approval; live activation and publishing remain separate approvals.