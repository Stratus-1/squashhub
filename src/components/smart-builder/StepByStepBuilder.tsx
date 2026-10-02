import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2, Trophy, CalendarDays, Users, Tags, MapPin, UserPlus, ShieldCheck, Mail, Lightbulb, MessageSquare, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrgHierarchyLite } from "@/hooks/use-tournament-eligibility";
import { useAssociationTenant } from "@/hooks/use-association-tenant";
import { owningAssociation, federationRoot } from "@/lib/tournaments/eligibility";

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
type FormatPlan = { kind: CompKind | null; pools: string; drawRounds: string; swissRounds: string; crossA: string; crossB: string };
const DEFAULT_FORMAT: FormatPlan = { kind: null, pools: "", drawRounds: "", swissRounds: "", crossA: "", crossB: "" };
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
const pairingText = (p: PlayoffPlan) => p.pairing === "cross_pools" ? "Cross-pool (A1 v B2, B1 v A2)" : p.pairing === "seeded" ? "Seeded (highest v lowest)" : "Pairing to be decided";
const styleText = (p: PlayoffPlan) => p.style === "placement" ? "Placement play (A1 v B1 for 1st/2nd, A2 v B2 for 3rd/4th…)" : p.style === "championship" ? "Championship playoffs" : "Playoff type to be decided";
const playoffDetail = (p: PlayoffPlan, k?: CompKind | null) => {
  if (k === "knockout") return "Knockout rounds (no separate playoffs)";
  if (p.choice !== "playoffs") return k === "swiss" && p.choice === "none" ? "Finish on Swiss standings" : k === "cross" && p.choice === "none" ? "Finish on standings" : playoffText(p);
  if (p.style === "placement" && (k === "pools" || k === "cross")) return styleText(p);
  return `${playoffText(p)}${k === "pools" || k === "cross" ? ` · ${styleText(p)}` : ""} · ${qualifierText(p)}${p.style !== "placement" ? ` · ${pairingText(p)}` : ""}`;
};
export type StepAnswers = {
  kind: Kind;
  entries: string;
  playType: PlayType;
  /** Whole-tournament scoring, with optional category/subcategory overrides. Planning only. */
  scoring: MatchScoring | null;
  scoringOverrides: Record<string, MatchScoring>;
  categories: string[];
  /** Optional subcategories per category name; missing/empty = no subcategories. */
  subcats: Record<string, string[]>;
  days: DayAvail[];
  /** How players get in: organiser picks, self-entry, or both. */
  source: Source;
  /** Per category/subcategory ("Cat" or "Cat::Sub") eligibility + placement. */
  elig: Record<string, Elig>;
  /** Organiser-selected players → category/subcategory key ("" = not placed yet). */
  picks: Record<string, string>;
  invite: Invite;
  /** Discipline per unit key ("Cat" or "Cat::Sub"). Inherited from playType unless it is "both". */
  disc: Record<string, Disc>;
  /** Invitation message setup only — nothing is sent from this builder. */
  msg: MsgCfg;
  /** Doubles partner rule per doubles unit key. */
  partner: Record<string, Partner>;
  /** Whether one player may register their partner (where players choose partners). */
  doublesEntry: boolean | null;
  fee: FeeCfg;
  /** Default and category/subcategory exceptions; guidance only, not a generated bracket. */
  playoff: PlayoffPlan;
  playoffOverrides: Record<string, PlayoffPlan>;
  /** Planned competition format (provisional) with category/subcategory overrides. */
  format: FormatPlan;
  formatOverrides: Record<string, FormatPlan>;
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
type FeeCfg = { has: boolean | null; amount: string; varies: boolean; perUnit: Record<string, string>; doublesBasis: "player" | "pair"; doublesCover: boolean | null };
const DEFAULT_FEE: FeeCfg = { has: null, amount: "", varies: false, perUnit: {}, doublesBasis: "player", doublesCover: null };
const ruleAnswer = (value: boolean | null) => value === null ? "Decide later" : value ? "Yes" : "No";
type Channel = "in_app" | "email" | "whatsapp" | "sms";
type MsgCfg = { channels: Channel[]; body: string | null; later: boolean };
const CHANNEL_LABEL: Record<Channel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const DEFAULT_MSG: MsgCfg = { channels: ["in_app", "email"], body: null, later: false };
type Disc = "singles" | "doubles";
type Source = "select" | "self" | "both" | null;
type Elig = { mode: "everyone" | "leagues" | "manual"; leagueIds: string[]; placement: "auto" | "choose" };
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
  crossover: "Pool crossover (A1 v B2, B1 v A2)",
  same_position: "Same position (A1 v B1, A2 v B2)",
  seeded: "Seeded (highest v lowest qualifier)",
  winners: "Winners of the previous stage",
  later: "Pairing: decide later",
};
type ClubStage = { id: string; unit: string; name: string; mode: StageMode; deadline: string; date: string; from: string; to: string; courtIds: string[]; phase?: StagePhase; pairing?: PlayoffPairing };
const newStage = (name: string, mode: StageMode, unit = "", phase: StagePhase = "main"): ClubStage => ({ id: Math.random().toString(36).slice(2), unit, name, mode, deadline: "", date: "", from: "", to: "", courtIds: [], phase, ...(phase === "playoff" ? { pairing: "later" as PlayoffPairing } : {}) });
/** Playoff stages are fixed standard rounds — organisers pick, never type arbitrary names. */
const PLAYOFF_STAGE_NAMES = ["Quarterfinal", "Semifinal", "Final"] as const;
/** Pairing choices that make sense for this stage: "winners" only after an earlier playoff stage; pool pairings only for pool-style formats. */
function pairingOptions(s: ClubStage, playoffs: ClubStage[], kind: string): PlayoffPairing[] {
  const idx = PLAYOFF_STAGE_NAMES.indexOf(s.name as typeof PLAYOFF_STAGE_NAMES[number]);
  const hasEarlier = idx > 0 && playoffs.some((x) => x.id !== s.id && (x.unit === s.unit || !x.unit || !s.unit) && PLAYOFF_STAGE_NAMES.indexOf(x.name as typeof PLAYOFF_STAGE_NAMES[number]) > -1 && PLAYOFF_STAGE_NAMES.indexOf(x.name as typeof PLAYOFF_STAGE_NAMES[number]) < idx);
  const poolish = kind === "pools" || kind === "cross" || kind === "later";
  const out: PlayoffPairing[] = [];
  if (hasEarlier) out.push("winners");
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
type StepKey = "Type" | "Basics" | "Entries" | "ExpEntries" | "What" | "Match" | "Categories" | "Subcategories" | "Overrides" | "Format" | "Seeding" | "Partners" | "Players" | "Eligibility" | "Pick" | "Invites" | "Messaging" | "Fees" | "Dates" | "Courts" | "Split" | "Schedule" | "Playoffs" | "Summary";
const STEP_LABEL: Record<StepKey, string> = { Type: "Type", Basics: "Basics", Entries: "Entries", ExpEntries: "Expected entries", What: "What", Match: "Match format", Categories: "Categories", Subcategories: "Subcategories", Overrides: "Format overrides", Format: "Planned format", Seeding: "Seeding", Partners: "Doubles partners", Players: "How players join", Eligibility: "Who may enter", Pick: "Pick players", Invites: "Invitations", Messaging: "Messaging", Fees: "Fees & Payment", Dates: "Dates", Courts: "Courts", Split: "Main rounds & playoffs", Schedule: "Stages & scheduling", Playoffs: "Playoffs", Summary: "Summary" };
const SOURCE_LABEL: Record<Exclude<Source, null>, string> = { select: "I will select the players", self: "Players enter themselves", both: "Both — some picked, others enter" };
const INVITE_LABEL: Record<Exclude<Invite, null>, string> = { all_eligible: "All eligible members", leagues: "Players in the chosen leagues", selected: "Selected eligible members", later: "Decide / send later" };

const PLAY_LABEL: Record<Exclude<PlayType, null>, string> = { singles: "Singles", doubles: "Doubles", both: "Singles and Doubles" };

const fmtDay = (d: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "No date";

export function StepByStepBuilder({ clubId, clubName }: { clubId: string; clubName?: string }) {
  const key = `sh.stepbuilder.${clubId}`;
  const [a, setA] = useState<StepAnswers>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}") as Partial<StepAnswers> & { fee?: Partial<FeeCfg> & { doublesPay?: string } };
      const legacy = saved.fee?.doublesPay;
      const doublesEntry = saved.doublesEntry !== undefined ? saved.doublesEntry : legacy === "later" || !legacy ? null : legacy !== "separate";
      const doublesCover = saved.fee?.doublesCover !== undefined ? saved.fee.doublesCover : legacy === "later" || !legacy ? null : legacy === "one_pays";
      const { doublesPay: _oldRule, ...savedFee } = saved.fee ?? {};
      return { ...EMPTY, ...saved, scoringOverrides: saved.scoringOverrides ?? {}, playoff: { ...DEFAULT_PLAYOFF, ...saved.playoff }, playoffOverrides: saved.playoffOverrides ?? {}, format: { ...DEFAULT_FORMAT, ...saved.format }, formatOverrides: saved.formatOverrides ?? {}, doublesEntry, fee: { ...DEFAULT_FEE, ...savedFee, doublesCover } };
    } catch { return EMPTY; }
  });
  const [step, setStep] = useState(0);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(a)); }, [a, key]);
  const [clubCourts, setClubCourts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from("courts").select("id, name").eq("club_id", clubId).eq("is_external", false).order("name")
      .then(({ data }) => setClubCourts((data ?? []).map((c) => ({ id: String(c.id), name: c.name }))));
  }, [clubId]);
  const courtNames = (d: DayAvail) => clubCourts.filter((c) => d.courtIds?.includes(c.id)).map((c) => c.name).join(", ");

  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  useEffect(() => {
    // Fetch every page: the backend caps each request at 1000 rows, so a single .limit() silently truncates.
    let cancelled = false;
    (async () => {
      const PAGE = 1000; const all: { id: string; name: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from("club_members").select("id, name").eq("club_id", clubId).eq("status", "active").neq("role", "visitor")
          .order("name").order("id").range(from, from + PAGE - 1);
        if (error || !data) break;
        all.push(...(data as any[]).map((m) => ({ id: String(m.id), name: m.name || "Member" })));
        if (data.length < PAGE) break;
      }
      if (!cancelled) setMembers(all);
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
    return { ...u, disc: d, label: `${u.base} · ${d ? PLAY_LABEL[d] : "Singles or Doubles?"}` };
  });
  const unitBase = (k: string) => units.find((u) => u.key === k)?.base ?? k;
  const setDisc = (k: string, d: Disc) => setA({ ...a, disc: { ...a.disc, [k]: d } });
  const setPlayType = (p: Exclude<PlayType, null>) => {
    if (p === "both") { setA({ ...a, playType: p }); return; }
    const disc: Record<string, Disc> = {};
    units.forEach((u) => { disc[u.key] = p; });
    setA({ ...a, playType: p, disc });
  };
  const dblUnits = units.filter((u) => u.disc === "doubles");
  const scoring = a.scoring ? { ...DEFAULT_SCORING, ...a.scoring } : null;
  const scoringFor = (key: string) => a.scoringOverrides?.[key] ?? a.scoringOverrides?.[key.split("::")[0]] ?? scoring;
  const scoringOk = (s: MatchScoring | null) => !!s && (s.mode === "standard" || (Number.isFinite(Number(s.timeCapMinutes)) && Number(s.timeCapMinutes) > 0));
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
    const extra = f.kind === "knockout" && f.drawRounds ? ` · ${f.drawRounds}` : f.kind === "swiss" && f.swissRounds ? ` · about ${f.swissRounds} rounds` : f.kind === "cross" ? ` · ${f.crossA && f.crossB ? `${unitBase(f.crossA)} v ${unitBase(f.crossB)}` : "groups to cross not chosen"}` : f.kind === "pools" ? " · pools per category/subcategory decided later" : "";
    return `${COMP_LABEL[f.kind]}${extra} (planned)`;
  };
  const formatExceptions = units.filter((u) => formatDetail(formatFor(u.key)) !== formatDetail(format));
  const formatOk = (f: FormatPlan) => f.kind !== null;
  /** Playoffs only apply where the planned format is not already a knockout. */
  const playoffActive = (key: string) => playoffFor(key).choice === "playoffs" && formatFor(key).kind !== "knockout";
  const playoffExceptions = units.filter((u) => playoffDetail(playoffFor(u.key), formatFor(u.key).kind) !== playoffDetail(playoff, format.kind));
  const partnerOf = (k: string): Partner | null => a.partner?.[k] ?? null;
  const fee: FeeCfg = { ...DEFAULT_FEE, ...(a.fee ?? {}) };
  const setFee = (p: Partial<FeeCfg>) => setA({ ...a, fee: { ...fee, ...p } });
  const feeFor = (k: string) => (fee.varies ? fee.perUnit[k] ?? "" : fee.amount);
  const feeUnitText = (u: { key: string; disc: Disc | null }) => `R${feeFor(u.key) || "?"} ${u.disc === "doubles" && fee.doublesBasis === "pair" ? "per pair" : "per player"}`;
  const feeSummary = fee.has === null ? "Not chosen" : !fee.has ? "No entry fee" : fee.varies ? "Varies by category" : `R${fee.amount || "?"}`;
  const discOk = units.every((u) => u.disc !== null);
  const unitLabel = (k: string) => units.find((u) => u.key === k)?.label ?? "Not placed yet";
  const eligOf = (k: string): Elig => a.elig[k] ?? DEFAULT_ELIG;
  const setElig = (k: string, p: Partial<Elig>) => setA({ ...a, elig: { ...a.elig, [k]: { ...eligOf(k), ...p } } });
  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? "League";
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Member";
  const pickIds = Object.keys(a.picks);
  const anyManual = units.some((u) => eligOf(u.key).mode === "manual");
  const selfEntry = a.source === "self" || a.source === "both";
  const showPick = a.source === "select" || a.source === "both" || anyManual;

  const defaultMsg = [
    "Hi {{first_name}},",
    "You are invited to enter {{tournament_name}} at {{club_name}}.",
    "You can enter: {{categories}}.",
    "Enter here: {{entry_link}}",
    "Entries close: {{closing_date}}",
    "Tournament days: {{dates}}",
  ].join("\n\n");
  const msgBody = msg.body ?? defaultMsg;
  const previewVars: Record<string, string> = {
    first_name: "Jane",
    tournament_name: "your tournament (name added when created)",
    club_name: clubName || "your club",
    categories: units.map((u) => u.label).join(", ") || "categories still to be set",
    entry_link: "[entry link added when the tournament is created]",
    closing_date: "[set later]",
    dates: a.days.filter((d) => d.date).map((d) => fmtDay(d.date)).join(", ") || "[set in the Dates step]",
  };
  const preview = msgBody.replace(/{{\s*([a-z_]+)\s*}}/g, (m, k) => previewVars[k] ?? m);
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
        <Button variant="ghost" size="icon" aria-label="Remove stage" onClick={() => setStages(stages.filter((x) => x.id !== s.id))}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["play_by", "scheduled", "later"] as const).map((m) => <Button key={m} type="button" size="sm" variant={s.mode === m ? "default" : "outline"} aria-pressed={s.mode === m} onClick={() => updStage(s.id, { mode: m })}>{m === "play_by" ? "Play by a date" : m === "scheduled" ? "Play on scheduled date/time" : "Decide later"}</Button>)}
      </div>
      {s.mode === "play_by" && <div className="max-w-[220px] space-y-1"><Label>Deadline</Label><Input type="date" aria-label="Play-by deadline" value={s.deadline} onChange={(e) => updStage(s.id, { deadline: e.target.value })} /></div>}
      {s.mode === "scheduled" && <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label>Date</Label><Input type="date" aria-label="Scheduled date" value={s.date} onChange={(e) => updStage(s.id, { date: e.target.value })} /></div>
          <div className="space-y-1"><Label>From</Label><Input type="time" aria-label="Session from" value={s.from} onChange={(e) => updStage(s.id, { from: e.target.value })} /></div>
          <div className="space-y-1"><Label>To</Label><Input type="time" aria-label="Session to" value={s.to} onChange={(e) => updStage(s.id, { to: e.target.value })} /></div>
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
  const steps: StepKey[] = isChamps
    ? ["Type", "Basics", "What", "Match", "Categories", "Subcategories", ...(units.length > 1 ? ["Overrides" as const] : []), "ExpEntries", "Format", "Seeding", ...(dblUnits.length ? ["Partners" as const] : []), "Players", "Eligibility",
      ...(showPick ? ["Pick" as const] : []), ...(selfEntry ? ["Invites" as const, "Messaging" as const] : []), "Fees", "Schedule", "Summary"]
    : ["Type", "Basics", "Entries", "What", "Match", "Categories", "Subcategories", ...(units.length > 1 ? ["Overrides" as const] : []), "Format", "Seeding", ...(dblUnits.length ? ["Partners" as const] : []), "Players", "Eligibility",
      ...(showPick ? ["Pick" as const] : []), ...(selfEntry ? ["Invites" as const, "Messaging" as const] : []), "Fees", "Dates", "Courts", "Playoffs", "Summary"];
  const cur = steps[Math.min(step, steps.length - 1)];
  const go = (k: StepKey) => { const i = steps.indexOf(k); if (i >= 0) setStep(i); };

  const entriesOk = Number(a.entries) > 0 && Number.isFinite(Number(a.entries));
  const playOk = a.playType !== null;
  const daysOk = a.days.length > 0 && a.days.every((d) => d.date);
  const courtsOk = a.days.every((d) => d.venue.trim() && Number(d.courts) > 0 && d.windows.length > 0 && d.windows.every((w) => w.from && w.to && w.from < w.to));
  const eligOk = units.every((u) => { const e = eligOf(u.key); return e.mode !== "leagues" || e.leagueIds.length > 0; });
  const pickOk = a.source === "select" ? pickIds.length > 0 : true;
  const periodOk = !!a.periodStart;
  const basicsOk = !!a.name?.trim() && !!a.scope && !!derivedOwner && (!isChamps || periodOk);
  const ownerText = a.scope ? `${SCOPE_LABEL[a.scope]} · ${derivedOwner ?? (ownerLoading ? "looking up…" : "owner not found")}` : "Level not chosen";
  const okFor: Record<StepKey, boolean> = { Type: a.kind !== null, Basics: basicsOk, Entries: entriesOk, ExpEntries: unitEntriesOk, What: playOk, Match: scoringOk(scoring), Categories: cats.length > 0, Subcategories: discOk, Overrides: units.every((u) => scoringOk(scoringFor(u.key))), Format: units.length ? units.every((u) => formatOk(formatFor(u.key))) : formatOk(format), Seeding: units.every((u) => seedFor(u.key) !== null), Partners: dblUnits.every((u) => partnerOf(u.key) !== null),
    Players: a.source !== null, Eligibility: eligOk, Pick: pickOk, Invites: a.invite !== null, Messaging: msg.later || a.invite === "later" || (msg.channels.some(chAvail) && !!msgBody.trim()), Fees: fee.has === false || (fee.has === true && units.every((u) => Number(feeFor(u.key)) >= 0 && feeFor(u.key) !== "")), Dates: daysOk, Courts: courtsOk, Split: true, Schedule: stages.length > 0 && stages.every(stageOk) && a.playoffSync !== null && a.playoffSync !== undefined, Playoffs: true, Summary: false };
  const canNext = okFor[cur];
  const reached = useMemo(() => {
    let i = 0; while (i < steps.length - 1 && okFor[steps[i]]) i++; return i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(okFor), steps.join()]);

  /** Exact field when the organiser picked everyone; otherwise the estimate (provisional). */
  const knownField = a.source === "select" && pickIds.length > 0;
  const champsEstimate = units.reduce((n, u) => n + (Number(a.unitEntries?.[u.key]) || 0), 0);
  const fieldCount = knownField ? pickIds.length : isChamps ? champsEstimate : Number(a.entries) || 0;
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
  const provisional = !knownField || pickIds.some((id) => !units.some((u) => u.key === a.picks[id])) || selfEntry;
  const groupCount = (key: string) => Object.values(a.picks).filter((k) => k === key).length;

  const discText = (k: string) => { const d = units.find((u) => u.key === k)?.disc; return d ? PLAY_LABEL[d] : "?"; };
  const eligText = (k: string) => {
    const e = eligOf(k);
    const who = e.mode === "everyone" ? "Everyone" : e.mode === "leagues" ? (e.leagueIds.map(leagueName).join(" + ") || "Leagues not chosen") : "Players I pick";
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
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
                {i < reached && i !== step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {STEP_LABEL[s]}
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
              <Q t="What categories will you have?" h="Give each category any name you like, for example Men's, Ladies, Open or Men's A." />
              <div className="space-y-2">
                {a.categories.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label={`Category ${i + 1}`} value={c} placeholder={`Category ${i + 1}`} onChange={(e) => setA({ ...a, categories: a.categories.map((x, j) => (j === i ? e.target.value : x)) })} />
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
                        {(["everyone", "leagues", "manual"] as const).map((m) => (
                          <button key={m} type="button" aria-pressed={e.mode === m} onClick={() => setElig(u.key, { mode: m })} className={cn("rounded-full border px-2.5 py-1 text-xs", e.mode === m ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground")}>
                            {m === "everyone" ? "Everyone" : m === "leagues" ? "Specific league(s)" : "Players I pick"}
                          </button>
                        ))}
                      </div>
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
              <Q t="Pick your players" h="Tap a member to add them, then choose where each one plays." />
              {knownField && <div className="rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">You've picked {pickIds.length} player{pickIds.length === 1 ? "" : "s"}. Because the field is known, SquashHub will plan with this exact number instead of your estimate.</div>}
              {a.source === "both" && <div className="text-xs text-muted-foreground">Other eligible members can still enter themselves, so the total stays provisional until entries close.</div>}
              {units.some((u) => u.disc === "doubles") && <div className="text-xs text-muted-foreground">Doubles groups take players who will be paired up — partners are matched later. A player placed in a Singles group is not counted as a doubles entry.</div>}
              <Input placeholder="Search members" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              {(() => { const q = memberSearch.trim().toLowerCase(); const n = members.filter((m) => !(m.id in a.picks) && m.name.toLowerCase().includes(q)).length;
                return <div className="text-xs text-muted-foreground">{n} of {members.length} members available{q ? " matching your search" : ""}</div>; })()}
              <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-border p-2">
                {members.filter((m) => !(m.id in a.picks) && m.name.toLowerCase().includes(memberSearch.trim().toLowerCase())).map((m) => (
                  <button key={m.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                    onClick={() => setA({ ...a, picks: { ...a.picks, [m.id]: units.length === 1 ? units[0].key : "" } })}>
                    {m.name}<Plus className="h-3 w-3" />
                  </button>
                ))}
                {members.length === 0 && <div className="text-xs text-muted-foreground">No active members found.</div>}
              </div>
              {pickIds.length > 0 && (
                <div className="space-y-1">
                  <Label>Picked ({pickIds.length})</Label>
                  {pickIds.map((id) => (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1">{memberName(id)}</span>
                      <select aria-label={`Place ${memberName(id)}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={a.picks[id]}
                        onChange={(e) => setA({ ...a, picks: { ...a.picks, [id]: e.target.value } })}>
                        <option value="">Not placed yet</option>
                        {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                      </select>
                      <Button variant="ghost" size="icon" aria-label="Remove player" onClick={() => { const n = { ...a.picks }; delete n[id]; setA({ ...a, picks: n }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
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
            </>
          )}

          {cur === "Messaging" && (
            <>
              <Q t="How should the invitation read?" h="Setup only — nothing is sent from here. Sending and test messages come later." />
              {(a.invite === "later" || msg.later) ? (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>{a.invite === "later" ? "You chose to decide invitations later, so the message can be set up later too." : "You'll set up the message later."}</p>
                  <Button variant="outline" size="sm" onClick={() => setMsg({ later: false })}>Set it up now anyway</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Goes to: <b>{a.invite ? INVITE_LABEL[a.invite] : "the invitation audience"}</b>. Players you already picked are entered and don't need an invitation.</p>
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
                      {msg.body !== null && <Button variant="ghost" size="sm" onClick={() => setMsg({ body: null })}>Reset to suggested wording</Button>}
                    </div>
                    <textarea id="sbs-msg" rows={9} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={msgBody} onChange={(e) => setMsg({ body: e.target.value })} />
                    <p className="text-[11px] text-muted-foreground">Words in {"{{ }}"} fill in automatically: first_name, tournament_name, club_name, categories, entry_link, closing_date, dates. They update as you add details later.</p>
                  </div>
                  <div>
                    <Label className="text-sm">Preview (example member)</Label>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview}</div>
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
                  <DoublesOption label="A player may enter both partners" description="Yes: one player may register the pair if players choose partners. No: each partner registers themselves." value={a.doublesEntry ?? null} onChange={(value) => setA({ ...a, doublesEntry: value })} />
                  <DoublesOption label="A player may pay for both partners" description="Yes: a player may choose to pay for both; they do not have to. No: each partner pays their own fee." value={fee.doublesCover} onChange={(value) => setFee({ doublesCover: value })} />
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
                  <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="text-sm font-semibold">{fmtDay(d.date)}</div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                      <div className="space-y-1"><Label>Venue / club</Label><Input value={d.venue} onChange={(e) => updDay(i, { venue: e.target.value })} placeholder="e.g. Riverside Squash Club" /></div>
                      <div className="space-y-1"><Label>Courts</Label><div className="flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm font-semibold" aria-live="polite">{d.courtIds?.length ? d.courtIds.length : "—"}</div><p className="text-xs text-muted-foreground">Set by clicking the courts below.</p></div>
                    </div>
                    {clubCourts.length > 0 && (
                      <div className="space-y-1">
                        <Label>Which of your club's courts? (optional)</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {clubCourts.map((c) => {
                            const on = d.courtIds?.includes(c.id);
                            return (
                              <button key={c.id} type="button" aria-pressed={!!on}
                                onClick={() => { const ids = on ? (d.courtIds ?? []).filter((x) => x !== c.id) : [...(d.courtIds ?? []), c.id]; updDay(i, { courtIds: ids, courts: String(ids.length) }); }}
                                 className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", on ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm" : "border-border text-muted-foreground hover:border-primary/50")}>
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <Label>Times courts are free</Label>
                    {d.windows.map((w, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <Input type="time" className="max-w-[130px]" aria-label="From" value={w.from} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)) })} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="time" className="max-w-[130px]" aria-label="To" value={w.to} onChange={(e) => updDay(i, { windows: d.windows.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove time" disabled={d.windows.length === 1} onClick={() => updDay(i, { windows: d.windows.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => updDay(i, { windows: [...d.windows, { from: "", to: "" }] })}><Plus className="mr-1 h-4 w-4" />Add another time slot</Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {cur === "Format" && (
            <>
              <Q t="What format are you planning?" h="How players will compete — separate from how each match is scored." />
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">This is your planned format. Once registrations close and final player numbers are known, SquashHub will revisit the format with you before pools, draws or fixtures are generated.</div>
              <FormatFields value={format} onChange={setFormat} units={units} />
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
                    {subs.length > 0 && a.formatOverrides?.[cat] && <FormatFields value={a.formatOverrides[cat]} onChange={(patch) => setFormatOverride(cat, patch)} units={units} compact />}
                    {catUnits.map((u) => <div key={u.key} className="space-y-2 border-t border-border pt-2">
                      <div className="text-xs font-medium">{subs.length ? u.base.split(" › ").slice(1).join(" › ") : u.base} · {formatDetail(formatFor(u.key))}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant={!a.formatOverrides?.[u.key] ? "default" : "outline"} onClick={() => setFormatOverride(u.key, null)}>Inherit {subs.length ? "category" : "tournament"}</Button>
                        <Button type="button" size="sm" variant={a.formatOverrides?.[u.key] ? "default" : "outline"} onClick={() => setFormatOverride(u.key, {})}>Change this {subs.length ? "subcategory" : "category"}</Button>
                      </div>
                      {a.formatOverrides?.[u.key] && <FormatFields value={a.formatOverrides[u.key]} onChange={(patch) => setFormatOverride(u.key, patch)} units={units} compact />}
                    </div>)}
                  </div>;
                })}
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
              <div className="rounded-md border-2 border-primary bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary">▼ Playoffs begin</div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">Playoffs <span className="font-normal text-muted-foreground">· {a.playoffSync === true ? "common dates for all categories" : a.playoffSync === false ? "per category" : a.playoffSync === "later" ? "synchronisation decided later" : "synchronisation not chosen"}</span></div>
                <p className="text-xs text-muted-foreground">Playoffs don't copy the main-round schedule — pick a method for each.</p>
                {playoffStages.length === 0 && <p className="text-xs text-muted-foreground">No playoff stages yet.</p>}
                {playoffStages.map(renderStage)}
                <Button variant="outline" size="sm" onClick={() => { const used = playoffStages.filter((x) => !x.unit).map((x) => x.name); const next = PLAYOFF_STAGE_NAMES.find((n) => !used.includes(n)) ?? "Final"; setStages([...stages, newStage(next, "later", "", "playoff")]); }}><Plus className="mr-1 h-4 w-4" />Add playoff stage</Button>
              </div>
              {stages.length > 0 && <div className="space-y-1 border-t border-border pt-3"><div className="text-sm font-semibold">Stage-by-stage plan</div><StageTable stages={stages} unitName={stageUnit} when={stageWhen} /></div>}
            </>
          )}

          {cur === "Playoffs" && (
            <>
              <Q t="Will there be playoffs?" h="Playoffs follow your planned format. Categories inherit the tournament plan unless you choose an exception below. Planning only — no draw or fixtures are made, and this is revisited at Confirm final format." />
              <PlayoffFields value={playoff} onChange={setPlayoff} format={format.kind} />
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
                    {subs.length > 0 && a.playoffOverrides?.[cat] && <PlayoffFields value={a.playoffOverrides[cat]} onChange={(patch) => setPlayoffOverride(cat, patch)} format={formatFor(cat).kind} />}
                    {catUnits.map((u) => <div key={u.key} className="space-y-2 border-t border-border pt-2">
                      <div className="text-xs font-medium">{subs.length ? u.base.split(" › ").slice(1).join(" › ") : u.base} · {playoffDetail(playoffFor(u.key), formatFor(u.key).kind)}</div>
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
                <p className="mt-1">{knownField ? `${pickIds.length} selected players${provisional ? " (some are not placed yet)" : ""}` : `${fieldCount || "No"} estimated entries${pickIds.length ? `, including ${pickIds.length} picked so far` : ""}`} across {units.length} group{units.length === 1 ? "" : "s"}.</p>
                {units.filter((u) => playoffActive(u.key)).map((u) => {
                  const p = playoffFor(u.key); const picked = groupCount(u.key);
                  const count = knownField && !provisional ? picked : units.length === 1 ? fieldCount : null;
                  const needed = 2 ** p.rounds;
                  const suggested = count !== null && u.disc !== "doubles" ? count >= 8 ? "Quarterfinals + Semifinals + Final" : count >= 4 ? "Semifinals + Final" : count >= 2 ? "Final only" : "No playoff bracket yet" : null;
                  return <p key={u.key} className="mt-1 text-xs">{u.base}: {knownField && !provisional ? `${picked} selected ${u.disc === "doubles" ? "players (pair count not yet confirmed)" : "players"}` : `${picked} selected players${count ? `; about ${count} estimated entries` : `; group total unknown (overall estimate: ${fieldCount})`} (provisional)`}; {playoffText(p)} needs {needed} qualifying {u.disc === "doubles" ? "pairs" : "players"}{count !== null && u.disc !== "doubles" && count < needed ? " — fewer currently indicated, so a smaller bracket may suit better" : ""}.{suggested && ` A simple ${knownField && !provisional ? "field-size suggestion" : "provisional suggestion"} is ${suggested}.`}</p>;
                })}
                {plannedPlayoffMatches > 0 && <p className="mt-2">Those stages would add at least {plannedPlayoffMatches} match{plannedPlayoffMatches === 1 ? "" : "es"}. {capacityEstimateValid && courtsOk && daysOk ? `At an illustrative ${units.some((u) => (scoringFor(u.key) ?? scoring)?.mode === "standard" && playoffActive(u.key)) ? "35 min (best of 3) / 55 min (best of 5) for standard matches, or the chosen Bells cap" : "chosen Bells cap"}, the playoff matches alone use about ${Math.round(playoffMinutes / 60 * 10) / 10} of ${Math.round(courtHours * 10) / 10} available court-hours across ${a.days.length} day${a.days.length === 1 ? "" : "s"}. ${playoffMinutes <= courtHours * 60 ? "They appear to fit by total court time, subject to the full schedule." : "They exceed the available court time on this rough estimate."}` : "Complete the match duration and court times for a rough fit check."}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Pool games, rest, changeovers, actual match lengths, fixed court slots and simultaneous groups are not included. Dates, courts or entry counts may change; review this advice again when actual entries are known. Your choice is never blocked by this tip.</p>
              </div>
            </>
          )}

          {cur === "Summary" && (
            <>
              <Q t="Here's what we know so far" h="Check it over. Tap Edit on any part to change it." />
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
                {playoffExceptions.length > 0 && <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{playoffDetail(playoffFor(u.key), formatFor(u.key).kind)}</span></li>)}</ul>}
                {provisional && <span className="text-xs text-muted-foreground">Recommendations provisional until entries are known.</span>}
              </SummaryRow>}
              <SummaryRow icon={<Tags className="h-4 w-4" />} label="Categories" onEdit={() => go("Categories")}>
                <ul className="space-y-0.5">{cats.map((c, i) => {
                  const subs = (a.subcats[c] ?? []).map((s) => s.trim()).filter(Boolean);
                  return <li key={i}>{c}{subs.length > 0 ? <span className="text-muted-foreground"> — {subs.map((x) => `${x} ${discText(`${c}::${x}`)}`).join(", ")}</span> : <span className="text-muted-foreground"> — {discText(c)}</span>}</li>;
                })}</ul>
              </SummaryRow>
              {dblUnits.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label="Doubles partners" onEdit={() => go("Partners")}>
                <ul className="space-y-0.5">{dblUnits.map((u) => <li key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "Not chosen"}</span></li>)}</ul>
              </SummaryRow>}
              <SummaryRow icon={<UserPlus className="h-4 w-4" />} label="How players join" onEdit={() => go("Players")}>{a.source ? SOURCE_LABEL[a.source] : "Not chosen"}</SummaryRow>
              <SummaryRow icon={<ShieldCheck className="h-4 w-4" />} label="Who may enter" onEdit={() => go("Eligibility")}>
                <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{eligText(u.key)}</span></li>)}</ul>
              </SummaryRow>
              {pickIds.length > 0 && <SummaryRow icon={<Users className="h-4 w-4" />} label="Picked players" onEdit={() => go("Pick")}>
                <ul className="space-y-0.5">{pickIds.map((id) => <li key={id}>{memberName(id)} <span className="text-muted-foreground">— {unitLabel(a.picks[id])}</span></li>)}</ul>
              </SummaryRow>}
              {selfEntry && <SummaryRow icon={<Mail className="h-4 w-4" />} label="Invitations" onEdit={() => go("Invites")}>{a.invite ? INVITE_LABEL[a.invite] : "Not chosen"} <span className="text-muted-foreground">· not sent</span></SummaryRow>}
              {selfEntry && <SummaryRow icon={<MessageSquare className="h-4 w-4" />} label="Messaging" onEdit={() => go("Messaging")}>{(a.invite === "later" || msg.later) ? "Configure later" : `${msg.channels.filter(chAvail).map((c) => CHANNEL_LABEL[c]).join(", ") || "No channel"} · ${msg.body === null ? "suggested wording" : "custom wording"}`} <span className="text-muted-foreground">· setup only, not sent</span></SummaryRow>}
              <SummaryRow icon={<Wallet className="h-4 w-4" />} label="Fees & Payment" onEdit={() => go("Fees")}>
                {fee.has ? <ul className="space-y-0.5">{units.map((u) => <li key={u.key}>{u.label}: <span className="text-muted-foreground">{feeUnitText(u)}</span></li>)}</ul> : feeSummary}
                {dblUnits.length > 0 && <ul className="space-y-0.5"><li>One player may enter the pair: <span className="text-muted-foreground">{ruleAnswer(a.doublesEntry ?? null)}</span></li><li>One player may pay for both: <span className="text-muted-foreground">{ruleAnswer(fee.doublesCover)}</span></li></ul>}
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
            </>
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
                {playoffExceptions.length > 0 && units.map((u) => <TreeLeaf key={u.key}><Button type="button" variant="link" size="sm" className="h-auto p-0 text-left text-xs" onClick={() => go("Playoffs")}>{u.base}: {playoffDetail(playoffFor(u.key), formatFor(u.key).kind)}</Button></TreeLeaf>)}
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
                  {selfEntry && <TreeLeaf><button type="button" onClick={() => go("Messaging")} className="rounded px-1 hover:bg-muted">Message: {(a.invite === "later" || msg.later) ? "Configure later" : `${msg.channels.filter(chAvail).map((c) => CHANNEL_LABEL[c]).join(", ") || "No channel"} · ${msg.body === null ? "suggested wording" : "custom wording"}`}</button></TreeLeaf>}
                </TreeNode>
              )}
              {dblUnits.length > 0 && dblUnits.some((u) => partnerOf(u.key)) && (
                <TreeNode icon={<Users className="h-4 w-4" />} title="Doubles partners" onClick={() => go("Partners")}>
                  {dblUnits.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{partnerOf(u.key) ? PARTNER_LABEL[partnerOf(u.key)!] : "not chosen"}</span></TreeLeaf>)}
                </TreeNode>
              )}
              {(fee.has !== null || dblUnits.length > 0) && (
                <TreeNode icon={<Wallet className="h-4 w-4" />} title={`Fees: ${feeSummary}`} onClick={() => go("Fees")}>
                  {fee.has && units.map((u) => <TreeLeaf key={u.key}>{u.base}: <span className="text-muted-foreground">{feeUnitText(u)}</span></TreeLeaf>)}
                  {dblUnits.length > 0 && <><TreeLeaf>One player may enter the pair: <span className="text-muted-foreground">{ruleAnswer(a.doublesEntry ?? null)}</span></TreeLeaf><TreeLeaf>One player may pay for both: <span className="text-muted-foreground">{ruleAnswer(fee.doublesCover)}</span></TreeLeaf></>}
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
        <div><Label>How are qualifiers paired?</Label><select aria-label="How playoff qualifiers are paired" className={sel} value={value.pairing} onChange={(e) => onChange({ pairing: e.target.value as PlayoffPlan["pairing"] })}><option value="later">Decide pairing later</option>{poolish && <option value="cross_pools">Crossover (A1 v B2, B1 v A2)</option>}<option value="seeded">Seeded (highest v lowest)</option></select></div>
      </>}
      <p className="text-xs text-muted-foreground">Ideas for later setup, not a draw. Revisited at Confirm final format; no bracket is generated here.</p>
    </div>}
  </div>;
}
function FormatFields({ value, onChange, units, compact = false }: { value: FormatPlan; onChange: (patch: Partial<FormatPlan>) => void; units: { key: string; base: string }[]; compact?: boolean }) {
  const sel = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return <div className="space-y-3">
    <div className={cn("grid gap-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {(Object.keys(COMP_LABEL) as CompKind[]).map((k) => compact
        ? <Button key={k} type="button" size="sm" variant={value.kind === k ? "default" : "outline"} aria-pressed={value.kind === k} onClick={() => onChange({ kind: k })}>{COMP_LABEL[k]}</Button>
        : <Choice key={k} active={value.kind === k} onClick={() => onChange({ kind: k })} title={COMP_LABEL[k]} desc={COMP_DESC[k]} />)}
    </div>
    {value.kind === "pools" && <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">The number of pools will be decided later for each category or subcategory, based on the number of entries. Categories and subcategories are not themselves automatically pools — a category/subcategory such as Men's A Singles may later contain one, two, three or more pools. Pool numbers stay provisional during planning and are finalised once registrations close and actual entry numbers are known.</div>}
    {value.kind === "knockout" && <div className="max-w-[320px]"><Label>Expected draw (optional)</Label><select aria-label="Expected draw" className={sel} value={value.drawRounds} onChange={(e) => onChange({ drawRounds: e.target.value })}><option value="">Decide when entries are known</option><option value="Draw of 4">Draw of 4</option><option value="Draw of 8">Draw of 8</option><option value="Draw of 16">Draw of 16</option><option value="Draw of 32">Draw of 32</option></select><p className="mt-1 text-xs text-muted-foreground">The final draw size depends on actual entries.</p></div>}
    {value.kind === "swiss" && <div className="max-w-[260px] space-y-1"><Label>Roughly how many rounds? (optional)</Label><Input type="number" min="1" aria-label="Anticipated Swiss rounds" value={value.swissRounds} onChange={(e) => onChange({ swissRounds: e.target.value })} placeholder="e.g. 5" /><p className="text-xs text-muted-foreground">Each round pairs players on similar results; nobody is eliminated.</p></div>}
    {value.kind === "cross" && <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Everyone in the first group plays everyone in the second — not within their own group.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label>Group A</Label><select aria-label="First group to cross" className={sel} value={value.crossA} onChange={(e) => onChange({ crossA: e.target.value })}><option value="">Choose later</option>{units.map((u) => <option key={u.key} value={u.key}>{u.base}</option>)}</select></div>
        <div><Label>Group B</Label><select aria-label="Second group to cross" className={sel} value={value.crossB} onChange={(e) => onChange({ crossB: e.target.value })}><option value="">Choose later</option>{units.filter((u) => u.key !== value.crossA).map((u) => <option key={u.key} value={u.key}>{u.base}</option>)}</select></div>
      </div>
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
    </div> : <div className="max-w-[240px] space-y-1"><Label>Minutes per match</Label><Input type="number" min="1" step="1" aria-label="Minutes per match" value={value.timeCapMinutes} onChange={(e) => onChange({ timeCapMinutes: e.target.value })} placeholder="e.g. 15" /></div>}
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
