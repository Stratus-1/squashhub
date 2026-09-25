import { ownershipIssues } from "./division-structure";
/**
 * Deterministic validator for a Smart Builder Tournament Definition.
 * Pure functions only — no AI, no database. Every generate/create step must
 * pass through here first.
 */
import {
  allStages,
  knockoutRoundNames,
  type Division,
  type Section,
  type Stage,
  type TournamentDefinition,
} from "./definition";

export type IssueLevel = "error" | "warning" | "info";
export interface Issue {
  level: IssueLevel;
  message: string;
  stageId?: string;
  /** Plain-English suggested fix (never auto-applied). */
  fix?: string;
  code: string;
}

export interface StageFlow {
  stageId: string;
  /** Units entering (players or pairs). null = unknown / dynamic. */
  supply: number | null;
  /** Units the stage is designed for (groups × groupSize). */
  capacity: number | null;
  /** Units leaving, and how many groups they arrive in. */
  outTotal: number | null;
  outGroups: number;
  outPerGroup: number | null;
  unit: "players" | "pairs";
  matches: number | null;
  matchesPerEntrant: number | null;
  busiestRoundMatches: number | null;
}

export interface ValidationResult {
  issues: Issue[];
  facts: string[];
  flows: Record<string, StageFlow>;
  /** No unresolved structural questions. */
  structureComplete: boolean;
  /** No errors — safe to hand to the engine. */
  canCreate: boolean;
}

const rrMatches = (n: number) => (n * (n - 1)) / 2;
const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function perGroupOut(stage: Stage): number | null {
  if (stage.advance.positions?.length) return stage.advance.positions.length;
  if (stage.advance.role === "seed") return stage.groupSize ?? null;
  if (stage.advance.role === "qualify") return stage.advance.perGroup ?? null;
  return 0;
}

function stageLabel(division: Division, section: Section, stage: Stage, def: TournamentDefinition) {
  const parts: string[] = [];
  if (def.divisions.length > 1) parts.push(division.name);
  if (division.sections.length > 1) parts.push(section.name);
  parts.push(stage.name);
  return parts.join(" · ");
}

