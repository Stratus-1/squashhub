# Bar and shop rollout across clubs

## What will change
- **Uitsig:** replace its existing catalogue with a club-owned copy of Riverside's current 293 products, 38 category settings, two divisions, options and seven specials with their 13 recipe lines. Copy names, prices, images, sale windows and quantities as requested. Resolve parent-product and recipe references to Uitsig's new product IDs, never Riverside's. Keep Uitsig club settings and members untouched. Verify counts, prices, quantities, menus and specials after the copy.
- **Other clubs:** do not copy, delete or change any products, prices, stock or sales. Present Bar and Shop divisions and editable categories for them too. Seed sensible categories for newly joining clubs with no products; an empty category does not clutter the Buy menu. Let each club hide Shop without deleting its items, and add, rename, reorder or archive categories independently.
- **Nelspruit and Highveld:** retain their simple inventories and category groupings. Update category *labels* only where mappings are unambiguous. For example, a combined Beer & Cider category should not silently become Beer if it could contain cider. Do not reassign product categories or stock merely to make their menu look like Riverside's.

## Safety checks
- Before replacing Uitsig's catalogue, confirm again that its 21 old rows have no linked sales, QR labels, stock movements, purchases or stocktakes; abort if any new history appears. Delete only unreferenced old products; do not delete transaction or audit history. Record Uitsig's initial quantities through the inventory adjustment path with movement records, not by directly changing stock without an audit trail.
- Copy across clubs by mapping identifiers inside the destination club, and verify that every option points to a Uitsig parent and every special component points to a Uitsig stock product. No cross-club product or recipe links.
- Test Bar/Shop hiding and category selection on a phone, and check both Uitsig and an existing simple-menu club. No automatic website publish.

## Technical details
- Existing category/division support already falls back to Bar/Shop and shared built-in categories for clubs without configuration. Use that existing mechanism rather than inserting redundant rows for all 799 clubs. Add per-club label overrides only where required and make the Shop hide control an archive/restore action on the existing division setting. Ensure hiding Shop does not rewrite product division fields or erase history.
- Use data operations for the Uitsig copy and label overrides, and a schema migration only if a missing capability truly requires it. Inspect the data-dependent constraints and stock-adjustment function before the copy. Keep the product-copy operation atomic or fail closed on partial mapping.

## Decisions already confirmed
- Uitsig's old catalogue should be replaced completely; copy Riverside's prices **and quantities**.
- Other clubs should adopt Riverside-like category names where appropriate, while keeping their own products.
