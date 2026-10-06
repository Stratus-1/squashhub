/**
 * Step-by-Step Beta "Import players": match an entry-form export (CSV) to club
 * members and say which events (e.g. Ladies / Mens) each person entered.
 * Pure — matching only ever picks an unambiguous club member; anything else is
 * reported back so the organiser decides. Never creates people.
 */
export interface ImportMember { id: string; name: string; email?: string | null; phone?: string | null }
export interface ImportRow { line: number; name: string; email: string; phone: string; events: string[] }
export interface ImportMatch { row: ImportRow; memberId: string | null; how: string; reason?: string }

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((ch === "," || ch === ";" || ch === "\t") && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
const tail = (p?: string | null) => { const d = String(p ?? "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };

/** Event columns = headers naming ladies/mens/women/men/open/mixed that are not "league" history columns. */
export function parseEntryCsv(text: string): ImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iName = col(/name/), iEmail = col(/e-?mail/), iPhone = col(/cell|phone|mobile/);
  const eventCols = head.map((h, i) => ({ h, i })).filter(({ h }) => /\b(ladies|women|mens|men|open|mixed)\b/.test(h) && !/league|played|date/.test(h));
  return lines.slice(1).map((l, n) => {
    const c = splitCsv(l);
    return {
      line: n + 2,
      name: (c[iName] ?? "").replace(/\s+/g, " ").trim(),
      email: (c[iEmail] ?? "").trim().toLowerCase(),
      phone: c[iPhone] ?? "",
      events: eventCols.filter(({ i }) => (c[i] ?? "").trim()).map(({ h }) => (/ladies|women/.test(h) ? "ladies" : /mixed/.test(h) ? "mixed" : /open/.test(h) ? "open" : "mens")),
    };
  }).filter((r) => r.name || r.email);
}

/**
 * Score each member: email +2, cell +2, first+last name +2, surname only +0.5.
 * Accept the best only when it has a name signal (or email+cell) and beats the
 * runner-up — shared family emails/phones are common, so contact alone never decides.
 */
export function matchEntries(rows: ImportRow[], members: ImportMember[]): ImportMatch[] {
  const mm = members.map((m) => ({ m, n: norm(m.name), e: String(m.email ?? "").trim().toLowerCase(), t: tail(m.phone) }));
  return rows.map((row) => {
    const n = norm(row.name), t = tail(row.phone);
    const scored = mm.map((x) => {
      const why: string[] = []; let s = 0;
      if (row.email && x.e === row.email) { s += 2; why.push("email"); }
      if (t && x.t === t) { s += 2; why.push("cell"); }
      const firstLast = n.length > 1 && x.n.length > 1 && x.n[0] === n[0] && x.n[x.n.length - 1] === n[n.length - 1];
      const nameIn = n.length > 1 && n.every((w) => x.n.includes(w));
      if (firstLast || nameIn) { s += 2; why.push("name"); }
      else if (n.length > 1 && x.n.includes(n[n.length - 1])) s += 0.5;
      const strong = why.includes("name") || (why.includes("email") && why.includes("cell"));
      return { x, s, why, strong };
    }).filter((r) => r.s >= 2).sort((a, b) => Number(b.strong) - Number(a.strong) || b.s - a.s);
    const best = scored[0];
    if (!best) return { row, memberId: null, how: "", reason: "No club member found" };
    if (!best.strong) return { row, memberId: null, how: best.why.join("+"), reason: `Unsure — contact details match ${best.x.m.name}` };
    if (scored[1] && scored[1].strong && scored[1].s >= best.s) return { row, memberId: null, how: "", reason: `Ambiguous: ${best.x.m.name} or ${scored[1].x.m.name}` };
    return { row, memberId: best.x.m.id, how: best.why.join("+") };
  });
}
