/**
 * Step-by-Step Beta: cross-step consistency. The whole setup is one configuration — a later, more specific
 * answer is checked against earlier ones and any contradiction must be reconciled EXPLICITLY by the organiser
 * (never silently ignored, overwritten or guessed). One reusable pattern: each rule returns a conflict with a
 * message and the exact change each choice makes; the builder shows them and blocks Complete setup /
 * Generate draw until none remain. Pure: works on the saved answers (or the draw subset of them).
 */
type Answers = Record<string, any>;

export interface SetupConflict {
  id: string;
  /** Step where the organiser fixes it. */
  step: string;
  message: string;
  yes: { label: string; apply: (a: Answers) => Answers };
  /** Optional alternative; when absent the organiser edits the step instead. */
  no?: { label: string; explain: string; apply: (a: Answers) => Answers };
}

const playoffRows = (a: Answers): any[] => (a.stages ?? []).filter((s: any) => s?.phase === "playoff" && s.name);
const when = (s: any) => `${s.date || s.deadline || "9999"} ${s.from || ""}`;
const ORDER = ["Quarterfinal", "Quarterfinals", "Semifinal", "Semifinals", "Final"];
const rank = (n: string) => { const i = ORDER.indexOf(n); return i < 0 ? 99 : i; };
const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const article = (n: string) => (/^[AEIOU]/i.test(n) ? "an" : "a");

/** Playoff stages per competition path ("" = all categories), in play order. */
export function playoffChains(a: Answers): Map<string, any[]> {
  const out = new Map<string, any[]>();
  for (const s of playoffRows(a)) { const k = s.unit ?? ""; out.set(k, [...(out.get(k) ?? []), s]); }
  for (const [k, rows] of out) out.set(k, [...rows].sort((x, y) => rank(x.name) - rank(y.name) || when(x).localeCompare(when(y))));
  return out;
}

export function setupConflicts(a: Answers | null | undefined): SetupConflict[] {
  if (!a) return [];
  const out: SetupConflict[] = [];
  const po = playoffRows(a);
  // 1. Generic "Decide later / No playoffs" vs explicitly configured playoff stages.
  const choice = a.playoff?.choice ?? "later";
  if (po.length && choice !== "playoffs") {
    const names = [...new Set(po.map((s) => String(s.name)))].sort((x, y) => rank(x) - rank(y));
    const earlier = choice === "none" ? "No playoffs" : "Decide later";
    out.push({
      id: "playoffs_vs_timeline", step: "Stages & scheduling",
      message: `Your tournament setup has changed. Earlier you selected '${earlier}' for playoffs, but you have now configured ${names.map((n) => `${article(n)} ${n}`).join(" and ").replace(/ and (?=[^ ]+ [^ ]+$)/, " and ")}. Update the tournament to include these playoff stages?`.replace(` ${list(names.map((n) => `${article(n)} ${n}`))}`, ` ${list(names.map((n) => `${article(n)} ${n}`))}`),
      yes: {
        label: "Yes, update tournament",
        apply: (x) => ({ ...x, playoff: { ...(x.playoff ?? {}), choice: "playoffs", rounds: Math.min(3, Math.max(1, Math.max(...[...playoffChains(x).values()].map((r) => r.length)))) }, playoffOverrides: Object.fromEntries(Object.entries(x.playoffOverrides ?? {}).filter(([, v]: any) => v?.choice === "playoffs")) }),
      },
      no: {
        label: `No, keep ${earlier}`,
        explain: `The ${list(names)} you configured will be removed from Stages & scheduling — they would not be used.`,
        apply: (x) => ({ ...x, stages: (x.stages ?? []).filter((s: any) => s?.phase !== "playoff") }),
      },
    });
  }
  // 2. A later playoff stage carrying its own pairing: it follows the stage before, so it is played by that stage's winners.
  for (const [unit, rows] of playoffChains(a)) {
    rows.slice(1).forEach((s, i) => {
      if (!s.pairing || s.pairing === "winners" || s.pairing === "later") return;
      const prev = rows[i];
      out.push({
        id: `pairing_after_${s.id}`, step: "Stages & scheduling",
        message: `${s.name}${unit ? ` (${unit.split("::").join(" › ")})` : ""} follows the ${prev.name}, so it is played by the ${prev.name} winners. Its saved pairing ("${s.pairing === "same_position" ? "Same position" : s.pairing === "crossover" ? "Pool crossover" : s.pairing}") would build an impossible bracket. Use the ${prev.name} winners?`,
        yes: { label: `Yes, ${prev.name} winners play the ${s.name}`, apply: (x) => ({ ...x, stages: (x.stages ?? []).map((y: any) => (y.id === s.id ? { ...y, pairing: "winners" } : y)) }) },
      });
    });
  }
  return out;
}

/** Apply one choice of one conflict. */
export function resolveConflict(a: Answers, c: SetupConflict, pick: "yes" | "no"): Answers {
  return pick === "yes" ? c.yes.apply(a) : c.no ? c.no.apply(a) : a;
}
