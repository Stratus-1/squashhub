# Quick Setup & Manage Features — Capability System for Club Admin

## What the audit found (verified in code/DB)

**Admin surface** — `src/pages/ClubAdmin.tsx` hardcodes two arrays: `SETUP_TABS` (Club, Settings, Courts, Fees, Banking, Access, Ladder, Ranking Pts, Bar, Permissions, Subscription, WhatsApp, Internet) and `OPERATIONS_TABS` (Members, Users, Visitors, Finance, Tournaments, Leagues Setup/Creation, League Awards, Comms). Tiles are filtered **only** by permission slug (`useMyPermissions`), never by whether the club uses the feature. The "X/Y complete" counter is computed inline from `useSetupStatus` over 8 keys, mixing core items (Club, Courts) with optional ones (Access, Banking) — which is why it reads as ambiguous.

**Feature flags already exist, but scattered and inconsistent:**
- `clubs` columns: `honesty_bar_enabled`, `whatsapp_enabled`, `ranking_points_enabled`, `lights_integration_enabled`, `shelly_integration_enabled`, `mixed_ladder_enabled`, `uses_gobook`, `external_booking_provider/url/label`, `door_geofence_enabled`, `door_auto_unlock_enabled`, `dynamic_court_reflow_enabled`, `face_enrolment_required`, `fill_up_leagues_enabled`, `fill_top_down_enabled`, `participation_active`, `show_delegates_on_landing`.
- `club_secrets` holds Wi-Fi capability state (`wifi_enabled`, `wifi_ssid`, `wifi_charge_enabled`, `wifi_monthly_fee`, `wifi_visitors_allowed`) and all access-control config (`access_control_type`, `access_provider`, Shelly/Fluss keys).
- No flags at all for Bookings, Leagues, Tournaments, Finance, Visitors, Ladder. Sidebar leagues visibility (`use-sidebar-flags.ts`) is *derived from data* (`league_associations` rows or active `member_association_affiliations`), not from a decision.
- `app_settings` is a global platform key/value table — not per-tenant; `organisation_settings` is federation-level. Neither is the right home for club capabilities.

**Leakage:** enabling/disabling today only affects a couple of places. `honesty_bar_enabled` gates the sidebar item + one dashboard tile, but `/honesty-bar`, `/bookings`, `/ladder`, `/league-games`, `/tournaments` in `src/App.tsx` are ungated routes, and `BottomNav.tsx` has its own logic. So hiding a tile leaves the feature reachable by URL.

## Proposed model

### Core (always visible, never disableable)
Club identity (`ClubInfoTab`), Settings, Members, Users, Permissions, Subscription, Communications basics. These get the explicit **"Core setup: X/Y complete"** counter.

### Optional capabilities (single canonical list)
`bookings`, `access_control`, `wifi`, `finance`, `bar`, `membership_fees`, `payments` (banking/gateway), `tournaments`, `leagues`, `ladder`, `ranking_points`, `visitors`, `whatsapp`, `lights`, `events`.

### Dependency matrix (derived from real code paths)
| Enable | Auto-enables / requires | Optional link |
|---|---|---|
| bookings | courts (CourtsTab) + booking settings on `clubs` (slot minutes, peak windows, caps) | access_control (door on booking), lights (`light_sessions`), external provider (`uses_gobook`) |
| paid bookings / light fees | finance + membership_fees + payments | — |
| bar | finance (journals via `bar_tab_entry_journal`, `bar_visitor_sale_journal`), payments for scan-to-pay | visitors (visitor sales) |
| membership_fees | finance; payments for online settlement | whatsapp/comms for reminders |
| wifi | payments + membership_fees only when `wifi_charge_enabled` (`bill_wifi_monthly`) | router monitoring (`club_router_configs`) |
| leagues | members + courts (fixtures/venues); ladder only if seeding from ladder | ranking_points, league awards, comms |
| tournaments | members, courts; finance + payments when entry fees | visitors (external entrants), ranking_points |
| ladder | members | ranking_points, challenges |
| access_control | — (self-contained via `club_secrets`) | bookings |
| whatsapp | comms; finance for metered billing (`club_whatsapp_invoices`) | — |

Uncertain / to confirm during build: whether Leagues should stay data-derived (existing affiliations) as an *implicit* enable; whether `ranking_points_enabled` should be a child toggle of ladder or standalone; whether Visitors is truly optional (bar visitor sales and tournaments both write `club_visitors`).

### Tile treatment
- **Always:** Club, Settings, Members, Users, Permissions, Subscription, Comms.
- **Hidden unless enabled:** Courts, Bar, Access, Internet/Wi-Fi, WhatsApp, Ladder, Ranking Pts, Leagues, League Awards, Tournaments, Visitors, Finance, Fees, Banking.
- **Merge/rename:** Fees + Banking + Finance → one **Money** group (Fees, Payments, Books); Ladder + Ranking Pts → **Ladder & Ranking**; Leagues Setup/Creation + League Awards → **Leagues**; Internet → **Member Wi-Fi**; Access → **Door Access**; Bar → **Bar / POS**.

