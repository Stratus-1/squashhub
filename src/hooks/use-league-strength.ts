import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeLeagueStrength,
  type LeagueStrength,
  type RubberRow,
} from "@/lib/ladder/league-strength";

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface LeagueStrengthSets {
  /** Every rubber, men's and ladies'. */
  all: Map<string, LeagueStrength | null>;
  /** Men's-league rubbers only — used to order the men's ladder. */
  mens: Map<string, LeagueStrength | null>;
  /** Ladies-league rubbers only — used to order the ladies' ladder. */
  ladies: Map<string, LeagueStrength | null>;
}

const isMens = (row: RubberRow) =>
  String((row as any).category || "").trim().toLowerCase().startsWith("men");
const isLadies = (row: RubberRow) =>
  String((row as any).category || "").trim().toLowerCase().startsWith("ladies");

/**
 * Regional-league strength per club member, derived from their rubber history.
 * Read-only: used to PROPOSE a refined ladder order, never to write one.
 *
 * Split by competition category so a men's ladder is refined from men's-league
 * form and a ladies' ladder from ladies-league form.
 */
export function useLeagueStrength(
  clubId: string | undefined,
  associationNumbers: Map<string, string[]> | undefined,
  members?: { id: string; name?: string | null; gender?: string | null }[]
) {
  const normName = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const memberKey = (members ?? []).map((m) => m.id).sort().join(",").length;
  const codesByMember = new Map<string, string[]>();
  const allCodes: string[] = [];
  for (const [memberId, numbers] of associationNumbers ?? []) {
    const codes = (numbers || []).map(normalizeCode).filter(Boolean);
    if (codes.length === 0) continue;
    codesByMember.set(memberId, codes);
    allCodes.push(...codes);
  }
  const codeKey = Array.from(new Set(allCodes)).sort().join(",");

  return useQuery<LeagueStrengthSets>({
    queryKey: ["ladder-league-strength", clubId, codeKey, memberKey],
    enabled: !!clubId && (allCodes.length > 0 || (members?.length ?? 0) > 0),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const unique = Array.from(new Set(allCodes));
      const rows: RubberRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("nsa_rubber_history")
          .select("player_code, category, league_label, position, season_year, won")
          .in("player_code", unique.slice(i, i + CHUNK));
        if (error) throw error;
        rows.push(...((data || []) as RubberRow[]));
      }

      const byCode = new Map<string, RubberRow[]>();
      let latestYear = 0;
      for (const row of rows) {
        if (row.season_year && row.season_year > latestYear) latestYear = row.season_year;
        const code = normalizeCode(row.player_code || "");
        if (!code) continue;
        const list = byCode.get(code);
        if (list) list.push(row);
        else byCode.set(code, [row]);
      }
      if (!latestYear) latestYear = new Date().getFullYear();

      const all = new Map<string, LeagueStrength | null>();
      const mens = new Map<string, LeagueStrength | null>();
      const ladies = new Map<string, LeagueStrength | null>();
      for (const [memberId, codes] of codesByMember) {
        const memberRows = codes.flatMap((c) => byCode.get(c) ?? []);
        const strength = computeLeagueStrength(memberRows, latestYear);
        if (strength) all.set(memberId, strength);
        const m = computeLeagueStrength(memberRows.filter(isMens), latestYear);
        if (m) mens.set(memberId, m);
        const l = computeLeagueStrength(memberRows.filter(isLadies), latestYear);
        if (l) ladies.set(memberId, l);
      }
      // Fallback: SportyHQ-sourced league fixtures (e.g. Western Province),
      // matched to members by full name. Only for members without NSA history.
      if (members?.length) {
        const byName = new Map<string, { id: string; gender?: string | null }>();
        const dupes = new Set<string>();
        for (const m of members) {
          if (!m.name || all.has(m.id)) continue;
          const k = normName(m.name);
          if (!k) continue;
          if (byName.has(k)) dupes.add(k); else byName.set(k, m);
        }
        dupes.forEach((k) => byName.delete(k));
        if (byName.size) {
          const { data: divs } = await supabase
            .from("external_league_divisions" as any)
            .select("division_name, season_year, fixtures, source")
            .eq("source", "sportyhq");
          const extRows = new Map<string, RubberRow[]>();
          let extLatest = 0;
          for (const d of (divs || []) as any[]) {
            if (d.season_year > extLatest) extLatest = d.season_year;
            for (const f of (d.fixtures || []) as any[]) {
              for (const r of (f.rubbers || []) as any[]) {
                const hg = Number(r.home_games), ag = Number(r.away_games);
                if (!Number.isFinite(hg) || !Number.isFinite(ag) || hg === ag) continue;
                for (const side of ["home", "away"] as const) {
                  const names: string[] = r[side] || [];
                  if (names.length !== 1) continue; // singles rubbers only
                  const m = byName.get(normName(names[0]));
                  if (!m) continue;
                  const won = side === "home" ? hg > ag : ag > hg;
                  const row = { player_code: null, league_label: d.division_name, position: Number(r.order) || null, season_year: d.season_year, won } as RubberRow;
                  const list = extRows.get(m.id);
                  if (list) list.push(row); else extRows.set(m.id, [row]);
                }
              }
            }
          }
          const yr = extLatest || latestYear;
          for (const [memberId, memberRows] of extRows) {
            const strength = computeLeagueStrength(memberRows, yr);
            if (!strength) continue;
            all.set(memberId, strength);
            const g = String(byName.get(normName(members.find((x) => x.id === memberId)?.name || ""))?.gender || "").toLowerCase();
            if (g.startsWith("lad") || g.startsWith("f")) ladies.set(memberId, strength);
            else mens.set(memberId, strength);
          }
        }
      }
      return { all, mens, ladies };
    },
  });
}
