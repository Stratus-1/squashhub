import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { applyHandicapsToChamp, findReservesMissingShadowRank, buildScoreMapFromGroups, isCrossLeagueTournament, type MissingShadowRank, type DivisionSizes } from "@/lib/tournament-formats/handicap";
import { ShadowRankPromptDialog } from "./ShadowRankPromptDialog";
import { useClubMembers, type ClubMember } from "@/hooks/use-club";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Users, Trophy, ChevronRight, ChevronLeft, Loader2, Trash2, Eye, Pencil, Plus, X, GripVertical, Save, Copy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, eachDayOfInterval, getDay, parseISO } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TournamentRegistrationsDialog } from "./TournamentRegistrationsDialog";
import { Users as UsersIcon } from "lucide-react";
import { getTournamentFormat, listTournamentFormats } from "@/lib/tournament-formats";

interface ClubChampsTabProps {
  clubId: string;
}

type WizardStep = "category" | "courts" | "registration" | "players" | "groups" | "schedule" | "review";
type GenderCategory = "men" | "ladies" | "mixed" | "open";
type MatchType = "singles" | "doubles";

const STEPS: WizardStep[] = ["category", "courts", "registration", "players", "groups", "schedule", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  category: "Category",
  courts: "Courts",
  registration: "Registration",
  players: "Players",
  groups: "Leagues",
  schedule: "Schedule",
  review: "Review & Generate",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DoublePair {
  id: string; // temporary id for UI
  player1Id: string;
  player2Id: string;
}

/**
 * Generate round-robin rounds for a list of entity ids.
 *
 * - `single`  → each pair plays once (current default).
 * - `double`  → each pair plays twice; the second leg swaps home/away
 *               so the same pair appears in two different rounds.
 *
 * For odd counts a "BYE" placeholder is added; the byes are reported back
 * via the third tuple member of `byes` (per round) so the caller can decide
 * how to surface them (no_match / walkover / neutral).
 */
type RoundRobinResult = {
  rounds: Array<Array<[string, string, "home" | "away" | null]>>;
  byesPerRound: Array<string | null>;
};

function generateRoundRobinRounds(
  entityIds: string[],
  format: "single" | "double" = "single",
): RoundRobinResult {
  const entities = [...entityIds];
  const hasBye = entities.length % 2 !== 0;
  if (hasBye) entities.push("BYE");
  const n = entities.length;

  const singleRounds: Array<Array<[string, string, "home" | "away" | null]>> = [];
  const byesPerRound: Array<string | null> = [];

  for (let round = 0; round < n - 1; round++) {
    const matches: Array<[string, string, "home" | "away" | null]> = [];
    let byeId: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = entities[i];
      const b = entities[n - 1 - i];
      if (a === "BYE") byeId = b;
      else if (b === "BYE") byeId = a;
      else {
        // First leg: alternate home/away orientation each pair to keep things fair.
        // Pair index i=0 → A home; the round-robin algorithm naturally varies who
        // is in the "home" slot across rounds.
        matches.push([a, b, format === "double" ? "home" : null]);
      }
    }
    singleRounds.push(matches);
    byesPerRound.push(byeId);
    const last = entities.pop()!;
    entities.splice(1, 0, last);
  }

  if (format === "single") {
    return { rounds: singleRounds, byesPerRound };
  }

  // Double round-robin: append the same fixtures with sides swapped (away leg).
  const awayRounds = singleRounds.map((round) =>
    round.map(([a, b]) => [b, a, "away"] as [string, string, "home" | "away" | null]),
  );
  return {
    rounds: [...singleRounds, ...awayRounds],
    byesPerRound: [...byesPerRound, ...byesPerRound],
  };
}

const GENDER_LABELS: Record<GenderCategory, string> = {
  men: "Men's",
  ladies: "Ladies'",
  mixed: "Mixed",
  open: "Open",
};

// "mixed" = traditional 1 man + 1 lady doubles. "open" = any pair (M+M, F+F, M+F).
// Both impose no per-player gender filter when selecting entrants.
function memberMatchesTournamentGender(memberGender: string | null | undefined, tournamentGender: GenderCategory) {
  if (tournamentGender === "mixed" || tournamentGender === "open") return true;
  const normalized = String(memberGender || "").toLowerCase();
  const matchValues = tournamentGender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
  return matchValues.includes(normalized);
}

// Format datetime-local / ISO strings nicely for invite text.
function formatInviteDate(value: string | null | undefined, withTime = false): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  if (!withTime) return date;
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

// Build the descriptive bullet lines that appear in both the in-app
// notification body and the email invitation. Keeps preview + actual send
// perfectly in sync.
function buildInviteDetailLines(opts: {
  gender: GenderCategory;
  matchType: "singles" | "doubles";
  scoringMode: string;
  roundFormat: "" | "single_round_robin" | "double_round_robin" | "cross_league";
  byeHandling: "" | "no_match" | "walkover_win" | "neutral";
  partnerMode: "" | "admin" | "players";
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  customizeDailySchedule?: boolean;
  daySchedules?: { date: string; start_time: string; end_time: string }[];
  registrationOpensAt: string;
  registrationClosesAt: string;
  entryFeeRand: string;
  pointsPerGame?: number;
  bestOf?: number;
  registrationRequired?: boolean;
  registrationMode?: "" | "open" | "invite";
}): string[] {
  const lines: string[] = [];
  const isDoubles = opts.matchType === "doubles";
  lines.push(`Category: ${GENDER_LABELS[opts.gender]} ${isDoubles ? "Doubles" : "Singles"}`);

  try {
    const fmt = getTournamentFormat(opts.scoringMode);
    lines.push(`Scoring format: ${fmt.label}`);
  } catch {
    /* unknown format key — skip */
  }

  if (opts.scoringMode === "standard" && opts.pointsPerGame && opts.bestOf) {
    lines.push(`Game length: Par ${opts.pointsPerGame} (win by 2), best of ${opts.bestOf}`);
  }

  lines.push(
    `Round format: ${opts.roundFormat === "double_round_robin"
      ? "Double round-robin (home & away)"
      : "Single round-robin (each plays once)"}`
  );

  const byeLabel =
    opts.byeHandling === "walkover_win"
      ? "Walkover win — full points"
      : opts.byeHandling === "neutral"
      ? "Neutral — excluded from averages"
      : "No match — bye not recorded";
  lines.push(`Bye handling: ${byeLabel}`);

  if (isDoubles) {
    lines.push(
      `Partner selection: ${opts.partnerMode === "players"
        ? "Players choose their own partner"
        : "Admin pairs all players"}`
    );
  }

  const start = formatInviteDate(opts.startDate);
  const end = formatInviteDate(opts.endDate);
  if (start && end) {
    lines.push(start === end ? `Date: ${start}` : `Dates: ${start} → ${end}`);
  } else if (start) {
    lines.push(`Starts: ${start}`);
  }

  // Play times — either per-day windows or a single global window.
  const ds = (opts.customizeDailySchedule && opts.daySchedules && opts.daySchedules.length > 0)
    ? opts.daySchedules.filter((d) => d.date && d.start_time && d.end_time)
    : [];
  if (ds.length > 0) {
    // Group windows by date and format like "Sat 17 Jun: 10:00–12:00, 14:00–16:00"
    const byDate = new Map<string, string[]>();
    for (const d of ds) {
      const arr = byDate.get(d.date) || [];
      arr.push(`${d.start_time.slice(0, 5)}–${d.end_time.slice(0, 5)}`);
      byDate.set(d.date, arr);
    }
    const dates = Array.from(byDate.keys()).sort();
    if (dates.length === 1) {
      const dLabel = formatInviteDate(dates[0]) || dates[0];
      lines.push(`Play times (${dLabel}): ${byDate.get(dates[0])!.join(", ")}`);
    } else {
      lines.push("Play times:");
      for (const d of dates) {
        const dLabel = formatInviteDate(d) || d;
        lines.push(`  ${dLabel}: ${byDate.get(d)!.join(", ")}`);
      }
    }
  } else if (opts.startTime && opts.endTime) {
    lines.push(`Play time: ${opts.startTime.slice(0, 5)}–${opts.endTime.slice(0, 5)}`);
  }

  if (opts.registrationRequired === false) {
    lines.push("Registration: Not required — admin selects players");
  } else if (opts.registrationMode === "invite") {
    lines.push("Registration: Invite-only");
  } else if (opts.registrationMode === "open") {
    lines.push("Registration: Open to all eligible members");
  }

  const regOpens = formatInviteDate(opts.registrationOpensAt, true);
  const regCloses = formatInviteDate(opts.registrationClosesAt, true);
  if (regOpens) lines.push(`Registration opens: ${regOpens}`);
  if (regCloses) lines.push(`Registration closes: ${regCloses}`);

  const fee = Number(opts.entryFeeRand) || 0;
  lines.push(fee > 0 ? `Entry fee: R${fee.toFixed(2)}` : "Entry fee: Free");

  // Format-specific "how it works" note appended after the bullets.
  if (opts.scoringMode === "bells") {
    lines.push("");
    lines.push("How Bells works:");
    lines.push("Games are time-capped (a bell signals the end of each game), so you play as many points as you can in the allotted time. Ranking is based on TOTAL POINTS SCORED across all your games — not how many games you won. Every point counts, win or lose, so keep playing hard until the bell.");
  }

  return lines;
}



function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      {children}
    </div>
  );
}

function DroppableLeague({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary/60 bg-primary/5")}>{children}</div>
  );
}

