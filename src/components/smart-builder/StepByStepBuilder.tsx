import { reconcileFixedStages, scheduleTimedRounds } from "@/lib/tournaments/formal-stage-schedule";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { milestoneFor, configuredPathText } from "@/lib/tournaments/paced-knockout";
/** Lenient WhatsApp group invite check: chat.whatsapp.com/<code> or /invite/<code>, with or without https/www, any query string. */
const normaliseGroupInviteUrl = (raw: string) => {
  let v = raw.trim().replace(/[.,;)\]]+$/, "");
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/^http:\/\//i, "https://").replace(/^https:\/\/www\./i, "https://");
  return /^https:\/\/chat\.whatsapp\.com\/(invite\/)?[A-Za-z0-9_-]{6,}\/?(\?\S*)?$/i.test(v) ? v : null;
};
import { TieBreakFields } from "./TieBreakFields";
import { normaliseTieBreaks, type TieBreakCriterion } from "@/lib/tournaments/tie-breaks";
import { saveTieBreakRules } from "@/lib/tournaments/progression";
import { atomically } from "@/lib/tournaments/structured-persist";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { poolPlanOf, poolQualificationOf, recommendPools, type PoolMode, type PoolPlan, type PoolQualification } from "@/lib/smart-builder/pool-plan";
import { placesOf, togglePlace, addPlace, pickCounts, blockedReason, entrantsFromPicks } from "@/lib/smart-builder/pick-entries";
import { isPlayerEligibleForCategory, validatePairComposition, COMPETITION_CATEGORIES, CATEGORY_LABELS, type CompetitionCategory } from "@/lib/leagues/category";
import { placeByLeague } from "@/lib/smart-builder/league-placement";
import { matchEntries, parseEntryCsv } from "@/lib/smart-builder/pick-import";
import { inferCategory } from "@/lib/leagues/category";
import { clearDraft, draftKey, migrateLegacy, tournamentKey } from "@/lib/smart-builder/step-storage";
import { ConflictPanel } from "./ConflictPanel";
import { resolveConflict, setupConflicts } from "@/lib/smart-builder/consistency";
import { SaveAsTemplateButton, TemplateReviewBanner } from "./StepTemplates";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2, Trophy, CalendarDays, Users, Tags, MapPin, UserPlus, ShieldCheck, Mail, Lightbulb, MessageSquare, Wallet } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrgHierarchyLite } from "@/hooks/use-tournament-eligibility";
import { useAssociationTenant } from "@/hooks/use-association-tenant";
import { StageCourtBookings } from "./StageCourtBookings";
import { tournamentMethodOptions, allowedMethods, type ClubPaymentConfig } from "@/lib/smart-builder/payment-options";
import { owningAssociation, federationRoot } from "@/lib/tournaments/eligibility";
import { drawPlanOf } from "@/lib/smart-builder/step-draw";
import { DOUBLES_SERVING_METHODS, type DoublesServingMethod } from "@/lib/marker/doubles-serving";
import { LIFECYCLE, loadHandover, loadLifecycle, persistStepTournament, saveHandover, saveLifecycle, type DeferredDecision, type EntrantMessage } from "@/lib/smart-builder/step-handover";

/**
 * Step by Step (Version 1): guided capture of organiser constraints only.
 * Picked players, eligibility and invite choices are captured here but nothing is sent or created.
 * Match scoring and playoff choices are planning-only; no draws, pools or scheduling here — answers are kept locally
 * per club so a future "Help me choose the format" step can read them.
 */
type Kind = "once_off" | "period" | null;
type PlayType = "singles" | "doubles" | "both" | null;
type MatchScoring = { mode: "standard" | "time_capped_points"; pointsPerGame: 11 | 15; bestOf: 3 | 5; winCondition: "win_by_2" | "sudden_death"; timeCapMinutes: string; timeCapPlay: string; timeCapBreak: string };
const DEFAULT_SCORING: MatchScoring = { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapMinutes: "", timeCapPlay: "", timeCapBreak: "" };
/** Slot time = playing time + break/changeover. Scheduling and capacity maths use the slot; playing time describes actual play. */
const slotMinutes = (s: MatchScoring) => {
  const play = Number(s.timeCapPlay);
  if (Number.isFinite(play) && play > 0) return play + (Number.isFinite(Number(s.timeCapBreak)) ? Math.max(0, Number(s.timeCapBreak) || 0) : 0);
  return Number.isFinite(Number(s.timeCapMinutes)) ? Number(s.timeCapMinutes) || 0 : 0; // legacy single field
};
const scoringText = (s: MatchScoring) => s.mode === "time_capped_points"
  ? `Time-capped / Bells${slotMinutes(s) > 0 ? ` · ${slotMinutes(s)} min slot per match` : " · time not set"}`
  : `Standard play · PAR ${s.pointsPerGame} · best of ${s.bestOf} · ${s.winCondition === "sudden_death" ? "sudden death" : "win by 2"}`;
type TimeWindow = { from: string; to: string };
type DayAvail = { date: string; venue: string; courts: string; courtIds?: string[]; windows: TimeWindow[] };
/** Planned competition format — provisional; revisited at "Confirm final format" once entries close. */
type CompKind = "pools" | "knockout" | "swiss" | "cross" | "later";
type FormatPlan = { kind: CompKind | null; pools: string; drawRounds: string; swissRounds: string; crossA: string; crossB: string; crossUnits?: string[]; crossMode?: "all" | "chosen" | "parent"; crossPairs?: [string, string][]; /** Knockout only: pace eliminations across the scheduling rounds, or play the field down normally. */ koPace?: "paced" | "immediate"; /** Knockout only: closer-ranked (progressive) or traditional seeded pairings. Admin can still edit every pairing. */ koPairing?: "progressive" | "traditional" };
const DEFAULT_FORMAT: FormatPlan = { kind: null, pools: "", drawRounds: "", swissRounds: "", crossA: "", crossB: "", crossUnits: [] };
/** Cross-league participants: the multi-select list, falling back to legacy two-group picks. */
const crossList = (f: FormatPlan): string[] => f.crossUnits?.length ? f.crossUnits : [f.crossA, f.crossB].filter(Boolean);
/** Provisional knockout bracket inferred from the expected entrant count (planning only). */
function bracketHint(n: number): string {
  if (n < 2) return "bracket inferred once expected entries are known";
  let size = 2; while (size < n) size *= 2;
  const names: Record<number, string> = { 2: "Final", 4: "Semifinal", 8: "Quarterfinal", 16: "Round of 16", 32: "Round of 32", 64: "Round of 64" };
  const rounds = Math.log2(size); const byes = size - n;
  return `draw of ${size}, ${rounds} round${rounds === 1 ? "" : "s"} from ${names[size] ?? `Round of ${size}`}${byes ? `, ${byes} bye${byes === 1 ? "" : "s"}` : ""}`;
}
const COMP_LABEL: Record<CompKind, string> = { pools: "Round Robin / Pools", knockout: "Knockout", swiss: "Swiss Pairing", cross: "Cross-League Round Robin", later: "Decide later" };
const COMP_DESC: Record<CompKind, string> = {
  pools: "Players are placed in a group/pool and play everyone else in that pool. If there are several pools, qualifiers may progress to later stages.",
  knockout: "Players/pairs are placed in a draw; a loss normally eliminates them from the main draw and winners continue to the next round.",
  swiss: "Everyone keeps playing for a set number of rounds; each new round pairs players with similar results instead of eliminating them after one loss.",
  cross: "Everyone in one selected league/group plays everyone in another selected league/group — not a normal round robin within their own group.",
  later: "Keep setting up without fixing a competition structure yet.",
};
type PlayoffChoice = "none" | "playoffs" | "later";
type PlayoffPlan = { choice: PlayoffChoice; rounds: 1 | 2 | 3; qualification: "later" | "top_pools" | "seeded"; pairing: "later" | "cross_pools" | "seeded"; style?: "later" | "championship" | "placement" };
const DEFAULT_PLAYOFF: PlayoffPlan = { choice: "later", rounds: 2, qualification: "later", pairing: "later", style: "later" };
const playoffText = (p: PlayoffPlan) => p.choice === "none" ? "No playoffs" : p.choice === "later" ? "Decide later" : p.rounds === 1 ? "Final only" : p.rounds === 2 ? "Semifinals + Final" : "Quarterfinals + Semifinals + Final";
const qualifierText = (p: PlayoffPlan) => p.qualification === "top_pools" ? "Top players/pairs from pools/standings" : p.qualification === "seeded" ? "Highest-ranked entrants" : "Qualification to be decided";
const pairingText = (p: PlayoffPlan) => p.pairing === "cross_pools" ? "Pool crossover: A1 vs B2, B1 vs A2" : p.pairing === "seeded" ? "Seeded: 1 vs 4, 2 vs 3 (highest vs lowest)" : "Pairing to be decided";
const styleText = (p: PlayoffPlan) => p.style === "placement" ? "Placement play (A1 v B1 for 1st/2nd, A2 v B2 for 3rd/4th…)" : p.style === "championship" ? "Championship playoffs" : "Playoff type to be decided";
const playoffDetail = (p: PlayoffPlan, k?: CompKind | null, koPath?: string) => {
  if (k === "knockout") return koPath && koPath.includes("→") ? koPath : "Knockout rounds (no separate playoffs)";
  if (p.choice !== "playoffs") return k === "swiss" && p.choice === "none" ? "Finish on Swiss standings" : k === "cross" && p.choice === "none" ? "Finish on standings" : playoffText(p);
  if (p.style === "placement" && (k === "pools" || k === "cross")) return styleText(p);
  return `${playoffText(p)}${k === "pools" || k === "cross" ? ` · ${styleText(p)}` : ""} · ${qualifierText(p)}${p.style !== "placement" ? ` · ${pairingText(p)}` : ""}`;
};
export type StepAnswers = {
  planId?: string;
  /** Set once "Complete setup & continue" created the tournament; later saves update it. */
  createdTournamentId?: string;
  /** Organiser-supplied WhatsApp group invite link (content in messages, not a delivery channel). */
  waGroup?: { use: boolean | null; url: string; include: boolean };
  /** After-match messages: maps 1:1 to the existing tournaments.result_notify_* settings. */
  afterMatch?: { on: boolean | null; scope: "all" | "playoffs"; channels: string[] };
  /** Draw notifications (opponents, partner, phone numbers, play-by date) — default on. */
  drawNotify?: boolean;
  kind: Kind;
  entries: string;
  playType: PlayType;
  /** Whole-tournament scoring, with optional category/subcategory overrides. Planning only. */
  scoring: MatchScoring | null;
  scoringOverrides: Record<string, MatchScoring>;
  categories: string[];
  /** Explicit main-category type; subcategories inherit. */
  categoryTypes?: Record<string, CompetitionCategory>;
  /** Optional subcategories per category name; missing/empty = no subcategories. */
  subcats: Record<string, string[]>;
  days: DayAvail[];
  /** Courts & Dates scheduling-slot estimates (minutes) — never scoring/time-cap rules. */
  scheduling?: { singles: string; doubles: string; rest: string; pace?: "fast" | "spread"; playoffStart?: { mode: "after" | "fixed"; gap?: string; date?: string; time?: string } };
  /** Courts & Dates court restrictions: unit key ("" = all), optional round/pool → allowed court ids. */
  courtRules?: Array<{ key: string; round: string; pool: string; courtIds: string[] }>;
  /** How players get in: organiser picks, self-entry, or both. */
  source: Source;
  /** Per category/subcategory ("Cat" or "Cat::Sub") eligibility + placement. */
  elig: Record<string, Elig>;
  /** Organiser-selected players → the events (category/subcategory keys) they enter. Legacy drafts hold one key string ("" = not placed). */
  picks: Record<string, string | string[]>;
  invite: Invite;
  /** Entry window (optional). Saved to tournaments.registration_opens_at/_closes_at; the close date fills {{closing_date}} in invites and blocks late entries. */
  entriesOpen?: string;
  entriesClose?: string;
  /** Discipline per unit key ("Cat" or "Cat::Sub"). Inherited from playType unless it is "both". */
  disc: Record<string, Disc>;
  /** Invitation message setup only — nothing is sent from this builder. */
  msg: MsgCfg;
  /** Doubles partner rule per doubles unit key. */
  partner: Record<string, Partner>;
  /** Whether one player may register their partner (where players choose partners). */
  doublesEntry: boolean | null;
  /** Admin-formed pairs per doubles unit key (only where the admin selects players and assigns partners). */
  pairs?: Record<string, [string, string][]>;
  fee: FeeCfg;
  /** Default and category/subcategory exceptions; guidance only, not a generated bracket. */
  playoff: PlayoffPlan;
  playoffOverrides: Record<string, PlayoffPlan>;
  /** Planned competition format (provisional) with category/subcategory overrides. */
  format: FormatPlan;
  formatOverrides: Record<string, FormatPlan>;
  /** Doubles serving method per doubles category/subcategory (unit key); saved to league_doubles_serving_methods. */
  serving?: Record<string, DoublesServingMethod>;
  /** Optional pools INSIDE each category/subcategory (unit key). A rule only — real pools are made from actual entrants at Generate draw. */
  poolPlan?: Record<string, PoolPlan>;
  /** Playoff qualification is independent of the pool-creation rule (legacy qualifiers in poolPlan remain readable). */
  playoffPoolQualifiers?: Record<string, PoolQualification>;
  /** Tie-break order after wins for every pool/round robin (absent = DEFAULT_TIE_BREAKS). Saved to the live spec. */
  tieBreaks?: TieBreakCriterion[];
  /** Provisional seeding with category/subcategory exceptions. */
  seeding: SeedMethod | null;
  seedingOverrides: Record<string, SeedMethod>;
  /** Club Champs (over a period) only. */
  name: string;
  periodStart: string;
  periodEnd: string;
  unitEntries: Record<string, string>;
  stages: ClubStage[];
  split: Record<string, ChampsSplit>;
  /** Club Champs: common playoff dates across categories (true) or per category (false); null = not chosen. */
  playoffSync: boolean | "later" | null;
  /** Event level / owner context (planning only). */
  scope: Scope | null;
  ownerName: string;
  syncCutoff: string;
};
type Partner = "players" | "admin" | "later";
const PARTNER_LABEL: Record<Partner, string> = { players: "Players choose their own partner", admin: "Administrator assigns partners", later: "Decide later" };
type FeeCfg = { has: boolean | null; amount: string; varies: boolean; perUnit: Record<string, string>; doublesBasis: "player" | "pair"; doublesCover: boolean | null; methods?: string[]; confirmNeedsPay?: boolean | null };
const DEFAULT_FEE: FeeCfg = { has: null, amount: "", varies: false, perUnit: {}, doublesBasis: "player", doublesCover: null };
const ruleAnswer = (value: boolean | null) => value === null ? "Decide later" : value ? "Yes" : "No";
type Channel = "in_app" | "email" | "whatsapp" | "sms";
type MsgCfg = { channels: Channel[]; body: string | null; later: boolean; notifyBody?: string | null };
const CHANNEL_LABEL: Record<Channel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const DEFAULT_MSG: MsgCfg = { channels: ["in_app", "email"], body: null, later: false };
type Disc = "singles" | "doubles";
type Source = "select" | "self" | "both" | null;
/** alsoPick: with "leagues", the organiser may additionally hand-pick players outside those leagues.
 *  alsoEveryone: with "leagues"/"manual", everyone may also self-enter; league members are auto-categorised, the organiser may override. */
type Elig = { mode: "everyone" | "leagues" | "manual"; leagueIds: string[]; placement: "auto" | "choose"; alsoPick?: boolean; alsoEveryone?: boolean };
type Invite = "all_eligible" | "leagues" | "selected" | "later" | null;
const DEFAULT_ELIG: Elig = { mode: "everyone", leagueIds: [], placement: "choose" };

/** Provisional seeding plan — nothing is generated or locked; revisited at the Final Format Review with actual entrants. */
type SeedMethod = "ranking" | "ladder" | "manual" | "random" | "none" | "later";
const SEED_LABEL: Record<SeedMethod, string> = { ranking: "Use rankings", ladder: "Use the club ladder", manual: "Manual seeds", random: "Random placement", none: "No seeding", later: "Decide later" };
const SEED_DESC: Record<SeedMethod, string> = {
  ranking: "Ranking matching the event level (club, regional or national) where available.",
  ladder: "Seed from your club ladder positions.",
  manual: "You set the seeds yourself.",
  random: "Players are placed by random draw.",
  none: "No seeds; placement without ranking.",
  later: "Keep going and decide seeding later.",
};
/** Club Champs stage scheduling (planning only): play by a deadline, or a scheduled session with its own courts. */
type StageMode = "play_by" | "scheduled" | "later";
type StagePhase = "main" | "playoff";
/** Who plays whom at a playoff stage — separate from the stage name and from scheduling. Planning only. */
type PlayoffPairing = "crossover" | "same_position" | "seeded" | "winners" | "later";
const PAIRING_LABEL: Record<PlayoffPairing, string> = {
  crossover: "Pool crossover: A1 vs B2, B1 vs A2",
  same_position: "Same position: A1 vs B1, A2 vs B2",
  seeded: "Seeded: 1 vs 4, 2 vs 3 (highest vs lowest; 1 vs 8, 2 vs 7… for 8)",
  winners: "Winners of the previous stage",
  later: "Pairing: decide later",
};
type ClubStage = { id: string; unit: string; name: string; mode: StageMode; deadline: string; date: string; from: string; to: string; courtIds: string[]; phase?: StagePhase; pairing?: PlayoffPairing; /** Playoffs: start automatically when the previous stage is complete, or wait for organiser confirmation. */ start?: "auto" | "confirm" };
const newStage = (name: string, mode: StageMode, unit = "", phase: StagePhase = "main"): ClubStage => ({ id: Math.random().toString(36).slice(2), unit, name, mode, deadline: "", date: "", from: "", to: "", courtIds: [], phase, ...(phase === "playoff" ? { pairing: "later" as PlayoffPairing } : {}) });
/** Playoff stages are fixed standard rounds — organisers pick, never type arbitrary names. */
const PLAYOFF_STAGE_NAMES = ["Quarterfinal", "Semifinal", "Final"] as const;
/** Pairing choices that make sense for this stage: "winners" only after an earlier playoff stage; pool pairings only for pool-style formats. */
function pairingOptions(s: ClubStage, playoffs: ClubStage[], kind: string): PlayoffPairing[] {
  const idx = PLAYOFF_STAGE_NAMES.indexOf(s.name as typeof PLAYOFF_STAGE_NAMES[number]);
  const hasEarlier = idx > 0 && playoffs.some((x) => x.id !== s.id && (x.unit === s.unit || !x.unit || !s.unit) && PLAYOFF_STAGE_NAMES.indexOf(x.name as typeof PLAYOFF_STAGE_NAMES[number]) > -1 && PLAYOFF_STAGE_NAMES.indexOf(x.name as typeof PLAYOFF_STAGE_NAMES[number]) < idx);
  const poolish = kind === "pools" || kind === "cross" || kind === "later";
  const out: PlayoffPairing[] = [];
  // Knockout: the first play-off stage takes the qualification survivors ("winners" of the pre-play-off knockout).
  if (hasEarlier || kind === "knockout") out.push("winners");
  if (poolish) out.push("crossover", "same_position");
  out.push("seeded", "later");
  return out;
}
const stageOk = (s: ClubStage) => !!s.name.trim() && (s.mode === "later" || (s.mode === "play_by" ? !!s.deadline : !!s.date && !!s.from && !!s.to && s.from < s.to && s.courtIds.length > 0));
/** Per category/subcategory: where main (qualifying) rounds end and the stage playoffs begin. Planning only. */
type PlayoffStart = "qf" | "sf" | "final" | "custom" | "none" | "later";
const START_LABEL: Record<PlayoffStart, string> = { qf: "Quarterfinals (8 remain)", sf: "Semifinals (4 remain)", final: "Final only (2 remain)", custom: "Custom stage", none: "No separate playoff phase (format decides the finish)", later: "Decide later" };
type Scope = "club" | "regional" | "national";
const SCOPE_LABEL: Record<Scope, string> = { club: "Club", regional: "Regional / Association", national: "National / Federation" };
const SCOPE_DESC: Record<Scope, string> = { club: "Run by your club.", regional: "Run by an association or region for its clubs and members.", national: "Run by the federation for associations, clubs and members." };
type ChampsSplit = { mainEnd: string; start: PlayoffStart; custom: string };
const DEFAULT_SPLIT: ChampsSplit = { mainEnd: "", start: "later", custom: "" };

const EMPTY: StepAnswers = { kind: null, entries: "", playType: null, scoring: null, scoringOverrides: {}, categories: [""], subcats: {}, days: [], source: null, elig: {}, picks: {}, invite: null, disc: {}, msg: DEFAULT_MSG, partner: {}, doublesEntry: null, fee: DEFAULT_FEE, playoff: DEFAULT_PLAYOFF, playoffOverrides: {}, format: DEFAULT_FORMAT, formatOverrides: {}, seeding: null, seedingOverrides: {}, name: "", periodStart: "", periodEnd: "", unitEntries: {}, stages: [], split: {}, playoffSync: null, syncCutoff: "", scope: null, ownerName: "" };
/** A blank setup must never overwrite what is saved on the tournament. */
const hasRealAnswers = (x: Partial<StepAnswers>) => !!(x.name?.trim() || (x.categories ?? []).some((c) => c?.trim()) || x.format?.kind || (x.stages ?? []).length);
type StepKey = "Type" | "Basics" | "Entries" | "ExpEntries" | "What" | "Match" | "Categories" | "Subcategories" | "Overrides" | "Format" | "Seeding" | "Partners" | "Players" | "Eligibility" | "Pick" | "Invites" | "Messaging" | "Fees" | "Dates" | "Courts" | "Split" | "Schedule" | "Playoffs" | "Summary";
const STEP_LABEL: Record<StepKey, string> = { Type: "Type", Basics: "Basics", Entries: "Entries", ExpEntries: "Expected entries", What: "What", Match: "Match format", Categories: "Categories", Subcategories: "Subcategories", Overrides: "Format overrides", Format: "Planned format", Seeding: "Seeding", Partners: "Doubles partners", Players: "How players join", Eligibility: "Who may enter", Pick: "Pick players", Invites: "Invitations", Messaging: "Messaging", Fees: "Fees & Payment", Dates: "Dates", Courts: "Courts", Split: "Main rounds & playoffs", Schedule: "Stages & scheduling", Playoffs: "Playoffs", Summary: "Summary" };
const SOURCE_LABEL: Record<Exclude<Source, null>, string> = { select: "I will select the players", self: "Players enter themselves", both: "Both — some picked, others enter" };
const INVITE_LABEL: Record<Exclude<Invite, null>, string> = { all_eligible: "All eligible members", leagues: "Players in the chosen leagues", selected: "Selected eligible members", later: "Decide / send later" };

const PLAY_LABEL: Record<Exclude<PlayType, null>, string> = { singles: "Singles", doubles: "Doubles", both: "Singles and Doubles" };

