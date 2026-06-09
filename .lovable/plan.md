# Internal-league Rules & Penalties → Club Admin only

## Correct architecture (per user)
- **`platform_league_associations`** = regional / inter-club leagues only (NSA, Lowveld). Super Admin owns these and sets rules + penalties.
- **`league_associations` with `scope='internal'`** = a single club's internal league (Lakeside, NIL). Lives only at the tenant. Super Admin should **not** see or edit them.

## What's wrong today
1. `Nelspruit Internal League (NIL)` is incorrectly present in `platform_league_associations`, so Super Admin can edit its rules even though it's an internal league.
2. Lakeside's internal league correctly only exists in `league_associations` (`scope='internal'`, no `platform_association_id`), but the tenant has **no UI** to manage its rules/penalties → unmanageable.

## Fix

### 1. Tenant UI — Club Admin → Leagues
Add **Rules** and **Penalties** controls to each association row in `src/components/club-admin/LeaguesTab.tsx`:
- A single "Rules & Penalties" button per association, opening a dialog with two tabs.
- Tabs reuse the existing shared components `AssociationRulesTab` and `AssociationPenaltiesTab` (the same ones Super Admin uses), passed `associationId={a.id}`.
- For `scope='internal'` rows the button is prominent (this is the only place to manage them).
- For `scope='region'` rows the button is shown but the dialog renders a read-only banner: "Rules are managed by the league organiser in Super Admin." (Hides editor or disables Save — to be decided in implementation; default = read-only view.)

No schema changes. `league_rules` is already keyed by `association_id`; `useAssociationRules` / `useUpdateAssociationRules` work as-is against the tenant `league_associations.id`.

### 2. Clean up platform table
Remove `Nelspruit Internal League` from `platform_league_associations` so Super Admin no longer surfaces it. Steps in the migration:
- Re-point any tenant `league_associations.platform_association_id = '3b0ca049-…'` rows to NULL (keep them as tenant-internal rows, no parent).
- Move any `league_rules` row keyed to the NIL platform id to the tenant NIL association id (so the existing rules don't get lost), then delete the platform NIL row.
- Verify nothing else references `3b0ca049-…` (fixtures, members) — if it does, fail loudly so we can decide migration order before deleting.

### 3. Super Admin guard (defence in depth)
In `SuperAdminLeagues.tsx` the list comes from `platform_league_associations` so internal rows are excluded naturally after step 2. No code change needed there. (Optional: add a comment noting that only regional/inter-club leagues belong in that table.)

## Files touched
- `src/components/club-admin/LeaguesTab.tsx` — add Rules/Penalties dialog wiring.
- New migration — repoint + delete NIL platform row, relocate its `league_rules`.

## Out of scope
- Changes to inheritance logic (`useAssociationRules` already falls back to `platform_association_id`; with internal rows now having a null parent they read their own row directly, which is what we want).
- Permission/role changes — the existing club-admin guard on the Leagues tab is sufficient.
- Migrating any other suspect rows in `platform_league_associations`; only NIL is misclassified today.
