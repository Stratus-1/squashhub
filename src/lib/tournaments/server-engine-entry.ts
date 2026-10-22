/** Entry for the server bundle used by the auto-progress-tournaments function. Built by scripts/build-auto-progress.ts. */
export { autoProgress, stageLifecycle } from "@/lib/tournaments/progression";
export { atomically } from "@/lib/tournaments/structured-persist";
export { schedulePlannedPlayoffGames } from "@/lib/smart-builder/playoff-schedule";
export { createDecidedSwissGames } from "@/lib/tournaments/decided-swiss";
// Pure exports permit behavioral parity checks of the shipped bundle without a hosted write.
export { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
export { sequenceSwissRound } from "@/lib/tournaments/swiss-sequencing";
export { nextSwissRound } from "@/lib/tournaments/engine-service";
