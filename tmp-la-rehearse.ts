import data from "/tmp/la/data.json";
import { projectDecidedPlayByFixtures } from "@/lib/tournaments/projected-court-fixtures";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
const d: any = data;
const out = projectDecidedPlayByFixtures({ champ: d.champ, arch: d.arch, entries: d.entries, matches: d.matches.map((m: any) => ({ ...m })), rounds: d.rounds, courts: [], partialGeneration: true });
console.log("decided", JSON.stringify(out, null, 1));
