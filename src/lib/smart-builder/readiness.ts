/**
 * Smart Builder readiness — a deterministic completeness check over the ONE
 * structured draft. The AI, the tabs and the Review page all read this; the
 * AI is told the next missing item so it asks for it itself.
 */
import { stageCourts, stageMatch } from "./court-allocation";
import { scoringIssues, stageScoringLine } from "./scoring";
import { allStages, effectiveSchedule, isBellsDefinition, type TournamentDefinition } from "./definition";
import type { ValidationResult } from "./validate";
import type { ExistingMapping } from "./to-existing";
import { AUDIENCE_OPTIONS, SEEDING_LABELS, coverageSentence, isAudienceValid, recommendSeeding, type EventScope } from "./scope";
import { issueField, scheduleMaths } from "./schedule-maths";
import { deferredStages, isDeferred } from "./deferred";
import { SCOPE_LABEL, eventVenues, selectedCourtPool, venuesOutsideSet, venuesValid } from "./venues";
import { isGroupInviteUrl } from "@/lib/tournaments/whatsapp-group";

export type ReadinessTab = "design" | "players" | "schedule" | "invitations" | "review";
export type ItemState = "complete" | "missing" | "warning";

export interface ReadinessItem {
  id: string;
  label: string;
  state: ItemState;
  /** Plain summary of the saved value, or what is needed. */
  detail: string;
  tab: ReadinessTab;
  /** Field anchor on that tab (data-field attribute). */
  field?: string;
  /** Offending stage, so "Go there" can open that division + stage. */
  stageId?: string;
  /** Question the builder asks when this is the next missing item. */
  ask?: string;
}

export interface ReadinessSection { key: ReadinessTab | "support"; title: string; state: ItemState; items: ReadinessItem[] }

export interface Readiness {
  sections: ReadinessSection[];
  missing: ReadinessItem[];
  nextMissing: ReadinessItem | null;
  executability: ExistingMapping["executability"];
}

const CH: Record<string, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const worst = (items: ReadinessItem[]): ItemState =>
  items.some((i) => i.state === "missing") ? "missing" : items.some((i) => i.state === "warning") ? "warning" : "complete";

/** Stages that need a schedule (transforms/splits are bookkeeping steps). */
export function schedulableStages(def: TournamentDefinition) {
  // Deferred ("Define later") stages are planning targets: never scheduled, never checked.
  return allStages(def).filter((r) => r.stage.kind !== "pair_from_positions" && r.stage.kind !== "split" && !isDeferred(r.stage));
}

/** Which schedule inputs a stage actually needs, based on its mode. */
export function scheduleNeeds(mode: string) {
  const onCourt = mode === "fixed" || mode === "admin";
  return {
    dates: mode !== "unset",
    endDate: mode === "play_by" || mode === "self_booking",
    venue: onCourt,
    courts: onCourt,
    matchMinutes: onCourt,
    sessionMinutes: false,
  };
}

