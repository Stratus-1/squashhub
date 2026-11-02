export interface MemberRef { id: string; name: string; memberNumber?: string | null; leagueNumber?: string | null }
export interface FeeRow { label: string; amount: number; memberId: string | null }

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(row: Record<string, unknown>, re: RegExp): unknown {
  const key = Object.keys(row).find(k => re.test(k.toLowerCase()));
  return key ? row[key] : undefined;
}

/** Match spreadsheet rows to club members by league (NSF/NSA) number, member number, then full name. */
export function matchFeeRows(raw: Record<string, unknown>[], members: MemberRef[]): FeeRow[] {
  const byLeague = new Map<string, string>(), byNum = new Map<string, string>(), byName = new Map<string, string | null>();
  for (const m of members) {
    if (m.leagueNumber) byLeague.set(norm(m.leagueNumber), m.id);
    if (m.memberNumber) byNum.set(norm(m.memberNumber), m.id);
    const n = norm(m.name);
    byName.set(n, byName.has(n) ? null : m.id); // ambiguous names never match
  }
  return raw.map(row => {
    const league = norm(pick(row, /(nsf|nsa|league.*(no|num)|affiliation)/));
    const num = norm(pick(row, /member.*(no|num)|club.*(no|num)/));
    const first = pick(row, /^(first|name)/), last = pick(row, /(surname|last)/);
    const full = pick(row, /(full ?name|player|member$|^name$)/) ?? [first, last].filter(Boolean).join(" ");
    const amtRaw = pick(row, /(amount|fee|total|due)/);
    const amount = Number(String(amtRaw ?? "").replace(/[^0-9.]/g, "")) || 0;
    const memberId = (league && byLeague.get(league)) || (num && byNum.get(num)) || byName.get(norm(full)) || null;
    return { label: String(full || league || num || ""), amount, memberId };
  });
}
