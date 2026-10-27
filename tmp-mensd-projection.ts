// Temporary diagnostic: run the same projection the engine uses for decided games. Deleted after use.
import { readFileSync } from "fs";
import { projectDecidedPlayByFixtures, projectCourtFixtures } from "@/lib/tournaments/projected-court-fixtures";

const load = (f: string) => JSON.parse(readFileSync(`/tmp/browser/mensd45/${f}`, "utf8")).rows[0][Object.keys(JSON.parse(readFileSync(`/tmp/browser/mensd45/${f}`, "utf8")).rows[0])[0]];

const champ = load("champ.json")[0];
const arch = load("arch.json")[0];
const entries = load("entries.json");
const matches = load("matches.json");
const rounds = load("rounds.json");
const courts = load("courts.json").filter((c: any) => c.active !== false);
const flag = load("flag.json");

const input: any = { champ, arch, entries, matches, rounds, courts, partialGeneration: !!flag?.length };

const playBy = projectDecidedPlayByFixtures(input).filter((f) => f.group === 4);
const court = projectCourtFixtures(input).filter((f) => f.group === 4);

const existing = matches.filter((m: any) => m.group_number === 4 && m.round_number >= 3)
  .map((m: any) => ({ round: m.round_number, status: m.status, a: m.player_a?.name, b: m.player_b?.name }));

console.log("=== Men's D saved fixtures round 3+ ===");
console.log(JSON.stringify(existing, null, 1));
console.log("=== Projected decided play-by fixtures (group 4) ===");
console.log(JSON.stringify(playBy, null, 1));
console.log("=== Projected court fixtures (group 4) ===");
console.log(JSON.stringify(court, null, 1));
