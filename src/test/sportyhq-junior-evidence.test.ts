import { describe, expect, it } from "vitest";
import { juniorEvidenceFromHtml } from "../../supabase/functions/_shared/sportyhq-junior";

const row = (id: number, date: string) =>
  `<tr class="result-row" data-result_id="${id}"><td class="table-success">x</td><td>${date}</td><td>opp</td></tr>`;
const detail = (id: number, draw: string, tour = "Some Junior Open") =>
  `<div class="modal result_detail_${id}"><dl><dt>Tournament:</dt><dd>${tour}</dd><dt>Draw:</dt><dd>${draw}</dd></dl></div>`;
const page = (items: Array<[number, string, string]>) =>
  `<table>${items.map(([id, d]) => row(id, d)).join("")}</table>${items.map(([id, , draw]) => detail(id, draw)).join("")}`;
const today = new Date("2026-11-20T12:00:00Z");

describe("SportyHQ junior squash player evidence", () => {
  it("uses the youngest junior section played (players may play up, never down)", () => {
    const e = juniorEvidenceFromHtml(page([[1, "13 Sep 2026", "Boys U19A"], [2, "1 Jul 2026", "Boys U17B"]]), today);
    expect(e?.age_group).toBe("U17");
    expect(e?.section).toBe("Boys U17B");
  });

  it("keeps the most recent junior event date for the 12-month expiry", () => {
    const e = juniorEvidenceFromHtml(page([[1, "13 Sep 2026", "Boys U19A"], [2, "1 Jul 2026", "Boys U17B"]]), today);
    expect(e?.last_junior_event_on).toBe("2026-09-13");
  });

  it("ignores junior events older than 12 months", () => {
    expect(juniorEvidenceFromHtml(page([[1, "1 Nov 2025", "Girls U15"]]), today)).toBeNull();
  });

  it("ignores senior sections", () => {
    expect(juniorEvidenceFromHtml(page([[1, "1 Oct 2026", "Men's A League"]]), today)).toBeNull();
  });

  it("counts a combined section as its oldest group", () => {
    const e = juniorEvidenceFromHtml(page([[1, "27 Apr 2026", "Girls U/13 &amp; U/15 Individual Group A"]]), today);
    expect(e?.age_group).toBe("U15");
  });

  it("maps schools U14 and U16 to Squash SA U15 and U17", () => {
    expect(juniorEvidenceFromHtml(page([[1, "1 May 2026", "Boys U14"]]), today)?.age_group).toBe("U15");
    expect(juniorEvidenceFromHtml(page([[1, "1 May 2026", "Boys U16D"]]), today)?.age_group).toBe("U17");
  });
});
