import { describe, expect, it } from "vitest";
import { matchEntries, parseEntryCsv } from "@/lib/smart-builder/pick-import";

const csv = `\uFEFF"Name and Surname","Email","Cell Number","Ladies CC","Mens CC","Mens League played in 2026","Ladies League played in 2026"
"Justin Naude","annatjie851@gmail.com","(076) 862-9405","","Mens CC","Mens 7th League",""
"Lienke van Reeuwyk","x@y.com","(061) 185-1942","Ladies CC","Mens CC","Mens 10th League","Ladies 2nd League"
"D Naude  (Kiepie)","kiepien@googlemail.com","(083) 636-6166","","Mens CC","",""
"Lisa Rahman","r@x.com","(081) 000-0000","Ladies CC","","",""`;

const members = [
  { id: "jason", name: "Jason Naude Jason", email: "annatjie851@gmail.com", phone: "+27631555510" },
  { id: "justin", name: "Justin Naude Justin", email: "justinnaude24@gmail.com", phone: "" },
  { id: "lienke", name: "Lienke van Reeuwyk", email: "other@x.com", phone: "27611851942" },
  { id: "kiepie", name: "Kiepie Naude", email: "kiepien@googlemail.com", phone: "0836366166" },
];

describe("pick import", () => {
  it("reads events but ignores league-history columns", () => {
    const rows = parseEntryCsv(csv);
    expect(rows.map((r) => r.events)).toEqual([["mens"], ["ladies", "mens"], ["mens"], ["ladies"]]);
  });
  it("prefers the name over a shared family email and reports unknowns", () => {
    const m = matchEntries(parseEntryCsv(csv), members);
    expect(m.map((x) => x.memberId)).toEqual(["justin", "lienke", "kiepie", null]);
    expect(m[3].reason).toMatch(/No club member/);
  });
});