export function validateDefinition(def: TournamentDefinition): ValidationResult {
  const issues: Issue[] = [];
  const facts: string[] = [];
  const flows: Record<string, StageFlow> = {};
  const byId = new Map<string, { division: Division; section: Section; stage: Stage }>();
  allStages(def).forEach((s) => byId.set(s.stage.id, s));

  const openStructural = def.questions.filter((q) => !q.resolved && q.kind === "structural");
  openStructural.forEach((q) =>
    issues.push({ level: "error", code: "open_question", message: `Still to decide: ${q.question}` }),
  );
  def.notUnderstood.forEach((t) =>
    issues.push({ level: "warning", code: "not_understood", message: `Not understood yet: "${t}"` }),
  );

  if (def.divisions.length === 0) {
    issues.push({ level: "error", code: "empty", message: "There are no divisions yet." });
  }

  ownershipIssues(def).forEach((m) => issues.push({ level: "error", code: "stage_ownership", message: m }));
  for (const division of def.divisions) {
    if (division.sections.length === 0 || division.sections.every((x) => x.stages.length === 0)) {
      issues.push({ level: "error", code: "empty_division", message: `${division.name} has no stages yet.` });
    }
    for (const section of division.sections) {
      const consumed = new Map<string, Set<number>>();
      section.stages.forEach((stage, index) => {
        const label = stageLabel(division, section, stage, def);
        const prevRef = stage.input.fromStageId ? byId.get(stage.input.fromStageId) : undefined;
        const prev = prevRef?.stage;
        const prevFlow = prev ? flows[prev.id] : undefined;

        if (stage.input.fromStageId && !prev) {
          issues.push({ level: "error", code: "missing_source", stageId: stage.id, message: `${label} draws from a stage that no longer exists.` });
        }
        if (!stage.input.fromStageId && index > 0 && stage.kind !== "custom") {
          issues.push({ level: "warning", code: "disconnected", stageId: stage.id, message: `${label} is not connected to the stage before it.`, fix: "Choose which stage feeds it." });
        }

        // ── Discipline / eligibility ──────────────────────────────────────
        if (division.eligibility === "mixed" && stage.discipline === "singles") {
          issues.push({ level: "error", code: "eligibility", stageId: stage.id, message: `${label} is singles but ${division.name} is a mixed (1 man + 1 lady) category.` });
        }
        if (stage.discipline === "doubles" && !prev && division.entry === "individual" && stage.kind !== "pair_from_positions") {
          issues.push({ level: "warning", code: "pair_formation", stageId: stage.id, message: `${label} is doubles, but players enter individually and nothing forms the pairs.`, fix: "Let players register as pairs, or add a 'Create doubles pairs' step." });
        }

        // ── Supply ────────────────────────────────────────────────────────
        let supply: number | null = null;
        let unit: "players" | "pairs" = stage.discipline === "doubles" ? "pairs" : "players";
        let supplyPerGroup: number | null = null;
        if (!stage.input.fromStageId) {
          supply = stage.input.entrants ?? null;
          if (supply == null && stage.groupSize && !stage.dynamic) supply = stage.groups * stage.groupSize;
        } else if (prevFlow) {
          supply = prevFlow.outTotal;
          if (prevFlow.outGroups === stage.groups && prevFlow.outPerGroup != null) supplyPerGroup = prevFlow.outPerGroup;
        }

        // Duplicate progression from the same source.
        if (prev && stage.advance) {
          const positions = stage.kind === "pair_from_positions"
            ? (stage.pairing ?? []).flat()
            : (prev.advance.positions ?? []);
          const used = consumed.get(prev.id) ?? new Set<number>();
          const dup = positions.filter((p) => used.has(p));
          if (dup.length && stage.kind === "pair_from_positions") {
            issues.push({ level: "error", code: "duplicate_progression", stageId: stage.id, message: `Position ${dup.join(", ")} of ${prev.name} is sent to more than one place.` });
          }
          positions.forEach((p) => used.add(p));
          consumed.set(prev.id, used);
        }

        let capacity: number | null = stage.groupSize ? stage.groups * stage.groupSize : null;
        let outTotal: number | null = null;
        let outGroups = stage.groups;
        let outPerGroup: number | null = null;
        let matches: number | null = null;
        let perEntrant: number | null = null;
        let busiest: number | null = null;

        switch (stage.kind) {
          case "pair_from_positions": {
            unit = "pairs";
            const pairing = stage.pairing ?? [];
            if (!pairing.length) {
              issues.push({ level: "error", code: "pairing_missing", stageId: stage.id, message: `${label}: choose which finishing positions pair up (e.g. 1st+2nd, 3rd+4th).` });
            }
            if (prev && prev.discipline !== "singles") {
              issues.push({ level: "error", code: "pairing_source", stageId: stage.id, message: `${label} pairs players, but ${prev.name} is already doubles.` });
            }
            const size = prev?.groupSize ?? null;
            const flat = pairing.flat();
            const dupWithin = flat.filter((p, i) => flat.indexOf(p) !== i);
            if (dupWithin.length) issues.push({ level: "error", code: "duplicate_progression", stageId: stage.id, message: `${label}: position ${dupWithin[0]} is used in two pairs.` });
            if (size != null) {
              const tooHigh = flat.filter((p) => p > size);
              if (tooHigh.length) {
                issues.push({ level: "error", code: "pairing_range", stageId: stage.id, message: `${label} uses position ${Math.max(...tooHigh)}, but ${prev!.name} pools only have ${size} players.` });
              }
              const unused: number[] = [];
              for (let p = 1; p <= size; p++) if (!flat.includes(p)) unused.push(p);
              if (unused.length) issues.push({ level: "warning", code: "pairing_unused", stageId: stage.id, message: `${label}: position ${unused.join(", ")} in each pool isn't paired and leaves the tournament.` });
            }
            const sourceGroups = prev?.groups ?? 0;
            outGroups = pairing.length || 1;
            outPerGroup = sourceGroups;
            outTotal = pairing.length * sourceGroups;
            capacity = null;
            if (prev && pairing.length) {
              facts.push(`${label}: each ${prev.name} pool produces ${plural(pairing.length, "pair")} (${pairing.map((p) => `#${p[0]}+#${p[1]}`).join(", ")}), giving ${plural(pairing.length, "level")} of ${plural(sourceGroups, "pair")} each.`);
            }
            break;
          }
          case "round_robin": {
            const n = stage.groupSize ?? null;
            if (n != null) {
              matches = stage.groups * rrMatches(n);
              perEntrant = n - 1;
              busiest = stage.groups * Math.floor(n / 2);
              facts.push(`${label}: ${plural(stage.groups, stage.groups > 1 ? "pool" : "pool")} of ${n} ${unit} → ${perEntrant} matches each, ${rrMatches(n)} per pool, ${matches} in total.`);
              if (n < 2) issues.push({ level: "error", code: "pool_size", stageId: stage.id, message: `${label}: a pool needs at least 2 ${unit}.` });
            } else if (!stage.dynamic) {
              issues.push({ level: "error", code: "unresolved_size", stageId: stage.id, message: `${label}: pool size isn't set.` });
            }
            outPerGroup = perGroupOut(stage);
            outTotal = outPerGroup != null ? outPerGroup * stage.groups : null;
            if (n != null && outPerGroup != null && outPerGroup > n) {
              issues.push({ level: "error", code: "advance_exceeds", stageId: stage.id, message: `${label} sends ${outPerGroup} per pool, but pools only have ${n}.` });
            }
            break;
          }
          case "swiss": {
            const n = supply ?? capacity;
            const rounds = stage.swissRounds ?? null;
            if (!rounds) issues.push({ level: "error", code: "swiss_rounds", stageId: stage.id, message: `${label}: Swiss needs the number of rounds entered by the organiser.` });
            if (n && rounds) { matches = rounds * Math.floor(n / 2); perEntrant = rounds; busiest = Math.floor(n / 2); }
            outPerGroup = perGroupOut(stage);
            outTotal = outPerGroup != null ? outPerGroup * stage.groups : null;
            break;
          }
          case "knockout":
          case "placement": {
            const size = stage.groupSize ?? null;
            if (size != null) {
              const draw = nextPow2(size);
              matches = stage.groups * (size - 1);
              busiest = stage.groups * (draw / 2);
              facts.push(`${label}: ${stage.groups > 1 ? `${stage.groups} draws of ` : "draw of "}${size} → ${knockoutRoundNames(size, stage.name.replace(/\s*knockout\s*/i, "").trim() || undefined).join(" → ")}.`);
            } else if (!stage.dynamic) {
              issues.push({ level: "error", code: "unresolved_size", stageId: stage.id, message: `${label}: draw size isn't set.` });
            }
            outPerGroup = perGroupOut(stage);
            outTotal = outPerGroup != null ? outPerGroup * stage.groups : 0;
            break;
          }
          case "split": {
            if (!stage.splits?.length) issues.push({ level: "error", code: "split_empty", stageId: stage.id, message: `${label}: name the competitions (e.g. Championship 1–8, Plate 9–16).` });
            outTotal = supply;
            outGroups = stage.splits?.length || 1;
            capacity = null;
            break;
          }
          default: {
            outTotal = supply;
            outPerGroup = supplyPerGroup;
            capacity = null;
          }
        }

        // ── Supply vs design ──────────────────────────────────────────────
        if (!stage.dynamic && capacity != null && supply != null) {
          const perGroupCap = stage.groupSize!;
          if (supplyPerGroup != null && supplyPerGroup !== perGroupCap) {
            const what = stage.kind === "knockout" ? "draw" : "group";
            issues.push({
              level: "error", code: "count_mismatch", stageId: stage.id,
              message: `${label} expects ${perGroupCap} ${unit} per ${what}, but each ${what} receives ${supplyPerGroup} from ${prev?.name}.`,
              fix: `Change the ${what} size to ${supplyPerGroup}, or change what ${prev?.name} sends on.`,
            });
          } else if (supplyPerGroup == null && supply !== capacity) {
            if (stage.kind === "knockout" && supply < capacity && supply > capacity / 2) {
              issues.push({ level: "info", code: "byes", stageId: stage.id, message: `${label}: ${supply} ${unit} in a draw of ${capacity} → ${plural(capacity - supply, "bye")}.` });
            } else if (supply < capacity) {
              const src = prev && prevRef
                ? describeSources(prev, prevRef.section.name)
                : `${supply} ${unit} enter`;
              issues.push({
                level: "error", code: "empty_positions", stageId: stage.id,
                message: `${src} into ${label} requiring ${capacity}; ${capacity - supply} positions are empty.`,
                fix: `Reduce the draw to ${nextPow2(supply) === supply ? supply : `${supply} (with byes)`}, or send more ${unit} on.`,
              });
            } else {
              issues.push({
                level: "error", code: "overflow", stageId: stage.id,
                message: `${label} is designed for ${capacity} ${unit}, but ${supply} arrive.`,
                fix: `Increase the ${stage.kind === "knockout" ? "draw" : "pool"} size or number of groups, or send fewer on.`,
              });
            }
          }
        }
        if (stage.dynamic) {
          issues.push({ level: "info", code: "dynamic", stageId: stage.id, message: `${label}: draw size, byes${stage.seedingBands?.length ? " and strength bands" : ""} are decided when registration closes.` });
        }

        // ── Seeding vs qualification ─────────────────────────────────────
        if (prev && prevFlow && (stage.kind === "knockout") && (prev.kind === "round_robin" || prev.kind === "swiss")) {
          const allAdvance = prev.advance.role === "seed" || (prev.groupSize != null && perGroupOut(prev) === prev.groupSize);
          if (allAdvance) {
            const n = stage.groupSize ?? 0;
            const suggestion = n === 4 ? "1st vs 4th and 2nd vs 3rd" : "1st vs last, 2nd vs second-last";
            issues.push({
              level: stage.seededMatchups ? "info" : "warning", code: "seeding_only", stageId: stage.id,
              message: `Everyone in ${prev.name} advances to ${label}, so ${prev.name} decides seeding, not qualification.`,
              fix: stage.seededMatchups ? undefined : `Seed the playoffs ${suggestion}.`,
            });
          }
        }

        // ── Minimum games ────────────────────────────────────────────────
        if (stage.minMatches && perEntrant != null && perEntrant < stage.minMatches) {
          issues.push({ level: "warning", code: "min_matches", stageId: stage.id, message: `${label} gives ${perEntrant} matches each, below the minimum of ${stage.minMatches}.` });
        }

        // ── Dates ────────────────────────────────────────────────────────
        const sch = stage.schedule;
        if (prev?.schedule?.endDate && sch.startDate && sch.startDate < prev.schedule.endDate) {
          issues.push({ level: "error", code: "date_order", stageId: stage.id, message: `${label} starts ${sch.startDate} but ${prev.name} finishes on ${prev.schedule.endDate}.` });
        }
        if (prev?.schedule?.endDate && sch.endDate && sch.endDate < prev.schedule.endDate) {
          issues.push({ level: "error", code: "date_order", stageId: stage.id, message: `${label} must be complete by ${sch.endDate} but ${prev.name} finishes on ${prev.schedule.endDate}.` });
        }
        if (sch.startDate && sch.endDate && sch.endDate < sch.startDate) {
          issues.push({ level: "error", code: "date_range", stageId: stage.id, message: `${label} ends before it starts.` });
        }
        if (stage.kind !== "pair_from_positions" && stage.kind !== "split" && sch.mode === "unset") {
          issues.push({ level: "info", code: "schedule_unset", stageId: stage.id, message: `${label}: scheduling not set yet (fixed date, play-by date, self-booking or admin).` });
        }
        if (sch.mode === "fixed" && !sch.startDate && !(sch.roundDates?.length)) {
          issues.push({ level: "warning", code: "schedule_dates", stageId: stage.id, message: `${label} uses fixed dates, but no dates are entered yet.` });
        }

        // ── Court capacity per session ───────────────────────────────────
        const venues = (sch.venueClubIds?.length || sch.venueNames?.length || 0);
        if (busiest != null && venues && sch.courtsPerVenue && sch.sessionMinutes && sch.matchMinutes) {
          const slots = venues * sch.courtsPerVenue * Math.floor(sch.sessionMinutes / sch.matchMinutes);
          if (busiest > slots) {
            issues.push({ level: "error", code: "capacity", stageId: stage.id, message: `${label}: the busiest round needs ${busiest} matches but one session only fits ${slots} (${venues} venues × ${sch.courtsPerVenue} courts).`, fix: "Add a session, venue or court, or shorten matches." });
          } else {
            facts.push(`${label}: busiest round ${busiest} matches fits ${slots} slots per session.`);
          }
        }

        flows[stage.id] = {
          stageId: stage.id, supply, capacity, outTotal, outGroups, outPerGroup, unit,
          matches, matchesPerEntrant: perEntrant, busiestRoundMatches: busiest,
        };
      });
    }
  }

  // Shared-evening capacity across divisions on the same weekday.
  const byDay = new Map<number, { total: number; slots: number | null }>();
  allStages(def).forEach(({ stage }) => {
    const s = stage.schedule; const f = flows[stage.id];
    if (s.weekday == null || !f?.busiestRoundMatches) return;
    const venues = s.venueClubIds?.length || s.venueNames?.length || 0;
    const slots = venues && s.courtsPerVenue && s.sessionMinutes && s.matchMinutes
      ? venues * s.courtsPerVenue * Math.floor(s.sessionMinutes / s.matchMinutes) : null;
    const cur = byDay.get(s.weekday) ?? { total: 0, slots };
    cur.total += f.busiestRoundMatches; cur.slots = cur.slots ?? slots;
    byDay.set(s.weekday, cur);
  });
  const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  byDay.forEach((v, d) => {
    if (v.slots != null && v.total > v.slots) {
      issues.push({ level: "error", code: "capacity_shared", message: `All divisions together need ${v.total} matches on a ${DAY[d]} evening, but only ${v.slots} fit.` });
    }
  });

  issues.push(...engineContractIssues(def));

  return {
    issues,
    facts,
    flows,
    structureComplete: openStructural.length === 0,
    canCreate: !issues.some((i) => i.level === "error"),
  };
}

function describeSources(prev: Stage, _sectionName: string) {
  const per = perGroupOut(prev) ?? 0;
  if (prev.groups <= 1) return `${prev.name} sends ${per}`;
  const names = Array.from({ length: prev.groups }, (_, i) => `Pool ${String.fromCharCode(65 + i)} sends ${per}`);
  return names.length <= 3 ? names.join(" and ") : `${prev.groups} pools send ${per} each (${per * prev.groups})`;
}

/** Issues present in `after` but not in `before` — used to explain the consequences of an edit. */
export function newProblems(before: ValidationResult, after: ValidationResult): Issue[] {
  const key = (i: Issue) => `${i.code}|${i.message}`;
  const had = new Set(before.issues.map(key));
  return after.issues.filter((i) => i.level !== "info" && !had.has(key(i)));
}

/**
 * Engine contract checks (see docs/TOURNAMENT_ENGINE_INTEGRITY.md). A playoff
 * stage must state who qualifies, how they are mapped, and how it is generated.
 * The builder recommends owner approval; it never assumes automatic.
 */
export function engineContractIssues(def: TournamentDefinition): Issue[] {
  const out: Issue[] = [];
  for (const div of def.divisions) for (const sec of div.sections) sec.stages.forEach((st, i) => {
    const label = stageLabel(div, sec, st, def);
    if (st.kind === "swiss" && !st.swissRounds) {
      out.push({ level: "error", code: "contract_swiss_rounds", stageId: st.id, message: `${label}: set the number of Swiss rounds.`, fix: "The engine never picks a round count for you." });
    }
    if (i === 0 || (st.kind !== "knockout" && st.kind !== "placement")) return;
    const prev = sec.stages[i - 1];
    if (prev.kind === "pair_from_positions" || prev.kind === "split" || prev.kind === "custom") return;
    const perGroup = perGroupOut(prev);
    if (!perGroup) out.push({ level: "error", code: "contract_qualify", stageId: st.id, message: `${label}: say who qualifies from ${prev.name}.` });
    if (!st.qualifierMapping && !st.seededMatchups) out.push({ level: "error", code: "contract_mapping", stageId: st.id, message: `${label}: choose how qualifiers are placed (cross-pool, reseed by standing, or within pool).`, fix: "Recommended: cross-pool (Pool A winner vs Pool B runner-up)." });
    if (!st.generation) out.push({ level: "warning", code: "contract_generation", stageId: st.id, message: `${label}: playoffs will wait for owner approval (preview, then confirm).`, fix: "Choose automatic generation only if you want playoffs created the moment pool results are in." });
  });
  return out;
}
