# Roadmap

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
