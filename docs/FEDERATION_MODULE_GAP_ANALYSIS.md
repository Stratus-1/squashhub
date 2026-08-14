# SquashHub National Federation Module — Gap Analysis & Build Plan

Against: *SquashHub National Federation Module — Functional & Development Specification v1.0 (Aug 2026)*
Prepared: 14 Aug 2026. This is the Phase 0 deliverable required by spec §24.

Legend: **EXISTING** (already live) · **PARTIAL** (exists at club/association level, needs federation scope) · **NEW** · **DECISION** (SSA policy needed before code).

---

## 1. Where SquashHub already is

The platform is already a 3-level system: `clubs` → `league_associations` / `platform_league_associations` → `club_members`, with `platform_league_members`, `platform_league_fixtures`, `member_association_affiliations`, `national_body_fees` and `league_association_national_bodies` already modelling national bodies (SSA) sitting above associations. That is roughly 60% of the spec's hierarchy — the federation module is mostly a **scope upgrade**, not a new app.

| Spec area | Status | Notes |
|---|---|---|
| §3 Hierarchy (4 levels) | PARTIAL | Levels 2–4 exist. Level 1 (national federation as a first-class org) is implied only through `national_body_fees` rows per club — no single SSA entity record. |
| §4 Roles | PARTIAL | `user_roles`, `club_permission_roles`, `club_member_permissions`, `is_platform_admin`, captain scope all exist. Missing: SSA Competition Admin, SSA Finance, Tournament Director, Referee/Scorer, Parent/Guardian as scoped roles. |
| §5 National player profile | PARTIAL | `club_members` + `member_association_affiliations` hold name, email, cell, gender, league numbers. Missing: national affiliation status, competitive licence, DOB visibility rules, immutable national player ID. |
| §6 Federation dashboard | PARTIAL | `SuperAdminDashboard`, `AssociationDashboard`, `get_club_analytics` exist. No national roll-up across associations. |
| §7 Tournament engine | PARTIAL | `club_champs*` covers groups, snake draft, scheduling, playoffs, Bells, Swiss, handicap, live marking, doubles pairs, bulk visitor import. Missing: sanctioning, entry fees/refund rules, MONRAD/feed-in, qualification draws, ranking-based seeding, draw versioning/lock. |
| §8 Team leagues | EXISTING (club/assoc) | `leagues`, `league_rounds`, `league_fixture_*`, substitution rules engine, NSA posting, standings. Missing: national/multi-association season ownership and upward result submission. |
| §9 Ranking engine | PARTIAL / DECISION | `ranking_points_ledger`, `ranking_points_pending`, `ladder_position`, `season_awards` exist (club ladder). No configurable national scheme, no versioned rules, no snapshots. **Blocked on §22 questions.** |
| §10 Membership & fees | EXISTING mostly | Member fee categories, national body fees, pass-through league fees, `association_payable`, Stitch/Yoco checkout, renewal invoicing, exemptions. Missing: competitive licence product + one checkout splitting club/assoc/national components. |
| §11 Reuse list | EXISTING | Auth, bookings, access control, lights, comms (email/push/WhatsApp), club finance — all live and reusable as-is. |
| §12 Public experience | PARTIAL | Club landing, `/league` signup, marketing site. No national landing, public draws/rankings pages. |
| §13 Communications | EXISTING | Email queue, push, WhatsApp with per-club billing and inbound replies. Only targeting scopes need extending. |
| §14 Reporting/exports | PARTIAL | Club-level analytics and exports. No federation-scope CSV/XLSX or audit reports. |
| §15 Migration / SportyHQ | PARTIAL | `SuperAdminNsaImport`, NSA scraping, bulk visitor import exist as patterns. Missing: `external_ids`, `data_import_batches`, reconciliation reports. |
| §17 API | NEW | MCP tools exist; no versioned public REST API, webhooks or scoped service keys. |
| §18 Security/audit | PARTIAL | RLS everywhere, `club_billing_audit`, `ledger_audit_log`, `impersonation_log`, `member_league_registrations_audit`. Missing: single `audit_events` spine for results/draws/rankings. |

---

## 2. What the spec misses (our additions)

Things already built here that the spec does not account for and must not be regressed:

