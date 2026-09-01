# SquashHub AI Development Guide

## Project identity

SquashHub is a multi-tenant sports operations platform for squash clubs, associations, national structures, administrators, members, visitors, and spectators. The product spans club onboarding, membership, court bookings, ladders, matches, leagues, tournaments, live marking, federation workflows, billing, payments, access control, smart-court integrations, communications, outreach, PWA installation, and native mobile apps.

- Canonical repository: `https://github.com/Stratus-1/squashhub.git`
- Default branch: `main`
- Canonical local path: `C:\Users\wille\OneDrive\Desktop\Stratus-Projects\SquashHub\Code`
- Product architecture: `ARCHITECTURE.md`
- Web setup: `README.md`
- Mobile setup: `MOBILE.md`
- Detailed history and known issues: `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`
- Native API reference: `docs/ANDROID_API_REFERENCE.md`

## Read before editing

1. Read the workspace `../../AGENTS.md` and `../PROJECT.md`.
2. Read this file, `ARCHITECTURE.md`, `README.md`, and `MOBILE.md`.
3. Read the relevant domain docs and issue history before changing federation, mobile, booking, payment, or device workflows.
4. Run `git status --short --branch` and `git remote -v`.
5. Trace the route, context, hooks, domain libraries, tables, RLS, RPCs, Edge Functions, and external provider callbacks involved.

## Technology stack

- React 18, TypeScript, and Vite
- React Router and TanStack React Query
- Tailwind CSS, shadcn/ui, Radix UI, and Framer Motion
- Supabase Postgres, Auth, RLS, Realtime, Storage, RPCs, and Deno Edge Functions
- PWA/service worker support
- Capacitor 8 for Android and iOS wrappers
- Firebase Cloud Messaging for native push notification delivery
- Vitest with substantial domain coverage
- Remotion tooling for product media
- Vercel web deployment configuration
- Lovable-connected development metadata and APIs

## Commands

```powershell
npm install
npm run dev
npm run test
npm run lint
npm run build
npm run cap:sync
npm run cap:android
npm run cap:ios
```

Do not run native open commands unless the task requires Android Studio or Xcode. `cap:sync` rebuilds the web bundle and synchronizes native projects; understand generated changes before committing them.

## Dependency installation

- When a required package, CLI, or runtime dependency is needed to complete the requested work, install it proactively and continue. Do not wait for a separate installation request.
- Prefer local project dependencies for reproducible builds; use global installation only when the tool is inherently machine-level.
- Record meaningful setup changes in `package.json`, lockfiles, or project documentation, and report any external authentication step that still requires the user.

## External authentication

- If Lovable, Vercel, Supabase, GitHub, or another required external connection loses authentication, stop the affected operation and prompt the user to re-authenticate. Do not silently continue with stale credentials or claim that a deployment completed without a confirmed result.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Provider composition, route map, authentication gates, club gates, capability gates, and platform admin routing. |
| `src/contexts/` | Auth, active club, and active member state. Provider order is significant. |
| `src/pages/` | Member, club, public, payment, competition, admin, and support screens. |
| `src/components/` | Club admin, association admin, platform admin, tournaments, leagues, live markers, payments, help, and shared UI. |
| `src/hooks/` | Club, people, permissions, billing, competitions, integrations, notifications, and device-oriented hooks. |
| `src/lib/` | Domain logic for tournaments, leagues, ladders, billing, subdomains, smart devices, payments, PWA, and MCP tools. |
| `src/integrations/supabase/` | Supabase client and generated database types. |
| `supabase/migrations/` | Append-only schema, RLS, RPC, trigger, cron, and data migration history. |
| `supabase/functions/` | Payments, integrations, messaging, federation sync, billing, access, device, and job workflows. |
| `android/` and `ios/` | Capacitor native projects. |
| `remotion/` | Separate media/video composition tooling. |
| `docs/` | Native, federation, architecture history, and operational references. |
| `secrets/` | Sensitive local material. Never inspect, print, or commit it. |

## Non-negotiable architecture rules

### Organization and club isolation

- Club, association, national-body, and platform scopes are distinct authorization boundaries.
- Club subdomains, `/c/:subdomain` routes, preview state, and root-host platform admin routes form one routing contract.
- Every club-owned query, storage object, cache key, realtime channel, scheduled job, and integration credential must be scoped to the correct club or organization.
- Capability flags control product packaging and feature access, not security by themselves. Backend authorization remains required.

