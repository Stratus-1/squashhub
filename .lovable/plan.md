## Goal

Add the new **left sidebar navigation** from the mockup to the **desktop view only** (≥ md breakpoint). The mobile experience (bottom nav, current dashboard) stays exactly as today. No existing dashboard content is removed — the sidebar is added *around* the current layout so every feature remains accessible.

## What changes

### 1. New desktop sidebar component
`src/components/AppSidebar.tsx` — a shadcn `Sidebar` with `collapsible="icon"`, styled to match the mockup (dark navy, uppercase labels, amber active accent matching the brand).

Top-level items + sub-items:

```text
HOME            (group, expandable)
  ├── Stats           → /analytics
  ├── Bookings        → /bookings
  └── Match Results   → /add-result

COURTS          → /bookings

ACTIVITIES      (group, expandable)
  ├── Mark a Game     → /match-marker
  ├── Enter Results   → /add-result
  ├── Club Ladderboard→ /ladder
  ├── Challenges      → /challenges
  ├── League Games    → /league-games   (only if club has leagues)
  ├── Events          → /events
  ├── Honesty Bar     → /honesty-bar    (only if honesty_bar_enabled)
  ├── Feed            → /feed
  └── My Account      → /my-account

CLUB ADMIN      → /club-admin           (only if hasAnyAdminAccess)

SETTINGS        → /settings  (pinned at bottom, with theme toggle dot like mockup)
```

Behaviour:
- Active route highlighted via `NavLink` + `isActive`.
- Group containing the active route stays expanded by default.
- Collapsed state shrinks to a narrow icon-only strip; sidebar never disappears.
- `SidebarTrigger` placed in the desktop header so the user can toggle.

### 2. Layout wrapper (desktop only)
Create `src/components/DesktopShell.tsx` that:
- On `<md` (mobile/tablet) — renders `{children}` unchanged. Bottom nav and current mobile dashboard stay intact.
- On `≥md` — wraps children in `SidebarProvider` + `<AppSidebar />` + main column with a slim header containing the `SidebarTrigger` and existing notifications/profile widgets.
- Hides the `BottomNav` on `≥md` (it's currently mobile-oriented anyway).

Mount `DesktopShell` once in `src/App.tsx` around the authenticated routes (the same place `BottomNav` is rendered today).

### 3. Dashboard content
**No changes** to `src/pages/Dashboard.tsx`. All existing sections (Welcome banner, Profile Completion, Family switcher, Action tiles, League Games, Bookings, Match Results, Scheduled Matches, Honesty Bar tile, etc.) continue to render inside the new desktop main column. The mockup's "My Stats / Club tabs / accordions" restyle is **not** in this scope per your decision to keep all features.

### 4. Mobile guarantees
- `useIsMobile` (existing hook) gates the shell so mobile renders identically to today.
- `BottomNav` and `MobileHeader` paths unchanged.
- No CSS/className changes to existing pages.

## Technical notes
- Reuses shadcn `Sidebar`, `SidebarProvider`, `SidebarTrigger`, `SidebarGroup`, `SidebarMenu*` from `src/components/ui/sidebar.tsx`.
- Conditional sidebar items: read `useClubContext`, `useMyClub`, `useIsClubAdmin`, `useMyPermissions`, plus a small query for `clubLeagueAssociations` (already used in Dashboard) — wrap in a tiny hook `useSidebarFlags()` to avoid duplicating queries.
- Styling tokens: navy `#1E3A5F` background, amber `#F59E0B` accent for active items, uppercase tracking-wider labels, matching the mockup. Defined via Tailwind classes inside `AppSidebar.tsx`; no global theme changes.
- `SidebarTrigger` lives in a thin desktop header bar so the user can collapse to icon-only and back.

## Out of scope (will not change)
- Mobile dashboard, bottom nav, mobile header.
- Dashboard content/structure (no tabs, no accordions, no removed sections).
- ClubAuth / login page.
- Any backend/database changes.

## Files touched
- **New:** `src/components/AppSidebar.tsx`, `src/components/DesktopShell.tsx`, `src/hooks/use-sidebar-flags.ts`
- **Edited:** `src/App.tsx` (wrap authenticated routes in `DesktopShell`, hide `BottomNav` on `md+`)