## Implementation plan

**1. Capability store (reuse, don't duplicate).** New table `public.club_capabilities` (`club_id`, `capability` text, `enabled` bool, `enabled_at`, `enabled_by`, `disabled_at`) with GRANTs + RLS (club admins read/write own club; `authenticated` read for their club so member UI can gate). Existing boolean columns stay the source for their own sub-settings; the capability row is the *master switch* and a DB trigger keeps legacy columns (`honesty_bar_enabled`, `whatsapp_enabled`, `ranking_points_enabled`, `club_secrets.wifi_enabled`) in sync so nothing existing breaks.

**2. Backfill migration (backwards compatibility).** For every existing club, enable a capability when there is evidence of use: courts rows → bookings; `honesty_bar_enabled` or `bar_items` → bar; `club_secrets.access_control_type <> 'none'` → access_control; `wifi_enabled` → wifi; `member_fee_categories` → membership_fees; bank fields or gateway → payments; any `club_journal_entries` → finance; `league_associations`/affiliations → leagues; `tournaments` rows → tournaments; any `ladder_position` → ladder; `whatsapp_enabled` → whatsapp; `club_visitors` → visitors. No tenant loses a feature they already use.

**3. Shared hook + registry.** `src/lib/capabilities.ts` (capability metadata, plain-language labels, dependency graph, defaults) and `src/hooks/use-club-capabilities.ts` (`useCapabilities()`, `useHasCapability(slug)`, `useSetCapability()`), following the `use-club-permissions.ts` pattern.

**4. Quick Setup wizard.** `src/components/club-admin/setup/QuickSetupWizard.tsx` — plain questions ("Do members book courts through the app?", "Do you charge membership fees?", "Do you run leagues?", "Do you have a bar?", "Do you control door access?", "Do you offer member Wi-Fi?"). Answers write capabilities and auto-enable dependencies with an explicit "this also turns on Courts" note. Shown on first entry to `/club-admin` when no capability rows exist; skippable.

**5. Manage Features.** Permanent tile/route `/club-admin?tab=features` → `FeaturesTab.tsx` listing every capability with toggle, dependency warnings, and per-module status ("Not set up", "Needs info", "Ready"). Reachable any time — onboarding never has to be rerun.

**6. Gating everywhere (not just tiles).**
- `ClubAdmin.tsx`: tiles filtered by `permission && capabilityEnabled`; grouped Core / Money / Competition / Facilities.
- `use-sidebar-flags.ts` extended to read capabilities; `AppSidebar.tsx`, `BottomNav.tsx`, `Dashboard.tsx`, `DashboardDesktop.tsx` tiles gated off the same hook.
- Routes: a `<CapabilityRoute capability="bar">` wrapper in `src/App.tsx` for `/honesty-bar`, `/bookings`, `/ladder`, `/league-games`, `/tournaments`, `/challenges`, `/availability` — redirect to `/` instead of rendering.
- Permission slugs whose capability is off are dropped from `useMyPermissions()` effective set, so downstream checks fail closed.

**7. Server-side enforcement (security).** UI gating is not enough. Add a `public.club_has_capability(_club_id, _capability)` SECURITY DEFINER function and use it in RLS `WITH CHECK` for write paths of optional modules (`bookings`, `bar_tab_entries`, `bar_visitor_sales`, `challenges`, `club_wifi_subscriptions`) so a disabled feature can't be driven via the API. Reads of historical data stay allowed. Also short-circuit background jobs: `bill_wifi_monthly`, WhatsApp send/billing, `router-poll`, fee-reminder senders check the capability first.

**8. Safe disable semantics.** Disabling only writes `enabled=false` + `disabled_at`. No deletes, no cascade. Historical rows (journals, bookings, bar sales, ladder history) remain and stay readable in Finance/reports. UI distinguishes three states: **Off** (not used), **On — needs setup** (enabled, required fields missing), **On — ready**. Recurring charges tied to a disabled capability stop at the next cycle.

**9. Progress rework.** Replace the single `X/Y complete` with: `Core setup: X/Y complete` (Club, Settings, Members, Comms sender, Permissions) plus a per-capability status chip on each optional tile. `use-setup-status.ts` is refactored to return `{ core: {...}, modules: {...} }` instead of one flat map.

**10. Recommended defaults for a small squash club.** On: bookings (+courts), ladder, members/users, comms. Off: access_control, wifi, bar, whatsapp, tournaments, leagues, ranking_points, finance, payments, visitors — each one click away in Manage Features.

## Scope note
No code changes yet. On approval I'd sequence it as: migration + backfill → capability hook/registry → Manage Features tab → Quick Setup wizard → gating sweep (admin, sidebar, bottom nav, dashboard, routes) → RLS/background-job enforcement → progress rework.
