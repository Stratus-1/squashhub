import data from "/tmp/la/full.json";
import { projectDecidedPlayByFixtures, projectCourtFixtures } from "@/lib/tournaments/projected-court-fixtures";
const d: any = data;
const input = { champ: d.champ, arch: d.arch, entries: d.entries, matches: d.matches, rounds: d.rounds, courts: [{ id: 1, name: "Court 1" }, { id: 2, name: "Court 2" }, { id: 3, name: "Court 3" }], partialGeneration: true };
console.log("PLAYBY", JSON.stringify(projectDecidedPlayByFixtures(input).map((f) => [f.group, f.round, f.title, f.playBy, f.rrFinishBlock ?? false])));
console.log("COURT", JSON.stringify(projectCourtFixtures(input).map((f) => [f.group, f.round, f.title, f.date, f.time])));
