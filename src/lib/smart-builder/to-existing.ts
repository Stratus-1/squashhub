/**
 * Map a validated Smart Builder definition onto the EXISTING tournament model
 * (club_champs view + tournaments extras). Nothing new is invented here: each
 * division × section becomes one existing competition division ("group").
 *
 * Executability:
 * - ready:   every stage maps onto today's engine.
 * - partial: the opening stage(s) of every division map; later stages need the
 *            new multi-stage engine. They are listed in `deferredStages`, NOT
 *            created, and stay in the saved draft (nothing is lost).
 * - blocked: a division's opening stage can't be represented at all.
 *
 * Communication settings map to existing fields only. Nothing here sends
 * anything: invitations are always triggered later from the existing screens.
 */
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { isBellsDefinition, type Division, type Section, type Stage, type TournamentDefinition } from "./definition";

export type Executability = "ready" | "partial" | "blocked";

export interface ExistingMapping {
  champ: Record<string, any>;
  extras: Record<string, any>;
  /** Blocking reasons (executability "blocked"). */
  unsupported: string[];
  /** Stages that are kept in the draft but not created (executability "partial"). */
  deferredStages: { division: string; stage: string; reason: string }[];
  executability: Executability;
  /** True when the design runs on the structured multi-stage engine. */
  structured?: boolean;
  /** WhatsApp group link to store on the tournament's group record after insert. */
  whatsappGroupUrl: string | null;
}

const GENDER: Record<Division["eligibility"], string> = {
  men: "men",
  ladies: "ladies",
  mixed: "mixed",
  open: "open",
  open_any_pair: "open",
};

const MAPPABLE_FIRST = new Set(["knockout", "round_robin", "swiss"]);

