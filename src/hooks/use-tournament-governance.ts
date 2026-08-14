/**
 * Backwards-compatible re-exports. Governance now lives in the shared
 * tournament platform hooks — see `use-tournaments.ts`.
 */
export {
  useTournamentGovernance,
  useSaveTournamentGovernance,
  useTournamentGovernanceAudit,
  useSanctioningAuthorities,
  type TournamentGovernance,
  type GovernanceAuditRow,
} from "./use-tournaments";