export function ClubChampsTab({ clubId }: ClubChampsTabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: members = [] } = useClubMembers(clubId);

  // Club-level payment config — drives the "Accepted payment methods" picker on the Registration step.
  // We read the configured online gateway (clubs.payment_gateway) and check whether bank details
  // exist in club_secrets to decide which EFT option to expose.
  const { data: clubPaymentConfig } = useQuery({
    queryKey: ["club-payment-config", clubId],
    queryFn: async () => {
      const [clubRes, secretsRes] = await Promise.all([
        fromExt("clubs").select("payment_gateway").eq("id", clubId).maybeSingle(),
        fromExt("club_secrets").select("bank_name,bank_account_number").eq("club_id", clubId).maybeSingle(),
      ]);
      const gw = (clubRes.data as any)?.payment_gateway as string | null;
      const sec = secretsRes.data as any;
      const eftConfigured = !!(sec?.bank_name || sec?.bank_account_number);
      const GW_LABELS: Record<string, string> = {
        payfast: "PayFast", yoco: "Yoco", peach: "Peach Payments", ozow: "Ozow",
        snapscan: "SnapScan", paystack: "Paystack", stripe: "Stripe",
      };
      return {
        gateway: gw,
        gatewayLabel: gw ? (GW_LABELS[gw] || gw) : null,
        eftConfigured,
      };
    },
    enabled: !!clubId,
  });

  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId);
      if (error) throw error;
      return data as { id: number; name: string }[];
    },
    enabled: !!clubId,
  });

  const { data: existingChamps = [], isLoading: champsLoading } = useQuery({
    queryKey: ["club-champs", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const [step, setStep] = useState<WizardStep>("category");
  const [showWizard, setShowWizard] = useState(false);
  const [editingChampId, setEditingChampId] = useState<string | null>(null);
  // Snapshot of entities (players / doubles pairs) at the moment an existing
  // tournament was loaded for edit. Used to prompt the admin to rebuild the
  // schedule when players are added / removed / swapped.
  const [entitiesSnapshotAtLoad, setEntitiesSnapshotAtLoad] = useState<string | null>(null);
  const [rebuildToastFiredForSnapshot, setRebuildToastFiredForSnapshot] = useState<string | null>(null);

  // Wizard state
  const [gender, setGender] = useState<GenderCategory>("men");
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [enablePlayoffs, setEnablePlayoffs] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [playerSearch, setPlayerSearch] = useState("");
  const [numGroups, setNumGroups] = useState(0);
  const [champName, setChampName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playDays, setPlayDays] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [matchDuration, setMatchDuration] = useState(0);
  const [scoringMode, setScoringMode] = useState<"" | "standard" | "time_capped_points">("");
  const [showCapacity, setShowCapacity] = useState(false);
  const [pointsPerGame, setPointsPerGame] = useState<0 | 11 | 15>(0);
  const [bestOf, setBestOf] = useState<0 | 3 | 5>(0);
  const [groupDurations, setGroupDurations] = useState<Record<string, number>>({});
  const [groupBreakMinutes, setGroupBreakMinutes] = useState<Record<string, number>>({});
  const [groupLabels, setGroupLabels] = useState<Record<string, string>>({});
  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState<number>(0);
  const [courtRotationMinutes, setCourtRotationMinutes] = useState<number | null>(null);
  const [roundFormat, setRoundFormat] = useState<"" | "single_round_robin" | "double_round_robin" | "cross_league">("");
  const [byeHandling, setByeHandling] = useState<"" | "no_match" | "walkover_win" | "neutral">("");
  const [selectedCourtIds, setSelectedCourtIds] = useState<Set<number>>(new Set());
  // Per-day schedule overrides — for short tournaments (Fri eve, Sat morning, Sat afternoon).
  // Each entry is one time window on one date. A date can appear multiple times (multi-session days).
  type DaySchedule = { date: string; start_time: string; end_time: string; court_ids: number[] | null };
  const [customizeDailySchedule, setCustomizeDailySchedule] = useState(false);
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<Map<string, number>>(new Map());
  const [playerOrder, setPlayerOrder] = useState<string[]>([]);

  // Doubles-specific state
  const [doublesPairs, setDoublesPairs] = useState<DoublePair[]>([]);
  const [pairGroupAssignments, setPairGroupAssignments] = useState<Map<string, number>>(new Map());
  const [pairOrder, setPairOrder] = useState<string[]>([]);

  // Visitor inclusion state
  const [includeVisitors, setIncludeVisitors] = useState(false);
  const [selectedVisitorClubs, setSelectedVisitorClubs] = useState<Set<string>>(new Set());

  // League pre-fill (internal or external/regional) — supports multiple leagues
  const [sourceLeagueIds, setSourceLeagueIds] = useState<Set<string>>(new Set());

  // Registration & payment
  const [registrationMode, setRegistrationMode] = useState<"" | "open" | "invite">("");
  const [partnerMode, setPartnerMode] = useState<"" | "admin" | "players">("");
  const [registrationOpensAt, setRegistrationOpensAt] = useState<string>("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState<string>("");
  const [entryFeeRand, setEntryFeeRand] = useState<string>("0");
  const [paymentMethods, setPaymentMethods] = useState<Set<"card" | "eft" | "cash">>(new Set(["card"]));
  const [paymentRequired, setPaymentRequired] = useState<boolean>(true);
  // When false, the registration step is collapsed (no public registration window,
  // no invite-list management) and the admin directly seeds the roster on the
  // Players step. Default true to match existing behaviour.
  const [registrationRequired, setRegistrationRequired] = useState<boolean>(true);
  const [inviteMethods, setInviteMethods] = useState<Set<"app" | "email">>(new Set(["app"]));
  // Controls WHEN invites go out: 'manual' (admin clicks Send later — default),
  // 'now' (prompt on save), or 'scheduled' (admin gets a reminder for the chosen date).
  const [inviteTiming, setInviteTiming] = useState<"manual" | "now" | "scheduled">("manual");
  const [inviteScheduledAt, setInviteScheduledAt] = useState<string>("");
  const [description, setDescription] = useState("");
  const [affectsRankingPoints, setAffectsRankingPoints] = useState<boolean>(false);
  const [showInvitePreview, setShowInvitePreview] = useState(false);

  // Invite by league (just for the initial roster — admin can still sub from any league later)
  const [inviteSource, setInviteSource] = useState<"manual" | "leagues">("manual");
  const [inviteIncludeReserves, setInviteIncludeReserves] = useState<boolean>(true);
  const [inviteExcludedMemberIds, setInviteExcludedMemberIds] = useState<Set<string>>(new Set());

  // Handicap (singles only): none, by league ranking, or by club ladder
  const [handicapMode, setHandicapMode] = useState<"none" | "league_rank" | "club_ladder">("none");
  // Divider/multiplier scale the raw gap. final = floor(gap * multiplier / divider).
  const [handicapDivider, setHandicapDivider] = useState<number>(1);
  const [handicapMultiplier, setHandicapMultiplier] = useState<number>(1);

  // No Show / Injured rule — applied when a player can't play a tournament match.
  // Opponent receives `noShowOpponentPoints`; the absent player records `noShowPlayerPoints`.
  const [noShowOpponentPoints, setNoShowOpponentPoints] = useState<number>(10);
  const [noShowPlayerPoints, setNoShowPlayerPoints] = useState<number>(0);

  // Shadow-rank prompt (Option C): when league-rank handicap is on and a
  // reserve participant has no ladder placement yet, we ask the admin to
  // assign a Division + Slot at schedule-build time and persist it.
  const [shadowPrompt, setShadowPrompt] = useState<{
    open: boolean;
    missing: MissingShadowRank[];
    sizes: DivisionSizes;
    resolve: (() => void) | null;
    reject: ((e: Error) => void) | null;
  }>({ open: false, missing: [], sizes: {}, resolve: null, reject: null });

  // For partnerMode === "players": auto-load confirmed pairs from registrations
  const { data: confirmedPairRegs = [] } = useQuery({
    queryKey: ["champ-confirmed-pairs", editingChampId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("club_member_id, partner_member_id")
        .eq("champ_id", editingChampId as string)
        .eq("partner_confirmed", true)
        .neq("status", "cancelled")
        .not("partner_member_id", "is", null);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!editingChampId && partnerMode === "players" && matchType === "doubles" && showWizard,
  });

  // Bells format ignores Match Duration (slot times are defined per-league).
  // Ensure schedulePreview's matchDuration guard passes by defaulting to 20.
  useEffect(() => {
    if (scoringMode === "time_capped_points" && (!matchDuration || matchDuration <= 0)) {
      setMatchDuration(20);
    }
  }, [scoringMode, matchDuration]);

  useEffect(() => {
    if (partnerMode !== "players" || matchType !== "doubles") return;
    // Dedupe reciprocal rows: only keep one pair per unordered (a,b)
    const seen = new Set<string>();
    const pairs: DoublePair[] = [];
    for (const r of confirmedPairRegs) {
      const a = r.club_member_id;
      const b = r.partner_member_id;
      if (!a || !b) continue;
      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ id: crypto.randomUUID(), player1Id: a, player2Id: b });
    }
    setDoublesPairs(pairs);
  }, [confirmedPairRegs, partnerMode, matchType]);

  const { data: availableLeagues = [] } = useQuery({
    queryKey: ["club-leagues-for-tournament", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select("id, name, code, association_id, league_associations:association_id(name, scope)")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clubId,
  });

  // Derive a tier label (e.g. "1st League", "2nd League") for each team-league row.
  // Tiers live on league_rounds.name (e.g. "1st League round 1") and link to teams via
  // platform_league_fixtures.home_team_code/away_team_code matched on league.code.
  const { data: leagueTierMap } = useQuery({
    queryKey: ["club-league-tiers", clubId, availableLeagues.map((l: any) => l.id).join(",")],
    enabled: availableLeagues.length > 0,
    queryFn: async () => {
      const assocIds = Array.from(new Set(availableLeagues.map((l: any) => l.association_id).filter(Boolean)));
      if (assocIds.length === 0) return new Map<string, string>();
      const { data: assocs } = await fromExt("league_associations")
        .select("id, platform_association_id")
        .in("id", assocIds);
      const platformByAssoc = new Map<string, string>();
      (assocs || []).forEach((a: any) => platformByAssoc.set(a.id, a.platform_association_id || a.id));
      const platformIds = Array.from(new Set(Array.from(platformByAssoc.values())));
      const yr = new Date().getFullYear();
      const { data: rounds } = await fromExt("league_rounds")
        .select("id, name, round_number, association_id")
        .in("association_id", platformIds)
        .gte("round_date", `${yr}-01-01`)
        .lte("round_date", `${yr}-12-31`);
      const tierByRound = new Map<string, string>();
      (rounds || []).forEach((r: any) => {
        const tier = (r.name || `Round ${r.round_number}`)
          .replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "")
          .trim();
        tierByRound.set(r.id, tier || `Round ${r.round_number}`);
      });
      const roundIds = Array.from(tierByRound.keys());
      const result = new Map<string, string>();
      if (roundIds.length === 0) return result;
      const { data: fixtures } = await fromExt("platform_league_fixtures" as any)
        .select("round_id, home_team_code, away_team_code, association_id")
        .in("round_id", roundIds);
      const tierByTeam = new Map<string, string>();
      (fixtures || []).forEach((f: any) => {
        const tier = tierByRound.get(f.round_id);
        if (!tier) return;
        if (f.home_team_code) tierByTeam.set(`${f.association_id}::${f.home_team_code}`, tier);
        if (f.away_team_code) tierByTeam.set(`${f.association_id}::${f.away_team_code}`, tier);
      });
      availableLeagues.forEach((l: any) => {
        const platformAssoc = platformByAssoc.get(l.association_id);
        if (!platformAssoc || !l.code) return;
        const tier = tierByTeam.get(`${platformAssoc}::${l.code}`);
        if (tier) result.set(l.id, tier);
      });
      return result;
    },
  });

  // Group team-leagues into tier rows (e.g. "Nelspruit Internal League — 1st League").
  // Leagues without a derivable tier (no fixtures yet) fall back to their own row.
  const leagueGroups = useMemo(() => {
    type Group = { key: string; label: string; leagueIds: string[]; tier: string | null; assocName: string; sortKey: number };
    const grouped = new Map<string, Group>();
    const ungrouped: Group[] = [];
    const tierNum = (t: string) => {
      const m = t.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 999;
    };
    availableLeagues.forEach((l: any) => {
      const assocName = l.league_associations?.name || "League";
      const tier = leagueTierMap?.get(l.id) || null;
      if (tier) {
        const key = `${l.association_id}::${tier}`;
        const ex = grouped.get(key);
        if (ex) ex.leagueIds.push(l.id);
        else grouped.set(key, { key, label: `${assocName} — ${tier}`, leagueIds: [l.id], tier, assocName, sortKey: tierNum(tier) });
      } else {
        ungrouped.push({ key: `solo::${l.id}`, label: `${assocName} — ${l.name}`, leagueIds: [l.id], tier: null, assocName, sortKey: 9999 });
      }
    });
    const groupedArr = Array.from(grouped.values()).sort(
      (a, b) => a.assocName.localeCompare(b.assocName) || a.sortKey - b.sortKey || (a.tier || "").localeCompare(b.tier || "")
    );
    ungrouped.sort((a, b) => a.label.localeCompare(b.label));
    return [...groupedArr, ...ungrouped];
  }, [availableLeagues, leagueTierMap]);

  const toggleSourceGroup = (leagueIds: string[]) => {
    const next = new Set(sourceLeagueIds);
    const allOn = leagueIds.every((id) => next.has(id));
    if (allOn) leagueIds.forEach((id) => next.delete(id));
    else leagueIds.forEach((id) => next.add(id));
    applyLeaguePrefill(next);
  };

  // Re-fetch & merge players whenever the league selection changes
  const applyLeaguePrefill = async (leagueIds: Set<string>) => {
    setSourceLeagueIds(leagueIds);
    if (leagueIds.size === 0) {
      setSelectedPlayerIds(new Set());
      return;
    }
    const { data: regs, error } = await fromExt("member_league_registrations")
      .select("club_member_id, is_reserve")
      .in("league_id", Array.from(leagueIds));
    if (error) {
      toast.error("Failed to load league players");
      return;
    }
    const filtered = (regs || []).filter((r: any) => inviteIncludeReserves || !r.is_reserve);
    const ids = new Set<string>(filtered.map((r: any) => r.club_member_id).filter(Boolean));
    // Honour any admin exclusions
    inviteExcludedMemberIds.forEach((id) => ids.delete(id));
    setSelectedPlayerIds(ids);
    if (ids.size > 0) {
      toast.success(`Pre-filled ${ids.size} player${ids.size === 1 ? "" : "s"} from ${leagueIds.size} league${leagueIds.size === 1 ? "" : "s"}${inviteIncludeReserves ? " (incl. reserves)" : ""}`);
    } else {
      toast.info("No registered players found in the selected leagues");
    }
  };

  const toggleSourceLeague = (leagueId: string) => {
    const next = new Set(sourceLeagueIds);
    if (next.has(leagueId)) next.delete(leagueId); else next.add(leagueId);
    applyLeaguePrefill(next);
  };

  const hasLeagueSelection = sourceLeagueIds.size > 0;

  // Fetch registered visitors
  const { data: allVisitors = [] } = useQuery({
    queryKey: ["club-visitors-tournament", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitors")
        .select("id, first_name, last_name, home_club_name, category, member_number")
        .eq("club_id", clubId)
        .order("first_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; first_name: string; last_name: string; home_club_name: string; category: string; member_number: string | null }>;
    },
    enabled: !!clubId,
  });

  // Unique visitor clubs for filter
  const visitorClubs = useMemo(() => {
    return [...new Set(allVisitors.map((v) => v.home_club_name))].sort();
  }, [allVisitors]);

  // Filter visitors by gender and selected clubs
  const filteredVisitors = useMemo(() => {
    if (!includeVisitors) return [];
    let list = allVisitors;
    if (selectedVisitorClubs.size > 0) {
      list = list.filter((v) => selectedVisitorClubs.has(v.home_club_name));
    }
    if (gender !== "mixed" && gender !== "open") {
      const genderValue = gender === "men" ? "Men" : "Ladies";
      list = list.filter((v) => v.category === genderValue);
    }
    return list;
  }, [allVisitors, includeVisitors, selectedVisitorClubs, gender]);

  const isDoubles = matchType === "doubles";
  const effectiveRegistrationMode = ((registrationMode || "open")) as "open" | "invite";
  const registrationUsesInviteList = effectiveRegistrationMode === "invite";
  const selfPairInviteSelection = isDoubles && partnerMode === "players" && registrationUsesInviteList;
  // Defer pair formation until registrations are in:
  //  - players self-pair mode: always wait for confirmed pairs
  //  - admin-pair mode on NEW tournaments: save the shell first, form pairs later by editing
  const awaitingPlayerPairs =
    isDoubles &&
    doublesPairs.length === 0 &&
    (partnerMode === "players" || (partnerMode === "admin" && !editingChampId));
  const activeSteps = useMemo<WizardStep[]>(() => {
    if (!awaitingPlayerPairs) return STEPS;
    return selfPairInviteSelection
      ? ["category", "courts", "registration", "players", "review"]
      : ["category", "courts", "registration", "review"];
  }, [awaitingPlayerPairs, selfPairInviteSelection]);
  const stepIdx = activeSteps.indexOf(step);

  useEffect(() => {
    if (activeSteps.includes(step)) return;
    const currentOrder = STEPS.indexOf(step);
    const nextStep = activeSteps.find((s) => STEPS.indexOf(s) >= currentOrder) || activeSteps[activeSteps.length - 1];
    setStep(nextStep);
  }, [activeSteps, step]);

  // Filter members by gender
  const genderMembers = useMemo(() => {
    if (gender === "mixed" || gender === "open") {
      return members.sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
    }
    return members
      .filter((m) => memberMatchesTournamentGender(m.gender, gender))
      .sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
  }, [members, gender]);

  const menMembers = useMemo(() => {
    return members
      .filter((m) => m.gender && ["men", "male", "m"].includes(m.gender.toLowerCase()))
      .sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
  }, [members]);

  const ladiesMembers = useMemo(() => {
    return members
      .filter((m) => m.gender && ["ladies", "female", "f", "women"].includes(m.gender.toLowerCase()))
      .sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
  }, [members]);

  // Autosave the current wizard settings to club_champs as a draft.
  // Only touches the settings row — never matches/entries/registrations.
  // No-ops until we have the minimum required fields (name + dates).
  const saveDraft = async () => {
    if (!clubId) return editingChampId;
    if (!startDate || !endDate) return editingChampId;
    const defaultName = `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Tournament ${new Date().getFullYear()}`;
    const payload: Record<string, any> = {
      name: champName || defaultName,
      gender,
      match_type: matchType,
      num_groups: numGroups,
      enable_playoffs: enablePlayoffs,
      start_date: startDate,
      end_date: endDate,
      play_days: Array.from(playDays),
      start_time: startTime,
      end_time: endTime,
      match_duration_minutes: matchDuration,
      scoring_mode: scoringMode,
      points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
      best_of: bestOf > 0 ? bestOf : null,
      group_durations: groupDurations,
      group_break_minutes: groupBreakMinutes,
      group_labels: groupLabels,
      default_break_minutes: defaultBreakMinutes,
      court_rotation_minutes: courtRotationMinutes,
      round_format: roundFormat,
      bye_handling: byeHandling,
      source_league_id: Array.from(sourceLeagueIds)[0] || null,
      source_league_ids: Array.from(sourceLeagueIds),
      registration_mode: effectiveRegistrationMode,
      partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
      registration_opens_at: registrationRequired && registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
      registration_closes_at: registrationRequired && registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
      entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
      payment_methods: Array.from(paymentMethods),
      payment_required: paymentRequired,
      registration_required: registrationRequired,
      invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
      invite_source: inviteSource,
      invite_include_reserves: inviteIncludeReserves,
      invite_excluded_member_ids: Array.from(inviteExcludedMemberIds),
      handicap_mode: matchType === "singles" ? handicapMode : "none",
      handicap_divider: matchType === "singles" ? Math.max(1, Number(handicapDivider) || 1) : 1,
      handicap_multiplier: matchType === "singles" ? Math.max(1, Number(handicapMultiplier) || 1) : 1,
      no_show_opponent_points: Math.max(0, Math.round(Number(noShowOpponentPoints)) || 0),
      no_show_player_points: Math.round(Number(noShowPlayerPoints)) || 0,
      include_visitors: includeVisitors,
      visitor_clubs: Array.from(selectedVisitorClubs),
      description: description.trim() || null,
      affects_ranking_points: affectsRankingPoints,
      day_schedules: customizeDailySchedule ? daySchedules : [],
      court_ids: Array.from(selectedCourtIds),
    };
    try {
      if (editingChampId) {
        const { error } = await fromExt("club_champs").update(payload).eq("id", editingChampId);
        if (error) throw error;
      } else {
        const { data, error } = await fromExt("club_champs")
          .insert({ club_id: clubId, status: "planning", ...payload })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setEditingChampId(data.id);
        qc.invalidateQueries({ queryKey: ["club-champs"] });
        return data?.id || editingChampId;
      }
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      return editingChampId;
    } catch (e: any) {
      console.warn("Tournament autosave failed:", e);
      toast.error(`Save failed: ${e?.message || "unknown error"}`);
      return editingChampId;
    }
  };


  // Persist current player / pair selections + group assignments as a draft
  // to club_champs_entries. Safe because entries get wiped & rewritten when
  // matches are (re)generated. Requires the parent champ row to exist.
  const saveEntriesDraft = async (champIdOverride?: string) => {
    const champIdToUse = champIdOverride || editingChampId;
    if (!champIdToUse) return;
    try {
      // Self-pair invite mode (doubles where players self-pair): we only
      // collect the invitee list at this step — there are no pairs yet, so
      // persist the selection directly to club_champs_registrations.
      if (selfPairInviteSelection) {
        const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
        const ids = Array.from(selectedPlayerIds).filter((id) => !id.startsWith("visitor-"));
        const regRows = ids.map((memberId) => ({
          champ_id: champIdToUse,
          club_member_id: memberId,
          status: fee > 0 && paymentRequired ? "pending_payment" : "invited",
          invited_by_admin: true,
          fee_paid_cents: 0,
        }));
        if (regRows.length > 0) {
          const { error: upsertErr } = await fromExt("club_champs_registrations")
            .upsert(regRows, { onConflict: "champ_id,club_member_id" } as any);
          if (upsertErr) throw upsertErr;
        }
        // Remove any previously-invited members no longer in the selection
        // (only drop rows that haven't been confirmed/paid yet, so we never
        // wipe a member who's already registered through payment).
        const delQ = fromExt("club_champs_registrations")
          .delete()
          .eq("champ_id", champIdToUse)
          .in("status", ["invited", "pending_payment", "pending_eft"]);
        if (ids.length > 0) {
          await delQ.not("club_member_id", "in", `(${ids.join(",")})`);
        } else {
          await delQ;
        }
        return;
      }
      let allocatedMemberIds: string[] = [];
      if (isDoubles) {
        if (doublesPairs.length === 0) return;
        const rows = (groups as DoublePair[][]).flatMap((groupPairs, gi) =>
          groupPairs.map((pair, orderIndex) => ({
            champ_id: champIdToUse,
            club_member_id: toDbId(pair.player1Id),
            partner_member_id: toDbId(pair.player2Id),
            group_number: gi + 1,
            order_index: orderIndex,
          }))
        );
        const { error: deleteErr } = await fromExt("club_champs_entries").delete().eq("champ_id", champIdToUse);
        if (deleteErr) throw deleteErr;
        const { error: insertErr } = await fromExt("club_champs_entries").insert(rows);
        if (insertErr) throw insertErr;
        allocatedMemberIds = rows.flatMap((r: any) => [r.club_member_id, r.partner_member_id]).filter(Boolean);
      } else {
        if (selectedPlayerIds.size === 0) return;
        const rows = (groups as ClubMember[][]).flatMap((groupPlayers, gi) =>
          groupPlayers
          .filter((p) => !p.id.startsWith("visitor-"))
          .map((p, orderIndex) => ({
            champ_id: champIdToUse,
            club_member_id: toDbId(p.id),
            group_number: gi + 1,
            order_index: orderIndex,
          }))
        );
        if (rows.length === 0) return;
        const { error: deleteErr } = await fromExt("club_champs_entries").delete().eq("champ_id", champIdToUse);
        if (deleteErr) throw deleteErr;
        const { error: insertErr } = await fromExt("club_champs_entries").insert(rows);
        if (insertErr) throw insertErr;
        allocatedMemberIds = rows.map((r: any) => r.club_member_id).filter(Boolean);
      }

      // Auto-register every allocated player. Once admin places a member into a
      // pair / group they are considered confirmed for the tournament — no
      // separate payment / registration step is required.
      const uniqueIds = Array.from(new Set(allocatedMemberIds));
      if (uniqueIds.length > 0) {
        const regRows = uniqueIds.map((memberId) => ({
          champ_id: champIdToUse,
          club_member_id: memberId,
          status: "paid",
          invited_by_admin: true,
          fee_paid_cents: 0,
        }));
        await fromExt("club_champs_registrations").upsert(regRows, {
          onConflict: "champ_id,club_member_id",
        } as any);
        // Force-promote any existing pending rows to paid (upsert may not
        // overwrite status on conflict in all environments).
        await fromExt("club_champs_registrations")
          .update({ status: "paid" })
          .eq("champ_id", champIdToUse)
          .in("club_member_id", uniqueIds)
          .in("status", ["pending_payment", "pending_eft", "invited"]);
      }
    } catch (e) {
      console.warn("Tournament entries draft save failed:", e);
      throw e;
    }
  };

  const handleManualSave = async () => {
    if (!clubId) {
      toast.error("No club selected");
      return;
    }
    // Dates live on step 2 — if they aren't picked yet, the wizard state is
    // already kept in-component, so just acknowledge and let the user move on.
    if (!startDate || !endDate) {
      toast.success("Progress kept — pick dates on the next step to save to the server");
      return;
    }
    try {
      const savedChampId = await saveDraft();
      await saveEntriesDraft(savedChampId || undefined);
      toast.success("Progress saved");
    } catch {
      toast.error("Could not save progress");
    }
  };


  const goToStep = (s: WizardStep) => {
    // Note: we intentionally do NOT auto-select all players when entering the
    // players step. Admin picks individually (or via Select All / league
    // pre-fill). Auto-selecting everyone made it too easy to ship a tournament
    // with the wrong roster.
    if (s === "groups") {
      if (isDoubles) {
        if (pairGroupAssignments.size > 0) { setStep(s); void saveDraft(); return; }
        // Auto-seed pair group assignments via snake draft
        const newMap = new Map<string, number>();
        doublesPairs.forEach((p, i) => {
          const cycle = Math.floor(i / numGroups);
          const idx = cycle % 2 === 0 ? i % numGroups : numGroups - 1 - (i % numGroups);
          newMap.set(p.id, idx);
        });
        setPairGroupAssignments(newMap);
      } else {
        if (groupAssignments.size > 0) { setStep(s); void saveDraft(); return; }
        const newMap = new Map<string, number>();
        selectedPlayers.forEach((p, i) => {
          const cycle = Math.floor(i / numGroups);
          const idx = cycle % 2 === 0 ? i % numGroups : numGroups - 1 - (i % numGroups);
          newMap.set(p.id, idx);
        });
        setGroupAssignments(newMap);
      }
    }
    setStep(s);
    // Persist current settings whenever the user advances or jumps steps.
    void saveDraft();
  };

  // Debounced autosave: persist wizard settings as the admin edits any field.
  const saveDraftRef = useRef(saveDraft);
  const saveEntriesDraftRef = useRef(saveEntriesDraft);
  useEffect(() => { saveDraftRef.current = saveDraft; });
  useEffect(() => { saveEntriesDraftRef.current = saveEntriesDraft; });
  useEffect(() => {
    if (!showWizard) return;
    if (!clubId || !startDate || !endDate) return;
    const t = setTimeout(() => {
      void (async () => {
        await saveDraftRef.current();
        // NOTE: do NOT autosave entries here. saveEntriesDraft does a
        // delete-then-insert on club_champs_entries; if it fires while pairs
        // are still loading (or partially loaded), it can wipe the real
        // pair list. Entries persist only on manual Save or Generate.
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [
    showWizard, clubId, champName, gender, matchType, numGroups, enablePlayoffs,
    startDate, endDate, playDays, startTime, endTime, matchDuration, scoringMode, pointsPerGame, bestOf,
    groupDurations, courtRotationMinutes, roundFormat, byeHandling, sourceLeagueIds, registrationMode,
    partnerMode, registrationOpensAt, registrationClosesAt, entryFeeRand,
    paymentMethods, paymentRequired, registrationRequired, inviteMethods, includeVisitors,
    selectedVisitorClubs, description,
    customizeDailySchedule, daySchedules, selectedCourtIds,
    // Selection / pair / group assignment state — persist immediately when changed
    selectedPlayerIds, doublesPairs, groupAssignments, pairGroupAssignments,
  ]);






  // Helper to strip "visitor-" prefix for DB inserts
  const toDbId = (id: string) => id.replace(/^visitor-/, "");

  // Build visitor entries as pseudo-members for the player list
  const visitorAsMembers = useMemo(() => {
    return filteredVisitors.map((v) => ({
      id: `visitor-${v.id}`,
      name: `${v.first_name} ${v.last_name}`,
      gender: v.category === "Ladies" ? "Ladies" : "Men",
      ladder_position: null as number | null,
      profiles: null,
      _isVisitor: true,
      _homeClub: v.home_club_name,
    }));
  }, [filteredVisitors]);

  // Combined list of members + visitors for admin player selection.
  // Admins can shortlist any club member (gender filter is only used for self-registration
  // eligibility and league-pre-fill — not for the manual invite list).
  const allSelectablePlayers = useMemo(() => {
    const sortedMembers = [...members].sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
    return [...sortedMembers, ...visitorAsMembers] as any[];
  }, [members, visitorAsMembers]);

  const selectedPlayers = useMemo(
    () => allSelectablePlayers.filter((m: any) => selectedPlayerIds.has(m.id)),
    [allSelectablePlayers, selectedPlayerIds]
  );

  // Number of "entities" (players for singles, pairs for doubles)
  const entityCount = isDoubles ? doublesPairs.length : selectedPlayerIds.size;

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handlePlayerDragEnd = (groupIndex: number) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const groupIds = (groups as ClubMember[][])[groupIndex].map((p) => p.id);
    const oldIdx = groupIds.indexOf(String(active.id));
    const newIdx = groupIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reorderedGroupIds = arrayMove(groupIds, oldIdx, newIdx);
    // Rebuild full order: keep existing order for everyone else, swap in this group's new order
    const current = playerOrder.length > 0 ? playerOrder : selectedPlayers.map((p) => p.id);
    const groupSet = new Set(groupIds);
    const next: string[] = [];
    let gi = 0;
    for (const id of current) {
      if (groupSet.has(id)) {
        next.push(reorderedGroupIds[gi++]);
      } else {
        next.push(id);
      }
    }
    // Add any IDs not in current (new selections)
    for (const p of selectedPlayers) if (!next.includes(p.id)) next.push(p.id);
    setPlayerOrder(next);
  };

  const handlePairDragEnd = (groupIndex: number) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const groupIds = (groups as DoublePair[][])[groupIndex].map((p) => p.id);
    const oldIdx = groupIds.indexOf(String(active.id));
    const newIdx = groupIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reorderedGroupIds = arrayMove(groupIds, oldIdx, newIdx);
    const current = pairOrder.length > 0 ? pairOrder : doublesPairs.map((p) => p.id);
    const groupSet = new Set(groupIds);
    const next: string[] = [];
    let gi = 0;
    for (const id of current) {
      if (groupSet.has(id)) next.push(reorderedGroupIds[gi++]);
      else next.push(id);
    }
    for (const p of doublesPairs) if (!next.includes(p.id)) next.push(p.id);
    setPairOrder(next);
  };

  // Unified drag handler spanning ALL leagues — supports reordering within a
  // league AND dragging a row across leagues (drop onto a league container or
  // a row in another league).
  const handleCrossLeagueDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (isDoubles) {
      const sourceGi = pairGroupAssignments.get(activeId) ?? 0;
      // Dropped on a league container
      if (overId.startsWith("league-")) {
        const targetGi = Number(overId.slice("league-".length));
        if (targetGi === sourceGi) return;
        const next = new Map(pairGroupAssignments);
        next.set(activeId, targetGi);
        setPairGroupAssignments(next);
        return;
      }
      const targetGi = pairGroupAssignments.get(overId) ?? 0;
      if (targetGi === sourceGi) {
        handlePairDragEnd(sourceGi)(e);
      } else {
        const next = new Map(pairGroupAssignments);
        next.set(activeId, targetGi);
        setPairGroupAssignments(next);
      }
      return;
    }

    const sourceGi = groupAssignments.get(activeId) ?? 0;
    if (overId.startsWith("league-")) {
      const targetGi = Number(overId.slice("league-".length));
      if (targetGi === sourceGi) return;
      const next = new Map(groupAssignments);
      next.set(activeId, targetGi);
      setGroupAssignments(next);
      return;
    }
    const targetGi = groupAssignments.get(overId) ?? 0;
    if (targetGi === sourceGi) {
      handlePlayerDragEnd(sourceGi)(e);
    } else {
      const next = new Map(groupAssignments);
      next.set(activeId, targetGi);
      setGroupAssignments(next);
    }
  };



  // Build groups
  const groups = useMemo(() => {
    if (isDoubles) {
      const g: DoublePair[][] = Array.from({ length: numGroups }, () => []);
      const orderIdx = new Map(pairOrder.map((id, i) => [id, i]));
      const sorted = [...doublesPairs].sort(
        (a, b) => (orderIdx.get(a.id) ?? 1e9) - (orderIdx.get(b.id) ?? 1e9)
      );
      sorted.forEach((p) => {
        const gi = pairGroupAssignments.get(p.id) ?? 0;
        if (gi < numGroups) g[gi].push(p);
      });
      return g;
    }
    const g: ClubMember[][] = Array.from({ length: numGroups }, () => []);
    const orderIdx = new Map(playerOrder.map((id, i) => [id, i]));
    const sorted = [...selectedPlayers].sort(
      (a, b) => (orderIdx.get(a.id) ?? 1e9) - (orderIdx.get(b.id) ?? 1e9)
    );
    sorted.forEach((p) => {
      const gi = groupAssignments.get(p.id) ?? 0;
      if (gi < numGroups) g[gi].push(p);
    });
    return g;
  }, [isDoubles, selectedPlayers, doublesPairs, numGroups, groupAssignments, pairGroupAssignments, playerOrder, pairOrder]);

  // Schedule preview
  const schedulePreview = useMemo(() => {
    if (!startDate || !endDate || playDays.size === 0 || selectedCourtIds.size === 0) return null;

    const courtIds = Array.from(selectedCourtIds);

    // Build "sessions" — concrete (date, start, end, courts) blocks the scheduler can fill.
    // When the admin has set per-day overrides, use those; otherwise derive one session per
    // play-day from the global Start/End times and all selected courts.
    type Session = { date: string; startMin: number; endMin: number; courtIds: number[] };
    const parseHM = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    let sessions: Session[] = [];
    if (customizeDailySchedule && daySchedules.length > 0) {
      sessions = daySchedules
        .map((d) => {
          const cs = (d.court_ids && d.court_ids.length > 0
            ? d.court_ids.filter((id) => selectedCourtIds.has(id))
            : courtIds);
          return {
            date: d.date,
            startMin: parseHM(d.start_time),
            endMin: parseHM(d.end_time),
            courtIds: cs,
          };
        })
        .filter((s) => s.endMin > s.startMin && s.courtIds.length > 0)
        .sort((a, b) => (a.date.localeCompare(b.date) || a.startMin - b.startMin));
    } else {
      const allDatesGlobal = eachDayOfInterval({
        start: new Date(startDate),
        end: new Date(endDate),
      }).filter((d) => playDays.has(getDay(d)));
      const gStart = parseHM(startTime);
      const gEnd = parseHM(endTime);
      sessions = allDatesGlobal.map((d) => ({
        date: format(d, "yyyy-MM-dd"),
        startMin: gStart,
        endMin: gEnd,
        courtIds,
      }));
    }
    if (matchDuration <= 0) return null;
    if (sessions.length === 0) return null;

    // Distinct dates (for the summary card)
    const allDates = Array.from(new Set(sessions.map((s) => s.date))).map((d) => parseISO(d));

    type MatchDef = {
      groupNum: number; roundNum: number;
      entityA: string; entityB: string; // player ID or pair ID
      leg: "home" | "away" | null;
      isBye?: boolean;
      byeEntityId?: string;
      date?: string; time?: string; courtId?: number;
    };

    // Build the universal slot list from sessions (used by non-Bells scheduling).
    type Slot = { date: string; time: string; courtId: number };
    const allSlots: Slot[] = [];
    for (const s of sessions) {
      const n = Math.floor((s.endMin - s.startMin) / matchDuration);
      for (let i = 0; i < n; i++) {
        const mins = s.startMin + i * matchDuration;
        const h = Math.floor(mins / 60);
        const mm = mins % 60;
        const ts = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        for (const cid of s.courtIds) {
          allSlots.push({ date: s.date, time: ts, courtId: cid });
        }
      }
    }
    const totalSlots = allSlots.length;
    const timeSlots = Array.from(new Set(allSlots.map((s) => s.time))).sort();

    // Build round-robin matches
    const allMatches: MatchDef[] = [];
    const isCrossLeague = roundFormat === "cross_league";
    const fmt = roundFormat === "double_round_robin" ? "double" : "single";
    const ingestRounds = (gi: number, ids: string[]) => {
      const { rounds, byesPerRound } = generateRoundRobinRounds(ids, fmt);
      rounds.forEach((roundMatches, ri) => {
        roundMatches.forEach(([a, b, leg]) => {
          allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, entityA: a, entityB: b, leg });
        });
        const byeId = byesPerRound[ri];
        if (byeId && byeHandling !== "no_match") {
          allMatches.push({
            groupNum: gi + 1, roundNum: ri + 1,
            entityA: byeId, entityB: byeId, leg: null,
            isBye: true, byeEntityId: byeId,
          });
        }
      });
    };

    // Cross-league mode: every entity in league i plays every entity in league j
    // (no intra-league matches). Each cross match is filed under the lower league's
    // group_number for scheduling; standings include all matches the player took part in.
    const ingestCrossLeague = (allGroups: string[][]) => {
      let roundCounter = 1;
      for (let i = 0; i < allGroups.length; i++) {
        for (let j = i + 1; j < allGroups.length; j++) {
          const a = allGroups[i];
          const b = allGroups[j];
          for (const pa of a) {
            for (const pb of b) {
              allMatches.push({
                groupNum: i + 1,
                roundNum: roundCounter++,
                entityA: pa,
                entityB: pb,
                leg: "home",
              });
              if (fmt === "double") {
                allMatches.push({
                  groupNum: i + 1,
                  roundNum: roundCounter++,
                  entityA: pb,
                  entityB: pa,
                  leg: "away",
                });
              }
            }
          }
        }
      }
    };

    if (isCrossLeague) {
      const groupIds: string[][] = isDoubles
        ? (groups as DoublePair[][]).map((g) => g.map((p) => p.id))
        : (groups as ClubMember[][]).map((g) => g.map((p) => p.id));
      ingestCrossLeague(groupIds);
    } else if (isDoubles) {
      (groups as DoublePair[][]).forEach((groupPairs, gi) => {
        ingestRounds(gi, groupPairs.map((p) => p.id));
      });
    } else {
      (groups as ClubMember[][]).forEach((groupPlayers, gi) => {
        ingestRounds(gi, groupPlayers.map((p) => p.id));
      });
    }

    // Scheduling with 2-day gap per entity
    const entityLastDate = new Map<string, string>();
    const canScheduleOn = (entityId: string, dateStr: string): boolean => {
      const last = entityLastDate.get(entityId);
      if (!last) return true;
      const diffDays = Math.round((new Date(dateStr).getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 2;
    };
    const getPlayersForEntity = (entityId: string): string[] => {
      if (!isDoubles) return [entityId];
      const pair = doublesPairs.find((p) => p.id === entityId);
      return pair ? [pair.player1Id, pair.player2Id] : [entityId];
    };

    const isBellsMode = scoringMode === "time_capped_points";

    if (isBellsMode) {
      // Bells: per-league time caps; auto-distribute courts across leagues, then
      // walk each league's matches through the available sessions, rotating courts.
      const capFor = (gn: number) =>
        Number(groupDurations[String(gn)]) || matchDuration;

      const byLeague = new Map<number, MatchDef[]>();
      for (const m of allMatches) {
        if (m.isBye) continue;
        if (!byLeague.has(m.groupNum)) byLeague.set(m.groupNum, []);
        byLeague.get(m.groupNum)!.push(m);
      }
      const leagues = Array.from(byLeague.keys()).sort((a, b) => a - b);

      if (leagues.length > 0 && courtIds.length > 0) {
        const rotateMin = Number(courtRotationMinutes) > 0 ? Number(courtRotationMinutes) : 0;

        // ─── Rotation mode ──────────────────────────────────────────────────
        // Within each league, consecutive matches cycle across ALL selected
        // courts (court shifts every `rotateMin` minutes of elapsed play).
        // Across leagues, a global slot map prevents two matches from landing
        // on the same court at the same time — when a slot is taken the league
        // tries the next court, then the next time step.
        if (rotateMin > 0) {
          const usedSlots = new Set<string>(); // `${date}|${startMin}|${courtId}`
          const usedPlayers = new Set<string>(); // `${date}|${startMin}|${playerId}`
          // Global last-played end time per player (absolute minutes since epoch-day),
          // used to space matches so the same player gets a break between games.
          const lastPlayedEnd = new Map<string, number>();
          const playCount = new Map<string, number>();
          const absMin = (date: string, min: number) => {
            // turn `${date}|${min}` into a monotonically increasing number across days
            const d = new Date(date + "T00:00:00Z").getTime() / 60000;
            return d + min;
          };
          for (const gn of leagues) {
            const cap = capFor(gn);
            const lMatches = byLeague.get(gn)!;
            const remaining = [...lMatches];
            let leagueElapsed = 0;
            outer: for (const s of sessions) {
              const sessionCourts = courtIds.filter((c) => s.courtIds.includes(c));
              if (sessionCourts.length === 0) continue;
              let t = s.startMin;
              while (remaining.length > 0 && t + cap <= s.endMin) {
                const baseIdx = Math.floor(leagueElapsed / rotateMin);
                const nowAbs = absMin(s.date, t);
                // Score every conflict-free candidate by the LEAST-rested player:
                // pick the match whose busiest player has rested the longest
                // (and as tiebreak, fewest games played so far).
                let pickIdx = -1;
                let bestScore: [number, number] | null = null;
                for (let i = 0; i < remaining.length; i++) {
                  const m = remaining[i];
                  const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
                  if (!players.every((pid) => !usedPlayers.has(`${s.date}|${t}|${pid}`))) continue;
                  let minRest = Infinity;
                  let maxPlays = 0;
                  for (const pid of players) {
                    const last = lastPlayedEnd.get(pid);
                    const rest = last == null ? Number.MAX_SAFE_INTEGER : nowAbs - last;
                    if (rest < minRest) minRest = rest;
                    const pc = playCount.get(pid) || 0;
                    if (pc > maxPlays) maxPlays = pc;
                  }
                  const score: [number, number] = [minRest, -maxPlays];
                  if (!bestScore || score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
                    bestScore = score;
                    pickIdx = i;
                  }
                }
                if (pickIdx === -1) {
                  t += cap;
                  continue;
                }
                let assigned = false;
                for (let off = 0; off < sessionCourts.length; off++) {
                  const cid = sessionCourts[(baseIdx + off) % sessionCourts.length];
                  const key = `${s.date}|${t}|${cid}`;
                  if (usedSlots.has(key)) continue;
                  const [m] = remaining.splice(pickIdx, 1);
                  const h = Math.floor(t / 60);
                  const mm = t % 60;
                  m.date = s.date;
                  m.time = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                  m.courtId = cid;
                  usedSlots.add(key);
                  const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
                  players.forEach((pid) => {
                    usedPlayers.add(`${s.date}|${t}|${pid}`);
                    lastPlayedEnd.set(pid, nowAbs + cap);
                    playCount.set(pid, (playCount.get(pid) || 0) + 1);
                  });
                  assigned = true;
                  break;
                }
                if (assigned) leagueElapsed += cap;
                t += cap;
                if (remaining.length === 0) break outer;
              }
            }
          }
        } else {
          const caps = leagues.map(capFor);
          // ─── Static allocation (no rotation, or mixed caps) ───────────────
          const weights = leagues.map((gn) => byLeague.get(gn)!.length * capFor(gn));
          const totalW = weights.reduce((a, b) => a + b, 0) || 1;
          let allocs = leagues.map((_, i) =>
            Math.max(1, Math.floor((weights[i] / totalW) * courtIds.length))
          );
          let sum = allocs.reduce((a, b) => a + b, 0);
          while (sum > courtIds.length) {
            let idx = 0;
            for (let i = 1; i < allocs.length; i++) if (allocs[i] > allocs[idx]) idx = i;
            if (allocs[idx] <= 1) break;
            allocs[idx]--; sum--;
          }
          while (sum < courtIds.length) {
            let best = 0; let bestVal = -Infinity;
            for (let i = 0; i < leagues.length; i++) {
              const v = weights[i] / allocs[i];
              if (v > bestVal) { bestVal = v; best = i; }
            }
            allocs[best]++; sum++;
          }
          let cursor = 0;
          const leagueCourts = new Map<number, number[]>();
          leagues.forEach((gn, i) => {
            if (cursor >= courtIds.length) {
              leagueCourts.set(gn, [courtIds[i % courtIds.length]]);
            } else {
              leagueCourts.set(gn, courtIds.slice(cursor, cursor + allocs[i]));
              cursor += allocs[i];
            }
          });

          const usedPlayers = new Set<string>(); // `${date}|${t}|${playerId}`
          const lastPlayedEnd = new Map<string, number>();
          const playCount = new Map<string, number>();
          const absMin = (date: string, min: number) => {
            const d = new Date(date + "T00:00:00Z").getTime() / 60000;
            return d + min;
          };
          for (const gn of leagues) {
            const cap = capFor(gn);
            const lCourts = leagueCourts.get(gn)!;
            const remaining = [...byLeague.get(gn)!];
            for (const s of sessions) {
              if (remaining.length === 0) break;
              const sessionLCourts = lCourts.filter((c) => s.courtIds.includes(c));
              if (sessionLCourts.length === 0) continue;
              const roundsPossible = Math.max(0, Math.floor((s.endMin - s.startMin) / cap));
              for (let r = 0; r < roundsPossible && remaining.length > 0; r++) {
                const t = s.startMin + r * cap;
                const nowAbs = absMin(s.date, t);
                for (let ci = 0; ci < sessionLCourts.length && remaining.length > 0; ci++) {
                  // Pick best-rested conflict-free match
                  let pickIdx = -1;
                  let bestScore: [number, number] | null = null;
                  for (let i = 0; i < remaining.length; i++) {
                    const m = remaining[i];
                    const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
                    if (!players.every((pid) => !usedPlayers.has(`${s.date}|${t}|${pid}`))) continue;
                    let minRest = Infinity;
                    let maxPlays = 0;
                    for (const pid of players) {
                      const last = lastPlayedEnd.get(pid);
                      const rest = last == null ? Number.MAX_SAFE_INTEGER : nowAbs - last;
                      if (rest < minRest) minRest = rest;
                      const pc = playCount.get(pid) || 0;
                      if (pc > maxPlays) maxPlays = pc;
                    }
                    const score: [number, number] = [minRest, -maxPlays];
                    if (!bestScore || score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
                      bestScore = score;
                      pickIdx = i;
                    }
                  }
                  if (pickIdx === -1) break;
                  const [m] = remaining.splice(pickIdx, 1);
                  const h = Math.floor(t / 60);
                  const mm = t % 60;
                  m.date = s.date;
                  m.time = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                  m.courtId = sessionLCourts[ci];
                  const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
                  players.forEach((pid) => {
                    usedPlayers.add(`${s.date}|${t}|${pid}`);
                    lastPlayedEnd.set(pid, nowAbs + cap);
                    playCount.set(pid, (playCount.get(pid) || 0) + 1);
                  });
                }
              }
            }
          }
        }
      }
    } else {
      const usedSlots = new Set<number>();
      for (const match of allMatches) {
        if (match.isBye) continue;
        const playersA = getPlayersForEntity(match.entityA);
        const playersB = getPlayersForEntity(match.entityB);
        const allPlayers = [...playersA, ...playersB];

        for (let si = 0; si < allSlots.length; si++) {
          if (usedSlots.has(si)) continue;
          const slot = allSlots[si];
          if (allPlayers.every((pid) => canScheduleOn(pid, slot.date))) {
            match.date = slot.date;
            match.time = slot.time;
            match.courtId = slot.courtId;
            usedSlots.add(si);
            allPlayers.forEach((pid) => entityLastDate.set(pid, slot.date));
            break;
          }
        }
      }
    }

    const playableMatches = allMatches.filter((m) => !m.isBye);
    // Bells mode schedules every match by construction — treat slots as sufficient.
    const effectiveTotalSlots = isBellsMode ? playableMatches.length : totalSlots;
    return {
      allMatches,
      totalSlots: effectiveTotalSlots,
      totalMatches: playableMatches.length,
      allDates,
      timeSlots,
    };
  }, [groups, isDoubles, doublesPairs, startDate, endDate, playDays, selectedCourtIds, startTime, endTime, matchDuration, roundFormat, byeHandling, scoringMode, groupDurations, courtRotationMinutes, customizeDailySchedule, daySchedules]);

  // Create/update champ
  const createChamp = useMutation({
    mutationFn: async () => {
      const draftChampId = await saveDraft();
      if (!schedulePreview && !awaitingPlayerPairs) throw new Error("No schedule generated");

      let champId: string;
      const existingChampId = draftChampId || editingChampId;
      const defaultName = `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Tournament ${new Date().getFullYear()}`;

      if (existingChampId) {
        // SAFETY GUARD: never let Regenerate shrink the saved pair/player list.
        // If the wizard is loaded with fewer entrants than what's already saved
        // (e.g. registrations hadn't finished loading), abort instead of wiping.
        const { data: existingEntries } = await fromExt("club_champs_entries")
          .select("id")
          .eq("champ_id", existingChampId);
        const savedCount = existingEntries?.length || 0;
        const currentCount = isDoubles
          ? doublesPairs.length
          : (groups as ClubMember[][]).flatMap((g) => g).length;
        if (savedCount > 0 && currentCount < savedCount) {
          throw new Error(
            `Refusing to regenerate: only ${currentCount} ${isDoubles ? "pair" : "player"}(s) loaded but ${savedCount} are saved. Close the wizard, reopen the tournament, and try again so all entries load first.`
          );
        }

        const { error: updateErr } = await fromExt("club_champs")
          .update({
            name: champName || defaultName,
            gender,
            match_type: matchType,
            num_groups: numGroups,
            enable_playoffs: enablePlayoffs,
            start_date: startDate,
            end_date: endDate,
            play_days: Array.from(playDays),
            start_time: startTime,
            end_time: endTime,
            match_duration_minutes: matchDuration,
            scoring_mode: scoringMode,
            points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
            best_of: bestOf > 0 ? bestOf : null,
            group_durations: groupDurations,
            group_break_minutes: groupBreakMinutes,
            group_labels: groupLabels,
            default_break_minutes: defaultBreakMinutes,
            court_rotation_minutes: courtRotationMinutes,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: effectiveRegistrationMode,
            partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
            registration_opens_at: registrationRequired && registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
            registration_closes_at: registrationRequired && registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            registration_required: registrationRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
            invite_source: inviteSource,
            invite_include_reserves: inviteIncludeReserves,
            invite_excluded_member_ids: Array.from(inviteExcludedMemberIds),
            handicap_mode: matchType === "singles" ? handicapMode : "none",
            handicap_divider: matchType === "singles" ? Math.max(1, Number(handicapDivider) || 1) : 1,
            handicap_multiplier: matchType === "singles" ? Math.max(1, Number(handicapMultiplier) || 1) : 1,
            no_show_opponent_points: Math.max(0, Math.round(Number(noShowOpponentPoints)) || 0),
            no_show_player_points: Math.round(Number(noShowPlayerPoints)) || 0,
            include_visitors: includeVisitors,
            visitor_clubs: Array.from(selectedVisitorClubs),
            description: description.trim() || null,
          })
          .eq("id", existingChampId);
        if (updateErr) throw updateErr;
        champId = existingChampId;
        if (!editingChampId) setEditingChampId(existingChampId);
      } else {
        const { data: champ, error: champErr } = await fromExt("club_champs")
          .insert({
            club_id: clubId,
            name: champName || defaultName,
            gender,
            match_type: matchType,
            num_groups: numGroups,
            enable_playoffs: enablePlayoffs,
            start_date: startDate,
            end_date: endDate,
            play_days: Array.from(playDays),
            start_time: startTime,
            end_time: endTime,
            match_duration_minutes: matchDuration,
            scoring_mode: scoringMode,
            points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
            best_of: bestOf > 0 ? bestOf : null,
            group_durations: groupDurations,
            group_break_minutes: groupBreakMinutes,
            group_labels: groupLabels,
            default_break_minutes: defaultBreakMinutes,
            court_rotation_minutes: courtRotationMinutes,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: effectiveRegistrationMode,
            partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
            registration_opens_at: registrationRequired && registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
            registration_closes_at: registrationRequired && registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            registration_required: registrationRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
            invite_source: inviteSource,
            invite_include_reserves: inviteIncludeReserves,
            invite_excluded_member_ids: Array.from(inviteExcludedMemberIds),
            handicap_mode: matchType === "singles" ? handicapMode : "none",
            handicap_divider: matchType === "singles" ? Math.max(1, Number(handicapDivider) || 1) : 1,
            handicap_multiplier: matchType === "singles" ? Math.max(1, Number(handicapMultiplier) || 1) : 1,
            no_show_opponent_points: Math.max(0, Math.round(Number(noShowOpponentPoints)) || 0),
            no_show_player_points: Math.round(Number(noShowPlayerPoints)) || 0,
            include_visitors: includeVisitors,
            visitor_clubs: Array.from(selectedVisitorClubs),
            description: description.trim() || null,
          })
          .select()
          .single();
        if (champErr) throw champErr;
        champId = champ.id;
      }

      if (awaitingPlayerPairs) {
        if (registrationUsesInviteList) {
          const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
          const registrations = Array.from(selectedPlayerIds)
            .filter((id) => !id.startsWith("visitor-"))
            .map((memberId) => ({
              champ_id: champId,
              club_member_id: memberId,
              status: fee > 0 && paymentRequired ? "pending_payment" : "paid",
              invited_by_admin: false,
              fee_paid_cents: 0,
            }));
          if (registrations.length > 0) {
            const { error: regErr } = await fromExt("club_champs_registrations").upsert(registrations, { onConflict: "champ_id,club_member_id" });
            if (regErr) throw regErr;
          }
        }
        return { id: champId };
      }

      if (!schedulePreview) throw new Error("No schedule generated");

      // Destructive rebuild work happens only after the champ draft is saved and
      // a valid in-memory schedule exists, so a later insert error still leaves
      // the tournament available to edit/retry instead of losing the wizard.
      await fromExt("bookings").delete().like("external_id", `champ:${champId}:%`);
      const { data: oldMatches } = await fromExt("club_champs_matches")
        .select("scheduled_date, scheduled_time, court_id")
        .eq("champ_id", champId);
      for (const m of oldMatches || []) {
        if (!m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
        await fromExt("bookings").delete()
          .eq("date", m.scheduled_date)
          .eq("start_time", m.scheduled_time)
          .eq("court_id", m.court_id)
          .eq("source", "club_event");
      }
      await fromExt("club_champs_matches").delete().eq("champ_id", champId);

      // Create entries
      if (isDoubles) {
        const entries = (groups as DoublePair[][]).flatMap((groupPairs, gi) =>
          groupPairs.map((pair, orderIndex) => ({
              champ_id: champId,
              club_member_id: toDbId(pair.player1Id),
              partner_member_id: toDbId(pair.player2Id),
              group_number: gi + 1,
              order_index: orderIndex,
          }))
        );
        const { error: entryErr } = await fromExt("club_champs_entries").upsert(entries, { onConflict: "champ_id,club_member_id" });
        if (entryErr) throw entryErr;
        const keepIds = entries.map((e) => e.club_member_id);
        if (keepIds.length > 0) await fromExt("club_champs_entries").delete().eq("champ_id", champId).not("club_member_id", "in", `(${keepIds.join(",")})`);
      } else {
        const entries = (groups as ClubMember[][]).flatMap((groupPlayers, gi) =>
          groupPlayers.map((p, orderIndex) => ({
            champ_id: champId,
            club_member_id: toDbId(p.id),
            group_number: gi + 1,
            order_index: orderIndex,
          }))
        );
        const { error: entryErr } = await fromExt("club_champs_entries").upsert(entries, { onConflict: "champ_id,club_member_id" });
        if (entryErr) throw entryErr;
        const keepIds = entries.map((e) => e.club_member_id);
        if (keepIds.length > 0) await fromExt("club_champs_entries").delete().eq("champ_id", champId).not("club_member_id", "in", `(${keepIds.join(",")})`);
      }

      // Build pair lookup for doubles
      const pairMap = new Map<string, DoublePair>();
      doublesPairs.forEach((p) => pairMap.set(p.id, p));

      // Create matches
      const matches = schedulePreview.allMatches.map((m) => {
        const isBye = !!m.isBye;
        // For bye rows we use the bye entity as both player_a/player_b so RLS-friendly
        // NOT NULL columns stay populated, plus set is_bye + bye_member_id explicitly.
        if (isDoubles) {
          const pairA = pairMap.get(m.entityA);
          const pairB = pairMap.get(m.entityB);
          return {
            champ_id: champId,
            group_number: m.groupNum,
            round_number: m.roundNum,
            player_a_member_id: toDbId(pairA?.player1Id || m.entityA),
            partner_a_member_id: pairA?.player2Id ? toDbId(pairA.player2Id) : null,
            player_b_member_id: toDbId(pairB?.player1Id || m.entityB),
            partner_b_member_id: pairB?.player2Id ? toDbId(pairB.player2Id) : null,
            scheduled_date: isBye ? null : m.date,
            scheduled_time: isBye ? null : m.time,
            court_id: isBye ? null : m.courtId,
            leg: m.leg ?? null,
            is_bye: isBye,
            bye_member_id: isBye ? toDbId(pairA?.player1Id || m.entityA) : null,
            status: isBye
              ? (byeHandling === "walkover_win" ? "completed" : "scheduled")
              : "scheduled",
          };
        }
        return {
          champ_id: champId,
          group_number: m.groupNum,
          round_number: m.roundNum,
          player_a_member_id: toDbId(m.entityA),
          player_b_member_id: toDbId(m.entityB),
          scheduled_date: isBye ? null : m.date,
          scheduled_time: isBye ? null : m.time,
          court_id: isBye ? null : m.courtId,
          leg: m.leg ?? null,
          is_bye: isBye,
          bye_member_id: isBye ? toDbId(m.entityA) : null,
          status: isBye
            ? (byeHandling === "walkover_win" ? "completed" : "scheduled")
            : "scheduled",
        };
      });
      if (matches.length > 0) {
        const { error: matchErr } = await fromExt("club_champs_matches").insert(matches);
        if (matchErr) throw matchErr;
      }

      // League-ranking handicap: compute starting-score offsets for every match.
      if (matchType === "singles" && handicapMode !== "none") {
        try {
          // For league_rank mode we now use the admin's own group ordering
          // (top of League 1 = strongest) as the rank source of truth —
          // no shadow-rank prompt needed, reserves/subs slot in wherever
          // the admin dragged them.
          let scoreByMember: Map<string, number> | undefined;
          if (handicapMode === "league_rank") {
            const groupIds = (groups as ClubMember[][]).map((g) => g.map((m) => m.id));
            const allIds = groupIds.flat();
            // Only override the DB league-rank calculation when the
            // tournament actually spans multiple divisions. Same-league
            // tournaments (e.g. NSC-style multiple teams in one division)
            // must keep using each player's team player_rank so that #1s
            // across teams are treated equally strong.
            if (await isCrossLeagueTournament(clubId, allIds)) {
              scoreByMember = buildScoreMapFromGroups(groupIds);
            }
          }
          const n = await applyHandicapsToChamp(champId, clubId, {
            mode: handicapMode,
            divider: handicapDivider,
            multiplier: handicapMultiplier,
            scoreByMember,
          });
          if (n > 0) toast.success(`Applied handicap to ${n} match${n === 1 ? "" : "es"}`);
        } catch (e) {
          console.warn("Handicap computation failed:", e);
        }
      }



      // Auto-book courts — one block per (date, court) covering the full
      // tournament playing window, exactly like league fixture bookings.
      // Bookings are owned by the tournament, never individual players.
      const { data: champRow } = await fromExt("club_champs").select("name").eq("id", champId).maybeSingle();
      const tournamentLabel = ((champRow?.name as string) || champName || "Tournament").trim();
      type Slot = { date: string; courtId: number; start: string; end: string };
      const slotMap = new Map<string, Slot>();
      for (const m of schedulePreview.allMatches as any[]) {
        if (m.isBye || !m.date || !m.time || !m.courtId) continue;
        const isBellsMode = scoringMode === "time_capped_points";
        const cap = isBellsMode
          ? (Number(groupDurations[String(m.groupNum)]) || matchDuration)
          : matchDuration;
        const [h, min] = String(m.time).split(":").map(Number);
        const endMins = h * 60 + min + cap;
        const endH = Math.floor(endMins / 60) % 24;
        const endM = endMins % 60;
        const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        const key = `${m.date}:${m.courtId}`;
        const existing = slotMap.get(key);
        if (!existing) {
          slotMap.set(key, { date: m.date, courtId: m.courtId, start: m.time, end: endStr });
        } else {
          if (m.time < existing.start) existing.start = m.time;
          if (endStr > existing.end) existing.end = endStr;
        }
      }

      const bookings = Array.from(slotMap.values()).map((s) => ({
        club_id: clubId,
        court_id: s.courtId,
        user_id: null,
        club_member_id: null,
        date: s.date,
        start_time: s.start,
        end_time: s.end,
        status: "active",
        is_friendly: false,
        guest_name: tournamentLabel,
        source: "club_event",
        external_id: `champ:${champId}:block:${s.date}:${s.courtId}`,
      }));

      if (bookings.length > 0) {
        // Clear prior per-match bookings for this tournament so re-saves don't
        // leave stale rows alongside the consolidated blocks.
        await fromExt("bookings")
          .delete()
          .eq("club_id", clubId)
          .eq("source", "club_event")
          .like("external_id", `champ:${champId}:%`);
        const { error: bookErr } = await fromExt("bookings")
          .upsert(bookings, { onConflict: "club_id,source,external_id" });
        if (bookErr) console.warn("Some bookings could not be created:", bookErr.message);
      }

      return { id: champId };
    },
    onSuccess: async (data: any) => {
      const savedShellMsg = partnerMode === "admin"
        ? "Tournament saved — open registrations, then edit the tournament to form pairs & generate the schedule."
        : "Tournament saved — players can now register and choose partners.";
      toast.success(awaitingPlayerPairs ? savedShellMsg : editingChampId ? "Tournament updated & rescheduled!" : "Tournament created with all matches scheduled!");
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      qc.invalidateQueries({ queryKey: ["club-champ-entries"] });
      qc.invalidateQueries({ queryKey: ["club-champ-matches"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });

      // For newly-created invite-mode tournaments, decide what to do with invites
      // based on the admin's chosen timing.
      const isNewInvite = !editingChampId && awaitingPlayerPairs && registrationUsesInviteList;
      const inviteeCount = Array.from(selectedPlayerIds).filter((id) => !id.startsWith("visitor-")).length;
      if (isNewInvite && inviteeCount > 0 && data?.id) {
        if (inviteTiming === "now") {
          if (confirm(`Tournament created with ${inviteeCount} invitee${inviteeCount === 1 ? "" : "s"}.\n\nSend invite notification/email now?`)) {
            await sendChampInvites(data.id);
          }
        } else if (inviteTiming === "scheduled" && inviteScheduledAt) {
          const when = new Date(inviteScheduledAt);
          toast.info(`Reminder: send invites on ${when.toLocaleString()} via the edit dialog → “Send / Re-send invites”.`, { duration: 8000 });
        } else {
          toast.info(`Tournament saved. Open the edit dialog and click “Send / Re-send invites” when you're ready to notify ${inviteeCount} member${inviteeCount === 1 ? "" : "s"}.`, { duration: 7000 });
        }
      }

      setShowWizard(false);
      resetWizard();
    },
    onError: (err: any) => toast.error(`${err.message || "Failed to create tournament"}. Your progress is saved as a draft — edit it and retry.`),
  });

  // Create court bookings from the saved tournament matches.
  // Idempotent: one tournament-owned block per (date, court), never per player.
  const createBookings = useMutation({
    mutationFn: async () => {
      const champId = editingChampId;
      if (!champId) throw new Error("Save the tournament first before booking courts.");

      const isBellsMode = scoringMode === "time_capped_points";
      const { data: champRow } = await fromExt("club_champs").select("name").eq("id", champId).maybeSingle();
      const tournamentLabel = ((champRow?.name as string) || champName || "Tournament").trim();
      type Slot = { date: string; courtId: number; start: string; end: string };

      let rows: any[];

      if (isBellsMode) {
        // Bells = many short matches in shared time slots. Don't book per-match;
        // instead reserve each (date, court) as one global tournament block for
        // the whole playing window. Derive blocks directly from the tournament's
        // configured dates + courts (no dependency on per-match scheduled_date,
        // which may be missing for Bells fixtures).
        const gStart = String(startTime || "").slice(0, 5);
        const gEnd = String(endTime || "").slice(0, 5);
        if (!gStart || !gEnd) {
          throw new Error("Set the tournament start and end time before booking courts.");
        }
        if (!startDate || !endDate) {
          throw new Error("Set the tournament start and end dates before booking courts.");
        }
        const courtIds = Array.from(selectedCourtIds);
        if (courtIds.length === 0) {
          throw new Error("Select at least one court before booking.");
        }

        // Enumerate play-day dates between startDate and endDate.
        const dates: string[] = [];
        const cur = new Date(startDate);
        const end = new Date(endDate);
        while (cur <= end) {
          if (playDays.size === 0 || playDays.has(cur.getDay())) {
            dates.push(format(cur, "yyyy-MM-dd"));
          }
          cur.setDate(cur.getDate() + 1);
        }
        if (dates.length === 0) {
          throw new Error("No play days fall within the tournament date range.");
        }

        rows = dates.flatMap((date) =>
          courtIds.map((cid) => ({
            club_id: clubId,
            court_id: cid,
            user_id: null,
            club_member_id: null,
            date,
            start_time: gStart,
            end_time: gEnd,
            status: "active",
            is_friendly: false,
            guest_name: tournamentLabel,
            source: "club_event",
            external_id: `champ:${champId}:block:${date}:${cid}`,
          }))
        );
      } else {
        const { data: champMatches, error: mErr } = await fromExt("club_champs_matches")
          .select("id, scheduled_date, scheduled_time, court_id, player_a_member_id, partner_a_member_id, group_number, is_bye")
          .eq("champ_id", champId);
        if (mErr) throw mErr;

        const playable = (champMatches || []).filter((m: any) =>
          !m.is_bye && m.scheduled_date && m.scheduled_time && m.court_id
        );
        if (playable.length === 0) throw new Error("No scheduled matches with date/time/court found.");

        const slotMap = new Map<string, Slot>();
        for (const m of playable) {
          const cap = matchDuration;
          const start = String(m.scheduled_time).slice(0, 5);
          const [h, min] = start.split(":").map(Number);
          const endMins = h * 60 + min + cap;
          const endH = Math.floor(endMins / 60) % 24;
          const endM = endMins % 60;
          const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          const key = `${m.scheduled_date}:${m.court_id}`;
          const existing = slotMap.get(key);
          if (!existing) {
            slotMap.set(key, { date: m.scheduled_date, courtId: m.court_id, start, end: endTimeStr });
          } else {
            if (start < existing.start) existing.start = start;
            if (endTimeStr > existing.end) existing.end = endTimeStr;
          }
        }

        rows = Array.from(slotMap.values()).map((s) => ({
            club_id: clubId,
            court_id: s.courtId,
            user_id: null,
            club_member_id: null,
            date: s.date,
            start_time: s.start,
            end_time: s.end,
            status: "active",
            is_friendly: false,
            guest_name: tournamentLabel,
            source: "club_event",
            external_id: `champ:${champId}:block:${s.date}:${s.courtId}`,
          }));
      }

      await fromExt("bookings")
        .delete()
        .eq("club_id", clubId)
        .eq("source", "club_event")
        .like("external_id", `champ:${champId}:%`);
      const { data: inserted, error: bErr } = await fromExt("bookings")
        .upsert(rows, { onConflict: "club_id,source,external_id" })
        .select("id");
      if (bErr) throw bErr;

      return { attempted: rows.length, created: inserted?.length ?? 0 };
    },
    onSuccess: (res: any) => {
      const skipped = res.attempted - res.created;
      toast.success(
        skipped > 0
          ? `${res.created} court booking${res.created === 1 ? "" : "s"} created · ${skipped} already booked`
          : `${res.created} court booking${res.created === 1 ? "" : "s"} created`
      );
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create court bookings"),
  });

  // Guard against double-clicks / concurrent invocations that would create
  // duplicate notifications + emails for every invitee.
  const sendingInvitesRef = useRef<Set<string>>(new Set());
  const [invitesSendingFor, setInvitesSendingFor] = useState<string | null>(null);

  // Shared helper: send invite notifications (and flag rows as invited) for a champ.
  // Used by both the post-create prompt and the "Send / Re-send invites" button.
  async function sendChampInvites(champId: string, opts?: { confirm?: boolean }) {
    if (sendingInvitesRef.current.has(champId)) {
      toast.info("Invites are already being sent — please wait.");
      return;
    }
    sendingInvitesRef.current.add(champId);
    setInvitesSendingFor(champId);
    try {
      if (opts?.confirm && !confirm("Send invite notification/email to all invited members now?")) return;

      // If the wizard is currently open editing this tournament in invite mode,
      // ensure the registrations table reflects the latest audience selection
      // BEFORE we read it. This guarantees that newly-added invitees (e.g. after
      // an admin expanded the audience from a shortlist to "all members") get a
      // registration row and therefore receive the invite. We only insert
      // missing rows — existing rows (paid / cancelled / etc.) are left intact.
      const shouldBackfillOpenAudience = editingChampId === champId && registrationRequired && effectiveRegistrationMode === "open";
      const audienceMemberIds = shouldBackfillOpenAudience
        ? members.filter((m) => memberMatchesTournamentGender(m.gender, gender)).map((m) => m.id)
        : Array.from(selectedPlayerIds).filter((id) => !id.startsWith("visitor-"));

      if (editingChampId === champId && audienceMemberIds.length > 0) {
        const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
        const newRegs = audienceMemberIds.map((memberId) => ({
          champ_id: champId,
          club_member_id: memberId,
          status: fee > 0 && paymentRequired ? "pending_payment" : "paid",
          invited_by_admin: false,
          fee_paid_cents: 0,
        }));
        if (newRegs.length > 0) {
          await fromExt("club_champs_registrations").upsert(newRegs, {
            onConflict: "champ_id,club_member_id",
            ignoreDuplicates: true,
          } as any);
        }
      }

      const { data: regs, error: regErr } = await fromExt("club_champs_registrations")
        .select("id, club_member_id, status, invited_by_admin")
        .eq("champ_id", champId);
      if (regErr) throw regErr;

      // Only notify members who haven't already registered/paid/cancelled.
      // Skip anyone already paid, waived, registered or cancelled — they don't
      // need another invite. Also skip rows without a member id.
      const SKIP_STATUSES = new Set(["paid", "waived", "registered", "active", "cancelled"]);
      let rows = (regs || []).filter((r: any) =>
        r.club_member_id && !SKIP_STATUSES.has(String(r.status || "").toLowerCase())
      );
      if (rows.length === 0) {
        const all = (regs || []).filter((r: any) =>
          r.club_member_id && String(r.status || "").toLowerCase() !== "cancelled"
        );
        if (all.length === 0) {
          toast.info("No invitees to notify.");
          return;
        }
        if (!confirm(`Everyone is already registered. Re-send invite to all ${all.length} invited member${all.length === 1 ? "" : "s"} anyway?`)) {
          return;
        }
        rows = all;
      }

      // Build a tenant-aware absolute URL so the recipient lands on the correct
      // club host (e.g. https://nsc.squashhub.co.za/club-champs/...) — without
      // this the link goes to the root domain where RLS hides the tournament.
      const { data: clubRow } = await fromExt("clubs")
        .select("subdomain")
        .eq("id", clubId)
        .maybeSingle();
      const sub = (clubRow as any)?.subdomain as string | undefined;
      const path = `/club-champs/${champId}`;
      const inviteUrl = sub ? `https://${sub}.squashhub.co.za${path}` : path;

      const methods = Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"]));
      const sendApp = methods.includes("app");
      const sendEmail = methods.includes("email");
      const descHasDetails = /— Tournament details —/.test(description);
      const detailLines = descHasDetails ? [] : buildInviteDetailLines({
        gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
        startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
        registrationOpensAt, registrationClosesAt, entryFeeRand,
        pointsPerGame, bestOf,
        registrationRequired, registrationMode: (registrationMode || "open") as any,
      });
      const msg = `You have been invited to ${champName || "a tournament"}.` +
        (detailLines.length ? `\n\n${detailLines.map((l) => `• ${l}`).join("\n")}` : "") +
        (description.trim() ? `\n\n${description.trim()}` : "");


      const notifRows = rows.map((r: any) => ({
        club_member_id: r.club_member_id,
        title: "Tournament invitation",
        message: msg,
        type: "tournament_invite",
        url: inviteUrl,
        data: {
          champ_id: champId,
          send_email: sendEmail,
          app_silent: !sendApp,
          description: description.trim() || null,
        },
        read: false,
      }));
      const { error: insErr } = await fromExt("notifications").insert(notifRows);
      if (insErr) throw insErr;
      // Flag rows as invited so the badge appears + re-sends remain idempotent
      await fromExt("club_champs_registrations")
        .update({ invited_by_admin: true })
        .in("id", rows.map((r: any) => r.id));
      toast.success(`Sent invites to ${rows.length} member${rows.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send invites");
    } finally {
      sendingInvitesRef.current.delete(champId);
      setInvitesSendingFor((cur) => (cur === champId ? null : cur));
    }
  }


  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; withBookings: boolean } | null>(null);
  const [registrationsChamp, setRegistrationsChamp] = useState<any | null>(null);

  const deleteChamp = useMutation({
    mutationFn: async ({ id, withBookings }: { id: string; withBookings: boolean }) => {
      if (withBookings) {
        // 1) Delete any bookings tagged with this champ's stable external_id
        //    (created by the explicit "Make Court Bookings" flow).
        await fromExt("bookings").delete().like("external_id", `champ:${id}:%`);

        // 2) For legacy auto-booked rows (no external_id), match by the
        //    scheduled date/time/court on each champ match.
        const { data: champMatches } = await fromExt("club_champs_matches")
          .select("scheduled_date, scheduled_time, court_id")
          .eq("champ_id", id);
        for (const m of (champMatches || []) as any[]) {
          if (!m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
          await fromExt("bookings").delete()
            .eq("court_id", m.court_id)
            .eq("date", m.scheduled_date)
            .eq("start_time", m.scheduled_time)
            .eq("source", "club_event");
        }
      }
      const { error } = await fromExt("club_champs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tournament deleted");
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setDeleteConfirm(null);
    },
  });

  const setChampStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await fromExt("club_champs").update({ status }).eq("id", id);
      if (error) throw error;
      // When cancelling a tournament, also release any court bookings it created.
      if (status === "cancelled") {
        await fromExt("bookings").delete().like("external_id", `champ:${id}:%`);
        const { data: champMatches } = await fromExt("club_champs_matches")
          .select("scheduled_date, scheduled_time, court_id")
          .eq("champ_id", id);
        for (const m of (champMatches || []) as any[]) {
          if (!m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
          await fromExt("bookings").delete()
            .eq("court_id", m.court_id)
            .eq("date", m.scheduled_date)
            .eq("start_time", m.scheduled_time)
            .eq("source", "club_event");
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === "completed" ? "Tournament closed"
        : vars.status === "cancelled" ? "Tournament cancelled — court bookings released"
        : "Tournament re-opened"
      );
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });

  const resetWizard = () => {
    setStep("category");
    setGender("men");
    setMatchType("singles");
    setEnablePlayoffs(false);
    setNumGroups(0);
    setChampName("");
    setStartDate("");
    setEndDate("");
    setPlayDays(new Set());
    setStartTime("18:00");
    setEndTime("20:00");
    setMatchDuration(0);
    setScoringMode("");
    setPointsPerGame(0);
    setBestOf(0);
    setGroupDurations({});
    setGroupBreakMinutes({});
    setGroupLabels({});
    setDefaultBreakMinutes(0);
    setCourtRotationMinutes(null);
    setRoundFormat("");
    setByeHandling("");
    setSelectedCourtIds(new Set());
    setSelectedPlayerIds(new Set());
    setGroupAssignments(new Map());
    setPlayerOrder([]);
    setDoublesPairs([]);
    setPairGroupAssignments(new Map());
    setPairOrder([]);
    setSourceLeagueIds(new Set());
    setRegistrationMode("");
    setPartnerMode("");
    setRegistrationOpensAt("");
    setRegistrationClosesAt("");
    setEntryFeeRand("0");
    setPaymentMethods(new Set(["card"]));
    setPaymentRequired(true);
    setInviteMethods(new Set(["app"]));
    setInviteSource("manual");
    setInviteIncludeReserves(true);
    setInviteExcludedMemberIds(new Set());
    setHandicapMode("none");
    setHandicapDivider(1);
    setHandicapMultiplier(1);
    setInviteTiming("manual");
    setInviteScheduledAt("");
    setDescription("");
    setAffectsRankingPoints(false);
    setIncludeVisitors(false);
    setSelectedVisitorClubs(new Set());
    setCustomizeDailySchedule(false);
    setDaySchedules([]);
    setEditingChampId(null);
    setEntitiesSnapshotAtLoad(null);
    setRebuildToastFiredForSnapshot(null);
  };

  const loadChampForEdit = async (champ: any) => {
    resetWizard();
    setEditingChampId(champ.id);
    setGender(champ.gender);
    setMatchType(champ.match_type || "singles");
    setEnablePlayoffs(champ.enable_playoffs || false);
    setChampName(champ.name);
    setNumGroups(champ.num_groups);
    setStartDate(champ.start_date);
    setEndDate(champ.end_date);
    setPlayDays(new Set(champ.play_days || []));
    setStartTime(champ.start_time?.slice(0, 5) || "18:00");
    setEndTime(champ.end_time?.slice(0, 5) || "20:00");
    setMatchDuration(champ.match_duration_minutes || 0);
    setScoringMode(((champ as any).scoring_mode as any) || "");
    setPointsPerGame((Number((champ as any).points_per_game) === 15 ? 15 : Number((champ as any).points_per_game) === 11 ? 11 : 0));
    setBestOf((Number((champ as any).best_of) === 3 ? 3 : Number((champ as any).best_of) === 5 ? 5 : 0));
    setGroupDurations(((champ as any).group_durations as Record<string, number>) || {});
    setGroupBreakMinutes(((champ as any).group_break_minutes as Record<string, number>) || {});
    setGroupLabels(((champ as any).group_labels as Record<string, string>) || {});
    setDefaultBreakMinutes(Number((champ as any).default_break_minutes) || 0);
    setCourtRotationMinutes(((champ as any).court_rotation_minutes as number | null) ?? null);
    setRoundFormat((champ.round_format as any) || "");
    setByeHandling((champ.bye_handling as any) || "");
    const initialLeagueIds: string[] = Array.isArray(champ.source_league_ids) && champ.source_league_ids.length > 0
      ? champ.source_league_ids
      : (champ.source_league_id ? [champ.source_league_id] : []);
    setSourceLeagueIds(new Set(initialLeagueIds));
    setRegistrationMode((champ.registration_mode as any) || "");
    setPartnerMode((champ.partner_mode as any) || "");
    setRegistrationOpensAt(champ.registration_opens_at ? new Date(champ.registration_opens_at).toISOString().slice(0,16) : "");
    setRegistrationClosesAt(champ.registration_closes_at ? new Date(champ.registration_closes_at).toISOString().slice(0,16) : "");
    setEntryFeeRand(((champ.entry_fee_cents || 0) / 100).toString());
    setPaymentMethods(new Set(((champ.payment_methods || ["card"]) as ("card"|"eft"|"cash")[])));
    setPaymentRequired((champ as any).payment_required !== false);
    setRegistrationRequired((champ as any).registration_required !== false);
    setInviteMethods(new Set(((champ.invite_methods || ["app"]) as ("app"|"email")[])));
    setInviteSource(((champ as any).invite_source as any) || "manual");
    setInviteIncludeReserves((champ as any).invite_include_reserves !== false);
    setInviteExcludedMemberIds(new Set(((champ as any).invite_excluded_member_ids as string[]) || []));
    setHandicapMode(((champ as any).handicap_mode as any) || "none");
    setHandicapDivider(Math.max(1, Number((champ as any).handicap_divider) || 1));
    setHandicapMultiplier(Math.max(1, Number((champ as any).handicap_multiplier) || 1));
    setNoShowOpponentPoints(Number((champ as any).no_show_opponent_points ?? 10));
    setNoShowPlayerPoints(Number((champ as any).no_show_player_points ?? 0));
    setIncludeVisitors(!!champ.include_visitors);
    setSelectedVisitorClubs(new Set((champ.visitor_clubs as string[] | null) || []));
    const loadedDay = ((champ as any).day_schedules as DaySchedule[] | null) || [];
    setDaySchedules(Array.isArray(loadedDay) ? loadedDay : []);
    setCustomizeDailySchedule(Array.isArray(loadedDay) && loadedDay.length > 0);
    setDescription(champ.description || "");
    setAffectsRankingPoints(!!(champ as any).affects_ranking_points);

    const { data: entries } = await fromExt("club_champs_entries")
      .select("*")
      .eq("champ_id", champ.id)
      .order("group_number", { ascending: true })
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    // Also load admin-invited registrations so invite-mode tournaments
    // (where entries haven't been locked yet) still show their invitees.
    const { data: registrations } = await fromExt("club_champs_registrations")
      .select("club_member_id, partner_member_id, status")
      .eq("champ_id", champ.id);

    const hasEntries = entries && entries.length > 0;

    if (hasEntries) {
      if (champ.match_type === "doubles") {
        const pairs: DoublePair[] = entries.map((e: any) => ({
          id: crypto.randomUUID(),
          player1Id: e.club_member_id,
          player2Id: e.partner_member_id,
        }));
        setDoublesPairs(pairs);
        setPairOrder(pairs.map((p) => p.id));
        const assignments = new Map<string, number>();
        pairs.forEach((p, i) => {
          const entry = entries[i];
          assignments.set(p.id, (entry as any).group_number - 1);
        });
        setPairGroupAssignments(assignments);
      } else {
        setSelectedPlayerIds(new Set(entries.map((e: any) => e.club_member_id)));
        setPlayerOrder(entries.map((e: any) => e.club_member_id));
        const assignments = new Map<string, number>();
        entries.forEach((e: any) => assignments.set(e.club_member_id, e.group_number - 1));
        setGroupAssignments(assignments);
      }
    } else if (registrations && registrations.length > 0) {
      if (champ.match_type === "doubles") {
        const paired = registrations.filter((r: any) => r.partner_member_id);
        const pairs: DoublePair[] = paired.map((r: any) => ({
          id: crypto.randomUUID(),
          player1Id: r.club_member_id,
          player2Id: r.partner_member_id,
        }));
        setDoublesPairs(pairs);
        // Invited members still waiting for a partner — keep them visible
        // so the admin can re-invite or pair them.
        const unpaired = registrations.filter((r: any) => !r.partner_member_id).map((r: any) => r.club_member_id);
        setSelectedPlayerIds(new Set(unpaired));
      } else {
        setSelectedPlayerIds(new Set(registrations.map((r: any) => r.club_member_id)));
      }
    }

    const savedCourtIds = (champ as any).court_ids as number[] | null;
    if (Array.isArray(savedCourtIds) && savedCourtIds.length > 0) {
      setSelectedCourtIds(new Set(savedCourtIds));
    } else {
      const { data: champMatches } = await fromExt("club_champs_matches")
        .select("court_id")
        .eq("champ_id", champ.id);
      if (champMatches) {
        const courtIds = new Set(champMatches.map((m: any) => m.court_id).filter(Boolean) as number[]);
        setSelectedCourtIds(courtIds);
      }
    }

    // Snapshot loaded entities so we can detect edits and prompt for rebuild.
    if (champ.match_type === "doubles") {
      const pairSig = (entries || []).map((e: any) => `${e.club_member_id}+${e.partner_member_id}`).sort().join("|");
      setEntitiesSnapshotAtLoad(`d:${pairSig}`);
    } else {
      const ids = ((entries || []).map((e: any) => e.club_member_id) as string[]).sort();
      setEntitiesSnapshotAtLoad(`s:${ids.join(",")}`);
    }
    setRebuildToastFiredForSnapshot(null);

    // Open the wizard at step 1 so admin can review/edit every step.
    setStep("category");
    setShowWizard(true);
  };

  const [duplicateSource, setDuplicateSource] = useState<any>(null);

  const duplicateChamp = async (champ: any, includePlayers: boolean) => {
    await loadChampForEdit(champ);
    // Treat as brand-new tournament — save will insert, not update.
    setEditingChampId(null);
    setChampName(`${champ.name} (copy)`);
    setStartDate("");
    setEndDate("");
    setRegistrationOpensAt("");
    setRegistrationClosesAt("");
    setInviteScheduledAt("");
    if (!includePlayers) {
      setSelectedPlayerIds(new Set());
      setPlayerOrder([]);
      setGroupAssignments(new Map());
      setDoublesPairs([]);
      setPairOrder([]);
      setPairGroupAssignments(new Map());
      setInviteExcludedMemberIds(new Set());
    }
    setEntitiesSnapshotAtLoad(null);
    setRebuildToastFiredForSnapshot(null);
    toast.success(includePlayers
      ? "Duplicated with players — set new dates and review"
      : "Duplicated — pick players and set new dates");
  };

  const getMemberName = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  const getCourtName = (id: number) => courts.find((c) => c.id === id)?.name || `Court ${id}`;

  const getPairLabel = (pair: DoublePair) =>
    `${getMemberName(pair.player1Id)} & ${getMemberName(pair.player2Id)}`;

  const getEntityLabel = (entityId: string) => {
    if (isDoubles) {
      const pair = doublesPairs.find((p) => p.id === entityId);
      return pair ? getPairLabel(pair) : "Unknown pair";
    }
    return getMemberName(entityId);
  };

  // Detects whether the currently-selected players / pairs differ from what
  // was on the tournament when it was opened for edit. When true, the review
  // step nags the admin to hit "Rebuild Schedule" so fixtures & handicaps
  // are regenerated.
  const currentEntitiesSignature = useMemo(() => {
    if (isDoubles) {
      const sig = doublesPairs
        .map((p) => `${p.player1Id}+${p.player2Id}`)
        .sort()
        .join("|");
      return `d:${sig}`;
    }
    return `s:${Array.from(selectedPlayerIds).sort().join(",")}`;
  }, [isDoubles, doublesPairs, selectedPlayerIds]);

  const entitiesChangedSinceLoad =
    !!editingChampId &&
    !!entitiesSnapshotAtLoad &&
    entitiesSnapshotAtLoad !== currentEntitiesSignature;

  useEffect(() => {
    if (!entitiesChangedSinceLoad) return;
    if (rebuildToastFiredForSnapshot === entitiesSnapshotAtLoad) return;
    setRebuildToastFiredForSnapshot(entitiesSnapshotAtLoad);
    toast.warning("Players changed — rebuild the schedule", {
      description:
        "On the final Review step, click Rebuild Schedule so fixtures and handicaps are regenerated for the new player list.",
      duration: 8000,
    });
  }, [entitiesChangedSinceLoad, entitiesSnapshotAtLoad, rebuildToastFiredForSnapshot]);

  // Doubles pair builder helpers
  const usedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    doublesPairs.forEach((p) => {
      ids.add(p.player1Id);
      ids.add(p.player2Id);
    });
    return ids;
  }, [doublesPairs]);

  const availableForPairing = useMemo(() => {
    if (gender === "mixed" || gender === "open") return members.filter((m) => !usedPlayerIds.has(m.id));
    const matchValues = gender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return members
      .filter((m) => m.gender && matchValues.includes(m.gender.toLowerCase()) && !usedPlayerIds.has(m.id));
  }, [members, gender, usedPlayerIds]);

  // Returns a list of friendly reasons why the current step can't advance.
  // Empty array means the user can click Next.
  const missingForStep = (): string[] => {
    const m: string[] = [];
    switch (step) {
      case "category": {
        if (!gender) m.push("Gender category");
        if (!matchType) m.push("Match type (Singles or Doubles)");
        if (!scoringMode) m.push("Scoring format");
        if (scoringMode === "standard") {
          if (!pointsPerGame) m.push("Game length (Par 11 or 15)");
          if (!bestOf) m.push("Best of (3 or 5)");
        }
        if (!roundFormat) m.push("Round format");
        if (!byeHandling) m.push("Bye handling");
        break;
      }
      case "courts": {
        if (!startDate) m.push("Tournament start date");
        if (!endDate) m.push("Tournament end date");
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
          m.push("End date must be on or after the start date");
        }
        if (!startTime) m.push("Start time");
        if (!endTime) m.push("End time");
        if (selectedCourtIds.size === 0) m.push("At least one court");
        if (!(playDays.size > 0 || (customizeDailySchedule && daySchedules.length > 0))) {
          m.push("At least one play day");
        }
        break;
      }
      case "registration": {
        if (!registrationMode) m.push("Choose who can register");
        if (registrationRequired) {
          if (!registrationOpensAt) m.push("Registration opens (date & time)");
          if (!registrationClosesAt) m.push("Registration closes (date & time)");
          if (registrationOpensAt && registrationClosesAt && new Date(registrationClosesAt) <= new Date(registrationOpensAt)) {
            m.push("Registration close must be after registration open");
          }
          if (inviteMethods.size === 0) m.push("At least one invite delivery method");
        }
        if (Number(entryFeeRand) > 0 && paymentMethods.size === 0) {
          m.push("At least one accepted payment method");
        }
        break;
      }
      case "players": {
        if (selfPairInviteSelection) {
          if (selectedPlayerIds.size < 2) m.push("Select at least 2 players");
        } else if (isDoubles) {
          if (doublesPairs.length < 2) m.push("Build at least 2 doubles pairs");
        } else if (selectedPlayerIds.size < 3) {
          m.push("Select at least 3 players");
        }
        break;
      }
      case "groups": {
        if (!(numGroups >= 1 && numGroups <= Math.floor(entityCount / 2))) {
          m.push(`Number of groups must be between 1 and ${Math.max(1, Math.floor(entityCount / 2))}`);
        }
        break;
      }
      case "schedule": {
        if (!startDate || !endDate) m.push("Tournament dates");
        if (!(playDays.size > 0 || (customizeDailySchedule && daySchedules.length > 0))) {
          m.push("At least one play day");
        }
        if (selectedCourtIds.size === 0) m.push("At least one court");
        if (!matchDuration) m.push("Match duration");
        if (!awaitingPlayerPairs && schedulePreview && schedulePreview.totalSlots < schedulePreview.totalMatches) {
          m.push("Schedule has fewer slots than matches — add more days, courts, or hours");
        }
        break;
      }
      case "review": break;
    }
    return m;
  };

  const canProceed = () => missingForStep().length === 0;


  // ── LIST VIEW ──
  if (!showWizard) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Club Tournaments</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => { resetWizard(); setShowWizard(true); }}>
                  <Trophy className="w-4 h-4 mr-2" /> Plan New Tournament
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Tip: to save time, use the <strong>Copy</strong> button next to a completed tournament below to duplicate its setup with new dates.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {champsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : existingChamps.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No tournaments planned yet.</CardContent></Card>
        ) : (() => {
          const activeChamps = existingChamps.filter((c: any) => c.status !== "completed");
          const completedChamps = existingChamps.filter((c: any) => c.status === "completed");
          const renderCard = (c: any, isCompleted: boolean) => (
            <Card key={c.id} className={isCompleted ? "opacity-75" : ""}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {GENDER_LABELS[c.gender as GenderCategory] || c.gender} · {c.match_type === "doubles" ? "Doubles" : "Singles"} · {c.num_groups} groups · {c.status}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.start_date} to {c.end_date}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/club-champs/${c.id}`)}>
                    <Eye className="w-4 h-4 mr-1" /> View
                  </Button>
                  {!isCompleted && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setRegistrationsChamp(c)}>
                        <UsersIcon className="w-4 h-4 mr-1" /> Registrations
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => loadChampForEdit(c)}>
                        <Pencil className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={setChampStatus.isPending}
                        onClick={() => setChampStatus.mutate({ id: c.id, status: "completed" })}
                      >
                        Close
                      </Button>
                    </>
                  )}
                  {isCompleted && (
                    <Button
                      variant="outline" size="sm"
                      disabled={setChampStatus.isPending}
                      onClick={() => setChampStatus.mutate({ id: c.id, status: "active" })}
                    >
                      Re-open
                    </Button>
                  )}
                  {isCompleted && (
                    <Button variant="outline" size="sm" onClick={() => setDuplicateSource(c)} title="Duplicate this tournament with new dates">
                      <Copy className="w-4 h-4 mr-1" /> Copy
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ id: c.id, withBookings: true })}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
          return (
            <div className="space-y-6">
              <div className="space-y-3">
                {activeChamps.length === 0 ? (
                  <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No active tournaments.</CardContent></Card>
                ) : (
                  activeChamps.map((c: any) => renderCard(c, false))
                )}
              </div>
              {completedChamps.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed</h3>
                  {completedChamps.map((c: any) => renderCard(c, true))}
                </div>
              )}
            </div>
          );
        })()}

        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Championship</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Are you sure? This will remove all matches and entries.
              </p>
              <div className="flex items-center gap-3">
                <Switch
                  id="delete-bookings"
                  checked={deleteConfirm?.withBookings ?? true}
                  onCheckedChange={(v) => deleteConfirm && setDeleteConfirm({ ...deleteConfirm, withBookings: v })}
                />
                <Label htmlFor="delete-bookings" className="text-sm">Also delete associated court bookings</Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive" size="sm"
                disabled={deleteChamp.isPending}
                onClick={() => deleteConfirm && deleteChamp.mutate({ id: deleteConfirm.id, withBookings: deleteConfirm.withBookings })}
              >
                {deleteChamp.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {registrationsChamp && (
          <TournamentRegistrationsDialog
            open={!!registrationsChamp}
            onOpenChange={(v) => !v && setRegistrationsChamp(null)}
            champ={registrationsChamp}
            clubId={clubId}
          />
        )}
      </div>
    );
  }

  // ── WIZARD VIEW ──
  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 text-sm overflow-x-auto">
          {activeSteps.map((s, i) => (
          <div key={s} className="flex items-center">
            {i > 0 && <ChevronRight className="w-3 h-3 mx-1 text-muted-foreground shrink-0" />}
            <span className={`whitespace-nowrap px-2 py-1 rounded ${s === step ? "bg-primary text-primary-foreground font-medium" : i < stepIdx ? "text-primary" : "text-muted-foreground"}`}>
              {STEP_LABELS[s]}
            </span>
          </div>
        ))}
      </div>

      {/* ── STEP: CATEGORY ── */}
      {step === "category" && (
        <Card>
          <CardHeader><CardTitle>Select Category</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Championship Name (optional)</Label>
              <Input
                placeholder={`${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Club Champs ${new Date().getFullYear()}`}
                value={champName}
                onChange={(e) => setChampName(e.target.value)}
              />
            </div>

            {/* Scoring format — driven by the tournament-format registry */}
            <div className="rounded-lg border-2 border-border p-3 bg-slate-100 dark:bg-slate-800/40 shadow-sm">
              <Label className="text-sm font-semibold">Scoring format <span className="text-destructive">*</span></Label>
              <Select
                value={scoringMode}
                onValueChange={(v) => {
                  const fmt = getTournamentFormat(v);
                  setScoringMode(v as any);
                  if (fmt.requiresDoubles && matchType !== "doubles") {
                    setMatchType("doubles");
                  }
                }}
              >
                <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                  {listTournamentFormats().map((fmt) => (
                    <SelectItem key={fmt.key} value={fmt.key}>{fmt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scoringMode ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {getTournamentFormat(scoringMode).description}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">Choose a scoring format to see details.</p>
              )}
              {scoringMode && getTournamentFormat(scoringMode).requiresDoubles && !isDoubles && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  This format requires doubles — match type will be set to Doubles.
                </p>
              )}
              {scoringMode === "standard" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs font-medium">Game length</Label>
                    <Select
                      value={pointsPerGame > 0 ? String(pointsPerGame) : ""}
                      onValueChange={(v) => setPointsPerGame(Number(v) as 11 | 15)}
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue placeholder="Please select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                        <SelectItem value="11">Par 11 (win by 2) — WSF standard</SelectItem>
                        <SelectItem value="15">Par 15 (win by 2)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Best of</Label>
                    <Select
                      value={bestOf > 0 ? String(bestOf) : ""}
                      onValueChange={(v) => setBestOf(Number(v) as 3 | 5)}
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue placeholder="Please select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                        <SelectItem value="3">Best of 3 (first to 2 games)</SelectItem>
                        <SelectItem value="5">Best of 5 (first to 3 games)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border-2 border-border p-3 bg-slate-100 dark:bg-slate-800/40 shadow-sm">
              <div>
                <Label className="text-sm font-semibold">Round Format <span className="text-destructive">*</span></Label>
                <Select value={roundFormat} onValueChange={(v) => setRoundFormat(v as any)}>
                  <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue placeholder="Please select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                    <SelectItem value="single_round_robin">Single round-robin (within same league — each player plays every other player in their league once)</SelectItem>
                    <SelectItem value="double_round_robin">Double round-robin (within same league — each player plays every other player in their league twice, home &amp; away)</SelectItem>
                    <SelectItem value="cross_league">
                      League vs League (cross-league only — players only play opponents from the other league, not their own) — set 2+ leagues on the Groups step
                    </SelectItem>
                  </SelectContent>
                </Select>
                {roundFormat ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {roundFormat === "double_round_robin"
                      ? "All teams play one another twice — first round home, second round away."
                      : roundFormat === "cross_league"
                      ? "No intra-league games. Every player in league 1 plays every player in league 2 (and so on across leagues). Pick at least 2 leagues."
                      : "All teams play one another once."}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">Choose a round format to see details.</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold">Bye Handling <span className="text-destructive">*</span></Label>
                <Select value={byeHandling} onValueChange={(v) => setByeHandling(v as any)}>
                  <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue placeholder="Please select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                    <SelectItem value="no_match">No match — bye not recorded</SelectItem>
                    <SelectItem value="walkover_win">Walkover win — full points</SelectItem>
                    <SelectItem value="neutral">Neutral — excluded from averages</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Applies when an odd number of teams means one sits out per round.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Gender Category <span className="text-destructive">*</span></Label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["men", "ladies", "mixed", "open"] as GenderCategory[]).map((g) => (
                  <Button
                    key={g}
                    variant={gender === g ? "default" : "outline"}
                    className="h-16 text-base"
                    onClick={() => setGender(g)}
                  >
                    {g === "men"
                      ? "🏆 Men's"
                      : g === "ladies"
                      ? "🏆 Ladies'"
                      : g === "mixed"
                      ? "🏆 Mixed"
                      : "🏆 Open"}
                  </Button>
                ))}
              </div>
              {gender === "mixed" && (
                <p className="text-[11px] text-muted-foreground mt-1.5">Mixed = traditional 1 man + 1 lady pairs.</p>
              )}
              {gender === "open" && (
                <p className="text-[11px] text-muted-foreground mt-1.5">Open = any pairing allowed (M+M, F+F, or M+F). Great for fundraisers.</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Match Type <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={matchType === "singles" ? "default" : "outline"}
                  className="h-16 text-base"
                  onClick={() => setMatchType("singles")}
                >
                  👤 Singles
                </Button>
                <Button
                  variant={matchType === "doubles" ? "default" : "outline"}
                  className="h-16 text-base"
                  onClick={() => setMatchType("doubles")}
                >
                  👥 Doubles
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Include Visitors</Label>
                <p className="text-xs text-muted-foreground">
                  Add registered visitors to the tournament player pool
                </p>
              </div>
              <Switch checked={includeVisitors} onCheckedChange={(v) => { setIncludeVisitors(v); if (!v) setSelectedVisitorClubs(new Set()); }} />
            </div>


            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Enable Playoffs</Label>
                <p className="text-xs text-muted-foreground">
                  After group stages, matching positions play off (e.g. #1 vs #1, #2 vs #2). With 4+ groups, semi-finals and a final are added.
                </p>
              </div>
              <Switch checked={enablePlayoffs} onCheckedChange={setEnablePlayoffs} />
            </div>

            {includeVisitors && visitorClubs.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-sm font-medium">Filter by Home Club</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Leave all unchecked to include visitors from all clubs ({filteredVisitors.length} visitor{filteredVisitors.length !== 1 ? "s" : ""} matching)
                </p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {visitorClubs.map((club) => (
                    <label key={club} className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-2 py-1">
                      <Checkbox
                        checked={selectedVisitorClubs.has(club)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedVisitorClubs);
                          checked ? next.add(club) : next.delete(club);
                          setSelectedVisitorClubs(next);
                        }}
                      />
                      <span className="text-sm">{club}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {allVisitors.filter((v) => v.home_club_name === club).length}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {includeVisitors && visitorClubs.length === 0 && (
              <p className="text-xs text-muted-foreground rounded-lg border p-3">
                No visitors registered yet. Visitors can register from the club sign-in page.
              </p>
            )}
          </CardContent>
        </Card>
      )}


      {/* ── STEP: COURTS (date / time / courts → book ahead of player selection) ── */}
      {step === "courts" && (
        <Card>
          <CardHeader>
            <CardTitle>Dates, Times &amp; Courts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Lock in when the tournament is played and which courts it owns. You can book the courts now — bookings appear under the tournament name in the courts grid so nothing else can be booked over them.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Tournament starts</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Tournament ends</Label>
                <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Daily start time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Daily end time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-sm">Play days</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAY_NAMES.map((name, i) => (
                  <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={playDays.has(i)}
                      onCheckedChange={(checked) => {
                        const next = new Set(playDays);
                        checked ? next.add(i) : next.delete(i);
                        setPlayDays(next);
                      }}
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                For a one-day tournament tick just that day. For a weekend, tick both.
              </p>
            </div>

            <div>
              <Label className="text-sm">Courts used by the tournament</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {courts.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={selectedCourtIds.has(c.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedCourtIds);
                        checked ? next.add(c.id) : next.delete(c.id);
                        setSelectedCourtIds(next);
                      }}
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
                {courts.length === 0 && (
                  <span className="text-xs text-muted-foreground">No courts configured for this club yet.</span>
                )}
              </div>
            </div>

            {/* Per-day schedule overrides — supports multiple time windows per date
                (e.g. Sat 10:00–12:00 AND Sat 14:00–16:00, Sun different hours). */}
            <div className="rounded-lg border p-3 space-y-3">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={customizeDailySchedule}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setCustomizeDailySchedule(on);
                    if (on && daySchedules.length === 0 && startDate && endDate) {
                      const dates = eachDayOfInterval({
                        start: parseISO(startDate),
                        end: parseISO(endDate),
                      }).filter((d) => playDays.size === 0 || playDays.has(getDay(d)));
                      setDaySchedules(
                        dates.map((d) => ({
                          date: format(d, "yyyy-MM-dd"),
                          start_time: startTime,
                          end_time: endTime,
                          court_ids: null,
                        }))
                      );
                    }
                  }}
                />
                <span>
                  <span className="font-medium">Customize times per day</span>
                  <span className="block text-xs text-muted-foreground">
                    Set different time windows (and optionally specific courts) for each play-day — e.g. Saturday 10:00–12:00 and 14:00–16:00, Sunday different hours.
                  </span>
                </span>
              </label>

              {customizeDailySchedule && (
                <div className="space-y-2">
                  {daySchedules.length === 0 && (
                    <p className="text-xs text-muted-foreground">Pick dates and play days above, then add a window.</p>
                  )}
                  {daySchedules.map((d, idx) => {
                    const allCourts = d.court_ids === null;
                    return (
                      <div key={idx} className="rounded border p-2 bg-muted/20 space-y-2">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={d.date}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, date: v } : x));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Start</Label>
                            <Input
                              type="time"
                              value={d.start_time}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, start_time: v } : x));
                              }}
                              className="h-8 text-sm w-28"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">End</Label>
                            <Input
                              type="time"
                              value={d.end_time}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, end_time: v } : x));
                              }}
                              className="h-8 text-sm w-28"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => setDaySchedules((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </Button>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Checkbox
                              checked={allCourts}
                              onCheckedChange={(v) => {
                                setDaySchedules((prev) => prev.map((x, i) =>
                                  i === idx
                                    ? { ...x, court_ids: v ? null : Array.from(selectedCourtIds) }
                                    : x
                                ));
                              }}
                            />
                            <span className="text-xs">All selected courts</span>
                          </div>
                          {!allCourts && (
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(selectedCourtIds).map((cid) => {
                                const active = d.court_ids?.includes(cid);
                                return (
                                  <button
                                    key={cid}
                                    type="button"
                                    onClick={() => {
                                      setDaySchedules((prev) => prev.map((x, i) => {
                                        if (i !== idx) return x;
                                        const cur = x.court_ids ?? [];
                                        const next = cur.includes(cid)
                                          ? cur.filter((c) => c !== cid)
                                          : [...cur, cid];
                                        return { ...x, court_ids: next };
                                      }));
                                    }}
                                    className={`px-2 py-0.5 rounded text-xs border ${
                                      active
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background hover:bg-muted border-border"
                                    }`}
                                  >
                                    {getCourtName(cid)}
                                  </button>
                                );
                              })}
                              {selectedCourtIds.size === 0 && (
                                <span className="text-xs text-muted-foreground">Tick courts above first.</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = daySchedules[daySchedules.length - 1];
                      setDaySchedules((prev) => [
                        ...prev,
                        {
                          date: last?.date || startDate || format(new Date(), "yyyy-MM-dd"),
                          start_time: startTime,
                          end_time: endTime,
                          court_ids: null,
                        },
                      ]);
                    }}
                  >
                    + Add time window
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Add the same date more than once to create multiple sessions on that day (e.g. morning + afternoon). When customized, the global Start/End times above are ignored.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Book the courts now</p>
                  <p className="text-xs text-muted-foreground">
                    Reserves one block per (date, time-window, court) under the tournament name. Safe to re-run after editing — blocks are upserted, not duplicated.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !startDate || !endDate || !startTime || !endTime ||
                    selectedCourtIds.size === 0 ||
                    !(playDays.size > 0 || (customizeDailySchedule && daySchedules.length > 0))
                  }
                  onClick={async () => {
                    try {
                      const id = await saveDraft();
                      if (!id || !clubId) {
                        toast.error("Could not save tournament shell — try again.");
                        return;
                      }
                      const courtIds = Array.from(selectedCourtIds);
                      const { data: champRow } = await fromExt("club_champs").select("name").eq("id", id).maybeSingle();
                      const tournamentLabel = ((champRow?.name as string) || champName || "Tournament").trim();

                      // Build (date, start, end, courtIds) windows.
                      type Window = { date: string; start: string; end: string; courts: number[] };
                      const windows: Window[] = [];
                      if (customizeDailySchedule && daySchedules.length > 0) {
                        for (const d of daySchedules) {
                          if (!d.date || !d.start_time || !d.end_time) continue;
                          const cs = (d.court_ids && d.court_ids.length > 0
                            ? d.court_ids.filter((cid) => selectedCourtIds.has(cid))
                            : courtIds);
                          if (cs.length === 0) continue;
                          windows.push({
                            date: d.date,
                            start: String(d.start_time).slice(0, 5),
                            end: String(d.end_time).slice(0, 5),
                            courts: cs,
                          });
                        }
                      } else {
                        const gStart = String(startTime).slice(0, 5);
                        const gEnd = String(endTime).slice(0, 5);
                        const cur = new Date(startDate);
                        const end = new Date(endDate);
                        while (cur <= end) {
                          if (playDays.size === 0 || playDays.has(cur.getDay())) {
                            windows.push({
                              date: format(cur, "yyyy-MM-dd"),
                              start: gStart,
                              end: gEnd,
                              courts: courtIds,
                            });
                          }
                          cur.setDate(cur.getDate() + 1);
                        }
                      }
                      if (windows.length === 0) {
                        toast.error("No play days / time windows configured.");
                        return;
                      }
                      const rows = windows.flatMap((w) =>
                        w.courts.map((cid) => ({
                          club_id: clubId,
                          court_id: cid,
                          user_id: null,
                          club_member_id: null,
                          date: w.date,
                          start_time: w.start,
                          end_time: w.end,
                          status: "active",
                          is_friendly: false,
                          guest_name: tournamentLabel,
                          source: "club_event",
                          // include start time so multiple windows per (date,court) don't collide
                          external_id: `champ:${id}:block:${w.date}:${w.start}:${cid}`,
                        }))
                      );
                      // Wipe any prior tournament blocks for THIS champ.
                      await fromExt("bookings")
                        .delete()
                        .eq("club_id", clubId)
                        .eq("source", "club_event")
                        .like("external_id", `champ:${id}:%`);
                      // Also wipe any *other* tournament/club_event blocks that
                      // would collide on (court, date, start_time) — these are
                      // leftovers from earlier champ drafts on the same slot
                      // and would otherwise trip the no-double-booking index.
                      const datesToClear = Array.from(new Set(rows.map((r) => r.date)));
                      const courtsToClear = Array.from(new Set(rows.map((r) => r.court_id)));
                      const { data: existingBlocks } = await fromExt("bookings")
                        .select("id,court_id,date,start_time,end_time,external_id")
                        .eq("club_id", clubId)
                        .eq("source", "club_event")
                        .eq("status", "active")
                        .in("date", datesToClear)
                        .in("court_id", courtsToClear);
                      const toMin = (t: string) => {
                        const [h, m] = String(t).slice(0, 5).split(":").map(Number);
                        return h * 60 + (m || 0);
                      };
                      const collidingIds = (existingBlocks || [])
                        .filter((b: any) =>
                          rows.some(
                            (r) =>
                              r.court_id === b.court_id &&
                              r.date === b.date &&
                              toMin(r.start_time) < toMin(b.end_time) &&
                              toMin(r.end_time) > toMin(b.start_time),
                          ),
                        )
                        .map((b: any) => b.id);
                      if (collidingIds.length > 0) {
                        await fromExt("bookings").delete().in("id", collidingIds);
                      }
                      const { error: bErr } = await fromExt("bookings")
                        .upsert(rows, { onConflict: "club_id,source,external_id" });
                      if (bErr) throw bErr;
                      qc.invalidateQueries({ queryKey: ["bookings"] });
                      qc.invalidateQueries({ queryKey: ["my-bookings"] });
                      toast.success(`${rows.length} court booking${rows.length === 1 ? "" : "s"} created under "${tournamentLabel}"`);
                    } catch (e: any) {
                      toast.error(e?.message || "Could not book courts");
                    }
                  }}
                >
                  Book courts now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* ── STEP: REGISTRATION & PAYMENT ── */}
      {step === "registration" && (
        <Card>
          <CardHeader>
            <CardTitle>Registration &amp; Payment</CardTitle>
            <p className="text-sm text-muted-foreground">
              Decide how members enter this tournament and whether they must pay to qualify.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Registration-required toggle — when off, the entire invite/window
                section collapses and the admin seeds the roster directly on the
                Players step. */}
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Switch
                id="registration-required"
                checked={registrationRequired}
                onCheckedChange={(v) => setRegistrationRequired(!!v)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="registration-required" className="text-sm font-medium cursor-pointer">
                  Players need to register / be invited
                </Label>
                <p className="text-xs text-muted-foreground">
                  Turn on when entry is conditional on members opting in (e.g. paid tournaments, fixed deadlines). Turn off when the admin simply picks the roster — the registration window then disappears, but the "Who can register" / invite list controls below remain so you can still seed players from a shortlist or open audience.
                </p>
              </div>
            </div>

            {/* Entry fee + payment methods — payment-methods panel slides in beside the fee when amount > 0 */}
            <div className={Number(entryFeeRand) > 0 ? "grid grid-cols-1 md:grid-cols-2 gap-4 items-start" : ""}>
              <div className="space-y-2">
                <Label className="text-sm">Entry fee (ZAR)</Label>
                <Input
                  type="number" min={0} step="1" inputMode="decimal"
                  value={entryFeeRand}
                  onChange={(e) => setEntryFeeRand(e.target.value)}
                  placeholder="0 = free"
                />
                <p className="text-xs text-muted-foreground">Set 0 for a free tournament.</p>
              </div>

              {Number(entryFeeRand) > 0 && (
                <div className="rounded-lg border-2 border-border bg-slate-100 dark:bg-slate-800/40 shadow-sm p-3 space-y-2">
                  <Label className="text-sm font-semibold">
                    Accepted payment methods <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Tick the methods you'll accept for this tournament. Configure your online gateway and bank details in Club Admin → Banking.
                  </p>
                  <div className="space-y-1.5">
                    {/* Online gateway — only when the club has configured one */}
                    {clubPaymentConfig?.gateway ? (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={paymentMethods.has("card")}
                          onCheckedChange={(c) => {
                            const next = new Set(paymentMethods);
                            c ? next.add("card") : next.delete("card");
                            setPaymentMethods(next);
                          }}
                        />
                        Online ({clubPaymentConfig.gatewayLabel}) — card / instant pay
                      </label>
                    ) : (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        No online gateway configured. Add one in Club Admin → Banking to accept card / instant payments.
                      </p>
                    )}

                    {/* EFT — only when bank details exist */}
                    {clubPaymentConfig?.eftConfigured ? (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={paymentMethods.has("eft")}
                          onCheckedChange={(c) => {
                            const next = new Set(paymentMethods);
                            c ? next.add("eft") : next.delete("eft");
                            setPaymentMethods(next);
                          }}
                        />
                        EFT (bank transfer — admin marks paid)
                      </label>
                    ) : (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        EFT unavailable — add bank details in Club Admin → Banking to enable.
                      </p>
                    )}

                    {/* Cash at club — always available */}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={paymentMethods.has("cash")}
                        onCheckedChange={(c) => {
                          const next = new Set(paymentMethods);
                          c ? next.add("cash") : next.delete("cash");
                          setPaymentMethods(next);
                        }}
                      />
                      Cash at club (admin marks paid)
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-border/60">
                    <Switch id="payment-required" checked={paymentRequired} onCheckedChange={setPaymentRequired} />
                    <Label htmlFor="payment-required" className="text-xs">
                      Player must pay before they qualify to play
                    </Label>
                  </div>
                </div>
              )}
            </div>

            {/* Registration mode — always visible. Even when registration is not
                required, this still controls how the admin seeds the player
                roster (open audience vs invite shortlist). */}
            <div className="space-y-2">
              <Label className="text-sm">Who can register?</Label>
              <Select value={registrationMode} onValueChange={(v) => setRegistrationMode(v as any)}>
                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                  <SelectItem value="open">Open — any eligible club member</SelectItem>
                  <SelectItem value="invite">Invite-only — admin shortlists members</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Invite source — only meaningful in invite mode */}
            {registrationUsesInviteList && (
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Label className="text-sm">Initial invite list comes from…</Label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="invite-source"
                      checked={inviteSource === "manual"}
                      onChange={() => setInviteSource("manual")}
                    />
                    Manual tick-list
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="invite-source"
                      checked={inviteSource === "leagues"}
                      onChange={() => setInviteSource("leagues")}
                    />
                    By league (pick on the Players step)
                  </label>
                </div>
                {inviteSource === "leagues" && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-muted-foreground">Pick which leagues to seed from</Label>
                    {leagueGroups.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No leagues found for this club.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto rounded border border-border/50 bg-background/60 p-2">
                        {leagueGroups.map((g) => {
                          const allOn = g.leagueIds.every((id) => sourceLeagueIds.has(id));
                          const someOn = !allOn && g.leagueIds.some((id) => sourceLeagueIds.has(id));
                          return (
                            <label key={g.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                              <Checkbox
                                checked={allOn ? true : someOn ? "indeterminate" : false}
                                onCheckedChange={() => toggleSourceGroup(g.leagueIds)}
                              />
                              <span className="truncate">{g.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                      <Checkbox
                        checked={inviteIncludeReserves}
                        onCheckedChange={(c) => {
                          setInviteIncludeReserves(!!c);
                          if (sourceLeagueIds.size > 0) applyLeaguePrefill(new Set(sourceLeagueIds));
                        }}
                      />
                      Include reserves
                    </label>
                    {hasLeagueSelection && (
                      <p className="text-xs text-muted-foreground">
                        {selectedPlayerIds.size} player{selectedPlayerIds.size === 1 ? "" : "s"} seeded from {sourceLeagueIds.size} league{sourceLeagueIds.size === 1 ? "" : "s"}.
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  This only seeds the starting roster. You can still pull in any player from any league as a sub at any time — no cutoff.
                </p>
              </div>
            )}

            {/* League-ranking handicap — singles only */}
            {matchType === "singles" && (
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Label className="text-sm">Handicap scoring</Label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="handicap-mode"
                      checked={handicapMode === "none"}
                      onChange={() => setHandicapMode("none")}
                    />
                    None
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="handicap-mode"
                      checked={handicapMode === "league_rank"}
                      onChange={() => setHandicapMode("league_rank")}
                    />
                    By league ranking
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="handicap-mode"
                      checked={handicapMode === "club_ladder"}
                      onChange={() => setHandicapMode("club_ladder")}
                    />
                    By club ladder
                  </label>
                </div>
                {handicapMode !== "none" && (
                  <div className="flex flex-wrap items-center gap-4 text-sm pt-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Multiplier</Label>
                      <Input
                        type="number"
                        min={1}
                        step="0.5"
                        value={handicapMultiplier}
                        onChange={(e) => setHandicapMultiplier(Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 w-20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Divider</Label>
                      <Input
                        type="number"
                        min={1}
                        step="0.5"
                        value={handicapDivider}
                        onChange={(e) => setHandicapDivider(Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 w-20"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      final gap = raw gap × multiplier ÷ divider (both default 1)
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {handicapMode === "club_ladder"
                    ? "Stronger player (lower ladder position) starts on a negative score equal to the ladder-position gap, scaled by the multiplier/divider above."
                    : "Same-league tournaments (one division, multiple teams) use each player's league team rank — all #1s are treated equally strong. Cross-league tournaments (e.g. 2nd vs 4th League) follow the order on the Groups step — top of League 1 = strongest. Sort strongest → weakest in that case."}
                </p>
              </div>
            )}

            {/* No Show / Injured rule — applies when a player can't play.
                Opponent gets the opponent points; the absent player records the
                player points (can be negative as a penalty). */}
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
              <Label className="text-sm">No Show / Injured rule</Label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Points for opponent</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={noShowOpponentPoints}
                    onChange={(e) => setNoShowOpponentPoints(Math.max(0, Math.round(Number(e.target.value)) || 0))}
                    className="h-8 w-20"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Points for player</Label>
                  <Input
                    type="number"
                    step={1}
                    value={noShowPlayerPoints}
                    onChange={(e) => setNoShowPlayerPoints(Math.round(Number(e.target.value)) || 0)}
                    className="h-8 w-20"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Used when an admin marks a tournament game as <b>No Show / Injured</b> on the scorecard. Defaults: 10 for the opponent, 0 for the absent player (can be negative as a penalty).
              </p>
            </div>


            {/* Tournament dates are set on the Courts step (one step earlier).
                Shown here as a read-only summary so the admin doesn't have to
                jump back to confirm them. */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
              <span className="font-medium text-foreground">Tournament dates:</span>{" "}
              {startDate && endDate
                ? <span>{startDate} → {endDate}</span>
                : <span className="text-muted-foreground italic">Go back to the Courts step to set the dates.</span>}
            </div>

            {/* Registration window — only when registration is required */}
            {registrationRequired && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Registration opens</Label>
                  <Input type="datetime-local" value={registrationOpensAt} onChange={(e) => setRegistrationOpensAt(e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Registration closes</Label>
                  <Input type="datetime-local" value={registrationClosesAt} onChange={(e) => setRegistrationClosesAt(e.target.value)} />
                </div>
              </div>
            )}


            {/* Invite methods — always shown so admins control delivery channel */}
            <div className="space-y-2">
              <Label className="text-sm">Invite delivery method</Label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={inviteMethods.has("app")}
                    onCheckedChange={(c) => {
                      const next = new Set(inviteMethods);
                      c ? next.add("app") : next.delete("app");
                      if (next.size === 0) next.add("app");
                      setInviteMethods(next);
                    }}
                  />
                  In-app notification
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={inviteMethods.has("email")}
                    onCheckedChange={(c) => {
                      const next = new Set(inviteMethods);
                      c ? next.add("email") : next.delete("email");
                      if (next.size === 0) next.add("app");
                      setInviteMethods(next);
                    }}
                  />
                  Email
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose how invited members are notified. Pick both for maximum reach.
              </p>
            </div>

            {/* Invite send timing — only when invites/registration are used */}
            {registrationRequired && (
            <div className="space-y-2">
              <Label className="text-sm">When to send invites</Label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invite-timing"
                    checked={inviteTiming === "manual"}
                    onChange={() => setInviteTiming("manual")}
                  />
                  Manual — I'll trigger later
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invite-timing"
                    checked={inviteTiming === "now"}
                    onChange={() => setInviteTiming("now")}
                  />
                  Send immediately on save
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invite-timing"
                    checked={inviteTiming === "scheduled"}
                    onChange={() => setInviteTiming("scheduled")}
                  />
                  Schedule for date
                </label>
              </div>
              {inviteTiming === "scheduled" && (
                <div className="flex flex-col gap-1">
                  <Input
                    type="datetime-local"
                    value={inviteScheduledAt}
                    onChange={(e) => setInviteScheduledAt(e.target.value)}
                    className="max-w-xs h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    You'll get a reminder near this time. Automated send-out isn't wired up yet — use “Send / Re-send invites” when ready.
                  </p>
                </div>
              )}
              {inviteTiming === "manual" && (
                <p className="text-xs text-muted-foreground">
                  Tournament is saved without notifying anyone. Open the edit dialog and click “Send / Re-send invites” when you're ready.
                </p>
              )}
            </div>
            )}



            {/* Tournament description / invite body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Tournament details (shown in invites)</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const lines = buildInviteDetailLines({
                        gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
                        startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
                        registrationOpensAt, registrationClosesAt, entryFeeRand,
                        pointsPerGame, bestOf,
                        registrationRequired, registrationMode: (registrationMode || "open") as any,
                      });
                      const bullets = lines.map((l) => `• ${l}`).join("\n");
                      // Strip any previously inserted auto-block (between markers) then prepend fresh.
                      const stripped = description
                        .replace(/^[\s\S]*?— Tournament details —\n([\s\S]*?)\n— End details —\n?/m, "")
                        .trimStart();
                      const block = `— Tournament details —\n${bullets}\n— End details —`;
                      setDescription(stripped ? `${block}\n\n${stripped}` : block);
                    }}
                  >
                    Fill from settings
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowInvitePreview(true)}
                  >
                    <Eye className="w-4 h-4 mr-1" /> Preview invite
                  </Button>
                </div>
              </div>
              <Textarea
                rows={8}
                placeholder={`Click "Fill from settings" to insert the tournament details (category, format, dates, registration window, fee) into this box, then add anything extra like:\nVenue: Main courts, 18:00 start\nPrizes: Trophy + R500 voucher\nDress code: Club shirts\nQueries: contact the captain`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This whole text appears inside the in-app notification and the email invitation. Use “Fill from settings” to pull in the current tournament configuration so you can edit it before sending. Creating or saving the tournament does NOT auto-notify — use the “Send / Re-send invites” button below.
              </p>
              {editingChampId && (
                <div className="pt-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={invitesSendingFor === editingChampId}
                    onClick={() => sendChampInvites(editingChampId, { confirm: true })}
                  >
                    {invitesSendingFor === editingChampId ? "Sending…" : "Send / Re-send invites"}
                  </Button>
                </div>
              )}

              <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 mt-2">
                <div className="min-w-0">
                  <Label className="text-xs font-medium">Affects official ranking points?</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    When on, completed tournament matches will queue point movements for admin approval.
                  </p>
                </div>
                <Switch checked={affectsRankingPoints} onCheckedChange={setAffectsRankingPoints} />
              </div>

            </div>






            {/* Partner mode — doubles only */}
            {isDoubles && (
              <div className="space-y-2">
                <Label className="text-sm">Partner selection</Label>
                <Select
                  value={partnerMode}
                  onValueChange={(v) => setPartnerMode(v as any)}
                  onOpenChange={(open) => {
                    if (!open) return;
                    const y = window.scrollY;
                    requestAnimationFrame(() => window.scrollTo({ top: y }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} onCloseAutoFocus={(e) => e.preventDefault()}>
                    <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                    <SelectItem value="admin">Admin pairs all players</SelectItem>
                    <SelectItem value="players">Players choose their own partner (admin can override)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only applies to doubles. Switch to Singles in Step 1 to hide this option.
                </p>
              </div>
            )}
            {!isDoubles && (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Partner selection</strong> appears here for doubles tournaments. This tournament is set to <em>Singles</em> — go back to Step 1 (Category) and pick <em>Doubles</em> to enable partner pairing options.
              </div>
            )}


          </CardContent>
        </Card>
      )}

      {/* ── STEP: PLAYERS / INVITES ── */}
      {step === "players" && (!isDoubles || selfPairInviteSelection) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{selfPairInviteSelection ? "Invite Members" : "Select Players"} — {GENDER_LABELS[gender]}</CardTitle>
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  if (selectedPlayerIds.size === allSelectablePlayers.length) {
                    setSelectedPlayerIds(new Set());
                  } else {
                    setSelectedPlayerIds(new Set(allSelectablePlayers.map((m: any) => m.id)));
                  }
                }}
              >
                {selectedPlayerIds.size === allSelectablePlayers.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedPlayerIds.size} of {allSelectablePlayers.length} selected
              {visitorAsMembers.length > 0 && ` (incl. ${visitorAsMembers.filter((v: any) => selectedPlayerIds.has(v.id)).length} visitors)`}
            </p>
            {selfPairInviteSelection && (
              <p className="text-xs text-muted-foreground">
                Selected members will receive the tournament invite. They register/pay first, then choose their own partners.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {allSelectablePlayers.length === 0 ? (
              <p className="text-muted-foreground py-4">No matching players found. Check member gender settings.</p>
            ) : (
              <>
                <Input
                  placeholder="Search by name…"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="mb-3 h-9"
                />
                {(() => {
                  const q = playerSearch.trim().toLowerCase();
                  const filtered = q
                    ? allSelectablePlayers.filter((m: any) =>
                        ((m.name || m.profiles?.name || "") as string).toLowerCase().includes(q)
                      )
                    : allSelectablePlayers;
                  if (filtered.length === 0) {
                    return <p className="text-sm text-muted-foreground py-4 text-center">No players match "{playerSearch}"</p>;
                  }
                  return (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {filtered.map((m: any) => {
                        const i = allSelectablePlayers.findIndex((p: any) => p.id === m.id);
                        return (
                          <label key={m.id} className="flex items-center gap-3 p-2 rounded hover:bg-accent cursor-pointer">
                            <Checkbox
                              checked={selectedPlayerIds.has(m.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedPlayerIds);
                                checked ? next.add(m.id) : next.delete(m.id);
                                setSelectedPlayerIds(next);
                              }}
                            />
                            <span className="w-6 text-right text-muted-foreground text-sm">{i + 1}.</span>
                            <span className="font-medium">{m.name || m.profiles?.name || "—"}</span>
                            {m._isVisitor && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Visitor · {m._homeClub}</Badge>}
                            {!m._isVisitor && m.gender && <Badge variant="outline" className="text-[10px]">{m.gender}</Badge>}
                            {m.ladder_position && <Badge variant="secondary" className="text-xs">#{m.ladder_position}</Badge>}
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP: PLAYERS (Doubles — Pair Builder) ── */}
      {step === "players" && isDoubles && partnerMode === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Form Doubles Pairs — {GENDER_LABELS[gender]}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Do this once registrations have closed so you know who's actually playing. {doublesPairs.length} pair{doublesPairs.length !== 1 ? "s" : ""} formed.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Existing pairs */}
            {doublesPairs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Pairs</Label>
                {doublesPairs.map((pair) => (
                  <div key={pair.id} className="flex items-center gap-2 p-2 rounded bg-muted/50 border">
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1">{getPairLabel(pair)}</span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setDoublesPairs(doublesPairs.filter((p) => p.id !== pair.id))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Pair builder */}
            <PairBuilder
              availablePlayers={availableForPairing}
              gender={gender}
              menMembers={menMembers}
              ladiesMembers={ladiesMembers}
              onAddPair={(p1, p2) => {
                setDoublesPairs([...doublesPairs, { id: crypto.randomUUID(), player1Id: p1, player2Id: p2 }]);
              }}
              getMemberName={getMemberName}
            />
          </CardContent>
        </Card>
      )}

      {/* ── STEP: PLAYERS (Doubles — Players Self-Pair) ── */}
      {step === "players" && isDoubles && partnerMode === "players" && !selfPairInviteSelection && (
        <Card>
          <CardHeader>
            <CardTitle>Registered Pairs — {GENDER_LABELS[gender]}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Players choose their own partners during registration. {doublesPairs.length} pair{doublesPairs.length !== 1 ? "s" : ""} confirmed so far.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {doublesPairs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No confirmed pairs yet. Pairs will appear here once players register and accept partner invites.
              </p>
            ) : (
              <div className="space-y-2">
                {doublesPairs.map((pair) => (
                  <div key={pair.id} className="flex items-center gap-2 p-2 rounded bg-muted/50 border">
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1">{getPairLabel(pair)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use the <strong>Registrations</strong> button on the tournament card to manually pair or override entries.
            </p>
          </CardContent>
        </Card>
      )}


      {/* ── STEP: GROUPS ── */}
      {step === "groups" && (
        <Card>
          <CardHeader><CardTitle>Number of Leagues</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Divide {entityCount} {isDoubles ? "pairs" : "players"} into how many leagues?</Label>
              <Select value={numGroups > 0 ? String(numGroups) : ""} onValueChange={(v) => {
                const n = Number(v);
                setNumGroups(n);
                if (isDoubles) {
                  const newMap = new Map<string, number>();
                  doublesPairs.forEach((p, i) => {
                    const cycle = Math.floor(i / n);
                    const idx = cycle % 2 === 0 ? i % n : n - 1 - (i % n);
                    newMap.set(p.id, idx);
                  });
                  setPairGroupAssignments(newMap);
                } else {
                  const newMap = new Map<string, number>();
                  selectedPlayers.forEach((p, i) => {
                    const cycle = Math.floor(i / n);
                    const idx = cycle % 2 === 0 ? i % n : n - 1 - (i % n);
                    newMap.set(p.id, idx);
                  });
                  setGroupAssignments(newMap);
                }
              }}>
                <SelectTrigger className="w-32 mt-1"><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                  {Array.from({ length: Math.floor(entityCount / 2) }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} league{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              {isDoubles ? "Pairs" : "Players"} are auto-distributed by order. Drag a row into another league to move it, drag within a league to reorder, or use the dropdown.
              {!isDoubles && handicapMode === "league_rank" && (
                <> <span className="text-primary font-medium">Sort strongest → weakest — this order determines handicaps</span> (top of League 1 = strongest, bottom of the last league = weakest). Subs slot in wherever you drop them.</>
              )}
            </p>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCrossLeagueDragEnd}>
              <div className="space-y-4">
                {isDoubles ? (
                  (groups as DoublePair[][]).map((g, gi) => (
                    <DroppableLeague key={gi} id={`league-${gi}`} className="border rounded-lg p-3 min-h-[60px] transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium">League</span>
                        <Input
                          value={groupLabels[String(gi + 1)] ?? ""}
                          placeholder={String(gi + 1)}
                          onChange={(e) => setGroupLabels((p) => ({ ...p, [String(gi + 1)]: e.target.value }))}
                          className="h-7 w-20 text-sm"
                        />
                        <span className="text-muted-foreground text-xs">({g.length} pairs)</span>
                      </div>
                      <SortableContext items={g.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {g.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic py-2">Drop pairs here</p>
                          )}
                          {g.map((pair) => (
                            <SortableRow key={pair.id} id={pair.id}>
                              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1 text-sm font-medium">{getPairLabel(pair)}</span>
                              <Select
                                value={String(pairGroupAssignments.get(pair.id) ?? 0)}
                                onValueChange={(v) => {
                                  const newMap = new Map(pairGroupAssignments);
                                  newMap.set(pair.id, Number(v));
                                  setPairGroupAssignments(newMap);
                                }}
                              >
                                <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: numGroups }, (_, i) => (
                                    <SelectItem key={i} value={String(i)}>{groupLabels[String(i + 1)]?.trim() ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)]) ? groupLabels[String(i + 1)] : `League ${groupLabels[String(i + 1)]}`) : `League ${i + 1}`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </SortableRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DroppableLeague>
                  ))
                ) : (
                  (groups as ClubMember[][]).map((g, gi) => (
                    <DroppableLeague key={gi} id={`league-${gi}`} className="border rounded-lg p-3 min-h-[60px] transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium">League</span>
                        <Input
                          value={groupLabels[String(gi + 1)] ?? ""}
                          placeholder={String(gi + 1)}
                          onChange={(e) => setGroupLabels((p) => ({ ...p, [String(gi + 1)]: e.target.value }))}
                          className="h-7 w-20 text-sm"
                        />
                        <span className="text-muted-foreground text-xs">({g.length} players)</span>
                      </div>
                      <SortableContext items={g.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {g.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic py-2">Drop players here</p>
                          )}
                          {g.map((p) => (
                            <SortableRow key={p.id} id={p.id}>
                              <span className="flex-1 text-sm font-medium">{p.name || p.profiles?.name}</span>
                              {p.ladder_position && <Badge variant="secondary" className="text-[10px]">#{p.ladder_position}</Badge>}
                              <Select
                                value={String(groupAssignments.get(p.id) ?? 0)}
                                onValueChange={(v) => {
                                  const newMap = new Map(groupAssignments);
                                  newMap.set(p.id, Number(v));
                                  setGroupAssignments(newMap);
                                }}
                              >
                                <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: numGroups }, (_, i) => (
                                    <SelectItem key={i} value={String(i)}>{groupLabels[String(i + 1)]?.trim() ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)]) ? groupLabels[String(i + 1)] : `League ${groupLabels[String(i + 1)]}`) : `League ${i + 1}`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </SortableRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DroppableLeague>
                  ))
                )}
              </div>
            </DndContext>
          </CardContent>
        </Card>
      )}


      {/* ── STEP: SCHEDULE ── */}
      {step === "schedule" && (
        <Card>
          <CardHeader><CardTitle>Schedule Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Read-only summary — dates, times, play days and courts are set on the Courts step */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <div className="font-medium">
                    {startDate ? format(parseISO(startDate), "dd MMM yyyy") : "—"}
                    {endDate && endDate !== startDate ? ` → ${format(parseISO(endDate), "dd MMM yyyy")}` : ""}
                    {" · "}
                    {startTime || "—"}–{endTime || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Play days: {playDays.size > 0
                      ? Array.from(playDays).sort().map((i) => DAY_NAMES[i]).join(", ")
                      : "—"}
                    {" · Courts: "}
                    {selectedCourtIds.size > 0
                      ? courts.filter((c) => selectedCourtIds.has(c.id)).map((c) => c.name).join(", ")
                      : "—"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setStep("courts")}
                >
                  Edit on Courts step
                </Button>
              </div>
            </div>

            {scoringMode !== "time_capped_points" && (
              <div className="max-w-xs">
                <Label>Match Duration</Label>
                <Select value={matchDuration > 0 ? String(matchDuration) : ""} onValueChange={(v) => setMatchDuration(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__placeholder" disabled>Please select</SelectItem>
                    <SelectItem value="20">20 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Per-day schedule overrides — useful for short tournaments (Fri eve, Sat morning, Sat afternoon). */}
            <div className="rounded-lg border p-3 space-y-3">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={customizeDailySchedule}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setCustomizeDailySchedule(on);
                    if (on && daySchedules.length === 0 && startDate && endDate) {
                      const dates = eachDayOfInterval({
                        start: parseISO(startDate),
                        end: parseISO(endDate),
                      }).filter((d) => playDays.size === 0 || playDays.has(getDay(d)));
                      setDaySchedules(
                        dates.map((d) => ({
                          date: format(d, "yyyy-MM-dd"),
                          start_time: startTime,
                          end_time: endTime,
                          court_ids: null,
                        }))
                      );
                    }
                  }}
                />
                <span>
                  <span className="font-medium">Customize times per day</span>
                  <span className="block text-xs text-muted-foreground">
                    Set different time windows (and optionally specific courts) for each play-day — e.g. Friday evening, Saturday morning, Saturday afternoon.
                  </span>
                </span>
              </label>

              {customizeDailySchedule && (
                <div className="space-y-2">
                  {daySchedules.length === 0 && (
                    <p className="text-xs text-muted-foreground">Pick dates and play days above, then add a window.</p>
                  )}
                  {daySchedules.map((d, idx) => {
                    const allCourts = d.court_ids === null;
                    return (
                      <div key={idx} className="rounded border p-2 bg-muted/20 space-y-2">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={d.date}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, date: v } : x));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Start</Label>
                            <Input
                              type="time"
                              value={d.start_time}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, start_time: v } : x));
                              }}
                              className="h-8 text-sm w-28"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">End</Label>
                            <Input
                              type="time"
                              value={d.end_time}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDaySchedules((prev) => prev.map((x, i) => i === idx ? { ...x, end_time: v } : x));
                              }}
                              className="h-8 text-sm w-28"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => setDaySchedules((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </Button>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Checkbox
                              checked={allCourts}
                              onCheckedChange={(v) => {
                                setDaySchedules((prev) => prev.map((x, i) =>
                                  i === idx
                                    ? { ...x, court_ids: v ? null : Array.from(selectedCourtIds) }
                                    : x
                                ));
                              }}
                            />
                            <span className="text-xs">All selected courts</span>
                          </div>
                          {!allCourts && (
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(selectedCourtIds).map((cid) => {
                                const active = d.court_ids?.includes(cid);
                                return (
                                  <button
                                    key={cid}
                                    type="button"
                                    onClick={() => {
                                      setDaySchedules((prev) => prev.map((x, i) => {
                                        if (i !== idx) return x;
                                        const cur = x.court_ids ?? [];
                                        const next = cur.includes(cid)
                                          ? cur.filter((c) => c !== cid)
                                          : [...cur, cid];
                                        return { ...x, court_ids: next };
                                      }));
                                    }}
                                    className={`px-2 py-0.5 rounded text-xs border ${
                                      active
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background hover:bg-muted border-border"
                                    }`}
                                  >
                                    Court {cid}
                                  </button>
                                );
                              })}
                              {selectedCourtIds.size === 0 && (
                                <span className="text-xs text-muted-foreground">Select courts in the next step first.</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = daySchedules[daySchedules.length - 1];
                      setDaySchedules((prev) => [
                        ...prev,
                        {
                          date: last?.date || startDate || format(new Date(), "yyyy-MM-dd"),
                          start_time: startTime,
                          end_time: endTime,
                          court_ids: null,
                        },
                      ]);
                    }}
                  >
                    + Add time window
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Add the same date more than once to create multiple sessions (e.g. Saturday 09:00–12:00 and Saturday 14:00–17:00). When customized, the global Start/End times above are ignored by the scheduler.
                  </p>
                </div>
              )}
            </div>

            {scoringMode === "time_capped_points" && numGroups > 0 && (
              <div className="rounded-lg border p-3 bg-muted/30 space-y-3">

                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Label className="text-sm font-medium">
                      {roundFormat === "cross_league" ? "Slot & bell timing" : "Slot & bell timing per league"}
                    </Label>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-[11px] text-muted-foreground">Default break (min)</span>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={defaultBreakMinutes || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setDefaultBreakMinutes(v === "" ? 0 : Math.max(0, Number(v)));
                        }}
                        className="h-8 text-sm w-20"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {(roundFormat === "cross_league"
                      ? [1]
                      : Array.from({ length: numGroups }, (_, i) => i + 1)
                    ).map((gn) => {

                      const slot = Number(groupDurations[String(gn)]) || matchDuration;
                      const brkRaw = groupBreakMinutes[String(gn)];
                      const brk = brkRaw === undefined || brkRaw === null || Number.isNaN(Number(brkRaw))
                        ? defaultBreakMinutes
                        : Number(brkRaw);
                      const bell = Math.max(1, slot - brk);
                      const isAllLeagues = roundFormat === "cross_league";
                      const applyGroups = isAllLeagues
                        ? Array.from({ length: numGroups }, (_, i) => i + 1)
                        : [gn];
                      return (
                        <div key={gn} className="flex items-center gap-2 p-1.5 rounded border bg-muted/30 sm:col-span-2">
                          <span className="text-xs font-medium w-20 shrink-0">{isAllLeagues ? "All leagues" : `League ${gn}`}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={5}
                              max={120}
                              placeholder={String(matchDuration)}
                              value={groupDurations[String(gn)] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGroupDurations((prev) => {
                                  const next = { ...prev };
                                  applyGroups.forEach((g) => {
                                    if (v === "") delete next[String(g)];
                                    else next[String(g)] = Math.max(1, Number(v));
                                  });
                                  return next;
                                });
                              }}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-[10px] text-muted-foreground">slot</span>
                          </div>
                          <span className="text-muted-foreground text-xs">−</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={30}
                              step={0.5}
                              placeholder={String(defaultBreakMinutes || 0)}
                              value={groupBreakMinutes[String(gn)] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setGroupBreakMinutes((prev) => {
                                  const next = { ...prev };
                                  applyGroups.forEach((g) => {
                                    if (v === "") delete next[String(g)];
                                    else next[String(g)] = Math.max(0, Number(v));
                                  });
                                  return next;
                                });
                              }}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-[10px] text-muted-foreground">break</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                            bell @ <strong>{bell}</strong> min
                          </span>
                        </div>
                      );

                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Slot = how often games kick off on a court. Break = changeover time built into each slot — the bell rings at <em>slot − break</em>, leaving players time to swap on. Leave blank to use the defaults.
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowCapacity((v) => !v)}
                    >
                      {showCapacity ? "Hide capacity" : "Calculate capacity"}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      How many games &amp; player slots fit in the selected time, given courts and per-league slot.
                    </span>
                  </div>

                  {showCapacity && (() => {
                    const parseHM = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
                    type CapSession = { date: string; minutes: number; courts: number };
                    let capSessions: CapSession[] = [];
                    if (customizeDailySchedule && daySchedules.length > 0) {
                      capSessions = daySchedules
                        .map((d) => {
                          const cs = (d.court_ids && d.court_ids.length > 0
                            ? d.court_ids.filter((id) => selectedCourtIds.has(id))
                            : Array.from(selectedCourtIds));
                          return { date: d.date, minutes: parseHM(d.end_time) - parseHM(d.start_time), courts: cs.length };
                        })
                        .filter((s) => s.minutes > 0 && s.courts > 0);
                    } else if (startDate && endDate && playDays.size > 0 && selectedCourtIds.size > 0) {
                      const dates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
                        .filter((d) => playDays.has(getDay(d)));
                      const mins = parseHM(endTime) - parseHM(startTime);
                      capSessions = dates.map((d) => ({ date: format(d, "yyyy-MM-dd"), minutes: mins, courts: selectedCourtIds.size }));
                    }
                    const totalCourtMin = capSessions.reduce((a, s) => a + Math.max(0, s.minutes) * s.courts, 0);
                    const tH = Math.floor(totalCourtMin / 60);
                    const tM = totalCourtMin % 60;
                    // Round-robin: G games for N entities = N*(N-1)/2
                    // → max N such that N*(N-1)/2 ≤ G  ⇒  N = floor((1+√(1+8G))/2)
                    const maxEntitiesFor = (G: number) => Math.max(0, Math.floor((1 + Math.sqrt(1 + 8 * G)) / 2));
                    const leagues = Array.from({ length: numGroups }, (_, i) => i + 1);
                    const perLeague = leagues.map((gn) => {
                      const slot = Number(groupDurations[String(gn)]) || matchDuration || 20;
                      const games = capSessions.reduce((a, s) => a + Math.floor(s.minutes / slot) * s.courts, 0);
                      const entities = maxEntitiesFor(games); // players (singles) or pairs (doubles)
                      const gamesUsed = (entities * (entities - 1)) / 2;
                      const players = isDoubles ? entities * 2 : entities;
                      return { gn, slot, games, gamesUsed, entities, players };
                    });
                    const sessionsCount = capSessions.length;
                    const courtsUsed = capSessions.reduce((a, s) => Math.max(a, s.courts), 0);
                    return (
                      <div className="mt-2 rounded-lg border p-3 bg-muted/40 text-xs space-y-2">
                        <div className="font-medium text-sm">Capacity ({isDoubles ? "doubles" : "singles"}, round-robin)</div>
                        <div className="text-muted-foreground">
                          {sessionsCount} session{sessionsCount === 1 ? "" : "s"} · up to {courtsUsed} court{courtsUsed === 1 ? "" : "s"} · {tH}h {tM}m total court-time
                        </div>
                        {perLeague.length === 0 ? (
                          <div className="text-muted-foreground italic">Pick a number of leagues to see per-league capacity.</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {perLeague.map(({ gn, slot, games, gamesUsed, entities, players }) => (
                              <div key={gn} className="flex flex-col gap-0.5 p-1.5 rounded border bg-background">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium w-16">League {gn}</span>
                                  <span className="text-muted-foreground">{slot} min/slot</span>
                                  <span className="ml-auto">
                                    up to <strong>{players}</strong> players
                                    {isDoubles && <> (<strong>{entities}</strong> pairs)</>}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground pl-[4.5rem]">
                                  fits {games} game{games === 1 ? "" : "s"} · {gamesUsed} used for full round-robin
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          Round-robin: each {isDoubles ? "pair" : "player"} plays every other once ({isDoubles ? "P·(P−1)/2" : "N·(N−1)/2"} games). Per-league figures assume that league has access to all selected courts for the full duration.
                        </div>
                      </div>
                    );
                  })()}





                  <div className="mt-3">
                    <Label className="text-sm font-medium">Rotate courts every (minutes)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={5}
                        max={240}
                        step={5}
                        placeholder="Off — teams stay on their court"
                        value={courtRotationMinutes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setCourtRotationMinutes(v === "" ? null : Math.max(1, Number(v)));
                        }}
                        className="h-8 text-sm max-w-[220px]"
                      />
                      {courtRotationMinutes != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setCourtRotationMinutes(null)}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Teams rotate between this league's allocated courts at every interval (e.g. 30 = shift courts every 30 minutes). Leave blank to keep courts fixed per round.
                    </p>
                  </div>
                </div>
              </div>
            )}






            {schedulePreview && (
              <div className="p-3 rounded bg-muted text-sm space-y-1">
                <p>📊 <strong>{schedulePreview.totalMatches}</strong> matches to schedule</p>
                <p>📅 <strong>{schedulePreview.allDates.length}</strong> play days available</p>
                <p>🏟️ <strong>{schedulePreview.totalSlots}</strong> total slots</p>
                {schedulePreview.totalSlots < schedulePreview.totalMatches && (
                  <p className="text-destructive font-medium">⚠️ Not enough slots! Add more days, courts, or extend the time range.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP: REVIEW ── */}
      {step === "review" && (
        <Card>
          <CardHeader><CardTitle>Review & Generate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p><strong>Name:</strong> {champName || `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Club Champs ${new Date().getFullYear()}`}</p>
              <p><strong>Type:</strong> {GENDER_LABELS[gender]} {isDoubles ? "Doubles" : "Singles"}</p>
          <p><strong>{isDoubles ? "Pairs" : "Players"}:</strong> {awaitingPlayerPairs ? `${registrationUsesInviteList ? selectedPlayerIds.size : registrationRequired ? "Open" : "No"} registrations before scheduling` : `${entityCount} in ${numGroups} league${numGroups > 1 ? "s" : ""}`}</p>
              <p><strong>Period:</strong> {startDate} to {endDate}</p>
              <p><strong>Days:</strong> {Array.from(playDays).sort().map((d) => DAY_NAMES[d]).join(", ")}</p>
              <p><strong>Time:</strong> {startTime} – {endTime}{scoringMode === "time_capped_points" ? "" : ` (${matchDuration} min per match)`}</p>
              <p><strong>Courts:</strong> {Array.from(selectedCourtIds).map((id) => getCourtName(id)).join(", ")}</p>
              <p><strong>Format:</strong> {roundFormat === "double_round_robin" ? "Double round-robin (home & away)" : roundFormat === "cross_league" ? "League vs League (cross-league only)" : "Single round-robin"}{roundFormat === "double_round_robin" ? ` · Bye: ${byeHandling.replace(/_/g, " ")}` : ""}</p>
              <p><strong>Playoffs:</strong> {enablePlayoffs ? "Yes — position-based knockout after group stage" : "No"}</p>
            </div>

            <Separator />

            {awaitingPlayerPairs && (
              <p className="text-sm text-muted-foreground rounded-lg border p-3">
                Save this tournament now. Once players have registered and confirmed partners, reopen it to generate groups and fixtures.
              </p>
            )}

            {!awaitingPlayerPairs && editingChampId && (
              <p className="text-xs text-muted-foreground rounded-lg border p-2 bg-muted/30">
                <strong>Rebuild Schedule</strong> recreates the fixture list and tournament page entries using the leagues/pairs shown above — it does <em>not</em> change who's paired with whom or which league they're in. Court bookings are written separately via <strong>Make Court Bookings</strong>.
              </p>
            )}

            {entitiesChangedSinceLoad && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-semibold">⚠ Players changed since this tournament was opened</p>
                <p className="text-xs mt-0.5">
                  Click <strong>Rebuild Schedule</strong> below to regenerate fixtures and recompute handicaps for the updated player list. Existing completed matches are preserved.
                </p>
              </div>
            )}

            {!awaitingPlayerPairs && schedulePreview && (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {Array.from({ length: numGroups }, (_, gi) => {
                  const groupMatches = schedulePreview.allMatches.filter((m) => m.groupNum === gi + 1);
                  return (
                    <div key={gi}>
                      <h4 className="font-medium mb-2">League {gi + 1}</h4>
                      <div className="text-xs space-y-1">
                        {groupMatches.map((m, mi) => (
                          <div key={mi} className="flex items-center gap-2 p-1.5 rounded bg-muted/50">
                            <span className="text-muted-foreground w-20">{m.date ? format(new Date(m.date), "EEE dd MMM") : "TBD"}</span>
                            <span className="text-muted-foreground w-12">{m.time || "TBD"}</span>
                            <span className="font-medium">{getEntityLabel(m.entityA)}</span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="font-medium">{getEntityLabel(m.entityB)}</span>
                            {m.courtId && <Badge variant="outline" className="ml-auto text-[10px]">{getCourtName(m.courtId)}</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!awaitingPlayerPairs && schedulePreview && (
              <>
                <Separator />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3 bg-muted/30">
                  <div className="text-sm">
                    <p className="font-medium">Make court bookings</p>
                    <p className="text-xs text-muted-foreground">
                      Reserve each scheduled match on its assigned court. Already-booked slots are skipped.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => createBookings.mutate()}
                    disabled={createBookings.isPending || !editingChampId}
                  >
                    {createBookings.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CalendarIcon className="w-4 h-4 mr-1" /> Make Court Bookings
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inline validation hint — lists missing required fields for the current step. */}
      {(() => {
        const missing = step === "review" ? [] : missingForStep();
        if (missing.length === 0) return null;
        return (
          <div className="rounded-md border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Complete these before continuing:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {missing.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        );
      })()}

      {/* Navigation */}
      <div className="flex justify-between items-center gap-2">
        <Button variant="outline" onClick={() => { if (stepIdx === 0) { setShowWizard(false); } else { setStep(activeSteps[stepIdx - 1]); void saveDraft(); } }}>
          <ChevronLeft className="w-4 h-4 mr-1" /> {stepIdx === 0 ? "Cancel" : "Back"}
        </Button>
        <Button variant="secondary" onClick={() => void handleManualSave()}>
          <Save className="w-4 h-4 mr-1" /> Save Progress
        </Button>
        {step === "review" ? (
          <Button onClick={() => createChamp.mutate()} disabled={createChamp.isPending}>
            {createChamp.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {awaitingPlayerPairs ? "Save Tournament" : editingChampId ? "Rebuild Schedule" : "Generate Schedule"}
          </Button>
        ) : (
          <Button
            onClick={() => goToStep(activeSteps[stepIdx + 1])}
            disabled={!canProceed()}
            title={canProceed() ? undefined : `Complete: ${missingForStep().join(", ")}`}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>



      {/* Invite preview dialog — shows in-app notification + email side by side */}
      <InvitePreviewDialog
        open={showInvitePreview}
        onOpenChange={setShowInvitePreview}
        tournamentName={champName || `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Club Champs ${new Date().getFullYear()}`}
        description={description}
        methods={inviteMethods}
        gender={gender}
        matchType={matchType}
        scoringMode={scoringMode}
        roundFormat={roundFormat}
        byeHandling={byeHandling}
        partnerMode={partnerMode}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        customizeDailySchedule={customizeDailySchedule}
        daySchedules={daySchedules}
        registrationOpensAt={registrationOpensAt}
        registrationClosesAt={registrationClosesAt}
        entryFeeRand={entryFeeRand}
        pointsPerGame={pointsPerGame}
        bestOf={bestOf}
        registrationRequired={registrationRequired}
        registrationMode={registrationMode}
      />

      <ShadowRankPromptDialog
        open={shadowPrompt.open}
        onOpenChange={(o) => {
          if (!o) {
            shadowPrompt.reject?.(new Error("Shadow-rank prompt cancelled"));
            setShadowPrompt({ open: false, missing: [], sizes: {}, resolve: null, reject: null });
          }
        }}
        missing={shadowPrompt.missing}
        sizes={shadowPrompt.sizes}
        memberNames={new Map(allSelectablePlayers.map((m: any) => [m.id, m.name || "Reserve"]))}
        onSaved={() => {
          shadowPrompt.resolve?.();
          setShadowPrompt({ open: false, missing: [], sizes: {}, resolve: null, reject: null });
        }}
      />

    </div>
  );
}

// ── Pair Builder sub-component ──
function PairBuilder({
  availablePlayers,
  gender,
  menMembers,
  ladiesMembers,
  onAddPair,
  getMemberName,
}: {
  availablePlayers: ClubMember[];
  gender: GenderCategory;
  menMembers: ClubMember[];
  ladiesMembers: ClubMember[];
  onAddPair: (p1: string, p2: string) => void;
  getMemberName: (id: string) => string;
}) {
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");

  // For mixed doubles, show men for P1 and ladies for P2
  const isMixed = gender === "mixed";

  const pool1 = isMixed
    ? availablePlayers.filter((m) => m.gender && ["men", "male", "m"].includes(m.gender.toLowerCase()))
    : availablePlayers;

  const pool2 = isMixed
    ? availablePlayers.filter((m) => m.gender && ["ladies", "female", "f", "women"].includes(m.gender.toLowerCase()))
    : availablePlayers.filter((m) => m.id !== player1);

  const handleAdd = () => {
    if (player1 && player2 && player1 !== player2) {
      onAddPair(player1, player2);
      setPlayer1("");
      setPlayer2("");
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Add a pair</Label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{isMixed ? "Player (Men)" : "Player 1"}</Label>
          <Select value={player1} onValueChange={setPlayer1}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {pool1.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name || m.profiles?.name || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{isMixed ? "Player (Ladies)" : "Player 2"}</Label>
          <Select value={player2} onValueChange={setPlayer2}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {pool2.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name || m.profiles?.name || "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleAdd}
        disabled={!player1 || !player2 || player1 === player2}
      >
        <Plus className="w-4 h-4 mr-1" /> Add Pair
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Invite preview — shows what the in-app notification and the
// email invitation will look like before the tournament is saved.
// ─────────────────────────────────────────────────────────────
function InvitePreviewDialog({
  open,
  onOpenChange,
  tournamentName,
  description,
  methods,
  gender,
  matchType,
  scoringMode,
  roundFormat,
  byeHandling,
  partnerMode,
  startDate,
  endDate,
  startTime,
  endTime,
  customizeDailySchedule,
  daySchedules,
  registrationOpensAt,
  registrationClosesAt,
  entryFeeRand,
  pointsPerGame,
  bestOf,
  registrationRequired,
  registrationMode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentName: string;
  description: string;
  methods: Set<"app" | "email">;
  gender: GenderCategory;
  matchType: "singles" | "doubles";
  scoringMode: string;
  roundFormat: "" | "single_round_robin" | "double_round_robin" | "cross_league";
  byeHandling: "" | "no_match" | "walkover_win" | "neutral";
  partnerMode: "" | "admin" | "players";
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  customizeDailySchedule?: boolean;
  daySchedules?: { date: string; start_time: string; end_time: string }[];
  registrationOpensAt: string;
  registrationClosesAt: string;
  entryFeeRand: string;
  pointsPerGame: number;
  bestOf: number;
  registrationRequired?: boolean;
  registrationMode?: "" | "open" | "invite";
}) {
  const descHasDetails = /— Tournament details —/.test(description || "");
  const detailLines = descHasDetails ? [] : buildInviteDetailLines({
    gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
    startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
    registrationOpensAt, registrationClosesAt, entryFeeRand,
    pointsPerGame, bestOf,
    registrationRequired, registrationMode,
  });

  const appBody =
    `You have been invited to ${tournamentName}.` +
    (detailLines.length ? `\n\n${detailLines.map((l) => `• ${l}`).join("\n")}` : "") +
    (description?.trim() ? `\n\n${description.trim()}` : "");



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invite preview</DialogTitle>
          <p className="text-xs text-muted-foreground">
            How invited members will see this tournament. Delivery: {Array.from(methods).join(" + ") || "app"}.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* In-app notification preview */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Trophy className="w-3.5 h-3.5" /> In-app notification
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-sm font-semibold">Tournament invitation</p>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1">{appBody}</p>
              <div className="flex gap-2 mt-3">
                <span className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">Register</span>
                <span className="text-xs px-2 py-1 rounded border">Decline</span>
              </div>
            </div>
            {!methods.has("app") && (
              <p className="text-[11px] text-muted-foreground italic">
                Not sent in-app — email only is selected.
              </p>
            )}
          </div>

          {/* Email preview */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <CalendarIcon className="w-3.5 h-3.5" /> Email invitation
            </div>
            <div className="rounded-md border bg-background p-3 text-sm space-y-2">
              <p className="text-xs text-muted-foreground">Subject</p>
              <p className="font-semibold">You're invited: {tournamentName}</p>
              <Separator />
              <p>Hi there,</p>
              <p>You've been invited to take part in <strong>{tournamentName}</strong>.</p>
              {detailLines.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                  {detailLines.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}


              {description?.trim() && (
                <div className="text-sm whitespace-pre-wrap border-l-2 border-primary/40 pl-3 text-muted-foreground">
                  {description.trim()}
                </div>
              )}
              <p>Tap the button below to register or decline.</p>
              <span className="inline-block text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground">
                Open invitation
              </span>
            </div>
            {!methods.has("email") && (
              <p className="text-[11px] text-muted-foreground italic">
                Not sent by email — in-app only is selected.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
