import { readFileSync } from "fs";
import { projectCourtFixtures, projectDecidedPlayByFixtures } from "@/lib/tournaments/projected-court-fixtures";
const d = JSON.parse(readFileSync("/tmp/proj/input.json","utf8"));
const input = { champ: d.champ, arch: d.arch, entries: d.entries, matches: d.matches, rounds: d.rounds ?? [], courts: (d.courts??[]).filter((c:any)=>c.active!==false), partialGeneration: d.partial>0 };
console.log("court", JSON.stringify(projectCourtFixtures(input).map(f=>[f.group,f.round,f.title,f.rrFinishBlock])));
console.log("playby", JSON.stringify(projectDecidedPlayByFixtures(input).map(f=>[f.group,f.round,f.title,f.playBy,f.rrFinishBlock])));