1. **Court access control, lighting and relay billing** (Shelly/ZKTeco/Hikvision) — federation roles must never inherit these club-private rights.
2. **SaaS billing of clubs** (sliding scale, monthly/6-monthly/annual, Stitch mandates, `billing_exempt`). A federation layer changes who pays for what — needs a commercial decision: does SSA subsidise, or do clubs keep paying?
3. **WhatsApp metered billing and inbound RSVP** — federation-level messaging will need its own cost owner.
4. **Family/delegated accounts and shared logins** — spec's "one person, one identity" must be reconciled with `member_account_delegations` and duplicate-email family rules.
5. **Single-tenancy rule** — the app currently assumes a member belongs to one club. National play across clubs breaks that assumption; this is the single largest architectural decision.
6. **Honesty bar, feed, gamification, GoBook, router monitoring** — out of federation scope, must stay club-private.
7. **POPIA/SLA documents already published** (SquashHub SLA v1.5, HKFT Services as provider) — a federation agreement with SSA is a separate legal instrument.

---

## 3. Decisions needed before any code

1. **Identity across clubs** — does a national player get one profile linked to many `club_members` rows (recommended: a `player_profiles` spine keyed to `auth.users`, with `club_members` as club-scoped facets), or do we keep one-club-only?
2. **Who owns SSA's data** — is SSA a tenant in `clubs`, or a new `organisations` table with `organisation_relationships`? Recommended: new `organisations` table, with `clubs` and `league_associations` linked into it rather than replaced.
3. **Commercials** — SSA licence fee, sanction fee %, who pays SquashHub.
4. **Ranking policy (§22)** — all nine questions, in writing from SSA, before Phase 4.
5. **Data rights** — written confirmation of SSA's export right from SportyHQ. No scraping.

---

## 4. Proposed delivery phases (adjusted for this codebase)

| Phase | Scope | Depends on |
|---|---|---|
| **0. Discovery** (this document) | Gap analysis, decisions register, SSA workshop. | — |
| **1. Federation foundation** | `organisations` + `organisation_relationships` + `external_ids` + `audit_events`; link existing clubs/associations; SSA roles & scoped permissions; national dashboard (read-only roll-up over existing tables). No changes to club UX. | Decisions 1, 2 |
| **2. National player identity** | `player_profiles` spine, national affiliation status, optional competitive licence, controlled dedupe tooling, POPIA field visibility. | Phase 1 |
| **3. Competition upgrade** | Sanctioning flag + sanctioning authority on tournaments, entry fees/refunds, MONRAD/feed-in/qualification draws, draw lock & versioning, result correction workflow with reason + audit. Extends `club_champs*`, does not replace it. | Phase 2 |
| **4. Federation leagues** | National/inter-association seasons reusing `leagues`/`league_rounds`; upward result submission into national history. | Phase 2 |
| **5. Ranking service** | `ranking_schemes` → `ranking_rule_versions` → `ranking_lists` → `ranking_snapshots` → `ranking_results`; provisional vs published; per-player calculation audit. | SSA policy signed off |
| **6. Fees & settlement** | One checkout splitting club/association/national components; settlement reports per level. Reuses Stitch + `association_payable`. | Phase 2 |
| **7. Public federation site** | National landing, sanctioned event search, public draws/results/rankings with privacy gates. | Phases 3–5 |
| **8. Migration** | `data_import_batches`, mapping, reconciliation reports, historical results marked as imported. | Authorised exports |
| **9. Pilot** | One association + clubs + one league + one sanctioned tournament, ranking run in parallel with SportyHQ. | All |
| **10. API & rollout** | Versioned REST, webhooks, scoped keys, onboarding and support tooling. | Pilot signed off |

**Recommended first build (smallest useful Phase 1):** the `organisations` spine + SSA org record + national roll-up dashboard, with zero disruption to any club screen. Everything else hangs off that.

---

## 5. Non-negotiables carried from this codebase

- Club-private data (finance, access control, bar, router, Wi-Fi, member contact details) is never visible to federation roles by default — scope-based grants only.
- Ladder immutability rules stay in force; national rankings are a separate list, not a rewrite of `ladder_position`.
- Every new public table ships with GRANTs + RLS in the same migration.
- No ranking formula is implemented before SSA answers §22.

## Phase 3a — Competition governance (delivered)
- `club_champs` extended with sanction_status / sanctioning_org_id / sanction_reference / notes, competition_level (club|regional|provincial|national), eligibility (min/max age, licence required, scope, notes), fee split (federation_fee_cents, association_fee_cents; club keeps the balance), refund_policy + refund_cutoff_date.
- `tournament_governance_audit` table + `log_tournament_governance_changes` trigger records every governance field change.
- UI: "Governance" button on each tournament in ClubChampsTab → `TournamentGovernanceDialog` (Sanctioning / Eligibility / Fees & refunds / History).
- Deferred to Phase 3b: MONRAD, feed-in draws, qualification rounds, draw lock & versioning, result-correction workflow. Rankings (Phase 5) remain blocked on SSA policy.
