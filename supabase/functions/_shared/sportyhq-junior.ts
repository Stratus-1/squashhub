// Junior-section evidence from a SportyHQ public results page.
//
// SportyHQ hides birth dates, but each result's detail block names the draw the
// player played in ("Boys U17B", "Girls U/13 & U/15 ..."). From the last 12
// months we keep the youngest junior section played (players may play up an age
// group, never down) and the date of the most recent junior event. This is only
// evidence for the "junior squash player" tick and an *estimated* age group; it
// never fills a birth date or ID number.
//
// Squash SA uses U11/U13/U15/U17/U19; SA Schools U12/U14/U16 map up to the next
// Squash SA group.

export type JuniorGroup = "U11" | "U13" | "U15" | "U17" | "U19";

export interface JuniorEvidence {
  section: string;
  event: string;
  age_group: JuniorGroup;
  last_junior_event_on: string; // yyyy-mm-dd, most recent junior event in the window
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const AGE_RE = /(?<![a-z0-9])(?:u|under)\s*[/-]?\s*(\d{1,2})(?!\d)/gi;

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "–").replace(/&#8211;/g, "–");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function juniorGroupFor(n: number): JuniorGroup {
  if (n <= 11) return "U11";
  if (n <= 13) return "U13";
  if (n <= 15) return "U15";
  if (n <= 17) return "U17";
  return "U19";
}

const bandN = (g: JuniorGroup) => Number(g.slice(1));

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Returns null when the page shows no junior section in the 12 months before `today`. */
export function juniorEvidenceFromHtml(html: string, today: Date = new Date()): JuniorEvidence | null {
  const end = iso(today);
  const startD = new Date(today);
  startD.setUTCFullYear(startD.getUTCFullYear() - 1);
  const start = iso(startD);

  const dates = new Map<string, string>();
  for (const chunk of html.split('<tr class="result-row').slice(1)) {
    const row = chunk.split("</tr>")[0];
    const id = row.match(/data-result_id="(\d+)"/)?.[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (!id || cells.length < 2) continue;
    const d = strip(cells[1]).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
    const mm = d ? MONTHS[d[2].toLowerCase()] : undefined;
    if (!d || !mm) continue;
    dates.set(id, `${d[3]}-${String(mm).padStart(2, "0")}-${d[1].padStart(2, "0")}`);
  }

  type Ev = { on: string; section: string; event: string; group: JuniorGroup };
  const evs: Ev[] = [];
  for (const m of html.matchAll(/result_detail_(\d+)"[\s\S]*?<\/dl>/g)) {
    const on = dates.get(m[1]);
    if (!on || on < start || on > end) continue;
    const draw = m[0].match(/Draw:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)?.[1];
    if (!draw) continue;
    const section = strip(draw);
    const ages = [...section.matchAll(AGE_RE)].map((a) => Number(a[1])).filter((n) => n >= 9 && n <= 19);
    if (!ages.length) continue;
    const event = strip(m[0].match(/Tournament:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)?.[1] ?? "");
    // A combined section ("U17 & U19") counts as its oldest group.
    evs.push({ on, section, event, group: juniorGroupFor(Math.max(...ages)) });
  }
  if (!evs.length) return null;
  const best = [...evs].sort((a, b) => bandN(a.group) - bandN(b.group) || (a.on < b.on ? 1 : -1))[0];
  const last = evs.reduce((mx, e) => (e.on > mx ? e.on : mx), evs[0].on);
  return { section: best.section, event: best.event, age_group: best.group, last_junior_event_on: last };
}