### Competition integrity

- Tournament draws, rounds, pools, divisions, seeding, byes, forfeits, progression, marker locks, and governance records form state machines.
- League lineups, fixtures, substitutions, results, penalties, availability, and ranking ledgers have cross-table invariants.
- Reuse domain logic in `src/lib/tournaments/`, `src/lib/tournament-formats/`, and `src/lib/leagues/`. Do not recreate competition rules in page components.
- Add tests before changing draw generation, progression, scoring, eligibility, or ranking behavior.

### Booking, access, and devices

- Booking mutations affect availability, balances, visitors, invitations, reflow, lights, door access, and notifications.
- Shelly BLE, Shelly HTTP, router polling, court lights, GoBook, and access provisioning are failure-prone external/device boundaries. Use timeouts, retries, idempotency, audit logs, and safe fallbacks.
- Never expose club device credentials or router secrets to the browser.
- IoT ownership is centralized: Shelly-connected lights, door relays, and gadgets are registered and managed from the `IoT / Shelly` admin tile under the `Lights`, `Access`, and `Gadgets` cards. Do not recreate parallel Shelly setup surfaces or a separate Shelly `Door Access` tile. See `docs/IOT_DEVICE_OWNERSHIP.md`.

### Payments and billing

- Stitch and Yoco callbacks can retry or arrive out of order. All handlers must be idempotent.
- Club billing, member fees, subscriptions, platform invoices, mandates, bar tabs, and ledger records require auditability and reconciliation.
- Do not mix a provider redirect result with payment confirmation; server-side verification is authoritative.

### Web, PWA, and native

- Preserve web, installed PWA, Android, and iOS behavior. Browser APIs may not exist in native wrappers and native plugins may not exist on web.
- Deep links, OAuth callbacks, push permissions, PWA updates, and payment return routes require platform-specific testing.
- Treat `android/` and `ios/` configuration, signing, Firebase files, associated domains, and URL schemes as sensitive operational surfaces.

## External integrations

The repository contains active or planned boundaries for Supabase, Lovable, Vercel, Stitch, Yoco, Strava, Firebase/FCM, WhatsApp, NSA/federation systems, SportyHQ, GoBook, Shelly devices, router vendors, email providers, and push delivery.

Before changing an integration:

1. Identify the source of truth and credential owner.
2. Trace browser/native initiation, backend function, callback/webhook, database state, retry behavior, and user-visible recovery.
3. Preserve external IDs and idempotency keys.
4. Document environment variables by name only.
5. Add structured logs without secrets or personal data.

## Supabase-to-GCP direction

Supabase currently owns the dominant data and backend path. Migrate incrementally:

- Introduce typed services around federation sync, notifications, access/device jobs, outreach, billing, and payment orchestration.
- Strong candidates for GCP extraction are scheduled polling, queues, integration workers, media processing, notification dispatch, analytics, and high-observability device orchestration.
- Keep one writable authority for bookings, competition state, payment state, and rankings during each migration phase.
- Use authenticated service-to-service APIs, outbox events, replayable workers, dead-letter handling, and reconciliation dashboards.
- Do not move latency-sensitive live marking or booking behavior without measuring realtime and offline requirements.

## Testing expectations

- SquashHub already has meaningful tests for tournament, league, booking, billing, PWA, and domain helpers. Extend these suites instead of bypassing them.
- Run focused tests during development and the full `npm run test` for domain changes.
- Run `npm run lint` and `npm run build` for broad changes.
- For native-impacting changes, run the web build and `npm run cap:sync`, then report whether device testing was performed.
- Database changes require migration, RLS, RPC, function, generated-type, and cron review.

## Secrets and sensitive data

- Never read or expose `.env`, `secrets/`, Firebase service credentials, mobile signing files, router credentials, OAuth secrets, payment credentials, member exports, or personal information.
- Do not commit downloaded business spreadsheets or member lists from the parent product folder.
- Public Supabase client configuration is not a substitute for RLS. Service-role credentials are always server-only.

## Completion checklist

- Club, organization, platform, and capability boundaries are preserved.
- Competition or booking invariants have regression tests.
- Web/PWA/native impacts are stated.
- Payment, device, and integration retries are safe and observable.
- Schema changes use new migrations and generated types are synchronized.
- Tests, lint, and build have run as appropriate.
- `ARCHITECTURE.md` is updated for changed boundaries or migration paths.