export function mapToExistingTournament(def: TournamentDefinition): ExistingMapping {
  const unsupported: string[] = [];
  const deferredStages: ExistingMapping["deferredStages"] = [];
  const leagueFormats: Record<string, string> = {};
  const swissPools: Record<string, number> = {};
  const expected: Record<string, number> = {};
  const genders: Record<string, string> = {};
  const matchTypes: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const playoffModes: Record<string, string> = {};
  const playoffQualifiers: Record<string, number> = {};
  let swissRounds: number | null = null;
  let g = 0;

  const defer = (label: string, stages: Stage[], reason: string) =>
    stages.forEach((s) => deferredStages.push({ division: label, stage: s.name, reason }));

  const add = (division: Division, section: Section) => {
    g += 1;
    const key = String(g);
    const label = division.sections.length > 1 ? `${division.name} ${section.name}` : division.name;
    labels[key] = label;
    genders[key] = GENDER[division.eligibility];
    const [first, second, ...rest] = section.stages as (Stage | undefined)[];
    if (!first) { unsupported.push(`${label} has no stages.`); return; }
    matchTypes[key] = first.discipline;
    if (!MAPPABLE_FIRST.has(first.kind)) {
      unsupported.push(`${label}: the first stage (${first.name}) is a ${first.kind.replace(/_/g, " ")} stage, which today's engine can't run.`);
      return;
    }
    if (first.groupSize) expected[key] = first.groups * first.groupSize;
    swissPools[key] = first.groups;
    if (first.kind === "knockout") {
      leagueFormats[key] = "knockout";
      defer(label, section.stages.slice(1), "stages after a knockout need the new multi-stage engine");
      return;
    }
    leagueFormats[key] = first.kind === "swiss" ? "swiss" : "single_round_robin";
    if (first.kind === "swiss") swissRounds = first.swissRounds ?? swissRounds;
    if (!second) return;
    const secondOk = second.kind === "knockout" && second.discipline === first.discipline;
    if (secondOk) {
      playoffModes[key] = "knockout";
      playoffQualifiers[key] = first.advance.perGroup ?? first.advance.positions?.length ?? 1;
      defer(label, rest as Stage[], "3+ stage flows need the new multi-stage engine");
    } else {
      const why = second.kind === "knockout" ? "singles → doubles transitions need the new multi-stage engine"
        : `${second.kind.replace(/_/g, " ")} stages need the new multi-stage engine`;
      defer(label, section.stages.slice(1), why);
    }
  };

  def.divisions.forEach((d) => d.sections.forEach((s) => add(d, s)));
  if (g === 0) unsupported.push("There are no divisions yet.");

  const genderValues = Array.from(new Set(Object.values(genders)));
  const matchValues = Array.from(new Set(Object.values(matchTypes)));
  const firstFormat = Object.values(leagueFormats)[0] ?? "knockout";
  // Multi-stage designs run on the structured engine: every stage is persisted as a real
  // stage (later ones Pending until their source stage resolves). Only stages the structured
  // engine genuinely can't run stay deferred. Date/schedule problems are reported by Review.
  let structured = false;
  try { specFromDefinition(def); structured = true; }
  catch (e: any) { structured = !["unsupported_stage", "venue_outside"].includes(e?.code); }
  if (structured && !unsupported.length) deferredStages.length = 0;
  const executability: Executability = unsupported.length ? "blocked" : deferredStages.length ? "partial" : "ready";

  // ── Players / communications → existing fields (no send triggers) ──
  const p = def.players ?? {};
  const c = def.comms ?? {};
  const sd = def.scheduleDefaults ?? {};
  const sc = def.scoring ?? {};
  const champ: Record<string, any> = {
    name: def.name,
    gender: genderValues.length === 1 ? genderValues[0] : "open",
    match_type: matchValues.length === 1 ? matchValues[0] : "singles",
    num_groups: Math.max(1, g),
    round_format: firstFormat === "knockout" ? undefined : firstFormat,
    league_formats: leagueFormats,
    swiss_pools: swissPools,
    swiss_rounds: swissRounds,
    expected_players: Object.keys(expected).length ? expected : null,
    group_labels: labels,
  };
  if (p.entryMethod) champ.registration_mode = p.entryMethod === "self_entry" ? "open" : "invite";
  const regClose = c.registrationClosesAt ?? def.registrationClosesAt;
  if (regClose) champ.registration_closes_at = regClose;
  if (c.registrationOpensAt) champ.registration_opens_at = c.registrationOpensAt;
  if (c.entryFeeRands != null) champ.entry_fee_cents = Math.round(c.entryFeeRands * 100);
  if (c.paymentRequired != null) champ.payment_required = c.paymentRequired;
  else if (c.entryFeeRands === 0) champ.payment_required = false;
  if (c.paymentMethods?.length) champ.payment_methods = c.paymentMethods;
  const stageDates = def.divisions.flatMap((div) => div.sections.flatMap((sec) => sec.stages))
    .filter((stage) => stage.kind !== "split" && stage.kind !== "pair_from_positions");
  const starts = stageDates.map((stage) => stage.schedule.startDate?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const ends = stageDates.map((stage) => stage.schedule.endDate?.slice(0, 10) ?? stage.schedule.startDate?.slice(0, 10)).filter((d): d is string => !!d).sort();
  if (sd.startDate || starts.length) champ.start_date = sd.startDate?.slice(0, 10) ?? starts[0];
  if (sd.endDate || ends.length) champ.end_date = sd.endDate?.slice(0, 10) ?? ends[ends.length - 1];
  if (isBellsDefinition(def)) {
    champ.scoring_mode = "time_capped_points";
    const first = def.divisions.flatMap((div) => div.sections.flatMap((sec) => sec.stages)).find((s) => s.kind !== "split" && s.kind !== "pair_from_positions");
    const duration = first?.schedule.matchMinutes ?? sd.matchMinutes;
    if (duration) champ.match_duration_minutes = duration;
  } else {
    if (sc.pointsPerGame) champ.points_per_game = sc.pointsPerGame;
    if (sc.bestOf) champ.best_of = sc.bestOf;
    if (sc.playAllGames != null) champ.play_all_games = sc.playAllGames;
    if (sc.winCondition) champ.win_condition = sc.winCondition;
  }

  const extras: Record<string, any> = {
    league_genders: genders,
    league_match_types: matchTypes,
    league_playoff_modes: Object.keys(playoffModes).length ? playoffModes : null,
    league_playoff_qualifiers: Object.keys(playoffQualifiers).length ? playoffQualifiers : null,
  };
  const inviteMethods = (c.inviteChannels ?? [])
    .map((ch) => (ch === "in_app" ? "app" : ch))
    .filter((m) => m === "app" || m === "email" || m === "whatsapp");
  if (inviteMethods.length) extras.invite_methods = inviteMethods;
  if (p.audience) extras.invite_audience = p.audience;
  if (c.inviteMessage) extras.invite_short_message = c.inviteMessage;
  if (c.resultNotify) {
    extras.result_notify_scope = c.resultNotify === "none" ? "never" : c.resultNotify;
    if (c.resultNotify !== "none" && c.resultChannels?.length) extras.result_notify_channels = c.resultChannels;
  }

  return {
    unsupported, deferredStages, executability, champ, extras, structured,
    whatsappGroupUrl: c.whatsappGroup === "yes" ? (c.whatsappGroupUrl ?? null) : null,
  };
}
