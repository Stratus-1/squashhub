# Roadmap

## Bar / POS payment options (in progress)
- [x] Club settings: charge to account / pay online by card / swipe card at the club
- [x] `record_bar_terminal_sale` RPC for "swipe at the club" orders
- [ ] ScanPay (QR) checkout: three payment options, always-visible cart/checkout panel
- [x] In-app Bar page: same three options + always-visible cart panel
- [x] Club admin: toggles for the three payment options
- [x] "I swiped at the card machine" records the sale as paid immediately (admin reconciles later)
- [x] Checkout buttons float on the right from tablet/desktop and stay fixed at the top on phones

## Visitor open tab for the evening (new)
- [ ] Guest can open a named tab at the bar, add rounds through the evening
- [ ] Pay the whole tab once at the end (card online or swipe at the club)
- [ ] Club admin can see open guest tabs and settle/close them

## Support question (answered)
- [x] Riverside bar tile missing for hkftservices@gmail.com — Bar capability was off, enabled 30 Aug 12:35 UTC

- [x] Fix visitor bar "Add to my open tab" failing on bar_visitor_sales payment_method/payment_status check constraints (widened to allow tab/on_tab/awaiting_* states).

## Tournament invite reach transparency (new)
- [x] `tournament_invite_scope_tree` returns `email_reach_count` per club (member email OR linked user email)
- [x] `InviteScopeTree` shows "X with email" per club and in the summary line
- [ ] Verify on a real tournament wizard that counts match expectations