const fmtDay = (d: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "No date";

// Splits a date into a long weekday ("Friday") and "9 October" for the framed day header.
const dayParts = (d: string) => {
  if (!d) return { wd: "No date", rest: "" };
  const dt = new Date(d + "T00:00:00");
  return { wd: dt.toLocaleDateString(undefined, { weekday: "long" }), rest: dt.toLocaleDateString(undefined, { day: "numeric", month: "long" }) };
};

export function StepByStepBuilder({ clubId, clubName, onCompleted, initialStep, tournamentId }: { clubId: string; clubName?: string; onCompleted?: (tournamentId: string) => void; initialStep?: StepKey;
  /** Editing an existing tournament's setup. Absent = a NEW tournament (the club's unfinished draft only, never an existing tournament). */
  tournamentId?: string }) {
  const [key, setKey] = useState(() => { migrateLegacy(clubId); return tournamentId ? tournamentKey(tournamentId) : draftKey(clubId); });
  const normalise = (saved: Partial<StepAnswers> & { fee?: Partial<FeeCfg> & { doublesPay?: string } }): StepAnswers => {
      const legacy = saved.fee?.doublesPay;
      const doublesEntry = saved.doublesEntry !== undefined ? saved.doublesEntry : legacy === "later" || !legacy ? null : legacy !== "separate";
      const doublesCover = saved.fee?.doublesCover !== undefined ? saved.fee.doublesCover : legacy === "later" || !legacy ? null : legacy === "one_pays";
      const { doublesPay: _oldRule, ...savedFee } = saved.fee ?? {};
      return { ...EMPTY, ...saved, scoringOverrides: saved.scoringOverrides ?? {}, playoff: { ...DEFAULT_PLAYOFF, ...saved.playoff }, playoffOverrides: saved.playoffOverrides ?? {}, format: { ...DEFAULT_FORMAT, ...saved.format }, formatOverrides: saved.formatOverrides ?? {}, doublesEntry, fee: { ...DEFAULT_FEE, ...savedFee, doublesCover } } as StepAnswers;
  };
  /** True when this device already holds the plan for the tournament being edited. */
  const [hasLocalPlan] = useState(() => {
    if (!tournamentId) return true;
    // A blank local copy (nothing filled in) does not count — load the tournament's saved setup instead.
    try { const p = JSON.parse(localStorage.getItem(tournamentKey(tournamentId)) || "{}"); return p.createdTournamentId === tournamentId && hasRealAnswers(p); } catch { return false; }
  });
  const [a, setA] = useState<StepAnswers>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(tournamentId ? tournamentKey(tournamentId) : draftKey(clubId)) || "{}");
      // A new setup never carries a tournament identity; an edit only ever loads that exact tournament.
      return normalise((tournamentId ? (raw.createdTournamentId === tournamentId ? raw : { createdTournamentId: tournamentId }) : (raw.createdTournamentId ? {} : raw)) as any);
    } catch { return EMPTY; }
  });
  // Editing on a device without the plan: load the setup saved on the tournament (any device), never start blank.
  const [serverReady, setServerReady] = useState(hasLocalPlan);
  useEffect(() => {
    if (hasLocalPlan || !tournamentId) return;
    let live = true;
    (async () => {
      const [life, row] = await Promise.all([
        loadLifecycle(tournamentId).catch(() => null),
        fromExt("club_champs").select("name, start_date").eq("id", tournamentId).eq("club_id", clubId).maybeSingle().then((r: any) => r.data).catch(() => null),
      ]);
      if (!live) return;
      const saved = (life?.answers ?? null) as Partial<StepAnswers> | null;
      const fromServer = saved && hasRealAnswers(saved) ? saved : null;
      const fallback = { ...(life?.format_plan ?? {}), ...(row?.name ? { name: row.name } : {}), ...(row?.start_date ? { periodStart: row.start_date } : {}) } as Partial<StepAnswers>;
      setA((cur) => normalise({ ...cur, ...(fromServer ?? fallback), createdTournamentId: tournamentId } as any));
      setServerReady(true);
    })();
    return () => { live = false; };
  }, [hasLocalPlan, tournamentId, clubId]);
  // Editing on the device that holds the plan: push the answers to the tournament once,
  // so Edit works on every other device without needing a full re-save.
  useEffect(() => {
    if (!hasLocalPlan || !tournamentId || !hasRealAnswers(a)) return;
    (async () => {
      const cur = await loadLifecycle(tournamentId).catch(() => null);
      // Merge into the existing lifecycle — never drop stage/completed/inform etc.
      if (!cur) return;
      await saveLifecycle(tournamentId, { ...cur, answers: JSON.parse(JSON.stringify(a)) }).catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocalPlan, tournamentId]);
  const [step, setStep] = useState(0);
  /** Stable id for this device-local plan, used to make court reservations idempotent. */
  useEffect(() => { if (!a.planId) setA((x) => ({ ...x, planId: x.planId ?? (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) })); }, [a.planId]);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(a)); }, [a, key]);
  const [clubCourts, setClubCourts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from("courts").select("id, name").eq("club_id", clubId).eq("is_external", false).order("name")
      .then(({ data }) => setClubCourts((data ?? []).map((c) => ({ id: String(c.id), name: c.name }))));
  }, [clubId]);
  const [payCfg, setPayCfg] = useState<ClubPaymentConfig | null>(null);
  useEffect(() => {
    (async () => {
      const [c, sec] = await Promise.all([
        (supabase as any).from("clubs").select("accepted_payment_methods, payment_gateway").eq("id", clubId).maybeSingle(),
        (supabase as any).from("club_secrets").select("bank_name, bank_account_number").eq("club_id", clubId).maybeSingle(),
      ]);
      const gw = c.data?.payment_gateway ?? null;
      const GW: Record<string, string> = { payfast: "PayFast", yoco: "Yoco", peach: "Peach Payments", ozow: "Ozow", stitch: "Stitch", paystack: "Paystack", stripe: "Stripe", snapscan: "SnapScan" };
      setPayCfg({ accepted: c.data?.accepted_payment_methods ?? null, gateway: gw, gatewayLabel: gw ? GW[gw] ?? gw : null, eftConfigured: !!(sec.data?.bank_name || sec.data?.bank_account_number) });
    })().catch(() => setPayCfg({ accepted: null, gateway: null, eftConfigured: false }));
  }, [clubId]);
  const courtNames = (d: DayAvail) => clubCourts.filter((c) => d.courtIds?.includes(c.id)).map((c) => c.name).join(", ");

  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([]);
  const [leaguesByMember, setLeaguesByMember] = useState<Map<string, string[]>>(new Map());
  const [genderByMember, setGenderByMember] = useState<Map<string, string | null>>(new Map());
  const [memberSearch, setMemberSearch] = useState("");
  const [contacts, setContacts] = useState<Map<string, { email: string | null; phone: string | null }>>(new Map());
  const [importReport, setImportReport] = useState<{ added: number; problems: string[] } | null>(null);
  /** First player tapped while forming a pair, per doubles unit (UI-only). */
  const [pairDraft, setPairDraft] = useState<Record<string, string[]>>({});
  useEffect(() => {
    // Fetch every page: the backend caps each request at 1000 rows, so a single .limit() silently truncates.
    let cancelled = false;
    (async () => {
      const PAGE = 1000; const all: { id: string; name: string }[] = []; const genders = new Map<string, string | null>(); const contactMap = new Map<string, { email: string | null; phone: string | null }>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from("club_members").select("id, name, gender, email, phone").eq("club_id", clubId).eq("status", "active").neq("role", "visitor")
          .order("name").order("id").range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...(data as any[]).map((m) => ({ id: String(m.id), name: m.name || "Member" })));
        (data as any[]).forEach((m) => { genders.set(String(m.id), m.gender ?? null); contactMap.set(String(m.id), { email: m.email ?? null, phone: m.phone ?? null }); });
        if (data.length < PAGE) break;
      }
      if (!cancelled) { setMembers(all); setContacts(contactMap); }
      const ids = all.map((m) => m.id); const lm = new Map<string, string[]>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await (supabase as any).from("member_league_registrations").select("club_member_id, league_id").in("club_member_id", ids.slice(i, i + 200));
        ((data ?? []) as any[]).forEach((r) => { if (!r.league_id) return; const l = lm.get(r.club_member_id) ?? []; l.push(String(r.league_id)); lm.set(r.club_member_id, l); });
      }
      if (!cancelled) { setLeaguesByMember(lm); setGenderByMember(genders); }
    })();
    supabase.from("leagues").select("id, name").eq("club_id", clubId).is("archived_at", null).order("name")
      .then(({ data }) => setLeagues(((data ?? []) as any[]).map((l) => ({ id: String(l.id), name: l.name }))));
    return () => { cancelled = true; };
  }, [clubId]);

  const [phoneCh, setPhoneCh] = useState<{ whatsapp: boolean; sms: boolean }>({ whatsapp: false, sms: false });
  useEffect(() => {
    supabase.from("clubs").select("whatsapp_enabled, sms_enabled").eq("id", clubId).maybeSingle()
      .then(({ data }) => setPhoneCh({ whatsapp: !!(data as any)?.whatsapp_enabled, sms: !!(data as any)?.sms_enabled }));
  }, [clubId]);
  // Event owner is derived from the SquashHub federation tree — never typed.
  const { data: hierarchy, isLoading: hierLoading } = useOrgHierarchyLite();
  const assocTenant = useAssociationTenant(clubId);
  const ownerLoading = hierLoading;
  const derivedOwner: string | null = useMemo(() => {
    if (!a.scope) return null;
    if (a.scope === "club") return clubName || hierarchy?.clubNames.get(clubId) || null;
    if (!hierarchy) return null;
    const own = assocTenant.isAssociation ? assocTenant.orgId : hierarchy.orgs.find((o) => o.kind === "club" && o.club_id === clubId)?.id ?? null;
    if (a.scope === "regional") return owningAssociation(own, hierarchy.orgs, hierarchy.rels)?.name ?? null;
    return federationRoot(own, hierarchy.orgs, hierarchy.rels)?.name ?? null;
  }, [a.scope, clubId, clubName, hierarchy, assocTenant.isAssociation, assocTenant.orgId]);
  useEffect(() => {
    if (a.scope && (a.ownerName ?? "") !== (derivedOwner ?? "")) setA((prev) => ({ ...prev, ownerName: derivedOwner ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedOwner, a.scope]);
  const chAvail = (c: Channel) => c === "in_app" || c === "email" || phoneCh[c];
  const msg: MsgCfg = { ...DEFAULT_MSG, ...(a.msg ?? {}) };
  const setMsg = (p: Partial<MsgCfg>) => setA({ ...a, msg: { ...msg, ...p } });

  const cats = a.categories.map((c) => c.trim()).filter(Boolean);
  /** Every place a player can end up: a subcategory, or the category itself when it has none. */
  const units = cats.flatMap((c) => {
    const subs = (a.subcats[c] ?? []).map((x) => x.trim()).filter(Boolean);
    return subs.length ? subs.map((x) => ({ key: `${c}::${x}`, base: `${c} › ${x}` })) : [{ key: c, base: c }];
  }).map((u) => {
    const d: Disc | null = a.playType === "singles" || a.playType === "doubles" ? a.playType : (a.disc[u.key] ?? null);
    const catName = u.key.split("::")[0].trim().toLowerCase();
    const categoryType = a.categoryTypes?.[u.key.split("::")[0]]
      ?? Object.entries(a.categoryTypes ?? {}).find(([k]) => k.trim().toLowerCase() === catName)?.[1]
      ?? null;
    return { ...u, categoryType, disc: d, label: `${u.base} · ${d ? PLAY_LABEL[d] : "Singles or Doubles?"}` };
  });
  const unitBase = (k: string) => units.find((u) => u.key === k)?.base ?? k;
  const poolRule = (k: string): PoolPlan => poolPlanOf(a, k) ?? { mode: "none" };
  const setPoolRule = (k: string, patch: Partial<PoolPlan>) => setA((prev) => ({ ...prev, poolPlan: { ...(prev.poolPlan ?? {}), [k]: { ...poolPlanOf(prev, k), ...patch } as PoolPlan } }));
  const poolQualification = (k: string) => poolQualificationOf(a, k);
  const setPoolQualification = (k: string, patch: Partial<PoolQualification>) => setA((prev) => ({ ...prev, playoffPoolQualifiers: { ...(prev.playoffPoolQualifiers ?? {}), [k]: { ...poolQualificationOf(prev, k), ...patch } } }));
  const poolControl = (u: (typeof units)[number]) => {
    const pp = poolRule(u.key);
    const exp = Number(a.unitEntries?.[u.key]) || 0;
    const rec = pp.mode === "auto" && exp ? recommendPools(exp, Number(pp.target) || 5) : [];
    return <div className="space-y-2 text-xs" aria-label={`Pool structure for ${u.base}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Create pools?</span>
        {(["auto", "none", "later"] as PoolMode[]).map((m) => <Button key={m} type="button" size="sm" variant={pp.mode === m ? "default" : "outline"} aria-pressed={pp.mode === m} onClick={() => setPoolRule(u.key, { mode: m })}>{m === "auto" ? "Yes" : m === "none" ? "No" : "Decide after entries close"}</Button>)}
      </div>
      {pp.mode === "auto" && <label className="flex flex-wrap items-center gap-2"><span>Preferred pool size</span><Input type="number" min={2} className="h-7 w-20" aria-label={`Preferred pool size for ${u.base}`} value={pp.target ?? "5"} onChange={(e) => setPoolRule(u.key, { target: e.target.value })} />
        <span className="text-muted-foreground">Balanced from actual entries{rec.length ? ` · with ${exp} expected: ${rec.length > 1 ? `${rec.length} pools (${rec.join(", ")})` : "one group"}` : ""}</span></label>}
      {pp.mode === "later" && <p className="text-muted-foreground">Review and accept the actual pools before generating fixtures.</p>}
      {pp.mode !== "none" && formatFor(u.key).kind === "knockout" && <p className="text-muted-foreground">Knockout inside each pool: losers are eliminated within their pool until it reaches its qualifiers, then the play-offs take over. No round robin is played.</p>}
      {pp.mode !== "none" && formatFor(u.key).kind === "swiss" && <p className="text-destructive">Swiss pairs the whole field by results, so it can't run inside pools. Turn pools off or change the planned format.</p>}
    </div>;
  };
  const setDisc = (k: string, d: Disc) => setA({ ...a, disc: { ...a.disc, [k]: d } });
  const setPlayType = (p: Exclude<PlayType, null>) => {
    if (p === "both") { setA({ ...a, playType: p }); return; }
    const disc: Record<string, Disc> = {};
    units.forEach((u) => { disc[u.key] = p; });
    setA({ ...a, playType: p, disc });
  };
  const dblUnits = units.filter((u) => u.disc === "doubles");
  const isBellsUnit = (k: string) => { const sc = a.scoringOverrides?.[k] ?? a.scoringOverrides?.[k.split("::")[0]] ?? a.scoring; return sc?.mode === "time_capped_points"; };
  const scoring = a.scoring ? { ...DEFAULT_SCORING, ...a.scoring } : null;
  const scoringFor = (key: string) => a.scoringOverrides?.[key] ?? a.scoringOverrides?.[key.split("::")[0]] ?? scoring;
  const scoringOk = (s: MatchScoring | null) => !!s && (s.mode === "standard" || slotMinutes(s) > 0);
  const setScoring = (patch: Partial<MatchScoring>) => setA({ ...a, scoring: { ...(scoring ?? DEFAULT_SCORING), ...patch } });
  const setScoringOverride = (key: string, patch: Partial<MatchScoring> | null) => {
    const next = { ...(a.scoringOverrides ?? {}) };
    if (patch === null) delete next[key]; else next[key] = { ...(next[key] ?? scoringFor(key) ?? DEFAULT_SCORING), ...patch };
    setA({ ...a, scoringOverrides: next });
  };
  const validOverrides = units.filter((u) => scoring && scoringFor(u.key) && scoringText(scoringFor(u.key) ?? scoring) !== scoringText(scoring));
  const playoff = { ...DEFAULT_PLAYOFF, ...a.playoff };
  const playoffFor = (key: string): PlayoffPlan => a.playoffOverrides?.[key] ?? a.playoffOverrides?.[key.split("::")[0]] ?? playoff;
  const setPlayoff = (patch: Partial<PlayoffPlan>) => setA({ ...a, playoff: { ...playoff, ...patch } });
  const setPlayoffOverride = (key: string, patch: Partial<PlayoffPlan> | null) => {
    const next = { ...(a.playoffOverrides ?? {}) };
    if (patch === null) delete next[key]; else next[key] = { ...playoffFor(key), ...patch };
    setA({ ...a, playoffOverrides: next });
  };
  const format: FormatPlan = { ...DEFAULT_FORMAT, ...a.format };
  const formatFor = (key: string): FormatPlan => a.formatOverrides?.[key] ?? a.formatOverrides?.[key.split("::")[0]] ?? format;
  const setFormat = (patch: Partial<FormatPlan>) => setA({ ...a, format: { ...format, ...patch } });
  const setFormatOverride = (key: string, patch: Partial<FormatPlan> | null) => {
    const next = { ...(a.formatOverrides ?? {}) };
    if (patch === null) delete next[key]; else next[key] = { ...formatFor(key), ...patch };
    setA({ ...a, formatOverrides: next });
  };
  const formatDetail = (f: FormatPlan) => {
    if (!f.kind) return "Not chosen";
    const extra = f.kind === "knockout" ? (units.some((u) => (poolPlanOf(a, u.key)?.mode ?? "none") !== "none") ? " · elimination inside pools where pools are set, down to each pool's qualifiers, then play-offs" : " · bracket from expected entries") : f.kind === "swiss" && f.swissRounds ? ` · about ${f.swissRounds} rounds` : f.kind === "cross" ? ` · ${f.crossMode === "parent" ? "between subcategories of the same category only" : f.crossMode === "chosen" ? (f.crossPairs?.length ? `only ${f.crossPairs.map(([x, y]) => `${unitBase(x)} v ${unitBase(y)}`).join(", ")}` : "pairings not chosen") : crossList(f).length >= 2 ? `across ${crossList(f).map(unitBase).join(", ")} (all play each other)` : "participating groups not chosen"}` : f.kind === "pools" ? " · pools per category/subcategory decided later" : "";
    return `${COMP_LABEL[f.kind]}${extra} (planned)`;
  };
  const formatExceptions = units.filter((u) => formatDetail(formatFor(u.key)) !== formatDetail(format));
  const formatOk = (f: FormatPlan) => f.kind !== null;
  /** Playoffs only apply where the planned format is not already a knockout. */
  /** Actual configured knockout path, e.g. "Pool knockout → Semifinal → Final" (never assumes Quarterfinals). */
  const koPath = (key: string) => configuredPathText(a as any, key, (poolPlanOf(a, key)?.mode ?? "none") !== "none" ? "Pool knockout" : "Knockout rounds");
  const playoffActive = (key: string) => playoffFor(key).choice === "playoffs" && formatFor(key).kind !== "knockout";
  const playoffExceptions = units.filter((u) => playoffDetail(playoffFor(u.key), formatFor(u.key).kind, koPath(u.key)) !== playoffDetail(playoff, format.kind));
  const partnerOf = (k: string): Partner | null => a.partner?.[k] ?? null;
  const fee: FeeCfg = { ...DEFAULT_FEE, ...(a.fee ?? {}) };
  const setFee = (p: Partial<FeeCfg>) => setA({ ...a, fee: { ...fee, ...p } });
  const feeFor = (k: string) => (fee.varies ? fee.perUnit[k] ?? "" : fee.amount);
  // Keep the saved tournament's "A player may pay for both partners" answer in step with the builder, so the
  // partner-payment buttons the players see always match what the messages promise (not only after Complete Setup).
  const partnerPayAnswer: boolean | undefined = fee.has && dblUnits.length > 0 && fee.doublesCover !== null ? fee.doublesCover : undefined;
  useEffect(() => {
    const tid = a.createdTournamentId;
    if (!tid || partnerPayAnswer === undefined) return;
    (async () => {
      const cur = await loadLifecycle(tid).catch(() => null);
      if (!cur || cur.partner_pay === partnerPayAnswer) return;
      await saveLifecycle(tid, { ...cur, partner_pay: partnerPayAnswer }).catch(() => undefined);
    })();
  }, [a.createdTournamentId, partnerPayAnswer]);
  // Keep the full setup on the tournament so "Edit setup" shows the same answers on every device.
  const answersJson = JSON.stringify(a);
  useEffect(() => {
    const tid = a.createdTournamentId;
    if (!tid || !serverReady || !hasRealAnswers(a)) return;
    const t = setTimeout(async () => {
      const cur = await loadLifecycle(tid).catch(() => null);
      if (!cur?.stage || JSON.stringify(cur.answers ?? null) === answersJson) return;
      await saveLifecycle(tid, { ...cur, answers: JSON.parse(answersJson) }).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [a.createdTournamentId, answersJson, serverReady]);
  // Save the draw-relevant setup (format incl. within/between/custom matchups, seeding, stages) on the tournament so
  // Generate draw & fixtures uses it on any device.
  const drawPlanJson = JSON.stringify(drawPlanOf(a as any));
  useEffect(() => {
    const tid = a.createdTournamentId;
    if (!tid || !serverReady || !hasRealAnswers(a)) return;
    const t = setTimeout(async () => {
      const cur = await loadLifecycle(tid).catch(() => null);
      if (!cur?.stage || JSON.stringify(cur.format_plan ?? null) === drawPlanJson) return;
      await saveLifecycle(tid, { ...cur, format_plan: JSON.parse(drawPlanJson) }).catch(() => undefined);
      // Each fixed stage schedules only on its OWN courts/window: re-slot games a setup change made invalid.
      try {
        for (const r of await reconcileFixedStages(tid)) {
          if (r.overflow.length) toast.error(`${r.label}: ${r.required} games need a slot but only ${r.available} fit on its selected courts — widen the time window or add courts.`);
          else toast.success(`${r.label} re-scheduled on its selected courts.`);
        }
        const tr = await scheduleTimedRounds(tid);
        if (tr?.issues.length) toast.error(tr.issues[0]);
        else if (tr?.scheduled) toast.success(`${tr.scheduled} games given times and courts.`);
      } catch { /* scheduling retried on next save/confirm */ }
      // Tie-break rules also apply to an already-generated draw (only stages not yet created are affected).
      await saveTieBreakRules(supabaseDb, tid, normaliseTieBreaks(JSON.parse(drawPlanJson).tieBreaks), (fn) => atomically(supabaseDb, tid, commitStructured, fn)).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [a.createdTournamentId, drawPlanJson]);
  const feeUnitText = (u: { key: string; disc: Disc | null }) => `R${feeFor(u.key) || "?"} ${u.disc === "doubles" && fee.doublesBasis === "pair" ? "per pair" : "per player"}`;
  const methodOpts = payCfg ? tournamentMethodOptions(payCfg) : [];
  const availMethods = methodOpts.filter((o) => o.available);
  /** One possible method = nothing to choose; it is simply the accepted method. */
  const chosenMethods = availMethods.length === 1 ? [availMethods[0].key] : allowedMethods(fee.methods, methodOpts);
  const bankingMissing = !!payCfg && !methodOpts.some((o) => o.available && o.key !== "account");
  const methodText = chosenMethods.map((m) => methodOpts.find((o) => o.key === m)?.label.split(" (")[0].split(" —")[0] ?? m).join(", ") || "none chosen";
  /** What a picked entrant owes, worded for the notification (pair-aware). */
  const dueText = (u?: { key: string; disc: Disc | null }) => {
    if (!fee.has || !u) return "";
    const amt = feeFor(u.key) || "?";
    if (u.disc === "doubles" && fee.doublesBasis === "pair") return `R${amt} for your pair${fee.doublesCover ? " (either partner can pay for both)" : ""}`;
    if (u.disc === "doubles" && fee.doublesCover) return `R${amt} each (you may pay R${Number(amt) * 2 || "?"} for both of you)`;
    return `R${amt}`;
  };
  const feeSummary = fee.has === null ? "Not chosen" : !fee.has ? "No entry fee" : fee.varies ? "Varies by category" : `R${fee.amount || "?"}`;
  const discOk = units.every((u) => u.disc !== null);
  const unitLabel = (k: string) => units.find((u) => u.key === k)?.label ?? "Not placed yet";
  const eligOf = (k: string): Elig => a.elig[k] ?? DEFAULT_ELIG;
  const setElig = (k: string, p: Partial<Elig>) => setA({ ...a, elig: { ...a.elig, [k]: { ...eligOf(k), ...p } } });
  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? "League";
  // Eligibility = gender category +, when the event is scoped to leagues, actual
  // league registration. A 7th-league player can never tick the 6th-league event.
  const fits = (id: string, key: string) => {
    const cat = units.find((u) => u.key === key)?.categoryType;
    if (!isPlayerEligibleForCategory(genderByMember.get(id), cat)) return false;
    const e = eligOf(key);
    if (e.alsoEveryone) return true; // Everyone may enter; leagues only guide auto-categorisation.
    if (e.mode === "leagues" && e.leagueIds.length > 0) {
      const memberLeagues = leaguesByMember.get(id) ?? [];
      if (memberLeagues.some((l) => e.leagueIds.includes(l))) return true;
      // Open/mixed event scoped to one gender's leagues (e.g. Mens A = men's 1st–4th):
      // the league scope ranks that gender only; players of the other gender may still enter.
      if (cat === "open" || cat === "mixed") {
        const g = String(genderByMember.get(id) ?? "").toLowerCase();
        const pg = /^(f|female|ladies|lady|women|woman)$/.test(g) ? "ladies" : /^(m|male|men|man|mens)$/.test(g) ? "mens" : null;
        const scopeGenders = new Set(e.leagueIds.map((l) => inferCategory(leagueName(l))));
        if (pg && !scopeGenders.has(pg) && !scopeGenders.has("open") && !scopeGenders.has("mixed") && !scopeGenders.has(null)) return true;
      }
      return false;
    }
    return true;
  };
  const autoPlace = (id: string) => placeByLeague({ memberId: id, units, eligOf, leaguesByMember, genderByMember });
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Member";
  const pickIds = Object.keys(a.picks);
  /** Import an entry-form CSV: tick matched members and place them per entered event; never creates people. */
  const importEntries = async (file: File) => {
    const rows = parseEntryCsv(await file.text());
    const matches = matchEntries(rows, members.map((m) => ({ ...m, ...contacts.get(m.id) })));
    let next = { ...a.picks }; let added = 0; const problems: string[] = [];
    for (const mt of matches) {
      if (!mt.memberId) { problems.push(`${mt.row.name || mt.row.email}: ${mt.reason}`); continue; }
      const id = mt.memberId;
      if (!(id in next)) { next[id] = []; added++; }
      for (const ev of mt.row.events) {
        const cands = units.filter((u) => (u.categoryType ?? inferCategory(u.base)) === ev || (!u.categoryType && !inferCategory(u.base) && units.length === 1));
        const ok = cands.filter((u) => fits(id, u.key));
        if (cands.length && !ok.length) { problems.push(`${memberName(id)}: not eligible for ${ev === "ladies" ? "Ladies" : ev === "mens" ? "Mens" : ev} (check gender/league)`); continue; }
        const auto = autoPlace(id);
        const key = ok.length === 1 ? ok[0].key : ok.find((u) => u.key === auto)?.key;
        if (key) next = addPlace(next, id, key, singleEvent);
        else if (ok.length > 1) problems.push(`${memberName(id)}: added — choose which ${ev === "ladies" ? "Ladies" : "Mens"} group`);
      }
    }
    setA({ ...a, picks: next });
    setImportReport({ added, problems });
  };
  const placesFor = (id: string) => placesOf(a.picks, id);
  const inUnit = (id: string, k: string) => placesFor(id).includes(k);
  /** Bells/time-capped: every event plays at the same time, so a person can enter only one. */
  const singleEvent = units.length > 0 && units.every((u) => (scoringFor(u.key) ?? scoring)?.mode === "time_capped_points");
  const counts = pickCounts(a.picks);
  const anyManual = units.some((u) => eligOf(u.key).mode === "manual" || (eligOf(u.key).mode === "leagues" && !!eligOf(u.key).alsoPick));
  const selfEntry = a.source === "self" || a.source === "both";
  const showPick = a.source === "select" || a.source === "both" || anyManual;
  /** Admin selects AND assigns partners: pairing happens on the Pick step itself. */
  const adminPairUnits = showPick ? dblUnits.filter((u) => partnerOf(u.key) === "admin") : [];
  const adminPairKeys = new Set(adminPairUnits.map((u) => u.key));
  const pairMode = adminPairUnits.length > 0;
  /** Only pairs whose both players are still picked into that group count. */
  const pairsFor = (k: string): [string, string][] => (a.pairs?.[k] ?? []).filter(([x, y]) => inUnit(x, k) && inUnit(y, k));
  const unpairedIn = (k: string) => { const used = new Set(pairsFor(k).flat()); return pickIds.filter((id) => inUnit(id, k) && !used.has(id)); };
  const setPairs = (k: string, p: [string, string][]) => setA({ ...a, pairs: { ...(a.pairs ?? {}), [k]: p } });
  /** Competitive entries: a pair counts once in admin-paired doubles groups. */
  const entryCount = pickIds.reduce((n, id) => n + placesFor(id).filter((k) => !adminPairKeys.has(k)).length, 0) + adminPairUnits.reduce((n, u) => n + pairsFor(u.key).length + unpairedIn(u.key).length, 0);

  /** Admin picks everyone (no self-entry): players are notified, not invited. */
  const notifyOnly = !selfEntry && showPick;
  const defaultMsg = notifyOnly ? [
    "Hi {{first_name}},",
    "You have been entered into {{tournament_name}} at {{club_name}}.",
    "Category: {{category}}",
    ...(pairMode ? ["Your doubles partner: {{partner_name}}"] : []),
    ...(fee.has ? ["Status: Entered · Payment outstanding", "Amount due: {{amount_due}}", "Pay now: {{pay_link}}"] : ["Status: Entered"]),
    a.kind === "period" ? "Championship dates: {{dates}}" : "Tournament days: {{dates}}",
    "We'll be in touch with fixtures and updates.",
  ].join("\n\n") : [
    "Hi {{first_name}},",
    "You are invited to enter {{tournament_name}} at {{club_name}}.",
    "Categories in this tournament are: {{categories}}.",
    "Enter here: {{entry_link}}",
    "Entries close: {{closing_date}}",
    a.kind === "period" ? "Championship dates: {{dates}}" : "Tournament days: {{dates}}",
  ].join("\n\n");
  /** Notification wording is stored apart from invitation wording so switching modes never mixes them. */
  const storedBody = notifyOnly ? (msg.notifyBody ?? null) : msg.body;
  const msgBody = storedBody ?? defaultMsg;
  const msgLater = msg.later || (!notifyOnly && a.invite === "later");
  const firstPair = adminPairUnits.map((u) => ({ u, p: pairsFor(u.key)[0] })).find((x) => x.p);
  const previewVars: Record<string, string> = {
    first_name: firstPair ? (memberName(firstPair.p![0]).split(" ")[0] || "Jane") : "Jane",
    tournament_name: a.name?.trim() || "your tournament (name added when created)",
    club_name: clubName || "your club",
    categories: units.map((u) => u.label).join(", ") || "categories still to be set",
    category: firstPair ? firstPair.u.label : units[0]?.label || "[their category]",
    amount_due: dueText(firstPair ? firstPair.u : units[0]) || "[set in Fees & Payment]",
    pay_link: chosenMethods.length ? `tap the Pay button on this message, or open the tournament in SquashHub (${methodText})` : "[choose accepted payment methods in Fees & Payment]",
    partner_name: firstPair ? memberName(firstPair.p![1]) : "[assigned partner]",
    entry_link: "[entry link added when the tournament is created]",
    closing_date: a.entriesClose ? fmtDay(a.entriesClose) : "[set later]",
    dates: a.kind === "period" ? (a.periodStart ? `from ${fmtDay(a.periodStart)}, running until the last planned stage` : "[start date set in Basics]") : a.days.filter((d) => d.date).map((d) => fmtDay(d.date)).join(", ") || "[set in the Dates step]",
  };
  const wa = a.waGroup ?? { use: null, url: "", include: true };
  const waUrl = wa.use ? normaliseGroupInviteUrl(wa.url) : null;
  const waOk = wa.use !== true || !!waUrl;
  const am = a.afterMatch ?? { on: null, scope: "all" as const, channels: ["in_app"] };
  const setAm = (p: Partial<typeof am>) => setA((prev) => ({ ...prev, afterMatch: { ...am, ...(prev.afterMatch ?? {}), ...p } }));
  const waLine = waUrl && wa.include ? `\n\nJoin the tournament WhatsApp group: ${waUrl}` : "";
  const setWa = (p: Partial<typeof wa>) => setA((prev) => ({ ...prev, waGroup: { ...wa, ...(prev.waGroup ?? {}), ...p } }));
  const previewBase = msgBody.replace(/{{\s*([a-z_]+)\s*}}/g, (m, k) => previewVars[k] ?? m);
  const preview = previewBase + waLine;
  const msgSummary = msgLater ? "Configure later" : `${msg.channels.filter(chAvail).map((c) => CHANNEL_LABEL[c]).join(", ") || "No channel"} · ${storedBody === null ? "suggested wording" : "custom wording"}`;
  const isChamps = a.kind === "period";
  const seedFor = (k: string): SeedMethod | null => a.seedingOverrides?.[k] ?? a.seedingOverrides?.[k.split("::")[0]] ?? a.seeding;
  const seedExceptions = units.filter((u) => seedFor(u.key) !== a.seeding);
  const stages = a.stages ?? [];
  const setStages = (s: ClubStage[]) => setA({ ...a, stages: s });
  const updStage = (id: string, p: Partial<ClubStage>) => setStages(stages.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const stageUnit = (k: string) => (k ? unitBase(k) : "All categories");
  const stageWhen = (s: ClubStage) => s.mode === "later" ? "Decide later" : s.mode === "play_by" ? `Play by ${s.deadline ? fmtDay(s.deadline) : "(deadline not set)"}` : `Scheduled ${s.date ? fmtDay(s.date) : "(date not set)"} ${s.from || "?"}–${s.to || "?"} · ${clubCourts.filter((c) => s.courtIds.includes(c.id)).map((c) => c.name).join(", ") || "no courts"}`;
  const splitOf = (k: string): ChampsSplit => ({ ...DEFAULT_SPLIT, ...(a.split?.[k] ?? {}) });
  const champsEnd = (() => { const ds = (a.stages ?? []).map((x) => x.mode === "scheduled" ? x.date : x.mode === "play_by" ? x.deadline : "").filter(Boolean).sort(); return ds.length ? ds[ds.length - 1] : ""; })();
  const periodText = `${fmtDay(a.periodStart)} – ${champsEnd ? fmtDay(champsEnd) : "ends with the final"}`;
  const mainStages = stages.filter((s) => (s.phase ?? "main") === "main");
  const playoffStages = stages.filter((s) => s.phase === "playoff");
  const suggestStages = () => {
    const main = [newStage("Round 1", "play_by", "", "main"), newStage("Round 2", "play_by", "", "main")];
    const startOf = (k: string): PlayoffStart => { const n = Number(a.unitEntries?.[k]) || 0; return n >= 8 ? "qf" : n >= 4 ? "sf" : n >= 2 ? "final" : "later"; };
    const starts = units.map((u) => startOf(u.key));
    const names = [...(starts.includes("qf") ? ["Quarterfinals"] : []), ...(starts.some((s) => s === "qf" || s === "sf") ? ["Semifinals"] : []), ...(starts.some((s) => s !== "none") ? ["Final"] : [])];
    const po = a.playoffSync === true
      ? names.map((n) => newStage(n, "later", "", "playoff"))
      : units.flatMap((u) => { const s = startOf(u.key); const own = s === "qf" ? ["Quarterfinals", "Semifinals", "Final"] : s === "sf" ? ["Semifinals", "Final"] : s === "final" ? ["Final"] : s === "custom" || s === "later" ? ["Playoffs"] : []; return own.map((n) => newStage(n, "later", u.key, "playoff")); });
    setStages([...main, ...po]);
  };
  /** Removing a stage never deletes games: a live tournament with played games in that stage blocks the removal. */
  const removeStage = async (s: ClubStage) => {
    if (tournamentId && s.phase === "playoff") {
      const { data } = await fromExt("club_champs_matches").select("id, stage_label, status, winner_member_id").eq("champ_id", tournamentId);
      const base = s.name.toLowerCase().replace(/s$/, "");
      const played = ((data ?? []) as any[]).filter((m) => String(m.stage_label ?? "").toLowerCase().replace(/-/g, "").includes(base.replace(/-/g, "")) && (m.status === "completed" || m.winner_member_id));
      if (played.length) { toast.error(`${s.name} already has ${played.length} played game(s) — it can't be removed. Results are kept.`); return; }
    }
    setStages(stages.filter((x) => x.id !== s.id));
  };
  const renderStage = (s: ClubStage) => (
    <div key={s.id} className={cn("space-y-2 rounded-lg border p-3", s.phase === "playoff" ? "border-primary/50" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.phase === "playoff" ? "bg-primary text-primary-foreground" : "bg-muted")}>{s.phase === "playoff" ? "Playoff" : "Main round"}</span>
        <select aria-label="Stage applies to" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={s.unit} onChange={(e) => updStage(s.id, { unit: e.target.value })}>
          <option value="">{s.phase === "playoff" && a.playoffSync === true ? "All categories (common date)" : "All categories"}</option>
          {units.map((u) => <option key={u.key} value={u.key}>{u.base}</option>)}
        </select>
        {s.phase === "playoff" ? (
          <select aria-label="Playoff stage" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={s.name} onChange={(e) => updStage(s.id, { name: e.target.value })}>
            {s.name && !(PLAYOFF_STAGE_NAMES as readonly string[]).includes(s.name) && <option value={s.name}>{s.name}</option>}
            {PLAYOFF_STAGE_NAMES.map((n) => {
              const taken = playoffStages.some((x) => x.id !== s.id && x.unit === s.unit && x.name === n);
              return <option key={n} value={n} disabled={taken}>{n}{taken ? " (already planned)" : ""}</option>;
            })}
          </select>
        ) : (
          <Input aria-label="Stage name" className="max-w-[200px]" value={s.name} onChange={(e) => updStage(s.id, { name: e.target.value })} placeholder="e.g. Round 1" />
        )}
        {s.phase === "playoff" && (() => {
          const opts = pairingOptions(s, playoffStages, s.unit ? formatFor(s.unit).kind : format.kind);
          const cur = s.pairing ?? "later";
          return <select aria-label="Pairing / format" title="Who plays whom at this stage" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={cur} onChange={(e) => updStage(s.id, { pairing: e.target.value as PlayoffPairing })}>
            {!opts.includes(cur) && <option value={cur}>{PAIRING_LABEL[cur]}</option>}
            {opts.map((p) => <option key={p} value={p}>{PAIRING_LABEL[p]}</option>)}
          </select>;
        })()}
        <Button variant="ghost" size="icon" aria-label="Remove stage" onClick={() => void removeStage(s)}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {s.phase === "playoff" && <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Start this stage">
        <span className="text-xs font-medium">Start this stage</span>
        {(["auto", "confirm"] as const).map((v) => <Button key={v} type="button" size="sm" role="radio" aria-checked={(s.start ?? "confirm") === v} variant={(s.start ?? "confirm") === v ? "default" : "outline"} onClick={() => updStage(s.id, { start: v })}>{v === "auto" ? "Automatically when previous stage is complete" : "Wait for organiser confirmation"}</Button>)}
      </div>}
      <div className="flex flex-wrap gap-2">
        {(["play_by", "scheduled", "later"] as const).map((m) => <Button key={m} type="button" size="sm" variant={s.mode === m ? "default" : "outline"} aria-pressed={s.mode === m} onClick={() => updStage(s.id, { mode: m })}>{m === "play_by" ? "Play by a date" : m === "scheduled" ? "Play on scheduled date/time" : "Decide later"}</Button>)}
      </div>
      {s.mode === "play_by" && <div className="max-w-[220px] space-y-1"><Label>Deadline</Label><Input type="date" aria-label="Play-by deadline" value={s.deadline} onChange={(e) => updStage(s.id, { deadline: e.target.value })} /></div>}
      {s.mode === "scheduled" && <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label>Date</Label><Input type="date" aria-label="Scheduled date" value={s.date} onChange={(e) => updStage(s.id, { date: e.target.value })} /></div>
          <div className="space-y-1"><Label>From</Label><Input type="time" step={300} aria-label="Session from" value={s.from} onChange={(e) => updStage(s.id, { from: e.target.value })} /></div>
          <div className="space-y-1"><Label>To</Label><Input type="time" step={300} aria-label="Session to" value={s.to} onChange={(e) => updStage(s.id, { to: e.target.value })} /></div>
        </div>
        <Label>{s.phase === "playoff" && a.playoffSync === true && !s.unit ? "Courts reserved centrally for this date" : "Courts for this stage"}</Label>
        {clubCourts.length === 0 ? <p className="text-xs text-muted-foreground">No club courts found.</p> : <div className="flex flex-wrap gap-1.5">{clubCourts.map((c) => {
          const on = s.courtIds.includes(c.id);
          return <button key={c.id} type="button" aria-pressed={on} onClick={() => updStage(s.id, { courtIds: on ? s.courtIds.filter((x) => x !== c.id) : [...s.courtIds, c.id] })} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>{c.name}</button>;
        })}</div>}
      </div>}
      {(a.periodStart && ((s.mode === "play_by" && s.deadline && s.deadline < a.periodStart) || (s.mode === "scheduled" && s.date && s.date < a.periodStart))) && <p className="text-xs text-muted-foreground">Note: this date is before the championship start.</p>}
    </div>
  );
  const unitEntriesOk = units.length > 0 && units.every((u) => Number(a.unitEntries?.[u.key]) > 0);
  /** Invitations only when players self-enter; admin-entered players still get an entry notification. */
  const commsSteps: StepKey[] = selfEntry ? ["Invites", "Messaging"] : notifyOnly ? ["Messaging"] : [];
  const steps: StepKey[] = isChamps
    ? ["Type", "Basics", "What", "Match", "Categories", "Subcategories", ...(units.length > 1 ? ["Overrides" as const] : []), "ExpEntries", "Format", "Seeding", ...(dblUnits.length ? ["Partners" as const] : []), "Players", "Eligibility",
      ...(showPick ? ["Pick" as const] : []), ...commsSteps, "Fees", "Schedule", "Summary"]
    : ["Type", "Basics", "Entries", "What", "Match", "Categories", "Subcategories", ...(units.length > 1 ? ["Overrides" as const] : []), "Format", "Seeding", ...(dblUnits.length ? ["Partners" as const] : []), "Players", "Eligibility",
      ...(showPick ? ["Pick" as const] : []), ...commsSteps, "Fees", "Dates", "Courts", "Playoffs", "Summary"];
  const cur = steps[Math.min(step, steps.length - 1)];
  const go = (k: StepKey) => { const i = steps.indexOf(k); if (i >= 0) setStep(i); };

  const entriesOk = Number(a.entries) > 0 && Number.isFinite(Number(a.entries));
  const playOk = a.playType !== null;
  const daysOk = a.days.length > 0 && a.days.every((d) => d.date);
  const courtsOk = a.days.every((d) => d.venue.trim() && Number(d.courts) > 0 && d.windows.length > 0 && d.windows.every((w) => w.from && w.to && w.from < w.to));
  const eligOk = units.every((u) => { const e = eligOf(u.key); return e.mode !== "leagues" || e.leagueIds.length > 0; });
  // Organiser overrides (events outside a player's scope) are allowed; only real blockers are listed.
  const pickProblems: string[] = (() => {
    const out: string[] = [];
    if (a.source === "select" && pickIds.length === 0) out.push("Pick at least one player.");
    for (const id of pickIds) {
      const stale = placesFor(id).filter((k) => !units.some((u) => u.key === k));
      if (stale.length) out.push(`${memberName(id)}: ticked in an event that no longer exists — untick and re-pick.`);
      if (singleEvent && placesFor(id).length > 1) out.push(`${memberName(id)}: may only be in one event (timed format).`);
      if (pairMode && placesFor(id).length === 0) out.push(`${memberName(id)}: not in any event yet.`);
    }
    for (const u of adminPairUnits) {
      const un = unpairedIn(u.key);
      if (un.length) out.push(`${u.label}: ${un.map(memberName).join(", ")} still need${un.length === 1 ? "s" : ""} a partner.`);
      pairsFor(u.key).forEach(([x, y]) => { if (!validatePairComposition([genderByMember.get(x), genderByMember.get(y)], u.categoryType, { requireMixedPair: u.categoryType === "mixed" }).valid) out.push(`${u.label}: pair ${memberName(x)} + ${memberName(y)} doesn't fit the category.`); });
    }
    return out;
  })();
  const pickOk = pickProblems.length === 0;
  const periodOk = !!a.periodStart;
  const basicsOk = !!a.name?.trim() && !!a.scope && !!derivedOwner && (!isChamps || periodOk);
  const ownerText = a.scope ? `${SCOPE_LABEL[a.scope]} · ${derivedOwner ?? (ownerLoading ? "looking up…" : "owner not found")}` : "Level not chosen";
  const okFor: Record<StepKey, boolean> = { Type: a.kind !== null, Basics: basicsOk, Entries: entriesOk, ExpEntries: unitEntriesOk, What: playOk, Match: scoringOk(scoring), Categories: cats.length > 0 && cats.every((c) => COMPETITION_CATEGORIES.includes(a.categoryTypes?.[c] ?? Object.entries(a.categoryTypes ?? {}).find(([k]) => k.trim() === c)?.[1])), Subcategories: discOk, Overrides: units.every((u) => scoringOk(scoringFor(u.key))), Format: units.length ? units.every((u) => formatOk(formatFor(u.key))) : formatOk(format), Seeding: units.every((u) => seedFor(u.key) !== null), Partners: dblUnits.every((u) => partnerOf(u.key) !== null),
    Players: a.source !== null, Eligibility: eligOk, Pick: pickOk, Invites: a.invite !== null, Messaging: waOk && (msgLater || (msg.channels.some(chAvail) && !!msgBody.trim())), Fees: fee.has === false || (fee.has === true && units.every((u) => Number(feeFor(u.key)) >= 0 && feeFor(u.key) !== "") && chosenMethods.length > 0 && fee.confirmNeedsPay != null), Dates: daysOk, Courts: courtsOk, Split: true, Schedule: stages.length > 0 && stages.every(stageOk) && a.playoffSync !== null && a.playoffSync !== undefined, Playoffs: true, Summary: false };
  const canNext = okFor[cur];
  const reached = useMemo(() => {
    let i = 0; while (i < steps.length - 1 && okFor[steps[i]]) i++; return i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(okFor), steps.join()]);

  /** Exact field when the organiser picked everyone; otherwise the estimate (provisional). */
  const knownField = a.source === "select" && pickIds.length > 0;
  const champsEstimate = units.reduce((n, u) => n + (Number(a.unitEntries?.[u.key]) || 0), 0);
  const fieldCount = knownField ? entryCount : isChamps ? champsEstimate : Number(a.entries) || 0;
  const courtHours = a.days.reduce((t, d) => t + (Number(d.courts) || 0) * d.windows.reduce((h, w) => {
    if (!w.from || !w.to || w.from >= w.to) return h;
    const [fh, fm] = w.from.split(":").map(Number); const [th, tm] = w.to.split(":").map(Number);
    return h + (th * 60 + tm - fh * 60 - fm) / 60;
  }, 0), 0);
  const tipReady = fieldCount > 0 && cats.length > 0 && daysOk && courtsOk;
  // Court-hour check is deliberately optimistic: pool matches, breaks, turnaround and parallel divisions are not planned here.
  const plannedPlayoffMatches = units.reduce((n, u) => n + (playoffActive(u.key) ? 2 ** playoffFor(u.key).rounds - 1 : 0), 0);
  const playoffMinutes = units.reduce((n, u) => {
    const p = playoffFor(u.key); const s = scoringFor(u.key) ?? scoring;
    if (!playoffActive(u.key) || !s) return n;
    return n + (2 ** p.rounds - 1) * (s.mode === "time_capped_points" ? slotMinutes(s) : s.bestOf === 3 ? 35 : 55);
  }, 0);
  const capacityEstimateValid = units.filter((u) => playoffActive(u.key)).every((u) => scoringOk(scoringFor(u.key) ?? scoring));
  const provisional = !knownField || pickIds.some((id) => !placesFor(id).some((k) => units.some((u) => u.key === k))) || selfEntry;
  const groupCount = (key: string) => pickIds.filter((id) => inUnit(id, key)).length;

  const discText = (k: string) => { const d = units.find((u) => u.key === k)?.disc; return d ? PLAY_LABEL[d] : "?"; };
  const eligText = (k: string) => {
    const e = eligOf(k);
    const who = e.mode === "everyone" ? "Everyone" : e.mode === "leagues" ? ((e.leagueIds.map(leagueName).join(" + ") || "Leagues not chosen") + (e.alsoEveryone ? " + everyone" : "") + (e.alsoPick ? " + players I pick" : "")) : "Players I pick" + (e.alsoEveryone ? " + everyone" : "");
    return e.mode !== "manual" && selfEntry ? `${who} · ${e.placement === "auto" ? "placed automatically" : "choose when entering"}` : who;
  };

  const setSubcats = (cat: string, names: string[] | null) => {
    const next = { ...a.subcats };
    if (names === null) delete next[cat]; else next[cat] = names;
    setA({ ...a, subcats: next });
  };

  const setDays = (days: DayAvail[]) => setA({ ...a, days });
  const updDay = (i: number, p: Partial<DayAvail>) => setDays(a.days.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const addDay = () => {
    const prev = a.days[a.days.length - 1];
    let date = "";
    if (prev?.date) { const n = new Date(prev.date + "T00:00:00"); n.setDate(n.getDate() + 1); date = n.toISOString().slice(0, 10); }
    setDays([...a.days, { date, venue: prev?.venue ?? clubName ?? "", courts: prev?.courts ?? "", windows: [{ from: "", to: "" }] }]);
  };

  const [jumped, setJumped] = useState(false);
  useEffect(() => { if (initialStep && !jumped) { setJumped(true); go(initialStep); } });
  /* ── Handover: Summary → Tournament Management ── */
  const deferred: DeferredDecision[] = (() => {
    const out: DeferredDecision[] = [];
    const ul = (keys: string[]) => keys.map(unitBase).join(", ");
    const fLater = units.filter((u) => formatFor(u.key).kind === "later").map((u) => u.key);
    if (fLater.length || (!units.length && format.kind === "later")) out.push({ id: "format", label: `Competition format${fLater.length ? ` (${ul(fLater)})` : ""}`, neededAt: "finalise", why: "Chosen at Finalise entries, once real entries are known." });
    const sLater = units.filter((u) => seedFor(u.key) === "later").map((u) => u.key);
    if (sLater.length) out.push({ id: "seeding", label: `Seeding (${ul(sLater)})`, neededAt: "finalise", why: "Depends on who actually entered." });
    if (!isChamps) { const pl = units.filter((u) => playoffFor(u.key).choice === "later" && formatFor(u.key).kind !== "knockout").map((u) => u.key); if (pl.length) out.push({ id: "playoffs", label: `Playoffs (${ul(pl)})`, neededAt: "finalise", why: "Depends on the final field size." }); }
    if (isChamps && a.playoffSync === "later") out.push({ id: "playoff_sync", label: "Playoff dates shared across categories?", neededAt: "generate", why: "Needed before fixtures are made." });
    const stLater = stages.filter((s) => s.mode === "later");
    if (stLater.length) out.push({ id: "stage_dates", label: `Stage dates (${stLater.map((s) => s.name).join(", ")})`, neededAt: "generate", why: "Needed before fixtures are made." });
    const pLater = dblUnits.filter((u) => partnerOf(u.key) === "later").map((u) => u.key);
    if (pLater.length) out.push({ id: "partners", label: `Who picks doubles partners (${ul(pLater)})`, neededAt: selfEntry ? "invite" : "finalise", why: selfEntry ? "Players need to know this before they enter." : "Pairs are needed before the draw." });
    if (selfEntry && dblUnits.some((u) => partnerOf(u.key) === "players") && (a.doublesEntry ?? null) === null) out.push({ id: "doubles_entry", label: "May a player register both partners?", neededAt: "invite", why: "Affects how players enter." });
    if (fee.has && dblUnits.length && fee.doublesCover === null) out.push({ id: "doubles_cover", label: "May one player pay for both partners?", neededAt: "invite", why: "Changes the amount shown in the message." });
    if (selfEntry && a.invite === "later") out.push({ id: "invite_audience", label: "Who to invite", neededAt: "invite", why: "Needed before invitations go out." });
    if (msgLater) out.push({ id: "message", label: notifyOnly ? "Participation notification wording/channels" : "Invitation wording/channels", neededAt: "invite", why: "Needed before players are contacted." });
    return out;
  })();
  const renderMsg = (vars: Record<string, string>) => msgBody.replace(/{{\s*([a-z_]+)\s*}}/g, (m, k) => vars[k] ?? previewVars[k] ?? m) + waLine;
  const pairPartner = (id: string, k: string) => adminPairKeys.has(k) ? pairsFor(k).find((p) => p.includes(id))?.find((x) => x !== id) ?? null : null;
  const entrantMessages: EntrantMessage[] = pickIds.filter((id) => placesFor(id).length > 0).map((id) => {
    const ks = placesFor(id); const us = ks.map((k) => units.find((x) => x.key === k)).filter(Boolean) as typeof units;
    const partners = ks.filter((k) => adminPairKeys.has(k)).map((k) => { const p = pairPartner(id, k); return p ? (ks.length > 1 ? `${memberName(p)} (${unitLabel(k)})` : memberName(p)) : null; }).filter(Boolean);
    const text = renderMsg({ first_name: memberName(id).split(" ")[0] || "there", category: us.map((u) => u.label).join(", "), partner_name: partners.length ? partners.join(", ") : "[partner to be confirmed]", amount_due: dueText(us[0]) || "" });
    return { memberId: id, name: memberName(id), text, status: fee.has ? "Entered · Payment outstanding" : "Entered" };
  });
  const [completing, setCompleting] = useState(false);
  const [completeErr, setCompleteErr] = useState<string | null>(null);
  const conflicts = setupConflicts(a);
  const setupComplete = steps.slice(0, -1).every((k) => okFor[k]) && conflicts.length === 0;
  const completeSetup = async () => {
    setCompleting(true); setCompleteErr(null);
    try {
      const dates = a.days.map((d) => d.date).filter(Boolean).sort();
      const amounts = units.map((u) => Number(feeFor(u.key)) || 0);
      const feeCents = fee.has ? Math.round(Math.max(0, ...amounts) * 100) : 0;
      const pms = dblUnits.map((u) => partnerOf(u.key)).filter((p): p is "admin" | "players" => p === "admin" || p === "players");
      // One entry per person per event; the person (registration) is never duplicated.
      const entrants = notifyOnly || showPick ? entrantsFromPicks(a.picks, units.map((u) => u.key), pairPartner) : [];
      const tid = await persistStepTournament({
        clubId, name: a.name || "Tournament", existingId: a.createdTournamentId ?? null,
        startDate: isChamps ? a.periodStart || null : dates[0] ?? null, endDate: isChamps ? null : dates[dates.length - 1] ?? null,
        entriesOpen: a.entriesOpen || null, entriesClose: a.entriesClose || null,
        feeCents, confirmNeedsPay: fee.has ? fee.confirmNeedsPay !== false : undefined, partnerPay: fee.has && dblUnits.length ? fee.doublesCover : undefined, paymentMethods: fee.has ? chosenMethods : [], partnerMode: pms.length && pms.every((p) => p === pms[0]) ? pms[0] : null, entrants,
        waGroup: wa.use === null ? undefined : waUrl ? { url: waUrl, include: wa.include, name: a.name || "Tournament" } : null,
        drawChannels: msg.channels.filter(chAvail),
        drawNotify: a.drawNotify !== false,
        resultNotify: am.on === null ? undefined : am.on && am.channels.length ? { scope: am.scope, channels: am.channels.filter((c) => chAvail(c as Channel)) } : { scope: "never", channels: [] },
        categoryTypes: units.map((u) => u.categoryType ?? "open"),
        divisions: units.map((u) => { const sc = scoringFor(u.key); return { leagueIds: eligOf(u.key).mode === "leagues" ? eligOf(u.key).leagueIds : [], gender: u.categoryType, label: u.label, matchType: u.disc === "doubles" ? "doubles" as const : "singles" as const, serving: a.serving === undefined ? undefined : u.disc === "doubles" ? a.serving[u.key] ?? null : null, feeCents: fee.has ? Math.round((Number(feeFor(u.key)) || 0) * 100) : null, scoring: sc ? { mode: sc.mode, pointsPerGame: sc.pointsPerGame, bestOf: sc.bestOf, winCondition: sc.winCondition, slotMinutes: sc.mode === "time_capped_points" ? slotMinutes(sc) || null : null, breakMinutes: sc.mode === "time_capped_points" && Number(sc.timeCapPlay) > 0 ? Math.max(0, Number(sc.timeCapBreak) || 0) : null } : null }; }),
      });
      const prev = loadHandover(clubId, tid);
      saveHandover({
        tournamentId: tid, clubId, name: a.name || "Tournament", kind: isChamps ? "period" : "once_off",
        mode: notifyOnly ? "inform" : "invite", feeDue: !!fee.has, channels: msg.channels.filter(chAvail), messageTemplate: msgBody,
        entrantMessages, invitePreview: preview, deferred, waGroup: waUrl ? { url: waUrl, include: wa.include } : null,
        expected: units.map((u) => ({ label: u.label, expected: isChamps ? Number(a.unitEntries?.[u.key]) || null : null, doubles: u.disc === "doubles" })),
        stage: prev?.stage ?? "invite", completed: prev?.completed ?? ["planning"], informedAt: prev?.informedAt ?? null,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      });
      // Persist synchronously: the builder unmounts on handover, so the save effect may never run.
      const nextA = { ...a, createdTournamentId: tid };
      localStorage.setItem(tournamentKey(tid), JSON.stringify(nextA));
      if (!tournamentId) { clearDraft(clubId); setKey(tournamentKey(tid)); }
      setA(nextA);
      onCompleted?.(tid);
    } catch (e: any) {
      setCompleteErr(e?.message || "Something went wrong — nothing was changed.");
    } finally { setCompleting(false); }
  };
  const deferredByStage = LIFECYCLE.map((l) => ({ l, items: deferred.filter((d) => d.neededAt === l.key) })).filter((x) => x.items.length);
  const mustNow = deferred.filter((d) => d.neededAt === "invite");
  const canWait = deferred.filter((d) => d.neededAt !== "invite");
  const handoverPanel = (where: "top" | "bottom") => (
    <div className={cn("rounded-lg border p-3 text-sm", setupComplete ? "border-primary/50 bg-primary/10" : "border-destructive/50 bg-destructive/10")} data-testid={`handover-${where}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{!setupComplete ? "Setup not finished yet" : mustNow.length ? "Almost ready" : "Tournament setup complete"}</div>
          <div className="text-xs text-muted-foreground">{setupComplete
            ? `${a.createdTournamentId ? "Already created — saving updates the same tournament." : "Next: "}${notifyOnly ? "inform your selected players" : "invite players"}.${deferred.length ? ` ${deferred.length} "Decide later" item${deferred.length === 1 ? "" : "s"} will be asked for when needed.` : ""}`
            : `Finish: ${steps.slice(0, -1).filter((k) => !okFor[k]).map((k) => STEP_LABEL[k]).join(", ")}`}</div>
        </div>
        {conflicts.length > 0 && <div className="w-full"><ConflictPanel conflicts={conflicts} onResolve={(c, pick) => setA(resolveConflict(a, c, pick) as StepAnswers)} /></div>}
        <div className="flex gap-2">{where === "top" && <SaveAsTemplateButton clubId={clubId} answers={a} />}<Button size="sm" disabled={!setupComplete || completing} onClick={completeSetup}>{completing ? "Saving…" : a.createdTournamentId ? "Save setup & return to management" : "Complete setup & continue"}<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
      </div>
      {where === "top" && deferred.length > 0 && (
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <div className={cn("rounded border p-2", mustNow.length ? "border-destructive/50" : "border-border")}>
            <div className="font-medium">Must be decided before players are contacted ({mustNow.length})</div>
            {mustNow.length ? <ul className="list-disc pl-4">{mustNow.map((d) => <li key={d.id}>{d.label}</li>)}</ul> : <div className="text-muted-foreground">Nothing — ready for the first step.</div>}
            {mustNow.length > 0 && <div className="text-muted-foreground">You can still complete setup; Tournament Management will ask for these first.</div>}
          </div>
          <div className="rounded border border-border p-2">
            <div className="font-medium">Can stay "Decide later" for now ({canWait.length})</div>
            {deferredByStage.filter((x) => x.l.key !== "invite").map(({ l, items }) => <div key={l.key}><span className="text-muted-foreground">Needed at {l.label}:</span> {items.map((d) => d.label).join(" · ")}</div>)}
            {!canWait.length && <div className="text-muted-foreground">Nothing deferred.</div>}
          </div>
        </div>
      )}
      {completeErr && <p className="mt-2 text-xs text-destructive">{completeErr}</p>}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        {!tournamentId && <TemplateReviewBanner clubId={clubId} />}
        {/* progress */}
        <ol className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={i > reached}
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                  i === step ? "border-primary bg-primary text-primary-foreground" : i < reached ? "border-primary/50 text-foreground" : "border-border text-muted-foreground",
                  i > reached && "opacity-50",
                )}
              >
                {i < reached && i !== step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {s === "Pick" && pairMode ? "Select & pair players" : s === "Messaging" && notifyOnly ? "Entry notification" : STEP_LABEL[s]}
              </button>
            </li>
          ))}
        </ol>

        <Card><CardContent className="space-y-4 p-5">
          {cur === "Type" && (
            <>
              <Q t="What type of tournament is this?" h="Pick the one that sounds most like your event." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={a.kind === "once_off"} onClick={() => setA({ ...a, kind: "once_off" })} title="Once-off / weekend tournament" desc="Played over one day or a few days in a row." />
                <Choice active={a.kind === "period"} onClick={() => setA({ ...a, kind: "period" })} title="Over a period / Club Champs" desc="Games spread over weeks, e.g. club championships." />
              </div>
              {a.kind === "period" && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Club Championships: categories progress on their own, rounds can be "play by a date" or scheduled sessions. Everything stays a plan until the Final Format Review after registrations close.
                </div>
              )}
            </>
          )}

          {cur === "Entries" && (
            <>
              <Q t="How many entries do you expect?" h="A rough guess is fine — you can change it later." />
              <div className="max-w-[200px] space-y-1">
                <Label htmlFor="sbs-entries">About how many players or pairs?</Label>
                <Input id="sbs-entries" type="number" min={1} inputMode="numeric" value={a.entries} onChange={(e) => setA({ ...a, entries: e.target.value })} placeholder="e.g. 32" />
              </div>
            </>
          )}

          {cur === "What" && (
            <>
              <Q t="What will be played?" h="Just the basic fact for now — we won't ask how it fits together yet." />
              <div className="grid gap-3 sm:grid-cols-3">
                {(["singles", "doubles", "both"] as const).map((p) => (
                  <Choice key={p} active={a.playType === p} onClick={() => setPlayType(p)} title={PLAY_LABEL[p]} desc={p === "both" ? "Singles and doubles at the same event." : p === "singles" ? "One player per side." : "Two players per side."} />
                ))}
              </div>
            </>
          )}

          {cur === "Match" && (
            <>
              <Q t="How will matches be played?" h="This applies to every category unless you choose an exception after setting up your categories." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={scoring?.mode === "standard"} onClick={() => setScoring({ mode: "standard" })} title="Standard play" desc="Games to a set score, with a best-of match." />
                <Choice active={scoring?.mode === "time_capped_points"} onClick={() => setScoring({ mode: "time_capped_points" })} title="Time-capped / Bells format" desc="Matches run for a set number of minutes." />
              </div>
              {scoring && <ScoringFields value={scoring} onChange={setScoring} />}
            </>
          )}

          {cur === "Categories" && (
            <>
              <Q t="What categories will you have? (subcategories will be next)" h="Give each category any name you like, for example Men's, Ladies, Open or Men's A." />
              <div className="space-y-2">
                {a.categories.map((c, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <Input aria-label={`Category ${i + 1}`} value={c} placeholder={`Category ${i + 1}`} onChange={(e) => {
                      const oldKey = c.trim(), newKey = e.target.value.trim();
                      const types = { ...(a.categoryTypes ?? {}) };
                      const t = types[oldKey] ?? types[c];
                      if (t && newKey && !types[newKey]) types[newKey] = t;
                      setA({ ...a, categories: a.categories.map((x, j) => (j === i ? e.target.value : x)), categoryTypes: types });
                    }} />
                    <select aria-label={`Category ${i + 1} type`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={a.categoryTypes?.[c.trim()] ?? a.categoryTypes?.[c] ?? ""} onChange={(e) => setA({ ...a, categoryTypes: { ...a.categoryTypes, [c.trim()]: e.target.value as CompetitionCategory } })}><option value="">Category type required</option>{COMPETITION_CATEGORIES.map((type) => <option key={type} value={type}>{CATEGORY_LABELS[type]}</option>)}</select>
                    <Button variant="ghost" size="icon" aria-label="Remove category" disabled={a.categories.length === 1} onClick={() => setA({ ...a, categories: a.categories.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setA({ ...a, categories: [...a.categories, ""] })}><Plus className="mr-1 h-4 w-4" />Add category</Button>
              </div>
            </>
          )}

          {cur === "Subcategories" && (
            <>
              <Q t="Do any categories need subcategories?" h="Optional — e.g. Men's could be split into Group A, Group B, Group C. Ladies can stay as one group." />
              {a.playType === "both" && <p className="text-xs text-muted-foreground">You chose Singles and Doubles — pick one for each category, or for each subcategory if it's split. Singles and doubles entries are always kept apart.</p>}
              <div className="space-y-3">
                {cats.map((cat) => {
                  const subs = a.subcats[cat];
                  const has = subs !== undefined;
                  return (
                    <div key={cat} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="text-sm font-semibold">{cat}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={!has} onClick={() => setSubcats(cat, null)}
                          className={cn("rounded-full border px-3 py-1 text-xs", !has ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>
                          No subcategories
                        </button>
                        <button type="button" aria-pressed={has} onClick={() => setSubcats(cat, has ? subs : ["A", "B"])}
                          className={cn("rounded-full border px-3 py-1 text-xs", has ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>
                          Add subcategories
                        </button>
                      </div>
                      {a.playType === "both" && !has && <DiscPick value={a.disc[cat]} onChange={(d) => setDisc(cat, d)} />}
                      {a.playType !== "both" && a.playType && <div className="text-xs text-muted-foreground">{has ? "All groups play" : "Plays"} {PLAY_LABEL[a.playType]} (from "What will be played")</div>}
                      {has && (
                        <div className="space-y-2">
                          {subs.map((s, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                              <Input aria-label={`${cat} subcategory ${i + 1}`} value={s} placeholder={`e.g. Group ${String.fromCharCode(65 + i)}`}
                                className="max-w-[220px]" onChange={(e) => setSubcats(cat, subs.map((x, j) => (j === i ? e.target.value : x)))} />
                              {a.playType === "both" && s.trim() && <DiscPick value={a.disc[`${cat}::${s.trim()}`]} onChange={(d) => setDisc(`${cat}::${s.trim()}`, d)} />}
                              <Button variant="ghost" size="icon" aria-label="Remove subcategory" disabled={subs.length === 1}
                                onClick={() => setSubcats(cat, subs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => setSubcats(cat, [...subs, ""])}><Plus className="mr-1 h-4 w-4" />Add another</Button>
                        </div>
                      )}
                      {!has && units.filter((u) => u.key === cat).map((u) => <div key={u.key} className="border-t border-border pt-2">{poolControl(u)}</div>)}
                      {has && units.filter((u) => u.key.startsWith(`${cat}::`)).map((u) => <div key={u.key} className="border-t border-border pt-2"><div className="mb-1 text-xs font-medium">{u.base}</div>{poolControl(u)}</div>)}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {cur === "Overrides" && (
            <>
              <Q t="Does any group need a different match format?" h="The tournament match format already applies to every group. Only change the groups that need an exception." />
              <p className="text-sm">For all groups: <span className="font-medium">{scoring ? scoringText(scoring) : "Not chosen"}</span></p>
              <div className="space-y-3">
                {cats.flatMap((cat) => [cat, ...((a.subcats[cat] ?? []).map((s) => s.trim()).filter(Boolean).map((s) => `${cat}::${s}`))]).map((key) => {
                  const override = a.scoringOverrides?.[key];
                  return <div key={key} className="space-y-3 border-t pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{key.replace("::", " › ")}</div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setScoringOverride(key, override ? null : {})}>
                        {override ? "Use tournament format" : "Change this group's format"}
                      </Button>
                    </div>
                    {override ? <ScoringFields value={override} onChange={(patch) => setScoringOverride(key, patch)} showMode /> : <p className="text-xs text-muted-foreground">Uses {scoringFor(key) ? scoringText(scoringFor(key) as MatchScoring) : "tournament format"}</p>}
                  </div>;
                })}
              </div>
            </>
          )}

          {cur === "Players" && (
            <>
              <Q t="How will players be added?" h="This decides what we ask next." />
              <div className="grid gap-3 sm:grid-cols-3">
                <Choice active={a.source === "select"} onClick={() => setA({ ...a, source: "select" })} title={SOURCE_LABEL.select} desc="You already know who is playing. You'll pick them from your members." />
                <Choice active={a.source === "self"} onClick={() => setA({ ...a, source: "self" })} title={SOURCE_LABEL.self} desc="Eligible members enter on their own. The field is only known once entries close." />
                <Choice active={a.source === "both"} onClick={() => setA({ ...a, source: "both" })} title="Both" desc="Pick some players now and let other eligible members enter too." />
              </div>
            </>
          )}

          {cur === "Eligibility" && (
            <>
              <Q t="Who may enter each category?" h="Keep it simple — you can change this later." />
              <div className="space-y-3">
                {units.map((u) => {
                  const e = eligOf(u.key);
                  return (
                    <div key={u.key} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="text-sm font-semibold">{u.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {(["everyone", "leagues", "manual"] as const).map((m) => {
                          // All three options can be combined: Everyone (alsoEveryone), leagues + Players I pick (alsoPick).
                          const on = e.mode === m || (m === "manual" && e.mode === "leagues" && !!e.alsoPick) || (m === "everyone" && e.mode !== "everyone" && !!e.alsoEveryone);
                           const click = () => {
                            if (m === "everyone" && e.mode !== "everyone") setElig(u.key, { alsoEveryone: !e.alsoEveryone });
                            else if (m === "manual" && e.mode === "leagues") setElig(u.key, { alsoPick: !e.alsoPick });
                            else if (m === "leagues" && e.mode === "manual") setElig(u.key, { mode: "leagues", alsoPick: true });
                            else if (e.mode === "everyone" && m !== "everyone") setElig(u.key, { mode: m, alsoEveryone: true, alsoPick: m === "leagues" ? e.alsoPick : false });
                            else setElig(u.key, { mode: m, alsoPick: false, alsoEveryone: false });
                          };
                          return <button key={m} type="button" aria-pressed={on} onClick={click} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>
                            {m === "everyone" ? "Everyone" : m === "leagues" ? "Specific league(s)" : "Players I pick"}
                          </button>;
                        })}
                      </div>
                       {e.mode !== "everyone" && e.alsoEveryone && <p className="text-xs text-muted-foreground">Everyone may enter. Members of the chosen leagues are placed in their group automatically, and you can add or move any player yourself on Pick players.</p>}
                       {e.mode === "leagues" && e.alsoPick && !e.alsoEveryone && <p className="text-xs text-muted-foreground">Members of the chosen leagues may enter, and you can also add any other player yourself on Pick players.</p>}
                      {e.mode === "leagues" && (leagues.length === 0
                        ? <p className="text-xs text-muted-foreground">Your club has no leagues set up yet. Choose another option.</p>
                        : <div className="flex flex-wrap gap-1.5">{leagues.map((l) => {
                            const on = e.leagueIds.includes(l.id);
                            return <button key={l.id} type="button" aria-pressed={on} onClick={() => setElig(u.key, { leagueIds: on ? e.leagueIds.filter((x) => x !== l.id) : [...e.leagueIds, l.id] })} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>{l.name}</button>;
                          })}</div>)}
                      {e.mode !== "manual" && selfEntry && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Players who may enter:</div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" aria-pressed={e.placement === "auto"} onClick={() => setElig(u.key, { placement: "auto" })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.placement === "auto" ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>Are put in here automatically</button>
                            <button type="button" aria-pressed={e.placement === "choose"} onClick={() => setElig(u.key, { placement: "choose" })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.placement === "choose" ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>Choose this when they enter</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {cur === "Pick" && (
            <>
              <Q t={pairMode ? "Select & pair your players" : "Pick your players"} h={pairMode ? "Tap a member to add them and choose where they play. In doubles groups where you assign partners, pair them up right here." : "Tap a member to add them, then choose where each one plays."} />
              {knownField && <div className="rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">You've picked {pickIds.length} player{pickIds.length === 1 ? "" : "s"}{pairMode ? ` (${entryCount} entr${entryCount === 1 ? "y" : "ies"} — each pair counts as one)` : ""}. Because the field is known, SquashHub will plan with this exact number instead of your estimate.</div>}
              {a.source === "both" && <div className="text-xs text-muted-foreground">Other eligible members can still enter themselves, so the total stays provisional until entries close.</div>}
              {units.some((u) => u.disc === "doubles" && !adminPairKeys.has(u.key)) && <div className="text-xs text-muted-foreground">{pairMode ? "In doubles groups where players choose their own partner, picked players are paired by the players themselves." : "Doubles groups take players who will be paired up — partners are matched later."} A player placed in a Singles group is not counted as a doubles entry.</div>}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-medium hover:bg-muted">
                  <UserPlus className="h-3.5 w-3.5" /> Import players from file (CSV)
                  <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importEntries(f); e.target.value = ""; }} />
                </label>
                <span className="text-muted-foreground">Matches club members by name, email and cell. Nothing is sent.</span>
              </div>
              {importReport && <div className="rounded-lg border border-border p-2 text-xs" aria-label="Import result">
                <div className="font-medium">Imported {importReport.added} new player{importReport.added === 1 ? "" : "s"}{importReport.problems.length ? ` · ${importReport.problems.length} need attention` : ""}</div>
                {importReport.problems.length > 0 && <ul className="mt-1 list-disc pl-4 text-muted-foreground">{importReport.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
              </div>}
              <Input placeholder="Search members" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              {(() => {
                // Organiser may add ANY member; those outside every event's scope are listed after, flagged.
                const q = memberSearch.trim().toLowerCase();
                const rows = members.filter((m) => !(m.id in a.picks) && m.name.toLowerCase().includes(q)).map((m) => ({ m, ok: units.some((u) => fits(m.id, u.key)) }));
                rows.sort((x, y) => Number(y.ok) - Number(x.ok));
                const nOk = rows.filter((r) => r.ok).length;
                return <>
                  <div className="text-xs text-muted-foreground">{nOk} eligible · {rows.length - nOk} outside the chosen leagues (you can still add them){q ? " — matching your search" : ""}</div>
                  <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-border p-2">
                    {rows.map(({ m, ok }) => (
                      <button key={m.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => { const k = ok ? autoPlace(m.id) : null; setA({ ...a, picks: { ...a.picks, [m.id]: k ? [k] : [] } }); }}>
                        <span>{m.name}{!ok && <span className="ml-1 text-muted-foreground">· outside chosen leagues</span>}</span><Plus className="h-3 w-3" />
                      </button>
                    ))}
                    {members.length === 0 && <div className="text-xs text-muted-foreground">No active members found.</div>}
                  </div>
                </>; })()}
              {pickIds.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label>Picked: {counts.uniquePlayers} unique player{counts.uniquePlayers === 1 ? "" : "s"} · {counts.totalEntries} total entr{counts.totalEntries === 1 ? "y" : "ies"}</Label>
                    {units.some((u) => eligOf(u.key).mode === "leagues") && pickIds.some((id) => placesFor(id).length === 0) && (
                      <Button size="sm" variant="outline" onClick={() => { const n = { ...a.picks }; pickIds.forEach((id) => { if (placesFor(id).length === 0) { const k = autoPlace(id); n[id] = k ? [k] : []; } }); setA({ ...a, picks: n }); }}>Place by league</Button>)}
                  </div>
                  <div className="text-xs text-muted-foreground">{singleEvent ? "Time-capped events all play at the same time, so each player enters one event." : "Tap an event to add or remove it. A player stays picked even with no events."}</div>
                  <div className="max-h-[28rem] space-y-1 overflow-auto">
                  {pickIds.filter((id) => memberName(id).toLowerCase().includes(memberSearch.trim().toLowerCase())).map((id) => {
                    const mine = placesFor(id);
                    return (
                    <div key={id} className={cn("grid grid-cols-[11rem_1fr_auto] items-center gap-2 rounded-md border px-2 py-1", mine.length ? "border-border" : "border-destructive/50 bg-destructive/5")} data-testid={`pick-row-${id}`}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" title={memberName(id)}>{memberName(id)}</div>
                        <div className={cn("text-[11px]", mine.length ? "text-muted-foreground" : "font-medium text-destructive")}>{mine.length ? `${mine.length} event${mine.length === 1 ? "" : "s"}` : "No event yet"}</div>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[11px]" role="group" aria-label={`Events for ${memberName(id)}`}>
                        {units.map((u) => {
                          const on = mine.includes(u.key);
                          const why = blockedReason(fits(id, u.key), u.categoryType);
                          // Organiser override: an event outside the player's scope can still be ticked; it's only flagged.
                          return (
                            <button key={u.key} type="button" aria-pressed={on} title={why ? `${why} — tap to add anyway (organiser override)` : undefined}
                              onClick={() => setA({ ...a, picks: togglePlace(a.picks, id, u.key, singleEvent) })}
                              className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 whitespace-nowrap", on ? "border-primary bg-primary text-primary-foreground" : why ? "border-dashed border-border text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100" : "border-border hover:bg-muted")}>
                              {on && <Check className="h-3 w-3" />}{u.label}{why && <span className="opacity-80">{on ? " · override" : ` · ${why}`}</span>}
                            </button>);
                        })}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${memberName(id)}`} onClick={() => { const n = { ...a.picks }; delete n[id]; setA({ ...a, picks: n }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>);
                  })}
                  </div>
                </div>
              )}
              {adminPairUnits.map((u) => {
                const prs = pairsFor(u.key);
                const placedUnpaired = unpairedIn(u.key);
                // Players not yet placed in a group can be paired straight into this doubles group.
                const unplaced = pickIds.filter((id) => placesFor(id).length === 0);
                const candidates = [...placedUnpaired, ...unplaced.filter((id) => fits(id, u.key))];
                const sel = (pairDraft[u.key] ?? []).filter((id) => candidates.includes(id));
                const toggle = (id: string) => setPairDraft({ ...pairDraft, [u.key]: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2) });
                const createPair = () => {
                  if (sel.length !== 2 || !validatePairComposition(sel.map((id) => genderByMember.get(id)), u.categoryType, { requireMixedPair: u.categoryType === "mixed" }).valid) return;
                  const [x, y] = sel;
                  setA({ ...a, picks: addPlace(addPlace(a.picks, x, u.key, singleEvent), y, u.key, singleEvent), pairs: { ...(a.pairs ?? {}), [u.key]: [...prs, [x, y]] } });
                  setPairDraft({ ...pairDraft, [u.key]: [] });
                };
                return (
                  <div key={u.key} className="space-y-3 rounded-lg border border-border p-3" data-testid={`pairing-${u.key}`}>
                    <div className="text-sm font-semibold">Pair players — {u.label}</div>
                    <div className="space-y-1">
                      <Label>Unpaired players ({candidates.length})</Label>
                      {candidates.length === 0 ? (
                        <div className="text-xs text-muted-foreground">{pickIds.length === 0 ? "Add players from the list above, then pair them here." : "Everyone in this group is paired."}</div>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">Tick two players, then press Create pair.{unplaced.length > 0 && units.length > 1 ? " Players not placed in a group yet will be placed in this group when paired." : ""}</div>
                          <div className="flex flex-wrap gap-1.5">{candidates.map((id) => (
                            <button key={id} type="button" aria-pressed={sel.includes(id)} onClick={() => toggle(id)}
                              className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", sel.includes(id) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                              {sel.includes(id) && <Check className="h-3 w-3" />}{memberName(id)}{placesFor(id).length === 0 && <span className="opacity-70"> (not placed)</span>}
                            </button>))}</div>
                           <Button type="button" size="sm" disabled={sel.length !== 2 || !validatePairComposition(sel.map((id) => genderByMember.get(id)), u.categoryType, { requireMixedPair: u.categoryType === "mixed" }).valid} onClick={createPair}>
                            <Plus className="mr-1 h-3 w-3" />Create pair{sel.length === 2 ? `: ${memberName(sel[0])} + ${memberName(sel[1])}` : ` (${sel.length}/2 chosen)`}
                          </Button>
                          {sel.length === 2 && (() => {
                            const v = validatePairComposition(sel.map((id) => genderByMember.get(id)), u.categoryType, { requireMixedPair: u.categoryType === "mixed" });
                            return !v.valid && v.reason ? <div className="text-xs text-destructive">{v.reason}</div> : null;
                          })()}
                        </>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Pairs ({prs.length})</Label>
                      {prs.length === 0 ? <div className="text-xs text-muted-foreground">No pairs yet.</div> : (
                        <ul className="space-y-1">{prs.map(([x, y], i) => (
                          <li key={x + y} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs">
                            <span className="flex-1"><b>Pair {i + 1}:</b> {memberName(x)} + {memberName(y)}</span>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPairs(u.key, prs.filter((p) => !(p[0] === x && p[1] === y)))}>Split</Button>
                          </li>))}</ul>
                      )}
                    </div>
                    {placedUnpaired.length > 0 && (
                      <div className="text-xs text-destructive">
                        {placedUnpaired.length === 1 ? `${memberName(placedUnpaired[0])} still needs a partner.` : `${placedUnpaired.length} players still need partners.`}
                        {placedUnpaired.length % 2 === 1 ? " There's an odd number of players, so add one more player or remove one." : ""} You can't continue until everyone in this group is paired.
                      </div>
                    )}
                  </div>
                );
              })}
              {pairMode && pickIds.some((id) => placesFor(id).length === 0) && <div className="text-xs text-destructive">Place every picked player in a group (or pair them above) before continuing.</div>}
            </>
          )}

          {cur === "Invites" && (
            <>
              <Q t="Who should be invited to enter?" h="Nothing is sent now — this only records your choice." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={a.invite === "all_eligible"} onClick={() => setA({ ...a, invite: "all_eligible" })} title={INVITE_LABEL.all_eligible} desc="Everyone allowed into at least one category." />
                {units.some((u) => eligOf(u.key).mode === "leagues") && <Choice active={a.invite === "leagues"} onClick={() => setA({ ...a, invite: "leagues" })} title={INVITE_LABEL.leagues} desc="Only members of the leagues you chose above." />}
                <Choice active={a.invite === "selected"} onClick={() => setA({ ...a, invite: "selected" })} title={INVITE_LABEL.selected} desc="You'll choose individual members when sending." />
                <Choice active={a.invite === "later"} onClick={() => setA({ ...a, invite: "later" })} title={INVITE_LABEL.later} desc="Skip for now and decide when the tournament is created." />
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <SectionHead>Entry window (optional)</SectionHead>
                <p className="text-xs text-muted-foreground">When players may enter. The close date fills the "Entries close" line in the invitation and stops late entries; leave blank to keep entries open.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm" htmlFor="sbs-entries-open">Entries open</Label>
                    <Input id="sbs-entries-open" type="date" className="mt-1" value={a.entriesOpen ?? ""} onChange={(e) => setA({ ...a, entriesOpen: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm" htmlFor="sbs-entries-close">Entries close</Label>
                    <Input id="sbs-entries-close" type="date" className="mt-1" value={a.entriesClose ?? ""} min={a.entriesOpen || undefined} onChange={(e) => setA({ ...a, entriesClose: e.target.value })} />
                  </div>
                </div>
                {a.entriesOpen && a.entriesClose && a.entriesClose < a.entriesOpen && <p className="text-xs text-destructive">Entries can't close before they open.</p>}
              </div>
            </>
          )}

          {cur === "Messaging" && (
            <>
              {notifyOnly
                ? <Q t="Inform selected players of their participation" h="This is a notification, not an invitation — you entered these players, so nobody has to accept. Setup only — nothing is sent from here; you send it once entries and pairs are final, and can use tournament messaging later." />
                : <Q t="How should the invitation read?" h="Setup only — nothing is sent from here. Sending and test messages come later." />}
              {msgLater ? (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>{!notifyOnly && a.invite === "later" ? "You chose to decide invitations later, so the message can be set up later too." : "You'll set up the message later."}</p>
                  <Button variant="outline" size="sm" onClick={() => setMsg({ later: false })}>Set it up now anyway</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <SectionHead>{notifyOnly ? "Entry notification" : "Invitation"}</SectionHead>
                  {notifyOnly
                    ? <p className="text-xs text-muted-foreground">Goes to: <b>the players you picked{pickIds.length ? ` (${pickIds.length})` : ""}</b>{pairMode ? ". Doubles players are told who their assigned partner is." : "."}</p>
                    : <p className="text-xs text-muted-foreground">Goes to: <b>{a.invite ? INVITE_LABEL[a.invite] : "the invitation audience"}</b>. Players you already picked are entered and don't need an invitation.</p>}
                  <div>
                    <Label className="text-sm">Channels</Label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => {
                        const ok = chAvail(c); const on = ok && msg.channels.includes(c);
                        return (
                          <button key={c} type="button" disabled={!ok}
                            onClick={() => setMsg({ channels: on ? msg.channels.filter((x) => x !== c) : [...msg.channels, c] })}
                            className={cn("rounded-md border p-2 text-left text-sm", on && "border-primary bg-primary/10", !ok && "cursor-not-allowed opacity-50")}>
                            <span className="flex items-center gap-1 font-medium">{on && <Check className="h-3.5 w-3.5" />}{!ok && <Lock className="h-3.5 w-3.5" />}{CHANNEL_LABEL[c]}</span>
                            {!ok && <span className="block text-[11px] text-muted-foreground">Not switched on for this club (Member messaging)</span>}
                          </button>
                        );
                      })}
                    </div>
                    {!msg.channels.some(chAvail) && <p className="mt-1 text-xs text-destructive">Choose at least one channel.</p>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm" htmlFor="sbs-msg">Message</Label>
                      {storedBody !== null && <Button variant="ghost" size="sm" onClick={() => setMsg(notifyOnly ? { notifyBody: null } : { body: null })}>Reset to suggested wording</Button>}
                    </div>
                    <textarea id="sbs-msg" rows={9} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={msgBody} onChange={(e) => setMsg(notifyOnly ? { notifyBody: e.target.value } : { body: e.target.value })} />
                    <p className="text-[11px] text-muted-foreground">Words in {"{{ }}"} fill in automatically: {notifyOnly ? `first_name, tournament_name, club_name, category${pairMode ? ", partner_name" : ""}${fee.has ? ", amount_due, pay_link" : ""}, dates` : "first_name, tournament_name, club_name, categories, entry_link, closing_date, dates"}. They update as you add details later.</p>
                  </div>
                  <div>
                    <Label className="text-sm">Preview (example member)</Label>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview}</div>
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <SectionHead>Tournament WhatsApp group</SectionHead>
                    <p className="text-[11px] text-muted-foreground">Optional. Entrants can use the link to join the tournament's WhatsApp group for updates. Create the group on your phone and paste its invite link — SquashHub doesn't create groups, and the link goes inside your messages; it isn't a way of sending them.</p>
                    <div className="flex flex-wrap gap-1">{([[false, "No WhatsApp group"], [true, "Use a WhatsApp group"]] as const).map(([v, l]) => (
                      <button key={l} type="button" aria-pressed={wa.use === v} onClick={() => setWa({ use: v })}
                        className={cn("rounded-full border px-3 py-1 text-xs", wa.use === v ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border")}>{l}</button>))}</div>
                    {wa.use && <div className="space-y-1">
                      <Label htmlFor="sbs-wa" className="text-xs">WhatsApp group invite link</Label>
                      <Input id="sbs-wa" placeholder="https://chat.whatsapp.com/…" value={wa.url} onChange={(e) => setWa({ url: e.target.value })} />
                      {wa.url.trim() && !waUrl && <p className="text-xs text-destructive">That doesn't look like a WhatsApp group invite link. In WhatsApp open the group, tap "Invite via link", copy it and paste it here — it starts with https://chat.whatsapp.com/</p>}
                      {!wa.url.trim() && <p className="text-xs text-destructive">Paste the group's invite link, or choose "No WhatsApp group".</p>}
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={wa.include} onChange={(e) => setWa({ include: e.target.checked })} />Include group link in player {notifyOnly ? "participation notification" : "invitation"}</label>
                    </div>}
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <SectionHead>Draw notifications</SectionHead>
                    <p className="text-[11px] text-muted-foreground">When a round or stage is drawn, each player is told who they play, the opponent's phone number and the play-by date, and how to book a court. In doubles both partners get it, with their partner's name and both opponents' names and numbers. If all rounds were drawn upfront with a play-by date each, the Round 1 notice lists every round and its booking date, so players can book all their courts in one go. Sent for Round 1 when you generate the draw, and for each later stage (quarterfinals, semifinals, final) when it is created. Uses the channels chosen above.</p>
                    <div className="flex flex-wrap gap-1">{([[true, "On"], [false, "Off"]] as const).map(([v, l]) => (
                      <button key={l} type="button" aria-pressed={(a.drawNotify !== false) === v} onClick={() => setA((prev) => ({ ...prev, drawNotify: v }))}
                        className={cn("rounded-full border px-3 py-1 text-xs", (a.drawNotify !== false) === v ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border")}>{l}</button>))}</div>
                    {a.drawNotify !== false && !msg.channels.filter(chAvail).some((c) => c !== "sms") && <p className="text-xs text-destructive">Choose at least one message channel above, otherwise nobody is told about the draw.</p>}
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <SectionHead>After-match notifications</SectionHead>
                    <p className="text-[11px] text-muted-foreground">When a result is recorded, players can automatically get a message: the winner gets congratulations and who they play next, the other player gets the result (and, in a knockout, that they're out). Uses SquashHub's existing tournament result messages, including the semifinal and final wording.</p>
                    <div className="flex flex-wrap gap-1">{([[false, "Off"], [true, "On"]] as const).map(([v, l]) => (
                      <button key={l} type="button" aria-pressed={am.on === v} onClick={() => setAm({ on: v })}
                        className={cn("rounded-full border px-3 py-1 text-xs", am.on === v ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border")}>{l}</button>))}</div>
                    {am.on && <div className="space-y-1 text-xs">
                      <div className="flex flex-wrap gap-1">{(["in_app", "email", "whatsapp", "sms"] as Channel[]).map((c) => {
                        const ok = chAvail(c); const on = ok && am.channels.includes(c);
                        return <button key={c} type="button" disabled={!ok} aria-pressed={on} onClick={() => setAm({ channels: on ? am.channels.filter((x) => x !== c) : [...am.channels, c] })}
                          className={cn("rounded-full border px-2.5 py-0.5", on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border", !ok && "line-through opacity-60")}>{({ in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" } as Record<string, string>)[c]}</button>;
                      })}</div>
                      <div className="flex flex-wrap gap-1">{([["all", "After every match"], ["playoffs", "Playoffs only"]] as const).map(([v, l]) => (
                        <button key={v} type="button" aria-pressed={am.scope === v} onClick={() => setAm({ scope: v })}
                          className={cn("rounded-full border px-2.5 py-0.5", am.scope === v ? "border-primary bg-primary/15 font-semibold" : "border-border")}>{l}</button>))}</div>
                      {!am.channels.length && <p className="text-destructive">Choose at least one channel, or turn this off.</p>}
                    </div>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setMsg({ later: true })}>Configure later</Button>
                </div>
              )}
            </>
          )}

          {cur === "Partners" && (
            <>
              <Q t="How will doubles partners be chosen?" h="Set this for each doubles group — they can differ. Decide later never blocks you." />
              <div className="space-y-3">
                {dblUnits.map((u) => (
                  <div key={u.key} className="rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">{u.base}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(Object.keys(PARTNER_LABEL) as Partner[]).map((p) => (
                        <Choice key={p} active={partnerOf(u.key) === p} onClick={() => setA({ ...a, partner: { ...(a.partner ?? {}), [u.key]: p } })} title={PARTNER_LABEL[p]}
                          desc={p === "players" ? "When entering, a player names their partner." : p === "admin" ? "Players enter on their own; you pair them up later." : "Choose before entries open."} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="text-sm font-semibold">Entering as a pair</div>
                <DoublesOption label="A player may register both partners" description="Yes: one player can complete the entry for both members of the pair. No: each partner registers themselves. Separate from who picks the partner and from who pays." value={a.doublesEntry ?? null} onChange={(value) => setA({ ...a, doublesEntry: value })} />
              </div>
            </>
          )}

          {cur === "Fees" && (
            <>
              <Q t="Is there an entry fee?" h="Setup only — no payments are taken from here." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={fee.has === true} onClick={() => setFee({ has: true })} title="Yes" desc="Players pay to enter." />
                <Choice active={fee.has === false} onClick={() => setFee({ has: false })} title="No" desc="Free to enter." />
              </div>
              {fee.has && (
                <div className="mt-4 space-y-4">
                  {dblUnits.length > 0 && (
                    <div>
                      <Label className="text-sm">For doubles, is the fee per player or per pair?</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Choice active={fee.doublesBasis === "player"} onClick={() => setFee({ doublesBasis: "player" })} title="Per player" desc="Each partner's fee." />
                        <Choice active={fee.doublesBasis === "pair"} onClick={() => setFee({ doublesBasis: "pair" })} title="Per pair" desc="One fee for the two of them." />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fee.varies} onChange={(e) => setFee({ varies: e.target.checked })} /> Different fee for different categories
                  </label>
                  {!fee.varies ? (
                    <div className="flex items-center gap-2"><span className="text-sm">R</span><Input type="number" min={0} className="max-w-[140px]" aria-label="Entry fee" value={fee.amount} onChange={(e) => setFee({ amount: e.target.value })} /></div>
                  ) : (
                    <div className="space-y-2">{units.map((u) => (
                      <div key={u.key} className="flex items-center gap-2">
                        <span className="w-56 truncate text-sm">{u.label}</span><span className="text-sm">R</span>
                        <Input type="number" min={0} className="max-w-[120px]" aria-label={`Fee for ${u.base}`} value={fee.perUnit[u.key] ?? ""} onChange={(e) => setFee({ perUnit: { ...fee.perUnit, [u.key]: e.target.value } })} />
                        <span className="text-xs text-muted-foreground">{u.disc === "doubles" && fee.doublesBasis === "pair" ? "per pair" : "per player"}</span>
                      </div>
                    ))}</div>
                  )}
                </div>
              )}
              {dblUnits.length > 0 && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <DoublesOption label="A player may pay for both partners" description="Yes: a player may choose to pay for both; they do not have to. No: each partner pays their own fee." value={fee.doublesCover} onChange={(value) => setFee({ doublesCover: value })} />
                </div>
              )}
              {fee.has && (
                <div className="mt-4 space-y-2 border-t pt-4">
                  <Label className="text-sm">Must the entry fee be paid before the player's entry is confirmed?</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Choice active={fee.confirmNeedsPay === true} onClick={() => setFee({ confirmNeedsPay: true })} title="Yes" desc="Payment is required to confirm the entry. Unpaid players stay unconfirmed and hold up finalising entries." />
                    <Choice active={fee.confirmNeedsPay === false} onClick={() => setFee({ confirmNeedsPay: false })} title="No" desc="Confirm the entry even if the fee is still outstanding. The fee is still owed and players can still pay; it just doesn't hold up the tournament." />
                  </div>
                </div>
              )}
              {fee.has && (
                <div className="mt-4 space-y-2 border-t pt-4" data-testid="accepted-methods">
                  <div className="text-sm font-semibold">Accepted payment methods</div>
                  <p className="text-xs text-muted-foreground">Only the ways your club already accepts (set in Club Admin → Banking) can be chosen. Players' Pay now only offers what you tick; with one method they go straight to it.</p>
                  {!payCfg ? <p className="text-xs text-muted-foreground">Loading your club's payment settings…</p> : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {methodOpts.map((o) => {
                        const on = chosenMethods.includes(o.key);
                        return <button key={o.key} type="button" disabled={!o.available} aria-pressed={on}
                          onClick={() => setFee({ methods: on ? chosenMethods.filter((m) => m !== o.key) : [...chosenMethods, o.key] })}
                          className={cn("rounded-md border p-2 text-left text-sm", on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border", !o.available && "cursor-not-allowed opacity-50")}>
                          <span className="flex items-center gap-1">{on && <Check className="h-3.5 w-3.5" />}{!o.available && <Lock className="h-3.5 w-3.5" />}{o.label}</span>
                          {!o.available && o.why && <span className="block text-[11px] font-normal text-muted-foreground">{o.why}</span>}
                        </button>;
                      })}
                    </div>
                  )}
                  {bankingMissing && <p className="text-xs text-destructive">Payment setup required: your club has no card, EFT or cash payments switched on in Club Admin → Banking. Only adding the fee to the member's account is possible until that's set up.</p>}
                  {availMethods.length === 1 && <p className="text-xs">Your club can accept one method here, so it's used automatically: <b>{availMethods[0].label}</b>.</p>}
                  {payCfg && chosenMethods.length === 0 && <p className="text-xs text-destructive">Choose at least one payment method.</p>}
                  <p className="text-xs text-muted-foreground">Players you enter yourself are not marked paid: they show as Entered · Payment outstanding until they pay.</p>
                </div>
              )}
            </>
          )}

          {cur === "Dates" && (
            <>
              <Q t="On which days will it be played?" h="Add one line for each tournament day." />
              <div className="space-y-2">
                {a.days.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="date" aria-label={`Day ${i + 1}`} className="max-w-[200px]" value={d.date} onChange={(e) => updDay(i, { date: e.target.value })} />
                    <span className="text-xs text-muted-foreground">{d.date && fmtDay(d.date)}</span>
                    <Button variant="ghost" size="icon" aria-label="Remove day" onClick={() => setDays(a.days.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addDay}><Plus className="mr-1 h-4 w-4" />{a.days.length ? "Add another day" : "Add a day"}</Button>
              </div>
            </>
          )}

          {cur === "Courts" && (
            <>
              <Q t="Where and when are courts available?" h="Each day can be different — e.g. Friday evening only, Saturday all day." />
              <div className="space-y-3">
                {a.days.map((d, i) => (
                  <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3 rounded-md border-l-4 border-l-primary bg-muted/40 px-4 py-2.5">
                      <CalendarDays className="h-6 w-6 shrink-0 text-primary" />
                      <div className="leading-tight">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dayParts(d.date).wd}</div>
                        <div className="text-xl font-bold">{dayParts(d.date).rest || "No date"}</div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-lg font-bold leading-tight" aria-live="polite">{d.courtIds?.length ? d.courtIds.length : "—"}</div>
                        <div className="text-xs text-muted-foreground">courts selected</div>
                      </div>
                    </div>
                    <div className="space-y-1"><Label>Venue / club</Label><Input value={d.venue} onChange={(e) => updDay(i, { venue: e.target.value })} placeholder="e.g. Riverside Squash Club" /></div>
                    {clubCourts.length > 0 && (
                      <div className="space-y-1">
                        <Label>Which of your club's courts? (optional)</Label>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 py-1">
                          {clubCourts.map((c) => {
                            const on = d.courtIds?.includes(c.id);
                            return (
                              <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <Checkbox
                                  checked={!!on}
                                  aria-label={c.name}
                                  onCheckedChange={() => { const ids = on ? (d.courtIds ?? []).filter((x) => x !== c.id) : [...(d.courtIds ?? []), c.id]; updDay(i, { courtIds: ids, courts: String(ids.length) }); }}
                                />
                                <span className={cn(on && "font-medium")}>{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <Label>Times courts are free</Label>
                    {d.windows.map((w, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <Input type="time" step={300} className="max-w-[130px]" aria-label="From" value={w.from} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)) })} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="time" step={300} className="max-w-[130px]" aria-label="To" value={w.to} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove time" disabled={d.windows.length === 1} onClick={() => updDay(i, { windows: d.windows.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => updDay(i, { windows: [...d.windows, { from: "", to: "" }] })}><Plus className="mr-1 h-4 w-4" />Add another time slot</Button>
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-lg border border-border p-3" aria-label="Scheduling assumptions">
                <div><div className="font-semibold">Scheduling assumptions</div>
                  <p className="text-xs text-muted-foreground">Used by "Assign courts &amp; times" to draft the timetable. These are court-time estimates for planning only — they don't change scoring or time-capped rules.</p></div>
                {units.some((u) => isBellsUnit(u.key)) && <p className="text-xs text-muted-foreground">Time-capped / Bells {units.every((u) => isBellsUnit(u.key)) ? "games use" : "categories use"} their own slot time from the match format ({[...new Set(units.filter((u) => isBellsUnit(u.key)).map((u) => slotMinutes(scoringFor(u.key)!)))].join(" / ")} min incl. changeover) — no estimate needed here.</p>}
                <div className="grid gap-3 sm:grid-cols-3">
                  {(([["singles", "Court time per Singles match (Standard format)", units.some((u) => u.disc !== "doubles" && !isBellsUnit(u.key))], ["doubles", "Court time per Doubles match (Standard format)", units.some((u) => u.disc === "doubles" && !isBellsUnit(u.key))], ["rest", "Minimum rest for the same player/pair", true]]) as Array<["singles" | "doubles" | "rest", string, boolean]>).filter((x) => x[2]).map(([k, lbl]) => (
                    <label key={k} className="space-y-1 text-sm"><span className="block">{lbl}</span>
                      <span className="flex items-center gap-2"><Input type="number" min={0} step={5} className="max-w-[110px]" aria-label={lbl} value={a.scheduling?.[k] ?? ""}
                        onChange={(e) => setA({ ...a, scheduling: { singles: "", doubles: "", rest: "", ...(a.scheduling ?? {}), [k]: e.target.value } })} />
                        <span className="text-xs text-muted-foreground">min</span></span></label>
                  ))}
                </div>
                {(() => {
                  const sc = { singles: "", doubles: "", rest: "", ...(a.scheduling ?? {}) } as NonNullable<StepAnswers["scheduling"]>;
                  const setSc = (patch: Partial<NonNullable<StepAnswers["scheduling"]>>) => setA({ ...a, scheduling: { ...sc, ...patch } });
                  const ps = sc.playoffStart ?? { mode: "after", gap: "30" };
                  const opt = (on: boolean, label: string, click: () => void) => (
                    <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={on} onChange={click} className="h-4 w-4 accent-primary" />{label}</label>
                  );
                  return (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5" aria-label="Pacing"><div className="text-sm font-medium">Pacing</div>
                        {opt((sc.pace ?? "fast") === "fast", "Start matches and finish as quickly as possible", () => setSc({ pace: "fast" }))}
                        {opt(sc.pace === "spread", "Spread matches across the available tournament period", () => setSc({ pace: "spread" }))}
                      </div>
                      <div className="space-y-1.5" aria-label="Playoff start"><div className="text-sm font-medium">Playoff start <span className="text-xs font-normal text-muted-foreground">(when playoffs are planned)</span></div>
                        {opt(ps.mode !== "fixed", "A set time after the last qualifying match finishes", () => setSc({ playoffStart: { ...ps, mode: "after" } }))}
                        {ps.mode !== "fixed" && <span className="ml-6 flex items-center gap-2"><Input type="number" min={0} step={5} className="max-w-[90px]" aria-label="Minutes after the last qualifying match" value={ps.gap ?? ""} onChange={(e) => setSc({ playoffStart: { ...ps, gap: e.target.value } })} /><span className="text-xs text-muted-foreground">min later</span></span>}
                        {opt(ps.mode === "fixed", "At a specific day and time", () => setSc({ playoffStart: { ...ps, mode: "fixed" } }))}
                        {ps.mode === "fixed" && <span className="ml-6 flex flex-wrap items-center gap-2">
                          <select aria-label="Playoff day" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={ps.date ?? ""} onChange={(e) => setSc({ playoffStart: { ...ps, date: e.target.value } })}>
                            <option value="">Choose day…</option>
                            {a.days.filter((d) => d.date).map((d) => <option key={d.date} value={d.date}>{new Date(`${d.date}T00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</option>)}
                          </select>
                          <Input type="time" step={300} className="max-w-[120px]" aria-label="Playoff start time" value={ps.time ?? ""} onChange={(e) => setSc({ playoffStart: { ...ps, time: e.target.value } })} />
                        </span>}
                        <p className="text-xs text-muted-foreground">Playoff games (players still TBD) are scheduled in the same run, so their courts are kept free.</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {clubCourts.length > 0 && (
                <div className="space-y-3 rounded-lg border border-border p-3" aria-label="Court restrictions">
                  <div><div className="font-semibold">Court restrictions (optional)</div>
                    <p className="text-xs text-muted-foreground">By default games may use any court ticked above. Pin a category, league, pool or round to specific courts only when needed.</p></div>
                  {(a.courtRules ?? []).map((r, ri) => {
                    const upd = (p: Partial<typeof r>) => setA({ ...a, courtRules: (a.courtRules ?? []).map((x, j) => (j === ri ? { ...x, ...p } : x)) });
                    return (
                      <div key={ri} className="space-y-2 rounded-md bg-muted/40 p-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="space-y-1 text-xs"><span className="block">Applies to</span>
                            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Applies to" value={r.key} onChange={(e) => upd({ key: e.target.value })}>
                              <option value="">All categories</option>
                              {[...new Set(cats)].map((c) => <option key={c} value={c}>{c}</option>)}
                              {units.filter((u) => u.key.includes("::")).map((u) => <option key={u.key} value={u.key}>{u.base}</option>)}
                            </select></label>
                          <label className="space-y-1 text-xs"><span className="block">Round (optional)</span><Input type="number" min={1} className="h-9 w-24" aria-label="Round" value={r.round} onChange={(e) => upd({ round: e.target.value })} /></label>
                          <label className="space-y-1 text-xs"><span className="block">Pool (optional)</span><Input type="number" min={1} className="h-9 w-24" aria-label="Pool" value={r.pool} onChange={(e) => upd({ pool: e.target.value })} /></label>
                          <Button variant="ghost" size="icon" aria-label="Remove restriction" onClick={() => setA({ ...a, courtRules: (a.courtRules ?? []).filter((_, j) => j !== ri) })}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          {clubCourts.map((c) => { const on = r.courtIds.includes(c.id); return (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox checked={on} aria-label={`Restriction court ${c.name}`} onCheckedChange={() => upd({ courtIds: on ? r.courtIds.filter((x) => x !== c.id) : [...r.courtIds, c.id] })} />
                              <span>{c.name}</span></label>); })}
                        </div>
                        {r.courtIds.length === 0 && <p className="text-xs text-muted-foreground">Tick at least one court, otherwise this restriction is ignored.</p>}
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => setA({ ...a, courtRules: [...(a.courtRules ?? []), { key: "", round: "", pool: "", courtIds: [] }] })}><Plus className="mr-1 h-4 w-4" />Add court restriction</Button>
                </div>
              )}
            </>
          )}

          {cur === "Format" && (
            <>
              <Q t="What format are you planning?" h="How players will compete — separate from how each match is scored." />
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">This is your planned format. Once registrations close and final player numbers are known, SquashHub will revisit the format with you before pools, draws or fixtures are generated.</div>
              <FormatFields value={format} onChange={setFormat} units={units} entries={a.unitEntries ?? {}} />
              {units.length > 1 && <div className="space-y-3 border-t border-border pt-4">
                <div className="text-sm font-semibold">Category and subcategory exceptions</div>
                <p className="text-xs text-muted-foreground">Leave a group on the tournament format, or plan a different one.</p>
                {cats.map((cat) => {
                  const subs = units.filter((u) => u.key.startsWith(`${cat}::`));
                  const catUnits = units.filter((u) => u.key === cat || u.key.startsWith(`${cat}::`));
                  return <div key={cat} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="text-sm font-semibold">{cat}</div>
                    {subs.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Category default:</span>
                      <Button type="button" size="sm" variant={!a.formatOverrides?.[cat] ? "default" : "outline"} onClick={() => setFormatOverride(cat, null)}>Inherit tournament</Button>
                      <Button type="button" size="sm" variant={a.formatOverrides?.[cat] ? "default" : "outline"} onClick={() => setFormatOverride(cat, {})}>Change category</Button>
                    </div>}
                    {subs.length > 0 && a.formatOverrides?.[cat] && <FormatFields value={a.formatOverrides[cat]} onChange={(patch) => setFormatOverride(cat, patch)} units={units} compact entries={a.unitEntries ?? {}} scope={units.filter((u) => u.key === cat || u.key.startsWith(cat + "::")).map((u) => u.key)} />}
                    {catUnits.map((u) => <div key={u.key} className="space-y-2 border-t border-border pt-2">
                      <div className="text-xs font-medium">{subs.length ? u.base.split(" › ").slice(1).join(" › ") : u.base} · {formatDetail(formatFor(u.key))}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant={!a.formatOverrides?.[u.key] ? "default" : "outline"} onClick={() => setFormatOverride(u.key, null)}>Inherit {subs.length ? "category" : "tournament"}</Button>
                        <Button type="button" size="sm" variant={a.formatOverrides?.[u.key] ? "default" : "outline"} onClick={() => setFormatOverride(u.key, {})}>Change this {subs.length ? "subcategory" : "category"}</Button>
                      </div>
                      {a.formatOverrides?.[u.key] && <FormatFields value={a.formatOverrides[u.key]} onChange={(patch) => setFormatOverride(u.key, patch)} units={units} compact entries={a.unitEntries ?? {}} scope={[u.key]} />}
                    </div>)}
                  </div>;
                })}
              </div>}
              {dblUnits.length > 0 && <div className="space-y-3 border-t border-border pt-4">
                <div className="text-sm font-semibold">Doubles serving method</div>
                <p className="text-xs text-muted-foreground">How service rotates in doubles games. Set per doubles category — each can differ. "Not set" means the marker picks the server manually.</p>
                {dblUnits.length > 1 && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Same for all doubles:</span>
                  {DOUBLES_SERVING_METHODS.map((m) => <Button key={m.value} type="button" size="sm" variant="outline" onClick={() => setA({ ...a, serving: Object.fromEntries(dblUnits.map((u) => [u.key, m.value])) })}>{m.label}</Button>)}
                </div>}
                {dblUnits.map((u) => <div key={u.key} className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`sbs-serve-${u.key}`} className="min-w-[200px] text-sm">{u.base}</Label>
                  <select id={`sbs-serve-${u.key}`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={a.serving?.[u.key] ?? ""}
                    onChange={(e) => { const next = { ...(a.serving ?? {}) }; if (e.target.value) next[u.key] = e.target.value as DoublesServingMethod; else delete next[u.key]; setA({ ...a, serving: next }); }}>
                    <option value="">Not set</option>
                    {DOUBLES_SERVING_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  {a.serving?.[u.key] && <span className="text-xs text-muted-foreground">{DOUBLES_SERVING_METHODS.find((m) => m.value === a.serving?.[u.key])?.hint}</span>}
                </div>)}
              </div>}
            </>
          )}

          {cur === "Basics" && (
            <>
              <Q t={isChamps ? "Club Championships basics" : "Tournament basics"} h="The tournament's name and who it belongs to — not how it is played." />
              <div className="space-y-1"><Label htmlFor="sbs-name">Tournament name</Label><Input id="sbs-name" value={a.name ?? ""} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder={isChamps ? "e.g. Riverside Club Championships 2026" : "e.g. Riverside Spring Open"} /></div>
              <div className="space-y-1">
                <Label>Event level</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => <Choice key={s} active={a.scope === s} onClick={() => setA({ ...a, scope: s })} title={SCOPE_LABEL[s]} desc={SCOPE_DESC[s]} />)}
                </div>
              </div>
              {a.scope && <div className="max-w-[460px] space-y-1 rounded-md border border-border bg-muted/40 p-3">
                <p className="text-sm">Owner: <b>{derivedOwner ?? (ownerLoading ? "Looking up…" : "Not found")}</b> <Lock className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" /></p>
                <p className="text-xs text-muted-foreground">
                  {derivedOwner
                    ? a.scope === "club" ? "Your club. Only this club's members fall under this level."
                      : a.scope === "regional" ? "The association your club belongs to, taken from the SquashHub federation tree. Clubs and members under it fall under this level."
                      : "The national federation at the top of the SquashHub federation tree."
                    : ownerLoading ? "Reading the SquashHub federation tree…"
                      : a.scope === "regional" ? "Your club isn't linked to an association in the SquashHub federation tree yet. A super admin must link it before a regional event can be owned." : "No national federation is set up in the SquashHub federation tree yet."}
                </p>
                <p className="text-xs text-muted-foreground">Set automatically — it can't be typed or changed here.</p>
              </div>}
              {isChamps && <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="sbs-start">Starts</Label><Input id="sbs-start" type="date" value={a.periodStart ?? ""} onChange={(e) => setA({ ...a, periodStart: e.target.value })} /></div>
                </div>}
              {isChamps && <p className="text-xs text-muted-foreground">No end date needed — the championships end with the last stage you plan (normally the final) in Stages &amp; scheduling.</p>}
            </>
          )}

          {cur === "ExpEntries" && (
            <>
              <Q t="How many entries do you expect in each group?" h="Rough guesses are fine — they stay provisional until registrations close." />
              <p className="text-xs text-muted-foreground">Categories and subcategories are not pools. A group like Men's A may later be split into one or more pools once real entries are known.</p>
              <div className="space-y-2">{units.map((u) => (
                <div key={u.key} className="flex items-center gap-2">
                  <span className="w-64 truncate text-sm">{u.label}</span>
                  <Input type="number" min={1} className="max-w-[120px]" aria-label={`Expected entries for ${u.base}`} value={a.unitEntries?.[u.key] ?? ""} onChange={(e) => setA({ ...a, unitEntries: { ...(a.unitEntries ?? {}), [u.key]: e.target.value } })} placeholder="e.g. 8" />
                  <span className="text-xs text-muted-foreground">{u.disc === "doubles" ? "pairs" : "players"}</span>
                </div>
              ))}</div>
            </>
          )}

          {cur === "Seeding" && (
            <>
              <Q t="How do you plan to seed?" h="Seeding decides who is kept apart early. This is only a plan." />
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Provisional while entries are open. No seeds are generated or locked now — at the {isChamps ? "Final Format Review" : "Confirm final format checkpoint"} you'll confirm seeding with the actual entrants before pools, draws or fixtures are made.</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(SEED_LABEL) as SeedMethod[]).map((m) => <Choice key={m} active={a.seeding === m} onClick={() => setA({ ...a, seeding: m })} title={SEED_LABEL[m]} desc={SEED_DESC[m]} />)}
              </div>
              {units.length > 1 && <div className="space-y-2 border-t border-border pt-4">
                <div className="text-sm font-semibold">Category and subcategory exceptions</div>
                {units.map((u) => (
                  <div key={u.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-56 truncate">{u.base}</span>
                    <select aria-label={`Seeding for ${u.base}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={a.seedingOverrides?.[u.key] ?? ""}
                      onChange={(e) => { const n = { ...(a.seedingOverrides ?? {}) }; if (e.target.value) n[u.key] = e.target.value as SeedMethod; else delete n[u.key]; setA({ ...a, seedingOverrides: n }); }}>
                      <option value="">Same as tournament{a.seeding ? ` (${SEED_LABEL[a.seeding]})` : ""}</option>
                      {(Object.keys(SEED_LABEL) as SeedMethod[]).map((m) => <option key={m} value={m}>{SEED_LABEL[m]}</option>)}
                    </select>
                  </div>
                ))}
              </div>}
            </>
          )}

          {cur === "Schedule" && (
            <>
              <Q t="How will each stage be scheduled?" h="This is the whole timeline, from Round 1 to the final. Playoffs follow once a category's rounds are done — no separate question needed." />
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Play by a date: players arrange and book their own match before the deadline — no courts are blocked. Scheduled: a set date, time window and courts. Categories progress independently through main rounds. Stage names are a plan; the real rounds come from the format you confirm after registrations close.</div>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="text-sm font-semibold">Should playoff stages be synchronised across the Club Championships?</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice active={a.playoffSync === true} onClick={() => setA({ ...a, playoffSync: true })} title="Yes — common playoff dates" desc="Shared playoff stages use one date for every relevant category — e.g. a Semifinals Night and a Finals Day — with courts reserved centrally." />
                  <Choice active={a.playoffSync === false} onClick={() => setA({ ...a, playoffSync: false })} title="No — schedule per category" desc="Each category gets its own playoff dates, deadlines, times and courts." />
                  <Choice active={a.playoffSync === "later"} onClick={() => setA({ ...a, playoffSync: "later" })} title="Decide later" desc="Keep planning; keep playoff dates provisional." />
                </div>
                {a.playoffSync === true && <p className="text-xs text-muted-foreground">Common dates don't mean identical structures: a category starting at quarterfinals plays them before the common Semifinals Night. Categories progress at their own pace and those that finish early wait for the common date.</p>}
              </div>
              {stages.length === 0 && <Button variant="outline" size="sm" onClick={suggestStages}>Suggest a starting plan from your choices</Button>}
              <div className="space-y-3">
                <div className="text-sm font-semibold">Main rounds</div>
                {mainStages.length === 0 && <p className="text-xs text-muted-foreground">No main rounds yet.</p>}
                {mainStages.map(renderStage)}
                <Button variant="outline" size="sm" onClick={() => setStages([...stages, newStage(`Round ${mainStages.length + 1}`, "play_by", "", "main")])}><Plus className="mr-1 h-4 w-4" />Add main round</Button>
              </div>
              <TieBreakFields value={a.tieBreaks} onChange={(v) => setA((prev) => ({ ...prev, tieBreaks: v }))} />
              <div className="rounded-md border-2 border-primary bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary">▼ Playoffs begin</div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">Will there be playoffs? <span className="font-normal text-muted-foreground">· {playoff.choice === "none" ? "no playoffs" : playoff.choice === "playoffs" ? "planned below" : "not decided"}{a.playoffSync === true ? " · common dates" : a.playoffSync === false ? " · per category" : a.playoffSync === "later" ? " · synchronisation decided later" : ""}</span></div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Playoff decision">
                  <Button type="button" size="sm" variant={playoff.choice === "none" ? "default" : "outline"} aria-pressed={playoff.choice === "none"} onClick={() => setPlayoff({ choice: "none" })}>{format.kind === "swiss" ? "No playoffs — finish on Swiss standings" : format.kind === "cross" ? "No playoffs — finish on standings" : "No playoffs"}</Button>
                  <Button type="button" size="sm" variant={playoff.choice === "playoffs" ? "default" : "outline"} aria-pressed={playoff.choice === "playoffs"} onClick={() => setPlayoff({ choice: "playoffs" })}>Yes — playoff stages below</Button>
                  <Button type="button" size="sm" variant={playoff.choice === "later" ? "default" : "outline"} aria-pressed={playoff.choice === "later"} onClick={() => setPlayoff({ choice: "later" })}>Decide later</Button>
                </div>
                {playoff.choice === "later" && <p className="text-xs text-muted-foreground">Left open for now — decide before the final format review. Until then nothing playoff is generated.</p>}
                <p className="text-xs text-muted-foreground">Playoffs don't copy the main-round schedule — pick a method for each.</p>
                {playoffStages.length === 0 && <p className="text-xs text-muted-foreground">No playoff stages yet.</p>}
                {playoffStages.map(renderStage)}
                <Button variant="outline" size="sm" onClick={() => { const used = playoffStages.filter((x) => !x.unit).map((x) => x.name); const next = PLAYOFF_STAGE_NAMES.find((n) => !used.includes(n)) ?? "Final"; setPlayoff({ choice: "playoffs" }); setStages([...stages, newStage(next, "later", "", "playoff")]); }}><Plus className="mr-1 h-4 w-4" />Add playoff stage</Button>
               {units.filter((u) => poolRule(u.key).mode !== "none" && playoffStages.some((s) => !s.unit || s.unit === u.key || s.unit === u.key.split("::")[0])).map((u) => {
                 const q = poolQualification(u.key);
                 // First CONFIGURED play-off stage (own stages win, else shared) — never assume Quarterfinals.
                 const ms = milestoneFor(a as any, u.key);
                 const first = ms.label ? { name: ms.label } : null;
                 const field = ms.fieldSize;
                 const expected = Number(a.unitEntries?.[u.key]) || 0;
                 const nPools = expected ? recommendPools(expected, Number(poolRule(u.key).target) || 5).length : 0;
                 return <div key={u.key} className="space-y-1 border-t border-border pt-2 text-xs"><div className="font-medium">{u.base} · {first?.name} qualification</div>
                   <div className="flex flex-wrap items-center gap-2"><Label>Qualifiers from each pool</Label><Input type="number" min={1} className="h-8 w-20" aria-label={`Qualifiers per pool for ${u.base}`} placeholder="Auto" value={q.perPool ?? ""} onChange={(e) => setPoolQualification(u.key, { perPool: e.target.value })} />
                   <Label>Best runners-up</Label><Input type="number" min={0} className="h-8 w-20" aria-label={`Best runners-up for ${u.base}`} placeholder="0" value={q.runnersUp ?? ""} onChange={(e) => setPoolQualification(u.key, { runnersUp: e.target.value })} /></div>
                   <p className="text-muted-foreground">{field ? `${first?.name} needs ${field} qualifiers. ` : ""}{nPools && field ? `${nPools} estimated pools × ${Number(q.perPool) || "?"} per pool + ${Number(q.runnersUp) || 0} best runners-up${Number(q.perPool) ? ` = ${nPools * Number(q.perPool) + (Number(q.runnersUp) || 0)} planned qualifiers` : " (pool count confirmed after entries close)"}. ` : ""}Confirm the actual pool count and field size before the draw.</p>
                   {Number(q.runnersUp) > 0 && <p className="text-destructive">Best runners-up cannot be mapped automatically yet; the playoff stage must be set up after pool play.</p>}
                 </div>;
               })}
              </div>
              <ConflictPanel conflicts={conflicts} onResolve={(c, pick) => setA(resolveConflict(a, c, pick) as StepAnswers)} />
              {stages.length > 0 && <div className="space-y-1 border-t border-border pt-3"><div className="text-sm font-semibold">Stage-by-stage plan</div><StageTable stages={stages} unitName={stageUnit} when={stageWhen} /></div>}
              {a.planId && <StageCourtBookings clubId={clubId} planId={a.planId} label={a.name?.trim() || "Club Championships"} stages={stages.map((x) => ({ ...x, name: `${x.name} (${stageUnit(x.unit)})` }))} courtName={(id) => clubCourts.find((c) => c.id === String(id))?.name ?? `Court ${id}`} />}
            </>
          )}

          {cur === "Playoffs" && (
            <>
              <Q t="Will there be playoffs?" h="Playoffs follow your planned format. Categories inherit the tournament plan unless you choose an exception below. Planning only — no draw or fixtures are made, and this is revisited at Confirm final format." />
              <PlayoffFields value={playoff} onChange={setPlayoff} format={format.kind} />
              <TieBreakFields value={a.tieBreaks} onChange={(v) => setA((prev) => ({ ...prev, tieBreaks: v }))} />
              {units.length > 1 && <div className="space-y-3 border-t border-border pt-4">
                <div className="text-sm font-semibold">Category and subcategory exceptions</div>
                <p className="text-xs text-muted-foreground">Leave a group on the tournament plan, or give it its own playoff structure.</p>
                {cats.map((cat) => {
                  const subs = units.filter((u) => u.key.startsWith(`${cat}::`));
                  const catUnits = units.filter((u) => u.key === cat || u.key.startsWith(`${cat}::`));
                  return <div key={cat} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="text-sm font-semibold">{cat}</div>
                    {subs.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Category default:</span>
                      <Button type="button" size="sm" variant={!a.playoffOverrides?.[cat] ? "default" : "outline"} onClick={() => setPlayoffOverride(cat, null)}>Inherit tournament</Button>
                      <Button type="button" size="sm" variant={a.playoffOverrides?.[cat] ? "default" : "outline"} onClick={() => setPlayoffOverride(cat, {})}>Change category</Button>
                    </div>}
               {units.filter((u) => poolRule(u.key).mode !== "none" && playoffFor(u.key).choice === "playoffs").map((u) => {
                 const q = poolQualification(u.key);
                 return <div key={u.key} className="space-y-1 border-t border-border pt-2 text-xs"><div className="font-medium">{u.base} · Pool qualification for {playoffText(playoffFor(u.key))} ({2 ** playoffFor(u.key).rounds} places)</div>
                   <div className="flex flex-wrap items-center gap-2"><Label>Qualifiers from each pool</Label><Input type="number" min={1} className="h-8 w-20" aria-label={`Qualifiers per pool for ${u.base}`} placeholder="Auto" value={q.perPool ?? ""} onChange={(e) => setPoolQualification(u.key, { perPool: e.target.value })} /><Label>Best runners-up</Label><Input type="number" min={0} className="h-8 w-20" aria-label={`Best runners-up for ${u.base}`} placeholder="0" value={q.runnersUp ?? ""} onChange={(e) => setPoolQualification(u.key, { runnersUp: e.target.value })} /></div>
                   <p className="text-muted-foreground">Actual pool count and qualifying field are checked at Generate draw & fixtures.</p>
                   {Number(q.runnersUp) > 0 && <p className="text-destructive">Best runners-up require manual playoff setup after pool play.</p>}
                 </div>;
               })}
                    {subs.length > 0 && a.playoffOverrides?.[cat] && <PlayoffFields value={a.playoffOverrides[cat]} onChange={(patch) => setPlayoffOverride(cat, patch)} format={formatFor(cat).kind} />}
                    {catUnits.map((u) => <div key={u.key} className="space-y-2 border-t border-border pt-2">
                      <div className="text-xs font-medium">{subs.length ? u.base.split(" › ").slice(1).join(" › ") : u.base} · {playoffDetail(playoffFor(u.key), formatFor(u.key).kind, koPath(u.key))}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant={!a.playoffOverrides?.[u.key] ? "default" : "outline"} onClick={() => setPlayoffOverride(u.key, null)}>Inherit {subs.length ? "category" : "tournament"}</Button>
                        <Button type="button" size="sm" variant={a.playoffOverrides?.[u.key] ? "default" : "outline"} onClick={() => setPlayoffOverride(u.key, {})}>Change this {subs.length ? "subcategory" : "category"}</Button>
                      </div>
                      {a.playoffOverrides?.[u.key] && <PlayoffFields value={a.playoffOverrides[u.key]} onChange={(patch) => setPlayoffOverride(u.key, patch)} format={formatFor(u.key).kind} />}
                    </div>)}
                  </div>;
                })}
              </div>}
              <div className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
                <div className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-4 w-4 text-primary" />SquashHub Tip <span className="text-xs font-normal text-muted-foreground">(advice only{provisional ? " · provisional" : ""})</span></div>
                <p className="mt-1">{knownField ? `${entryCount} selected ${pairMode ? "entries (pairs count as one)" : "players"}${provisional ? " (some are not placed yet)" : ""}` : `${fieldCount || "No"} estimated entries${pickIds.length ? `, including ${pickIds.length} picked so far` : ""}`} across {units.length} group{units.length === 1 ? "" : "s"}.</p>
                {units.filter((u) => playoffActive(u.key)).map((u) => {
                  const p = playoffFor(u.key); const picked = groupCount(u.key);
                  const count = knownField && !provisional ? picked : units.length === 1 ? fieldCount : null;
                  const needed = 2 ** p.rounds;
                  const suggested = count !== null && u.disc !== "doubles" ? count >= 8 ? "Quarterfinals + Semifinals + Final" : count >= 4 ? "Semifinals + Final" : count >= 2 ? "Final only" : "No playoff bracket yet" : null;
                  return <p key={u.key} className="mt-1 text-xs">{u.base}: {knownField && !provisional ? `${picked} selected ${u.disc === "doubles" ? "players (pair count not yet confirmed)" : "players"}` : `${picked} selected players${count ? `; about ${count} estimated entries` : `; group total unknown (overall estimate: ${fieldCount})`} (provisional)`}; {playoffText(p)} needs {needed} qualifying {u.disc === "doubles" ? "pairs" : "players"}{count !== null && u.disc !== "doubles" && count < needed ? " — fewer currently indicated, so a smaller bracket may suit better" : ""}.{suggested && ` A simple ${knownField && !provisional ? "field-size suggestion" : "provisional suggestion"} is ${suggested}.`}</p>;
                })}
                {plannedPlayoffMatches > 0 && <p className="mt-2">Those stages would add at least {plannedPlayoffMatches} match{plannedPlayoffMatches === 1 ? "" : "es"}. {capacityEstimateValid && courtsOk && daysOk ? `At an illustrative ${units.some((u) => (scoringFor(u.key) ?? scoring)?.mode === "standard" && playoffActive(u.key)) ? "35 min (best of 3) / 55 min (best of 5) for standard matches, or the chosen Bells slot time" : "chosen Bells slot time"}, the playoff matches alone use about ${Math.round(playoffMinutes / 60 * 10) / 10} of ${Math.round(courtHours * 10) / 10} available court-hours across ${a.days.length} day${a.days.length === 1 ? "" : "s"}. ${playoffMinutes <= courtHours * 60 ? "They appear to fit by total court time, subject to the full schedule." : "They exceed the available court time on this rough estimate."}` : "Complete the match duration and court times for a rough fit check."}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Pool games, rest, changeovers, actual match lengths, fixed court slots and simultaneous groups are not included. Dates, courts or entry counts may change; review this advice again when actual entries are known. Your choice is never blocked by this tip.</p>
              </div>
            </>
          )}

          {cur === "Summary" && (
            <>
              <Q t="Here's what we know so far" h="Check it over. Tap Edit on any part to change it." />
              {handoverPanel("top")}
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Tournament" onEdit={() => go("Basics")}>{a.name || "Unnamed"} · {ownerText}{isChamps && ` · ${periodText}`}</SummaryRow>
              {isChamps ? <SummaryRow icon={<Users className="h-4 w-4" />} label="Expected entries (provisional)" onEdit={() => go("ExpEntries")}>
                <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">about {a.unitEntries?.[u.key] || "?"}</span></li>)}</ul>
              </SummaryRow> : <SummaryRow icon={<Users className="h-4 w-4" />} label={knownField ? "Players" : "Expected entries"} onEdit={() => go(knownField ? "Pick" : "Entries")}>{knownField ? `${pickIds.length} picked (exact)` : `About ${a.entries} (estimate)`}</SummaryRow>}
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="What will be played" onEdit={() => go("What")}>{a.playType ? PLAY_LABEL[a.playType] : "Not chosen"}</SummaryRow>
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Match format" onEdit={() => go("Match")}>
                <div>{scoring ? scoringText(scoring) : "Not chosen"}{units.length > 0 && <span className="text-muted-foreground"> · {validOverrides.length ? "tournament default" : "all groups"}</span>}</div>
                {validOverrides.length > 0 && <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{scoringText(scoringFor(u.key) ?? DEFAULT_SCORING)}</span></li>)}</ul>}
              </SummaryRow>
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Planned competition format" onEdit={() => go("Format")}>
                <div>{formatDetail(format)}{units.length > 0 && <span className="text-muted-foreground"> · {formatExceptions.length ? "tournament default" : "all groups"}</span>}</div>
                {formatExceptions.length > 0 && <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{formatDetail(formatFor(u.key))}</span></li>)}</ul>}
              </SummaryRow>
              <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Seeding (provisional)" onEdit={() => go("Seeding")}>
                <div>{a.seeding ? SEED_LABEL[a.seeding] : "Not chosen"}{units.length > 0 && <span className="text-muted-foreground"> · {seedExceptions.length ? "tournament default" : "all groups"}</span>}</div>
                {seedExceptions.length > 0 && <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{seedFor(u.key) ? SEED_LABEL[seedFor(u.key)!] : "Not chosen"}</span></li>)}</ul>}
                <span className="text-xs text-muted-foreground">No seeds are generated or locked now.</span>
              </SummaryRow>
              <SummaryRow icon={<ShieldCheck className="h-4 w-4" />} label={isChamps ? "Final Format Review (future checkpoint)" : "Confirm final format (future checkpoint)"} onEdit={() => go("Format")}>
                <span className="text-muted-foreground">Required after registrations close. You will review:</span>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  <li>Actual entrants per category/subcategory</li>
                  <li>Planned competition format — confirm or reconsider</li>
                  <li>Pool / draw / Swiss structure</li>
                  <li>Seeding</li>
                  {isChamps ? <li>Where the playoff phase begins per category</li> : <li>Playoffs</li>}
                  <li>Dates, courts{isChamps ? " and the stage-by-stage schedule" : ""}</li>
                </ul>
                <span className="text-muted-foreground">SquashHub may suggest alternatives but never changes your choices automatically. Pools, draws and fixtures are made only after you confirm. Not active in this beta.</span>
              </SummaryRow>
              {!isChamps && <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Playoffs" onEdit={() => go("Playoffs")}>
                <div>{playoffDetail(playoff, format.kind)}{units.length > 0 && <span className="text-muted-foreground"> · {playoffExceptions.length ? "tournament default" : "all groups"}</span>}</div>
                {playoffExceptions.length > 0 && <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{playoffDetail(playoffFor(u.key), formatFor(u.key).kind, koPath(u.key))}</span></li>)}</ul>}
                {provisional && <span className="text-xs text-muted-foreground">Recommendations provisional until entries are known.</span>}
              </SummaryRow>}
              <SummaryRow icon={<Tags className="h-4 w-4" />} label="Categories" onEdit={() => go("Categories")}>
                <ul className="space-y-0.5">{cats.map((c, i) => {
                  const subs = (a.subcats[c] ?? []).map((s) => s.trim()).filter(Boolean);
                  return <li key={i}>{c}{subs.length > 0 ? <span className="text-muted-foreground"> — {subs.map((x) => `${x} ${discText(`${c}::${x}`)}`).join(", ")}</span> : <span className="text-muted-foreground"> — {discText(c)}</span>}</li>;
                })}</ul>
              </SummaryRow>
              {dblUnits.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label="Doubles partners" onEdit={() => go("Partners")}>
                <ul className="space-y-0.5">{dblUnits.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "Not chosen"}</span></li>)}<li>A player may register both partners: <span className="text-muted-foreground">{ruleAnswer(a.doublesEntry ?? null)}</span></li></ul>
              </SummaryRow>}
              <SummaryRow icon={<UserPlus className="h-4 w-4" />} label="How players join" onEdit={() => go("Players")}>{a.source ? SOURCE_LABEL[a.source] : "Not chosen"}</SummaryRow>
              <SummaryRow icon={<ShieldCheck className="h-4 w-4" />} label="Who may enter" onEdit={() => go("Eligibility")}>
                <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{eligText(u.key)}</span></li>)}</ul>
              </SummaryRow>
              {pickIds.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label={pairMode ? "Selected & paired players" : "Picked players"} onEdit={() => go("Pick")}>
                <ul className="space-y-0.5">{pickIds.filter((id) => placesFor(id).some((k) => !adminPairKeys.has(k)) || placesFor(id).length === 0).map((id) => <li key={id}>{memberName(id)} <span className="text-muted-foreground">— {placesFor(id).filter((k) => !adminPairKeys.has(k)).map(unitLabel).join(", ") || "Not placed yet"}</span></li>)}</ul>
                {adminPairUnits.map((u) => pairsFor(u.key).length > 0 || unpairedIn(u.key).length > 0 ? (
                  <ul key={u.key} className="mt-1 space-y-0.5">
                    {pairsFor(u.key).map(([x, y]) => <li key={x + y}>{memberName(x)} &amp; {memberName(y)} <span className="text-muted-foreground">— {u.label} (pair)</span></li>)}
                    {unpairedIn(u.key).map((id) => <li key={id} className="text-destructive">{memberName(id)} — {u.label}: not paired yet</li>)}
                  </ul>
                ) : null)}
              </SummaryRow>}
              {selfEntry && <SummaryRow icon={<Mail className="h-4 w-4" />} label="Invitations" onEdit={() => go("Invites")}>{a.invite ? INVITE_LABEL[a.invite] : "Not chosen"} <span className="text-muted-foreground">· not sent</span></SummaryRow>}
              {(selfEntry || notifyOnly) && <SummaryRow icon={<MessageSquare className="h-4 w-4" />} label={notifyOnly ? "Entry notification" : "Messaging"} onEdit={() => go("Messaging")}><b>{notifyOnly ? "Participation notification" : "Invitation"}</b> · {msgSummary}{notifyOnly && fee.has ? " · includes amount due and Pay now" : ""} <span className="text-muted-foreground">· setup only, not sent{notifyOnly ? " · no invitation needed, players are entered by you" : ""}</span><div className="text-xs">WhatsApp group: {waUrl ? `group link configured · ${wa.include ? "join link included in messages" : "link not included in messages"}` : wa.use === false ? "none" : "not set"}</div><div className="text-xs">Draw notifications: {a.drawNotify === false ? "Off" : "On (Round 1 and each later stage; all round booking dates listed when the draw is made upfront)"}</div><div className="text-xs">After-match notifications: {am.on === null ? "not set (existing default: email after every match)" : am.on ? `On · ${am.channels.filter((c) => chAvail(c as Channel)).map((c) => ({ in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" } as Record<string, string>)[c]).join(" + ") || "no channel"}${am.scope === "playoffs" ? " · playoffs only" : ""}` : "Off"}</div></SummaryRow>}
              <SummaryRow icon={<Wallet className="h-4 w-4" />} label="Fees & Payment" onEdit={() => go("Fees")}>
                {fee.has ? <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{feeUnitText(u)}</span></li>)}</ul> : feeSummary}
                {dblUnits.length > 0 && <ul className="space-y-0.5"><li>One player may pay for both: <span className="text-muted-foreground">{ruleAnswer(fee.doublesCover)}</span></li></ul>}
                <ul className="space-y-0.5"><li>Fee due: <span className="text-muted-foreground">{fee.has ? "Yes" : fee.has === false ? "No" : "Not chosen"}</span></li>{fee.has && <li>Payment required to confirm entry: <span className="text-muted-foreground">{fee.confirmNeedsPay === true ? "Yes — unpaid entries stay unconfirmed" : fee.confirmNeedsPay === false ? "No — entries are confirmed; the fee stays outstanding until paid" : "Not chosen"}</span></li>}</ul>
                {fee.has && <ul className="space-y-0.5"><li>Accepted methods: <span className="text-muted-foreground">{methodText}</span></li>{showPick && <li>Picked entrants: <span className="text-muted-foreground">Entered · Payment outstanding (admin selection never marks paid)</span></li>}</ul>}
                <span className="text-muted-foreground"> · setup only, no payments taken</span>
              </SummaryRow>
              {isChamps && <SummaryRow icon={<Trophy className="h-4 w-4" />} label="Rounds → playoffs (provisional)" onEdit={() => go("Schedule")}>
                <div className="text-muted-foreground">Playoffs follow each category's planned rounds in the stage sequence.</div>
                <div>Playoff dates: <span className="text-muted-foreground">{a.playoffSync === null || a.playoffSync === undefined ? "Not chosen" : a.playoffSync === "later" ? "Decide later" : a.playoffSync ? `Synchronised across the championships` : "Scheduled separately per category"}</span></div>
              </SummaryRow>}
              {isChamps && <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Stage plan (provisional)" onEdit={() => go("Schedule")}>
                <StageTable stages={stages} unitName={stageUnit} when={stageWhen} />
                <span className="text-xs text-muted-foreground">Deadlines and sessions attach to real fixtures only after the Final Format Review. Each category progresses on its own.</span>
              </SummaryRow>}
              {!isChamps && <SummaryRow icon={<CalendarDays className="h-4 w-4" />} label="Tournament dates" onEdit={() => go("Dates")}>{a.days.map((d) => fmtDay(d.date)).join(", ")}</SummaryRow>}
              {!isChamps && <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Venue & courts" onEdit={() => go("Courts")}>
                <ul className="space-y-0.5">{a.days.map((d, i) => (
                  <li key={i}>{fmtDay(d.date)}: {d.venue}, {d.courts} court{Number(d.courts) === 1 ? "" : "s"}{courtNames(d) && ` (${courtNames(d)})`}, {d.windows.map((w) => `${w.from}–${w.to}`).join(" & ")}</li>
                ))}</ul>
              </SummaryRow>}
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm font-medium">
                SquashHub now knows your {knownField ? "players" : "expected entries"}, categories, who may enter, dates and available court time.
                {!knownField && <span className="block text-xs font-normal text-muted-foreground">The field is provisional until entries close.</span>}
              </div>
              {!isChamps && tipReady && (
                <div className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold"><Lightbulb className="h-4 w-4 text-primary" />SquashHub Tip <span className="text-xs font-normal text-muted-foreground">(advice only)</span></div>
                  <p className="mt-1">Based on what you've entered so far, a round-robin format may be practical. We'll help you confirm the format in the next steps.</p>
                  <p className="mt-1 text-xs text-muted-foreground">You have about {Math.round(courtHours * 10) / 10} court-hours over {a.days.length} day{a.days.length === 1 ? "" : "s"} for {knownField ? "" : "about "}{fieldCount} {a.playType === "doubles" ? "entries" : "players"} in {units.length} group{units.length === 1 ? "" : "s"}. We haven't worked out how many matches fit yet.</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 opacity-70">
                <div><div className="text-sm font-semibold">Next: Help me choose the format</div><div className="text-xs text-muted-foreground">Coming soon — not available in this version.</div></div>
                <Button size="sm" disabled><Lock className="mr-1 h-4 w-4" />Coming soon</Button>
              </div>
              {handoverPanel("bottom")}
            </>
          )}

          {cur !== "Summary" && !canNext && (
            <div role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <div className="font-semibold">Next is not available yet:</div>
              {cur === "Pick" && pickProblems.length
                ? <ul className="ml-4 list-disc">{pickProblems.slice(0, 12).map((p, i) => <li key={i}>{p}</li>)}{pickProblems.length > 12 && <li>…and {pickProblems.length - 12} more</li>}</ul>
                : <p>Complete the required choices on this step ({STEP_LABEL[cur]}).</p>}
            </div>
          )}
          {cur !== "Summary" && (
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
              <Button size="sm" disabled={!canNext} onClick={() => setStep(step + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* growing tree */}
      <aside aria-label="Your tournament so far" className="rounded-xl border border-border p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your tournament so far</div>
        {a.name?.trim() && <div className="mb-1 text-sm font-semibold">{a.name}</div>}
        {a.scope && <button type="button" onClick={() => go("Basics")} className="mb-2 block rounded px-1 text-left text-xs text-muted-foreground hover:bg-muted">{ownerText}</button>}
        <TreeNode icon={<Trophy className="h-4 w-4" />} title={a.kind === "once_off" ? "Once-off / weekend" : a.kind === "period" ? "Club Championships (over a period)" : "Type not chosen"} onClick={() => go("Type")}>
          {a.kind && (
            <>
              {isChamps && basicsOk && <TreeNode icon={<CalendarDays className="h-4 w-4" />} title={periodText} onClick={() => go("Basics")} />}
              {isChamps && champsEstimate > 0 && <TreeNode icon={<Users className="h-4 w-4" />} title={`~${champsEstimate} expected entries`} onClick={() => go("ExpEntries")}>
                {units.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">~{a.unitEntries?.[u.key] || "?"}</span></TreeLeaf>)}
              </TreeNode>}
              {!isChamps && entriesOk && <TreeNode icon={<Users className="h-4 w-4" />} title={`~${a.entries} entries`} onClick={() => go("Entries")} />}
              {playOk && <TreeNode icon={<Trophy className="h-4 w-4" />} title={PLAY_LABEL[a.playType!]} onClick={() => go("What")} />}
              {scoring && <TreeNode icon={<Trophy className="h-4 w-4" />} title={scoringText(scoring)} onClick={() => go("Match")}>
                {validOverrides.length > 0 && units.map((u) => <TreeLeaf key={u.key}><Button type="button" variant="link" size="sm" className="h-auto p-0 text-left text-xs" onClick={() => go("Overrides")}>{u.base}: {scoringText(scoringFor(u.key) ?? DEFAULT_SCORING)}</Button></TreeLeaf>)}
              </TreeNode>}
              {(format.kind || formatExceptions.length > 0) && <TreeNode icon={<Trophy className="h-4 w-4" />} title={`Format: ${formatDetail(format)}`} onClick={() => go("Format")}>
                {formatExceptions.length > 0 && units.map((u) => <TreeLeaf key={u.key}><Button type="button" variant="link" size="sm" className="h-auto p-0 text-left text-xs" onClick={() => go("Format")}>{u.base}: {formatDetail(formatFor(u.key))}</Button></TreeLeaf>)}
                <TreeLeaf><span className="text-muted-foreground">Confirm final format after entries close</span></TreeLeaf>
              </TreeNode>}
              {a.seeding && <TreeNode icon={<Trophy className="h-4 w-4" />} title={`Seeding: ${SEED_LABEL[a.seeding]} (provisional)`} onClick={() => go("Seeding")}>
                {seedExceptions.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{seedFor(u.key) ? SEED_LABEL[seedFor(u.key)!] : "not chosen"}</span></TreeLeaf>)}
              </TreeNode>}
              {isChamps && stages.length > 0 && <TreeNode icon={<CalendarDays className="h-4 w-4" />} title={`${stages.length} stage${stages.length === 1 ? "" : "s"} planned`} onClick={() => go("Schedule")}>
                {stages.map((s) => <TreeLeaf key={s.id}>{stageUnit(s.unit)} · {s.name || "Unnamed"}<span className="block text-muted-foreground">{stageWhen(s)}</span></TreeLeaf>)}
              </TreeNode>}
              {!isChamps && <TreeNode icon={<Trophy className="h-4 w-4" />} title={`Playoffs: ${playoffDetail(playoff, format.kind)}`} onClick={() => go("Playoffs")}>
                {playoffExceptions.length > 0 && units.map((u) => <TreeLeaf key={u.key}><Button type="button" variant="link" size="sm" className="h-auto p-0 text-left text-xs" onClick={() => go("Playoffs")}>{u.base}: {playoffDetail(playoffFor(u.key), formatFor(u.key).kind, koPath(u.key))}</Button></TreeLeaf>)}
              </TreeNode>}
              {cats.length > 0 && (
                <TreeNode icon={<Tags className="h-4 w-4" />} title="Categories" onClick={() => go("Categories")}>
                  {cats.map((c, i) => {
                    const subs = (a.subcats[c] ?? []).map((s) => s.trim()).filter(Boolean);
                    return (
                      <TreeLeaf key={i}>
                        <button type="button" onClick={() => go("Subcategories")} className="rounded px-1 hover:bg-muted">{c}{subs.length === 0 && <span className="text-muted-foreground"> · {discText(c)}</span>}</button>
                        {subs.length > 0 && (
                          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                            {subs.map((s, j) => <TreeLeaf key={j}>{s} <span className="text-muted-foreground">{discText(`${c}::${s}`)}</span></TreeLeaf>)}
                          </div>
                        )}
                      </TreeLeaf>
                    );
                  })}
                </TreeNode>
              )}
              {a.source && (
                <TreeNode icon={<UserPlus className="h-4 w-4" />} title={a.source === "select" ? `Picked players${pickIds.length ? ` (${pickIds.length})` : ""}` : a.source === "self" ? "Self-entry" : `Picked + self-entry${pickIds.length ? ` (${pickIds.length} picked)` : ""}`} onClick={() => go("Players")}>
                  {units.map((u) => <TreeLeaf key={u.key}><button type="button" onClick={() => go("Eligibility")} className="rounded px-1 hover:bg-muted">{u.label}</button><span className="block pl-1 text-muted-foreground">{eligText(u.key)}</span></TreeLeaf>)}
                  {selfEntry && <TreeLeaf><button type="button" onClick={() => go("Invites")} className="rounded px-1 hover:bg-muted">Invites: {a.invite ? INVITE_LABEL[a.invite] : "not chosen"} (not sent)</button></TreeLeaf>}
                  {(selfEntry || notifyOnly) && <TreeLeaf><button type="button" onClick={() => go("Messaging")} className="rounded px-1 hover:bg-muted">{notifyOnly ? "Entry notification" : "Message"}: {msgSummary}</button></TreeLeaf>}
                </TreeNode>
              )}
              {dblUnits.length > 0 && dblUnits.some((u) => partnerOf(u.key)) && (
                <TreeNode icon={<Users className="h-4 w-4" />} title="Doubles partners" onClick={() => go("Partners")}>
                  {dblUnits.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "not chosen"}</span></TreeLeaf>)}
                  <TreeLeaf>A player may register both partners: <span className="text-muted-foreground">{ruleAnswer(a.doublesEntry ?? null)}</span></TreeLeaf>
                </TreeNode>
              )}
              {(fee.has !== null || dblUnits.length > 0) && (
                <TreeNode icon={<Wallet className="h-4 w-4" />} title={`Fees: ${feeSummary}`} onClick={() => go("Fees")}>
                  {fee.has && units.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{feeUnitText(u)}</span></TreeLeaf>)}
                  {dblUnits.length > 0 && <TreeLeaf>One player may pay for both: <span className="text-muted-foreground">{ruleAnswer(fee.doublesCover)}</span></TreeLeaf>}
                </TreeNode>
              )}
              {a.days.some((d) => d.date) && (
                <TreeNode icon={<CalendarDays className="h-4 w-4" />} title={`${a.days.length} day${a.days.length === 1 ? "" : "s"}`} onClick={() => go("Dates")}>
                  {a.days.map((d, i) => (
                    <TreeLeaf key={i}>
                      {fmtDay(d.date)}
                      {d.courts && <span className="block text-muted-foreground">{d.venue} · {d.courts} courts {d.windows.filter((w) => w.from && w.to).map((w) => `${w.from}–${w.to}`).join(", ")}</span>}
                    </TreeLeaf>
                  ))}
                </TreeNode>
              )}
            </>
          )}
        </TreeNode>
        {(a.kind || a.entries) && (
          <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => { setA(EMPTY); go("Type"); }}>Start over</Button>
        )}
      </aside>
    </div>
  );
}

/** Solid colour-block section heading (Invitation / WhatsApp group / Draw / After-match). */
function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">{children}</div>;
}

function Q({ t, h }: { t: string; h: string }) {
  return <div><h3 className="text-base font-semibold">{t}</h3><p className="text-sm text-muted-foreground">{h}</p></div>;
}
function PlayoffFields({ value, onChange, format }: { value: PlayoffPlan; onChange: (patch: Partial<PlayoffPlan>) => void; format: CompKind | null }) {
  if (format === "knockout") return <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">A knockout already has its own rounds (e.g. quarterfinals, semifinals, final), so no separate playoffs are planned here.</p>;
  const sel = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const noneLabel = format === "swiss" ? "Finish on Swiss standings" : format === "cross" ? "Finish on standings" : "No playoffs";
  const yesLabel = format === "swiss" ? "Top players into a knockout" : "Playoffs";
  const poolish = format === "pools" || format === "cross";
  return <div className="space-y-3">
    {(!format || format === "later") && <p className="text-xs text-muted-foreground">Your competition format isn't decided yet, so any playoff plan stays provisional.</p>}
    <div className="flex flex-wrap gap-2" role="group" aria-label="Playoff choice">
      {(["none", "playoffs", "later"] as const).map((choice) => <Button key={choice} type="button" size="sm" variant={value.choice === choice ? "default" : "outline"} aria-pressed={value.choice === choice} onClick={() => onChange({ choice })}>{choice === "none" ? noneLabel : choice === "later" ? "Decide later" : yesLabel}</Button>)}
    </div>
    {value.choice === "playoffs" && <div className="space-y-3 rounded-lg border border-border p-3">
      {poolish && <div><Label>Type of playoffs</Label><select aria-label="Type of playoffs" className={sel} value={value.style ?? "later"} onChange={(e) => onChange({ style: e.target.value as PlayoffPlan["style"] })}><option value="later">Decide later</option><option value="championship">Championship playoffs (find one winner)</option><option value="placement">Placement play (rank every position)</option></select></div>}
      {!(poolish && value.style === "placement") && <div><Label>Stages</Label><div className="mt-2 flex flex-wrap gap-2">{([1, 2, 3] as const).map((rounds) => <Button key={rounds} type="button" size="sm" variant={value.rounds === rounds ? "default" : "outline"} aria-pressed={value.rounds === rounds} onClick={() => onChange({ rounds })}>{playoffText({ ...value, rounds })}</Button>)}</div></div>}
      {poolish && value.style === "placement" && <p className="text-xs text-muted-foreground">e.g. A1 v B1 for 1st/2nd, A2 v B2 for 3rd/4th. Exact placement games are set once the final format is confirmed.</p>}
      {!(poolish && value.style === "placement") && <>
        <div><Label>Who qualifies?</Label><select aria-label="Who qualifies for playoffs" className={sel} value={value.qualification} onChange={(e) => onChange({ qualification: e.target.value as PlayoffPlan["qualification"] })}><option value="later">Decide qualification later</option><option value="top_pools">{format === "swiss" ? "Top players/pairs on standings" : "Top players/pairs from pools"}</option><option value="seeded">Highest-ranked entrants</option></select></div>
        <div><Label>How are qualifiers paired?</Label><select aria-label="How playoff qualifiers are paired" className={sel} value={value.pairing} onChange={(e) => onChange({ pairing: e.target.value as PlayoffPlan["pairing"] })}><option value="later">Decide pairing later</option>{poolish && <option value="cross_pools">Pool crossover: A1 vs B2, B1 vs A2</option>}<option value="seeded">Seeded: 1 vs 4, 2 vs 3 (highest vs lowest)</option></select></div>
      </>}
      <p className="text-xs text-muted-foreground">Ideas for later setup, not a draw. Revisited at Confirm final format; no bracket is generated here.</p>
    </div>}
  </div>;
}
function FormatFields({ value, onChange, units, compact = false, entries = {}, scope }: { value: FormatPlan; onChange: (patch: Partial<FormatPlan>) => void; units: { key: string; base: string }[]; compact?: boolean; entries?: Record<string, string | number>; scope?: string[] }) {
  const sel = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return <div className="space-y-3">
    <div className={cn("grid gap-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {(Object.keys(COMP_LABEL) as CompKind[]).map((k) => compact
        ? <Button key={k} type="button" size="sm" variant={value.kind === k ? "default" : "outline"} aria-pressed={value.kind === k} onClick={() => onChange(k === "knockout" ? { kind: k, koPace: value.koPace ?? "paced", koPairing: value.koPairing ?? "progressive" } : { kind: k })}>{COMP_LABEL[k]}</Button>
        : <Choice key={k} active={value.kind === k} onClick={() => onChange(k === "knockout" ? { kind: k, koPace: value.koPace ?? "paced", koPairing: value.koPairing ?? "progressive" } : { kind: k })} title={COMP_LABEL[k]} desc={COMP_DESC[k]} />)}
    </div>
    {value.kind === "pools" && <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">The number of pools will be decided later for each category or subcategory, based on the number of entries. Categories and subcategories are not themselves automatically pools — a category/subcategory such as Men's A Singles may later contain one, two, three or more pools. Pool numbers stay provisional during planning and are finalised once registrations close and actual entry numbers are known.</div>}
    {value.kind === "knockout" && <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground space-y-1">
      <p>The provisional bracket comes from the expected entries you already gave — no need to enter it again. Actual entrants replace the estimate when registration closes.</p>
      {units.filter((u) => !scope || scope.includes(u.key)).map((u) => <p key={u.key} className="text-xs">{u.base}: {Number(entries[u.key]) || "?"} expected → {bracketHint(Number(entries[u.key]) || 0)}</p>)}
    </div>}
    {value.kind === "knockout" && <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <Label>Knockout pace</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Knockout pace">
          <Button type="button" size="sm" variant={(value.koPace ?? "paced") === "paced" ? "default" : "outline"} aria-pressed={(value.koPace ?? "paced") === "paced"} onClick={() => onChange({ koPace: "paced" })}>Paced across the rounds</Button>
          <Button type="button" size="sm" variant={value.koPace === "immediate" ? "default" : "outline"} aria-pressed={value.koPace === "immediate"} onClick={() => onChange({ koPace: "immediate" })}>Immediate knockout</Button>
        </div>
        <p className="text-xs text-muted-foreground">{(value.koPace ?? "paced") === "paced" ? "Eliminations are spread over the play-by rounds you set, so the field reaches its quarter-final/semi-final/final on time without knocking players out sooner than needed." : "Each round plays as many matches as the field allows (normal halving)."}</p>
      </div>
      <div className="space-y-1">
        <Label>Pairing strategy</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pairing strategy">
          <Button type="button" size="sm" variant={(value.koPairing ?? "progressive") === "progressive" ? "default" : "outline"} aria-pressed={(value.koPairing ?? "progressive") === "progressive"} onClick={() => onChange({ koPairing: "progressive" })}>Progressive (closer-ranked)</Button>
          <Button type="button" size="sm" variant={value.koPairing === "traditional" ? "default" : "outline"} aria-pressed={value.koPairing === "traditional"} onClick={() => onChange({ koPairing: "traditional" })}>Traditional seeded</Button>
        </div>
        <p className="text-xs text-muted-foreground">{(value.koPairing ?? "progressive") === "progressive" ? "Players of similar ranking meet — early rounds give weaker players a game against each other." : "Strongest v weakest: 1v8, 2v7, 3v6, 4v5."} You can change any pairing each round in Manage Tournament before fixtures are confirmed.</p>
      </div>
    </div>}
    {value.kind === "swiss" && <div className="max-w-[260px] space-y-1"><Label>Roughly how many rounds? (optional)</Label><Input type="number" min="1" aria-label="Anticipated Swiss rounds" value={value.swissRounds} onChange={(e) => onChange({ swissRounds: e.target.value })} placeholder="e.g. 5" /><p className="text-xs text-muted-foreground">Each round pairs players on similar results; nobody is eliminated.</p></div>}
    {(value.kind === "pools" || value.kind === "cross") && (() => {
      const mode = value.kind === "pools" ? "within" : value.crossMode === "parent" ? "between" : "custom";
      const inScope = units.filter((u) => !scope || scope.includes(u.key));
      const parents = [...new Set(inScope.map((u) => u.key.split("::")[0]))];
      const fam = parents.map((p) => ({ p, subs: inScope.filter((u) => u.key.split("::")[0] === p && u.key.includes("::")) }));
      return <div className="space-y-2 rounded-lg border border-border p-3">
        <Label>Round robin — who plays whom</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Round robin matchups">
          <Button type="button" size="sm" variant={mode === "within" ? "default" : "outline"} aria-pressed={mode === "within"} onClick={() => onChange({ kind: "pools", crossMode: undefined })}>Within subcategories</Button>
          <Button type="button" size="sm" variant={mode === "between" ? "default" : "outline"} aria-pressed={mode === "between"} onClick={() => onChange({ kind: "cross", crossMode: "parent" })}>Between subcategories</Button>
          <Button type="button" size="sm" variant={mode === "custom" ? "default" : "outline"} aria-pressed={mode === "custom"} onClick={() => onChange({ kind: "cross", crossMode: value.crossMode === "chosen" ? "chosen" : "all" })}>Custom matchups</Button>
        </div>
        <p className="text-xs text-muted-foreground">{mode === "within" ? "Each subcategory plays its own round robin (e.g. Men's A v Men's A, Men's B v Men's B)." : mode === "between" ? "Subcategories under the same parent category play each other, never their own subcategory and never another parent category." : "Choose exactly which groups play each other below."}</p>
        {mode === "between" && <ul className="text-xs">{fam.map(({ p, subs }) => <li key={p}>{p}: {subs.length >= 2 ? subs.flatMap((a, i) => subs.slice(i + 1).map((b) => `${a.base} v ${b.base}`)).join(" · ") : "no other subcategory to play"}</li>)}</ul>}
      </div>;
    })()}
    {value.kind === "cross" && value.crossMode !== "parent" && <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Select every existing category/subcategory/league that takes part. Players play opponents from the OTHER selected groups — not within their own group — and each group keeps its identity for later fixtures.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cross-league participating groups">
        {units.map((u) => { const on = crossList(value).includes(u.key); return <Button key={u.key} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => { const cur = crossList(value); onChange({ crossUnits: on ? cur.filter((k) => k !== u.key) : [...cur, u.key], crossA: "", crossB: "", crossPairs: on ? (value.crossPairs ?? []).filter((p) => !p.includes(u.key)) : value.crossPairs }); }}>{u.base}</Button>; })}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cross-league matchups">
        <Button type="button" size="sm" variant={value.crossMode !== "chosen" ? "default" : "outline"} aria-pressed={value.crossMode !== "chosen"} onClick={() => onChange({ crossMode: "all" })}>All selected groups play each other</Button>
        <Button type="button" size="sm" variant={value.crossMode === "chosen" ? "default" : "outline"} aria-pressed={value.crossMode === "chosen"} onClick={() => onChange({ crossMode: "chosen", crossPairs: value.crossPairs ?? [] })}>Choose which groups play each other</Button>
      </div>
      {value.crossMode === "chosen" && crossList(value).length >= 2 && (() => {
        const sel = crossList(value); const nameOf = (k: string) => units.find((u) => u.key === k)?.base ?? k;
        const has = (a: string, b: string) => (value.crossPairs ?? []).some(([x, y]) => (x === a && y === b) || (x === b && y === a));
        const toggle = (a: string, b: string) => onChange({ crossPairs: has(a, b) ? (value.crossPairs ?? []).filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))) : [...(value.crossPairs ?? []), [a, b]] });
        return <div className="overflow-x-auto"><table className="text-xs" aria-label="Cross-league matchup matrix"><thead><tr><th />{sel.map((k) => <th key={k} className="px-2 font-medium">{nameOf(k)}</th>)}</tr></thead>
          <tbody>{sel.map((a, i) => <tr key={a}><th className="pr-2 text-left font-medium">{nameOf(a)}</th>{sel.map((b, j) => <td key={b} className="px-2 text-center">{i === j ? <span className="text-muted-foreground">—</span> : <input type="checkbox" aria-label={`${nameOf(a)} plays ${nameOf(b)}`} checked={has(a, b)} onChange={() => toggle(a, b)} />}</td>)}</tr>)}</tbody></table>
          <p className="mt-1 text-xs text-muted-foreground">{value.crossPairs?.length ? `Only these meet: ${value.crossPairs.map(([x, y]) => `${nameOf(x)} v ${nameOf(y)}`).join(" · ")}. No other cross-group games, never within a group.` : "Tick each pair of groups that should play each other."}</p></div>;
      })()}
      <p className="text-xs text-muted-foreground">{crossList(value).length >= 2 ? `${crossList(value).length} groups selected: ${crossList(value).map((k) => units.find((u) => u.key === k)?.base ?? k).join(", ")}` : "Select at least two groups (or decide later)."}</p>
    </div>}
  </div>;
}
function ScoringFields({ value, onChange, showMode = false }: { value: MatchScoring; onChange: (patch: Partial<MatchScoring>) => void; showMode?: boolean }) {
  return <div className="space-y-3">
    {showMode && <div className="flex flex-wrap gap-2" role="group" aria-label="Match play format">
      {(["standard", "time_capped_points"] as const).map((mode) => <Button key={mode} type="button" size="sm" variant={value.mode === mode ? "default" : "outline"} aria-pressed={value.mode === mode} onClick={() => onChange({ mode })}>{mode === "standard" ? "Standard play" : "Time-capped / Bells format"}</Button>)}
    </div>}
    {value.mode === "standard" ? <div className="grid gap-3 sm:grid-cols-3">
      <div><Label htmlFor={showMode ? undefined : "tournament-points"}>Points per game</Label><select aria-label="Points per game" id={showMode ? undefined : "tournament-points"} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value.pointsPerGame} onChange={(e) => onChange({ pointsPerGame: Number(e.target.value) as 11 | 15 })}><option value="11">PAR 11</option><option value="15">PAR 15</option></select></div>
      <div><Label>Games per match</Label><select aria-label="Games per match" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value.bestOf} onChange={(e) => onChange({ bestOf: Number(e.target.value) as 3 | 5 })}><option value="3">Best of 3</option><option value="5">Best of 5</option></select></div>
      <div><Label>At game point</Label><select aria-label="At game point" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value.winCondition} onChange={(e) => onChange({ winCondition: e.target.value as MatchScoring["winCondition"] })}><option value="win_by_2">Win by 2</option><option value="sudden_death">Sudden death</option></select></div>
    </div> : <div className="max-w-[440px] space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Playing time (minutes)</Label><Input type="number" min="1" step="1" aria-label="Playing time in minutes" value={value.timeCapPlay} onChange={(e) => onChange({ timeCapPlay: e.target.value })} placeholder="e.g. 25" /></div>
        <div><Label>Break / changeover (minutes)</Label><Input type="number" min="0" step="1" aria-label="Break or changeover time in minutes" value={value.timeCapBreak} onChange={(e) => onChange({ timeCapBreak: e.target.value })} placeholder="e.g. 5" /></div>
      </div>
      <div className="rounded-md border border-dashed border-border p-2 text-sm">
        <span className="font-semibold">Slot time: {slotMinutes(value) > 0
          ? `${Number(value.timeCapPlay) || 0} min play${Number(value.timeCapBreak) > 0 ? ` + ${Number(value.timeCapBreak)} min changeover` : ""} = ${slotMinutes(value)} minutes per match`
          : "enter playing time and break/changeover — the slot time is calculated for you"}</span>
        <p className="mt-1 text-xs text-muted-foreground">One match occupies a full slot on the court: playing time plus the break between matches (e.g. 25 + 5 = a 30-minute slot). Court scheduling and capacity use the slot time; playing time describes actual play and the break is scheduling overhead.</p>
      </div>
      {!(Number(value.timeCapPlay) > 0) && Number(value.timeCapMinutes) > 0 && <p className="text-xs text-muted-foreground">Earlier entry: {value.timeCapMinutes} minutes per match — used as the slot time until you set playing and break/changeover times.</p>}
    </div>}
  </div>;
}
function Choice({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-lg border p-4 text-left transition-colors", active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
      <div className="text-sm font-semibold">{title}</div><div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}
function DoublesOption({ label, description, value, onChange }: { label: string; description: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-2">
        {([true, false, null] as const).map((option) => (
          <Button key={String(option)} type="button" size="sm" variant={value === option ? "default" : "outline"} aria-pressed={value === option} onClick={() => onChange(option)}>
            {option === null ? "Decide later" : option ? "Yes" : "No"}
          </Button>
        ))}
      </div>
    </div>
  );
}
function SummaryRow({ icon, label, children, onEdit }: { icon: React.ReactNode; label: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-2 text-sm">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="flex-1"><div className="text-xs text-muted-foreground">{label}</div><div>{children}</div></div>
      <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
    </div>
  );
}
function TreeNode({ icon, title, children, onClick }: { icon: React.ReactNode; title: string; children?: React.ReactNode; onClick: () => void }) {
  return (
    <div className="text-sm">
      <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted">
        <span className="text-primary">{icon}</span>{title}
      </button>
      {children && <div className="ml-3 mt-1 space-y-1 border-l border-border pl-3">{children}</div>}
    </div>
  );
}
function TreeLeaf({ children }: { children: React.ReactNode }) {
  return <div className="text-xs">{children}</div>;
}

function DiscPick({ value, onChange }: { value?: Disc; onChange: (d: Disc) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Singles or Doubles">
      {(["singles", "doubles"] as const).map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}
          className={cn("rounded-full border px-2.5 py-1 text-xs", value === d ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>
          {d === "singles" ? "Singles" : "Doubles"}
        </button>
      ))}
    </div>
  );
}
function StageTable({ stages, unitName, when }: { stages: ClubStage[]; unitName: (k: string) => string; when: (s: ClubStage) => string }) {
  if (!stages.length) return <p className="text-xs text-muted-foreground">No stages yet.</p>;
  const main = stages.filter((s) => (s.phase ?? "main") === "main");
  const po = stages.filter((s) => s.phase === "playoff");
  const row = (s: ClubStage) => <tr key={s.id} className="border-t border-border"><td className="py-1 pr-2">{s.phase === "playoff" ? "Playoff" : "Main round"}</td><td className="py-1 pr-2">{unitName(s.unit)}</td><td className="py-1 pr-2">{s.name || "Unnamed"}</td><td className="py-1 pr-2">{s.phase === "playoff" ? PAIRING_LABEL[s.pairing ?? "later"] : "—"}</td><td className="py-1">{when(s)}</td></tr>;
  return <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Phase</th><th className="py-1 pr-2">Category</th><th className="py-1 pr-2">Stage</th><th className="py-1 pr-2">Pairing</th><th className="py-1">Method · deadline or date/time · courts</th></tr></thead>
    <tbody>{main.map(row)}
      {po.length > 0 && <tr><td colSpan={5} className="py-1.5"><div className="rounded bg-primary/10 px-2 py-1 text-center font-semibold text-primary">▼ Playoffs begin</div></td></tr>}
      {po.map(row)}</tbody></table>;
}
