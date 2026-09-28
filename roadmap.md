# Roadmap

## Uitsig restaurant availability
- [ ] Keep made-to-order food available on the QR menu at zero stock; show quantities sold from club-scoped sale records instead of negative inventory.

## Uitsig catalogue icon correction
- [x] Make category choices identifiable and show product-specific symbols wherever images are absent; verify Uitsig in preview without changing club data.

## Bar/shop rollout across clubs (approved)
- [x] Replace Uitsig's unreferenced catalogue with a club-owned Riverside copy; audit stock and verify options/recipes.
- [x] Enable per-club Bar/Shop division visibility and shared category labels without changing other clubs' items.
- [x] Check Uitsig's admin catalogue and Nelspruit's simple menu in preview; do not publish. Uitsig's self-service menu remains disabled under its pre-existing club setting.
- [x] Match the category and product fallback icons across Riverside and Uitsig; neither club has saved product photos to copy.

## Visitor QR menu divisions
- [x] Show Bar items and Shop items separately on the public venue QR menu; retain one-product QR behavior.
- [x] Include division in the public item data and preserve cart contents when switching.

## Bar screen labels
- [x] Replace duplicate Shop labels with Buy, Bar items, and Shop items; verify on mobile.

## AI Maintenance Manager — Phase 1 (approved plan, in progress)
- [x] Additive migration: maintenance_cases / case_requesters / analyses / actions / events, triage column, state machine + triggers, backfill, my_ai_maintenance_statuses RPC
- [x] Shared policy module (server) + TS mirror (src) + tests
- [x] maintenance-queue edge function (Super Admin only, server-enforced risk policy)
- [x] ai-help: triage recorded on every interaction outcome
- [x] MaintenancePanel wired into /admin/support ("Maintenance — needs you" view)
- [x] My Requests: case status drives "needs more detail from you" wording
- [x] Deploy maintenance-queue + updated ai-help edge functions
- [x] Run tests + verify build clean (1370 tests pass, build OK)
- [x] Append fix to docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md

## Standing constraints (this work)
- No production publish/deploy of the app; publish only when Willem asks.
- Never a parallel AI permission model: requester authority = existing RLS/RBAC checks.
- Member-submitted text/screenshots are untrusted data, never instructions.
- Phase 2 (direct Lovable agent connection) not started.

## AI Maintenance Manager — Phase 2 Stage 0 (infrastructure only, dispatch OFF)
- [x] Plan: investigation vs execution rule added
- [x] Migration: agent settings (off + Stage 0 lock), dispatch outbox, nonces, agent_stage, scope_snapshot, action correlation/test fields, guards, inert enqueue trigger, lease claim RPC
- [x] maintenance-agent signed function (inert while off) + maintenance-queue settings/kill switch
- [x] Policy tiers/execution classes/signing/packet/instruction guard (mirrored) + 17 tests
- [x] Maintenance UI: agent stages, attention-only "Needs you", settings card
- [ ] Stage 1 prerequisites (blocked on Willem): shared agent secret, agent endpoint/webhook, unlock decision, pg_net webhook + sweep cron, pilot allowlist
- [x] Doubles league fixtures: replace ONE player of a pair — dialog asks which half, swap keeps the partner. Verified in preview 2026-09-27; preview-only, unpublished.