export function assessReadiness(def: TournamentDefinition, validation: ValidationResult, mapping: ExistingMapping): Readiness {
  const p = def.players ?? {}, c = def.comms ?? {}, sd = def.scheduleDefaults ?? {};
  const stages = allStages(def);

  // ── Event (asked first: owner/scope → audience → seeding data → expected entries) ──
  const ev = def.event ?? {};
  const event: ReadinessItem[] = [];
  event.push({ id: "scope", label: "Event level", tab: "design", field: "event.scope",
    state: ev.scope ? "complete" : "missing",
    detail: ev.scope ? SCOPE_LABEL[ev.scope as EventScope] : "Not decided",
    ask: "Is this a club event, a regional association event, or a national federation event?" });
  if (ev.scope) event.push({ id: "owner", label: "Owning organisation", tab: "design", field: "event.owner",
    state: ev.ownerId ? "complete" : "missing",
    detail: ev.ownerName ?? (ev.ownerId ? "Chosen" : "Not chosen"),
    ask: `Which organisation owns this ${SCOPE_LABEL[ev.scope as EventScope].toLowerCase()}?` });
  if (ev.scope) event.push({ id: "event_audience", label: "Eligible audience", tab: "design", field: "event.audience",
    state: isAudienceValid(ev.scope, ev.audience) ? "complete" : "missing",
    detail: isAudienceValid(ev.scope, ev.audience) ? AUDIENCE_OPTIONS[ev.scope].find((o) => o.value === ev.audience)!.label : "Not decided",
    ask: `Who may enter? ${AUDIENCE_OPTIONS[ev.scope].map((o) => o.label).join(" / ")}. (All members and league players only are different choices.)` });
  if (ev.scope && ev.audience) {
    const cov = { eligible: ev.eligibleCount ?? null, bySource: (ev.coverage ?? {}) as Record<string, number> };
    const rec = recommendSeeding(ev.scope as EventScope, cov);
    event.push({ id: "event_seeding", label: "Seeding data", tab: "design", field: "event.seedingSource",
      state: ev.seedingSource ? "complete" : "warning",
      detail: ev.seedingSource
        ? `${SEEDING_LABELS[ev.seedingSource]}${rec && ev.eligibleCount ? ` — ${cov.bySource[ev.seedingSource] ?? 0}/${ev.eligibleCount} covered; the rest are placed manually` : ""}`
        : rec ? `Recommended: ${SEEDING_LABELS[rec.source]} (${rec.covered} covered, ${rec.missing} without data)` : "Coverage not checked yet" });
    event.push({ id: "expected_entries", label: "Expected entries", tab: "design", field: "event.expectedEntries",
      state: ev.expectedEntries ? "complete" : "missing",
      detail: ev.expectedEntries ? `About ${ev.expectedEntries}` : "Not estimated",
      ask: coverageSentence(ev.scope as EventScope, cov) });
  }

  const ven = eventVenues(def);
  event.push({ id: "venues", label: "Venue(s)", tab: "design", field: "event.venues",
    state: venuesValid(def) ? "complete" : "missing",
    detail: def.event?.noVenue ? "No physical venue needed" : (def.event?.venuesStale ?? []).length ? "Some venues aren't under the current owner — review them" : ven.names.length ? `${ven.names.join(", ")} · ${selectedCourtPool(def).length} court(s)` : "Not chosen",
    ask: "Where may this tournament be played — one venue or several?" });
  const outside = venuesOutsideSet(def);
  if (outside.length) event.push({ id: "venue_outside", label: "Schedule venues", tab: "schedule", field: "defaults.venues",
    state: "missing", detail: `${outside[0].where}: ${outside[0].venue} is not one of the tournament's venues`,
    ask: "A scheduled venue is outside the tournament's venue list. Pick from the venues chosen on Design." });

  // ── Design ──
  const design: ReadinessItem[] = [];
  design.push({ id: "divisions", label: "Divisions & stages", tab: "design", field: "canvas",
    state: def.divisions.length && stages.length ? "complete" : "missing",
    detail: def.divisions.length ? `${def.divisions.length} division(s), ${stages.length} stage(s)` : "No divisions yet",
    ask: "What divisions will this tournament have, and how does each one play (pools, knockout, etc.)?" });
  const SCORING_CODES = new Set(["scoring_cap", "standings"]);
  const errs = validation.issues.filter((i) => i.level === "error" && !SCORING_CODES.has(i.code) && i.code !== "engine_unsupported");
  const scoringErrs = validation.issues.filter((i) => i.level === "error" && SCORING_CODES.has(i.code));
  const e0 = errs[0];
  const transitionCodes = new Set(["pairs_model", "split_model", "pairing_scope", "pairs_qualifiers", "form_pairs_scope", "standings_rule", "odd_pairs", "top_n", "top_exceeds_pool", "per_pool_source", "per_pool_mode", "missing_source"]);
  design.push({ id: "structure_valid", label: "Structure maths", tab: "design",
    field: e0?.stageId ? (transitionCodes.has(e0.code) ? "stage-transition" : "stage-panel") : "canvas",
    stageId: e0?.stageId,
    state: errs.length ? "missing" : "complete",
    detail: e0 ? `${e0.message}${e0.fix ? ` ${e0.fix}` : ""}` : "Counts, progression and draw sizes add up" });
  const smx = scheduleMaths(def), sm0 = smx.issues[0];
  design.push({ id: "schedule_maths", label: "Schedule maths", tab: sm0 ? (sm0.stageId ? "schedule" : "design") : "schedule",
    field: sm0 ? issueField(sm0) : undefined, stageId: sm0?.stageId || undefined,
    state: sm0 ? "missing" : "complete",
    detail: sm0 ? `${sm0.message}${smx.issues.length > 1 ? ` (+${smx.issues.length - 1} more)` : ""}` : `Valid — rounds, stage order and dependencies fit the dates. ${smx.capacityNote}.`,
    ask: sm0?.message });
  const sized = schedulableStages(def).filter(({ stage }) => stage.groupSize == null && !stage.dynamic);
  const later = deferredStages(def);
  if (later.length) design.push({ id: "later_stages", label: "Later stages", tab: "design", field: "canvas", stageId: later[0].stageId,
    state: "complete",
    detail: later.map((l) => `${l.stageName} — Define later${l.plannedDate ? ` (planned ${l.plannedDate})` : ""}`).join(" · ") +
      ". Set these up once the stage before them is finished; they can't start until then." });
  if (stages.length) design.push({ id: "sizes", label: "Stage sizes", tab: "design", field: "canvas",
    state: sized.length ? "missing" : "complete",
    detail: sized.length ? `${sized.map((s) => s.stage.name).join(", ")}: size not set (or mark it as decided when entries close)` : "Every stage has a size or resolves when entries close" });
  const openStructural = def.questions.filter((q) => !q.resolved && q.kind === "structural");
  design.push({ id: "questions", label: "Open structural questions", tab: "design", field: "questions",
    state: openStructural.length ? "missing" : "complete",
    detail: openStructural.length ? openStructural[0].question : "None", ask: openStructural[0]?.question });
  const sc = def.scoring ?? {};
  const bells = isBellsDefinition(def);
  const capIssues = scoringIssues(def);
  const perStage = schedulableStages(def).some(({ stage }) => stage.scoring?.mode);
  // Scoring is complete when every stage can decide results/standings. Match duration is a
  // SCHEDULE input (court-slot minutes) and is checked under Schedule, never here.
  const scoringBlock = capIssues[0]?.message ?? scoringErrs[0]?.message;
  design.push({ id: "scoring", label: "Scoring", tab: "design", field: "scoring", stageId: capIssues[0]?.stageId ?? scoringErrs[0]?.stageId,
    state: scoringBlock ? "missing" : bells || perStage || (sc.pointsPerGame && sc.bestOf) ? "complete" : "warning",
    detail: scoringBlock ? scoringBlock : perStage ? schedulableStages(def).map(({ stage }) => `${stage.name}: ${stageScoringLine(def, stage)}`).join(" · ") : bells ? "Bells — timed points" : sc.pointsPerGame && sc.bestOf
      ? `PAR ${sc.pointsPerGame}, best of ${sc.bestOf}${sc.playAllGames ? ", play all games" : ""}${sc.winCondition === "sudden_death" ? ", sudden death" : ""}`
      : "Not set — the existing default (PAR 11, best of 5) will be used",
    ask: scoringBlock ? scoringBlock : bells ? "When does the bell ring (Bells time cap), and how are standings decided?" : "What scoring should matches use — PAR 11 or 15, best of 3 or 5?" });

  // ── Players ──
  const players: ReadinessItem[] = [];
  players.push({ id: "entry", label: "How players enter", tab: "players", field: "entryMethod",
    state: p.entryMethod ? "complete" : "missing",
    detail: p.entryMethod === "self_entry" ? "Players enter themselves" : p.entryMethod === "selected" ? `Selected / invited players${p.confirmAvailabilityOnly ? " — they only confirm availability" : ""}` : p.entryMethod === "both" ? "Invited players plus open entry" : "Not decided",
    ask: "Do players enter themselves, or will you select/invite them?" });
  if (p.entryMethod && p.entryMethod !== "self_entry") players.push({ id: "audience", label: "Who is invited", tab: "players", field: "audience",
    state: p.audience ? "complete" : "missing", detail: p.audience ? p.audience.replace(/_/g, " ") : "Not decided",
    ask: "Who should be invited — the whole club, league players, other clubs, or specific people?" });
  players.push({ id: "eligibility", label: "Eligibility per division", tab: "players", field: "eligibility",
    state: def.divisions.length ? "complete" : "missing",
    detail: def.divisions.map((d) => `${d.name}: ${d.eligibility.replace(/_/g, " ")}, ${d.entry === "pairs" ? "pairs" : "individual"}`).join("; ") || "No divisions" });
  const usesSeeding = stages.some(({ stage }) => stage.kind === "knockout" || (stage.seedingBands?.length ?? 0) > 0);
  if (usesSeeding) players.push({ id: "seeding", label: "Seeding source", tab: "design", field: "event.seedingSource",
    state: (ev.seedingSource || p.seedingSource) ? "complete" : "missing",
    detail: ev.seedingSource ? SEEDING_LABELS[ev.seedingSource] : p.seedingSource ? `${p.seedingSource} (older setting)` : "Not decided — set Seeding data",
    ask: "How should players be seeded — by ranking, ladder, manually, or not at all?" });

  // ── Schedule ──
  const schedule: ReadinessItem[] = [];
  const planned = schedulableStages(def).map(({ stage }) => effectiveSchedule(def, stage));
  const hasStageDates = planned.length > 0 && planned.every((s) => !!s.startDate.value && !!s.endDate.value);
  void hasStageDates;
  schedule.push({ id: "dates", label: "Tournament dates", tab: "design", field: "defaults.startDate",
    state: sd.startDate && sd.endDate ? "complete" : "missing",
    detail: sd.startDate ? `${sd.startDate.slice(0, 10)} → ${sd.endDate?.slice(0, 10) ?? "?"}` : "Not set", ask: "What are the tournament's first and last days?" });
  // Schedule card can never be COMPLETE while schedule maths fails (the check itself lives under Design).
  if (smx.issues.length) schedule.push({ id: "schedule_maths_ref", label: "Schedule maths", tab: sm0!.stageId ? "schedule" : "design", field: issueField(sm0!), stageId: sm0!.stageId || undefined,
    state: "missing", detail: "Dates are filled in but don't fit the structure — see Schedule maths under Design" });
  schedulableStages(def).forEach(({ stage, division }) => {
    const e = effectiveSchedule(def, stage), need = scheduleNeeds(stage.schedule.mode);
    const gaps: string[] = [];
    if (stage.schedule.mode === "unset") gaps.push("how it's scheduled");
    if (need.dates && !e.startDate.value && !e.endDate.value && !(stage.schedule.roundDates?.length)) gaps.push("dates");
    if (need.venue && !(e.venueNames.value?.length) && !eventVenues(def).clubIds.length) gaps.push("venue");
    if (need.courts && !stageCourts(def, division, stage).count) gaps.push("courts");
    if (need.matchMinutes && !stageMatch(def, stage).text) gaps.push("match duration (minutes per court slot)");
    schedule.push({ id: `stage_${stage.id}`, label: `${def.divisions.length > 1 ? `${division.name} · ` : ""}${stage.name}`, tab: "schedule", field: `stage.${stage.id}`,
      state: gaps.length ? "missing" : "complete", detail: gaps.length ? `Needs ${gaps.join(", ")}` : "Scheduled",
      ask: gaps.length ? `For ${stage.name}: ${gaps.includes("how it's scheduled") ? "is it on fixed dates, a play-by date, players arranging their own matches, or admin-scheduled?" : `what ${gaps.join(", ")} should it use?`}` : undefined });
  });

  // ── Invitations & communications ──
  const inv: ReadinessItem[] = [];
  inv.push({ id: "sending", label: "Invitation sending", tab: "invitations", field: "inviteSending",
    state: c.inviteSending ? "complete" : "missing",
    detail: c.inviteSending === "automatic" ? "Automatic" : c.inviteSending === "manual" ? "Manual — an admin presses Send" : "Not decided (will stay manual)",
    ask: "Should invitations be sent manually by an admin, or automatically?" });
  inv.push({ id: "channels", label: "Invitation channels", tab: "invitations", field: "inviteChannels",
    state: c.inviteChannels?.length ? "complete" : "missing",
    detail: c.inviteChannels?.length ? c.inviteChannels.map((x) => CH[x]).join(", ") : "Not chosen",
    ask: "How should invitations go out — in-app, email, WhatsApp?" });
  if (c.inviteChannels?.includes("sms")) inv.push({ id: "sms_invites", label: "SMS invitations", tab: "invitations", field: "inviteChannels",
    state: "warning", detail: "The existing invitation sender supports in-app, email and WhatsApp; SMS won't be used for invitations" });
  if (p.entryMethod !== "selected") inv.push({ id: "reg_close", label: "Registration closes", tab: "invitations", field: "registrationClosesAt",
    state: c.registrationClosesAt || def.registrationClosesAt ? "complete" : "missing",
    detail: c.registrationClosesAt || def.registrationClosesAt || "Not set", ask: "When does registration close?" });
  inv.push({ id: "fee", label: "Entry fee", tab: "invitations", field: "entryFeeRands",
    state: c.entryFeeRands != null ? "complete" : "missing",
    detail: c.entryFeeRands == null ? "Not decided" : c.entryFeeRands === 0 ? "Free" : `R${c.entryFeeRands.toFixed(2)}${c.paymentMethods?.length ? ` (${c.paymentMethods.join(", ")})` : ""}`,
    ask: "Is there an entry fee? If so, how much and how can players pay?" });
  inv.push({ id: "reminders", label: "Reminders", tab: "invitations", field: "reminders",
    state: c.reminders ? "complete" : "warning", detail: c.reminders ? c.reminders.replace(/_/g, " ") : "Optional — none set" });
  const wgBad = c.whatsappGroup === "yes" && c.whatsappGroupUrl && !isGroupInviteUrl(c.whatsappGroupUrl);
  inv.push({ id: "whatsapp_group", label: "WhatsApp group", tab: "invitations", field: "whatsappGroup",
    state: !c.whatsappGroup ? "missing" : wgBad ? "missing" : c.whatsappGroup === "yes" && !c.whatsappGroupUrl ? "warning" : "complete",
    detail: !c.whatsappGroup ? "Not decided" : c.whatsappGroup === "no" ? "No group" : wgBad ? "The link isn't a WhatsApp group invite link" : c.whatsappGroupUrl ? "Yes — link saved" : "Yes — paste the invite link (can be added later)",
    ask: "Do you want to add a WhatsApp group for this tournament?" });
  inv.push({ id: "results", label: "Post-match messages", tab: "invitations", field: "resultNotify",
    state: c.resultNotify ? "complete" : "missing",
    detail: c.resultNotify === "none" ? "None" : c.resultNotify ? `${c.resultNotify === "all" ? "Every match" : "Play-offs only"} via ${(c.resultChannels ?? ["email"]).map((x) => CH[x]).join(", ")}` : "Not decided",
    ask: "After each match, should players get result messages — for every match, play-offs only, or none?" });

  // ── Structure support ──
  const support: ReadinessItem[] = [];
  if (mapping.executability === "ready") support.push({ id: "exec", label: "Engine support", tab: "review", state: "complete", detail: mapping.structured ? "Every stage is created now; later stages start when the stage before them finishes" : "Every stage can run on today's engine" });
  else if (mapping.executability === "partial") support.push({ id: "exec", label: "Engine support", tab: "design", field: "canvas", state: "missing",
    detail: `${mapping.deferredStages.length} later stage(s) can't be created yet and stay in the draft only` });
  else support.push({ id: "exec", label: "Engine support", tab: "design", field: "stage-panel", stageId: validation.issues.find((i) => i.code === "engine_unsupported")?.stageId, state: "missing", detail: mapping.unsupported[0] ?? "Structure can't be created" });

  // ── The four ready-to-create checks (all must pass) ──
  const scheduleGaps = schedule.filter((i) => i.state === "missing" && i.id !== "schedule_maths_ref");
  const scoringItem = design.find((i) => i.id === "scoring")!;
  const structureItem = design.find((i) => i.id === "structure_valid")!;
  const checks: ReadinessItem[] = [
    { id: "check_structure", label: "Structure valid", tab: structureItem.tab, field: structureItem.field, stageId: structureItem.stageId, state: structureItem.state,
      detail: structureItem.state === "complete" ? "Progression and competition maths work" : structureItem.detail },
    { id: "check_engine", label: "Engine supported", tab: support[0].tab, field: support[0].field, stageId: support[0].stageId, state: support[0].state === "complete" ? "complete" : "missing",
      detail: support[0].state === "complete" ? "Every stage can be generated and run by SquashHub" : support[0].detail },
    { id: "check_schedule", label: "Schedule feasible", tab: sm0 ? "schedule" : scheduleGaps[0]?.tab ?? "schedule", field: sm0 ? issueField(sm0) : scheduleGaps[0]?.field, stageId: sm0?.stageId || scheduleGaps[0]?.stageId,
      state: sm0 || scheduleGaps.length ? "missing" : "complete",
      detail: sm0 ? sm0.message : scheduleGaps.length ? `${scheduleGaps[0].label}: ${scheduleGaps[0].detail}` : "Dates, stage order, match counts, courts and capacity fit" },
    { id: "check_scoring", label: "Scoring complete", tab: scoringItem.tab, field: scoringItem.field, stageId: scoringItem.stageId, state: scoringItem.state === "missing" ? "missing" : "complete",
      detail: scoringItem.state === "missing" ? scoringItem.detail : "Every stage can determine results and standings" },
  ];

  const sections: ReadinessSection[] = [
    { key: "players", title: "Event & audience", items: event, state: worst(event) },
    { key: "design", title: "Design", items: design, state: worst(design) },
    { key: "players", title: "Players", items: players, state: worst(players) },
    { key: "schedule", title: "Schedule", items: schedule, state: worst(schedule) },
    { key: "invitations", title: "Invitations & messages", items: inv, state: worst(inv) },
    { key: "support", title: "Structure support", items: support, state: worst(support) },
  ];
  sections.unshift({ key: "review", title: "Ready to create", items: checks, state: worst(checks) });
  // The four checks summarise items already listed above — not counted twice.
  const missing = sections.flatMap((s) => s.key === "review" ? [] : s.items.filter((i) => i.state === "missing" && i.id !== "schedule_maths_ref"));
  return { sections, missing, nextMissing: missing.find((m) => m.ask) ?? missing[0] ?? null, executability: mapping.executability };
}

export const RESULT_NONE_NOTE = "Creating this tournament will NOT send invitations.";
