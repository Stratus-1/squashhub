import { CompetitionRankingCard } from "./CompetitionRankingCard";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { buildInviteTestUrl, buildInviteUrl } from "@/lib/tournaments/invite-link";
import { inviteConfirmSummary, resolveInviteRecipients, type InviteSendMode, type ResolveResult } from "@/lib/tournaments/invite-recipients";
import {
  audienceLabel,
  audienceModesForScope,
  filterVisitorRecipients,
  resolveInviteAudience,
  type InviteAudienceMode,
} from "@/lib/tournaments/invite-audience";
import { fetchScopeMemberIds, fetchScopeTree } from "@/lib/tournaments/invite-scope-tree";
import { InviteScopeTree } from "@/components/tournaments/InviteScopeTree";

import {
  fetchInviteDirectory,
  groupByClub,
  directoryScopeLabel,
  type DirectoryPlayer,
} from "@/lib/tournaments/invite-directory";
import { sanitizeDraftPayload, sanitizeExtrasPayload } from "@/lib/tournaments/draft-payload";
import {
  classifyEntrant,
  countEntrantsByCategory,
  ENTRANT_CATEGORY_LABEL,
  filterParticipatingEntrants,
} from "@/lib/tournaments/entrant-status";
import {
  defaultForfeitRule,
  describeForfeitRule,
  forfeitOptionsForScoring,
  pointsForLeague as forfeitPointsFor,
  ruleForLeague as forfeitRuleFor,
  type ForfeitPoints,
  type ForfeitPointsMap,
  type ForfeitRule,
  type ForfeitRuleMap,
} from "@/lib/tournaments/forfeit";
import { buildLeagueFirstRound, suggestSectionCount } from "@/lib/tournaments/knockout";
import {
  describeGraduated,
  graduatedPlayInMatches,
  isDrawStyle,
  type DrawStyle,
} from "@/lib/tournaments/graduated";
import { ConfirmDrawDialog } from "@/components/tournaments/ConfirmDrawDialog";
import {
  drawToMatchRows,
  reconcileBoardWithEntrants,
  suggestDrawBoard,
  type DrawBoard as DrawBoardModel,
  type DrawEntrant,
} from "@/lib/tournaments/draw-board";
import {
  DEFAULT_DIVISION_SOURCE,
  allocateEntrantsToDivisions,
  constrainIds,
  describeDivisionSource,
  divisionEligibleIds,
  divisionSource,
  effectivePools,
  explainIneligibleAssignments,
  findIneligibleAssignments,
  formatUsesPools,
  mergeLegacySectionsIntoPools,
  parseDivisionSources,
  resolveDivisionSources,
  planAllLeaguesExpansion,
  poolLabel,
  poolLabelFor,
  poolNoun,
  poolSelectorLabel,
  poolOptions,
  sectionsFromPools,
  validateDivisions,
  type DivisionSource,
  type EligibilityContext,
} from "@/lib/tournaments/divisions";
import { applyDivisionOrder, isUnranked, seedPreview, sortDivisionEntrants } from "@/lib/tournaments/seeding";
import { distributeIntoPools, flattenPools, moveVisual, normalisePoolAllocation, poolBlocks, poolCounts, poolLetter, type PoolAllocationMode } from "@/lib/tournaments/pools";
import {
  collectProtectedSchedules,
  orphanedScheduleMessage,
  reconcileProtectedSchedules,
  resultCarryOver,
} from "@/lib/tournaments/preserve-schedules";
import { describeRebuildImpact, type RebuildImpactRow } from "@/lib/tournaments/rebuild-guard";


import { describeSectionSizes, totalByes } from "@/lib/tournaments/knockout-sections";
import { allTreeLeagueIds, buildLeagueTree, filterTreeBySeason } from "@/lib/tournaments/league-tree";
import {
  resolveLeagueSeasonLevels,
  seasonsPresent,
  pickSeasonForYear,
  isSeasonFallback,
  ordinalFromName,
  type FixtureEvidence,
} from "@/lib/leagues/season-level";
import { LeagueSourceTree } from "./tournament/LeagueSourceTree";


import { applyHandicapsToChamp, findReservesMissingShadowRank, buildScoreMapFromGroups, isCrossLeagueTournament, type MissingShadowRank, type DivisionSizes } from "@/lib/tournament-formats/handicap";
import { ShadowRankPromptDialog } from "./ShadowRankPromptDialog";
import { ChampSchedulePreview } from "./ChampSchedulePreview";
import { DrawLockCard } from "@/components/tournaments/DrawLockCard";
import { TournamentProgressCard } from "@/components/tournaments/TournamentProgressCard";
import { DEFAULT_CHAMPION_SCOPE, type ChampionScope } from "@/lib/tournaments/round-control";
import { TournamentNextActionBar } from "@/components/tournaments/TournamentNextActionBar";
import { TournamentEntryCounts } from "@/components/tournaments/TournamentEntryCounts";
import { countAllocatedEntries } from "@/lib/tournaments/entry-counts";



import { useClubMembers, useIsSuperAdmin, useMyClubMember, type ClubMember } from "@/hooks/use-club";
import { useWhatsAppEnabled } from "@/hooks/use-whatsapp-enabled";
import { sendWhatsApp } from "@/lib/whatsapp-send";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Users, Trophy, ChevronRight, ChevronLeft, Loader2, Trash2, Eye, Pencil, Plus, X, GripVertical, Save, Copy, Check, ChevronDown, Send } from "lucide-react";


import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, eachDayOfInterval, getDay, parseISO } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { WizardSection } from "@/components/club-admin/tournament/WizardSection";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TournamentRegistrationsDialog } from "./TournamentRegistrationsDialog";
import { TournamentBulkImportDialog } from "./TournamentBulkImportDialog";
import { Users as UsersIcon, ShieldCheck, RefreshCw, Shuffle } from "lucide-react";
import { TournamentGovernanceDialog } from "@/components/tournaments/TournamentGovernanceDialog";
import { useTournamentGovernance } from "@/hooks/use-tournaments";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { playoffMatchesForBracket, buildPlayoffPlaceholders, countPlayoffPlaceholders } from "@/lib/tournament-playoffs";
import { CapacityCheck } from "@/components/club-admin/tournament/CapacityCheck";
import {
  type RoundDeadline,
  parseRoundDeadlines,
  serializeRoundDeadlines,
  deadlineForRound,
  defaultRoundLabel,
  lastDeadline,
  roundDeadlineLines,
  roundDeadlineSummary,
} from "@/lib/tournaments/round-deadlines";
import { SelfScheduledRounds } from "@/components/club-admin/tournament/SelfScheduledRounds";
import {
  isSelfScheduledKnockout,
  roundProgress as computeRoundProgress,
  knockoutRoundCount,
  currentRoundNumber,
  roundIsClubScheduled,
  type RoundMatchRow,
} from "@/lib/tournaments/self-scheduled-rounds";
import { useTournamentEligibility, useOrgHierarchyLite } from "@/hooks/use-tournament-eligibility";
import { owningAssociation } from "@/lib/tournaments/eligibility";
import { DoublesPairsPanel } from "@/components/club-admin/DoublesPairsPanel";
import { z } from "zod";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime/local-input";

interface ClubChampsTabProps {
  /** Primary host club — its courts are the default venue and new events are filed under it. */
  clubId: string;
  /**
   * Owning body of the events managed here. Omitted at club level (the club's own
   * organisation is used). Set for association / federation tournament planning.
   */
  ownerOrgId?: string | null;
  /** Who is running the event. Drives the entrant pool and which governance fields matter. */
  scope?: "club" | "association" | "federation";
  /** Extra clubs (besides clubId) whose members and courts may be used. */
  participatingClubIds?: string[];
}

/**
 * Tournament categories — WHAT kind of competition this is. Deliberately free
 * of eligibility ("closed"/"open"/"invitational") and ranking status: those are
 * separate fields (Who may enter, invitation-only registration, ranking toggle,
 * sanctioning authority) so any category can be combined with any of them —
 * e.g. a club championship that is also a ranking event.
 */
const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "club_championship", label: "Club championship" },
  { value: "league_fixture", label: "League fixture" },
  { value: "league_finals", label: "League finals / play-offs" },
  { value: "open_tournament", label: "Open tournament" },
  { value: "junior", label: "Junior tournament" },
  { value: "masters", label: "Masters tournament" },
  { value: "team_event", label: "Team event / inter-club" },
  { value: "provincial_championship", label: "Provincial championship" },
  { value: "national_championship", label: "National championship" },
];

/**
 * Who may enter — stored on tournament_governance.eligibility_scope.
 * Values are unchanged; only the wording and the resolver behind them.
 * The scope defines the ELIGIBLE POPULATION only, never who is invited.
 */
const ELIGIBILITY_SCOPES: { value: string; label: string; hint: string }[] = [
  { value: "club", label: "Club members", hint: "Only members attached to the host club." },
  {
    value: "association",
    label: "Regional league",
    hint: "Every club that PLAYS IN a regional league this club takes part in — owning it is not required.",
  },
  {
    value: "open",
    label: "National & international",
    hint: "Every club under the federation, including unaffiliated clubs.",
  },
];

/**
 * Association / federation tenants never run "club" events: they have no
 * roster of their own. Drop club-only options and name the association
 * explicitly instead of the generic "Regional league".
 */
function eventTypesFor(scope: "club" | "association" | "federation") {
  if (scope === "club") return EVENT_TYPES;
  return EVENT_TYPES.filter((t) => t.value !== "club_championship");
}

function eligibilityScopesFor(
  scope: "club" | "association" | "federation",
  associationName?: string | null
) {
  const named = ELIGIBILITY_SCOPES.map((s) =>
    s.value === "association" && associationName
      ? { ...s, label: associationName, hint: `Every club affiliated to ${associationName}.` }
      : s
  );
  if (scope === "club") return named;
  return named.filter((s) => s.value !== "club");
}



/**
 * Legacy `event_type` values mixed category with eligibility/ranking. Map the
 * old ones onto a real category so existing tournaments keep working.
 */
const LEGACY_EVENT_TYPES: Record<string, string> = {
  closed: "club_championship",
  invitational: "club_championship",
  ranking: "open_tournament",
  open: "open_tournament",
};

function normaliseEventType(value: string | null | undefined, scope: string): string {
  if (!value) return scope === "club" ? "club_championship" : "open_tournament";
  if (EVENT_TYPES.some((t) => t.value === value)) return value;
  return LEGACY_EVENT_TYPES[value] || (scope === "club" ? "club_championship" : "open_tournament");
}



type WizardStep = "category" | "courts" | "structure" | "registration" | "invites" | "players" | "groups" | "schedule" | "review" | "preview";
type GenderCategory = "men" | "ladies" | "mixed" | "open";
type MatchType = "singles" | "doubles";

// Step ids are intentionally unchanged (drafts, deep links and shortcuts rely
// on them) — only the order and the human labels were reworked.
// Invites come after Dates & Courts so the message can quote real dates/venues.
const STEPS: WizardStep[] = ["category", "structure", "registration", "courts", "invites", "players", "groups", "schedule", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  category: "Basics",
  courts: "Dates & Courts",
  structure: "Structure",
  registration: "Entry & fees",
  invites: "Invites & messaging",
  players: "Players",
  groups: "Allocate players",
  schedule: "Schedule",
  review: "Review & Generate",
  preview: "Preview Schedule",
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
  roundFormat: "" | "single_round_robin" | "double_round_robin" | "cross_league" | "swiss";
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
  /** Tournament name — shown as the first detail line when provided. */
  tournamentName?: string;
  /**
   * Effective draw format of every competition division. Drives the
   * "Draw format" line so a knockout tournament never claims to be a
   * round-robin. Falls back to `roundFormat` when omitted.
   */
  divisionFormats?: string[];
  /** Self-scheduled tournaments: per-round "must be played by" deadlines. */
  selfScheduled?: boolean;
  roundDeadlines?: { label: string; date: string }[];
}): string[] {
  const lines: string[] = [];
  const isDoubles = opts.matchType === "doubles";
  if (opts.tournamentName?.trim()) lines.push(`Tournament: ${opts.tournamentName.trim()}`);
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

  const FORMAT_LABELS: Record<string, string> = {
    single_round_robin: "Single round-robin (each plays once)",
    double_round_robin: "Double round-robin (home & away)",
    swiss: "Swiss rounds (paired on results)",
    cross_league: "Cross-league (leagues play each other)",
    knockout: "Knockout (single elimination)",
  };
  const formats = Array.from(
    new Set((opts.divisionFormats?.length ? opts.divisionFormats : [opts.roundFormat]).filter(Boolean))
  );
  const effective = formats.length ? formats : ["single_round_robin"];
  lines.push(
    `Draw format: ${effective.map((f) => FORMAT_LABELS[f] || f).join(" · ")}`
  );

  // Byes only mean something where every entrant is scheduled against the
  // field — a knockout-only draw has no bye scoring rule to report.
  if (effective.some((f) => f !== "knockout")) {
    const byeLabel =
      opts.byeHandling === "walkover_win"
        ? "Walkover win — full points"
        : opts.byeHandling === "neutral"
        ? "Neutral — excluded from averages"
        : "No match — bye not recorded";
    lines.push(`Bye handling: ${byeLabel}`);
  }


  if (isDoubles) {
    lines.push(
      `Partner selection: ${opts.partnerMode === "players"
        ? "Players choose their own partner"
        : "Admin pairs all players"}`
    );
  }

  // Self-scheduled: players book their own court, so report deadlines instead
  // of fixture times.
  if (opts.selfScheduled) {
    const deadlines = roundDeadlineLines(opts.roundDeadlines || []);
    if (deadlines.length) {
      lines.push("Scheduling: Players arrange their own games (no courts booked)");
      for (const d of deadlines) lines.push(d);
    }
  }

  const start = formatInviteDate(opts.startDate);
  const end = formatInviteDate(opts.endDate);
  if (start && end) {
    lines.push(start === end ? `Date: ${start}` : `Dates: ${start} → ${end}`);
  } else if (start) {
    lines.push(`Starts: ${start}`);
  }

  // Play times — either per-day windows or a single global window.
  const ds = (!opts.selfScheduled && opts.customizeDailySchedule && opts.daySchedules && opts.daySchedules.length > 0)
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
  } else if (opts.startTime && opts.endTime && !opts.selfScheduled) {
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

/**
 * Admin control to enter ONE player into SEVERAL competition divisions.
 *
 * The division dropdown next to it only MOVES a player (it sets their primary
 * division). This picker adds/removes the ADDITIONAL divisions a player takes
 * part in — the same thing a member can do by ticking several divisions on
 * their invite link, but done by hand when they phone the club.
 */
function ExtraDivisionsPicker({
  playerId,
  primary,
  extras,
  divisionLabels,
  onToggle,
}: {
  playerId: string;
  primary: number;
  extras: Set<number>;
  divisionLabels: string[];
  onToggle: (division: number, checked: boolean) => void;
}) {
  const total = extras.size + 1;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={extras.size > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-7 px-2 text-[11px] shrink-0"
          title="Enter this player in more than one division"
        >
          <Plus className="w-3 h-3 mr-1" />
          {total > 1 ? `${total} divisions` : "Divisions"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        <p className="text-[11px] text-muted-foreground px-1 pb-2">
          Tick every division this player enters. Their main division stays ticked.
        </p>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {divisionLabels.map((label, i) => {
            const isPrimary = i === primary;
            const checked = isPrimary || extras.has(i);
            return (
              <label
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded px-1.5 py-1 text-xs",
                  isPrimary ? "opacity-70" : "cursor-pointer hover:bg-muted"
                )}
              >
                <Checkbox
                  id={`${playerId}-div-${i}`}
                  checked={checked}
                  disabled={isPrimary}
                  onCheckedChange={(v) => onToggle(i, v === true)}
                />
                <span className="flex-1">{label}</span>
                {isPrimary && <span className="text-[10px] text-muted-foreground">main</span>}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact segmented button row — visual replacement for the small dropdowns
 * inside a league card (draw format, category, scoring, par, best-of).
 */
const SEG_ROW_COLORS: Record<string, { label: string; active: string; outline: string }> = {
  violet: {
    label: "text-violet-700 dark:text-violet-300",
    active: "bg-violet-600 text-white hover:bg-violet-700 border-violet-600",
    outline: "border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40",
  },
  blue: {
    label: "text-blue-700 dark:text-blue-300",
    active: "bg-blue-600 text-white hover:bg-blue-700 border-blue-600",
    outline: "border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40",
  },
  green: {
    label: "text-emerald-700 dark:text-emerald-300",
    active: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600",
    outline: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40",
  },
  amber: {
    label: "text-amber-700 dark:text-amber-300",
    active: "bg-amber-500 text-white hover:bg-amber-600 border-amber-500",
    outline: "border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40",
  },
  red: {
    label: "text-rose-700 dark:text-rose-300",
    active: "bg-rose-600 text-white hover:bg-rose-700 border-rose-600",
    outline: "border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40",
  },
  pink: {
    label: "text-pink-700 dark:text-pink-300",
    active: "bg-pink-600 text-white hover:bg-pink-700 border-pink-600",
    outline: "border-pink-300 text-pink-700 hover:bg-pink-50 hover:border-pink-400 dark:border-pink-700 dark:text-pink-300 dark:hover:bg-pink-950/40",
  },
  cyan: {
    label: "text-cyan-700 dark:text-cyan-300",
    active: "bg-cyan-600 text-white hover:bg-cyan-700 border-cyan-600",
    outline: "border-cyan-300 text-cyan-700 hover:bg-cyan-50 hover:border-cyan-400 dark:border-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-950/40",
  },
};
function SegRow({
  label,
  value,
  options,
  onChange,
  color = "violet",
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
  color?: keyof typeof SEG_ROW_COLORS;
}) {
  const c = SEG_ROW_COLORS[color] || SEG_ROW_COLORS.violet;
  return (
    <div>
      <Label className={cn("text-[10px] uppercase tracking-wider font-semibold", c.label)}>{label}</Label>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.v}
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-8 px-3 text-xs flex-1 min-w-[84px] transition-colors",
              value === o.v ? c.active : c.outline
            )}
            onClick={() => onChange(o.v)}
          >
            {o.l}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Pulls the human-readable reason out of an edge-function error so club email
 * (SMTP) failures are never reported as a generic "non-2xx" message.
 */
async function edgeErrorMessage(error: any, data: any, fallback: string): Promise<string> {
  const fromData = (data as any)?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  try {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    }
  } catch { /* body already consumed or not JSON */ }
  return error?.message || fallback;
}

export function ClubChampsTab({ clubId, ownerOrgId = null, scope = "club", participatingClubIds }: ClubChampsTabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Pull the latest club-ladder positions (and entrant list) on demand — the
  // seed order shown in Allocate is only as fresh as the cached roster.
  const [refreshingRanking, setRefreshingRanking] = useState(false);
  const refreshRanking = async () => {
    setRefreshingRanking(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["club-members"] }),
        qc.invalidateQueries({ queryKey: ["tournament-member-pool"] }),
        qc.invalidateQueries({ queryKey: ["champ-registrations"] }),
        qc.invalidateQueries({ queryKey: ["club-champs-entries"] }),
      ]);
      toast.success("Ranking refreshed", { description: "Seed order now reflects the current club ladder." });
    } finally {
      setRefreshingRanking(false);
    }
  };
  // Clubs whose courts are available to this tournament. At club level this is
  // just the club itself, so behaviour is identical to before.
  const venueClubIds = useMemo(() => {
    const ids = new Set<string>([clubId, ...(participatingClubIds || [])]);
    return Array.from(ids).filter(Boolean);
  }, [clubId, participatingClubIds]);
  const multiClub = venueClubIds.length > 1;

  // Who may enter — governance field, kept here because the eligible player
  // pool is derived from it (club / owning association / whole federation).
  const [eligibilityScope, setEligibilityScope] = useState<string>(scope === "club" ? "club" : "association");
  const eligibility = useTournamentEligibility({ scope: eligibilityScope, clubId, ownerOrgId });

  // Name of the owning association, used to label the eligibility option.
  const { data: orgHierarchy } = useOrgHierarchyLite();
  const associationName = useMemo(() => {
    if (!orgHierarchy) return null;
    return owningAssociation(ownerOrgId, orgHierarchy.orgs, orgHierarchy.rels)?.name ?? null;
  }, [orgHierarchy, ownerOrgId]);

  const eventTypeOptions = useMemo(() => eventTypesFor(scope), [scope]);
  const eligibilityOptions = useMemo(
    () => eligibilityScopesFor(scope, associationName),
    [scope, associationName]
  );

  // Association / federation tenants can never sit on a club-only value.
  useEffect(() => {
    if (scope !== "club" && eligibilityScope === "club") setEligibilityScope("association");
  }, [scope, eligibilityScope]);




  // Player pool = every member of every eligible club (plus host/venue clubs).
  const playerPoolClubIds = useMemo(() => {
    const ids = new Set<string>([...venueClubIds, ...(eligibility?.clubIds || [])]);
    return Array.from(ids).filter(Boolean).sort();
  }, [venueClubIds, eligibility?.clubIds]);
  const widePool = playerPoolClubIds.length > 1;

  const { data: clubMembers = [] } = useClubMembers(clubId);
  const { data: myMember } = useMyClubMember();

  const { data: pooledMembers = [] } = useQuery({
    queryKey: ["tournament-member-pool", playerPoolClubIds],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("*, profiles:user_id(name, email, phone, avatar_url), club:club_id(name)")
        .in("club_id", playerPoolClubIds)
        .order("name");
      if (error) throw error;
      return (data || []) as ClubMember[];
    },
    enabled: widePool,
  });
  const members = widePool ? pooledMembers : clubMembers;
  const whatsappEnabled = useWhatsAppEnabled(clubId);
  const isSuperAdmin = useIsSuperAdmin();


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
    queryKey: ["tournament-courts", venueClubIds],
    queryFn: async () => {
      const { data, error } = await fromExt("courts")
        .select("id, name, is_external, venue_name, club_id, club:club_id(name)")
        .in("club_id", venueClubIds);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        // In multi-venue events the club name is prefixed so courts stay distinguishable.
        name: multiClub ? `${c.club?.name || "Club"} — ${c.name}` : c.name,
      })) as { id: number; name: string; is_external?: boolean | null; venue_name?: string | null; club_id?: string }[];
    },
    enabled: venueClubIds.length > 0,
  });

  const { data: existingChamps = [], isLoading: champsLoading } = useQuery({
    queryKey: ["club-champs", clubId, ownerOrgId],
    queryFn: async () => {
      let q = fromExt("club_champs").select("*");
      q = ownerOrgId ? q.eq("owner_org_id", ownerOrgId) : q.eq("club_id", clubId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  // Fields that live only on the tournaments table (not exposed by the legacy
  // club_champs compatibility view): event type, entry limits, seeding source.
  const champIdsKey = (existingChamps as any[]).map((c: any) => c.id).join(",");
  const { data: tournamentExtras } = useQuery({
    queryKey: ["tournament-extras", champIdsKey],
    queryFn: async () => {
      const ids = (existingChamps as any[]).map((c: any) => c.id);
      if (ids.length === 0) return {} as Record<string, any>;
      const { data, error } = await fromExt("tournaments")
        .select("id, event_type, max_entrants, max_per_league, seeding_source, participating_club_ids, league_genders, league_match_types, league_scoring_modes, league_points_per_game, league_best_of, league_win_conditions, league_play_all_games, league_playoffs, league_bye_handling, league_forfeit_rules, league_forfeit_points, league_sources, league_source_modes")
        .in("id", ids);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.id] = r; });
      return map;
    },
    enabled: !!champIdsKey,
  });


  const [step, setStep] = useState<WizardStep>("category");
  const [showWizard, setShowWizard] = useState(false);
  const [editingChampId, setEditingChampId] = useState<string | null>(null);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);

  // Governance record for the tournament being edited — read-only in the wizard
  // (fee shares and refunds are owned by the Governance dialog).
  const { data: wizardGovernance } = useTournamentGovernance(editingChampId);
  // Snapshot of entities (players / doubles pairs) at the moment an existing
  // tournament was loaded for edit. Used to prompt the admin to rebuild the
  // schedule when players are added / removed / swapped.
  const [entitiesSnapshotAtLoad, setEntitiesSnapshotAtLoad] = useState<string | null>(null);
  const [rebuildToastFiredForSnapshot, setRebuildToastFiredForSnapshot] = useState<string | null>(null);

  // Wizard state
  const [gender, setGender] = useState<GenderCategory>("men");
  const [matchType, setMatchType] = useState<MatchType>("singles");
  // NOTE: `enablePlayoffs` is derived from the per-league playoff settings
  // (see below). Playoffs are edited per league only — there is no separate
  // tournament-level switch any more.
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
  // Scheduling density: "fill" packs games into the earliest days first (finish as
  // quickly as possible); "spread" interleaves across all play-days (default).
  const [scheduleMode, setScheduleMode] = useState<"spread" | "fill">("spread");
  // Playoff scheduling extras:
  //   playoffBreakMinutes — pause between the last pool match and the first playoff match.
  //   playoffDate         — force the playoffs onto a specific date (overrides the break gap).
  const [playoffBreakMinutes, setPlayoffBreakMinutes] = useState<number>(0);
  const [playoffDate, setPlayoffDate] = useState<string>("");
  const [scoringMode, setScoringMode] = useState<"" | "standard" | "time_capped_points" | "swiss">("");
  // Swiss-only config: per-league pools & rounds (keyed by group_number string).
  const [swissPools, setSwissPools] = useState<Record<string, number>>({});
  /** Knockout draw style per division: "straight" (default) or "graduated" (fair entry). */
  const [leagueDrawStyles, setLeagueDrawStyles] = useState<Record<string, DrawStyle>>({});
  // Organiser-owned pool headcounts per division (group_number -> [n per pool]).
  // Written whenever an admin drags an entrant across a pool boundary, so the
  // uneven split they chose survives a reload instead of snapping back.
  const [poolSizeOverrides, setPoolSizeOverrides] = useState<Record<string, number[]>>({});

  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});
  const [swissRounds, setSwissRounds] = useState<Record<string, number>>({});
  
  const [parallelLeagues, setParallelLeagues] = useState(false);
  const [pointsPerGame, setPointsPerGame] = useState<0 | 11 | 15>(0);
  const [bestOf, setBestOf] = useState<0 | 3 | 5>(0);
  const [playAllGames, setPlayAllGames] = useState(false);
  const [winCondition, setWinCondition] = useState<"win_by_2" | "sudden_death">("win_by_2");
  const [groupDurations, setGroupDurations] = useState<Record<string, number>>({});
  const [groupBreakMinutes, setGroupBreakMinutes] = useState<Record<string, number>>({});
  const [groupLabels, setGroupLabels] = useState<Record<string, string>>({});
  // 'club'  — the club books courts and publishes a fixed schedule.
  // 'self'  — players arrange their own games and must play by a deadline.
  const [schedulingMode, setSchedulingMode] = useState<"club" | "self">("club");
  /**
   * Where the ultimate winner is decided when a league runs more than one pool:
   *  - "division": the pool winners meet in a league final — ONE champion per league.
   *  - "pool":     every pool keeps its own winner, no cross-pool decider.
   */
  const [championScope, setChampionScope] = useState<ChampionScope>(DEFAULT_CHAMPION_SCOPE);
  /**
   * How entrants are spread across a division's pools:
   *  - "snake":  serpentine deal — every pool is of even overall strength.
   *  - "banded": strength bands — Pool A the strongest players, Pool B the
   *              next band, Pool C the weakest.
   */
  const [poolAllocation, setPoolAllocation] = useState<PoolAllocationMode>("snake");
  const [roundDeadlines, setRoundDeadlines] = useState<RoundDeadline[]>([]);

  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState<number>(0);
  const [courtRotationMinutes, setCourtRotationMinutes] = useState<number | null>(null);
  // When on, Bells scheduler will not place a player in a back-to-back match:
  // a court sits idle for a slot rather than assigning the only-available
  // (recently-played) pairing. Any matches that don't fit within the session
  // end stay unscheduled — admin gets the standard shortage warning.
  const [avoidBackToBack, setAvoidBackToBack] = useState<boolean>(true);
  const [roundFormat, setRoundFormat] = useState<"" | "single_round_robin" | "double_round_robin" | "cross_league" | "swiss">("");
  // Per-league format overrides (keyed by group_number string). When a league
  // has no entry here, the tournament-wide `roundFormat` applies. Only used
  // when `usePerLeagueFormats` is enabled — hidden while roundFormat is
  // `cross_league` (which is inherently tournament-wide).
  type PerLeagueFormat = "single_round_robin" | "double_round_robin" | "swiss" | "cross_league" | "knockout";
  const [leagueFormats, setLeagueFormats] = useState<Record<string, PerLeagueFormat>>({});
  const [usePerLeagueFormats, setUsePerLeagueFormats] = useState(false);
  // LEGACY: knockout sub-draw count per league ("sections"). The organiser no
  // longer sees this concept — a knockout division is simply split into pools
  // and the pool count is written back here so the draw engine, the schedule
  // and any existing tournament keep working unchanged.
  const [leagueSections, setLeagueSections] = useState<Record<string, number>>({});
  /**
   * THE pool count for a division — the single organiser-facing value.
   * Reads the pool map first and falls back to the legacy section count so
   * existing tournaments keep their shape. Everything (capacity, seeding,
   * draw generation, scheduling and persistence) goes through this.
   */
  const sectionsForLeague = (gn: number) =>
    effectivePools({ gn, pools: swissPools, legacySections: leagueSections });
  const poolsForDivision = sectionsForLeague;
  // Knockout divisions size their pools for the bracket (8 + 6) instead of
  // equal headcount (7 + 7). Every other format keeps balanced pools.
  const isKnockoutDivision = (gn: number) => formatForLeague(gn) === "knockout";
  const poolOptsFor = (gi: number) => ({
    manual: manualSeedGroups.has(gi),
    knockout: isKnockoutDivision(gi + 1),
    mode: poolAllocation,
    sizes: poolSizeOverrides[String(gi + 1)],
  });

  /** The only writer of the pool count. */
  const setPoolsForDivision = (gn: number, next: number) => {
    const key = String(gn);
    const pools = Math.max(1, Math.floor(Number(next) || 1));
    setSwissPools((m) => ({ ...m, [key]: pools }));
    // A new pool count invalidates any hand-dragged headcounts for this division.
    setPoolSizeOverrides((m) => (m[key] === undefined ? m : { ...m, [key]: undefined as any }));
    // Keep the legacy section map aligned so nothing reads a stale value.
    setLeagueSections((m) => (m[key] === undefined ? m : { ...m, [key]: pools }));
    const n = Number(expectedPlayers[key]) || 0;
    if (formatForLeague(gn) === "swiss" && n >= 2) {
      const perPool = Math.max(2, Math.ceil(n / pools));
      setSwissRounds((m) => ({ ...m, [key]: Math.max(1, perPool - 1) }));
    }
  };
  // Which club league(s) feed each competition division ("Players from").
  const [leagueSources, setLeagueSources] = useState<Record<string, DivisionSource>>({});
  const sourceForLeague = (gn: number) => divisionSource(leagueSources, gn);
  const setSourceForLeague = (gn: number, next: DivisionSource) =>
    setLeagueSources((m) => ({ ...m, [String(gn)]: next }));
  // Planning-only per-league expected player counts (keyed by group_number).
  // Purely for the capacity readout in the wizard — not enforced anywhere.
  const [expectedPlayers, setExpectedPlayers] = useState<Record<string, number>>({});
  // Effective format for a given league number (1-based). A per-league
  // override wins; otherwise the tournament default applies.
  const formatForLeague = (gn: number): PerLeagueFormat | "" => {
    if (usePerLeagueFormats && leagueFormats[String(gn)]) return leagueFormats[String(gn)];
    if (roundFormat === "cross_league") return "cross_league";
    return roundFormat;
  };
  /**
   * The effective draw format of every division, used by the invite text so
   * a knockout tournament is described as a knockout.
   */
  const inviteDivisionFormats = (): string[] =>
    Array.from({ length: Math.max(1, numGroups || 1) }, (_, i) => formatForLeague(i + 1) || "").filter(Boolean);
  /** Stable dependency key so the auto invite text refreshes when formats change. */
  const divisionFormatsKey = inviteDivisionFormats().join("|");


  /**
   * Self-scheduled knockout: every division is a knockout AND the players
   * arrange their own court/date/time. In that mode the whole club-scheduling
   * apparatus (courts, time slots, fill/spread, pool breaks, capacity,
   * finals dates) is irrelevant — the organiser only sets the CURRENT round's
   * play-by deadline. Any other combination keeps the full controls.
   */
  const selfScheduledKnockout = isSelfScheduledKnockout(schedulingMode, inviteDivisionFormats());

  /** Round-by-round completion of the tournament being edited (drives "current round"). */
  const { data: roundMatchRows = [] } = useQuery({
    queryKey: ["champ-round-progress", editingChampId],
    queryFn: async (): Promise<RoundMatchRow[]> => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("round_number, status")
        .eq("champ_id", editingChampId as string);
      if (error) throw error;
      return (data || []) as RoundMatchRow[];
    },
    enabled: !!editingChampId,
  });

  /**
   * What a "Rebuild Schedule" would disturb on a tournament that is already
   * under way. Drives the confirmation gate on the review step.
   */
  const { data: rebuildRows = [] } = useQuery({
    queryKey: ["champ-rebuild-impact", editingChampId],
    queryFn: async (): Promise<RebuildImpactRow[]> => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("status, is_bye, winner_member_id, score, booking_id")
        .eq("champ_id", editingChampId as string);
      if (error) throw error;
      return (data || []) as RebuildImpactRow[];
    },
    enabled: !!editingChampId,
  });
  const rebuildImpact = useMemo(() => describeRebuildImpact(rebuildRows), [rebuildRows]);

  const knockoutProgress = useMemo(() => computeRoundProgress(roundMatchRows), [roundMatchRows]);
  const knockoutCurrentRound = currentRoundNumber(knockoutProgress);
  /**
   * Semi/final stages may be flipped back to club-scheduled courts & times.
   * While that override is on, the full Dates/Times/Courts UI comes back.
   */
  const currentRoundClubScheduled = roundIsClubScheduled(roundDeadlines, knockoutCurrentRound);
  /** Simplified single-round UI is active only while the round stays player-arranged. */
  const simplifiedKnockoutSchedule = selfScheduledKnockout && !currentRoundClubScheduled;



  // Per-league gender category and match type (keyed by group_number string).
  // A tournament can therefore hold e.g. a Ladies' league, a Men's league and
  // a Mixed league side by side. Missing entries fall back to the
  // tournament-level defaults below.
  const [leagueGenders, setLeagueGenders] = useState<Record<string, GenderCategory>>({});
  const [leagueMatchTypes, setLeagueMatchTypes] = useState<Record<string, "singles" | "doubles">>({});
  const genderForLeague = (gn: number): GenderCategory => leagueGenders[String(gn)] ?? gender;
  const matchTypeForLeague = (gn: number): "singles" | "doubles" => leagueMatchTypes[String(gn)] ?? matchType;
  /** Does this member satisfy the category set for the given league? */
  const memberFitsLeague = (m: any, gn: number): boolean => {
    const g = genderForLeague(gn);
    if (g === "mixed" || g === "open") return true;
    return memberMatchesTournamentGender(m?.gender, g);
  };
  /** Distinct gender categories actually in use across the leagues. */
  const leagueGenderSet = useMemo(() => {
    const s = new Set<GenderCategory>();
    for (let i = 1; i <= (numGroups || 0); i++) s.add(leagueGenders[String(i)] ?? gender);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueGenders, numGroups, gender]);

  // ---- Per-league scoring settings ---------------------------------------
  // Each league can run its own scoring format (Standard / Bells), for
  // Standard its own game length (par 11 / par 15), best-of and win
  // condition (win-by-2 / sudden death). Missing entries fall back to the
  // tournament-level values.
  const [leagueScoringModes, setLeagueScoringModes] = useState<Record<string, "standard" | "time_capped_points">>({});
  const [leaguePointsPerGame, setLeaguePointsPerGame] = useState<Record<string, 11 | 15>>({});
  const [leagueBestOf, setLeagueBestOf] = useState<Record<string, 3 | 5>>({});
  const [leagueWinConditions, setLeagueWinConditions] = useState<{[key: string]: "win_by_2" | "sudden_death"}>({});
  // When true for a league, every game is played (no early finish at best-of).
  const [leaguePlayAll, setLeaguePlayAll] = useState<Record<string, boolean>>({});
  // Per-league playoffs: which leagues run their own knockout / finals stage.
  const [leaguePlayoffs, setLeaguePlayoffs] = useState<Record<string, boolean>>({});
  /**
   * Tournament-level playoff flag — DERIVED, never edited directly.
   * Kept only so the legacy `enable_playoffs` column and downstream
   * generation/scheduling code keep working unchanged.
   */
  const enablePlayoffs = useMemo(
    () => Object.values(leaguePlayoffs).some(Boolean),
    [leaguePlayoffs],
  );
  // Per-league bye handling (falls back to the tournament-level rule).
  const [leagueByeHandling, setLeagueByeHandling] = useState<Record<string, "no_match" | "walkover_win" | "neutral">>({});
  const scoringForLeague = (gn: number): "standard" | "time_capped_points" =>
    leagueScoringModes[String(gn)] ?? ((scoringMode === "time_capped_points" ? "time_capped_points" : "standard"));
  const pointsForLeague = (gn: number): 11 | 15 =>
    leaguePointsPerGame[String(gn)] ?? ((pointsPerGame === 15 ? 15 : 11));
  const bestOfForLeague = (gn: number): 3 | 5 => leagueBestOf[String(gn)] ?? ((bestOf === 5 ? 5 : 3));
  const playAllForLeague = (gn: number): boolean => leaguePlayAll[String(gn)] ?? false;
  const playoffsForLeague = (gn: number): boolean => leaguePlayoffs[String(gn)] === true;
  const byeForLeague = (gn: number): "no_match" | "walkover_win" | "neutral" =>
    leagueByeHandling[String(gn)] ?? ((byeHandling || "no_match") as "no_match" | "walkover_win" | "neutral");
  // Per-league forfeit / no-show rule. The consequence of a no-show depends on how
  // the league is scored, so each league owns its own rule (League 1 can award a
  // walkover while a Bells league awards points).
  const [leagueForfeitRules, setLeagueForfeitRules] = useState<ForfeitRuleMap>({});
  const [leagueForfeitPoints, setLeagueForfeitPoints] = useState<ForfeitPointsMap>({});
  const forfeitRuleForLeague = (gn: number): ForfeitRule =>
    forfeitRuleFor(leagueForfeitRules, gn, scoringForLeague(gn));
  const forfeitPointsForLeague = (gn: number): ForfeitPoints =>
    forfeitPointsFor(leagueForfeitPoints, gn, {
      opponent: noShowOpponentPoints,
      player: noShowPlayerPoints,
    });
  const winConditionForLeague = (gn: number): "win_by_2" | "sudden_death" =>
    leagueWinConditions[String(gn)] ?? winCondition;
  /** Set one league's scoring format; keeps tournament-level in sync with league 1. */
  const setLeagueScoring = (gn: number, mode: "standard" | "time_capped_points") => {
    setLeagueScoringModes((m) => {
      const next = { ...m, [String(gn)]: mode };
      if (gn === 1 || Object.keys(next).length === 1) setScoringMode(mode);
      return next;
    });
    if (mode === "standard") {
      setLeaguePointsPerGame((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? (pointsPerGame === 15 ? 15 : 11) }));
      setLeagueBestOf((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? (bestOf === 5 ? 5 : 3) }));
      if (!pointsPerGame) setPointsPerGame(11);
      if (!bestOf) setBestOf(3);
    } else {
      // Bells needs a slot length per league — seed a sensible default.
      setGroupDurations((m) => ({ ...m, [String(gn)]: Number(m[String(gn)]) > 0 ? m[String(gn)] : (matchDuration > 0 ? matchDuration : 20) }));
    }
  };
  const setLeagueWinCondition = (gn: number, wc: "win_by_2" | "sudden_death") => {
    setLeagueWinConditions((m) => {
      const next = { ...m, [String(gn)]: wc };
      // Keep the tournament-level win_condition in sync with League 1 for
      // downstream compatibility (legacy matches, scoring engine).
      if (gn === 1 || Object.keys(next).length === 1) setWinCondition(wc);
      return next;
    });
  };

  // ---- Visual "Tournament Structure Builder" helpers ---------------------
  const FORMAT_META: Record<PerLeagueFormat, { label: string; short: string; desc: string }> = {
    single_round_robin: { label: "Round robin", short: "Round robin", desc: "Everyone in this league plays everyone else. Tick “double” to play home & away." },
    double_round_robin: { label: "Round robin (double)", short: "Double RR", desc: "Play each opponent twice — home & away." },
    swiss: { label: "Swiss pairing", short: "Swiss", desc: "Fixed rounds; admin re-pairs each round by score." },
    cross_league: { label: "Cross league", short: "Cross league", desc: "This league plays against the other leagues instead of within itself." },
    knockout: { label: "Knockout", short: "Knockout", desc: "Straight elimination. Split into sections; seeds spread evenly and section winners meet in the league final." },
  };
  const addLeagueOfFormat = (fmt: PerLeagueFormat) => {
    const gn = (numGroups || 0) + 1;
    setNumGroups(gn);
    setLeagueFormats((m) => ({ ...m, [String(gn)]: fmt }));
    // New leagues inherit the current category as their starting point.
    setLeagueGenders((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? gender }));
    setLeagueMatchTypes((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? matchType }));
    // …and the current scoring settings, which stay editable per league.
    setLeagueScoringModes((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? (scoringMode === "time_capped_points" ? "time_capped_points" : "standard") }));
    setLeaguePointsPerGame((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? (pointsPerGame === 15 ? 15 : 11) }));
    setLeagueBestOf((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? (bestOf === 5 ? 5 : 3) }));
    setLeagueWinConditions((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? winCondition }));
    if (!scoringMode) setScoringMode("standard");
    if (!pointsPerGame) setPointsPerGame(11);
    if (!bestOf) setBestOf(3);
    if (!winCondition) setWinCondition("win_by_2");
    if (fmt === "swiss") {
      setSwissPools((m) => ({ ...m, [String(gn)]: m[String(gn)] || 1 }));
      setSwissRounds((m) => ({ ...m, [String(gn)]: m[String(gn)] || 5 }));
    }
    if (fmt === "knockout") {
      // One draw by default — the organiser splits it into sections if they want.
      setSwissPools((m) => ({ ...m, [String(gn)]: m[String(gn)] || 1 }));
      // Knockout progresses through rounds to the division final by default.
      setLeaguePlayoffs((m) => ({ ...m, [String(gn)]: m[String(gn)] ?? true }));
    }
    setUsePerLeagueFormats(true);
    if (fmt === "cross_league") setRoundFormat("cross_league");
    else if (fmt === "knockout") { if (!roundFormat) setRoundFormat("single_round_robin"); }
    else if (!roundFormat || roundFormat === "cross_league") setRoundFormat(fmt as any);
  };

  /**
   * "All leagues" → one independent competition division per club league.
   *
   * The template division's settings (format, pools, category, scoring) are
   * cloned onto each generated division; afterwards each division is edited on
   * its own — they are NOT kept linked. Re-running is idempotent: a league that
   * already owns a division is left exactly as it is, and manually created
   * divisions are preserved.
   */
  const expandAllLeagues = (templateGn: number) => {
    const leagues = (availableLeagues as any[]).map((l) => ({ id: l.id as string, name: l.name as string }));
    if (leagues.length === 0) {
      toast.info("This club has no leagues to expand into divisions yet");
      return;
    }
    const plan = planAllLeaguesExpansion({
      templateGn,
      divisionCount: numGroups || 0,
      sources: leagueSources,
      leagues,
      labels: groupLabels,
    });
    if (plan.created.length === 0) {
      toast.info("Every league already has its own division");
      return;
    }
    const tkey = String(templateGn);
    const tmplFormat = formatForLeague(templateGn) || "single_round_robin";
    const tmplPools = swissPools[tkey];
    const tmplRounds = swissRounds[tkey];

    setNumGroups(plan.divisionCount);
    setUsePerLeagueFormats(true);
    plan.created.forEach((item) => {
      const key = String(item.gn);
      setSourceForLeague(item.gn, { mode: "selected", leagueIds: [item.leagueId] });
      setGroupLabels((m) => ({ ...m, [key]: m[key] || item.label }));
      setLeagueFormats((m) => ({ ...m, [key]: tmplFormat as PerLeagueFormat }));
      if (tmplPools) setSwissPools((m) => ({ ...m, [key]: m[key] ?? tmplPools }));
      if (tmplRounds) setSwissRounds((m) => ({ ...m, [key]: m[key] ?? tmplRounds }));
      setLeagueGenders((m) => ({ ...m, [key]: m[key] ?? genderForLeague(templateGn) }));
      setLeagueMatchTypes((m) => ({ ...m, [key]: m[key] ?? matchTypeForLeague(templateGn) }));
      setLeagueScoringModes((m) => ({ ...m, [key]: m[key] ?? m[tkey] ?? (scoringMode === "time_capped_points" ? "time_capped_points" : "standard") }));
      setLeaguePointsPerGame((m) => ({ ...m, [key]: m[key] ?? m[tkey] ?? (pointsPerGame === 15 ? 15 : 11) }));
      setLeagueBestOf((m) => ({ ...m, [key]: m[key] ?? m[tkey] ?? (bestOf === 5 ? 5 : 3) }));
      setLeagueWinConditions((m) => ({ ...m, [key]: m[key] ?? m[tkey] ?? winCondition }));
    });
    toast.success(
      `${plan.created.length} division${plan.created.length === 1 ? "" : "s"} created — one per league${
        plan.skipped.length > 0 ? `, ${plan.skipped.length} already existed` : ""
      }`,
    );
  };

  /** Set one league's gender, materialising the others so nothing shifts. */
  const setLeagueGender = (gn: number, g: GenderCategory) => {
    setLeagueGenders((m) => {
      const next: Record<string, GenderCategory> = { ...m };
      for (let i = 1; i <= (numGroups || 0); i++) next[String(i)] = next[String(i)] ?? gender;
      next[String(gn)] = g;
      // When leagues no longer share one category the entrant pool has to be
      // the union — keep the tournament-level gender as "open" so every
      // eligible member stays selectable on the Players step.
      const distinct = new Set(Object.values(next).slice(0, numGroups || 0));
      if (distinct.size > 1) setGender("open");
      else setGender(g);
      return next;
    });
  };
  /** Singles/doubles per league — the engine needs one entity type per event. */
  const setLeagueMatchType = (gn: number, mt: "singles" | "doubles") => {
    setLeagueMatchTypes(() => {
      const next: Record<string, "singles" | "doubles"> = {};
      for (let i = 1; i <= (numGroups || 0); i++) next[String(i)] = mt;
      return next;
    });
    setMatchType(mt);
  };
  /**
   * Clone a division: every setting (format, pools, category, scoring, source)
   * is copied onto a new division at the end of the list, so organisers with
   * many classes (League 1-4, Ladies, Junior Boys, Junior Girls…) configure
   * the rules once and then just rename + retarget the copies.
   */
  const duplicateLeagueAt = (gn: number) => {
    const from = String(gn);
    const to = String((numGroups || 0) + 1);
    const copy = <T,>(setter: (fn: (m: Record<string, T>) => Record<string, T>) => void) =>
      setter((m) => (m[from] === undefined ? m : { ...m, [to]: m[from] }));
    setNumGroups((n) => (n || 0) + 1);
    setUsePerLeagueFormats(true);
    copy(setLeagueFormats as any);
    copy(setLeagueSections as any);
    copy(setLeagueSources as any);
    copy(setSwissPools as any);
    copy(setSwissRounds as any);
    copy(setGroupDurations as any);
    copy(setGroupBreakMinutes as any);
    copy(setExpectedPlayers as any);
    copy(setLeagueGenders as any);
    copy(setLeagueMatchTypes as any);
    copy(setLeagueScoringModes as any);
    copy(setLeaguePointsPerGame as any);
    copy(setLeagueBestOf as any);
    copy(setLeagueWinConditions as any);
    copy(setLeaguePlayoffs as any);
    setGroupLabels((m) => ({ ...m, [to]: `${(m[from] || `League ${gn}`).trim()} (copy)` }));
    toast.success("Division duplicated — rename it and pick who plays in it");
  };

  const removeLeagueAt = (gn: number) => {

    const shift = <T,>(map: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(map)) {
        const n = Number(k);
        if (!Number.isFinite(n)) { out[k] = v; continue; }
        if (n < gn) out[k] = v;
        else if (n > gn) out[String(n - 1)] = v;
      }
      return out;
    };
    setLeagueFormats(shift);
    setLeagueSections(shift);
    setLeagueSources(shift);
    setSwissPools(shift);
    setSwissRounds(shift);
    setGroupLabels(shift);
    setGroupDurations(shift);
    setGroupBreakMinutes(shift);
    setExpectedPlayers(shift);
    setLeagueGenders(shift);
    setLeagueMatchTypes(shift);
    setLeagueScoringModes(shift);
    setLeaguePointsPerGame(shift);
    setLeagueBestOf(shift);
    setLeagueWinConditions(shift);
    setNumGroups((n) => Math.max(0, (n || 0) - 1));
  };
  const [byeHandling, setByeHandling] = useState<"" | "no_match" | "walkover_win" | "neutral">("no_match");
  const [selectedCourtIds, setSelectedCourtIds] = useState<Set<number>>(new Set());
  // Prune any selected court IDs that no longer exist in the club's courts
  // list — protects against stale references (e.g. deleted external courts)
  // that would break the FK when inserting matches on rebuild.
  useEffect(() => {
    if (!courts || courts.length === 0) return;
    const valid = new Set(courts.map((c) => c.id));
    setSelectedCourtIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => { if (valid.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });
  }, [courts]);
  // Per-day schedule overrides — for short tournaments (Fri eve, Sat morning, Sat afternoon).
  // Each entry is one time window on one date. A date can appear multiple times (multi-session days).
  type DaySchedule = { date: string; start_time: string; end_time: string; court_ids: number[] | null };
  const [customizeDailySchedule, setCustomizeDailySchedule] = useState(false);
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);

  /**
   * Keep the per-day windows in sync with the play days + date range.
   *
   * Ticking Mon/Wed/Fri must reserve EVERY Mon, Wed and Fri inside the
   * tournament window — not just the weekday that happened to be ticked when
   * the list was first generated. Rows for weekdays that are no longer ticked
   * (or dates outside the window) are dropped; manually edited rows and extra
   * windows on a still-valid date are preserved untouched.
   */
  useEffect(() => {
    if (!customizeDailySchedule) return;
    if (!startDate || !endDate || playDays.size === 0) return;
    let wanted: Date[];
    try {
      wanted = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
        .filter((d) => playDays.has(getDay(d)));
    } catch {
      return;
    }
    const wantedISO = wanted.map((d) => format(d, "yyyy-MM-dd"));
    const wantedSet = new Set(wantedISO);
    setDaySchedules((prev) => {
      const kept = prev.filter((r) => !r.date || wantedSet.has(r.date));
      const have = new Set(kept.map((r) => r.date));
      const added = wantedISO
        .filter((iso) => !have.has(iso))
        .map((iso) => ({ date: iso, start_time: startTime, end_time: endTime, court_ids: null }));
      if (added.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...added].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.start_time.localeCompare(b.start_time));
    });
  }, [customizeDailySchedule, startDate, endDate, playDays, startTime, endTime]);

  const [groupAssignments, setGroupAssignments] = useState<Map<string, number>>(new Map());
  /**
   * A player may enter SEVERAL divisions (e.g. "1st League" + "Masters Mixed").
   * `groupAssignments` only holds their primary division; every ADDITIONAL
   * division they accepted lives here as 0-based group indices, so the
   * allocation page shows them in each division they signed up for.
   */
  const [extraDivisions, setExtraDivisions] = useState<Map<string, Set<number>>>(new Map());
  /** Accepted entrants who match no division's source league — organiser must place them. */
  const [unassignedEntrantIds, setUnassignedEntrantIds] = useState<string[]>([]);
  const [playerOrder, setPlayerOrder] = useState<string[]>([]);
  /**
   * Divisions the organiser deliberately reordered by drag-and-drop. Every
   * other division stays in club-ladder order, so drag order never silently
   * becomes the seed order.
   */
  const [manualSeedGroups, setManualSeedGroups] = useState<Set<number>>(new Set());

  /**
   * Hand-arranged first-round draws, keyed by league (division) number.
   * When present the visual draw board — not the automatic bracket — decides
   * the round-1 pairings for that league. Cleared whenever the entrant set of
   * that league changes, so a stale draw can never produce a ghost fixture.
   */
  const [manualDraws, setManualDraws] = useState<Record<string, DrawBoardModel>>({});
  const [drawEditor, setDrawEditor] = useState<number | null>(null);



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
  const [inviteMethods, setInviteMethods] = useState<Set<"app" | "email" | "whatsapp">>(new Set(["app"]));
  // Controls WHEN invites go out: 'manual' (admin clicks Send later — default),
  // 'now' (prompt on save), or 'scheduled' (admin gets a reminder for the chosen date).
  const [inviteTiming, setInviteTiming] = useState<"manual" | "now" | "scheduled">("manual");
  const [inviteScheduledAt, setInviteScheduledAt] = useState<string>("");
  const [description, setDescription] = useState("");
  // Extra free-text details appended to every invite (co-hosting, food, prizes, etc.).
  const [inviteExtraDetails, setInviteExtraDetails] = useState("");
  const [affectsRankingPoints, setAffectsRankingPoints] = useState<boolean>(false);
  // Weight multiplier applied to ranking points earned in this competition.
  const [rankingWeight, setRankingWeight] = useState<number>(1);
  // null = follow the club's ladder setting; true/false = override for this event only.
  const [ladderAffects, setLadderAffects] = useState<boolean | null>(null);
  // Tournament category / capacity / seeding — stored on the tournaments row.
  const [eventType, setEventType] = useState<string>(scope === "club" ? "club_championship" : "open_tournament");
  useEffect(() => {
    if (scope !== "club" && eventType === "club_championship") setEventType("open_tournament");
  }, [scope, eventType]);
  // `eligibilityScope` is declared near the top of the component because the
  // eligible player pool query depends on it.
  // Load the saved eligibility whenever a different tournament is opened for edit.
  useEffect(() => {
    if (wizardGovernance?.eligibility_scope) setEligibilityScope(wizardGovernance.eligibility_scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingChampId, wizardGovernance?.eligibility_scope]);
  const [maxEntrants, setMaxEntrants] = useState<string>("");
  const [maxPerLeague, setMaxPerLeague] = useState<string>("");
  const [seedingSource, setSeedingSource] = useState<string>("ladder");

  const [showInvitePreview, setShowInvitePreview] = useState(false);

  // Invite by league (just for the initial roster — admin can still sub from any league later)
  const [inviteSource, setInviteSource] = useState<"manual" | "leagues">("manual");
  const [inviteIncludeReserves, setInviteIncludeReserves] = useState<boolean>(true);
  const [inviteExcludedMemberIds, setInviteExcludedMemberIds] = useState<Set<string>>(new Set());

  /**
   * INVITATION AUDIENCE — who receives the invitation. Deliberately independent
   * of the Structure / draw source: a member who plays no league can still be
   * invited to a club championship.
   */
  const [inviteAudience, setInviteAudience] = useState<InviteAudienceMode>("all_club");
  const [audienceLeagueIds, setAudienceLeagueIds] = useState<Set<string>>(new Set());
  const [audienceMemberIds, setAudienceMemberIds] = useState<Set<string>>(new Set());
  /** Scope-tree selection: which clubs (regional / national scopes) get invited. */
  const [audienceClubIds, setAudienceClubIds] = useState<string[]>([]);
  const [audienceIncludeIndividuals, setAudienceIncludeIndividuals] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState("");

  const scopeIsWide = eligibilityScope === "association" || eligibilityScope === "open";

  /** Association → club tree with counts only (never names or contact data). */
  const {
    data: scopeTree = [],
    isFetching: scopeTreeLoading,
    error: scopeTreeError,
  } = useQuery({
    queryKey: ["tournament-invite-scope-tree", editingChampId, clubId, eligibilityScope],
    queryFn: () => fetchScopeTree({ tournamentId: editingChampId, clubId, scope: eligibilityScope }),
    enabled: !!clubId && showWizard && scopeIsWide,
    staleTime: 60_000,
    retry: false,
  });


  /**
   * "Everyone in the region / federation" is simply every club in the scope
   * tree, so it resolves through exactly the same server-side path as a manual
   * club selection — the browser never sees more than counts and references.
   */
  const effectiveAudienceMode: InviteAudienceMode =
    scopeIsWide && inviteAudience === "all_club" ? "clubs" : inviteAudience;
  const effectiveAudienceClubIds = useMemo(
    () =>
      scopeIsWide && inviteAudience === "all_club"
        ? scopeTree.flatMap((g) => g.clubs.map((c) => c.clubId))
        : audienceClubIds,
    [scopeIsWide, inviteAudience, scopeTree, audienceClubIds],
  );

  /** Member references for the ticked clubs — resolved server-side. */
  const { data: scopeMemberIdsByClub = new Map<string, string[]>() } = useQuery({
    queryKey: [
      "tournament-invite-member-ids",
      editingChampId,
      clubId,
      eligibilityScope,
      effectiveAudienceClubIds.join(","),
    ],
    queryFn: () =>
      fetchScopeMemberIds({
        tournamentId: editingChampId,
        clubId,
        scope: eligibilityScope,
        clubIds: effectiveAudienceClubIds,
      }),
    enabled:
      !!clubId && showWizard && effectiveAudienceMode === "clubs" && effectiveAudienceClubIds.length > 0,
    staleTime: 30_000,
    retry: false,
  });



  /**
   * Cross-club invitation directory. A tournament opened to an association or
   * to the whole federation must let the organiser find players from other
   * clubs — but only through the privacy-safe RPC projection (name, club,
   * category, ladder/ranking). Contact details are never returned here; the
   * invite itself is delivered server-side.
   */
  const [directoryPicked, setDirectoryPicked] = useState<Map<string, DirectoryPlayer>>(new Map());
  const {
    data: directoryPlayers = [],
    isFetching: directoryLoading,
    error: directoryError,
  } = useQuery({
    queryKey: [
      "tournament-invite-directory",
      editingChampId,
      clubId,
      eligibilityScope,
      audienceSearch.trim().toLowerCase(),
      audienceClubIds.join(","),
    ],
    queryFn: () =>
      fetchInviteDirectory({
        tournamentId: editingChampId,
        clubId,
        scope: eligibilityScope,
        search: audienceSearch,
        limit: 300,
        // Narrow individual search to the clubs ticked in the tree, when any.
        clubIds: audienceClubIds,
      }),

    enabled: !!clubId && showWizard,
    staleTime: 30_000,
    retry: false,
  });

  const directoryGroups = useMemo(() => groupByClub(directoryPlayers), [directoryPlayers]);

  /**
   * Invitable pool for audience resolution: the club roster plus any external
   * player the organiser deliberately picked from the directory.
   */
  const audienceMemberPool = useMemo(() => {
    const pool = [...((members || []) as any[])];
    const known = new Set(pool.map((m: any) => m.id));
    directoryPicked.forEach((p) => {
      if (!known.has(p.member_id)) {
        pool.push({ id: p.member_id, status: "active", role: "member", gender: p.gender, name: p.display_name });
      }
    });
    return pool;
  }, [members, directoryPicked]);


  // Who puts a player on the entry list, and whether an admin must accept it.
  const [entrySource, setEntrySource] = useState<"self" | "admin" | "team_manager">("self");
  const [approvalGate, setApprovalGate] = useState<"none" | "admin_accept">("none");
  // When the entry fee falls due: straight away, or only once the entry is accepted.
  const [paymentTiming, setPaymentTiming] = useState<"on_entry" | "after_acceptance">("on_entry");

  // Handicap (singles only): none, by league ranking, or by club ladder
  // Handicap source:
  //  - none         → no handicap
  //  - league_rank  → club admin's league team setup (DB player_rank + division)
  //  - group_order  → drag order on the tournament Leagues step
  //  - club_ladder  → club_members.ladder_position
  const [handicapMode, setHandicapMode] = useState<"none" | "league_rank" | "group_order" | "club_ladder" | "ladder_history">("none");
  // When group_order + multiple leagues: how to rank across leagues.
  //  - continuous: League 1 supersedes League 2 (global 1..N across all)
  //  - parallel:   each league is 1..N independently (even strength)
  const [groupRankScope, setGroupRankScope] = useState<"continuous" | "parallel">("continuous");
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
    enabled: !!editingChampId && matchType === "doubles" && showWizard,
  });

  // Bells format ignores Match Duration (slot times are defined per-league).
  // Ensure schedulePreview's matchDuration guard passes by defaulting to 20.
  useEffect(() => {
    if (scoringMode === "time_capped_points" && (!matchDuration || matchDuration <= 0)) {
      setMatchDuration(20);
    }
  }, [scoringMode, matchDuration]);

  useEffect(() => {
    if (matchType !== "doubles") return;
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
    if (partnerMode === "players") {
      // Players mode: registrations are the source of truth — replace.
      setDoublesPairs(pairs);
    } else {
      // Admin mode: merge in any confirmed pairs (e.g. from bulk import)
      // without wiping pairs the admin already built manually.
      setDoublesPairs((prev) => {
        const existing = new Set(prev.map((p) => [p.player1Id, p.player2Id].sort().join("|")));
        const additions = pairs.filter((p) => !existing.has([p.player1Id, p.player2Id].sort().join("|")));
        return additions.length ? [...prev, ...additions] : prev;
      });
    }
  }, [confirmedPairRegs, partnerMode, matchType]);

  const { data: availableLeagues = [] } = useQuery({
    queryKey: ["club-leagues-for-tournament", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("leagues")
        .select(
          "id, name, code, association_id, season_year, level, is_reserve, league_associations:association_id(name, scope)",
        )
        .eq("club_id", clubId)
        // Archived seasons never appear as a tournament source.
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clubId,
  });

  /**
   * Fixture-derived evidence (level + season) for clubs whose league rows have
   * not been backfilled yet.
   *
   * IMPORTANT: `league_rounds.association_id` is the TENANT association, while
   * `platform_league_fixtures.association_id` is the PLATFORM association.
   * Mixing the two returns zero rounds and flattens the whole tree — this is the
   * same resolution the admin Leagues page uses.
   */
  const { data: leagueFixtureEvidence } = useQuery({
    queryKey: ["club-league-tiers", clubId, availableLeagues.map((l: any) => l.id).join(",")],
    enabled: availableLeagues.length > 0,
    queryFn: async () => {
      const assocIds = Array.from(
        new Set(availableLeagues.map((l: any) => l.association_id).filter(Boolean)),
      );
      const evidence = new Map<string, FixtureEvidence>();
      if (assocIds.length === 0) return evidence;

      const { data: assocs } = await fromExt("league_associations")
        .select("id, platform_association_id")
        .in("id", assocIds);
      const platformByAssoc = new Map<string, string>();
      (assocs || []).forEach((a: any) =>
        platformByAssoc.set(a.id, a.platform_association_id || a.id),
      );

      // Rounds are stored against the tenant association id.
      const { data: rounds } = await fromExt("league_rounds")
        .select("id, name, round_number, round_date, association_id")
        .in("association_id", assocIds as string[]);

      const roundInfo = new Map<string, { level: number | null; year: number | null }>();
      (rounds || []).forEach((r: any) => {
        const tier = String(r.name || "")
          .replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "")
          .trim();
        roundInfo.set(r.id, {
          level: ordinalFromName(tier),
          year: r.round_date ? new Date(r.round_date).getFullYear() : null,
        });
      });
      const roundIds = Array.from(roundInfo.keys());
      if (roundIds.length === 0) return evidence;

      // Fixtures carry the team codes, keyed by the PLATFORM association id.
      const { data: fixtures } = await fromExt("platform_league_fixtures" as any)
        .select("round_id, home_team_code, away_team_code, association_id")
        .in("round_id", roundIds);

      type Votes = { levels: Map<number, number>; years: Set<number> };
      const byTeam = new Map<string, Votes>();
      const bump = (assoc: string, code: string | null, info: { level: number | null; year: number | null }) => {
        if (!code || code.startsWith("__")) return;
        const key = `${assoc}::${code}`;
        if (!byTeam.has(key)) byTeam.set(key, { levels: new Map(), years: new Set() });
        const v = byTeam.get(key)!;
        if (info.level != null) v.levels.set(info.level, (v.levels.get(info.level) || 0) + 1);
        if (info.year != null) v.years.add(info.year);
      };
      (fixtures || []).forEach((f: any) => {
        const info = roundInfo.get(f.round_id);
        if (!info) return;
        bump(f.association_id, f.home_team_code, info);
        bump(f.association_id, f.away_team_code, info);
      });

      availableLeagues.forEach((l: any) => {
        const platformAssoc = platformByAssoc.get(l.association_id);
        if (!platformAssoc || !l.code) return;
        const v = byTeam.get(`${platformAssoc}::${l.code}`);
        if (!v) return;
        let level: number | null = null;
        let best = -1;
        v.levels.forEach((n, lvl) => { if (n > best) { best = n; level = lvl; } });
        const years = Array.from(v.years);
        evidence.set(l.id, { level, seasonYear: years.length === 1 ? years[0] : null });
      });
      return evidence;
    },
  });

  /** Stored season/level first, inference second — shared with the Leagues page. */
  const leagueResolution = useMemo(
    () =>
      resolveLeagueSeasonLevels(availableLeagues as any[], {
        fixtureEvidence: leagueFixtureEvidence ?? null,
      }),
    [availableLeagues, leagueFixtureEvidence],
  );

  const availableSeasons = useMemo(() => seasonsPresent(leagueResolution), [leagueResolution]);

  /** The tournament's own year drives the default source season. */
  const tournamentYear = useMemo(() => {
    const y = startDate ? new Date(startDate).getFullYear() : NaN;
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }, [startDate]);

  const [sourceSeason, setSourceSeason] = useState<number | null>(null);
  const [seasonTouched, setSeasonTouched] = useState(false);
  useEffect(() => {
    if (seasonTouched) return;
    setSourceSeason(pickSeasonForYear(availableSeasons, tournamentYear));
  }, [availableSeasons, tournamentYear, seasonTouched]);

  const seasonIsFallback =
    sourceSeason != null && isSeasonFallback(availableSeasons, tournamentYear);

  /**
   * Hierarchical "Players from" tree: season → league level → teams / reserves.
   * Children carry the canonical club league ids, so every downstream consumer
   * (player loading, invites, eligibility, seeding, draws) is unchanged.
   */
  const leagueTree = useMemo(() => {
    const full = buildLeagueTree(
      (availableLeagues as any[]).map((l) => {
        const r = leagueResolution.get(l.id);
        return {
          id: l.id as string,
          name: l.name as string,
          association_id: l.association_id as string | null,
          assocName: l.league_associations?.name || "League",
          level: r?.level ?? null,
          seasonYear: r?.seasonYear ?? null,
          isReserve: r?.isReserve ?? null,
        };
      }),
    );
    return filterTreeBySeason(full, sourceSeason);
  }, [availableLeagues, leagueResolution, sourceSeason]);




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

  /** Club league id → display name, for the "Players from" chips. */
  const leagueNameById = useMemo(() => {
    const m = new Map<string, string>();
    (availableLeagues as any[]).forEach((l) => m.set(l.id, l.name));
    return m;
  }, [availableLeagues]);

  /**
   * Registered players per club league — the real eligible population behind
   * every division's "Players from" selection.
   */
  const { data: leagueRegistrationRows = [] } = useQuery({
    queryKey: ["division-league-registrations", clubId, (availableLeagues as any[]).map((l) => l.id).join(",")],
    enabled: (availableLeagues as any[]).length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("league_id, club_member_id, is_reserve")
        .in("league_id", (availableLeagues as any[]).map((l) => l.id));
      if (error) throw error;
      return (data || []) as Array<{ league_id: string; club_member_id: string; is_reserve: boolean | null }>;
    },
  });

  const registrationsByLeague = useMemo(() => {
    const m = new Map<string, string[]>();
    leagueRegistrationRows.forEach((r) => {
      if (!r.club_member_id) return;
      if (!inviteIncludeReserves && r.is_reserve) return;
      const list = m.get(r.league_id) || [];
      list.push(r.club_member_id);
      m.set(r.league_id, list);
    });
    return m;
  }, [leagueRegistrationRows, inviteIncludeReserves]);

  /**
   * Structure / draw source. This is ONLY about how accepted entrants are
   * organised into divisions and seeded — it must never decide who receives an
   * invitation (see `resolvedAudience` below).
   */
  const [inviteLeaguesTouched, setInviteLeaguesTouched] = useState(false);
  const [inviteSourceTouched, setInviteSourceTouched] = useState(false);

  const structureLeagueIds = useMemo(() => {
    const out = new Set<string>();
    for (let gn = 1; gn <= Math.max(1, numGroups); gn++) {
      const src = divisionSource(leagueSources, gn);
      if (src.mode === "all" || src.leagueIds.length === 0) continue;
      src.leagueIds.forEach((id) => out.add(id));
    }
    return out;
  }, [leagueSources, numGroups]);

  /** The people who will receive the invitation — explicit organiser choice. */
  const resolvedAudience = useMemo(
    () =>
      resolveInviteAudience({
        mode: effectiveAudienceMode,
        members: audienceMemberPool as any[],
        leagueIds: Array.from(audienceLeagueIds),
        registrationsByLeague,
        individualIds: Array.from(audienceMemberIds),
        includeIndividuals: audienceIncludeIndividuals,
        clubIds: effectiveAudienceClubIds,
        memberIdsByClub: scopeMemberIdsByClub as Map<string, string[]>,
        excludedIds: inviteExcludedMemberIds,
      }),
    [
      effectiveAudienceMode,
      audienceMemberPool,
      audienceLeagueIds,
      registrationsByLeague,
      audienceMemberIds,
      audienceIncludeIndividuals,
      effectiveAudienceClubIds,
      scopeMemberIdsByClub,
      inviteExcludedMemberIds,
    ],

  );

  /** Team-by-team breakdown of who the audience league selection reaches. */
  const inviteTeamBreakdown = useMemo(() => {
    return Array.from(audienceLeagueIds)
      .map((id) => ({
        id,
        name: leagueNameById.get(id) || "Unknown team",
        count: (registrationsByLeague.get(id) || []).filter((mid) => !inviteExcludedMemberIds.has(mid)).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [audienceLeagueIds, leagueNameById, registrationsByLeague, inviteExcludedMemberIds]);



  /**
   * Players the admin has deliberately kept in a division they do not qualify
   * for. Entries are never dropped silently — this is the explicit override.
   */
  const [eligibilityOverrides, setEligibilityOverrides] = useState<Set<string>>(new Set());

  const eligibilityCtx: EligibilityContext = useMemo(
    () => ({
      sources: leagueSources,
      allLeagueIds: (availableLeagues as any[]).map((l) => l.id as string),
      registrationsByLeague,
      overrides: eligibilityOverrides,
    }),
    [leagueSources, availableLeagues, registrationsByLeague, eligibilityOverrides],
  );

  /**
   * Compatibility: divisions saved before league sources were stored by id (or
   * saved against leagues that have since been renamed/removed) are re-pointed
   * onto stable league ids as soon as the club's league list is known. Refs
   * that cannot be resolved uniquely are never guessed — the division simply
   * falls back to "all leagues" so no entrant is lost.
   */
  useEffect(() => {
    const leagues = (availableLeagues as any[]).map((l) => ({ id: l.id as string, name: l.name as string }));
    if (leagues.length === 0 || Object.keys(leagueSources).length === 0) return;
    const res = resolveDivisionSources(leagueSources, leagues);
    if (res.changed) setLeagueSources(res.sources);
  }, [availableLeagues, leagueSources]);

  /**
   * The source selection ("Players from") guides who gets PREFILLED into a
   * division. It must never silently delete somebody who is already allocated
   * there: a player entered by hand, or with no league registration at all,
   * would otherwise vanish from the draw without a word. Allocation is the
   * truth — mismatches are surfaced as warnings elsewhere, not by dropping.
   */
  const eligibleIdsForDivision = (gn: number, ids: string[]): string[] => {
    const src = divisionSource(leagueSources, gn);
    if (src.mode === "all" || src.leagueIds.length === 0) return ids;
    return constrainIds(ids, divisionEligibleIds(gn, eligibilityCtx), [
      ...eligibilityOverrides,
      ...ids,
    ]);
  };




  /**
   * Pull the players of a division's source league(s) into that division.
   * Registrations are the real source of truth — no free-text matching.
   */
  const applyDivisionPrefill = async (gn: number) => {
    const src = sourceForLeague(gn);
    const allIds = (availableLeagues as any[]).map((l) => l.id as string);
    const leagueIds = src.mode === "all" || src.leagueIds.length === 0 ? allIds : src.leagueIds;
    if (leagueIds.length === 0) {
      toast.info("This club has no leagues to draw players from yet");
      return;
    }
    const { data: regs, error } = await fromExt("member_league_registrations")
      .select("club_member_id, is_reserve")
      .in("league_id", leagueIds);
    if (error) {
      toast.error("Failed to load league players");
      return;
    }
    const ids = (regs || [])
      .filter((r: any) => inviteIncludeReserves || !r.is_reserve)
      .map((r: any) => r.club_member_id)
      .filter((id: string) => !!id && !inviteExcludedMemberIds.has(id));
    const unique = Array.from(new Set<string>(ids)).filter((id) =>
      memberFitsLeague((members || []).find((m: any) => m.id === id), gn),
    );
    if (unique.length === 0) {
      toast.info("No registered players found in the selected league(s)");
      return;
    }
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      unique.forEach((id) => next.add(id));
      return next;
    });
    setGroupAssignments((prev) => {
      const next = new Map(prev);
      unique.forEach((id) => next.set(id, gn));
      return next;
    });
    setSourceLeagueIds((prev) => {
      const next = new Set(prev);
      leagueIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(
      `${unique.length} player${unique.length === 1 ? "" : "s"} added to ${groupLabels[String(gn)] || `League ${gn}`}`,
    );
  };

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

  // Unique home clubs for filter — union of visitor home clubs AND
  // out-of-club members (imported entrants whose home_club_name is set).
  const visitorClubs = useMemo(() => {
    const set = new Set<string>();
    for (const v of allVisitors) if (v?.home_club_name) set.add(v.home_club_name);
    for (const m of (members || []) as any[]) if (m?.home_club_name) set.add(m.home_club_name);
    return [...set].sort();
  }, [allVisitors, members]);

  // Per-club counts across visitors + out-of-club members (for the badge).
  const homeClubCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of allVisitors) if (v?.home_club_name) counts[v.home_club_name] = (counts[v.home_club_name] || 0) + 1;
    for (const m of (members || []) as any[]) if (m?.home_club_name) counts[m.home_club_name] = (counts[m.home_club_name] || 0) + 1;
    return counts;
  }, [allVisitors, members]);

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

  /* ── Entry flow (Q1/Q2/Q3) derived from the existing governance columns ──
     Q1 = entrySource, Q2 = confirmation, Q3 = fee + payment timing. Nothing new
     is stored except `payment_timing`; the legacy columns keep their meaning. */
  const entryFeeAmount = Math.max(0, Number(entryFeeRand) || 0);
  const isPaidTournament = entryFeeAmount > 0;
  // Confirmation means different things per entry source: an organiser-picked
  // player "confirms" by accepting the invitation (registration_required), a
  // self/team entry is confirmed by the organiser accepting it (approval_gate).
  const confirmationRequired =
    entrySource === "admin" ? registrationRequired : approvalGate === "admin_accept";
  // Registration windows only make sense when someone other than the organiser
  // puts names on the list.
  const registrationWindowApplies = registrationRequired && entrySource !== "admin";
  // Invitations are only sent when the organiser builds the list.
  const invitesApply = entrySource !== "self";

  const applyEntrySource = (v: "self" | "admin" | "team_manager") => {
    setEntrySource(v);
    setRegistrationMode(v === "self" ? "open" : "invite");
    if (v === "admin") {
      setRegistrationRequired(confirmationRequired);
      setApprovalGate("none");
    } else {
      setRegistrationRequired(true);
      setApprovalGate(confirmationRequired ? "admin_accept" : "none");
    }
  };

  const applyConfirmation = (on: boolean) => {
    if (entrySource === "admin") {
      setRegistrationRequired(on);
      setApprovalGate("none");
    } else {
      setRegistrationRequired(true);
      setApprovalGate(on ? "admin_accept" : "none");
    }
  };

  const applyEntryFee = (value: string) => {
    setEntryFeeRand(value);
    const amount = Math.max(0, Number(value) || 0);
    setPaymentRequired(amount > 0);
    if (amount <= 0) setPaymentTiming("on_entry");
  };

  const entrySourceLabel =
    entrySource === "admin" ? "I choose the field"
      : entrySource === "team_manager" ? "team managers enter squads"
      : "players enter themselves";
  const confirmationLabel = confirmationRequired
    ? (entrySource === "admin" ? "players must accept" : "organiser must approve")
    : "no confirmation needed";
  const feeLabel = !isPaidTournament
    ? "free"
    : `R${entryFeeAmount} ${paymentTiming === "after_acceptance" ? "payable after acceptance" : "payable on entry"}`;
  const entryFlowSummary = `${champName || "This tournament"} — ${entrySourceLabel} · ${confirmationLabel} · ${feeLabel}`;
  // Defer pair formation only when players self-pair (need registrations to
  // arrive first). Admin-pair mode always gets the full wizard so the admin can
  // pick players and build pairs upfront — deferring it was jumping the admin
  // straight from Registration to Review with no Players step, which read as
  // "you must select players first" with nowhere to do it.
  const awaitingPlayerPairs =
    isDoubles && doublesPairs.length === 0 && partnerMode === "players";
  const activeSteps = useMemo<WizardStep[]>(() => {
    if (!awaitingPlayerPairs) return STEPS;
    return selfPairInviteSelection
      ? ["category", "structure", "registration", "courts", "invites", "players", "review"]
      : ["category", "structure", "registration", "courts", "invites", "review"];
  }, [awaitingPlayerPairs, selfPairInviteSelection]);
  const stepIdx = activeSteps.indexOf(step);

  useEffect(() => {
    if (step === "preview") return; // preview is programmatic, not part of activeSteps
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

  /**
   * A draft only needs identity: a club (from the admin session) and a name.
   * Dates, courts, structure, players and fees belong to step validation and
   * to Generate — never to saving progress.
   */
  const canSaveDraft = () => !!clubId && !!champName.trim();

  // Autosave the current wizard settings to club_champs as a draft.
  // Only touches the settings row — never matches/entries/registrations.
  const saveDraft = async () => {
    if (!clubId) return editingChampId;
    if (!champName.trim() && !editingChampId) return editingChampId;
    const defaultName = `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Tournament ${new Date().getFullYear()}`;
    const rawPayload: Record<string, any> = {
      name: champName || defaultName,
      gender,
      match_type: matchType,
      num_groups: numGroups,
      enable_playoffs: enablePlayoffs,
      champion_scope: championScope,
      // Drafts may have no dates yet — persist null rather than "".
      start_date: startDate || null,
      end_date: endDate || null,
      play_days: Array.from(playDays),
      start_time: startTime,
      end_time: endTime,
      match_duration_minutes: matchDuration,
      scoring_mode: scoringMode,
      swiss_pools: swissPools,
      league_draw_styles: leagueDrawStyles,
      pool_sizes: poolSizeOverrides,
      pool_allocation: poolAllocation,
      swiss_rounds: (roundFormat === "swiss" || Object.values(leagueFormats).includes("swiss")) ? swissRounds : null,
      expected_players: Object.keys(expectedPlayers).length > 0 ? expectedPlayers : null,
      league_formats: usePerLeagueFormats ? leagueFormats : null,
      // Legacy knockout sub-draw map, derived from the division's pool count.
      league_sections: sectionsFromPools(swissPools, (gn) => formatForLeague(gn) === "knockout", numGroups, leagueSections),
      points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
      best_of: bestOf > 0 ? bestOf : null,
      play_all_games: playAllGames,
      win_condition: winCondition,
      group_durations: groupDurations,
      group_break_minutes: groupBreakMinutes,
      group_labels: groupLabels,
      default_break_minutes: defaultBreakMinutes,
      court_rotation_minutes: courtRotationMinutes,
      avoid_back_to_back: avoidBackToBack,
      round_format: roundFormat,
      bye_handling: byeHandling,
      source_league_id: Array.from(sourceLeagueIds)[0] || null,
      source_league_ids: Array.from(sourceLeagueIds),
      registration_mode: effectiveRegistrationMode,
      partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
      registration_opens_at: registrationRequired ? fromLocalInputValue(registrationOpensAt) : null,
      registration_closes_at: registrationRequired ? fromLocalInputValue(registrationClosesAt) : null,
      entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
      payment_methods: Array.from(paymentMethods),
      payment_required: paymentRequired,
      registration_required: registrationRequired,
      invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
      invite_source: inviteSource,
      invite_audience: inviteAudience,
      invite_audience_league_ids: Array.from(audienceLeagueIds),
      invite_audience_member_ids: Array.from(audienceMemberIds),
      invite_audience_club_ids: audienceClubIds,
      invite_audience_include_individuals: audienceIncludeIndividuals,
      entry_source: entrySource,
      approval_gate: approvalGate,
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
      ranking_weight: rankingWeight,
      ladder_affects: ladderAffects,
      day_schedules: customizeDailySchedule ? daySchedules : [],
      court_ids: Array.from(selectedCourtIds),
      schedule_mode: scheduleMode,
      scheduling_mode: schedulingMode,
      round_play_by: serializeRoundDeadlines(roundDeadlines),

      playoff_break_minutes: Math.max(0, Math.round(Number(playoffBreakMinutes) || 0)),
      playoff_date: playoffDate || null,
    };
    // A draft can legitimately have unanswered choices ("" in the wizard state).
    // Those columns are CHECK-constrained, so send them only once chosen.
    const payload = sanitizeDraftPayload(rawPayload);
    // Fields that live only on the tournaments table (not on the legacy view).
    const extras = {
      event_type: eventType,
      max_entrants: maxEntrants ? Math.max(0, Math.round(Number(maxEntrants))) : null,
      max_per_league: maxPerLeague ? Math.max(0, Math.round(Number(maxPerLeague))) : null,
      seeding_source: seedingSource,
      league_genders: Object.keys(leagueGenders).length > 0 ? leagueGenders : null,
      league_match_types: Object.keys(leagueMatchTypes).length > 0 ? leagueMatchTypes : null,
      league_scoring_modes: Object.keys(leagueScoringModes).length > 0 ? leagueScoringModes : null,
      league_points_per_game: Object.keys(leaguePointsPerGame).length > 0 ? leaguePointsPerGame : null,
      league_best_of: Object.keys(leagueBestOf).length > 0 ? leagueBestOf : null,
      league_win_conditions: Object.keys(leagueWinConditions).length > 0 ? leagueWinConditions : null,
      league_play_all_games: Object.keys(leaguePlayAll).length > 0 ? leaguePlayAll : null,
      league_playoffs: Object.keys(leaguePlayoffs).length > 0 ? leaguePlayoffs : null,
      league_bye_handling: Object.keys(leagueByeHandling).length > 0 ? leagueByeHandling : null,
      league_forfeit_rules: Object.keys(leagueForfeitRules).length > 0 ? leagueForfeitRules : null,
      league_forfeit_points: Object.keys(leagueForfeitPoints).length > 0 ? leagueForfeitPoints : null,
      participating_club_ids: venueClubIds.filter((id) => id !== clubId),
      // "Players from" per competition division.
      league_sources: Object.fromEntries(
        Object.entries(leagueSources).map(([k, v]) => [k, v.leagueIds]),
      ),
      league_source_modes: Object.fromEntries(
        Object.entries(leagueSources).map(([k, v]) => [k, v.mode]),
      ),
      // Manual seeding: the confirmed draw boards, the organiser's player
      // order and which divisions were arranged by hand. Without these the
      // wizard would re-seed automatically on the next open.
      manual_draws: Object.keys(manualDraws).length > 0 ? manualDraws : null,
      seed_order: playerOrder.length > 0 ? playerOrder : null,
      manual_seed_divisions: manualSeedGroups.size > 0 ? Array.from(manualSeedGroups) : null,
      invite_extra_details: inviteExtraDetails.trim() || null,
    };

    const saveExtras = async (id: string) => {
      // Hand-arranged draws are precious: a wizard save must never wipe a
      // division the current editor session simply doesn't have in memory
      // (stale tab, draw confirmed elsewhere). Merge per division instead of
      // replacing the whole object, and never write null over stored draws.
      const nextExtras: Record<string, any> = { ...extras };
      const { data: current } = await fromExt("tournaments")
        .select("manual_draws, manual_seed_divisions")
        .eq("id", id)
        .maybeSingle();
      const storedDraws = ((current as any)?.manual_draws as Record<string, any> | null) || {};
      const mergedDraws = { ...storedDraws, ...manualDraws };
      nextExtras.manual_draws = Object.keys(mergedDraws).length > 0 ? mergedDraws : null;
      if (manualSeedGroups.size === 0) {
        const storedSeedDivs = ((current as any)?.manual_seed_divisions as number[] | null) || [];
        if (storedSeedDivs.length > 0) nextExtras.manual_seed_divisions = storedSeedDivs;
      }
      const { error } = await fromExt("tournaments").update(sanitizeExtrasPayload(nextExtras)).eq("id", id);
      if (error) console.warn("Tournament extras save failed:", error.message);
      // "Who may enter" is a governance field — keep the single copy in sync.
      const { error: govErr } = await fromExt("tournament_governance")
        .upsert(sanitizeDraftPayload({ tournament_id: id, eligibility_scope: eligibilityScope }), { onConflict: "tournament_id" } as any);
      if (govErr) console.warn("Eligibility save failed:", govErr.message);
    };

    try {
      if (editingChampId) {
        const { error } = await fromExt("club_champs").update(payload).eq("id", editingChampId);
        if (error) throw error;
        await saveExtras(editingChampId);
      } else {
        const { data, error } = await fromExt("club_champs")
          .insert({ club_id: clubId, owner_org_id: ownerOrgId ?? undefined, status: "planning", ...payload })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) {
          setEditingChampId(data.id);
          await saveExtras(data.id);
        }
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
  const saveEntriesDraft = async (
    champIdOverride?: string,
    _legacyStructureLeagueIds?: Set<string>,
    opts?: { inviteRosterOnly?: boolean; materializeAudience?: boolean },
  ) => {
    const champIdToUse = champIdOverride || editingChampId;
    if (!champIdToUse) return;
    try {
      // The invite roster comes from the INVITATION AUDIENCE only — never from
      // the Structure / draw source. A member who plays no league is still
      // invited when the audience is "All club members".
      const inviteSeedIds = new Set(selectedPlayerIds);
      let audienceIds = resolvedAudience.memberIds;
      if (inviteAudience === "leagues" && audienceLeagueIds.size > 0) {
        // Re-read at save time so the roster is canonical even if the cached
        // registration query is stale.
        const { data: audienceRegs, error: audienceRegsErr } = await fromExt("member_league_registrations")
          .select("club_member_id, is_reserve")
          .in("league_id", Array.from(audienceLeagueIds));
        if (audienceRegsErr) throw audienceRegsErr;
        const fresh = new Set(audienceIds);
        (audienceRegs || []).forEach((r: any) => {
          if (!r.club_member_id || inviteExcludedMemberIds.has(r.club_member_id)) return;
          if (!inviteIncludeReserves && r.is_reserve) return;
          fresh.add(r.club_member_id);
        });
        audienceIds = Array.from(fresh);
      }
      // Open (self-registration) tournaments with an "all club members"
      // audience are not materialised as rows on save — the roster is created
      // when the organiser actually sends invitations.
      const seedsFromAudience =
        audienceIds.length > 0 &&
        (registrationUsesInviteList || opts?.materializeAudience || inviteAudience !== "all_club");
      if (seedsFromAudience) audienceIds.forEach((id) => inviteSeedIds.add(id));
      if (registrationUsesInviteList || seedsFromAudience) {


        const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
        const ids = await promoteVisitorIds(Array.from(inviteSeedIds));
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
        // wipe a member who's already registered through payment). Open
        // tournaments keep every row — self-registrations are not ours to prune.
        if (registrationUsesInviteList) {
          const delQ = fromExt("club_champs_registrations")
            .delete()
            .eq("champ_id", champIdToUse)
            .eq("invited_by_admin", true)
            .in("status", ["invited", "pending_payment", "pending_eft"]);
          if (ids.length > 0) {
            await delQ.not("club_member_id", "in", `(${ids.join(",")})`);
          } else {
            await delQ;
          }
        }
        qc.invalidateQueries({ queryKey: ["champ-invitees", champIdToUse] });
        // Self-pair doubles has no pairs yet — the invite list is all there is.
        if (selfPairInviteSelection) return;
      }
      // Callers that only need registration rows to exist (invite picker, test
      // invite) must never fall through to group allocation — that marks the
      // whole roster as entered and fires "entry confirmed" notifications.
      if (opts?.inviteRosterOnly) return;



      let allocatedMemberIds: string[] = [];
      /** member_id → 1-based division numbers the organiser allocated them to. */
      let divisionChoicesToSync: Map<string, number[]> | null = null;

      // Collect every visitor-* ID that will hit the DB so we can promote them
      // to real club_members rows in one batch and build a lookup map.
      const visitorRawIds: string[] = isDoubles
        ? (doublesPairs as any[]).flatMap((p) => [p.player1Id, p.player2Id]).filter((id: string) => id?.startsWith("visitor-"))
        : (groups as ClubMember[][]).flatMap((gp) => gp.map((p) => p.id)).filter((id: string) => id?.startsWith("visitor-"));
      const promotedList = visitorRawIds.length > 0 ? await promoteVisitorIds(visitorRawIds) : [];
      const visitorMap = new Map<string, string>();
      visitorRawIds.forEach((raw, i) => visitorMap.set(raw, promotedList[i]));
      const resolveId = (id: string) => (id?.startsWith("visitor-") ? (visitorMap.get(id) || toDbId(id)) : id);

      if (isDoubles) {
        if (doublesPairs.length === 0) {
          const { error: deleteErr } = await fromExt("club_champs_entries").delete().eq("champ_id", champIdToUse);
          if (deleteErr) throw deleteErr;
          await syncDoublesRegistrationsForPairs(champIdToUse, []);
          return;
        }
        const rows = await persistDoublesPairsDraft(champIdToUse, doublesPairs);
        allocatedMemberIds = rows.flatMap((r: any) => [r.club_member_id, r.partner_member_id]).filter(Boolean);
      } else {
        if (selectedPlayerIds.size === 0) return;
        const rows = (groups as ClubMember[][]).flatMap((groupPlayers, gi) =>
          groupPlayers.map((p, orderIndex) => ({
            champ_id: champIdToUse,
            club_member_id: resolveId(p.id),
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
        // The organiser's allocation is authoritative for WHICH divisions a
        // player takes part in. Mirror it onto division_choices, otherwise the
        // player's original sign-up choices are re-applied on the next load and
        // the admin's change silently reverts.
        divisionChoicesToSync = new Map<string, number[]>();
        for (const r of rows as any[]) {
          const list = divisionChoicesToSync.get(r.club_member_id) || [];
          if (!list.includes(r.group_number)) list.push(r.group_number);
          divisionChoicesToSync.set(r.club_member_id, list);
        }
        divisionChoicesToSync.forEach((list) => list.sort((a, b) => a - b));
      }


      // Auto-register every allocated player. Once admin places a member into a
      // pair / group they are considered confirmed for the tournament — no
      // separate payment / registration step is required.
      const uniqueIds = Array.from(new Set(allocatedMemberIds));
      if (uniqueIds.length > 0) {
        const pairedPartnerByMember = isDoubles && partnerMode === "admin"
          ? new Map(
              (groups as DoublePair[][]).flatMap((groupPairs) =>
                groupPairs.flatMap((pair) => {
                  const p1 = resolveId(pair.player1Id);
                  const p2 = resolveId(pair.player2Id);
                  return [[p1, p2], [p2, p1]] as [string, string][];
                })
              )
            )
          : new Map<string, string>();
        const regRows = uniqueIds.map((memberId) => ({
          champ_id: champIdToUse,
          club_member_id: memberId,
          ...(pairedPartnerByMember.has(memberId)
            ? { partner_member_id: pairedPartnerByMember.get(memberId), partner_confirmed: true }
            : {}),
          status: "paid",
          // Do NOT set invited_by_admin here — the notify_champ_registration_event
          // trigger fires "Tournament invitation" notifications on INSERT when this
          // flag is true. Allocating players into groups is not the same as sending
          // invites; notifications must only go out when the admin explicitly clicks
          // "Send invites" (which sets invited_by_admin=true via UPDATE, not INSERT).
          invited_by_admin: false,
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

      // Keep division_choices in step with the saved allocation so the change
      // sticks after a reload (and players who were moved out of a division
      // stop reappearing in it).
      if (divisionChoicesToSync) {
        for (const [memberId, divisions] of divisionChoicesToSync) {
          const { error } = await fromExt("club_champs_registrations")
            .update({ division_choices: divisions })
            .eq("champ_id", champIdToUse)
            .eq("club_member_id", memberId);
          if (error) console.warn("division_choices sync failed", memberId, error);
        }
      }

    } catch (e) {
      console.warn("Tournament entries draft save failed:", e);
      throw e;
    }
  };

  const withdraw = async (id: string, isPair = false) => {
    const cid = editingChampId;
    if (isPair) {
      const pair = doublesPairs.find((p) => p.id === id);
      if (!pair) {
        toast.error("Pair not found");
        return;
      }
    } else if (!selectedPlayerIds.has(id)) {
      toast.error("Player not in roster");
      return;
    }
    try {
      const pair = isPair ? doublesPairs.find((p) => p.id === id) : undefined;
      const rawIds = pair ? [pair.player1Id, pair.player2Id] : [id];
      const resolvedIds = rawIds.length > 0 ? await promoteVisitorIds(rawIds) : [];
      if (cid && resolvedIds.length > 0) {
        for (const resolvedId of resolvedIds) {
          await fromExt("club_champs_entries")
            .delete()
            .eq("champ_id", cid)
            .or(`club_member_id.eq.${resolvedId},partner_member_id.eq.${resolvedId}`);
        }
        await fromExt("club_champs_registrations")
          .update({
            status: "cancelled",
            confirmed_at: null,
            confirmation_source: null,
            partner_member_id: null,
            partner_confirmed: false,
          })
          .eq("champ_id", cid)
          .in("club_member_id", resolvedIds);
        qc.invalidateQueries({ queryKey: ["champ-invitees", cid] });
        qc.invalidateQueries({ queryKey: ["champ-registrations", cid] });
      }
      if (isPair) {
        setDoublesPairs((prev) => prev.filter((p) => p.id !== id));
        setPairGroupAssignments((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setPairOrder((prev) => prev.filter((x) => x !== id));
      } else {
        setSelectedPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setGroupAssignments((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setExtraDivisions((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setPlayerOrder((prev) => prev.filter((x) => x !== id));
        setUnassignedEntrantIds((prev) => prev.filter((x) => x !== id));
        setEligibilityOverrides((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      toast.success("Withdrawn from tournament");
    } catch (e: unknown) {
      toast.error("Could not withdraw: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleManualSave = async () => {
    if (!clubId) {
      toast.error("No club selected");
      return;
    }
    // A draft needs a name only — dates, courts and structure come later.
    if (!canSaveDraft() && !editingChampId) {
      toast.error("Give the tournament a name first, then save progress");
      return;
    }
    try {
      const savedChampId = await saveDraft();
      if (!savedChampId) {
        toast.error("Could not save progress — the draft was not created");
        return;
      }
      await saveEntriesDraft(savedChampId);
      toast.success(startDate && endDate ? "Progress saved" : "Draft saved — add dates when you're ready");
    } catch (e: any) {
      toast.error(e?.message ? `Could not save progress: ${e.message}` : "Could not save progress");
    }
  };

  /**
   * The "Tournament details" block inside the invite message is derived, never
   * typed. It is inserted automatically and re-generated whenever anything in
   * the tournament setup changes, so the organiser always sees the current
   * configuration. Anything the organiser types below the block is preserved.
   */
  const autoDetailBlock = useMemo(() => {
    const lines = buildInviteDetailLines({
      gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
      startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
      registrationOpensAt, registrationClosesAt, entryFeeRand,
      pointsPerGame, bestOf,
      registrationRequired, registrationMode: (registrationMode || "open") as any,
      tournamentName: champName, divisionFormats: inviteDivisionFormats(),
      selfScheduled: schedulingMode === "self", roundDeadlines,
    });
    if (!lines.length) return "";
    return `— Tournament details —\n${lines.map((l) => `• ${l}`).join("\n")}\n— End details —`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
    startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
    registrationOpensAt, registrationClosesAt, entryFeeRand, pointsPerGame, bestOf,
    registrationRequired, registrationMode, champName, schedulingMode, roundDeadlines,
    divisionFormatsKey,
  ]);

  useEffect(() => {
    if (!autoDetailBlock) return;
    setDescription((prev) => {
      const extra = prev
        .replace(/^[\s\S]*?— Tournament details —\n([\s\S]*?)\n— End details —\n?/m, "")
        .trimStart();
      const next = extra ? `${autoDetailBlock}\n\n${extra}` : autoDetailBlock;
      return next === prev ? prev : next;
    });
  }, [autoDetailBlock]);


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
    showWizard, clubId, champName, gender, matchType, numGroups, enablePlayoffs, championScope, poolAllocation,
    startDate, endDate, playDays, startTime, endTime, matchDuration, scoringMode, pointsPerGame, bestOf,
    groupDurations, courtRotationMinutes, avoidBackToBack, roundFormat, byeHandling, sourceLeagueIds, registrationMode,
    partnerMode, registrationOpensAt, registrationClosesAt, entryFeeRand,
    paymentMethods, paymentRequired, registrationRequired, inviteMethods, includeVisitors,
    selectedVisitorClubs, description,
    customizeDailySchedule, daySchedules, selectedCourtIds,
    // Selection / pair / group assignment state — persist immediately when changed
    selectedPlayerIds, doublesPairs, groupAssignments, pairGroupAssignments,
    // Manual seeding / confirmed draw boards must persist as soon as they change.
    manualDraws, playerOrder, manualSeedGroups,

  ]);






  // Helper to strip "visitor-" prefix for DB inserts. Null-safe: an incomplete
  // pair (e.g. a withdrawn partner) must not crash the whole save.
  const toDbId = (id?: string | null) => (id ? String(id).replace(/^visitor-/, "") : null) as any;

  const syncDoublesRegistrationsForPairs = async (
    champIdToUse: string,
    pairs: Array<{ player1Id: string; player2Id: string }>,
  ) => {
    if (!champIdToUse || !isDoubles || partnerMode !== "admin") return;

    const desired = new Map<string, string>();
    pairs.forEach((p) => {
      if (!p.player1Id || !p.player2Id || p.player1Id === p.player2Id) return;
      desired.set(p.player1Id, p.player2Id);
      desired.set(p.player2Id, p.player1Id);
    });

    const { data: existingRegs, error: fetchErr } = await fromExt("club_champs_registrations")
      .select("club_member_id, partner_member_id, partner_confirmed, status")
      .eq("champ_id", champIdToUse);
    if (fetchErr) throw fetchErr;

    const existingByMember = new Map<string, any>();
    for (const r of (existingRegs || []) as any[]) existingByMember.set(r.club_member_id, r);

    const inserts: any[] = [];
    const updates: Array<{ memberId: string; patch: Record<string, any> }> = [];

    for (const [memberId, partnerId] of desired.entries()) {
      const existing = existingByMember.get(memberId);
      if (!existing) {
        inserts.push({
          champ_id: champIdToUse,
          club_member_id: memberId,
          partner_member_id: partnerId,
          partner_confirmed: true,
          status: "paid",
          invited_by_admin: false,
          fee_paid_cents: 0,
        });
      } else if (
        existing.partner_member_id !== partnerId ||
        existing.partner_confirmed !== true ||
        !["paid", "waived"].includes(existing.status)
      ) {
        updates.push({
          memberId,
          patch: {
            partner_member_id: partnerId,
            partner_confirmed: true,
            status: "paid",
          },
        });
      }
    }

    // Clear stale partner links that no longer match the admin-built pairs.
    for (const r of (existingRegs || []) as any[]) {
      const wantedPartner = desired.get(r.club_member_id);
      const isStale = r.partner_member_id && (!wantedPartner || wantedPartner !== r.partner_member_id);
      if (isStale) {
        updates.push({
          memberId: r.club_member_id,
          patch: { partner_member_id: null, partner_confirmed: false },
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await fromExt("club_champs_registrations").insert(inserts);
      if (error) throw error;
    }
    for (const u of updates) {
      const { error } = await fromExt("club_champs_registrations")
        .update(u.patch)
        .eq("champ_id", champIdToUse)
        .eq("club_member_id", u.memberId);
      if (error) throw error;
    }
  };

  const persistDoublesPairsDraft = async (champIdToUse: string, pairs: DoublePair[]) => {
    const rawIds = pairs.flatMap((p) => [p.player1Id, p.player2Id]).filter(Boolean);
    const promotedList = rawIds.length > 0 ? await promoteVisitorIds(rawIds) : [];
    const visitorMap = new Map<string, string>();
    rawIds.forEach((raw, i) => visitorMap.set(raw, promotedList[i]));
    const resolveId = (id: string) => (id?.startsWith("visitor-") ? (visitorMap.get(id) || toDbId(id)) : id);
    const orderIdx = new Map(pairOrder.map((id, i) => [id, i]));
    const groupCount = Math.max(1, numGroups || 1);
    const rows = [...pairs]
      .sort((a, b) => (orderIdx.get(a.id) ?? 1e9) - (orderIdx.get(b.id) ?? 1e9))
      .map((pair, orderIndex) => {
        const groupIndex = Math.min(groupCount - 1, Math.max(0, pairGroupAssignments.get(pair.id) ?? 0));
        return {
          champ_id: champIdToUse,
          club_member_id: resolveId(pair.player1Id),
          partner_member_id: resolveId(pair.player2Id),
          group_number: groupIndex + 1,
          order_index: orderIndex,
        };
      });

    const { error: deleteErr } = await fromExt("club_champs_entries").delete().eq("champ_id", champIdToUse);
    if (deleteErr) throw deleteErr;
    if (rows.length > 0) {
      const { error: insertErr } = await fromExt("club_champs_entries").insert(rows);
      if (insertErr) throw insertErr;
    }
    await syncDoublesRegistrationsForPairs(
      champIdToUse,
      rows.map((r) => ({ player1Id: r.club_member_id, player2Id: r.partner_member_id })),
    );
    return rows;
  };

  // Promote any `visitor-<uuid>` IDs to real club_members rows (role='visitor')
  // so tournament tables (which only accept club_member_id) can reference them.
  // Idempotent: keyed by club_member_number='visitor:<visitor_id>' so re-selecting
  // the same visitor reuses the same member row instead of creating duplicates.
  // Returns the input list with visitor-* IDs mapped to the promoted member IDs.
  const promoteVisitorIds = async (ids: string[]): Promise<string[]> => {
    const visitorIds = ids.filter((id) => typeof id === "string" && id.startsWith("visitor-")).map((id) => id.slice("visitor-".length));
    if (visitorIds.length === 0) return ids;
    const markers = visitorIds.map((vid) => `visitor:${vid}`);
    // Fetch already-promoted rows
    const { data: existing } = await fromExt("club_members")
      .select("id, club_member_number")
      .eq("club_id", clubId)
      .in("club_member_number", markers);
    const promoted = new Map<string, string>(); // visitor_id -> member_id
    for (const row of (existing || []) as any[]) {
      const vid = String(row.club_member_number || "").replace(/^visitor:/, "");
      if (vid) promoted.set(vid, row.id);
    }
    const missing = visitorIds.filter((vid) => !promoted.has(vid));
    if (missing.length > 0) {
      const rows = missing.map((vid) => {
        const v = allVisitors.find((x) => x.id === vid);
        return {
          club_id: clubId,
          role: "visitor" as const,
          club_member_number: `visitor:${vid}`,
          name: v ? `${v.first_name} ${v.last_name}`.trim() : "Visitor",
          gender: v?.category === "Ladies" ? "Ladies" : "Men",
          home_club_name: v?.home_club_name || null,
          status: "active" as const,
        };
      });
      const { data: inserted, error: insErr } = await fromExt("club_members")
        .insert(rows)
        .select("id, club_member_number");
      if (insErr) throw insErr;
      for (const row of (inserted || []) as any[]) {
        const vid = String(row.club_member_number || "").replace(/^visitor:/, "");
        if (vid) promoted.set(vid, row.id);
      }
    }
    return ids.map((id) => {
      if (typeof id !== "string" || !id.startsWith("visitor-")) return id;
      const vid = id.slice("visitor-".length);
      return promoted.get(vid) || id;
    });
  };


  // Build visitor entries as pseudo-members for the player list.
  // Dedupe against existing club members by normalized full name so a person
  // who already exists as a member (or was promoted from a previous visitor
  // selection) does not appear twice in the invite list — which would let the
  // admin tick both and end up with a duplicate + an "unknown player" in the
  // schedule when only one side resolves to a real member id.
  const visitorAsMembers = useMemo(() => {
    const norm = (s: string | null | undefined) =>
      (s || "").trim().toLowerCase().replace(/\s+/g, " ");
    const memberNames = new Set(
      (members || []).map((m: any) => norm(m.name || m.profiles?.name))
    );
    return filteredVisitors
      .filter((v) => !memberNames.has(norm(`${v.first_name} ${v.last_name}`)))
      .map((v) => ({
        id: `visitor-${v.id}`,
        name: `${v.first_name} ${v.last_name}`,
        gender: v.category === "Ladies" ? "Ladies" : "Men",
        ladder_position: null as number | null,
        profiles: null,
        _isVisitor: true,
        _homeClub: v.home_club_name,
      }));
  }, [filteredVisitors, members]);

  // Combined list of members + visitors for admin player selection.
  // Admins can shortlist any club member (gender filter is only used for self-registration
  // eligibility and league-pre-fill — not for the manual invite list).
  const allSelectablePlayers = useMemo(() => {
    let baseMembers = [...members];
    // When the admin has narrowed by home club, hide out-of-club members whose
    // home club isn't in the selected set. Local members (no home_club_name)
    // are always kept.
    if (selectedVisitorClubs.size > 0) {
      baseMembers = baseMembers.filter((m: any) => {
        const hc = m?.home_club_name;
        if (!hc) return true;
        return selectedVisitorClubs.has(hc);
      });
    }
    const sortedMembers = baseMembers.sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
    return [...sortedMembers, ...visitorAsMembers] as any[];
  }, [members, visitorAsMembers, selectedVisitorClubs]);

  const selectedPlayers = useMemo(
    () => allSelectablePlayers.filter((m: any) => selectedPlayerIds.has(m.id)),
    [allSelectablePlayers, selectedPlayerIds]
  );

  /**
   * Keep league allocations seeded automatically.
   *
   * Singles entrants are allocated to the division whose "primarily players
   * from" source names the club league they actually play in — NOT by a blind
   * snake draft, which used to drop a League 2 player into League 1. Manual
   * placements are always preserved, and anyone who plays in none of the source
   * leagues stays unassigned until the organiser places them.
   */
  useEffect(() => {
    if (!showWizard) return;
    const n = numGroups || 0;
    if (n < 1) return;
    const snake = (i: number) => (Math.floor(i / n) % 2 === 0 ? i % n : n - 1 - (i % n));

    if (isDoubles) {
      const ids = doublesPairs.map((p) => p.id);
      if (ids.length === 0) return;
      const stale = ids.some((id) => {
        const g = pairGroupAssignments.get(id);
        return g === undefined || g >= n;
      }) || pairGroupAssignments.size !== ids.length;
      if (!stale) return;
      setPairGroupAssignments((prev) => {
        const next = new Map<string, number>();
        ids.forEach((id, i) => {
          const existing = prev.get(id);
          next.set(id, existing !== undefined && existing < n ? existing : snake(i));
        });
        return next;
      });
      return;
    }

    const ids = selectedPlayers.map((p: any) => p.id);
    if (ids.length === 0) {
      setUnassignedEntrantIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const { assignments, unassigned } = allocateEntrantsToDivisions({
      entrantIds: ids,
      numDivisions: n,
      sources: leagueSources,
      registrationsByLeague,
      existing: groupAssignments,
      overrides: eligibilityOverrides,
      // Anyone with a recorded decision (primary division or any additional
      // division) is locked in: the auto-seeder must never move them again.
      locked: new Set<string>([...groupAssignments.keys(), ...extraDivisions.keys()]),
    });


    setUnassignedEntrantIds((prev) =>
      prev.length === unassigned.length && prev.every((id, i) => id === unassigned[i]) ? prev : unassigned,
    );

    const sameAsBefore =
      assignments.size === groupAssignments.size &&
      Array.from(assignments.entries()).every(([id, gi]) => groupAssignments.get(id) === gi);
    if (sameAsBefore) return;
    setGroupAssignments(assignments);
  }, [
    showWizard,
    numGroups,
    isDoubles,
    doublesPairs,
    selectedPlayers,
    groupAssignments,
    pairGroupAssignments,
    leagueSources,
    registrationsByLeague,
    eligibilityOverrides,
    extraDivisions,
  ]);


  // Number of "entities" (players for singles, pairs for doubles)
  const entityCount = isDoubles ? doublesPairs.length : selectedPlayerIds.size;

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handlePlayerDragEnd = (groupIndex: number) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const groupIds = (groups as ClubMember[][])[groupIndex].map((p) => p.id);
    // Rows are rendered grouped per pool (pool A's rows, then pool B's …), so a
    // drag happens in that VISUAL order, not in the raw seed order. Flattening
    // the pool blocks first means the order we store back reproduces exactly
    // the pools the organiser was looking at — nothing silently rebalances.
    const visualIds = flattenPools(groupIds, poolsForDivision(groupIndex + 1), poolOptsFor(groupIndex));
    // Admins may move an entrant FREELY, including into another pool: the pool
    // sizes follow the drop (source loses a slot, target gains one) instead of
    // a counter-swap, and the new sizes are persisted for this division.
    const moved = moveVisual(
      visualIds,
      String(active.id),
      String(over.id),
      poolsForDivision(groupIndex + 1),
      poolOptsFor(groupIndex),
    );
    if (!moved) return;
    const reorderedGroupIds = moved.ids;
    setPoolSizeOverrides((m) => ({ ...m, [String(groupIndex + 1)]: moved.sizes }));

    // Rebuild the full order: everyone else stays put, this division's slots
    // take the new visual order. `applyDivisionOrder` normalises the global
    // list first so no dragged entrant can fall off the end.
    const next = applyDivisionOrder(
      playerOrder,
      selectedPlayers.map((p: any) => p.id),
      reorderedGroupIds,
    );
    setPlayerOrder(next);

    // Only a deliberate drag inside this division switches it off ladder order.
    setManualSeedGroups((prev) => (prev.has(groupIndex) ? prev : new Set(prev).add(groupIndex)));
  };

  const handlePairDragEnd = (groupIndex: number) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const groupIds = (groups as DoublePair[][])[groupIndex].map((p) => p.id);
    // Same pool-block visual order as singles — see handlePlayerDragEnd.
    const visualIds = flattenPools(groupIds, poolsForDivision(groupIndex + 1), poolOptsFor(groupIndex));
    const moved = moveVisual(
      visualIds,
      String(active.id),
      String(over.id),
      poolsForDivision(groupIndex + 1),
      poolOptsFor(groupIndex),
    );
    if (!moved) return;
    const reorderedGroupIds = moved.ids;
    setPoolSizeOverrides((m) => ({ ...m, [String(groupIndex + 1)]: moved.sizes }));

    const next = applyDivisionOrder(
      pairOrder,
      doublesPairs.map((p) => p.id),
      reorderedGroupIds,
    );
    setPairOrder(next);

    setManualSeedGroups((prev) => (prev.has(groupIndex) ? prev : new Set(prev).add(groupIndex)));
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
    selectedPlayers.forEach((p) => {
      // No assignment = unassigned (plays in none of the source leagues).
      // They stay out of the draw until the organiser places them.
      const gi = groupAssignments.get(p.id);
      if (gi !== undefined && gi < numGroups) g[gi].push(p);
      // Every additional division the player entered — the same person may
      // legitimately hold a row in several divisions and keeps their rank.
      extraDivisions.get(p.id)?.forEach((extra) => {
        if (extra === gi || extra >= numGroups) return;
        g[extra].push(p);
      });
    });
    // Seed order per division: club ladder ascending, unranked last, unless
    // the organiser deliberately reordered that division by hand.
    return g.map((list, gi) =>
      sortDivisionEntrants(list as any, {
        manual: manualSeedGroups.has(gi),
        manualOrder: playerOrder,
      }) as ClubMember[],
    );
  }, [isDoubles, selectedPlayers, doublesPairs, numGroups, groupAssignments, extraDivisions, pairGroupAssignments, playerOrder, pairOrder, manualSeedGroups]);

  // Schedule preview
  const schedulePreview = useMemo(() => {
    // Self-scheduled tournaments have no play days, courts or time slots — the
    // draw is still built, it just comes out unscheduled (players book later).
    if (!startDate || !endDate) return null;
    if (schedulingMode !== "self" && (playDays.size === 0 || selectedCourtIds.size === 0)) return null;

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
    // Player-arranged tournaments legitimately have no sessions/courts/slots —
    // the draw is still built and simply comes out unscheduled. Only the
    // club-scheduled modes need a usable session grid.
    if (schedulingMode !== "self") {
      if (matchDuration <= 0) return null;
      if (sessions.length === 0) return null;
    }


    // Distinct dates (for the summary card)
    const allDates = Array.from(new Set(sessions.map((s) => s.date))).map((d) => parseISO(d));

    // ── Auto-detect sub-day sessions for the Spread algorithm ─────────────
    // A raw session longer than MAX_SESSION_MIN gets split in half at the
    // midpoint (rounded to matchDuration) into AM/PM sub-sessions. Every
    // resulting session carries a stable `key` that slots reference so the
    // spread quota can be enforced per-session (not just per-date).
    const MAX_SESSION_MIN = 5 * 60;
    type SessionMeta = { key: string; date: string; startMin: number; endMin: number; courtIds: number[]; label: string };
    const sessionMetas: SessionMeta[] = [];
    const perDateIdx = new Map<string, number>();
    for (const s of sessions) {
      const span = s.endMin - s.startMin;
      const pieces: Array<{ startMin: number; endMin: number; label: string }> = [];
      if (span > MAX_SESSION_MIN && Number.isFinite(matchDuration) && matchDuration > 0) {
        // Split into AM/PM at the midpoint, aligned to matchDuration.
        const rawMid = s.startMin + Math.floor(span / 2);
        const midSteps = Math.max(1, Math.floor((rawMid - s.startMin) / matchDuration));
        const mid = s.startMin + midSteps * matchDuration;
        pieces.push({ startMin: s.startMin, endMin: mid, label: "AM" });
        pieces.push({ startMin: mid, endMin: s.endMin, label: "PM" });
      } else {
        pieces.push({ startMin: s.startMin, endMin: s.endMin, label: "" });
      }
      for (const p of pieces) {
        const idx = (perDateIdx.get(s.date) ?? 0);
        perDateIdx.set(s.date, idx + 1);
        sessionMetas.push({
          key: `${s.date}#${idx}`,
          date: s.date,
          startMin: p.startMin,
          endMin: p.endMin,
          courtIds: s.courtIds,
          label: p.label,
        });
      }
    }

    type MatchDef = {
      groupNum: number; roundNum: number;
      entityA: string; entityB: string; // player ID or pair ID
      leg: "home" | "away" | null;
      isBye?: boolean;
      byeEntityId?: string;
      date?: string; time?: string; courtId?: number;
      /** Knockout draws only — section + round label carried through to the DB. */
      koSection?: number;
      koStageLabel?: string;
    };

    // Build the universal slot list from sessions (used by non-Bells scheduling).
    type Slot = { date: string; time: string; courtId: number; sessionKey: string };
    const allSlots: Slot[] = [];
    // Self-scheduled tournaments legitimately store matchDuration = 0. Dividing
    // by it yields Infinity and freezes the browser, so only build slots when
    // the duration is a usable positive number.
    const slotDuration = Number.isFinite(matchDuration) && matchDuration > 0 ? matchDuration : 0;
    if (slotDuration > 0) {
      for (const sm of sessionMetas) {
        const n = Math.floor((sm.endMin - sm.startMin) / slotDuration);
        for (let i = 0; i < n; i++) {
          const mins = sm.startMin + i * slotDuration;
          const h = Math.floor(mins / 60);
          const mm = mins % 60;
          const ts = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
          for (const cid of sm.courtIds) {
            allSlots.push({ date: sm.date, time: ts, courtId: cid, sessionKey: sm.key });
          }
        }
      }
    }


    const totalSlots = allSlots.length;
    const timeSlots = Array.from(new Set(allSlots.map((s) => s.time))).sort();

    // Iteration order for scheduling. Spread mode interleaves across *sessions*
    // (Fri eve / Sat AM / Sat PM / Sun AM …) so each pair's matches get a fair
    // chance to land in every session — including the last one — instead of
    // front-loading day 1 or morning-block. Fill mode packs chronologically.
    const slotOrder: number[] = (() => {
      if (scheduleMode === "fill") {
        return allSlots.map((_, i) => i);
      }
      const bySession = new Map<string, number[]>();
      allSlots.forEach((s, i) => {
        if (!bySession.has(s.sessionKey)) bySession.set(s.sessionKey, []);
        bySession.get(s.sessionKey)!.push(i);
      });
      // Preserve chronological session order (sessionMetas already sorted).
      const sessionKeysOrdered = sessionMetas.map((m) => m.key).filter((k) => bySession.has(k));
      const buckets = sessionKeysOrdered.map((k) => bySession.get(k)!);
      const out: number[] = [];
      let step = 0;
      while (out.length < allSlots.length) {
        let added = false;
        for (const bucket of buckets) {
          if (step < bucket.length) { out.push(bucket[step]); added = true; }
        }
        if (!added) break;
        step++;
      }
      return out;
    })();



    // Build round-robin matches
    const allMatches: MatchDef[] = [];
    const isCrossLeague = roundFormat === "cross_league";
    // Round-robin format per league (single/double). Swiss is handled separately below.
    const rrFmtForLeague = (gi: number): "single" | "double" => {
      const f = formatForLeague(gi + 1);
      return f === "double_round_robin" ? "double" : "single";
    };
    // Pools per league (shared by Swiss, round robin and cross league).
    // Single source of truth for pools (legacy sections included).
    const poolsForLeague = (gn: number) => effectivePools({ gn, pools: swissPools, legacySections: leagueSections });
    // Seeded serpentine split (A: 1,4,5,8… / B: 2,3,6,7…) so generated pools
    // match what the organiser sees on the allocation step. A hand-arranged
    // division keeps its contiguous blocks.
    const splitIntoPools = (ids: string[], pools: number, manual = false, knockout = false): string[][] => {
      if (pools <= 1) return [ids];
      return distributeIntoPools(ids, pools, { manual, knockout, mode: poolAllocation }).filter((g) => g.length > 0);
    };
    const ingestRounds = (gi: number, ids: string[]) => {
      // Round robin inside each pool of the league (1 pool = classic RR).
      const pools = splitIntoPools(ids, poolsForLeague(gi + 1), manualSeedGroups.has(gi));
      for (const poolIds of pools) {
        if (poolIds.length < 2) continue;
        const { rounds, byesPerRound } = generateRoundRobinRounds(poolIds, rrFmtForLeague(gi));
        rounds.forEach((roundMatches, ri) => {
          roundMatches.forEach(([a, b, leg]) => {
            allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, entityA: a, entityB: b, leg });
          });
          const byeId = byesPerRound[ri];
          if (byeId && byeForLeague(gi + 1) !== "no_match") {
            allMatches.push({
              groupNum: gi + 1, roundNum: ri + 1,
              entityA: byeId, entityB: byeId, leg: null,
              isBye: true, byeEntityId: byeId,
            });
          }
        });
      }
    };

    // Cross-league mode: every entity in group i plays every entity in group j
    // (no intra-group matches). Each cross match is filed under the lower group's
    // group_number for scheduling; standings include all matches the player took part in.
    // `groupNums` maps each entry of allGroups back to its league number.
    const ingestCrossGroups = (
      allGroups: string[][],
      groupNums: number[],
      double: boolean,
      startRound = 1,
    ) => {
      let roundCounter = startRound;
      for (let i = 0; i < allGroups.length; i++) {
        for (let j = i + 1; j < allGroups.length; j++) {
          const a = allGroups[i];
          const b = allGroups[j];
          for (const pa of a) {
            for (const pb of b) {
              allMatches.push({
                groupNum: groupNums[i],
                roundNum: roundCounter++,
                entityA: pa,
                entityB: pb,
                leg: "home",
              });
              if (double) {
                allMatches.push({
                  groupNum: groupNums[i],
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

    // Cross-pool inside one league: split the league into N pools, then every
    // pool plays every other pool.
    const ingestCrossPools = (gi: number, ids: string[]) => {
      const pools = splitIntoPools(ids, poolsForLeague(gi + 1), manualSeedGroups.has(gi));
      if (pools.length < 2) return;
      ingestCrossGroups(pools, pools.map(() => gi + 1), formatForLeague(gi + 1) === "double_round_robin");
    };


    // Swiss for a single league — reserves placeholder matches based on
    // pools × rounds × ceil(pool/2) so scheduling books the right slot count.
    const buildSwissLeague = (gi: number, ids: string[]) => {
      const pools = poolsForLeague(gi + 1);
      const rounds = Math.max(1, Number(swissRounds[String(gi + 1)]) || 1);
      const poolGroups = distributeIntoPools(ids, pools, { manual: manualSeedGroups.has(gi), mode: poolAllocation });
      for (let p = 0; p < pools; p++) {
        const poolIds = poolGroups[p] || [];
        if (poolIds.length < 2) continue;
        const { rounds: rrRounds, byesPerRound } = generateRoundRobinRounds(poolIds, "single");
        for (let r = 0; r < rounds; r++) {
          const src = rrRounds[r % rrRounds.length] || [];
          src.forEach(([a, b, leg]) => {
            allMatches.push({ groupNum: gi + 1, roundNum: r + 1, entityA: a, entityB: b, leg });
          });
          const byeId = byesPerRound[r % byesPerRound.length];
          if (byeId && byeForLeague(gi + 1) !== "no_match") {
            allMatches.push({
              groupNum: gi + 1, roundNum: r + 1,
              entityA: byeId, entityB: byeId, leg: null,
              isBye: true, byeEntityId: byeId,
            });
          }
        }
      }
    };

    // Knockout league — only the FIRST round of every section is materialised
    // now. Later rounds are generated in the live tournament view once their
    // feeder round is complete (phased generation).
    const buildKnockoutLeague = (gi: number, ids: string[]) => {
      const gn = gi + 1;
      // A player may enter several divisions, but only ONE slot per division —
      // duplicates used to end up paired against themselves.
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      const sections = Math.min(sectionsForLeague(gn), Math.max(1, uniqueIds.length));
      // Same sectioning the organiser sees on the allocation step: knockout
      // sections are sized for the BRACKET (powers of two first), not equal
      // headcount, so 8 entrants in one section produce 4 matches and no byes.
      const sectionIds = distributeIntoPools(uniqueIds, sections, {
        manual: manualSeedGroups.has(gi),
        knockout: true,
        mode: poolAllocation,
      }).filter((s) => s.length > 0);
      const assignments = sectionIds.map((sIds, si) => ({
        section: si + 1,
        seeds: sIds.map((id, i) => ({ memberId: id, seed: i + 1 })),
      }));
      // A confirmed manual draw is authoritative: it is only set aside when a
      // NEW entrant has no slot on it. Withdrawn players are lifted off the
      // board so the organiser's pairings survive untouched.
      const manual = manualDraws[String(gn)];
      const reconciled = manual ? reconcileBoardWithEntrants(manual, uniqueIds) : null;
      const manualUsable = !!reconciled?.usable;
      const rows = manualUsable
        ? drawToMatchRows({
            champId: "preview",
            board: reconciled!.board,
            entrants: uniqueIds.map((id, i) => ({ id, name: id, seed: i + 1 })),
            multiSection:
              new Set(reconciled!.board.matches.map((m) => m.section)).size > 1 || sectionIds.length > 1,
          })
        : buildLeagueFirstRound({ champId: "preview", groupNumber: gn, assignments });


      for (const r of rows) {
        allMatches.push({
          groupNum: gn,
          roundNum: r.round_number,
          entityA: r.player_a_member_id ?? r.bye_member_id ?? "",
          // A real bye is one-sided: never a playable self-fixture.
          entityB: r.is_bye ? "" : r.player_b_member_id ?? "",
          leg: null,
          isBye: r.is_bye,
          byeEntityId: r.is_bye ? r.bye_member_id ?? undefined : undefined,
          koSection: r.section_number,
          koStageLabel: r.stage_label,
        });
      }
    };


    {
      // Singles draws are constrained to each division's eligible population
      // ("Players from"). Doubles pairs are built by hand and are left as-is.
      const perLeagueIds: string[][] = isDoubles
        ? (groups as DoublePair[][]).map((g) => g.map((p) => p.id))
        : (groups as ClubMember[][]).map((g, gi) => eligibleIdsForDivision(gi + 1, g.map((p) => p.id)));


      // Leagues on "cross league" WITHOUT their own pools play against the other
      // cross-league leagues (classic league-vs-league). Cross-league leagues WITH
      // 2+ pools play pool-vs-pool inside themselves.
      const crossAcross: { ids: string[]; gn: number }[] = [];
      perLeagueIds.forEach((ids, gi) => {
        const f = formatForLeague(gi + 1);
        if (f === "swiss") {
          buildSwissLeague(gi, ids);
        } else if (f === "knockout") {
          buildKnockoutLeague(gi, ids);
        } else if (f === "cross_league") {
          if (poolsForLeague(gi + 1) > 1) ingestCrossPools(gi, ids);
          else crossAcross.push({ ids, gn: gi + 1 });
        } else {
          ingestRounds(gi, ids);
        }
      });
      if (crossAcross.length > 1) {
        ingestCrossGroups(
          crossAcross.map((c) => c.ids),
          crossAcross.map((c) => c.gn),
          roundFormat === "double_round_robin",
        );
      } else if (crossAcross.length === 1) {
        // Only one cross-league league and no pools — fall back to a round robin
        // so the league still gets a draw.
        ingestRounds(crossAcross[0].gn - 1, crossAcross[0].ids);
      }
    }

    // Players arrange their own court/date/time: stop here. The draw exists,
    // but no slot, court or booking is allocated — every playable match is
    // created unscheduled and carries only its round play-by deadline.
    if (schedulingMode === "self") {
      const playable = allMatches.filter((m) => !m.isBye);
      return {
        allMatches,
        totalSlots: playable.length,
        totalMatches: playable.length,
        allDates: [] as string[],
        timeSlots: [] as string[],
        playoffPlaceholders: [] as any[],
      };
    }


    // Spread mode uses per-session entity caps (below) as its main balancer,
    // so we no longer block same-day repeats — a pair *can* play in AM and PM
    // of the same day, which is exactly what admins asked for. Kept as a
    // no-op wrapper so downstream code doesn't change shape.
    const entityLastDate = new Map<string, string>();
    const canScheduleOn = (_entityId: string, _dateStr: string): boolean => true;

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
        {
          // Interval-based parallel scheduler (used whether court rotation is on
          // or off):
          // - Walk each session on a shared timeline (step = gcd of all caps).
          // - Track court and player busy intervals with real overlap detection.
          // - At every step, place as many matches as possible in parallel across
          //   all free courts, choosing from ANY league's remaining pool.
          // - When rotateMin > 0, court ownership shifts every `rotateMin`
          //   minutes so courts share load fairly (classic "rotate every hour").
          // - When rotateMin === 0, ownership recomputes every tick from the
          //   remaining workload — so as one league nears the finish, freed
          //   courts naturally flip to the busier league (e.g. 2 vs 1 near the
          //   end) and both leagues finish at roughly the same time.
          const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
          const caps = leagues.map(capFor);
          const step = Math.max(1, caps.reduce((a, b) => gcd(a, b), caps[0] || 1));

          const remainingByLeague = new Map<number, MatchDef[]>();
          for (const gn of leagues) remainingByLeague.set(gn, [...byLeague.get(gn)!]);

          // busyUntil[courtId] and playerBusyUntil[playerId] = absolute minute the
          // resource frees up. Compared against nowAbs on each tick.
          const courtBusyUntil = new Map<number, number>();
          const playerBusyUntil = new Map<string, number>();
          const lastPlayedEnd = new Map<string, number>();
          const playCount = new Map<string, number>();
          const absMin = (date: string, min: number) => {
            const d = new Date(date + "T00:00:00Z").getTime() / 60000;
            return d + min;
          };

          const totalRemaining = () => {
            let n = 0;
            for (const arr of remainingByLeague.values()) n += arr.length;
            return n;
          };

          // Global-pool scheduler: at every tick, any free court can accept
          // any league's next-best match. This keeps every court busy while
          // work remains AND keeps both leagues finishing at roughly the
          // same time (we bias toward the league with the largest backlog
          // ratio, so neither league falls behind).
          //
          // Break enforcement: a player must have rested at least
          // `minBreakMin` minutes since their last match ended before being
          // picked again. If no match satisfies the break, we relax it (soft
          // constraint) so the schedule still completes.
          const minCap = Math.min(...caps);
          const minBreakMin = Math.max(minCap, rotateMin); // ≥ one match or rotation slot rest
          const initialCounts = new Map<number, number>();
          for (const gn of leagues) initialCounts.set(gn, byLeague.get(gn)!.length);

          // Prefer to rotate the court a player uses across rotation blocks
          // (visible "rotate every X min" behaviour) — track last court used
          // per player and penalise the same court in consecutive blocks.
          const lastCourtByPlayer = new Map<string, number>();

          // Within a single rotation block, track how many courts each league
          // has already grabbed so we can force interleaving across courts.
          // Without this, at t=0 every score component is tied and the first
          // league in the array wins every court → looks "hardcoded" to
          // courts 1 & 2.
          let currentBlock = -1;
          let assignedInBlock = new Map<number, number>();

          const scoreMatch = (
            m: MatchDef,
            gn: number,
            nowAbs: number,
            cid: number,
            enforceBreak: boolean,
          ): number[] | null => {
            const cap = capFor(gn);
            const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
            for (const pid of players) {
              if ((playerBusyUntil.get(pid) ?? 0) > nowAbs) return null;
              if (enforceBreak) {
                const last = lastPlayedEnd.get(pid);
                if (last != null && nowAbs - last < minBreakMin) return null;
              }
            }
            let minRest = Number.MAX_SAFE_INTEGER;
            let maxPlays = 0;
            let sameCourt = 0;
            for (const pid of players) {
              const last = lastPlayedEnd.get(pid);
              const rest = last == null ? Number.MAX_SAFE_INTEGER : nowAbs - last;
              if (rest < minRest) minRest = rest;
              const pc = playCount.get(pid) || 0;
              if (pc > maxPlays) maxPlays = pc;
              if (lastCourtByPlayer.get(pid) === cid) sameCourt++;
            }
            const pool = remainingByLeague.get(gn)!;
            const initial = initialCounts.get(gn) || 1;
            // Backlog ratio: leagues further from done get scheduled first
            // so both leagues finish together. Multiply by 1000 for ranking.
            const backlogRatio = Math.round((pool.length / initial) * 1000);
            // How many courts this league has already taken in the current
            // rotation block (lower = should get next court within block).
            const inBlock = assignedInBlock.get(gn) || 0;
            // Higher is better across the tuple.
            return [
              backlogRatio,     // 1. keep leagues balanced by % done
              -inBlock,         // 2. spread leagues across courts within block
              minRest,          // 3. most-rested players first
              -maxPlays,        // 4. players who've played less first
              -sameCourt,       // 5. avoid same court back-to-back for a player
              -cap,             // 6. slightly prefer shorter matches when tied
            ];
          };

          const cmpScore = (a: number[], b: number[]): number => {
            for (let i = 0; i < a.length; i++) {
              if (a[i] !== b[i]) return b[i] - a[i]; // desc
            }
            return 0;
          };

          const pickBest = (
            nowAbs: number,
            tRel: number,
            sessionEndMin: number,
            cid: number,
            enforceBreak: boolean,
          ): { league: number; idx: number; cap: number } | null => {
            let best: { league: number; idx: number; cap: number; score: number[] } | null = null;
            for (const gn of leagues) {
              const cap = capFor(gn);
              if (tRel + cap > sessionEndMin) continue;
              const pool = remainingByLeague.get(gn);
              if (!pool || !pool.length) continue;
              for (let i = 0; i < pool.length; i++) {
                const score = scoreMatch(pool[i], gn, nowAbs, cid, enforceBreak);
                if (!score) continue;
                if (!best || cmpScore(score, best.score) < 0) {
                  best = { league: gn, idx: i, cap, score };
                }
              }
            }
            return best ? { league: best.league, idx: best.idx, cap: best.cap } : null;
          };

          // Compute per-block court→league ownership. Courts are divided by
          // remaining workload (matches × cap), producing contiguous ranges.
          // Ownership shifts by one court every block, so the "rotation" is
          // visible: League 1 owns e.g. courts 1-2 for the first block, then
          // 2-3 next block, etc. Fallbacks below keep courts busy if the
          // owner has nothing eligible.
          // Total matches placed so far across all leagues — used to rotate
          // ownership at every placement so leagues interleave across courts
          // and time (e.g. "2 L1, 1 L2, 2 L1, 1 L2 …") instead of one league
          // batching all its games before the other starts.
          const totalPlacedSoFar = () => {
            let n = 0;
            for (const gn of leagues) {
              n += (initialCounts.get(gn) || 0) - (remainingByLeague.get(gn)?.length || 0);
            }
            return n;
          };
          const ownershipForBlock = (
            block: number,
            sessionCourts: number[],
            applyShift: boolean,
            extraShift = 0,
          ): Map<number, number> => {
            const totalCourts = sessionCourts.length;
            const remWeights = leagues.map((gn) => {
              const pool = remainingByLeague.get(gn);
              return (pool?.length || 0) * capFor(gn);
            });
            const totalW = remWeights.reduce((a, b) => a + b, 0);
            let allocs: number[];
            if (totalW <= 0) {
              allocs = leagues.map(() => 0);
            } else {
              // Give every league with remaining work at least one court, so
              // one league can never fully starve the other early on.
              allocs = remWeights.map((w) =>
                w > 0 ? Math.max(1, Math.round((w / totalW) * totalCourts)) : 0,
              );
              let sum = allocs.reduce((a, b) => a + b, 0);
              // Trim from the largest owner first when over-allocated.
              while (sum > totalCourts) {
                let idx = -1;
                for (let i = 0; i < allocs.length; i++) {
                  if (allocs[i] > 1 && (idx === -1 || allocs[i] > allocs[idx])) idx = i;
                }
                if (idx === -1) break;
                allocs[idx]--; sum--;
              }
              // Give leftover courts to whichever league is furthest behind
              // (highest work-per-court ratio) — this is what produces the
              // "2 vs 1" spread near the end when one league has less to do.
              while (sum < totalCourts) {
                let idx = 0;
                for (let i = 1; i < allocs.length; i++) {
                  if (remWeights[i] / Math.max(1, allocs[i]) > remWeights[idx] / Math.max(1, allocs[idx])) idx = i;
                }
                allocs[idx]++; sum++;
              }
            }
            const own = new Map<number, number>();
            const baseShift = applyShift ? ((block % totalCourts) + totalCourts) % totalCourts : 0;
            const shift = ((baseShift + extraShift) % totalCourts + totalCourts) % totalCourts;
            let cursor = 0;
            leagues.forEach((gn, i) => {
              for (let k = 0; k < allocs[i]; k++) {
                const courtIdx = (cursor + shift) % totalCourts;
                own.set(sessionCourts[courtIdx], gn);
                cursor++;
              }
            });
            return own;
          };

          for (const s of sessions) {
            const sessionCourts = courtIds.filter((c) => s.courtIds.includes(c));
            if (sessionCourts.length === 0) continue;
            let blockOwnership = new Map<number, number>();
            for (let t = s.startMin; t < s.endMin && totalRemaining() > 0; t += step) {
              const nowAbs = absMin(s.date, t);
              // When rotation is ON, blocks are fixed windows and ownership
              // shifts each block. When it's OFF, we still recompute ownership
              // every tick from remaining workload — so freed courts flip to
              // whichever league is furthest behind (2-vs-1 near the finish).
              const rotateOn = rotateMin > 0;
              const block = rotateOn ? Math.floor((t - s.startMin) / rotateMin) : 0;
              if (!rotateOn || block !== currentBlock) {
                currentBlock = block;
                assignedInBlock = new Map<number, number>();
                blockOwnership = ownershipForBlock(block, sessionCourts, rotateOn);
              }
              // Iterate courts in original order; ownership already encodes rotation.
              for (const cid of sessionCourts) {
                const freeAt = courtBusyUntil.get(cid) ?? 0;
                if (freeAt > nowAbs) continue;

                // Rotate ownership by total placements so far — this makes
                // leagues interleave across courts within a tick (e.g. with a
                // 2:1 allocation the next placement flips who owns which
                // court, producing "L1, L2, L1, L1, L2, L1…" instead of
                // batching all L1 first, then all L2 later.
                const tickOwnership = ownershipForBlock(
                  block,
                  sessionCourts,
                  true,
                  totalPlacedSoFar(),
                );
                const owner = tickOwnership.get(cid) ?? blockOwnership.get(cid);
                // 1) Try owner league first (strict), 2) fall back to any league
                //    so a court never sits idle when the owner has nothing to play.
                const pickForLeague = (gn: number, enforceBreak: boolean) => {
                  const cap = capFor(gn);
                  if (t + cap > s.endMin) return null;
                  const pool = remainingByLeague.get(gn);
                  if (!pool || !pool.length) return null;
                  let bestIdx = -1; let bestScore: number[] | null = null;
                  for (let i = 0; i < pool.length; i++) {
                    const score = scoreMatch(pool[i], gn, nowAbs, cid, enforceBreak);
                    if (!score) continue;
                    if (!bestScore || cmpScore(score, bestScore) < 0) { bestIdx = i; bestScore = score; }
                  }
                  return bestIdx === -1 ? null : { league: gn, idx: bestIdx, cap };
                };

                // Strict pass: only place matches that respect the break.
                let picked =
                  (owner != null ? pickForLeague(owner, true) : null) ??
                  pickBest(nowAbs, t, s.endMin, cid, true);
                // Only relax the break (allow back-to-back) when the admin
                // has opted out of the strict rule.
                if (!picked && !avoidBackToBack) {
                  picked =
                    (owner != null ? pickForLeague(owner, false) : null) ??
                    pickBest(nowAbs, t, s.endMin, cid, false);
                }
                if (!picked) continue;

                const pool = remainingByLeague.get(picked.league)!;
                const [m] = pool.splice(picked.idx, 1);
                const h = Math.floor(t / 60);
                const mm = t % 60;
                m.date = s.date;
                m.time = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                m.courtId = cid;
                courtBusyUntil.set(cid, nowAbs + picked.cap);
                assignedInBlock.set(picked.league, (assignedInBlock.get(picked.league) || 0) + 1);
                const players = [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)];
                players.forEach((pid) => {
                  playerBusyUntil.set(pid, nowAbs + picked!.cap);
                  lastPlayedEnd.set(pid, nowAbs + picked!.cap);
                  playCount.set(pid, (playCount.get(pid) || 0) + 1);
                  lastCourtByPlayer.set(pid, cid);
                });
                if (totalRemaining() === 0) break;
              }
            }
            if (totalRemaining() === 0) break;
          }
        }
      }
    } else {
      const usedSlots = new Set<number>();

      // Reserve the LAST N chronological slots for play-off placeholders so
      // pool matches don't grab them. `allSlots` is built in date/time/court
      // order, so the tail of the array is the latest end of the tournament.
      const entriesPerLeague: number[] = isDoubles
        ? (groups as DoublePair[][]).map((g) => g.length)
        : (groups as ClubMember[][]).map((g) => g.length);

      // Pool mode: any league split into 2+ pools (Swiss, round robin or cross
      // league) contributes its pool split; others stay as a single pool.
      const anySwiss = (roundFormat === "swiss")
        || (usePerLeagueFormats && Object.values(leagueFormats).some((f) => f === "swiss"))
        || entriesPerLeague.some((_, gi) => poolsForLeague(gi + 1) > 1);
      const poolsByLeague: Record<number, number> = {};
      const entriesByLeaguePool: Record<number, number[]> = {};
      if (anySwiss) {
        entriesPerLeague.forEach((total, gi) => {
          const lg = gi + 1;
          const pc = poolsForLeague(lg);
          poolsByLeague[lg] = pc;
          const size = Math.ceil(total / pc);
          const sizes: number[] = [];
          for (let p = 0; p < pc; p++) {
            const from = p * size;
            const to = Math.min(total, (p + 1) * size);
            sizes.push(Math.max(0, to - from));
          }
          entriesByLeaguePool[lg] = sizes;
        });
      }


      // Per-league playoffs: leagues opted out contribute zero entries, so no
      // bracket is reserved or built for them (indices stay aligned).
      const poEntriesPerLeague = entriesPerLeague.map((n, i) => (playoffsForLeague(i + 1) ? n : 0));
      const poEntriesByLeaguePool: Record<number, number[]> = {};
      Object.keys(entriesByLeaguePool).forEach((k) => {
        const lg = Number(k);
        poEntriesByLeaguePool[lg] = playoffsForLeague(lg)
          ? entriesByLeaguePool[lg]
          : entriesByLeaguePool[lg].map(() => 0);
      });
      const anyLeaguePlayoffs = poEntriesPerLeague.some((n) => n > 0);

      const playoffCount = (enablePlayoffs && anyLeaguePlayoffs)
        ? countPlayoffPlaceholders({
            numLeagues: entriesPerLeague.length,
            entriesPerLeague: poEntriesPerLeague,
            poolsByLeague: anySwiss ? poolsByLeague : undefined,
            entriesByLeaguePool: anySwiss ? poEntriesByLeaguePool : undefined,
          })
        : 0;

      const reservedSlotIdx: number[] = [];
      if (playoffCount > 0) {
        const take = Math.min(playoffCount, allSlots.length);
        const timeToMin = (t: string) => {
          const [hh, mm] = String(t).slice(0, 5).split(":").map(Number);
          return (hh || 0) * 60 + (mm || 0);
        };
        // Priority 1: explicit playoff date — reserve slots on that date only.
        const onDate = playoffDate
          ? slotOrder.filter((si) => allSlots[si].date === playoffDate)
          : [];
        if (playoffDate && onDate.length >= take) {
          for (let k = 0; k < take; k++) {
            reservedSlotIdx.push(onDate[k]);
            usedSlots.add(onDate[k]);
          }
        } else if (scheduleMode === "fill") {
          // Fill mode: playoffs follow directly after the pool matches so the
          // finals happen the same day pool play ends (no forced next-day roll).
          const poolCount = allMatches.filter((m) => !m.isBye).length;
          let start = Math.min(allSlots.length - take, poolCount);
          // Apply optional break minutes between the last pool slot and the
          // first playoff slot on the same day. Skip forward until the gap is
          // satisfied or we roll onto a later date.
          const breakMin = Math.max(0, Number(playoffBreakMinutes) || 0);
          if (breakMin > 0 && poolCount > 0 && poolCount <= slotOrder.length) {
            const lastPool = allSlots[slotOrder[poolCount - 1]];
            const need = timeToMin(lastPool.time) + (matchDuration || 0) + breakMin;
            let s = start;
            while (s < slotOrder.length - take) {
              const cand = allSlots[slotOrder[s]];
              if (cand.date !== lastPool.date) break; // new day → gap satisfied
              if (timeToMin(cand.time) >= need) break;
              s++;
            }
            start = Math.min(slotOrder.length - take, s);
          }
          for (let k = 0; k < take; k++) {
            const idx = start + k;
            reservedSlotIdx.push(slotOrder[idx]);
            usedSlots.add(slotOrder[idx]);
          }
        } else {
          for (let i = allSlots.length - take; i < allSlots.length; i++) {
            reservedSlotIdx.push(i);
            usedSlots.add(i);
          }
        }
      }


      // Track (date|time) slots each entity is already playing, so fill mode
      // can pack multiple matches per entity per day without double-booking
      // the same time on two different courts.
      const entityBusySlot = new Map<string, Set<string>>();
      const isEntityFree = (pid: string, slot: { date: string; time: string }) => {
        const key = `${slot.date}|${slot.time}`;
        return !entityBusySlot.get(pid)?.has(key);
      };
      const markEntityBusy = (pid: string, slot: { date: string; time: string }) => {
        const key = `${slot.date}|${slot.time}`;
        let set = entityBusySlot.get(pid);
        if (!set) { set = new Set(); entityBusySlot.set(pid, set); }
        set.add(key);
      };
      // Returns true if this player already has a game in the time slot
      // immediately before or after `slot` on the same date (back-to-back).
      const timeToMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      const hasAdjacent = (pid: string, slot: { date: string; time: string }) => {
        const set = entityBusySlot.get(pid);
        if (!set) return false;
        const mins = timeToMin(slot.time);
        const prev = mins - matchDuration;
        const next = mins + matchDuration;
        const fmt = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
        return set.has(`${slot.date}|${fmt(prev)}`) || set.has(`${slot.date}|${fmt(next)}`);
      };


      // Interleave matches across leagues/pools so every group gets court time
      // in parallel rather than League 1 finishing before League 2 starts.
      // Sort each league's non-bye matches by roundNum, then round-robin pop
      // one match per league at a time. Byes stay attached to their league
      // group but keep their order.
      const nonByes = allMatches.filter((m) => !m.isBye);
      const byLeague = new Map<number, typeof nonByes>();
      for (const m of nonByes) {
        const arr = byLeague.get(m.groupNum) ?? [];
        arr.push(m);
        byLeague.set(m.groupNum, arr);
      }
      for (const arr of byLeague.values()) {
        arr.sort((a, b) => (a.roundNum ?? 0) - (b.roundNum ?? 0));
      }
      const leagueKeys = [...byLeague.keys()].sort((a, b) => a - b);
      // Capture per-league totals BEFORE the interleave loop consumes byLeague.
      const leagueTotals = new Map<number, number>();
      for (const k of leagueKeys) leagueTotals.set(k, byLeague.get(k)!.length);

      const interleaved: typeof nonByes = [];
      let anyLeft = true;
      while (anyLeft) {
        anyLeft = false;
        for (const k of leagueKeys) {
          const arr = byLeague.get(k)!;
          const next = arr.shift();
          if (next) { interleaved.push(next); anyLeft = true; }
        }
      }

      // Spread mode: split the play window into sessions (auto-detected above
      // as Fri eve / Sat AM / Sat PM / Sun AM etc.) and give every league AND
      // every pair a per-session quota. Result: each pair plays roughly the
      // same number of games in every session, including the final one, so
      // Saturday morning doesn't get stacked while Sunday sits empty.
      const sessionKeysOrdered = sessionMetas.map((m) => m.key);
      const numSessions = Math.max(1, sessionKeysOrdered.length);
      const leagueTargetPerSession = new Map<number, number>();
      for (const [k, tot] of leagueTotals) {
        leagueTargetPerSession.set(k, Math.max(1, Math.ceil(tot / numSessions)));
      }
      const leaguePerSessionCount = new Map<number, Map<string, number>>();
      for (const k of leagueKeys) leaguePerSessionCount.set(k, new Map());

      const entityTotals = new Map<string, number>();
      for (const m of nonByes) {
        for (const pid of [...getPlayersForEntity(m.entityA), ...getPlayersForEntity(m.entityB)]) {
          entityTotals.set(pid, (entityTotals.get(pid) || 0) + 1);
        }
      }
      const entityTargetPerSession = new Map<string, number>();
      for (const [pid, tot] of entityTotals) {
        entityTargetPerSession.set(pid, Math.max(1, Math.ceil(tot / numSessions)));
      }
      const entityPerSessionCount = new Map<string, Map<string, number>>();
      // Track which sessions a pair has already been placed into so the
      // fallback pass can still prefer *new* sessions before doubling up.
      const entitySessionsUsed = new Map<string, Set<string>>();

      const tryPlace = (
        match: typeof nonByes[number],
        allPlayers: string[],
        respectQuota: boolean,
        opts?: { onlySessionKey?: string; avoidBackToBack?: boolean },
      ): boolean => {
        const perSess = leaguePerSessionCount.get(match.groupNum);
        const target = leagueTargetPerSession.get(match.groupNum) ?? Infinity;
        const avoidB2B = opts?.avoidBackToBack ?? (scheduleMode === "spread");
        for (const si of slotOrder) {
          if (usedSlots.has(si)) continue;
          const slot = allSlots[si];
          if (opts?.onlySessionKey && slot.sessionKey !== opts.onlySessionKey) continue;
          if (respectQuota && scheduleMode === "spread") {
            if (perSess && (perSess.get(slot.sessionKey) || 0) >= target) continue;
            let entityCapHit = false;
            for (const pid of allPlayers) {
              const cnt = entityPerSessionCount.get(pid)?.get(slot.sessionKey) || 0;
              const cap = entityTargetPerSession.get(pid) ?? Infinity;
              if (cnt >= cap) { entityCapHit = true; break; }
            }
            if (entityCapHit) continue;
          }
          if (!allPlayers.every((pid) => isEntityFree(pid, slot))) continue;
          if (!allPlayers.every((pid) => canScheduleOn(pid, slot.date))) continue;
          if (avoidB2B && allPlayers.some((pid) => hasAdjacent(pid, slot))) continue;
          match.date = slot.date;
          match.time = slot.time;
          match.courtId = slot.courtId;
          usedSlots.add(si);
          allPlayers.forEach((pid) => {
            entityLastDate.set(pid, slot.date);
            markEntityBusy(pid, slot);
            let eps = entityPerSessionCount.get(pid);
            if (!eps) { eps = new Map(); entityPerSessionCount.set(pid, eps); }
            eps.set(slot.sessionKey, (eps.get(slot.sessionKey) || 0) + 1);
            let used = entitySessionsUsed.get(pid);
            if (!used) { used = new Set(); entitySessionsUsed.set(pid, used); }
            used.add(slot.sessionKey);
          });
          if (perSess) perSess.set(slot.sessionKey, (perSess.get(slot.sessionKey) || 0) + 1);
          return true;
        }
        return false;
      };

      // Priming pass (spread mode, ≥2 sessions): reserve one match per pair
      // in the *final* session, round-robin across leagues, so every pair is
      // guaranteed to still play on the last day. The main pass then fills
      // backwards from there.
      if (scheduleMode === "spread" && numSessions >= 2) {
        const finalKey = sessionKeysOrdered[sessionKeysOrdered.length - 1];
        const seeded = new Set<string>(); // pair/entity ids already primed
        // Round-robin through leagues, picking the first unscheduled match
        // whose participants haven't been seeded yet.
        let progress = true;
        while (progress) {
          progress = false;
          for (const gn of leagueKeys) {
            const candidate = interleaved.find((m) => {
              if (m.date || m.groupNum !== gn) return false;
              return !seeded.has(m.entityA) && !seeded.has(m.entityB);

            });
            if (!candidate) continue;
            const allPlayers = [
              ...getPlayersForEntity(candidate.entityA),
              ...getPlayersForEntity(candidate.entityB),
            ];
            if (tryPlace(candidate, allPlayers, true, { onlySessionKey: finalKey })) {
              seeded.add(candidate.entityA);
              seeded.add(candidate.entityB);
              progress = true;
            }
          }
        }
      }

      // First pass: place every remaining match honouring per-session quotas
      // AND avoiding back-to-back games. Progressive relaxation: quota+B2B →
      // quota only → B2B only → anything free.
      for (const match of interleaved) {
        if (match.date) continue;
        const playersA = getPlayersForEntity(match.entityA);
        const playersB = getPlayersForEntity(match.entityB);
        const allPlayers = [...playersA, ...playersB];
        if (tryPlace(match, allPlayers, true, { avoidBackToBack: true })) continue;
        if (tryPlace(match, allPlayers, true, { avoidBackToBack: false })) continue;
        if (tryPlace(match, allPlayers, false, { avoidBackToBack: true })) continue;
        tryPlace(match, allPlayers, false, { avoidBackToBack: false });
      }


      // Second pass: anything left unscheduled falls into any free slot so it
      // doesn't show as TBD. Iterate in interleaved order (not per-league) so
      // the fallback also interleaves leagues, and still respect concurrent
      // player conflicts so a pair isn't double-booked at the same time.
      for (const match of interleaved) {
        if (match.isBye || match.date) continue;
        const playersA = getPlayersForEntity(match.entityA);
        const playersB = getPlayersForEntity(match.entityB);
        const allPlayers = [...playersA, ...playersB];
        let placed = false;
        // Prefer slots that also avoid back-to-back.
        for (const requireNoB2B of [true, false]) {
          if (placed) break;
          for (const si of slotOrder) {
            if (usedSlots.has(si)) continue;
            const slot = allSlots[si];
            if (!allPlayers.every((pid) => isEntityFree(pid, slot))) continue;
            if (requireNoB2B && allPlayers.some((pid) => hasAdjacent(pid, slot))) continue;
            match.date = slot.date;
            match.time = slot.time;
            match.courtId = slot.courtId;
            usedSlots.add(si);
            allPlayers.forEach((pid) => markEntityBusy(pid, slot));
            placed = true;
            break;
          }
        }

        if (placed) continue;
        // Absolute last resort: any free slot even with a conflict.
        for (const si of slotOrder) {
          if (usedSlots.has(si)) continue;
          const slot = allSlots[si];
          match.date = slot.date;
          match.time = slot.time;
          match.courtId = slot.courtId;
          usedSlots.add(si);
          break;
        }
      }

      // Playoff placeholders occupy the reserved tail slots in stage order:
      // QF (round 1) → SF (round 2) → Final/3rd (round 3). Chronological
      // ordering of reservedSlotIdx already achieves earliest-first.
      if (playoffCount > 0 && reservedSlotIdx.length > 0) {
        const placeholderRows = buildPlayoffPlaceholders({
          champId: "__preview__",
          numLeagues: entriesPerLeague.length,
          entriesPerLeague: poEntriesPerLeague,
          leagueLabels: entriesPerLeague.map((_, i) => groupLabels[String(i + 1)] || `League ${i + 1}`),
          poolsByLeague: anySwiss ? poolsByLeague : undefined,
          entriesByLeaguePool: anySwiss ? poEntriesByLeaguePool : undefined,
        });
        placeholderRows.sort((a, b) => a.round_number - b.round_number);
        placeholderRows.forEach((row, i) => {
          const si = reservedSlotIdx[i];
          if (si == null) return;
          const slot = allSlots[si];
          (row as any).__date = slot.date;
          (row as any).__time = slot.time;
          (row as any).__courtId = slot.courtId;
        });
        (allMatches as any).__playoffPlaceholders = placeholderRows;
      }
    }

    const playableMatches = allMatches.filter((m) => !m.isBye);
    const placeholderCount = ((allMatches as any).__playoffPlaceholders?.length ?? 0);
    // Bells mode schedules every match by construction — treat slots as sufficient.
    const effectiveTotalSlots = isBellsMode ? playableMatches.length : totalSlots;
    return {
      allMatches,
      totalSlots: effectiveTotalSlots,
      totalMatches: playableMatches.length + placeholderCount,
      allDates,
      timeSlots,
      playoffPlaceholders: (allMatches as any).__playoffPlaceholders || [],
    };
  }, [groups, isDoubles, doublesPairs, startDate, endDate, playDays, selectedCourtIds, startTime, endTime, matchDuration, roundFormat, leagueFormats, usePerLeagueFormats, byeHandling, leagueByeHandling, scoringMode, groupDurations, courtRotationMinutes, avoidBackToBack, customizeDailySchedule, daySchedules, swissPools, leagueSections, swissRounds, enablePlayoffs, leaguePlayoffs, groupLabels, scheduleMode, playoffBreakMinutes, playoffDate, leagueSources, registrationsByLeague, eligibilityOverrides, schedulingMode, championScope, poolAllocation, manualDraws]);

  /**
   * Structure side of the capacity check: one entry per league, carrying the
   * league's own format, match length, pools, Swiss rounds, play-off flag and
   * the field size (real roster if there is one, otherwise the planned count).
   */
  const capacityLeagues = useMemo(() => {
    const count = Math.max(0, numGroups || 0);
    return Array.from({ length: count }, (_, i) => {
      const gn = i + 1;
      const key = String(gn);
      const fmt = formatForLeague(gn);
      const roster = ((groups as any[])[i] || []).length;
      return {
        groupNumber: gn,
        label: groupLabels[key] || `League ${gn}`,
        format: fmt,
        scoring: scoringForLeague(gn),

        slotMinutes:
          fmt === "cross_league"
            ? Number(groupDurations["1"]) || matchDuration || 0
            : Number(groupDurations[key]) || matchDuration || 0,
        // Pools are the division's independent sub-draws; knockout divisions
        // fall back to their legacy section count.
        pools: poolsForDivision(gn),
        rounds: Number(swissRounds[key]) || 0,
        entities: roster || Math.max(0, Number(expectedPlayers[key]) || 0),
        playoffs: playoffsForLeague(gn),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numGroups, groups, groupLabels, groupDurations, matchDuration, swissPools, swissRounds, expectedPlayers, leaguePlayoffs, leagueFormats, leagueSections, usePerLeagueFormats, roundFormat, leagueScoringModes, scoringMode]);


  // Create/update champ
  const createChamp = useMutation({
    mutationFn: async () => {
      // A draft can be saved without dates, but it can never be generated
      // without them — fixtures, courts and invites all need a calendar.
      if (!startDate || !endDate) {
        throw new Error("Add a start and end date on the Dates, Times & Courts step before generating.");
      }
      const draftChampId = await saveDraft();
      if (!schedulePreview && !awaitingPlayerPairs) throw new Error("No schedule generated");

      let champId: string;
      const existingChampId = draftChampId || editingChampId;
      const defaultName = `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Tournament ${new Date().getFullYear()}`;

      if (existingChampId) {
        // PHASE 3b GUARD: a locked draw is frozen — refuse to rebuild fixtures.
        const { data: lockRow } = await fromExt("tournaments")
          .select("draw_locked")
          .eq("id", existingChampId)
          .maybeSingle();
        if (lockRow?.draw_locked) {
          throw new Error("This draw is locked. Unlock it on the Review step before rebuilding the schedule.");
        }

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
        if (savedCount > 0 && currentCount < savedCount && !entitiesChangedSinceLoad) {
          throw new Error(
            `Refusing to regenerate: only ${currentCount} ${isDoubles ? "pair" : "player"}(s) loaded but ${savedCount} are saved. Close the wizard, reopen the tournament, and try again so all entries load first.`
          );
        }

        const { error: updateErr } = await fromExt("club_champs")
          .update(sanitizeDraftPayload({
            name: champName || defaultName,
            gender,
            match_type: matchType,
            num_groups: numGroups,
            enable_playoffs: enablePlayoffs,
            champion_scope: championScope,
            start_date: startDate,
            end_date: endDate,
            play_days: Array.from(playDays),
            start_time: startTime,
            end_time: endTime,
            match_duration_minutes: matchDuration,
            scoring_mode: scoringMode,
            swiss_pools: swissPools,
            league_draw_styles: leagueDrawStyles,
            pool_sizes: poolSizeOverrides,
            pool_allocation: poolAllocation,
            swiss_rounds: (roundFormat === "swiss" || Object.values(leagueFormats).includes("swiss")) ? swissRounds : null,
            expected_players: Object.keys(expectedPlayers).length > 0 ? expectedPlayers : null,
            league_formats: usePerLeagueFormats ? leagueFormats : null,
            league_sections: sectionsFromPools(swissPools, (gn) => formatForLeague(gn) === "knockout", numGroups, leagueSections),
            points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
            best_of: bestOf > 0 ? bestOf : null,
            play_all_games: playAllGames,
            win_condition: winCondition,
            group_durations: groupDurations,
            group_break_minutes: groupBreakMinutes,
            group_labels: groupLabels,
            default_break_minutes: defaultBreakMinutes,
            court_rotation_minutes: courtRotationMinutes,
            avoid_back_to_back: avoidBackToBack,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: effectiveRegistrationMode,
            partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
            registration_opens_at: registrationRequired ? fromLocalInputValue(registrationOpensAt) : null,
            registration_closes_at: registrationRequired ? fromLocalInputValue(registrationClosesAt) : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            registration_required: registrationRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
            invite_source: inviteSource,
            invite_audience: inviteAudience,
            invite_audience_league_ids: Array.from(audienceLeagueIds),
            invite_audience_member_ids: Array.from(audienceMemberIds),
            invite_audience_club_ids: audienceClubIds,
            invite_audience_include_individuals: audienceIncludeIndividuals,
            entry_source: entrySource,
            approval_gate: approvalGate,
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
      ranking_weight: rankingWeight,
            ladder_affects: ladderAffects,
            day_schedules: customizeDailySchedule ? daySchedules : [],
            court_ids: Array.from(selectedCourtIds),
            schedule_mode: scheduleMode,
            scheduling_mode: schedulingMode,
            round_play_by: serializeRoundDeadlines(roundDeadlines),

            playoff_break_minutes: Math.max(0, Math.round(Number(playoffBreakMinutes) || 0)),
            playoff_date: playoffDate || null,
          }))
          .eq("id", existingChampId);
        if (updateErr) throw updateErr;
        champId = existingChampId;
        if (!editingChampId) setEditingChampId(existingChampId);
      } else {
        const { data: champ, error: champErr } = await fromExt("club_champs")
          .insert(sanitizeDraftPayload({
            club_id: clubId,
            name: champName || defaultName,
            gender,
            match_type: matchType,
            num_groups: numGroups,
            enable_playoffs: enablePlayoffs,
            champion_scope: championScope,
            start_date: startDate,
            end_date: endDate,
            play_days: Array.from(playDays),
            start_time: startTime,
            end_time: endTime,
            match_duration_minutes: matchDuration,
            scoring_mode: scoringMode,
            swiss_pools: swissPools,
            league_draw_styles: leagueDrawStyles,
            pool_sizes: poolSizeOverrides,
            pool_allocation: poolAllocation,
            swiss_rounds: (roundFormat === "swiss" || Object.values(leagueFormats).includes("swiss")) ? swissRounds : null,
            expected_players: Object.keys(expectedPlayers).length > 0 ? expectedPlayers : null,
            league_formats: usePerLeagueFormats ? leagueFormats : null,
            league_sections: sectionsFromPools(swissPools, (gn) => formatForLeague(gn) === "knockout", numGroups, leagueSections),
            points_per_game: pointsPerGame > 0 ? pointsPerGame : 11,
            best_of: bestOf > 0 ? bestOf : null,
            play_all_games: playAllGames,
            win_condition: winCondition,
            group_durations: groupDurations,
            group_break_minutes: groupBreakMinutes,
            group_labels: groupLabels,
            default_break_minutes: defaultBreakMinutes,
            court_rotation_minutes: courtRotationMinutes,
            avoid_back_to_back: avoidBackToBack,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: effectiveRegistrationMode,
            partner_mode: isDoubles ? (partnerMode || "admin") : "admin",
            registration_opens_at: registrationRequired ? fromLocalInputValue(registrationOpensAt) : null,
            registration_closes_at: registrationRequired ? fromLocalInputValue(registrationClosesAt) : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            registration_required: registrationRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
            invite_source: inviteSource,
            invite_audience: inviteAudience,
            invite_audience_league_ids: Array.from(audienceLeagueIds),
            invite_audience_member_ids: Array.from(audienceMemberIds),
            invite_audience_club_ids: audienceClubIds,
            invite_audience_include_individuals: audienceIncludeIndividuals,
            entry_source: entrySource,
            approval_gate: approvalGate,
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
      ranking_weight: rankingWeight,
            ladder_affects: ladderAffects,
            day_schedules: customizeDailySchedule ? daySchedules : [],
            court_ids: Array.from(selectedCourtIds),
            schedule_mode: scheduleMode,
            scheduling_mode: schedulingMode,
            round_play_by: serializeRoundDeadlines(roundDeadlines),

            playoff_break_minutes: Math.max(0, Math.round(Number(playoffBreakMinutes) || 0)),
            playoff_date: playoffDate || null,
          }))
          .select()
          .single();
        if (champErr) throw champErr;
        champId = champ.id;
      }

      if (awaitingPlayerPairs) {
        if (registrationUsesInviteList) {
          const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
          const resolvedIds = await promoteVisitorIds(Array.from(selectedPlayerIds));
          const registrations = resolvedIds.map((memberId) => ({
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

      // Read the current draw BEFORE anything destructive happens. Matches a
      // player has already booked a court for (self-scheduled knockouts) or
      // that already carry a result are "protected" — the rebuild below either
      // carries them across intact or aborts. It never deletes them.
      const { data: oldMatches } = await fromExt("club_champs_matches")
        .select("id, group_number, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, scheduled_date, scheduled_time, court_id, booking_id, winner_member_id, status, is_bye")
        .eq("champ_id", champId);
      const protectedSchedules = collectProtectedSchedules((oldMatches || []) as any[]);

      // Create entries. Promote any `visitor-*` IDs to real club_members rows
      // first, otherwise the FK on club_champs_entries.club_member_id fails.
      let resolvedPairDbId = (id: string) => toDbId(id);
      if (isDoubles) {
        const incomplete = (groups as DoublePair[][]).flatMap((gp) => gp).filter((p) => !p?.player1Id || !p?.player2Id);
        if (incomplete.length > 0) {
          throw new Error(`${incomplete.length} pair${incomplete.length === 1 ? " has" : "s have"} a missing player — fix the pairing before saving`);
        }
        const rawIds = (groups as DoublePair[][]).flatMap((gp) => gp.flatMap((p) => [p.player1Id, p.player2Id])).filter(Boolean) as string[];
        const resolved = await promoteVisitorIds(rawIds);
        const idMap = new Map<string, string>();
        rawIds.forEach((raw, i) => idMap.set(raw, resolved[i]));
        const resolveId = (id: string) => idMap.get(id) || toDbId(id);
        resolvedPairDbId = resolveId;
        const entries = (groups as DoublePair[][]).flatMap((groupPairs, gi) =>
          groupPairs.map((pair, orderIndex) => ({
              champ_id: champId,
              club_member_id: resolveId(pair.player1Id),
              partner_member_id: resolveId(pair.player2Id),
              group_number: gi + 1,
              order_index: orderIndex,
          }))
        );
        // A player may hold an entry in several divisions — the entry key is
        // (tournament, player, division), never just (tournament, player).
        const { error: entryErr } = await fromExt("club_champs_entries").upsert(entries, { onConflict: "champ_id,club_member_id,group_number" });

        if (entryErr) throw entryErr;
        const keepIds = entries.map((e) => e.club_member_id);
        if (keepIds.length > 0) await fromExt("club_champs_entries").delete().eq("champ_id", champId).not("club_member_id", "in", `(${keepIds.join(",")})`);
        await syncDoublesRegistrationsForPairs(
          champId,
          entries.map((e) => ({ player1Id: e.club_member_id, player2Id: e.partner_member_id })),
        );
      } else {
        const rawIds = (groups as ClubMember[][]).flatMap((gp) => gp.map((p) => p.id)).filter(Boolean) as string[];
        const resolved = await promoteVisitorIds(rawIds);
        const idMap = new Map<string, string>();
        rawIds.forEach((raw, i) => idMap.set(raw, resolved[i]));
        const entries = (groups as ClubMember[][]).flatMap((groupPlayers, gi) =>
          groupPlayers.map((p, orderIndex) => ({
            champ_id: champId,
            club_member_id: idMap.get(p.id) || toDbId(p.id),
            group_number: gi + 1,
            order_index: orderIndex,
          }))
        );
        const { error: entryErr } = await fromExt("club_champs_entries").upsert(entries, { onConflict: "champ_id,club_member_id,group_number" });
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
            player_a_member_id: resolvedPairDbId(pairA?.player1Id || m.entityA),
            partner_a_member_id: pairA?.player2Id ? resolvedPairDbId(pairA.player2Id) : null,
            player_b_member_id: m.entityB ? resolvedPairDbId(pairB?.player1Id || m.entityB) : null,
            partner_b_member_id: pairB?.player2Id ? resolvedPairDbId(pairB.player2Id) : null,
            scheduled_date: isBye ? null : m.date,
            scheduled_time: isBye ? null : m.time,
            court_id: isBye ? null : m.courtId,
            leg: m.leg ?? null,
            section_number: m.koSection ?? null,
            stage: m.koSection ? "ko" : null,
            stage_label: m.koStageLabel ?? null,
            is_bye: isBye,
            bye_member_id: isBye ? resolvedPairDbId(pairA?.player1Id || m.entityA) : null,
            ...(isBye && m.koSection && !m.entityB
              ? { winner_member_id: resolvedPairDbId(pairA?.player1Id || m.entityA) }
              : {}),
            status: isBye
              ? (m.koSection && !m.entityB) || byeForLeague(m.groupNum) === "walkover_win"
                ? "completed"
                : "scheduled"
              : "scheduled",

          };
        }
        // Knockout byes are one-sided and auto-advance the entrant; other
        // formats keep their existing bye representation.
        const isKoBye = isBye && !!m.koSection && !m.entityB;
        return {
          champ_id: champId,
          group_number: m.groupNum,
          round_number: m.roundNum,
          player_a_member_id: toDbId(m.entityA),
          player_b_member_id: m.entityB ? toDbId(m.entityB) : null,
          scheduled_date: isBye ? null : m.date,
          scheduled_time: isBye ? null : m.time,
          court_id: isBye ? null : m.courtId,
          leg: m.leg ?? null,
          section_number: m.koSection ?? null,
          stage: m.koSection ? "ko" : null,
          stage_label: m.koStageLabel ?? null,
          is_bye: isBye,
          bye_member_id: isBye ? toDbId(m.entityA) : null,
          ...(isKoBye ? { winner_member_id: toDbId(m.entityA) } : {}),
          status: isKoBye
            ? "completed"
            : isBye
              ? (byeForLeague(m.groupNum) === "walkover_win" ? "completed" : "scheduled")
              : "scheduled",

          // Self-scheduled: no fixed slot or court, just a deadline.
          ...(schedulingMode === "self"
            ? {
                scheduled_date: null,
                scheduled_time: null,
                court_id: null,
                play_by: deadlineForRound(roundDeadlines, m.roundNum) || endDate || null,
              }
            : {}),
        };
      });
      // Hard invariant: never persist a playable fixture of a player against
      // themselves — fail loudly instead of saving a corrupt draw.
      const selfFixture = matches.find(
        (r: any) => !r.is_bye && r.player_a_member_id && r.player_a_member_id === r.player_b_member_id,
      );
      if (selfFixture) {
        throw new Error(
          `Draw generation aborted: a player was paired against themselves in division ${(selfFixture as any).group_number}. Check for duplicate entries in that division.`,
        );
      }
      // Protected fixtures must still exist in the new draw. If any would be
      // lost, abort BEFORE deleting anything — the old draw and the players'
      // bookings stay exactly as they were.
      const reconciled = reconcileProtectedSchedules(protectedSchedules, matches as any[]);
      if (reconciled.orphans.length > 0) {
        throw new Error(orphanedScheduleMessage(reconciled.orphans));
      }
      // Carry each protected court/date/time onto its new row so the rebuild
      // never blanks a player's confirmed slot, even in self-scheduled mode.
      // Already-played matches also carry their result across — a rebuild must
      // never turn a completed match back into an unplayed fixture.
      for (const { protectedSchedule: p, match } of reconciled.matched) {
        Object.assign(match as any, resultCarryOver(p, match as any));
        if (!p.bookingId && !p.scheduledDate) continue;
        (match as any).court_id = p.courtId;
        (match as any).scheduled_date = p.scheduledDate;
        (match as any).scheduled_time = p.scheduledTime;
        (match as any).booking_id = p.bookingId;
      }


      // Destructive rebuild happens only now: the draft is saved, the schedule
      // is valid and every protected fixture has a home in the new draw.
      // Organiser court blocks (`champ:<id>:block:…`) are replaced; player
      // bookings (`champ:<id>:match:…`) are deliberately left untouched.
      await fromExt("bookings").delete().like("external_id", `champ:${champId}:block:%`);
      const keepBookingIds = new Set(
        protectedSchedules.map((p) => p.bookingId).filter(Boolean) as string[],
      );
      for (const m of (oldMatches || []) as any[]) {
        if (!m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
        if (m.booking_id && keepBookingIds.has(m.booking_id)) continue; // player-owned slot
        await fromExt("bookings").delete()
          .eq("date", m.scheduled_date)
          .eq("start_time", m.scheduled_time)
          .eq("court_id", m.court_id)
          .eq("source", "club_event")
          .not("external_id", "like", "%:match:%");
      }
      await fromExt("club_champs_matches").delete().eq("champ_id", champId);

      if (matches.length > 0) {

        const { data: insertedMatches, error: matchErr } = await fromExt("club_champs_matches")
          .insert(matches)
          .select("id, group_number, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, booking_id");

        if (matchErr) throw matchErr;

        // Re-point the surviving bookings at the new match ids so the booking
        // ↔ match link (and its `champ:…:match:<id>` external id) stays valid.
        const relink = reconcileProtectedSchedules(
          protectedSchedules.filter((p) => !!p.bookingId),
          (insertedMatches || []) as any[],
        );
        for (const { protectedSchedule: p, match } of relink.matched) {
          if (!p.bookingId || !match.id) continue;
          await fromExt("bookings")
            .update({ external_id: `champ:${champId}:match:${match.id}` })
            .eq("id", p.bookingId);
        }
      }

      // Play-off placeholders: reserve court slots for the knockout / finals
      // up-front so admins can see the tournament's true end date from day 1.
      // Real players fill in via handleGeneratePlayoffs once group standings
      // are known — those rows keep the same court + start_time.
      const placeholderRows = (schedulePreview as any).playoffPlaceholders as any[] | undefined;
      if (enablePlayoffs && placeholderRows && placeholderRows.length > 0) {
        const rowsToInsert = placeholderRows.map((r) => ({
          champ_id: champId,
          group_number: r.group_number,
          round_number: r.round_number,
          stage: r.stage,
          stage_label: r.stage_label,
          bracket_position: r.bracket_position,
          player_a_member_id: null,
          partner_a_member_id: null,
          player_b_member_id: null,
          partner_b_member_id: null,
          placeholder_a: r.placeholder_a ?? null,
          placeholder_b: r.placeholder_b ?? null,
          scheduled_date: r.__date ?? null,
          scheduled_time: r.__time ?? null,
          court_id: r.__courtId ?? null,
          is_bye: false,
          status: "scheduled",
        }));
        const { error: pErr } = await fromExt("club_champs_matches").insert(rowsToInsert);
        if (pErr) console.warn("Play-off placeholder insert failed:", pErr);
      }

      // League-ranking handicap: compute starting-score offsets for every match.
      if (matchType === "singles" && handicapMode !== "none") {
        try {
          // Rank source per mode:
          //  - group_order: uses the drag order on the Leagues/Groups step.
          //  - league_rank: ALWAYS uses the club's league main setup
          //    (DB player_rank + division), even across divisions.
          //    Admin explicitly picked "By Club League main setup" so we
          //    must honour it — do NOT silently switch to group order.
          //  - club_ladder: uses club_members.ladder_position.
          let scoreByMember: Map<string, number> | undefined;
          if (handicapMode === "group_order") {
            const groupIds = (groups as ClubMember[][]).map((g) => g.map((m) => m.id));
            scoreByMember = buildScoreMapFromGroups(groupIds, groupRankScope);
          }
          const dbMode = handicapMode === "group_order" ? "league_rank" : handicapMode;
          const n = await applyHandicapsToChamp(champId, clubId, {
            mode: dbMode,
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
      // Include play-off placeholder slots in booking coverage.
      for (const r of (schedulePreview as any).playoffPlaceholders || []) {
        if (!r.__date || !r.__time || !r.__courtId) continue;
        const [h, min] = String(r.__time).split(":").map(Number);
        const endMins = h * 60 + min + matchDuration;
        const endH = Math.floor(endMins / 60) % 24;
        const endM = endMins % 60;
        const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        const key = `${r.__date}:${r.__courtId}`;
        const existing = slotMap.get(key);
        if (!existing) {
          slotMap.set(key, { date: r.__date, courtId: r.__courtId, start: r.__time, end: endStr });
        } else {
          if (r.__time < existing.start) existing.start = r.__time;
          if (endStr > existing.end) existing.end = endStr;
        }
      }

      // Knockout divisions only have their first round dated at save time, so
      // also reserve every remaining play day in the window (Mon/Wed/Fri etc.)
      // provisionally — later rounds land inside those blocks.
      const hasKnockoutDivision = Array.from(
        { length: Math.max(1, numGroups || 1) },
        (_, i) => formatForLeague(i + 1),
      ).some((f) => f === "knockout");
      if (hasKnockoutDivision && startDate && endDate) {
        const courtIds = Array.from(selectedCourtIds);
        const gStart = String(startTime || "").slice(0, 5);
        const gEnd = String(endTime || "").slice(0, 5);
        const addBlock = (date: string, cid: number, start: string, end: string) => {
          const key = `${date}:${cid}`;
          const existing = slotMap.get(key);
          if (!existing) {
            slotMap.set(key, { date, courtId: cid, start, end });
          } else {
            if (start < existing.start) existing.start = start;
            if (end > existing.end) existing.end = end;
          }
        };
        if (customizeDailySchedule && daySchedules.length > 0) {
          for (const d of daySchedules) {
            if (!d.date || !d.start_time || !d.end_time) continue;
            const cs = (d.court_ids && d.court_ids.length > 0)
              ? d.court_ids.filter((id) => selectedCourtIds.has(id))
              : courtIds;
            for (const cid of cs) {
              addBlock(d.date, cid, String(d.start_time).slice(0, 5), String(d.end_time).slice(0, 5));
            }
          }
        } else if (gStart && gEnd) {
          const cur = new Date(startDate);
          const endD = new Date(endDate);
          while (cur <= endD) {
            if (playDays.size === 0 || playDays.has(cur.getDay())) {
              const date = format(cur, "yyyy-MM-dd");
              for (const cid of courtIds) addBlock(date, cid, gStart, gEnd);
            }
            cur.setDate(cur.getDate() + 1);
          }
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

      // Self-scheduled tournaments never reserve courts — players book their
      // own game like any normal court booking.
      if (schedulingMode === "club" && bookings.length > 0) {

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

      // Leave a permanent, attributable trace of every (re)generation — a
      // rebuild reshuffles live fixtures, so "who pressed it" must be answerable.
      try {
        const { data: authData } = await supabase.auth.getUser();
        const { data: lastVersion } = await fromExt("tournament_draw_versions")
          .select("version")
          .eq("tournament_id", champId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { count: builtCount } = await fromExt("club_champs_matches")
          .select("id", { count: "exact", head: true })
          .eq("champ_id", champId);
        await fromExt("tournament_draw_versions").insert({
          tournament_id: champId,
          version: Number((lastVersion as any)?.version || 0) + 1,
          note: editingChampId ? "Schedule rebuilt from tournament wizard" : "Initial schedule generated",
          match_count: builtCount || 0,
          created_by: authData?.user?.id ?? null,
        });
      } catch (auditErr) {
        console.warn("Draw version audit could not be written:", auditErr);
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
          toast.info(`Reminder: send invites on ${when.toLocaleString()} via the edit dialog → “Invite actions”.`, { duration: 8000 });
        } else {
          toast.info(`Tournament saved. Open the edit dialog and click “Invite actions” when you're ready to notify ${inviteeCount} member${inviteeCount === 1 ? "" : "s"}.`, { duration: 7000 });
        }
      }

      // For real schedule generation (not just saving a shell awaiting player
      // pairs), keep the wizard open on a Preview step so the admin can review
      // the full schedule, filter by league/pool/date, and step back to edit
      // if something looks wrong. The wizard only truly closes on Finalize.
      if (!awaitingPlayerPairs && data?.id) {
        if (!editingChampId) setEditingChampId(data.id);
        setStep("preview");
        return;
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
      // Knockout divisions only materialise their FIRST round now — later rounds
      // are generated as results come in. Booking only the matches that exist
      // would reserve just the opening evening, so a knockout reserves the whole
      // play window (every ticked play day across the date range) provisionally.
      const hasKnockoutDivision = Array.from(
        { length: Math.max(1, numGroups || 1) },
        (_, i) => formatForLeague(i + 1),
      ).some((f) => f === "knockout");
      const reserveWholeWindow = isBellsMode || hasKnockoutDivision;
      const { data: champRow } = await fromExt("club_champs").select("name").eq("id", champId).maybeSingle();
      const tournamentLabel = ((champRow?.name as string) || champName || "Tournament").trim();
      type Slot = { date: string; courtId: number; start: string; end: string };

      let rows: any[];

      if (reserveWholeWindow) {
        // Reserve each (date, court) as one tournament block for the playing
        // window. Derived from the tournament's configured play days + courts,
        // never from per-match scheduled_date (Bells and phased knockouts don't
        // have a full set of dated fixtures up front).
        const gStart = String(startTime || "").slice(0, 5);
        const gEnd = String(endTime || "").slice(0, 5);
        const usingDayWindows = customizeDailySchedule && daySchedules.length > 0;
        if (!usingDayWindows && (!gStart || !gEnd)) {
          throw new Error("Set the tournament start and end time before booking courts.");
        }
        if (!startDate || !endDate) {
          throw new Error("Set the tournament start and end dates before booking courts.");
        }
        const courtIds = Array.from(selectedCourtIds);
        if (courtIds.length === 0) {
          throw new Error("Select at least one court before booking.");
        }

        // Per (date, court) window: widest span across that date's sessions.
        const blocks = new Map<string, Slot>();
        const addBlock = (date: string, cid: number, start: string, end: string) => {
          const key = `${date}:${cid}`;
          const existing = blocks.get(key);
          if (!existing) {
            blocks.set(key, { date, courtId: cid, start, end });
          } else {
            if (start < existing.start) existing.start = start;
            if (end > existing.end) existing.end = end;
          }
        };

        if (usingDayWindows) {
          for (const d of daySchedules) {
            if (!d.date || !d.start_time || !d.end_time) continue;
            const cs = (d.court_ids && d.court_ids.length > 0)
              ? d.court_ids.filter((id) => selectedCourtIds.has(id))
              : courtIds;
            for (const cid of cs) {
              addBlock(d.date, cid, String(d.start_time).slice(0, 5), String(d.end_time).slice(0, 5));
            }
          }
        } else {
          // Enumerate EVERY ticked play day between startDate and endDate — so
          // Mon + Wed + Fri over four weeks reserves all twelve evenings.
          const cur = new Date(startDate);
          const end = new Date(endDate);
          while (cur <= end) {
            if (playDays.size === 0 || playDays.has(cur.getDay())) {
              const date = format(cur, "yyyy-MM-dd");
              for (const cid of courtIds) addBlock(date, cid, gStart, gEnd);
            }
            cur.setDate(cur.getDate() + 1);
          }
        }

        if (blocks.size === 0) {
          throw new Error("No play days fall within the tournament date range.");
        }

        rows = Array.from(blocks.values()).map((s) => ({
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

  // Builds the invitation body shared by in-app / email / WhatsApp channels.
  function buildInviteBody() {
    const descHasDetails = /— Tournament details —/.test(description);
    const detailLines = descHasDetails ? [] : buildInviteDetailLines({
      gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
      startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
      registrationOpensAt, registrationClosesAt, entryFeeRand,
      pointsPerGame, bestOf,
      registrationRequired, registrationMode: (registrationMode || "open") as any,
      tournamentName: champName, divisionFormats: inviteDivisionFormats(),
      selfScheduled: schedulingMode === "self", roundDeadlines,
    });
    const extra = inviteExtraDetails.trim();
    return `You have been invited to ${champName || "a tournament"}.` +
      (detailLines.length ? `\n\n${detailLines.map((l) => `• ${l}`).join("\n")}` : "") +
      (description.trim() ? `\n\n${description.trim()}` : "") +
      (extra ? `\n\n${extra}` : "");
  }

  // Shared helper: send invite notifications (and flag rows as invited) for a champ.
  // Used by the post-create prompt and the "Invite actions" menu.
  // `mode` is explicit: "selected" NEVER widens to the full roster, for any reason.
  async function sendChampInvites(
    champId: string,
    opts?: { confirm?: boolean; registrationIds?: string[]; mode?: InviteSendMode },
  ) {
    const mode: InviteSendMode = opts?.mode || (opts?.registrationIds ? "selected" : "all");
    const only = mode === "selected";
    if (only && (!opts?.registrationIds || opts.registrationIds.length === 0)) {
      toast.error("No members were selected — nothing was sent.");
      return;
    }
    if (sendingInvitesRef.current.has(champId)) {
      toast.info("Invites are already being sent — please wait.");
      return;
    }
    sendingInvitesRef.current.add(champId);
    setInvitesSendingFor(champId);
    try {
      // Structure selections are authoritative. Materialise their invite rows
      // before confirmation/counting so an older draft with an empty legacy
      // invite selector can still send immediately and never expands to every
      // club member by mistake.
      // Only materialise the Structure-derived roster when the organiser has NOT
      // chosen an explicit invitation audience — otherwise the audience alone
      // decides who gets a row and who is mailed.
      const hasExplicitAudience = editingChampId === champId && resolvedAudience.memberIds.length > 0;
      if (!only && editingChampId === champId && structureLeagueIds.size > 0 && !hasExplicitAudience) {
        await saveEntriesDraft(champId);
      }



      // If the wizard is currently open editing this tournament in invite mode,
      // ensure the registrations table reflects the latest audience selection
      // BEFORE we read it. This guarantees that newly-added invitees (e.g. after
      // an admin expanded the audience from a shortlist to "all members") get a
      // registration row and therefore receive the invite. We only insert
      // missing rows — existing rows (paid / cancelled / etc.) are left intact.
      // The organiser's INVITATION AUDIENCE is authoritative for a bulk send.
      // When the wizard is open on this tournament we materialise exactly that
      // audience (never the whole roster) and, further down, we also restrict
      // the recipient list to it so nobody outside the audience is mailed.
      const audienceSet =
        !only && editingChampId === champId ? new Set(resolvedAudience.memberIds) : null;
      const audienceMemberIds = only
        ? []
        : audienceSet
          ? Array.from(audienceSet).filter((id) => {
              const m = members.find((x) => x.id === id);
              return !m || memberMatchesTournamentGender(m.gender, gender);
            })
          : await promoteVisitorIds(Array.from(selectedPlayerIds));

      if (!only && editingChampId === champId && audienceMemberIds.length > 0) {
        const fee = Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0);
        const newRegs = audienceMemberIds.map((memberId) => ({
          champ_id: champId,
          club_member_id: memberId,
          status: fee > 0 && paymentRequired ? "pending_payment" : "paid",
          invited_by_admin: false,
          fee_paid_cents: 0,
        }));
        if (newRegs.length > 0) {
          const { error: upsertErr } = await fromExt("club_champs_registrations").upsert(newRegs, {
            onConflict: "champ_id,club_member_id",
            ignoreDuplicates: true,
          } as any);
          if (upsertErr) throw upsertErr;
        }
        // Re-invite: somebody who previously declined (cancelled) is picked
        // again on purpose, so reopen their row instead of silently skipping
        // them — otherwise the send resolves to nobody.
        const { error: reopenErr } = await fromExt("club_champs_registrations")
          .update({ status: fee > 0 && paymentRequired ? "pending_payment" : "invited" })
          .eq("champ_id", champId)
          .in("club_member_id", audienceMemberIds)
          .eq("status", "cancelled");
        if (reopenErr) throw reopenErr;
      }


      const { data: allRegs, error: regErr } = await fromExt("club_champs_registrations")
        .select("id, club_member_id, status, invited_by_admin")
        .eq("champ_id", champId);
      if (regErr) throw regErr;

      // Fail-closed audience filter: a bulk send only ever reaches registration
      // rows whose member is inside the chosen invitation audience.
      const allowedIds = audienceMemberIds.length > 0 ? new Set(audienceMemberIds) : null;
      let regs =
        !only && allowedIds
          ? ((allRegs || []) as any[]).filter((r) => allowedIds.has(r.club_member_id))
          : ((allRegs || []) as any[]);

      // Fail-closed VISITOR guard. Visitors may sit in the player pool, but
      // they are never notified unless "Include visitors" is explicitly on.
      if (!includeVisitors && regs.length > 0) {
        const memberIds = Array.from(new Set(regs.map((r: any) => r.club_member_id).filter(Boolean)));
        const { data: roleRows, error: roleErr } = await fromExt("club_members")
          .select("id, role, club_member_number")
          .in("id", memberIds);
        if (roleErr) throw roleErr;
        const { kept, removed } = filterVisitorRecipients(regs as any[], (roleRows || []) as any[], false);
        regs = kept;
        if (removed > 0) {
          toast.info(`${removed} visitor${removed === 1 ? "" : "s"} skipped — turn on “Include visitors” to invite them.`);
        }
      }

      if (!only && regs.length === 0) {
        toast.error("Nobody in the selected invitation audience — nothing was sent.");
        return;
      }


      // Fail-closed recipient resolution. A selective send resolves ONLY the
      // exact ids the organiser ticked; it never widens to the roster.
      const first: ResolveResult = resolveInviteRecipients({
        mode,
        registrations: (regs || []) as any[],
        selectedIds: opts?.registrationIds,
      });
      let resolved: ResolveResult = first;
      if (!first.ok && mode === "all" && first.error === "Everyone is already registered.") {
        const everyone = ((regs || []) as any[]).filter(
          (r) => r.club_member_id && String(r.status || "").toLowerCase() !== "cancelled",
        );
        if (!confirm(`Everyone is already registered. Re-send invite to all ${everyone.length} invited member${everyone.length === 1 ? "" : "s"} anyway?`)) return;
        resolved = resolveInviteRecipients({
          mode,
          registrations: (regs || []) as any[],
          allowResendAll: true,
        });
      }
      if (!resolved.ok) {
        toast.error(resolved.error);
        return;
      }
      const rows = resolved.rows as any[];

      if (opts?.confirm) {
        const names = rows.map((r) => memberNameById.get(r.club_member_id) || "Unknown member");
        if (!confirm(inviteConfirmSummary(mode, names))) return;
      }



      // Build recipient-specific, tenant-aware invitation URLs. Never fall
      // back to the generic tournament page: that page cannot identify the
      // invitee and therefore cannot offer Accept / Decline.
      const { data: clubRow } = await fromExt("clubs")
        .select("subdomain")
        .eq("id", clubId)
        .maybeSingle();
      const sub = (clubRow as any)?.subdomain as string | undefined;

      // Mint (idempotently) a recipient-specific invitation token per invitee.
      // The same canonical /i/<token> URL is used by in-app, email and WhatsApp.
      const tokenByRegistration = new Map<string, string>();
      const { data: tokenRows, error: tokenErr } = await (supabase as any).rpc(
        "ensure_tournament_invite_tokens",
        { p_champ_id: champId },
      );
      if (tokenErr) throw tokenErr;
      for (const t of (tokenRows || []) as any[]) {
        if (t?.registration_id && t?.invite_token) tokenByRegistration.set(t.registration_id, t.invite_token);
      }
      const urlForRegistration = (registrationId: string) => {
        const token = tokenByRegistration.get(registrationId);
        if (!token) throw new Error("Could not create a secure invitation link for one or more players. No invitations were sent.");
        return buildInviteUrl(token, sub);
      };

      const methods = Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"]));
      const sendApp = methods.includes("app");
      const sendEmail = methods.includes("email");
      const msg = buildInviteBody();



      // Server-enforced dispatch: the RPC only notifies the exact registration
      // ids supplied, verifies they belong to this tournament, records an audit
      // row with requested vs sent counts, and refuses an empty set.
      const recipients = rows.map((r: any) => ({ registration_id: r.id, url: urlForRegistration(r.id) }));
      const { data: sendRes, error: sendErr } = await (supabase as any).rpc("send_champ_invite_notifications", {
        p_champ_id: champId,
        p_recipients: recipients,
        p_title: "Tournament invitation",
        p_message: msg,
        p_send_email: sendEmail,
        p_app_silent: !sendApp,
        p_description: description.trim() || null,
        p_mode: mode,
      });
      if (sendErr) throw sendErr;
      const sentCount = Number((sendRes as any)?.sent ?? rows.length);
      if (sentCount !== rows.length) {
        toast.warning(`Intended ${rows.length} recipient${rows.length === 1 ? "" : "s"}, delivered ${sentCount}.`);
      }


      // WhatsApp channel — members reply YES/NO and the whatsapp-inbound
      // webhook writes the entry back into club_champs_registrations.
      if (methods.includes("whatsapp")) {
        // Each recipient gets their own canonical invitation link, so the
        // WhatsApp message carries exactly the same URL as email / in-app.
        for (const r of rows as any[]) {
          try {
            await sendWhatsApp({
              clubId,
              recipients: [{ member_id: r.club_member_id }],
              kind: "champ_invite",
              category: "utility",
              body: `${msg}\n\nReply YES to enter or NO to decline.\n${urlForRegistration(r.id)}`,
              interaction: {
                kind: "champ_entry",
                targetId: champId,
                prompt: `Entry for ${champName || "tournament"}`,
              },
            });
          } catch (waErr: any) {
            toast.warning(`WhatsApp invites failed: ${waErr?.message || "unknown error"}`);
            break;
          }
        }
      }

      setLastInviteSend({ at: new Date().toISOString(), count: rows.length, mode });
      toast.success(
        only
          ? `Reminder sent to ${rows.length} selected member${rows.length === 1 ? "" : "s"}.`
          : `Sent invites to ${rows.length} member${rows.length === 1 ? "" : "s"}.`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to send invites");
    } finally {
      sendingInvitesRef.current.delete(champId);
      setInvitesSendingFor((cur) => (cur === champId ? null : cur));
    }
  }

  // Sends a clearly-labelled TEST invitation to an explicitly entered email
  // address, using a real invitee's secure /i/<token> journey. It may
  // materialise the selected roster and mint the token, but it does not mark
  // the invitation as sent or create a payment/response.
  // Last bulk send for this tournament (session-local) so the organiser can see
  // that the trigger actually fired and how many people it reached.
  const [lastInviteSend, setLastInviteSend] = useState<{ at: string; count: number; mode: InviteSendMode } | null>(null);
  const [testInviteSending, setTestInviteSending] = useState(false);
  const [testInviteDialogOpen, setTestInviteDialogOpen] = useState(false);
  const [testInviteEmail, setTestInviteEmail] = useState("");
  const [testInviteEmailError, setTestInviteEmailError] = useState("");
  const [testInvitePreviewAs, setTestInvitePreviewAs] = useState<{ memberId: string; name: string } | null>(null);
  const testInviteEmailSchema = z.string().trim().email("Enter a valid email address").max(255, "Email address is too long");

  function openTestInviteDialog(previewAs?: { memberId: string; name: string } | null) {
    setTestInvitePreviewAs(previewAs || null);
    setTestInviteEmailError("");
    setTestInviteDialogOpen(true);
  }

  async function sendTestInvite(
    champId: string,
    recipientEmail: string,
    opts?: { asMemberId?: string; asName?: string },
  ) {
    if (testInviteSending) return;
    const parsedEmail = testInviteEmailSchema.safeParse(recipientEmail);
    if (!parsedEmail.success) {
      setTestInviteEmailError(parsedEmail.error.issues[0]?.message || "Enter a valid email address");
      return;
    }
    setTestInviteSending(true);
    try {
      const previewMember = opts?.asMemberId
        ? { memberId: opts.asMemberId, name: opts.asName || memberNameById.get(opts.asMemberId) || "invited player" }
        : sampleInvitee;
      if (!previewMember) {
        throw new Error("Select league teams and save the tournament before sending a test invitation.");
      }

      await saveEntriesDraft(champId, undefined, { inviteRosterOnly: true, materializeAudience: true });

      const { data: previewRegistration, error: registrationError } = await fromExt("club_champs_registrations")
        .select("id")
        .eq("champ_id", champId)
        .eq("club_member_id", previewMember.memberId)
        .maybeSingle();
      if (registrationError) throw registrationError;
      if (!(previewRegistration as any)?.id) {
        throw new Error(`Could not prepare an invitation for ${previewMember.name}.`);
      }

      const { data: clubRow } = await fromExt("clubs")
        .select("subdomain")
        .eq("id", clubId)
        .maybeSingle();
      const sub = (clubRow as any)?.subdomain as string | undefined;

      const { data: tokenRows, error: tokenError } = await (supabase as any).rpc(
        "ensure_tournament_invite_tokens",
        { p_champ_id: champId },
      );
      if (tokenError) throw tokenError;
      const previewToken = ((tokenRows || []) as any[]).find(
        (row) => row?.registration_id === (previewRegistration as any).id,
      )?.invite_token;
      if (!previewToken) throw new Error(`Could not create a secure invitation link for ${previewMember.name}.`);
      const previewUrl = buildInviteUrl(previewToken, sub);

      // Tenant-branded: send through the CLUB's own email settings when the
      // club has SMTP configured; the backend falls back to the platform
      // sender only when the club has none.
      const { data: sendData, error: sendError } = await supabase.functions.invoke("email-notifications", {
        body: {
          action: "club-send",
          clubId,
          to: parsedEmail.data,
          subject: `${champName || "Tournament"} — invitation (test)`,
          body: buildInviteBody(),
          url: previewUrl,
          ctaLabel: "Accept / Register",
          recipientName: previewMember.name,
        },
      });
      if (sendError || (sendData as any)?.ok === false) {
        throw new Error(await edgeErrorMessage(sendError, sendData, "The test invite could not be sent."));
      }

      if ((sendData as any)?.fallbackUsed) {
        toast.warning((sendData as any)?.warning || "Your club's own email settings did not work, so the email was sent from the SquashHub address instead.");
      }
      toast.success(`Test invite for ${previewMember.name} sent to ${parsedEmail.data} from ${(sendData as any)?.sender === "platform" ? "the SquashHub address" : ((sendData as any)?.sender || "your club address")}. The secure link is the same one that player will receive.`);

      setTestInviteDialogOpen(false);
      setTestInviteEmail("");
      setTestInvitePreviewAs(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send test invite");
    } finally {
      setTestInviteSending(false);
    }
  }

  /**
   * "Send test invite to myself" — delivers the real invitation layout to the
   * organiser through the currently selected channels, using a NON-MUTATING
   * test link (/i/test/<champId>). It never creates a registration, never
   * changes invitation counts and never creates a payment obligation.
   */
  async function sendTestInviteToMyself(champId: string) {
    if (testInviteSending) return;
    setTestInviteSending(true);
    try {
      const methods = Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"]));
      const wantsEmail = methods.includes("email");
      const wantsApp = methods.includes("app");

      const myEmail = String((myMember as any)?.email || "").trim();
      if (!wantsApp && wantsEmail && !myEmail) {
        throw new Error("No email address on your club profile — add one in your profile, or enable the in-app channel, to receive the test invitation.");
      }
      if (!wantsApp && !wantsEmail) {
        throw new Error("Select the in-app or email delivery channel above to receive a test invitation.");
      }

      const { data: clubRow } = await fromExt("clubs").select("subdomain").eq("id", clubId).maybeSingle();
      const testUrl = buildInviteTestUrl(champId, (clubRow as any)?.subdomain);
      const body = `TEST INVITATION — this is a preview. No entry, payment or invitation count is affected.\n\n${buildInviteBody()}`;

      let delivered: string[] = [];

      if (wantsApp && (myMember as any)?.id) {
        const { error } = await fromExt("notifications").insert([{
          club_member_id: (myMember as any).id,
          title: "TEST — Tournament invitation",
          message: body,
          type: "tournament_invite_test",
          url: testUrl,
          data: { champ_id: champId, test: true, send_email: false, app_silent: false },
          read: false,
        }]);
        if (error) throw error;
        delivered.push("in-app");
      } else if (wantsApp) {
        toast.warning("No club member profile found for your login — the in-app test could not be delivered.");
      }

      if (wantsEmail) {
        if (!myEmail) {
          toast.warning("No email address on your club profile — the email test was skipped.");
        } else {
          const { data: selfSend, error } = await supabase.functions.invoke("email-notifications", {
            body: {
              action: "club-send",
              clubId,
              to: myEmail,
              subject: `TEST — ${champName || "Tournament"} invitation`,
              body,
              url: testUrl,
              ctaLabel: "Accept / Register",
              recipientName: String((myMember as any)?.name || "").trim() || undefined,
            },
          });
          if (error || (selfSend as any)?.ok === false) {
            throw new Error(await edgeErrorMessage(error, selfSend, "The test email could not be sent."));
          }
          if ((selfSend as any)?.fallbackUsed) {
            toast.warning((selfSend as any)?.warning || "Your club's own email settings did not work, so the email was sent from the SquashHub address instead.");
          }
          delivered.push(myEmail);

        }
      }

      if (methods.includes("whatsapp")) {
        toast.info("WhatsApp test invitations aren't wired up yet — the in-app/email test uses the same link.");
      }

      if (delivered.length === 0) throw new Error("No deliverable channel available for a test invitation.");
      toast.success(`Test invitation sent to ${delivered.join(" and ")}. Nothing was registered or charged.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send the test invitation");
    } finally {
      setTestInviteSending(false);
    }
  }

  // ---- "Send to selected members" picker -------------------------------
  const [inviteePickerOpen, setInviteePickerOpen] = useState(false);
  const [inviteeSearch, setInviteeSearch] = useState("");
  const [selectedInviteeRegIds, setSelectedInviteeRegIds] = useState<Set<string>>(new Set());

  const { data: inviteeRows = [], isLoading: inviteesLoading, refetch: refetchInvitees } = useQuery({
    queryKey: ["champ-invitees", editingChampId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, club_member_id, status, invited_by_admin, confirmed_at, paid_at, fee_paid_cents")
        .eq("champ_id", editingChampId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!editingChampId,
  });

  const [inviteePickerPreparing, setInviteePickerPreparing] = useState(false);
  async function openInviteePicker() {
    if (!editingChampId) return;
    setSelectedInviteeRegIds(new Set());
    setInviteeSearch("");
    setInviteePickerOpen(true);
    setInviteePickerPreparing(true);
    try {
      // The picker needs real registration ids for selective sends. Materialise
      // the canonical Structure roster first, then refresh its own query. Older
      // drafts stored the same stable team ids only in `source_league_ids`, so
      // retain that as a compatibility fallback rather than materialising an
      // empty audience.
      await saveEntriesDraft(editingChampId, undefined, { inviteRosterOnly: true, materializeAudience: true });
      await refetchInvitees();
    } catch (error: any) {
      toast.error(error?.message || "Could not load the selected league members");
    } finally {
      setInviteePickerPreparing(false);
    }
  }

  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of members as any[]) m.set(p.id, p.name || p.profiles?.name || p.full_name || "Unknown member");
    return m;
  }, [members]);

  const inviteeList = useMemo(() => {
    const q = inviteeSearch.trim().toLowerCase();
    return (inviteeRows as any[])
      .filter((r) => r.club_member_id)
      .map((r) => ({
        id: r.id as string,
        memberId: r.club_member_id as string,
        name: memberNameById.get(r.club_member_id) || "Unknown member",
        status: String(r.status || "").toLowerCase(),
        invited: !!r.invited_by_admin,
        category: classifyEntrant(r, { paymentRequired: paymentRequired && entryFeeAmount > 0 }),
      }))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inviteeRows, inviteeSearch, memberNameById, paymentRequired, entryFeeAmount]);

  function inviteeStatusLabel(r: { status: string; invited: boolean; category?: any }) {
    const category =
      r.category ??
      classifyEntrant({ status: r.status }, { paymentRequired: paymentRequired && entryFeeAmount > 0 });
    if (category === "pending_invite" && !r.invited) return "Not yet invited";
    return ENTRANT_CATEGORY_LABEL[category as keyof typeof ENTRANT_CATEGORY_LABEL];
  }

  const SKIP_INVITE_STATUSES = new Set(["paid", "waived", "registered", "active", "cancelled"]);
  const allInviteCount = useMemo(
    () =>
      (inviteeRows as any[]).filter(
        (r: any) => r.club_member_id && !SKIP_INVITE_STATUSES.has(String(r.status || "").toLowerCase()),
      ).length,
    [inviteeRows],
  );
  const structureInviteCount = useMemo(() => {
    const ids = new Set<string>();
    structureLeagueIds.forEach((leagueId) => {
      (registrationsByLeague.get(leagueId) || []).forEach((memberId) => {
        if (!inviteExcludedMemberIds.has(memberId)) ids.add(memberId);
      });
    });
    return ids.size;
  }, [structureLeagueIds, registrationsByLeague, inviteExcludedMemberIds]);
  // The chosen INVITATION AUDIENCE is authoritative for the bulk-send count —
  // existing registration rows (from earlier, wider sends) must never inflate it.
  const effectiveAllInviteCount =
    resolvedAudience.memberIds.length || allInviteCount || structureInviteCount;
  const selectedInviteCount = selectedInviteeRegIds.size;

  /** Live acceptance picture for this tournament (drives the Players step). */
  const entrantCounts = useMemo(
    () => countEntrantsByCategory(inviteeRows as any[], { paymentRequired: paymentRequired && entryFeeAmount > 0 }),
    [inviteeRows, paymentRequired, entryFeeAmount],
  );

  /** Accepted entrants who belong to no source league — need a division by hand. */
  const acceptedNeedingDivision = useMemo(() => {
    const inAnyLeague = new Set<string>();
    registrationsByLeague.forEach((ids) => ids.forEach((id) => inAnyLeague.add(id)));
    return filterParticipatingEntrants(inviteeRows as any[], {
      paymentRequired: paymentRequired && entryFeeAmount > 0,
    })
      .filter((r: any) => r.club_member_id && !inAnyLeague.has(r.club_member_id))
      .map((r: any) => ({
        memberId: r.club_member_id as string,
        name: memberNameById.get(r.club_member_id) || "Unknown member",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inviteeRows, registrationsByLeague, memberNameById, paymentRequired, entryFeeAmount]);


  // First real invitee on the list — used for "send a test as an invited player"
  // so an organiser who isn't part of any team can still preview the exact
  // invitation an entrant receives. Sending still goes to the organiser only.
  const sampleInvitee = useMemo(() => {
    const saved = (inviteeRows as any[])
      .filter((r) => r.club_member_id && !SKIP_INVITE_STATUSES.has(String(r.status || "").toLowerCase()))
      .map((r) => ({
        memberId: r.club_member_id as string,
        name: memberNameById.get(r.club_member_id) || "Unknown member",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (saved.length > 0) return saved[0];
    const pending: { memberId: string; name: string }[] = [];
    const seen = new Set<string>();
    structureLeagueIds.forEach((leagueId) => {
      (registrationsByLeague.get(leagueId) || []).forEach((memberId) => {
        if (inviteExcludedMemberIds.has(memberId) || seen.has(memberId)) return;
        seen.add(memberId);
        pending.push({ memberId, name: memberNameById.get(memberId) || "Unknown member" });
      });
    });
    pending.sort((a, b) => a.name.localeCompare(b.name));
    return pending[0] || null;
  }, [inviteeRows, memberNameById, structureLeagueIds, registrationsByLeague, inviteExcludedMemberIds]);


  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; withBookings: boolean } | null>(null);
  const [registrationsChamp, setRegistrationsChamp] = useState<any | null>(null);
  const [bulkImportChamp, setBulkImportChamp] = useState<any | null>(null);

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
      // Clean up any pending invite / partner-invite notifications pointing at this tournament
      try {
        await fromExt("notifications")
          .delete()
          .in("type", ["tournament_invite", "tournament_partner_invite"])
          .like("url", `/club-champs/${id}%`);
      } catch (e) { console.warn("Could not clean tournament notifications:", e); }
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
    onError: (e: any) => {
      toast.error(e?.message || "Could not delete this tournament");
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
    setLeaguePlayoffs({});
    setNumGroups(0);
    setChampName("");
    setStartDate("");
    setEndDate("");
    setPlayDays(new Set());
    setSchedulingMode("club");
    setChampionScope(DEFAULT_CHAMPION_SCOPE);
    setPoolAllocation("snake");
    setRoundDeadlines([]);

    setStartTime("18:00");
    setEndTime("20:00");
    setMatchDuration(0);
    setScheduleMode("spread");
    setPlayoffBreakMinutes(0);
    setPlayoffDate("");
    setScoringMode("");
    setSwissPools({});
    setLeagueDrawStyles({});
    setPoolSizeOverrides({});
    setSwissRounds({});
    setExpectedPlayers({});
    setLeagueFormats({});
    setLeagueSections({});
    setLeagueSources({});
    setLeagueGenders({});
    setLeagueMatchTypes({});
    setUsePerLeagueFormats(false);
    setPointsPerGame(0);
    setBestOf(0);
    setPlayAllGames(false);
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
    setExtraDivisions(new Map());
    setPlayerOrder([]);
    setDoublesPairs([]);
    setPairGroupAssignments(new Map());
    setPairOrder([]);
    setSourceLeagueIds(new Set());
    // A brand-new tournament must never inherit the previous one's selector
    // state: season pick and eligibility overrides are cleared too.
    setSourceSeason(null);
    setSeasonTouched(false);
    setEligibilityOverrides(new Set());
    setRegistrationMode("");
    setPartnerMode("");
    setRegistrationOpensAt("");
    setRegistrationClosesAt("");
    setEntryFeeRand("0");
    setPaymentMethods(new Set(["card"]));
    setPaymentRequired(true);
    setInviteMethods(new Set(["app"]));
    setInviteSource("manual");
    setInviteSourceTouched(false);
    setInviteLeaguesTouched(false);
    setEntrySource("self");
    setApprovalGate("none");
    setPaymentTiming("on_entry");
    setInviteIncludeReserves(true);
    setInviteExcludedMemberIds(new Set());
    setHandicapMode("none");
    setHandicapDivider(1);
    setHandicapMultiplier(1);
    setInviteTiming("manual");
    setInviteScheduledAt("");
    setDescription("");
    setInviteExtraDetails("");
    setAffectsRankingPoints(false);
    setLadderAffects(null);
    setEventType(scope === "club" ? "club_championship" : "open_tournament");
    setEligibilityScope(scope === "club" ? "club" : "open");
    setMaxEntrants("");
    setMaxPerLeague("");
    setSeedingSource("ladder");

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
    // Playoffs are restored per league further down (inheritedPO falls back to
    // the legacy tournament-level `enable_playoffs` column).
    setChampName(champ.name);
    setNumGroups(champ.num_groups);
    setStartDate(champ.start_date);
    setEndDate(champ.end_date);
    setPlayDays(new Set(champ.play_days || []));
    setStartTime(champ.start_time?.slice(0, 5) || "18:00");
    setEndTime(champ.end_time?.slice(0, 5) || "20:00");
    setMatchDuration(champ.match_duration_minutes || 0);
    setScoringMode(((champ as any).scoring_mode as any) || "");
    // Legacy knockout "sections" surface as pools so the organiser sees one concept.
    setSwissPools(mergeLegacySectionsIntoPools(
      ((champ as any).swiss_pools as Record<string, number>) || {},
      ((champ as any).league_sections as Record<string, number>) || {},
      Number(champ.num_groups) || 0,
    ));
    setSwissRounds(((champ as any).swiss_rounds as Record<string, number>) || {});
    setLeagueDrawStyles(() => {
      const raw = ((champ as any).league_draw_styles as Record<string, unknown>) || {};
      const out: Record<string, DrawStyle> = {};
      for (const [k, v] of Object.entries(raw)) if (isDrawStyle(v)) out[k] = v;
      return out;
    });
    setPoolSizeOverrides(((champ as any).pool_sizes as Record<string, number[]>) || {});
    // A confirmed manual draw and the hand-arranged divisions are part of the
    // saved tournament — never re-seed them automatically on reopen.
    setManualDraws(((champ as any).manual_draws as Record<string, DrawBoardModel>) || {});
    setManualSeedGroups(new Set(((champ as any).manual_seed_divisions as number[]) || []));
    // The list row can be a stale cache entry (draw confirmed in another tab or
    // repaired server-side). Re-read the authoritative draw state so the editor
    // never opens on an auto-seeded board and then overwrites the real one.
    void (async () => {
      const { data: fresh } = await fromExt("tournaments")
        .select("manual_draws, manual_seed_divisions")
        .eq("id", champ.id)
        .maybeSingle();
      if (!fresh) return;
      const freshDraws = ((fresh as any).manual_draws as Record<string, DrawBoardModel>) || {};
      if (Object.keys(freshDraws).length > 0) setManualDraws(freshDraws);
      const freshSeeded = ((fresh as any).manual_seed_divisions as number[]) || [];
      if (freshSeeded.length > 0) setManualSeedGroups(new Set(freshSeeded));
    })();


    setPointsPerGame((Number((champ as any).points_per_game) === 15 ? 15 : Number((champ as any).points_per_game) === 11 ? 11 : 0));
    setBestOf((Number((champ as any).best_of) === 3 ? 3 : Number((champ as any).best_of) === 5 ? 5 : 0));
    setPlayAllGames(!!(champ as any).play_all_games);
    setWinCondition(((champ as any).win_condition as any) === "sudden_death" ? "sudden_death" : "win_by_2");
    setGroupDurations(((champ as any).group_durations as Record<string, number>) || {});
    setGroupBreakMinutes(((champ as any).group_break_minutes as Record<string, number>) || {});
    setGroupLabels(((champ as any).group_labels as Record<string, string>) || {});
    setDefaultBreakMinutes(Number((champ as any).default_break_minutes) || 0);
    setCourtRotationMinutes(((champ as any).court_rotation_minutes as number | null) ?? null);
    setAvoidBackToBack((champ as any).avoid_back_to_back !== false);
    setScheduleMode(((champ as any).schedule_mode as "spread" | "fill") || "spread");
    setSchedulingMode(((champ as any).scheduling_mode as any) === "self" ? "self" : "club");
    setChampionScope(((champ as any).champion_scope as any) === "pool" ? "pool" : "division");
    setPoolAllocation(normalisePoolAllocation((champ as any).pool_allocation));
    setRoundDeadlines(parseRoundDeadlines((champ as any).round_play_by));

    setPlayoffBreakMinutes(Number((champ as any).playoff_break_minutes) || 0);
    setPlayoffDate(((champ as any).playoff_date as string) || "");
    setRoundFormat((champ.round_format as any) || "");
    const lf = ((champ as any).league_formats as Record<string, PerLeagueFormat> | null) || null;
    setLeagueFormats(lf || {});
    const legacySections = ((champ as any).league_sections as Record<string, number>) || {};
    setLeagueSections(legacySections);
    setUsePerLeagueFormats(!!lf && Object.keys(lf).length > 0);
    setExpectedPlayers(((champ as any).expected_players as Record<string, number>) || {});
    setByeHandling((champ.bye_handling as any) || "");
    const initialLeagueIds: string[] = Array.isArray(champ.source_league_ids) && champ.source_league_ids.length > 0
      ? champ.source_league_ids
      : (champ.source_league_id ? [champ.source_league_id] : []);
    setSourceLeagueIds(new Set(initialLeagueIds));
    setRegistrationMode((champ.registration_mode as any) || "");
    setPartnerMode((champ.partner_mode as any) || "");
    setRegistrationOpensAt(toLocalInputValue(champ.registration_opens_at));
    setRegistrationClosesAt(toLocalInputValue(champ.registration_closes_at));
    setEntryFeeRand(((champ.entry_fee_cents || 0) / 100).toString());
    setPaymentMethods(new Set(((champ.payment_methods || ["card"]) as ("card"|"eft"|"cash")[])));
    setPaymentRequired((champ as any).payment_required !== false);
    setRegistrationRequired((champ as any).registration_required !== false);
    setInviteMethods(new Set(((champ.invite_methods || ["app"]) as ("app"|"email")[])));
    const loadedInviteSource = (((champ as any).invite_source as any) || "manual");
    setInviteSource(loadedInviteSource);
    // A genuinely saved invite-team selection is authoritative. Older drafts
    // often have only per-division Structure team ids; an empty legacy invite
    // selector must remain untouched so the Structure bridge can hydrate it.
    const hasSavedInviteTeams = initialLeagueIds.length > 0;
    setInviteSourceTouched(hasSavedInviteTeams || loadedInviteSource === "leagues");
    setInviteLeaguesTouched(hasSavedInviteTeams);
    setEntrySource((((champ as any).entry_source as any) || ((champ.registration_mode === "invite") ? "admin" : "self")));
    setApprovalGate((((champ as any).approval_gate as any) || "none"));
    setPaymentTiming((((champ as any).payment_timing as any) || "on_entry"));
    setInviteIncludeReserves((champ as any).invite_include_reserves !== false);
    setInviteExcludedMemberIds(new Set(((champ as any).invite_excluded_member_ids as string[]) || []));
    setInviteAudience((((champ as any).invite_audience as InviteAudienceMode) || "all_club"));
    setAudienceLeagueIds(new Set(((champ as any).invite_audience_league_ids as string[]) || []));
    setAudienceMemberIds(new Set(((champ as any).invite_audience_member_ids as string[]) || []));
    setAudienceClubIds((((champ as any).invite_audience_club_ids as string[]) || []).filter(Boolean));
    setAudienceIncludeIndividuals(!!(champ as any).invite_audience_include_individuals);
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
    setInviteExtraDetails(String((champ as any).invite_extra_details || ""));
    setAffectsRankingPoints(!!(champ as any).affects_ranking_points);
    setRankingWeight(Number((champ as any).ranking_weight ?? 1) || 1);
    setLadderAffects(
      (champ as any).ladder_affects === null || (champ as any).ladder_affects === undefined
        ? null
        : !!(champ as any).ladder_affects,
    );
    const ex = (tournamentExtras || {})[champ.id] || {};
    setEventType(normaliseEventType(ex.event_type, scope));
    setMaxEntrants(ex.max_entrants ? String(ex.max_entrants) : "");
    setMaxPerLeague(ex.max_per_league ? String(ex.max_per_league) : "");
    setSeedingSource(ex.seeding_source || "ladder");
    setLeagueSources(
      parseDivisionSources(
        ex.league_sources as any,
        ex.league_source_modes as any,
        (availableLeagues as any[]).map((l) => ({ id: l.id as string, name: l.name as string })),
      ),
    );
    // Per-league category. Older tournaments have none — every league simply
    // inherits the tournament-level gender / match type.
    const lg = (ex.league_genders as Record<string, GenderCategory> | null) || null;
    const lmt = (ex.league_match_types as Record<string, "singles" | "doubles"> | null) || null;
    const inheritedG: Record<string, GenderCategory> = {};
    const inheritedM: Record<string, "singles" | "doubles"> = {};
    for (let i = 1; i <= (champ.num_groups || 0); i++) {
      inheritedG[String(i)] = (lg?.[String(i)] as GenderCategory) ?? champ.gender;
      inheritedM[String(i)] = (lmt?.[String(i)] as "singles" | "doubles") ?? (champ.match_type || "singles");
    }
    setLeagueGenders(inheritedG);
    setLeagueMatchTypes(inheritedM);
    // Per-league scoring settings (format / par / best-of / win condition) with fallback to
    // the tournament-level values saved on the champ row.
    const lsm = (ex.league_scoring_modes as Record<string, "standard" | "time_capped_points"> | null) || null;
    const lppg = (ex.league_points_per_game as Record<string, 11 | 15> | null) || null;
    const lbo = (ex.league_best_of as Record<string, 3 | 5> | null) || null;
    const lwc = (ex.league_win_conditions as Record<string, "win_by_2" | "sudden_death"> | null) || null;
    const lpa = ((ex as any).league_play_all_games as Record<string, boolean> | null) || null;
    const lpo = ((ex as any).league_playoffs as Record<string, boolean> | null) || null;
    const lbh = ((ex as any).league_bye_handling as Record<string, "no_match" | "walkover_win" | "neutral"> | null) || null;
    const inheritedS: Record<string, "standard" | "time_capped_points"> = {};
    const inheritedP: Record<string, 11 | 15> = {};
    const inheritedB: Record<string, 3 | 5> = {};
    const inheritedW: Record<string, "win_by_2" | "sudden_death"> = {};
    const inheritedPA: Record<string, boolean> = {};
    const inheritedPO: Record<string, boolean> = {};
    const inheritedBH: Record<string, "no_match" | "walkover_win" | "neutral"> = {};
    const lfr = ((ex as any).league_forfeit_rules as ForfeitRuleMap | null) || null;
    const lfp = ((ex as any).league_forfeit_points as ForfeitPointsMap | null) || null;
    const inheritedFR: ForfeitRuleMap = {};
    const inheritedFP: ForfeitPointsMap = {};
    for (let i = 1; i <= (champ.num_groups || 0); i++) {
      inheritedS[String(i)] = (lsm?.[String(i)] as any) ?? ((champ as any).scoring_mode === "time_capped_points" ? "time_capped_points" : "standard");
      inheritedP[String(i)] = (Number(lppg?.[String(i)]) === 15 ? 15 : Number(lppg?.[String(i)]) === 11 ? 11 : (Number((champ as any).points_per_game) === 15 ? 15 : 11));
      inheritedB[String(i)] = (Number(lbo?.[String(i)]) === 5 ? 5 : Number(lbo?.[String(i)]) === 3 ? 3 : (Number((champ as any).best_of) === 5 ? 5 : 3));
      inheritedW[String(i)] = (lwc?.[String(i)] === "sudden_death" ? "sudden_death" : (lwc?.[String(i)] === "win_by_2" ? "win_by_2" : ((champ as any).win_condition || "win_by_2")));
      inheritedPA[String(i)] = lpa?.[String(i)] === true;
      // Back-compat: a knockout division saved before the progression flag existed
      // is treated as "continue through knockout stages" (that was always the intent).
      {
        const fmtI = (lf?.[String(i)] as PerLeagueFormat | undefined) ?? ((champ.round_format as any) as PerLeagueFormat | undefined);
        inheritedPO[String(i)] = lpo?.[String(i)] ?? (fmtI === "knockout" ? true : !!(champ as any).enable_playoffs);
      }
      inheritedBH[String(i)] = (lbh?.[String(i)] as any) ?? (((champ as any).bye_handling as any) || "no_match");
      // Forfeit rule: stored per league, otherwise derived from the league's format.
      // Legacy tournaments (which only had tournament-wide no-show points) map onto
      // "award points" for points-based leagues and a walkover for standard leagues.
      inheritedFR[String(i)] = (lfr?.[String(i)] as ForfeitRule) ?? defaultForfeitRule(inheritedS[String(i)]);
      inheritedFP[String(i)] = {
        opponent: Number(lfp?.[String(i)]?.opponent ?? (champ as any).no_show_opponent_points ?? 10) || 0,
        player: Number(lfp?.[String(i)]?.player ?? (champ as any).no_show_player_points ?? 0) || 0,
      };
    }
    setLeagueScoringModes(inheritedS);
    setLeaguePointsPerGame(inheritedP);
    setLeagueBestOf(inheritedB);
    setLeagueWinConditions(inheritedW);
    setLeaguePlayAll(inheritedPA);
    setLeaguePlayoffs(inheritedPO);
    setLeagueByeHandling(inheritedBH);
    setLeagueForfeitRules(inheritedFR);
    setLeagueForfeitPoints(inheritedFP);
    // Seed the tournament-level win condition from League 1 for compatibility.
    if (inheritedW["1"]) setWinCondition(inheritedW["1"]);



    const { data: entries } = await fromExt("club_champs_entries")
      .select("*")
      .eq("champ_id", champ.id)
      .order("group_number", { ascending: true })
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    // Also load registrations so invite-mode tournaments (where entries
    // haven't been locked yet) still show their field. Only entrants who have
    // actually accepted/registered become players — pending invitees must not
    // be pre-selected into the draw.
    const { data: allRegistrations } = await fromExt("club_champs_registrations")
      .select("club_member_id, partner_member_id, status, confirmed_at, paid_at, fee_paid_cents, division_choices")
      .eq("champ_id", champ.id);
    const champPaymentRequired =
      !!(champ as any).payment_required && Number((champ as any).entry_fee_cents || 0) > 0;
    const registrations = filterParticipatingEntrants(allRegistrations as any[], {
      paymentRequired: champPaymentRequired,
    });

    /**
     * What each entrant actually accepted: division_choices are stored 1-based
     * per division. A player who ticked several divisions must appear in every
     * one of them on the allocation page.
     */
    const choicesByMember = new Map<string, number[]>();
    registrations.forEach((r: any) => {
      const chosen = Array.isArray(r.division_choices)
        ? Array.from(new Set(r.division_choices.map((n: any) => Number(n) - 1).filter((n: number) => n >= 0)))
        : [];
      if (chosen.length > 0) choicesByMember.set(r.club_member_id, chosen as number[]);
    });

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
        const ids: string[] = Array.from(new Set<string>(entries.map((e: any) => String(e.club_member_id))));
        // Registered-but-not-yet-entered acceptances must still show up.
        choicesByMember.forEach((_v, id) => {
          if (!ids.includes(id)) ids.push(id);
        });
        setSelectedPlayerIds(new Set(ids));
        setPlayerOrder(ids);
        const assignments = new Map<string, number>();
        const extras = new Map<string, Set<number>>();
        entries.forEach((e: any) => {
          const gi = e.group_number - 1;
          if (!assignments.has(e.club_member_id)) assignments.set(e.club_member_id, gi);
          else {
            const set = extras.get(e.club_member_id) || new Set<number>();
            set.add(gi);
            extras.set(e.club_member_id, set);
          }
        });
        // A saved allocation is the organiser's decision and wins. Sign-up
        // choices are only used for entrants who have no entry row yet —
        // otherwise removing/moving someone would be undone on every load.
        choicesByMember.forEach((chosen, id) => {
          if (assignments.has(id)) return;
          assignments.set(id, chosen[0]);
          if (chosen.length > 1) extras.set(id, new Set(chosen.slice(1)));
        });

        setGroupAssignments(assignments);
        setExtraDivisions(extras);
      }
    } else if (registrations.length > 0) {
      if (champ.match_type === "doubles") {
        const paired = registrations.filter((r: any) => r.partner_member_id);
        const pairs: DoublePair[] = paired.map((r: any) => ({
          id: crypto.randomUUID(),
          player1Id: r.club_member_id,
          player2Id: r.partner_member_id,
        }));
        setDoublesPairs(pairs);
        // Accepted entrants still waiting for a partner — keep them visible
        // so the admin can pair them.
        const unpaired = registrations.filter((r: any) => !r.partner_member_id).map((r: any) => r.club_member_id);
        setSelectedPlayerIds(new Set(unpaired));
      } else {
        setSelectedPlayerIds(new Set(registrations.map((r: any) => r.club_member_id)));
        const assignments = new Map<string, number>();
        const extras = new Map<string, Set<number>>();
        choicesByMember.forEach((chosen, id) => {
          assignments.set(id, chosen[0]);
          if (chosen.length > 1) extras.set(id, new Set(chosen.slice(1)));
        });
        if (assignments.size > 0) setGroupAssignments(assignments);
        setExtraDivisions(extras);
      }
    }

    // The organiser's saved seeding order wins over the order the entry rows
    // happened to come back in — new entrants are appended at the end.
    const savedOrder = (champ as any).seed_order as string[] | null;
    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      setPlayerOrder((prev) => [
        ...savedOrder.filter((id) => prev.includes(id)),
        ...prev.filter((id) => !savedOrder.includes(id)),
      ]);
    }




    const savedCourtIds = (champ as any).court_ids as number[] | null;
    // Drop any court ids that no longer exist (e.g. external courts that were
    // deleted/replaced) — otherwise match insert fails the FK on court_id.
    const validCourtIds = new Set((courts || []).map((c) => c.id));
    if (Array.isArray(savedCourtIds) && savedCourtIds.length > 0) {
      setSelectedCourtIds(new Set(savedCourtIds.filter((id) => validCourtIds.has(id))));
    } else {
      const { data: champMatches } = await fromExt("club_champs_matches")
        .select("court_id")
        .eq("champ_id", champ.id);
      if (champMatches) {
        const courtIds = new Set(
          champMatches
            .map((m: any) => m.court_id)
            .filter((id: any) => id && validCourtIds.has(id)) as number[],
        );
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
  const [governanceChamp, setGovernanceChamp] = useState<any>(null);

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
      setExtraDivisions(new Map());
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

  /** True when a fixture slot holds no opponent (odd pool → top seed sits out). */
  const isByeEntity = (entityId?: string | null) =>
    !entityId || entityId === "BYE" || entityId === "bye";

  const getEntityLabel = (entityId: string) => {
    if (isByeEntity(entityId)) return "Bye";
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
    const pool = allSelectablePlayers as ClubMember[];
    if (gender === "mixed" || gender === "open") return pool.filter((m) => !usedPlayerIds.has(m.id));
    const matchValues = gender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return pool
      .filter((m) => m.gender && matchValues.includes(m.gender.toLowerCase()) && !usedPlayerIds.has(m.id));
  }, [allSelectablePlayers, gender, usedPlayerIds]);

  // Returns a list of friendly reasons why the current step can't advance.
  // Empty array means the user can click Next.
  // Every entry must belong to a field that is *edited on that step* — match
  // rules (scoring / round format / par / best-of) live on Structure, so they
  // are validated there, not on Basics.
  const missingForStep = (): string[] => {
    const m: string[] = [];
    switch (step) {
      case "category": {
        if (!gender) m.push("Gender category");
        if (!matchType) m.push("Match type (Singles or Doubles)");
        break;
      }
      case "courts": {
        if (!startDate) m.push("Tournament start date");
        if (!endDate) m.push("Tournament end date");
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
          m.push("End date must be on or after the start date");
        }
        // Self-scheduled tournaments have no fixture times, play days or courts —
        // only per-round play-by deadlines.
        if (schedulingMode === "self") {
          if (!serializeRoundDeadlines(roundDeadlines)) m.push("At least one round play-by deadline");
        } else {
          if (!startTime) m.push("Start time");
          if (!endTime) m.push("End time");
          if (selectedCourtIds.size === 0) m.push("At least one court");
          if (!(playDays.size > 0 || (customizeDailySchedule && daySchedules.length > 0))) {
            m.push("At least one play day");
          }
        }
        // Registration window lives on this step now (all dates in one place).
        if (registrationWindowApplies) {
          if (!registrationOpensAt) m.push("Registration opens (date & time)");
          if (!registrationClosesAt) m.push("Registration closes (date & time)");
          if (registrationOpensAt && registrationClosesAt && new Date(registrationClosesAt) <= new Date(registrationOpensAt)) {
            m.push("Registration close must be after registration open");
          }
        }
        break;
      }
      case "structure": {
        if (!(numGroups >= 1)) m.push("At least one league");
        if (!scoringMode) m.push("Scoring format");
        if (scoringMode === "standard") {
          if (!pointsPerGame) m.push("Game length (Par 11 or 15)");
          if (!bestOf) m.push("Best of (3 or 5)");
        }
        if (!roundFormat) m.push("Round format");
        break;
      }

      case "registration": {
        if (isDoubles && !partnerMode) m.push("Partner selection (Admin pairs / Players choose)");
        if (Number(entryFeeRand) > 0 && paymentMethods.size === 0) {
          m.push("At least one accepted payment method");
        }
        break;
      }
      case "invites": {
        if (invitesApply && inviteMethods.size === 0) m.push("At least one invite delivery method");
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
        if (schedulingMode !== "self") {
          if (!(playDays.size > 0 || (customizeDailySchedule && daySchedules.length > 0))) {
            m.push("At least one play day");
          }
          if (selectedCourtIds.size === 0) m.push("At least one court");
          // Duration only matters when the organiser lays out slots; players
          // arranging their own games agree their own times.
          if (!matchDuration) m.push("Match duration");
        }
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

  // Validation is only *shown* once the admin tries to move on (except Basics,
  // whose Next stays disabled because its two fields are right there).
  const [attemptedSteps, setAttemptedSteps] = useState<Record<string, boolean>>({});
  const stepIssuesRef = useRef<HTMLDivElement | null>(null);
  const showStepIssues = !!attemptedSteps[step] && missingForStep().length > 0;

  const handleNext = () => {
    const missing = missingForStep();
    if (missing.length > 0) {
      setAttemptedSteps((p) => ({ ...p, [step]: true }));
      requestAnimationFrame(() => {
        stepIssuesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      toast.error("A few things still needed", { description: missing.join(" · ") });

      return;
    }
    goToStep(activeSteps[stepIdx + 1]);
  };




  // ── LIST VIEW ──
  if (!showWizard) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h2 className="text-lg font-semibold">Club Tournaments</h2>
          <div className="flex flex-col gap-1 sm:items-end">
            <Button className="w-full sm:w-auto" onClick={() => { resetWizard(); setShowWizard(true); }}>
              <Trophy className="w-4 h-4 mr-2" /> Plan New Tournament
            </Button>
            <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
              Tip: to save time, use the <strong>Template</strong> button on any tournament below to duplicate its full setup with new dates.
            </p>
          </div>
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
              <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                <div className="min-w-0">

                  <p className="font-medium flex items-center gap-2">
                    {c.name}
                    {(!c.start_date || !c.end_date) && (
                      <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {GENDER_LABELS[c.gender as GenderCategory] || c.gender} · {c.match_type === "doubles" ? "Doubles" : "Singles"} · {c.num_groups} groups · {c.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.start_date && c.end_date ? `${c.start_date} to ${c.end_date}` : "Dates not set yet"}
                  </p>
                  <TournamentEntryCounts champId={c.id} className="mt-0.5" />

                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end sm:gap-1">
                  <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => navigate(`/club-champs/${c.id}`)}>
                    <Eye className="w-4 h-4 mr-1" /> View
                  </Button>

                  {!isCompleted && (
                    <>
                      <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => setRegistrationsChamp(c)}>
                        <UsersIcon className="w-4 h-4 mr-1" /> Registrations
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => setBulkImportChamp(c)} title="Bulk import entrants & email magic-links">
                        <Plus className="w-4 h-4 mr-1" /> <span className="truncate">Import entrants</span>
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => loadChampForEdit(c)}>
                        <Pencil className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => setGovernanceChamp(c)} title="Ownership, sanctioning, eligibility, fee split, venues & audit history">
                        <ShieldCheck className="w-4 h-4 mr-1" /> Governance
                      </Button>


                      <Button
                        variant="outline" size="sm"
                        className="w-full justify-center sm:w-auto"
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
                      className="w-full justify-center sm:w-auto"
                      disabled={setChampStatus.isPending}
                      onClick={() => setChampStatus.mutate({ id: c.id, status: "active" })}
                    >
                      Re-open
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" onClick={() => setDuplicateSource(c)} title="Use as template — duplicate this tournament's full setup with new dates">
                    <Copy className="w-4 h-4 mr-1" /> {isCompleted ? "Copy" : "Template"}
                  </Button>
                  {(() => {
                    // Club admin can only delete tournaments that haven't started yet.
                    // Only super admin can delete active or completed tournaments.
                    const today = new Date().toISOString().slice(0, 10);
                    const notStartedYet = !c.start_date || c.start_date > today;
                    const canDelete = isSuperAdmin || notStartedYet;
                    if (!canDelete) return null;
                    return (
                      <Button variant="ghost" size="sm" className="w-full justify-center gap-1 text-destructive sm:w-auto sm:px-2" onClick={() => setDeleteConfirm({ id: c.id, withBookings: true })} title="Delete tournament">
                        <Trash2 className="w-4 h-4 text-destructive" />
                        <span className="sm:hidden">Delete</span>
                      </Button>

                    );
                  })()}
                </div>
              </div>
              <TournamentNextActionBar
                champId={c.id}
                canManage
                status={c.status}
                selfScheduled={String(c.scheduling_mode || "") === "self"}
                championScope={(c as any).champion_scope || undefined}
                groupLabel={(gn) => (c as any)?.group_labels?.[String(gn)] || `Division ${gn}`}
                mode="card"
                onSetup={() => loadChampForEdit(c)}
              />
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

        <TournamentGovernanceDialog champ={governanceChamp} scope={scope} onOpenChange={(v) => !v && setGovernanceChamp(null)} />
        <Dialog open={!!duplicateSource} onOpenChange={(v) => !v && setDuplicateSource(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Duplicate tournament</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">
                Copy all settings from <strong>{duplicateSource?.name}</strong> into a new draft. You'll set new dates in the wizard.
              </p>
              <p className="text-muted-foreground">Include the same players?</p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDuplicateSource(null)}>Cancel</Button>
              <Button
                variant="outline"
                onClick={() => { const src = duplicateSource; setDuplicateSource(null); if (src) duplicateChamp(src, false); }}
              >
                Without players
              </Button>
              <Button
                onClick={() => { const src = duplicateSource; setDuplicateSource(null); if (src) duplicateChamp(src, true); }}
              >
                With same players
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

        {bulkImportChamp && (
          <TournamentBulkImportDialog
            open={!!bulkImportChamp}
            onOpenChange={(v) => !v && setBulkImportChamp(null)}
            clubId={clubId}
            champ={bulkImportChamp}
          />
        )}
      </div>
    );
  }

  // ── WIZARD VIEW ──
  return (
    <div className="space-y-4">
      {/* Step tabs — every step is directly clickable; the wizard autosaves on jump. */}
      <div className="flex items-center gap-1 text-sm overflow-x-auto border-b border-border pb-px">
        {activeSteps.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => goToStep(s)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-t-md border border-b-0 transition-colors flex items-center gap-1.5 ${
              s === step
                ? "bg-primary text-primary-foreground border-primary font-medium"
                : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {i < stepIdx && s !== step && <Check className="w-3 h-3 text-primary" />}
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Step-level blocker — only after the admin tries to continue, and only
          for steps without a dedicated inline marker (Structure has its own). */}
      {showStepIssues && step !== "structure" && (
        <div
          ref={stepIssuesRef}
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          Still needed on this step: {missingForStep().join(" · ")}
        </div>
      )}



      {/* ── STEP: CATEGORY ── */}
      {step === "category" && (
        <Card>
          <CardHeader><CardTitle>Select Category</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <WizardSection
              title={"Name, category & eligibility"}
              summary={`${champName || "Unnamed"} · ${GENDER_LABELS[gender]} ${matchType === "doubles" ? "Doubles" : "Singles"} · ${eligibilityScope}`}
              complete={!!eventType && !!eligibilityScope}
              defaultOpen={true}
            >
            <div>
              <Label>Championship Name (optional)</Label>
              <Input
                placeholder={`${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Club Champs ${new Date().getFullYear()}`}
                value={champName}
                onChange={(e) => setChampName(e.target.value)}
              />
            </div>

            {/* Category, eligibility, capacity and seeding — same block at every level. */}
            <div className="rounded-lg border-2 border-border p-3 bg-slate-100 dark:bg-slate-800/40 shadow-sm space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold">Tournament category <span className="text-destructive">*</span></Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventTypeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">What kind of competition this is.</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Who may enter <span className="text-destructive">*</span></Label>
                  <Select value={eligibilityScope} onValueChange={setEligibilityScope}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eligibilityOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Sets who is <strong>eligible</strong>. Who actually receives an invitation is configured in{" "}
                    <strong>Entry &amp; fees / Players</strong>.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {eligibilityOptions.find((s) => s.value === eligibilityScope)?.hint}
                  </p>
                  {eligibility && (
                    <p className="text-[11px] font-medium text-primary mt-1">Eligible: {eligibility.summary}</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Eligibility is not an invitation list — it only decides who <em>may</em> take part. Age limits and licence
                requirements live in <strong>Governance → Eligibility</strong>; ranking status lives on the scoring settings
                and the sanctioning authority in <strong>Governance</strong>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-medium">Max entrants (optional)</Label>
                  <Input type="number" min={0} className="mt-1" value={maxEntrants}
                    onChange={(e) => setMaxEntrants(e.target.value)} placeholder="No limit" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Max per league (optional)</Label>
                  <Input type="number" min={0} className="mt-1" value={maxPerLeague}
                    onChange={(e) => setMaxPerLeague(e.target.value)} placeholder="No limit" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Seeding from</Label>
                  <Select value={seedingSource} onValueChange={setSeedingSource}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-950 border-2 border-input shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ladder">Club ladder</SelectItem>
                      <SelectItem value="ranking">National ranking</SelectItem>
                      <SelectItem value="manual">Manual order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {multiClub && (
                <p className="text-[11px] text-muted-foreground">
                  Entrants and courts are pooled from {venueClubIds.length} clubs.
                </p>
              )}
            </div>
            </WizardSection>


            <WizardSection
              title={"Visitors"}
              summary={includeVisitors ? "visitors included" : "members only"}
              complete={true}
              defaultOpen={true}
            >




            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Include Visitors</Label>
                <p className="text-xs text-muted-foreground">
                  Add registered visitors to the tournament player pool
                </p>
              </div>
              <Switch checked={includeVisitors} onCheckedChange={(v) => { setIncludeVisitors(v); if (!v) setSelectedVisitorClubs(new Set()); }} />
            </div>



            {visitorClubs.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-sm font-medium">Filter by Home Club</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Leave all unchecked to include entrants from all clubs ({(homeClubCounts && Object.values(homeClubCounts).reduce((a, b) => a + b, 0)) || 0} out-of-club entrant{(Object.values(homeClubCounts).reduce((a, b) => a + b, 0)) !== 1 ? "s" : ""} across {visitorClubs.length} club{visitorClubs.length !== 1 ? "s" : ""})
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
                        {homeClubCounts[club] || 0}
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
            </WizardSection>
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
            {/* Who arranges the games: the club (fixed schedule on booked
                courts) or the players themselves (play-by deadline). */}
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm font-medium">How are games arranged?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${schedulingMode === "club" ? "border-primary bg-primary/5" : ""}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={schedulingMode === "club"}
                    onChange={() => setSchedulingMode("club")}
                  />
                  <span>
                    <span className="text-sm font-medium block">Club schedules &amp; books courts</span>
                    <span className="text-[11px] text-muted-foreground">Fixed fixture times, courts reserved automatically.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${schedulingMode === "self" ? "border-primary bg-primary/5" : ""}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={schedulingMode === "self"}
                    onChange={() => setSchedulingMode("self")}
                  />
                  <span>
                    <span className="text-sm font-medium block">Players arrange their own games</span>
                    <span className="text-[11px] text-muted-foreground">No court bookings — players just have to play by a deadline.</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Where does the draw stop: one champion per league, or one per pool? */}
            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-sm font-medium">Who is the final winner?</Label>
              <p className="text-[11px] text-muted-foreground">
                Only matters where a league is split into more than one pool.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${championScope === "division" ? "border-primary bg-primary/5" : ""}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={championScope === "division"}
                    onChange={() => setChampionScope("division")}
                  />
                  <span>
                    <span className="text-sm font-medium block">One champion per league</span>
                    <span className="text-[11px] text-muted-foreground">Pool winners meet in league semi-finals / final — one club champion per league.</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${championScope === "pool" ? "border-primary bg-primary/5" : ""}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={championScope === "pool"}
                    onChange={() => setChampionScope("pool")}
                  />
                  <span>
                    <span className="text-sm font-medium block">One winner per pool</span>
                    <span className="text-[11px] text-muted-foreground">Each pool plays out to its own winner — the draw stops there.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              {simplifiedKnockoutSchedule && (
                <div className="pt-1">
                  <SelfScheduledRounds
                    deadlines={roundDeadlines}
                    onChange={setRoundDeadlines}
                    progress={knockoutProgress}
                    totalRounds={knockoutRoundCount(
                      Math.max(0, ...(groups as any[][]).map((g) => (g?.length ?? 0))),
                    )}
                    minDate={startDate || undefined}
                  />
                </div>
              )}
              {schedulingMode === "self" && !simplifiedKnockoutSchedule && (
                <div className="pt-1 space-y-2">
                  <Label className="text-sm">Play-by deadlines per round</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Players arrange their own court and time — you only set the date each round must be
                    finished by. These lines appear in the invitation and on every fixture.
                  </p>
                  <div className="space-y-2">
                    {roundDeadlines.map((d, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <Input
                          value={d.label}
                          placeholder={defaultRoundLabel(i)}
                          onChange={(e) =>
                            setRoundDeadlines((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          className="w-40"
                        />
                        <span className="text-xs text-muted-foreground">must be played by</span>
                        <Input
                          type="date"
                          value={d.date}
                          min={startDate || undefined}
                          onChange={(e) =>
                            setRoundDeadlines((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                            )
                          }
                          className="w-44"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setRoundDeadlines((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRoundDeadlines((prev) => [
                        ...prev,
                        { label: defaultRoundLabel(prev.length), date: "" },
                      ])
                    }
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add round deadline
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Add one per round (Round 1, Round 2, Semi-finals, Final…). Nothing is scheduled and no
                    courts are booked for this tournament.
                  </p>
                </div>
              )}
            </div>

            {/* Full club-scheduling controls. Also shown when a self-scheduled
                knockout's current stage (semi/final) has been flipped to
                club-scheduled courts and times. */}
            {schedulingMode === "club" || currentRoundClubScheduled ? (
            <>
            <WizardSection
              title={"Dates & times"}
              summary={`${startDate || "start?"} → ${endDate || "end?"} · ${startTime}–${endTime} · ${playDays.size} play day${playDays.size === 1 ? "" : "s"}`}
              complete={!!startDate && !!endDate && playDays.size > 0}
              defaultOpen={true}
            >
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
            </WizardSection>

            <WizardSection
              title={"Courts & daily schedule"}
              summary={`${selectedCourtIds.size} court${selectedCourtIds.size === 1 ? "" : "s"}${customizeDailySchedule ? " · per-day times" : ""}`}
              complete={selectedCourtIds.size > 0}
              defaultOpen={true}
            >
            <div>
              <Label className="text-sm">Courts used by the tournament</Label>
              {(() => {
                const homeCourts = courts.filter((c) => !c.is_external);
                const externalCourts = courts.filter((c) => c.is_external);
                const externalByVenue = externalCourts.reduce<Record<string, typeof externalCourts>>((acc, c) => {
                  const key = c.venue_name || "External venue";
                  (acc[key] ||= []).push(c);
                  return acc;
                }, {});
                const renderCheckbox = (c: typeof courts[number]) => (
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
                );
                return (
                  <div className="space-y-2 mt-1">
                    {homeCourts.length > 0 && (
                      <div className="flex flex-wrap gap-2">{homeCourts.map(renderCheckbox)}</div>
                    )}
                    {Object.entries(externalByVenue).map(([venue, list]) => (
                      <div key={venue} className="rounded-md border border-dashed p-2">
                        <div className="text-[11px] font-semibold text-muted-foreground mb-1">📍 {venue}</div>
                        <div className="flex flex-wrap gap-2">{list.map(renderCheckbox)}</div>
                      </div>
                    ))}
                    {courts.length === 0 && (
                      <span className="text-xs text-muted-foreground">No courts configured for this club yet.</span>
                    )}
                    {externalCourts.length === 0 && homeCourts.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Need more courts? Add external venues in <strong>Admin → Courts → External / Tournament Venues</strong>.
                      </p>
                    )}
                  </div>
                );
              })()}
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
            </WizardSection>
            </>
            ) : (
              /* Self-scheduled: no fixture times, no play days, no courts — just the
                 window the tournament runs in. Everything else is the players' call. */
              <div className="rounded-lg border p-3 space-y-3">
                <Label className="text-sm font-medium">Tournament window</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Tournament starts</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Tournament ends</Label>
                    <Input
                      type="date"
                      value={endDate || lastDeadline(roundDeadlines) || ""}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {simplifiedKnockoutSchedule
                    ? "Only the current round's play-by date is set — later rounds unlock as the draw progresses. No daily times, play days or courts are used."
                    : `${roundDeadlineSummary(roundDeadlines)} — no daily times, play days or courts are set for a self-scheduled tournament.`}
                </p>
              </div>
            )}

            {/* Capacity validation — lives here because it needs BOTH the structure
                (leagues, formats, pools, match length) and the schedule (dates,
                windows, courts). Advisory only: it never blocks setup. */}
            {schedulingMode === "club" && (
            <WizardSection

              title={"Capacity check"}
              summary={"Does the plan fit in the court time you have?"}
              complete={true}
              autoCollapse={false}
              defaultOpen={true}
            >
              <CapacityCheck
                customizeDailySchedule={customizeDailySchedule}
                daySchedules={daySchedules}
                startDate={startDate}
                endDate={endDate}
                playDays={Array.from(playDays)}
                startTime={startTime}
                endTime={endTime}
                selectedCourtIds={Array.from(selectedCourtIds)}
                leagues={capacityLeagues}
                isDoubles={isDoubles}
                crossLeague={roundFormat === "cross_league"}
                parallelLeagues={parallelLeagues}
                onParallelLeaguesChange={setParallelLeagues}
                playoffBreakMinutes={playoffBreakMinutes}
              />
            </WizardSection>
            )}



            <WizardSection
              title={"Registration window"}
              summary={registrationWindowApplies
                ? `${registrationOpensAt || "opens?"} → ${registrationClosesAt || "closes?"}`
                : "Not needed for this entry flow"}
              complete={!registrationWindowApplies || (!!registrationOpensAt && !!registrationClosesAt)}
              defaultOpen={registrationWindowApplies}
            >
            {registrationWindowApplies ? (
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
            ) : (
              <p className="text-xs text-muted-foreground">
                The organiser picks the field for this tournament, so there is no public registration window to set.
              </p>
            )}
            </WizardSection>
          </CardContent>
        </Card>
      )}


      {/* ── STEP: STRUCTURE & CAPACITY ── */}
      {step === "structure" && (
        <Card>
          <CardHeader>
            <CardTitle>Structure &amp; Capacity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Build the leagues that make up this tournament, then check they fit the dates, times and courts you just picked.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <WizardSection
              title={"Tournament structure"}
              summary={`${numGroups || 0} league${numGroups === 1 ? "" : "s"} configured`}
              complete={(numGroups || 0) > 0}
              defaultOpen={true}
            >


            {/* Match rules are now decided per league in the builder below —
                format (Standard / Bells), category, singles/doubles, par 11 / 15,
                best-of and win condition are all independently configurable. */}
            <div
              ref={stepIssuesRef}
              className={`rounded-lg border p-3 shadow-sm ${
                showStepIssues ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40"
              }`}
            >
              <Label className="text-sm font-semibold">
                Match rules {showStepIssues && <span className="text-destructive">*</span>}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Format, category, singles or doubles, par 11 / par 15, best-of and win condition are set on each
                league card in the builder below.
              </p>
              {showStepIssues && (
                <p className="text-[11px] text-destructive mt-1">
                  Still needed: {missingForStep().join(" · ")} — set these on the league card(s) below.
                </p>
              )}
            </div>



            {/* ─── Tournament Structure Builder ─────────────────────────── */}
            {/* Visual builder — admin drags/clicks formats from the palette to
                add leagues, then tweaks name / pools / expected players inline.
                Replaces the old Round Format dropdown + Per-league overrides
                checkbox. Cross-league mode is a toggle above the builder since
                it's inherently tournament-wide. */}
            <div className="rounded-xl border-2 border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/40">
                <div>
                  <div className="text-sm font-semibold">Tournament Structure <span className="text-destructive">*</span></div>
                  <div className="text-[11px] text-muted-foreground">Add a league by clicking or dragging a format from the palette. Each league has its own format, category (Men’s / Ladies’ / Mixed / Open), pools and planned player count — so one tournament can run a Ladies’ league next to a Men’s and a Mixed league. Singles vs doubles is applied to every league in the event.</div>
                </div>
                {/* Playoffs are owned by each league card below. These are
                    bulk shortcuts that write the per-league settings — not a
                    second source of truth. */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Playoffs: {(() => {
                      const on = Array.from({ length: numGroups || 0 }, (_, i) => playoffsForLeague(i + 1)).filter(Boolean).length;
                      if (!numGroups) return "—";
                      return on === 0 ? "none" : on === numGroups ? "all leagues" : `${on} of ${numGroups}`;
                    })()}
                  </span>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                    disabled={!numGroups}
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      for (let i = 1; i <= (numGroups || 0); i++) next[String(i)] = true;
                      setLeaguePlayoffs(next);
                    }}
                  >
                    All
                  </Button>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                    disabled={!numGroups}
                    onClick={() => setLeaguePlayoffs({})}
                  >
                    None
                  </Button>
                </div>
              </div>

              {roundFormat === "cross_league" && (
                <div className="px-4 py-2 text-[11px] text-muted-foreground bg-amber-500/10 border-b border-amber-500/30">
                  <strong className="text-foreground">Cross-league is active.</strong> Leagues set to “Cross league” play against the other leagues instead of within themselves — no intra-league matches for those leagues.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px]">
                  {/* Canvas */}
                  <div
                    className="p-4 space-y-3 min-h-[220px] bg-muted/10"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fmt = e.dataTransfer.getData("application/x-champ-format") as PerLeagueFormat;
                      if (fmt && FORMAT_META[fmt]) addLeagueOfFormat(fmt);
                    }}
                  >
                    {numGroups > 0 ? (
                      Array.from({ length: numGroups }, (_, i) => i + 1).map((gn) => {
                        const key = String(gn);
                        // The card must reflect the division's REAL draw format.
                        // Knockout / cross league were previously dropped by this
                        // fallback, which made knockout divisions render as round
                        // robin (wrong pool wording and wrong bottom control).
                        const rf = roundFormat as string;
                        const fmt: PerLeagueFormat = (leagueFormats[key]
                          ?? (rf === "swiss" || rf === "double_round_robin"
                              || rf === "single_round_robin" || rf === "knockout"
                              || rf === "cross_league"
                              ? (roundFormat as PerLeagueFormat)
                              : "single_round_robin"));
                        const meta = FORMAT_META[fmt];
                        const isSwiss = fmt === "swiss";
                        const collapsed = collapsedLeagues[key] ?? true;
                        return (
                          <div key={gn} className="relative rounded-lg border-2 border-amber-500/40 bg-card p-3 shadow-sm">
                            <div className="absolute -left-[3px] top-3 bottom-3 w-1 bg-amber-500 rounded-full" />
                            <div className={cn("flex items-start justify-between gap-2", !collapsed && "mb-2")}>
                              <div className="flex-1 min-w-0">
                                <div
                                  className={cn("flex items-center gap-2 flex-wrap", !collapsed && "mb-1", collapsed && "cursor-pointer")}
                                  onClick={collapsed ? () => setCollapsedLeagues((m) => ({ ...m, [key]: false })) : undefined}
                                >
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">League {gn}</span>
                                  {collapsed && groupLabels[key] && (
                                    <span className="text-sm font-semibold truncate">{groupLabels[key]}</span>
                                  )}
                                  <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{meta.short}</span>
                                  <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {GENDER_LABELS[genderForLeague(gn)]} · {matchTypeForLeague(gn) === "doubles" ? "Doubles" : "Singles"} ·{" "}
                                    {scoringForLeague(gn) === "time_capped_points"
                                      ? `Bells ${groupDurations[key] || matchDuration || 20}′`
                                      : `Par ${pointsForLeague(gn)} · ${playAllForLeague(gn) ? `All ${bestOfForLeague(gn)}` : `Bo${bestOfForLeague(gn)}`} · ${winConditionForLeague(gn) === "sudden_death" ? "Sudden death" : "Win by 2"} · ${Number(groupDurations[key]) || matchDuration || 20}′`}
                                  </span>
                                  {collapsed && (
                                    <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                      Bye: {byeForLeague(gn).replace(/_/g, " ")}
                                    </span>
                                  )}
                                  {collapsed && (
                                    <span className="inline-flex items-center rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                                      No show: {describeForfeitRule(forfeitRuleForLeague(gn), forfeitPointsForLeague(gn))}
                                    </span>
                                  )}
                                  {collapsed && playoffsForLeague(gn) && (
                                    <span className="inline-flex items-center rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-400">
                                      {fmt === "knockout" ? "Knockout rounds" : "Playoffs"}
                                    </span>
                                  )}
                                  {collapsed && (
                                    <span className="inline-flex items-center rounded border border-teal-500/40 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                                      {formatUsesPools(fmt) ? poolLabelFor(poolsForDivision(gn), fmt) : "Single draw"}
                                      {expectedPlayers[key] ? ` · ${expectedPlayers[key]} ${isDoubles ? "pairs" : "players"}` : ""}
                                    </span>
                                  )}
                                </div>
                                {!collapsed && (
                                <div className="flex items-end gap-2">
                                  <Input
                                    value={groupLabels[key] || ""}
                                    placeholder={`League ${gn}`}
                                    onChange={(e) => setGroupLabels((m) => ({ ...m, [key]: e.target.value }))}
                                    className="h-8 text-sm font-semibold flex-1 min-w-0"
                                  />
                                  {/* Read-only summary — the pool count is set
                                      by the single Pools selector below. */}
                                  {formatUsesPools(fmt) && (
                                    <div className="shrink-0 pb-1.5" title={`Set the ${poolNoun(fmt, false)} count with the ${poolSelectorLabel(fmt)} selector below`}>
                                      <Label className="text-[9px] uppercase tracking-wider text-teal-600 dark:text-teal-400">{poolSelectorLabel(fmt)}</Label>
                                      <div className="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-1 whitespace-nowrap">
                                        {poolLabelFor(poolsForDivision(gn), fmt)}
                                      </div>
                                    </div>
                                  )}
                                  {fmt === "swiss" && (
                                    <div className="w-16 shrink-0">
                                      <Label className="text-[9px] uppercase tracking-wider text-teal-600 dark:text-teal-400">Rounds</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={20}
                                        placeholder="auto"
                                        title="How many Swiss rounds each pool plays"
                                        value={swissRounds[key] ? String(swissRounds[key]) : ""}
                                        onChange={(e) => {
                                          const v = Number(e.target.value);
                                          setSwissRounds((m) => {
                                            const next = { ...m };
                                            if (v > 0) next[key] = Math.min(20, Math.round(v));
                                            else delete next[key];
                                            return next;
                                          });
                                        }}
                                        className="h-8 text-xs mt-0.5 px-1.5"
                                      />
                                    </div>
                                  )}
                                  <div className="w-20 shrink-0">
                                    <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                      {isDoubles ? "Pairs" : "Players"}
                                    </Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      placeholder="—"
                                      value={expectedPlayers[key] ?? ""}
                                      title={isDoubles ? "Expected pairs" : "Expected players"}
                                      onChange={(e) => {
                                        const n = Number(e.target.value);
                                        setExpectedPlayers((m) => {
                                          const next = { ...m };
                                          if (!Number.isFinite(n) || n <= 0) delete next[key];
                                          else next[key] = Math.round(n);
                                          return next;
                                        });
                                        // Auto-derive Swiss rounds (treat pool as round-robin: rounds = perPool - 1)
                                        if (isSwiss && Number.isFinite(n) && n >= 2) {
                                          const pools = poolsForDivision(gn);
                                          const perPool = Math.max(2, Math.ceil(n / pools));
                                          setSwissRounds((m) => ({ ...m, [key]: Math.max(1, perPool - 1) }));
                                        }
                                      }}
                                      className="h-8 text-xs mt-0.5 px-1.5"
                                    />
                                  </div>
                                </div>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => setCollapsedLeagues((m) => ({ ...m, [key]: !(m[key] ?? true) }))}
                                title={collapsed ? "Expand league" : "Collapse league"}
                              >
                                <ChevronDown className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => duplicateLeagueAt(gn)}
                                title="Duplicate this division (same rules, new class)"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button

                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeLeagueAt(gn)}
                                title="Remove league"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {/* Visual, button-driven league setup — draw format,
                                category, entity type and scoring all per league. */}
                            {!collapsed && (
                            <div className="space-y-2">
                              {/* Who may play in THIS division. Real club league ids —
                                  the population also seeds the draw. */}
                              {(() => {
                                const src = sourceForLeague(gn);
                                const setSrc = (next: DivisionSource) => setSourceForLeague(gn, next);
                                const toggle = (id: string) => {
                                  const has = src.leagueIds.includes(id);
                                  const ids = has ? src.leagueIds.filter((x) => x !== id) : [...src.leagueIds, id];
                                  setSrc({ mode: ids.length === 0 ? "all" : src.mode === "all" ? "selected" : src.mode, leagueIds: ids });
                                };
                                return (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Label className="text-[9px] uppercase tracking-wider text-muted-foreground w-full sm:w-auto">
                                      Primarily players from <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
                                    </Label>
                                    <p className="w-full text-[10px] text-muted-foreground leading-snug order-last">
                                      You don’t have to select any leagues. This only decides which league these players
                                      are allocated to and seeded in — it does not limit who is invited or who may enter.
                                    </p>

                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]">
                                          {describeDivisionSource(src, leagueNameById)}
                                          <ChevronDown className="ml-1 h-3 w-3" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" className="w-80 p-2 space-y-1.5">
                                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-violet-500"
                                            checked={src.mode === "all" || src.leagueIds.length === 0}
                                            onChange={() => setSrc({ ...DEFAULT_DIVISION_SOURCE })}
                                          />
                                          All leagues — select every league group
                                        </label>
                                        <p className="text-[10px] text-muted-foreground leading-snug">
                                          Selecting leagues is optional — leave this on “All leagues” if you don’t want to
                                          restrict seeding. “All leagues” never merges everyone into one draw. Use the
                                          button below to give each league its own competition, with its own winner.
                                        </p>

                                        {(src.mode === "all" || src.leagueIds.length === 0) && (
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="w-full h-7 text-[11px]"
                                            onClick={() => expandAllLeagues(gn)}
                                          >
                                            Create one competition per league (recommended)
                                          </Button>
                                        )}

                                        <Separator />
                                        {availableSeasons.length > 0 && (
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                                Season
                                              </Label>
                                              <select
                                                className="h-6 rounded border border-border/60 bg-background px-1 text-[11px]"
                                                value={sourceSeason ?? ""}
                                                onChange={(e) => {
                                                  setSeasonTouched(true);
                                                  setSourceSeason(e.target.value ? Number(e.target.value) : null);
                                                }}
                                              >
                                                {availableSeasons.map((s) => (
                                                  <option key={s} value={s}>
                                                    {s}
                                                  </option>
                                                ))}
                                                <option value="">All seasons</option>
                                              </select>
                                            </div>
                                            {seasonIsFallback && (
                                              <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug">
                                                No {tournamentYear} league structure yet — showing {sourceSeason}. Create
                                                the {tournamentYear} leagues on the Leagues page to draw from them; nothing
                                                is copied or reassigned automatically.
                                              </p>
                                            )}
                                          </div>
                                        )}

                                        {/* With "All leagues" ticked the hierarchy stays
                                            visible and every team reads as selected; the
                                            moment a child is unticked the source becomes an
                                            explicit id list. */}
                                        <LeagueSourceTree
                                          groups={leagueTree}
                                          selected={
                                            src.mode === "all" || src.leagueIds.length === 0
                                              ? allTreeLeagueIds(leagueTree)
                                              : src.leagueIds
                                          }
                                          onChange={(ids) =>
                                            setSrc({
                                              mode:
                                                ids.length === 0
                                                  ? "all"
                                                  : src.mode === "all"
                                                    ? "selected"
                                                    : src.mode,
                                              leagueIds: ids,
                                            })
                                          }
                                        />
                                        {src.leagueIds.length > 1 && (
                                          <>
                                            <Separator />
                                            <label className="flex items-start gap-2 text-xs font-medium cursor-pointer">
                                              <input
                                                type="checkbox"
                                                className="h-3.5 w-3.5 mt-0.5 accent-violet-500"
                                                checked={src.mode === "combined"}
                                                onChange={(e) =>
                                                  setSrc({ ...src, mode: e.target.checked ? "combined" : "selected" })
                                                }
                                              />
                                              <span>
                                                Combined competition
                                                <span className="block text-[10px] font-normal text-muted-foreground">
                                                  Only tick this to deliberately mix the selected teams into one draw
                                                  with one winner.
                                                </span>
                                              </span>
                                            </label>
                                          </>
                                        )}
                                      </PopoverContent>

                                    </Popover>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-[11px]"
                                      onClick={() => applyDivisionPrefill(gn)}
                                    >
                                      Load players
                                    </Button>
                                    {src.mode === "selected" && src.leagueIds.length > 1 && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-500">
                                        More than one league — tick “Combined competition” or split into separate divisions.
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              <SegRow
                                label="Draw format"
                                value={fmt === "double_round_robin" ? "single_round_robin" : fmt}
                                color="violet"
                                 options={[
                                   { v: "single_round_robin", l: "Round robin" },
                                   { v: "knockout", l: "Knockout" },
                                   { v: "swiss", l: "Swiss pairing" },
                                   { v: "cross_league", l: "Cross league" },
                                 ]}
                                 onChange={(v) => {
                                   const nv = v as PerLeagueFormat;
                                   setLeagueFormats((m) => ({ ...m, [key]: nv }));
                                   setUsePerLeagueFormats(true);
                                   if (nv === "swiss") {
                                     setSwissPools((m) => ({ ...m, [key]: m[key] || 1 }));
                                     setSwissRounds((m) => ({ ...m, [key]: m[key] || 5 }));
                                   }
                                    if (nv === "knockout") {
                                      const entrants = (groups as any[])[gn - 1]?.length || Number(expectedPlayers[key]) || 0;
                                      setSwissPools((m) => ({ ...m, [key]: m[key] || suggestSectionCount(entrants) }));
                                      // Newly configured knockout division: progression ON by default.
                                      // (A division already on knockout keeps the organiser's choice.)
                                      if (fmt !== "knockout") setLeaguePlayoffs((m) => ({ ...m, [key]: true }));
                                    }
                                    if (nv === "cross_league") setRoundFormat("cross_league");
                                    else {
                                      // Drop cross-league mode once no league uses it.
                                      const next = { ...leagueFormats, [key]: nv };
                                      const stillCross = Array.from({ length: numGroups || 0 }, (_, i) => next[String(i + 1)]).some((f) => f === "cross_league");
                                      if (!stillCross && (!roundFormat || roundFormat === "cross_league")) {
                                        setRoundFormat(nv === "knockout" ? "single_round_robin" : (nv as any));
                                      }
                                    }
                                  }}
                                />
                                {/* THE pool selector for this division — the
                                    only editable pool control, shared by every
                                    format that uses pools. */}
                                {formatUsesPools(fmt) && (() => {
                                  const entrants = (groups as any[])[gn - 1]?.length || Number(expectedPlayers[key]) || 0;
                                  const pools = poolsForDivision(gn);
                                  const suggested = suggestSectionCount(entrants);
                                  const perPool = pools > 0 ? Math.ceil(entrants / pools) : 0;
                                  return (
                                    <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
                                      <SegRow
                                        label={fmt === "knockout" ? "Knockout structure" : "Pools"}
                                        value={String(pools)}
                                        color="violet"
                                        options={poolOptions(pools).map((n) => ({ v: String(n), l: poolLabelFor(n, fmt) }))}
                                        onChange={(v) => setPoolsForDivision(gn, Number(v) || 1)}
                                      />
                                      <p className="text-[11px] text-muted-foreground">
                                        {entrants > 0
                                          ? `${entrants} entrant${entrants === 1 ? "" : "s"} → about ${perPool} per ${pools > 1 ? poolNoun(fmt, false) : "draw"}. `
                                          : ""}
                                        {fmt === "knockout"
                                          ? "Seeds are spread evenly across sections from the ladder; section winners meet in this division's final."
                                          : fmt === "cross_league"
                                            ? "Each pool plays every other pool."
                                            : pools > 1
                                              ? "Players are split into pools; each pool plays its own draw."
                                              : "One draw — everyone in this division plays in the same group."}
                                        {fmt === "knockout" && entrants > 0 && pools !== suggested ? ` Suggested: ${suggested}.` : ""}
                                      </p>
                                      {fmt === "knockout" && (
                                        <p className="text-[11px] text-muted-foreground">
                                          Only the first round is scheduled up front — later rounds are created as each round finishes.
                                        </p>
                                      )}
                                      {fmt === "knockout" && (() => {
                                        const style: DrawStyle = leagueDrawStyles[key] === "graduated" ? "graduated" : "straight";
                                        const perSection = pools > 0 ? Math.ceil(entrants / pools) : entrants;
                                        return (
                                          <div className="space-y-1 pt-1">
                                            <SegRow
                                              label="Entry style"
                                              value={style}
                                              color="violet"
                                              options={[
                                                { v: "straight", l: "Straight knockout" },
                                                { v: "graduated", l: "Gradual fair entry" },
                                              ]}
                                              onChange={(v) =>
                                                setLeagueDrawStyles((m) => ({
                                                  ...m,
                                                  [key]: v === "graduated" ? "graduated" : "straight",
                                                }))
                                              }
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                              {style === "graduated"
                                                ? perSection > 1
                                                  ? `${describeGraduated(perSection, graduatedPlayInMatches(perSection))} Top seeds rest and enter once the field narrows.`
                                                  : "Weakest players meet each other first; stronger seeds enter in later rounds."
                                                : "Strongest plays weakest from round one — every entrant plays immediately."}
                                            </p>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })()}
                               {(fmt === "single_round_robin" || fmt === "double_round_robin") && (
                                <label className="flex items-center gap-2 text-[11px] font-medium cursor-pointer pl-0.5">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 accent-violet-500"
                                    checked={fmt === "double_round_robin"}
                                    onChange={(e) => {
                                      const nv: PerLeagueFormat = e.target.checked ? "double_round_robin" : "single_round_robin";
                                      setLeagueFormats((m) => ({ ...m, [key]: nv }));
                                      setUsePerLeagueFormats(true);
                                      if (!roundFormat || roundFormat === "cross_league") setRoundFormat(nv as any);
                                    }}
                                  />
                                  Double round robin (play each opponent twice — home &amp; away)
                                </label>
                              )}
                              <SegRow
                                label="Category"
                                value={genderForLeague(gn)}
                                color="blue"
                                options={[
                                  { v: "men", l: "Men's" },
                                  { v: "ladies", l: "Ladies'" },
                                  { v: "mixed", l: "Mixed" },
                                  { v: "open", l: "Open" },
                                ]}
                                onChange={(v) => setLeagueGender(gn, v as GenderCategory)}
                              />
                              <SegRow
                                label="Players"
                                value={matchTypeForLeague(gn)}
                                color="green"
                                options={[
                                  { v: "singles", l: "👤 Singles" },
                                  { v: "doubles", l: "👥 Doubles" },
                                ]}
                                onChange={(v) => setLeagueMatchType(gn, v as "singles" | "doubles")}
                              />
                              <SegRow
                                label="Scoring"
                                value={scoringForLeague(gn)}
                                color="amber"
                                options={[
                                  { v: "standard", l: "Standard" },
                                  { v: "time_capped_points", l: "🔔 Bells" },
                                ]}
                                onChange={(v) => setLeagueScoring(gn, v as "standard" | "time_capped_points")}
                              />
                              {scoringForLeague(gn) === "standard" ? (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <SegRow
                                      label="Game length"
                                      value={String(pointsForLeague(gn))}
                                      color="red"
                                      options={[
                                        { v: "11", l: "Par 11" },
                                        { v: "15", l: "Par 15" },
                                      ]}
                                      onChange={(v) => {
                                        const n = Number(v) === 15 ? 15 : 11;
                                        setLeaguePointsPerGame((m) => ({ ...m, [key]: n }));
                                        if (gn === 1) setPointsPerGame(n);
                                      }}
                                    />
                                    <SegRow
                                      label="Games"
                                      value={`${playAllForLeague(gn) ? "all" : "bo"}${bestOfForLeague(gn)}`}
                                      color="pink"
                                      options={[
                                        { v: "bo3", l: "Best of 3" },
                                        { v: "bo5", l: "Best of 5" },
                                        { v: "all3", l: "Play all 3" },
                                        { v: "all5", l: "Play all 5" },
                                      ]}
                                      onChange={(v) => {
                                        const n = v.endsWith("5") ? 5 : 3;
                                        const all = v.startsWith("all");
                                        setLeagueBestOf((m) => ({ ...m, [key]: n }));
                                        setLeaguePlayAll((m) => ({ ...m, [key]: all }));
                                        if (gn === 1) setBestOf(n);
                                      }}
                                    />

                                  </div>
                                  <SegRow
                                    label="Win condition"
                                    value={winConditionForLeague(gn)}
                                    color="cyan"
                                    options={[
                                      { v: "win_by_2", l: "Win by 2" },
                                      { v: "sudden_death", l: "Sudden death" },
                                    ]}
                                    onChange={(v) => setLeagueWinCondition(gn, v as "win_by_2" | "sudden_death")}
                                  />
                                  <SegRow
                                    label="Bye handling"
                                    value={byeForLeague(gn)}
                                    color="green"
                                    options={[
                                      { v: "no_match", l: "No match" },
                                      { v: "walkover_win", l: "Walkover win" },
                                      { v: "neutral", l: "Neutral" },
                                    ]}
                                    onChange={(v) => {
                                      setLeagueByeHandling((m) => ({ ...m, [key]: v as any }));
                                      if (gn === 1) setByeHandling(v as any);
                                    }}
                                  />
                                  {/* Planned time one match of this league occupies a court.
                                      Feeds the capacity calculator (Bells leagues use the bell slot). */}
                                  <SegRow
                                    label="Planned match time"
                                    value={String(Number(groupDurations[key]) || matchDuration || 20)}
                                    color="amber"
                                    options={[
                                      { v: "20", l: "20 min" },
                                      { v: "30", l: "30 min" },
                                      { v: "45", l: "45 min" },
                                      { v: "60", l: "60 min" },
                                    ]}
                                    onChange={(v) => {
                                      const n = Number(v) || 0;
                                      setGroupDurations((m) => ({ ...m, [key]: n }));
                                      if (gn === 1 && (!matchDuration || matchDuration <= 0)) setMatchDuration(n);
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bell slot (min)</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={groupDurations[key] ?? ""}
                                      placeholder="20"
                                      onChange={(e) => {
                                        const n = Math.max(0, Number(e.target.value) || 0);
                                        setGroupDurations((m) => {
                                          const next = { ...m };
                                          if (n <= 0) delete next[key];
                                          else next[key] = n;
                                          return next;
                                        });
                                      }}
                                      className="h-8 text-xs mt-0.5"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Break (min)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      value={groupBreakMinutes[key] ?? ""}
                                      placeholder={String(defaultBreakMinutes || 0)}
                                      onChange={(e) => {
                                        const n = Math.max(0, Number(e.target.value) || 0);
                                        setGroupBreakMinutes((m) => ({ ...m, [key]: n }));
                                      }}
                                      className="h-8 text-xs mt-0.5"
                                    />
                                  </div>
                                </div>
                              )}
                              {scoringForLeague(gn) === "time_capped_points" && (
                                <SegRow
                                  label="Bye handling"
                                  value={byeForLeague(gn)}
                                  color="green"
                                  options={[
                                    { v: "no_match", l: "No match" },
                                    { v: "walkover_win", l: "Walkover win" },
                                    { v: "neutral", l: "Neutral" },
                                  ]}
                                  onChange={(v) => {
                                    setLeagueByeHandling((m) => ({ ...m, [key]: v as any }));
                                    if (gn === 1) setByeHandling(v as any);
                                  }}
                                />
                              )}
                              {/* Forfeit / no-show rule — options come from THIS league's
                                  scoring format, so a standard best-of league can only take a
                                  walkover or a no-result, never an arbitrary points award. */}
                              {(() => {
                                const sc = scoringForLeague(gn);
                                const opts = forfeitOptionsForScoring(sc);
                                const rule = forfeitRuleForLeague(gn);
                                const pts = forfeitPointsForLeague(gn);
                                const hint = opts.find((o) => o.value === rule)?.hint || "";
                                return (
                                  <div className="space-y-1 pt-1">
                                    <SegRow
                                      label="Forfeit / no-show rule"
                                      value={rule}
                                      color="red"
                                      options={opts.map((o) => ({ v: o.value, l: o.label }))}
                                      onChange={(v) =>
                                        setLeagueForfeitRules((m) => ({ ...m, [key]: v as ForfeitRule }))
                                      }
                                    />
                                    {rule === "award_points" && (
                                      <div className="flex flex-wrap items-center gap-2 pl-0.5">
                                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Opponent</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={pts.opponent}
                                          onChange={(e) =>
                                            setLeagueForfeitPoints((m) => ({
                                              ...m,
                                              [key]: { opponent: Math.max(0, Math.round(Number(e.target.value)) || 0), player: pts.player },
                                            }))
                                          }
                                          className="h-7 w-16 text-xs"
                                        />
                                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Absent player</Label>
                                        <Input
                                          type="number"
                                          value={pts.player}
                                          onChange={(e) =>
                                            setLeagueForfeitPoints((m) => ({
                                              ...m,
                                              [key]: { opponent: pts.opponent, player: Math.round(Number(e.target.value)) || 0 },
                                            }))
                                          }
                                          className="h-7 w-16 text-xs"
                                        />
                                      </div>
                                    )}
                                    <p className="text-[10px] text-muted-foreground pl-0.5">{hint}</p>
                                  </div>
                                );
                              })()}
                              <div className="pt-1">
                                <label className="flex items-center gap-2 text-[11px] font-medium cursor-pointer pl-0.5">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 accent-fuchsia-500"
                                    checked={playoffsForLeague(gn)}
                                    onChange={(e) => {
                                      const on = e.target.checked;
                                      setLeaguePlayoffs((m) => ({ ...m, [key]: on }));
                                    }}
                                  />
                                  {fmt === "knockout"
                                    ? "Continue through knockout stages"
                                    : "Playoffs / finals for this league"}
                                </label>
                                {fmt === "knockout" && (
                                  <p className="text-[10px] text-muted-foreground pl-6 pt-0.5 leading-relaxed">
                                    Winners progress to the next knockout round as results are completed,
                                    through to the section/division final.
                                  </p>
                                )}
                              </div>
                              <div className="pt-1 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() => setCollapsedLeagues((m) => ({ ...m, [key]: true }))}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> Done
                                </Button>
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })
                    ) : null}

                    {/* Drop zone / empty state */}
                    <div className="rounded-lg border-2 border-dashed border-border/70 py-6 flex flex-col items-center justify-center text-muted-foreground hover:border-amber-500/50 hover:text-amber-600 transition-colors text-center px-3">
                      <Trophy className="w-6 h-6 mb-1 opacity-60" />
                      <div className="text-xs font-medium">Drop a format here to add {numGroups > 0 ? `League ${numGroups + 1}` : "League 1"}</div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5">or click a format on the right</div>
                    </div>

                    {(() => {
                      const totalExpected = Object.values(expectedPlayers).reduce((a, b) => a + (Number(b) || 0), 0);
                      if (numGroups === 0 && totalExpected === 0) return null;
                      // Rough estimate: sum of C(n,2) per league for single RR, x2 for double,
                      // pools * C(n/pools,2) * rounds for Swiss (approx).
                      let est = 0;
                      for (let gn = 1; gn <= numGroups; gn++) {
                        const key = String(gn);
                        const n = Number(expectedPlayers[key]) || 0;
                        if (n < 2) continue;
                        const fmt: PerLeagueFormat = (leagueFormats[key] ?? (roundFormat as PerLeagueFormat)) || "single_round_robin";
                        const pools = poolsForDivision(gn);
                        const perPool = Math.max(1, Math.ceil(n / pools));
                        if (fmt === "swiss") {
                          const pp = Math.max(2, perPool);
                          est += pools * ((pp * (pp - 1)) / 2);
                        } else if (fmt === "cross_league" && pools > 1) {
                          // pool-vs-pool inside the league
                          est += ((pools * (pools - 1)) / 2) * perPool * perPool;
                        } else {
                          const games = (perPool * (perPool - 1)) / 2 * pools;
                          est += fmt === "double_round_robin" ? games * 2 : games;
                        }

                      }
                      return (
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-500">
                              <Trophy className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <div className="font-semibold">{est > 0 ? `≈ ${est} match${est === 1 ? "" : "es"}` : "Planned capacity"}</div>
                              <div className="text-[10px] text-muted-foreground">{numGroups} league{numGroups === 1 ? "" : "s"} · {totalExpected || "—"} planned {isDoubles ? `pair${totalExpected === 1 ? "" : "s"}` : `player${totalExpected === 1 ? "" : "s"}`}</div>
                            </div>
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">Refined once players register</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Format palette */}
                  <div className="border-t lg:border-t-0 lg:border-l border-border bg-muted/30 p-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Format palette</div>
                    {(["single_round_robin", "knockout", "swiss", "cross_league"] as PerLeagueFormat[]).map((fmt) => {
                      const meta = FORMAT_META[fmt];
                      return (
                        <button
                          key={fmt}
                          type="button"
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("application/x-champ-format", fmt); e.dataTransfer.effectAllowed = "copy"; }}
                          onClick={() => addLeagueOfFormat(fmt)}
                          className="w-full text-left rounded-lg border border-border bg-card p-2.5 shadow-sm hover:border-amber-500/50 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-500/10 text-amber-600 dark:text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-semibold">{meta.label}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">{meta.desc}</p>
                        </button>
                      );
                    })}
                    <p className="text-[10px] text-muted-foreground italic pt-1">Tip: there is no limit — add a division per class (League 1-4, Ladies, Junior Boys, Junior Girls…). Use the copy icon on a division to clone its rules.</p>
                  </div>
                </div>

            </div>
            </WizardSection>

            {/* Plain-language warnings about each division's players and pools. */}
            {(() => {
              const issues = validateDivisions({
                divisionCount: numGroups,
                sources: leagueSources,
                pools: swissPools,
                formatFor: (gn) => formatForLeague(gn),
              });
              if (issues.length === 0) return null;
              return (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                  {issues.map((iss, i) => (
                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">{groupLabels[String(iss.gn)] || `League ${iss.gn}`}:</span>{" "}
                      {iss.message}
                    </p>
                  ))}
                </div>
              );
            })()}

            {/* Players sitting in a division they don't qualify for. Nothing is
                dropped silently — the organiser removes them or keeps them. */}
            {(() => {
              if (isDoubles) return null;
              const bad = explainIneligibleAssignments(
                new Map(Array.from(groupAssignments.entries()).map(([id, gi]) => [id, gi + 1])),
                eligibilityCtx,
              );
              if (bad.length === 0) return null;
              const nameOf = (id: string) =>
                (allSelectablePlayers.find((m: any) => m.id === id) as any)?.name || "Player";
              return (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-destructive">
                    {bad.length} player{bad.length === 1 ? "" : "s"} are not in the league(s) their division draws from.
                    They will not be seeded into the draw until you remove them or keep them anyway.
                  </p>
                  <div className="space-y-1">
                    {bad.map(({ memberId, gn, memberLeagueIds, sourceLeagueIds }) => {
                      const listNames = (ids: string[]) =>
                        ids.map((id) => leagueNameById.get(id) || "Unknown league").join(", ");
                      return (
                      <div key={`${memberId}-${gn}`} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 min-w-0">
                          <span className="font-medium">{nameOf(memberId)}</span>{" "}
                          <span className="text-muted-foreground">
                            — assigned to division “{groupLabels[String(gn)] || `League ${gn}`}”, which draws from{" "}
                            {sourceLeagueIds.length > 0 ? listNames(sourceLeagueIds) : "no league"}.{" "}
                            {memberLeagueIds.length > 0
                              ? `This player is registered in ${listNames(memberLeagueIds)}.`
                              : "This player is not registered in any club league."}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px]"
                          onClick={() =>
                            setEligibilityOverrides((prev) => new Set(prev).add(memberId))
                          }
                        >
                          Keep anyway
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px]"
                          onClick={() => {
                            setSelectedPlayerIds((prev) => {
                              const next = new Set(prev);
                              next.delete(memberId);
                              return next;
                            });
                            setGroupAssignments((prev) => {
                              const next = new Map(prev);
                              next.delete(memberId);
                              return next;
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}



            <div className="rounded-lg border border-dashed p-3 bg-muted/20 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Capacity is checked later.</span>{" "}
              This structure is sized against real court time on the <strong>Dates, Times &amp; Courts</strong> step,
              once the dates, playing times and courts are set.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP: REGISTRATION & PAYMENT ── */}
      {step === "registration" && (
        <Card>
          <CardHeader>
            <CardTitle>Who plays and what it costs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Three questions define the entry flow. Everything else on this step appears only when it applies.
            </p>
            <p className="text-xs font-medium text-primary">{entryFlowSummary}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── Q1 · Who gets into this tournament? ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Who gets into this tournament?</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {([
                  { v: "self", title: "Players enter themselves", desc: "Eligible players add their own name to the entry list." },
                  { v: "admin", title: "I choose the field", desc: "The organiser picks who plays — no public sign-up." },
                  ...(scope !== "club"
                    ? [{ v: "team_manager", title: "Team managers enter their squads", desc: "Clubs or provinces enter players on their behalf." }]
                    : []),
                ] as { v: "self" | "admin" | "team_manager"; title: string; desc: string }[]).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => applyEntrySource(o.v)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      entrySource === o.v
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-sm font-medium">{o.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Q2 · Does an entry need confirmation? ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">2. Does an entry need to be confirmed?</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {([
                  {
                    on: false,
                    title: entrySource === "admin" ? "No — the player is simply in" : "No — entering is final",
                    desc: entrySource === "admin"
                      ? "Selected players go straight onto the roster."
                      : "An entry counts the moment it is submitted.",
                  },
                  {
                    on: true,
                    title: entrySource === "admin" ? "Yes — the player must accept the invitation" : "Yes — I review and accept each entry",
                    desc: entrySource === "admin"
                      ? "Invited players confirm before they count as entered."
                      : "Entries stay provisional until the organiser accepts them.",
                  },
                ]).map((o) => (
                  <button
                    key={String(o.on)}
                    type="button"
                    onClick={() => applyConfirmation(o.on)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      confirmationRequired === o.on
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-sm font-medium">{o.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Q3 · Is there an entry fee? ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">3. Is there an entry fee?</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyEntryFee("0")}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    !isPaidTournament
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="text-sm font-medium">Free</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">No money changes hands — nobody is asked to pay.</div>
                </button>
                <div
                  className={`rounded-lg border p-3 ${
                    isPaidTournament ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-muted/20"
                  }`}
                >
                  <Label className="text-sm font-medium">Entry fee (ZAR)</Label>
                  <Input
                    type="number" min={0} step="1" inputMode="decimal"
                    value={isPaidTournament ? entryFeeRand : ""}
                    onChange={(e) => applyEntryFee(e.target.value)}
                    placeholder="e.g. 120"
                    className="mt-1 h-9"
                  />
                </div>
              </div>

              {isPaidTournament && (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                  <Label className="text-sm">When is the fee due?</Label>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="payment-timing"
                        checked={paymentTiming === "on_entry"}
                        onChange={() => setPaymentTiming("on_entry")}
                      />
                      On entry — pay to be on the list
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="payment-timing"
                        checked={paymentTiming === "after_acceptance"}
                        onChange={() => {
                          setPaymentTiming("after_acceptance");
                          if (!confirmationRequired) applyConfirmation(true);
                        }}
                      />
                      After acceptance — pay once the entry is confirmed
                    </label>
                  </div>
                  {paymentTiming === "after_acceptance" && !confirmationRequired && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Paying after acceptance needs a confirmation step — question 2 will be switched on.
                    </p>
                  )}
                </div>
              )}
            </div>

            <WizardSection
              title={"Payment methods"}
              summary={isPaidTournament ? `R${entryFeeRand} · ${Array.from(paymentMethods).join(", ") || "no method"}` : "Free entry — nothing to collect"}
              complete={!isPaidTournament || paymentMethods.size > 0}
              defaultOpen={isPaidTournament}
            >
            {!isPaidTournament ? (
              <p className="text-xs text-muted-foreground">
                This tournament is free — no payment methods, invoices or proof-of-payment steps are shown to players.
              </p>
            ) : (
              <div className="rounded-lg border-2 border-border bg-slate-100 dark:bg-slate-800/40 shadow-sm p-3 space-y-2">
                <Label className="text-sm font-semibold">
                  Accepted payment methods <span className="text-destructive">*</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Tick the methods you'll accept for this tournament. Configure your online gateway and bank details in Club Admin → Banking.
                </p>
                <div className="space-y-1.5">
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
                <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                  {paymentTiming === "after_acceptance"
                    ? "Players are asked to pay only once their entry is accepted."
                    : "Players are asked to pay as soon as they enter."}
                </p>
              </div>
            )}

            {/* Fee shares and refunds live in Governance — shown read-only so
                there is a single place to edit them. */}
            {editingChampId && wizardGovernance && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-medium uppercase tracking-wide text-muted-foreground">Governance</div>
                {/* Levies are ownership-aware: only shown when the beneficiary is
                    not also the owner (Governance → Fees & refunds is authoritative). */}
                {scope !== "club" && (
                  <div>
                    Federation levy: <strong>R {((wizardGovernance.federation_fee_cents || 0) / 100).toFixed(2)}</strong>
                    {Number(wizardGovernance.federation_fee_pct || 0) > 0 ? ` + ${Number(wizardGovernance.federation_fee_pct)}%` : ""}
                  </div>
                )}
                <div>
                  Association levy: <strong>R {((wizardGovernance.association_fee_cents || 0) / 100).toFixed(2)}</strong>
                  {Number(wizardGovernance.association_fee_pct || 0) > 0 ? ` + ${Number(wizardGovernance.association_fee_pct)}%` : ""}
                </div>
                {Number(wizardGovernance.other_expenses_cents || 0) > 0 && (
                  <div>
                    {wizardGovernance.other_expenses_label || "Other expenses"}:{" "}
                    <strong>R {((wizardGovernance.other_expenses_cents || 0) / 100).toFixed(2)}</strong>
                  </div>
                )}
                <div>
                  Refunds: <strong>
                    {wizardGovernance.refund_policy === "none" ? "No refunds"
                      : wizardGovernance.refund_policy === "full_before_cutoff" ? "Full refund before cut-off"
                      : "Partial refund before cut-off"}
                  </strong>
                  {wizardGovernance.refund_cutoff_date ? ` (cut-off ${wizardGovernance.refund_cutoff_date})` : ""}
                </div>
                <p className="text-muted-foreground">Edit these in the tournament's Governance dialog.</p>
              </div>
            )}



            </WizardSection>
            {matchType === "singles" && (
            <WizardSection
              title={"Handicap scoring"}
              summary={handicapMode === "none" ? "No handicap" : "Handicap enabled"}
              complete={true}
              defaultOpen={handicapMode !== "none"}
            >


            {/* League-ranking handicap — singles only */}
            {matchType === "singles" && (
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Label className="text-sm">Handicap mode</Label>
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
                    By Club League main setup
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="handicap-mode"
                      checked={handicapMode === "group_order"}
                      onChange={() => setHandicapMode("group_order")}
                    />
                    By tournament ranking (Leagues page)
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="handicap-mode"
                      checked={handicapMode === "ladder_history"}
                      onChange={() => setHandicapMode("ladder_history")}
                    />
                    By ladder + recent form (90d)
                  </label>
                </div>
                {handicapMode === "group_order" && Array.isArray(groups) && groups.length > 1 && (
                  <div className="rounded-md border border-border/60 bg-background p-2 space-y-1.5">
                    <Label className="text-xs">League strength (across {groups.length} leagues)</Label>
                    <div className="flex flex-col gap-1.5 text-sm">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="group-rank-scope"
                          className="mt-1"
                          checked={groupRankScope === "continuous"}
                          onChange={() => setGroupRankScope("continuous")}
                        />
                        <span>
                          <span className="font-medium">League 1 supersedes League 2</span>
                          <span className="text-xs text-muted-foreground block">Continuous ranking 1…N across all leagues (top of L1 = strongest, bottom of last league = weakest).</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="group-rank-scope"
                          className="mt-1"
                          checked={groupRankScope === "parallel"}
                          onChange={() => setGroupRankScope("parallel")}
                        />
                        <span>
                          <span className="font-medium">Leagues are even strength</span>
                          <span className="text-xs text-muted-foreground block">Each league is ranked 1…N independently. A #4 in any league gets a 3-point handicap vs #1 in any league.</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}
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
                  {handicapMode === "ladder_history"
                    ? "Starts from each player's ladder position, then aggressively adjusts up or down using the average post-handicap margin from their last 90 days of handicap tournaments (target avg margin ≤ 3). No cap on the shift — big overperformers move up sharply."
                    : handicapMode === "club_ladder"
                    ? "Stronger player (lower ladder position) starts on a negative score equal to the ladder-position gap, scaled by the multiplier/divider above."
                    : "Same-league tournaments (one division, multiple teams) use each player's league team rank — all #1s are treated equally strong. Cross-league tournaments (e.g. 2nd vs 4th League) follow the order on the Groups step — top of League 1 = strongest. Sort strongest → weakest in that case."}
                </p>
              </div>
            )}

            </WizardSection>
            )}
            {/* Registration window, tournament dates and per-league forfeit rules
                are owned by the Dates & Courts and Structure steps — no duplicate
                read-only summary here. */}







            <WizardSection
              title={"Partner selection"}
              summary={isDoubles ? (partnerMode === "admin" ? "Admin pairs players" : partnerMode === "players" ? "Players choose partners" : "Not set") : "Singles — no partners needed"}
              complete={!isDoubles || !!partnerMode}
              defaultOpen={true}
            >
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


            </WizardSection>
          </CardContent>
        </Card>
      )}

      {step === "invites" && (
        <Card>
          <CardHeader>
            <CardTitle>Invites &amp; messaging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WizardSection
              title={"Invites & messaging"}
              summary={`${Array.from(inviteMethods).join(", ") || "no channel"} · ${description ? "custom message" : "default message"}`}
              complete={inviteMethods.size > 0}
              defaultOpen={true}
            >
            {/* Tournament description / invite body */}
            <div className="space-y-2">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <Label className="text-sm">Tournament details (shown in invites)</Label>
                  <Textarea
                    rows={10}
                    placeholder={`The tournament details block is filled in automatically from your setup. Add anything extra below it, like:\nVenue: Main courts, 18:00 start\nPrizes: Trophy + R500 voucher\nDress code: Club shirts\nQueries: contact the captain`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="flex flex-row md:flex-col gap-2 md:w-44 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 md:flex-none"
                    onClick={() => setShowInvitePreview(true)}
                  >
                    <Eye className="w-4 h-4 mr-1" /> Preview invite
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The details block at the top is generated automatically from this tournament's settings and refreshes on its own whenever you change the category, format, dates, registration window or fee — anything you type below it is kept. Creating or saving the tournament does NOT auto-notify — nothing goes out until you click <strong>Send invites now</strong> in <em>When to send invites</em> below.
              </p>

              <div className="space-y-2 pt-2">
                <Label className="text-sm">Extra invite wording (food, co-hosting, prizes, venue notes)</Label>
                <Textarea
                  rows={4}
                  placeholder={`e.g. CSIR is co-hosting this tournament with SquashApp.\nFood on the day: chicken pregos, wors rolls and a league braai.\nSponsored balls will be provided.`}
                  value={inviteExtraDetails}
                  onChange={(e) => setInviteExtraDetails(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This text is appended to every invite and appears in the preview above.
                </p>
              </div>
            </div>

            <div className="space-y-2">
            {/* INVITATION AUDIENCE — independent of the Structure/draw source and of entry method */}
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">


                <Label className="text-sm">Invite audience — who gets invited (choosing here never sends)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Who gets invited, within the “{eligibilityOptions.find((s) => s.value === eligibilityScope)?.label || "Club members"}” eligibility you chose in Step 1.
                  This is separate from the Structure step — the league/team selection there only decides how accepted entrants are grouped and seeded.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {audienceModesForScope(eligibilityScope).map((mode) => (
                    <label key={mode} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="invite-audience"
                        checked={inviteAudience === mode}
                        onChange={() => setInviteAudience(mode)}
                      />
                      {audienceLabel(mode, eligibilityScope)}
                    </label>
                  ))}
                </div>

                {inviteAudience === "clubs" && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-muted-foreground">
                      {eligibilityScope === "open"
                        ? "Pick associations or individual clubs to invite"
                        : "Pick which clubs in your region to invite"}
                    </Label>
                    <InviteScopeTree
                      tree={scopeTree}
                      selectedClubIds={audienceClubIds}
                      onChange={setAudienceClubIds}
                      loading={scopeTreeLoading}
                      error={scopeTreeError instanceof Error ? scopeTreeError.message : null}
                    />

                  </div>
                )}


                {inviteAudience === "leagues" && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-muted-foreground">Pick which league teams to invite</Label>
                    <div className="rounded border border-border/50 bg-background/60 p-2">
                      <LeagueSourceTree
                        groups={leagueTree}
                        selected={Array.from(audienceLeagueIds)}
                        onChange={(ids) => setAudienceLeagueIds(new Set(ids))}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                      <Checkbox checked={inviteIncludeReserves} onCheckedChange={(c) => setInviteIncludeReserves(!!c)} />
                      Include reserves
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={audienceIncludeIndividuals}
                        onCheckedChange={(c) => setAudienceIncludeIndividuals(!!c)}
                      />
                      Also invite individually picked members
                    </label>
                    {inviteTeamBreakdown.length > 0 && (
                      <div className="rounded border border-border/50 bg-background/60 p-2 space-y-0.5 max-h-40 overflow-auto">
                        {inviteTeamBreakdown.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-[11px]">
                            <span className="truncate">{t.name}</span>
                            <span className={t.count === 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}>
                              {t.count} player{t.count === 1 ? "" : "s"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(inviteAudience === "individuals" || (inviteAudience === "leagues" && audienceIncludeIndividuals)) && (
                  <div className="space-y-1.5 pt-1">
                    {editingChampId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void openInviteePicker()}
                      >
                        <Users className="w-3.5 h-3.5 mr-1" />
                        Pick from the tournament roster
                      </Button>
                    )}
                    <Input
                      value={audienceSearch}
                      onChange={(e) => setAudienceSearch(e.target.value)}
                      placeholder="Search players by name or club (league membership not required)"
                      className="h-8 text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {directoryScopeLabel(eligibilityScope)} — only name, club, category and ranking are shown. Contact
                      details stay private; SquashHub delivers the invitation on your behalf.{" "}
                      <span className="text-primary">*</span> indicates a player who already has a SquashHub login.
                    </p>
                    {directoryError && (
                      <p className="text-[11px] text-destructive">
                        Player directory unavailable: {(directoryError as any)?.message || "not authorised"}
                      </p>
                    )}
                    <div className="rounded border border-border/50 bg-background/60 p-2 space-y-1.5 max-h-52 overflow-auto">
                      {directoryLoading && directoryPlayers.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">Searching…</p>
                      )}
                      {!directoryLoading && directoryPlayers.length === 0 && !directoryError && (
                        <p className="text-[11px] text-muted-foreground">No eligible players match that search.</p>
                      )}
                      {directoryGroups.map((g) => (
                        <div key={g.clubId} className="space-y-0.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {g.clubName}
                            {g.players.some((p) => p.is_own_club) ? " (this club)" : ""}
                          </div>
                          {g.players.map((p) => (
                            <label key={p.member_id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                              <Checkbox
                                checked={audienceMemberIds.has(p.member_id)}
                                onCheckedChange={(c) => {
                                  setAudienceMemberIds((prev) => {
                                    const next = new Set(prev);
                                    c ? next.add(p.member_id) : next.delete(p.member_id);
                                    return next;
                                  });
                                  setDirectoryPicked((prev) => {
                                    const next = new Map(prev);
                                    c ? next.set(p.member_id, p) : next.delete(p.member_id);
                                    return next;
                                  });
                                }}
                              />
                              <span className={cn("truncate", p.is_user && "text-primary font-medium")}>
                                {p.display_name}
                                {p.is_user && (
                                  <span className="text-primary ml-0.5" title="Already has a SquashHub login">
                                    *
                                  </span>
                                )}
                              </span>
                              {p.gender && (
                                <span className="text-[10px] text-muted-foreground shrink-0">{p.gender}</span>
                              )}
                              {typeof p.ladder_position === "number" && (
                                <span className="text-[10px] text-muted-foreground shrink-0">#{p.ladder_position}</span>
                              )}
                              {p.invite_status && (
                                <span className="text-[10px] text-muted-foreground shrink-0">({p.invite_status})</span>
                              )}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>

                  </div>
                )}

                <p className="text-xs text-muted-foreground">{resolvedAudience.summary}</p>
                <p className="text-[11px] text-muted-foreground">
                  Anyone who accepts but has no league mapping is still accepted and lands in <strong>Needs division assignment</strong> for you to place.
                </p>
              </div>



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
                {whatsappEnabled ? (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={inviteMethods.has("whatsapp")}
                      onCheckedChange={(c) => {
                        const next = new Set(inviteMethods);
                        c ? next.add("whatsapp") : next.delete("whatsapp");
                        if (next.size === 0) next.add("app");
                        setInviteMethods(next);
                      }}
                    />
                    WhatsApp
                  </label>
                ) : (
                  <span
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                    title="WhatsApp messaging is not activated for your club. Activate it in Club Admin → WhatsApp."
                  >
                    <Checkbox checked={false} disabled />
                    WhatsApp
                    <a
                      href="/club-admin?tab=whatsapp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline text-primary"
                    >
                      Activate
                    </a>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose how invited members are notified. Pick more than one for maximum reach.
                {inviteMethods.has("whatsapp") && " WhatsApp invites let members reply YES/NO to enter — billed to your club."}
                {!whatsappEnabled && " WhatsApp is inactive — activate WhatsApp messaging in your admin setup to invite members via WhatsApp."}
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
                    You'll get a reminder near this time. Automated send-out isn't wired up yet — use <strong>Send invites now</strong> below when ready.
                  </p>
                </div>
              )}
              {inviteTiming === "manual" && (
                <p className="text-xs text-muted-foreground">
                  Saving never notifies anyone. Nothing goes out until you click <strong>Send invites now</strong>.
                </p>
              )}

              {/* The one and only bulk trigger + test invite */}
              <div className="pt-2 border-t border-border/50 space-y-3">
                {editingChampId ? (
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      disabled={invitesSendingFor === editingChampId || effectiveAllInviteCount === 0}
                      onClick={() => sendChampInvites(editingChampId, { confirm: true, mode: "all" })}
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {invitesSendingFor === editingChampId
                        ? "Sending…"
                        : `Send invites now (${effectiveAllInviteCount})`}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Goes to the invitation audience above ({audienceLabel(inviteAudience, eligibilityScope)}) via{" "}
                      {Array.from(inviteMethods.size ? inviteMethods : new Set(["app"])).join(", ")}. {resolvedAudience.summary}
                    </p>
                    {lastInviteSend && (
                      <p className="text-[11px] text-muted-foreground">
                        Last sent: {new Date(lastInviteSend.at).toLocaleString()} — {lastInviteSend.count} recipient
                        {lastInviteSend.count === 1 ? "" : "s"}
                        {lastInviteSend.mode === "selected" ? " (selected members)" : ""}.
                      </p>
                    )}
                    {allInviteCount > effectiveAllInviteCount && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-500">
                        This tournament has {allInviteCount} invite rows from earlier, wider sends. Only the {effectiveAllInviteCount} member{effectiveAllInviteCount === 1 ? "" : "s"} in the current audience will be mailed.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    <strong className="text-foreground">Send invites now</strong> becomes available once the tournament is saved — use <strong>Save progress</strong> first.
                  </p>
                )}

                {editingChampId && (
                  <div className="rounded-md border border-dashed border-border/60 p-3 space-y-1.5">
                    <div className="text-xs font-medium">Test invite</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!sampleInvitee || testInviteSending}
                      onClick={() => {
                        if (!sampleInvitee) return;
                        openTestInviteDialog(sampleInvitee);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {testInviteSending
                        ? "Sending test…"
                        : sampleInvitee
                          ? `Send test as an invited player (${sampleInvitee.name})`
                          : "Send test as an invited player"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Test only — goes to an email address you type. It does not create entries and does not notify any member.
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}




              {/* Individual invitee picker — staging only, never sends */}
              <Dialog open={inviteePickerOpen} onOpenChange={setInviteePickerOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Choose individual invitees</DialogTitle>
                    <DialogDescription>
                      Picking members only builds the audience. Nothing is sent until you click “Send invites now”.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input
                      placeholder="Search invitees…"
                      value={inviteeSearch}
                      onChange={(e) => setInviteeSearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{selectedInviteeRegIds.size} selected of {inviteeList.length} shown</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setSelectedInviteeRegIds(new Set(inviteeList.map((r) => r.id)))}
                        >
                          Select all shown
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setSelectedInviteeRegIds(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                      {(inviteesLoading || inviteePickerPreparing) && (
                        <p className="p-3 text-sm text-muted-foreground">Loading invitees…</p>
                      )}
                      {!inviteesLoading && !inviteePickerPreparing && inviteeList.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No invitees found for this tournament.</p>
                      )}
                      {inviteeList.map((r) => {
                        const checked = selectedInviteeRegIds.has(r.id);
                        return (
                          <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setSelectedInviteeRegIds((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(r.id); else next.delete(r.id);
                                  return next;
                                });
                              }}
                            />
                            <span className="flex-1 min-w-0 truncate">{r.name}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">{inviteeStatusLabel(r)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setInviteePickerOpen(false)}>Cancel</Button>
                    <Button
                      type="button"
                      disabled={selectedInviteeRegIds.size === 0}
                      onClick={() => {
                        const memberIds = inviteeList
                          .filter((r) => selectedInviteeRegIds.has(r.id))
                          .map((r) => r.memberId)
                          .filter(Boolean) as string[];
                        setAudienceMemberIds(new Set(memberIds));
                        setInviteAudience("individuals");
                        setInviteePickerOpen(false);
                        toast.success(`${memberIds.length} member${memberIds.length === 1 ? "" : "s"} staged — nothing sent yet.`);
                      }}
                    >
                      Save selection ({selectedInviteeRegIds.size})
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={testInviteDialogOpen} onOpenChange={setTestInviteDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Send test invite</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {testInvitePreviewAs && (
                      <p className="text-xs text-muted-foreground">
                        Previewing the invitation as {testInvitePreviewAs.name} would receive it.
                      </p>
                    )}
                    {!testInvitePreviewAs && sampleInvitee && (
                      <p className="text-xs text-muted-foreground">
                        Previewing the secure invitation journey for {sampleInvitee.name}.
                      </p>
                    )}
                    <Label htmlFor="test-invite-email">Recipient email address</Label>
                    <Input
                      id="test-invite-email"
                      type="email"
                      autoComplete="email"
                      maxLength={255}
                      placeholder="name@example.com"
                      value={testInviteEmail}
                      onChange={(event) => {
                        setTestInviteEmail(event.target.value);
                        if (testInviteEmailError) setTestInviteEmailError("");
                      }}
                    />
                    {testInviteEmailError && <p className="text-xs text-destructive">{testInviteEmailError}</p>}
                    <p className="text-xs text-muted-foreground">
                      Email only. The link identifies the invited player, but the test does not mark it as sent or record a response.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setTestInviteDialogOpen(false)}>Cancel</Button>
                    <Button
                      type="button"
                      disabled={testInviteSending || !testInviteEmail.trim()}
                      onClick={() => {
                        if (!editingChampId) return;
                        void sendTestInvite(editingChampId, testInviteEmail, {
                          asMemberId: testInvitePreviewAs?.memberId,
                          asName: testInvitePreviewAs?.name,
                        });
                      }}
                    >
                      {testInviteSending ? "Sending…" : "Send test"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>




              <CompetitionRankingCard
                className="mt-2"
                clubId={clubId}
                source="tournament"
                affects={affectsRankingPoints}
                onAffectsChange={setAffectsRankingPoints}
                weight={rankingWeight}
                onWeightChange={setRankingWeight}
              />


              <div className="rounded-md border bg-muted/30 px-3 py-2 mt-2 space-y-1">
                <Label className="text-xs font-medium">Do results move the club ladder?</Label>
                <Select
                  value={ladderAffects === null ? "inherit" : ladderAffects ? "on" : "off"}
                  onValueChange={(v) => setLadderAffects(v === "inherit" ? null : v === "on")}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Use the club ladder setting</SelectItem>
                    <SelectItem value="on">Yes — move the ladder</SelectItem>
                    <SelectItem value="off">No — leave the ladder alone</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Only club-mate singles results between two ranked members can move the ladder.
                </p>
              </div>

            </div>
            </WizardSection>
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
            {editingChampId && (entrantCounts.registered + entrantCounts.accepted + entrantCounts.pending_invite) > 0 && (
              <p className="text-xs text-muted-foreground">
                {entrantCounts.registered} registered · {entrantCounts.accepted} accepted (fee due) ·{" "}
                {entrantCounts.pending_invite + entrantCounts.payment_pending} awaiting response ·{" "}
                {entrantCounts.declined} declined. Only registered entrants are pre-selected here.
              </p>
            )}
            {acceptedNeedingDivision.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <span className="font-semibold">Accepted — needs division assignment ({acceptedNeedingDivision.length}):</span>{" "}
                {acceptedNeedingDivision.map((p) => p.name).join(", ")}. They accepted the invitation but play in none of
                the source leagues — place them into a division manually.
              </div>
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
                      onClick={() => {
                        const nextPairs = doublesPairs.filter((p) => p.id !== pair.id);
                        setDoublesPairs(nextPairs);
                        setPairOrder((prev) => prev.filter((id) => id !== pair.id));
                        setPairGroupAssignments((prev) => {
                          const next = new Map(prev);
                          next.delete(pair.id);
                          return next;
                        });
                        if (editingChampId) {
                          persistDoublesPairsDraft(editingChampId, nextPairs)
                            .then(() => toast.success("Pairs saved"))
                            .catch((e) => toast.error(e?.message || "Could not save pairs"));
                        }
                      }}
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
                const pair = { id: crypto.randomUUID(), player1Id: p1, player2Id: p2 };
                const nextPairs = [...doublesPairs, pair];
                setDoublesPairs(nextPairs);
                setPairOrder((prev) => [...prev.filter((id) => id !== pair.id), pair.id]);
                if (editingChampId) {
                  persistDoublesPairsDraft(editingChampId, nextPairs)
                    .then(() => toast.success("Pairs saved"))
                    .catch((e) => toast.error(e?.message || "Could not save pairs"));
                }
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
            {editingChampId && (
              <DoublesPairsPanel champId={editingChampId} clubId={clubId} groupLabels={groupLabels as any} />
            )}
          </CardContent>
        </Card>
      )}



      {/* ── STEP: GROUPS ── */}
      {step === "groups" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Allocate players</CardTitle>
              {/* Ladder positions change while a tournament is being set up.
                  This re-pulls the roster so the seed order on screen matches
                  the club ladder right now — without losing manual placements. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={refreshingRanking}
                onClick={refreshRanking}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshingRanking ? "animate-spin" : ""}`} />
                {refreshingRanking ? "Refreshing…" : "Refresh ranking"}
              </Button>
            </div>
            {(() => {
              const counts = countAllocatedEntries(
                (groups as ClubMember[][]).map((g) => g.map((p) => p.id)),
                isDoubles ? [] : unassignedEntrantIds,
              );
              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    Move {entityCount} {isDoubles ? "pairs" : "players"} between the leagues you defined in Structure.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{counts.uniquePlayers}</strong> unique{" "}
                    {isDoubles ? (counts.uniquePlayers === 1 ? "pair" : "pairs") : counts.uniquePlayers === 1 ? "player" : "players"} entered ·{" "}
                    <strong className="text-foreground">{counts.totalEntries}</strong>{" "}
                    {counts.totalEntries === 1 ? "entry" : "entries"} in total across all leagues
                  </p>
                </>
              );
            })()}

            {/* How the automatic split fills the pools. Manual drags always win. */}
            <div className="mt-3 rounded-md border bg-muted/30 p-2 space-y-2">
              <div className="text-xs font-medium">Pool allocation</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  {
                    v: "snake" as const,
                    t: "Even pools (snake)",
                    d: "Seeds zig-zag across the pools (A: 1, 4, 5… B: 2, 3, 6…) so every pool is of similar overall strength.",
                  },
                  {
                    v: "banded" as const,
                    t: "Strength bands",
                    d: "Pool A gets the strongest players, Pool B the next band, Pool C the weakest — each ranked 1…n inside its own pool.",
                  },
                ]).map((o) => (
                  <label
                    key={o.v}
                    className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${poolAllocation === o.v ? "border-primary bg-primary/5" : ""}`}
                  >
                    <input
                      type="radio"
                      name="pool-allocation"
                      className="mt-1"
                      checked={poolAllocation === o.v}
                      onChange={() => setPoolAllocation(o.v)}
                    />
                    <span className="text-xs">
                      <span className="font-medium block">{o.t}</span>
                      <span className="text-muted-foreground">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Applies to every league that runs more than one pool. Players you drag by hand keep their spot.
              </p>
            </div>

            {/* Category mismatches — e.g. female players sitting in a league
                set to Men's. Offer a one-click move into a matching league
                instead of changing each player's dropdown by hand. */}
            {!isDoubles && (() => {
              const leagueLabel = (gn: number) => {
                const raw = groupLabels[String(gn)]?.trim();
                if (!raw) return `League ${gn}`;
                return /league|div|pool|grp|group/i.test(raw) ? raw : `League ${raw}`;
              };
              const mismatched = (groups as ClubMember[][])
                .flat()
                .filter((p: any) => !memberFitsLeague(p, (groupAssignments.get(p.id) ?? 0) + 1));
              if (mismatched.length === 0) return null;
              // Leagues that would accept every mismatched player.
              const targets = Array.from({ length: numGroups }, (_, i) => i + 1).filter((gn) =>
                mismatched.every((p: any) => memberFitsLeague(p, gn)),
              );
              return (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-2">
                  <div className="text-xs font-medium text-destructive">
                    {mismatched.length} {mismatched.length === 1 ? "player does" : "players do"} not match the category of the league they are in
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {mismatched.slice(0, 8).map((p: any) => p.name || p.profiles?.name).join(", ")}
                    {mismatched.length > 8 ? ` +${mismatched.length - 8} more` : ""}
                  </p>
                  {targets.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {targets.map((gn) => (
                        <Button
                          key={gn}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setGroupAssignments((prev) => {
                              const next = new Map(prev);
                              mismatched.forEach((p: any) => next.set(p.id, gn - 1));
                              return next;
                            });
                            setEligibilityOverrides((prev) => {
                              const next = new Set(prev);
                              mismatched.forEach((p: any) => next.add(p.id));
                              return next;
                            });
                          }}
                        >
                          Move {mismatched.length} to {leagueLabel(gn)} ({GENDER_LABELS[genderForLeague(gn)]})
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      No league in this tournament matches them. Add a Ladies league in Structure (or set one league's category to Ladies), then come back here.
                    </p>
                  )}
                </div>
              );
            })()}
          </CardHeader>


          <CardContent className="space-y-4">
            {/* Read-only echo of the structure decision — Structure is the single
                authority for how many leagues exist and what they are called. */}
            <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-xs">
                <div className="font-medium text-foreground">
                  {numGroups || 0} league{numGroups === 1 ? "" : "s"} defined in Structure
                </div>
                <div className="text-muted-foreground">
                  {Array.from({ length: numGroups || 0 }, (_, i) =>
                    groupLabels[String(i + 1)]?.trim() || `League ${i + 1}`).join(" · ") || "No leagues yet"}
                </div>
              </div>
              <Button
                type="button" variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => goToStep("structure")}
              >
                Edit in Structure
              </Button>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              {isDoubles ? "Pairs" : "Players"} are auto-distributed by order. Drag a row into another league to move it, drag within a league to reorder, or use the dropdown.
              {!isDoubles && (handicapMode === "league_rank" || handicapMode === "group_order") && (
                <> <span className="text-primary font-medium">Sort strongest → weakest within each league — {handicapMode === "group_order" ? "this order is the handicap ranking" : "this order determines handicaps"}</span>
                  {handicapMode === "group_order" && groups.length > 1 && groupRankScope === "parallel"
                    ? " (each league ranked 1…N independently — e.g. a #4 in any league gets the same handicap vs a #1 in any league)."
                    : " (top of League 1 = strongest, bottom of the last league = weakest)."}
                  {" "}Subs slot in wherever you drop them.</>
              )}
            </p>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCrossLeagueDragEnd}>
              <div className="space-y-4">
                {(() => {
                  const isSwissPools = true; // pools apply to any format now
                  const poolsFor = (gi: number) => poolsForDivision(gi + 1);

                  // Seeded serpentine distribution: pool A = seeds 1,4,5,8…,
                  // pool B = 2,3,6,7… so pools are balanced by strength.
                  // A division the organiser hand-arranged keeps their order
                  // (contiguous blocks) until they hit "Rebalance pools by seed".

                  const poolTint = [
                    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
                    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                    "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
                    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
                  ];

                  return isDoubles ? (
                    (groups as DoublePair[][]).map((g, gi) => {
                      const pools = poolsFor(gi);
                      return (
                        <DroppableLeague key={gi} id={`league-${gi}`} className="border rounded-lg p-3 min-h-[60px] transition-colors">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-sm font-medium">League</span>
                            <Input
                              value={groupLabels[String(gi + 1)] ?? ""}
                              placeholder={String(gi + 1)}
                              onChange={(e) => setGroupLabels((p) => ({ ...p, [String(gi + 1)]: e.target.value }))}
                              className="h-7 w-full sm:w-44 min-w-[9rem] text-sm"
                            />
                            <span className="text-muted-foreground text-xs">({g.length} pairs)</span>
                            {isSwissPools && pools > 1 && (
                              <Badge variant="outline" className="text-[10px]">
                                {pools} pools · {isKnockoutDivision(gi + 1) ? "bracket-sized" : "seed-balanced (serpentine)"}
                              </Badge>
                            )}
                          </div>
                          {/* Each pool is its own block — pools are never
                              interleaved into one mixed list. */}
                          {g.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic py-2">Drop pairs here</p>
                          )}
                          {poolBlocks(g, pools, poolOptsFor(gi)).map((block) => (
                            <div key={block.pool} className={pools > 1 ? "mb-2" : ""}>
                              {isSwissPools && pools > 1 && (
                                <div className={`mt-2 mb-1 px-2 py-1 rounded border text-[10px] font-semibold uppercase tracking-wide ${poolTint[block.pool % poolTint.length]}`}>
                                  Pool {block.letter} <span className="opacity-70 normal-case">({block.rows.length} pairs)</span>
                                </div>
                              )}
                              <SortableContext items={block.rows.map((r) => r.item.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                  {block.rows.map(({ item: pair, seed }) => (
                                    <SortableRow key={pair.id} id={pair.id}>
                                      {pools > 1 && (
                                        <span className="text-[10px] text-muted-foreground w-5 shrink-0 tabular-nums">{seed}.</span>
                                      )}
                                      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="flex-1 text-sm font-medium">{getPairLabel(pair)}</span>
                                      <Select
                                        value={String(pairGroupAssignments.get(pair.id) ?? 0)}
                                        onValueChange={async (v) => {
                                          if (v === "__withdrawn") {
                                            if (confirm("Withdraw this pair from the tournament?")) {
                                              await withdraw(pair.id, true);
                                            }
                                            return;
                                          }
                                          const newMap = new Map(pairGroupAssignments);
                                          newMap.set(pair.id, Number(v));
                                          setPairGroupAssignments(newMap);
                                        }}
                                      >
                                        <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__withdrawn" className="text-destructive">Withdraw pair / not playing</SelectItem>
                                          {Array.from({ length: numGroups }, (_, i) => (
                                            <SelectItem key={i} value={String(i)}>{groupLabels[String(i + 1)]?.trim() ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)]) ? groupLabels[String(i + 1)] : `League ${groupLabels[String(i + 1)]}`) : `League ${i + 1}`}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </SortableRow>
                                  ))}
                                </div>
                              </SortableContext>
                            </div>
                          ))}
                        </DroppableLeague>
                      );
                    })
                  ) : (
                    (groups as ClubMember[][]).map((g, gi) => {
                      const pools = poolsFor(gi);
                      return (
                        <DroppableLeague key={gi} id={`league-${gi}`} className="border rounded-lg p-3 min-h-[60px] transition-colors">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-sm font-medium">League</span>
                            <Input
                              value={groupLabels[String(gi + 1)] ?? ""}
                              placeholder={String(gi + 1)}
                              onChange={(e) => setGroupLabels((p) => ({ ...p, [String(gi + 1)]: e.target.value }))}
                              className="h-7 w-full sm:w-44 min-w-[9rem] text-sm"
                            />
                            <span className="text-muted-foreground text-xs">({g.length} players)</span>
                            {isSwissPools && pools > 1 && (
                              <Badge variant="outline" className="text-[10px]">
                                {pools} pools · {manualSeedGroups.has(gi) ? "manual arrangement" : poolAllocation === "banded" ? "strength bands (A strongest)" : "seed-balanced (serpentine)"}
                              </Badge>
                            )}
                            {manualSeedGroups.has(gi) ? (
                              <>
                                <Badge variant="outline" className="text-[10px]">Manual seed order</Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() =>
                                    setManualSeedGroups((prev) => {
                                      const n = new Set(prev);
                                      n.delete(gi);
                                      return n;
                                    })
                                  }
                                >
                                  {pools > 1 ? "Rebalance pools by seed" : "Reset to ladder order"}
                                </Button>
                              </>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Seeded by club ladder</Badge>
                            )}
                            {g.some((p) => isUnranked(p as any)) && (
                              <Badge variant="secondary" className="text-[10px]">
                                {g.filter((p) => isUnranked(p as any)).length} unranked
                              </Badge>
                            )}
                            {isKnockoutDivision(gi + 1) && g.length > 1 && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => setDrawEditor(gi)}
                                >
                                  <Shuffle className="w-3 h-3 mr-1" /> Review &amp; edit draw
                                </Button>
                                {manualDraws[String(gi + 1)] && (() => {
                                  const rec = reconcileBoardWithEntrants(
                                    manualDraws[String(gi + 1)],
                                    Array.from(new Set(g.map((p: any) => p.id).filter(Boolean))),
                                  );
                                  return rec.usable ? (
                                    <Badge variant="outline" className="text-[10px]">Manual draw locked in</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[10px]">
                                      {rec.missing.length} new entrant(s) not on your draw — open it to place them
                                    </Badge>
                                  );
                                })()}
                              </>
                            )}

                          </div>
                          {isSwissPools && pools > 1 && g.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mb-1 leading-snug">
                              {poolCounts(g.length, pools, poolOptsFor(gi))
                                .map((c, p) => `Pool ${poolLetter(p)} (${c})`)
                                .join("  ·  ")}
                              {!manualSeedGroups.has(gi) &&
                                (isKnockoutDivision(gi + 1)
                                  ? ` — sized for the bracket (${describeSectionSizes(poolCounts(g.length, pools, poolOptsFor(gi)))}), ${totalByes(poolCounts(g.length, pools, poolOptsFor(gi)))} bye(s) in round 1`
                                  : " — seeds dealt A→B→B→A so pool strength stays level")}
                            </p>
                          )}
                          {g.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
                              Seed order:{" "}
                              {seedPreview(g as any)
                                .map((s) => `${s.seed}. ${s.name}${s.ladderPosition ? ` (#${s.ladderPosition})` : " (unranked)"}`)
                                .join("  ·  ")}
                            </p>
                          )}

                          {/* Each pool renders as its own block — pool A's
                              players, then pool B's — never one interleaved
                              list with alternating A/B badges. */}
                          {g.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic py-2">Drop players here</p>
                          )}
                          {poolBlocks(g, pools, poolOptsFor(gi)).map((block) => (
                            <div key={block.pool} className={pools > 1 ? "mb-2" : ""} data-pool={block.letter}>
                              {isSwissPools && pools > 1 && (
                                <div className={`mt-2 mb-1 px-2 py-1 rounded border text-[10px] font-semibold uppercase tracking-wide ${poolTint[block.pool % poolTint.length]}`}>
                                  Pool {block.letter} <span className="opacity-70 normal-case">({block.rows.length} players)</span>
                                </div>
                              )}
                              <SortableContext items={block.rows.map((r) => r.item.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                  {block.rows.map(({ item: p, seed }) => (
                                    <SortableRow key={p.id} id={p.id}>
                                      {pools > 1 && (
                                        <span className="text-[10px] text-muted-foreground w-5 shrink-0 tabular-nums" title="Seed within this division">{seed}.</span>
                                      )}
                                      <span className="flex-1 text-sm font-medium">{p.name || p.profiles?.name}</span>
                                      {!memberFitsLeague(p, (groupAssignments.get(p.id) ?? 0) + 1) && (
                                        <Badge variant="destructive" className="text-[10px]" title="This player does not match the category set for this league">
                                          {GENDER_LABELS[genderForLeague((groupAssignments.get(p.id) ?? 0) + 1)]}?
                                        </Badge>
                                      )}
                                      {p.ladder_position ? (
                                        <Badge variant="secondary" className="text-[10px]" title="Club ladder position — the seeding rank">#{p.ladder_position}</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40" title="No club ladder position — seeded after every ranked entrant">No ladder rank</Badge>
                                      )}
                                      <Select
                                        value={String(groupAssignments.get(p.id) ?? 0)}
                                        onValueChange={async (v) => {
                                          if (v === "__withdrawn") {
                                            if (confirm("Withdraw this player from the tournament?")) {
                                              await withdraw(p.id);
                                            }
                                            return;
                                          }
                                          const newMap = new Map(groupAssignments);
                                          newMap.set(p.id, Number(v));
                                          setGroupAssignments(newMap);
                                        }}
                                      >
                                        <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__withdrawn" className="text-destructive">Withdrawn / not playing</SelectItem>
                                          {Array.from({ length: numGroups }, (_, i) => (
                                            <SelectItem key={i} value={String(i)}>{groupLabels[String(i + 1)]?.trim() ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)]) ? groupLabels[String(i + 1)] : `League ${groupLabels[String(i + 1)]}`) : `League ${i + 1}`}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <ExtraDivisionsPicker
                                        playerId={p.id}
                                        primary={groupAssignments.get(p.id) ?? 0}
                                        extras={extraDivisions.get(p.id) ?? new Set<number>()}
                                        divisionLabels={Array.from({ length: numGroups }, (_, i) =>
                                          groupLabels[String(i + 1)]?.trim()
                                            ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)])
                                                ? groupLabels[String(i + 1)]
                                                : `League ${groupLabels[String(i + 1)]}`)
                                            : `League ${i + 1}`
                                        )}
                                        onToggle={(division, checked) => {
                                          setExtraDivisions((prev) => {
                                            const next = new Map(prev);
                                            const set = new Set(next.get(p.id) ?? []);
                                            if (checked) set.add(division);
                                            else set.delete(division);
                                            if (set.size === 0) next.delete(p.id);
                                            else next.set(p.id, set);
                                            return next;
                                          });
                                          // An admin placing a player by hand overrides the
                                          // division's source-league eligibility check.
                                          if (checked) setEligibilityOverrides((prev) => new Set(prev).add(p.id));
                                        }}
                                      />
                                    </SortableRow>
                                  ))}
                                </div>
                              </SortableContext>
                            </div>
                          ))}
                        </DroppableLeague>
                      );
                    })
                  );
                })()}

                {/* Accepted entrants who play in none of the divisions' source
                    leagues (typically open-invite acceptors). They are kept out
                    of the draw until the organiser places them explicitly. */}
                {!isDoubles && unassignedEntrantIds.length > 0 && (
                  <div className="border border-amber-500/40 bg-amber-500/5 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium">Unassigned — needs a league</span>
                      <span className="text-muted-foreground text-xs">({unassignedEntrantIds.length} players)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      These players accepted the invitation but do not play in any of the leagues chosen under
                      “Primarily players from” in Structure. Pick a league for each of them.
                    </p>
                    <div className="space-y-1">
                      {unassignedEntrantIds.map((id) => {
                        const p: any = (selectedPlayers as any[]).find((x) => x.id === id);
                        if (!p) return null;
                        return (
                          <div key={id} className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1.5">
                            <span className="flex-1 text-sm font-medium">{p.name || p.profiles?.name}</span>
                            {p.ladder_position ? (
                              <Badge variant="secondary" className="text-[10px]">#{p.ladder_position}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">No ladder rank</Badge>
                            )}
                            <Select
                              value=""
                              onValueChange={async (v) => {
                                if (v === "__withdrawn") {
                                  if (confirm("Withdraw this player from the tournament?")) {
                                    await withdraw(id);
                                  }
                                  return;
                                }
                                setGroupAssignments((prev) => new Map(prev).set(id, Number(v)));
                                setEligibilityOverrides((prev) => new Set(prev).add(id));
                                setUnassignedEntrantIds((prev) => prev.filter((x) => x !== id));
                              }}
                            >
                              <SelectTrigger className="w-32 h-7 text-xs">
                                <SelectValue placeholder="Assign…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__withdrawn" className="text-destructive">Withdrawn / not playing</SelectItem>
                                {Array.from({ length: numGroups }, (_, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    {groupLabels[String(i + 1)]?.trim()
                                      ? (/league|div|pool|grp|group/i.test(groupLabels[String(i + 1)]) ? groupLabels[String(i + 1)] : `League ${groupLabels[String(i + 1)]}`)
                                      : `League ${i + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </DndContext>

            {/* Visual draw / manual seeding for a knockout league. Nothing is
                written to the database here — the confirmed board is held in
                the wizard and used when the schedule is built. */}
            {drawEditor !== null && (() => {
              const gi = drawEditor;
              const gn = gi + 1;
              const raw = ((groups as any[])[gi] || []).map((p: any) => p.id) as string[];
              const ids = Array.from(
                new Set((isDoubles ? raw : eligibleIdsForDivision(gn, raw)).filter(Boolean)),
              );
              const sections = Math.min(sectionsForLeague(gn), Math.max(1, ids.length));
              const sectionIds = distributeIntoPools(ids, sections, {
                manual: manualSeedGroups.has(gi),
                knockout: true,
                mode: poolAllocation,
              }).filter((s) => s.length > 0);
              const suggested = suggestDrawBoard({
                groupNumber: gn,
                assignments: sectionIds.map((sIds, si) => ({
                  section: si + 1,
                  seeds: sIds.map((id, i) => ({ memberId: id, seed: i + 1 })),
                })),
                drawStyle: leagueDrawStyles[String(gn)] === "graduated" ? "graduated" : "straight",
              });
              const entrants: DrawEntrant[] = ids.map((id, i) => ({
                id,
                name: getEntityLabel(id),
                seed: i + 1,
              }));
              return (
                <ConfirmDrawDialog
                  open
                  onOpenChange={(o) => !o && setDrawEditor(null)}
                  champId={editingChampId || "draft"}
                  suggested={
                    manualDraws[String(gn)]
                      ? reconcileBoardWithEntrants(manualDraws[String(gn)], ids).board
                      : suggested
                  }
                  entrants={entrants}
                  multiSection={sectionIds.length > 1}
                  divisionLabel={groupLabels[String(gn)]?.trim() || `League ${gn}`}
                  title={`${groupLabels[String(gn)]?.trim() || `League ${gn}`} — first round draw`}
                  description="The engine has seeded the bracket. Drag players between slots to set the pairings you want, or empty a slot to give a bye. Fixtures are created when you save the tournament."
                  onConfirm={async (board) => {
                    const next = { ...manualDraws, [String(gn)]: board };
                    setManualDraws(next);
                    setDrawEditor(null);
                    // Persist straight away — a confirmed draw must survive a
                    // reopen even if the wizard is closed before saving.
                    if (editingChampId) {
                      const { error } = await fromExt("tournaments")
                        .update({ manual_draws: next } as any)
                        .eq("id", editingChampId);
                      if (error) {
                        toast.error("Draw saved locally but could not be stored — save the tournament to keep it");
                        return;
                      }
                      qc.invalidateQueries({ queryKey: ["club-champs"] });
                    }
                    toast.success("Draw saved — these exact pairings will be used");
                  }}

                />
              );
            })()}
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
                    {schedulingMode === "self" ? "" : ` · ${startTime || "—"}–${endTime || "—"}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {schedulingMode === "self" ? (
                      "Players arrange their own games — no fixed days or times"
                    ) : (
                      <>
                        Play days: {playDays.size > 0
                          ? Array.from(playDays).sort().map((i) => DAY_NAMES[i]).join(", ")
                          : "—"}
                      </>
                    )}
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



            {/* Self-scheduled knockout: nothing here applies — there are no
                slots to fill, no pool break and no finals slot to reserve. */}
            {simplifiedKnockoutSchedule ? (
              <div className="rounded-lg border border-dashed p-3 text-sm space-y-1">
                <p className="font-medium">Players arrange their own games</p>
                <p className="text-[11px] text-muted-foreground">
                  No time slots, courts, fill/spread mode or finals timing are needed. Set the current
                  round's play-by date on the Dates step — later rounds are configured once the current
                  round is complete.
                </p>
              </div>
            ) : (
            <>
            <WizardSection
              title={"Generation mode & playoff timing"}
              summary={`${scheduleMode === "fill" ? "Fill up" : "Spread"}${enablePlayoffs ? " · playoffs scheduled" : ""}`}
              complete={true}
              defaultOpen={true}
            >
            {/* Schedule density — fill vs spread. Court bookings are made on the final Review step. */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">How should games be scheduled?</p>
              <p className="text-[11px] text-muted-foreground">
                Controls how the generator fills the available time. You can rebuild the schedule after changing this.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                  scheduleMode === "fill" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                )}>
                  <input
                    type="radio"
                    name="schedule-mode"
                    className="mt-0.5"
                    checked={scheduleMode === "fill"}
                    onChange={() => setScheduleMode("fill")}
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Fill up games — finish as quickly as possible</div>
                    <div className="text-[11px] text-muted-foreground">
                      Packs every slot on the earliest day first. Later days are only used if needed — the tournament may finish in fewer days than selected.
                    </div>
                  </div>
                </label>
                <label className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                  scheduleMode === "spread" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                )}>
                  <input
                    type="radio"
                    name="schedule-mode"
                    className="mt-0.5"
                    checked={scheduleMode === "spread"}
                    onChange={() => setScheduleMode("spread")}
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Spread across available times</div>
                    <div className="text-[11px] text-muted-foreground">
                      Interleaves games evenly across all selected play-days so nobody is loaded onto a single day.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Playoff finishing options — only when at least one league runs playoffs */}
            {enablePlayoffs && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Playoff finishing options</p>
                  <p className="text-[11px] text-muted-foreground">
                    Fine-tune when the finals happen after the pool stage ends.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="playoff-break" className="text-xs">
                      Break after last pool match
                    </Label>
                    <div id="playoff-break" className="grid grid-cols-4 gap-1">
                      {[0, 15, 30, 45, 60, 90, 120].map((minutes) => (
                        <Button
                          key={minutes}
                          type="button"
                          size="sm"
                          variant={playoffBreakMinutes === minutes ? "default" : "outline"}
                          className="h-8 px-2 text-xs"
                          disabled={!!playoffDate}
                          onClick={() => setPlayoffBreakMinutes(minutes)}
                        >
                          {minutes === 0 ? "None" : minutes === 90 ? "1½h" : minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Applies to fill-mode when playoffs run on the same day as pool play.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="playoff-date" className="text-xs">
                      Play finals on a specific date (optional)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="playoff-date"
                        type="date"
                        className="h-9"
                        value={playoffDate}
                        min={startDate || undefined}
                        max={endDate || undefined}
                        onChange={(e) => setPlayoffDate(e.target.value)}
                      />
                      {playoffDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9"
                          onClick={() => setPlayoffDate("")}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Overrides the break setting — finals are forced onto this date.
                    </p>
                  </div>
                </div>
              </div>
            )}
            </WizardSection>

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
                              key={`slot-${gn}-${groupDurations[String(gn)] ?? ""}-${matchDuration}`}
                              type="number"
                              min={5}
                              max={120}
                              placeholder={String(matchDuration)}
                              defaultValue={groupDurations[String(gn)] ?? ""}
                              onBlur={(e) => {
                                const v = e.currentTarget.value;
                                setGroupDurations((prev) => {
                                  const next = { ...prev };
                                  applyGroups.forEach((g) => {
                                    if (v === "") delete next[String(g)];
                                    else next[String(g)] = Math.max(1, Number(v));
                                  });
                                  return next;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              className="h-7 text-xs w-16"
                            />
                            <span className="text-[10px] text-muted-foreground">slot</span>
                          </div>
                          <span className="text-muted-foreground text-xs">−</span>
                          <div className="flex items-center gap-1">
                            <Input
                              key={`break-${gn}-${groupBreakMinutes[String(gn)] ?? ""}-${defaultBreakMinutes}`}
                              type="number"
                              min={0}
                              max={30}
                              step={0.5}
                              placeholder={String(defaultBreakMinutes || 0)}
                              defaultValue={groupBreakMinutes[String(gn)] ?? ""}
                              onBlur={(e) => {
                                const v = e.currentTarget.value;
                                setGroupBreakMinutes((prev) => {
                                  const next = { ...prev };
                                  applyGroups.forEach((g) => {
                                    if (v === "") delete next[String(g)];
                                    else next[String(g)] = Math.max(0, Number(v));
                                  });
                                  return next;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
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








                  <div className="mt-3 flex items-start gap-2">
                    <input
                      id="avoid-b2b"
                      type="checkbox"
                      className="mt-1"
                      checked={avoidBackToBack}
                      onChange={(e) => setAvoidBackToBack(e.target.checked)}
                    />
                    <div className="flex-1">
                      <Label htmlFor="avoid-b2b" className="text-sm font-medium cursor-pointer">
                        Avoid back-to-back matches
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Never place a player in two matches in a row. A court will sit idle for a slot rather than pair a just-finished player. If a match can't fit within the session end, it stays unscheduled and you'll be warned — add time or a spare court.
                      </p>
                    </div>
                  </div>

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
            </>
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
              {schedulingMode === "self" ? (
                <p><strong>Scheduling:</strong> Players arrange their own games — no fixed days or times</p>
              ) : (
                <>
                  <p><strong>Days:</strong> {Array.from(playDays).sort().map((d) => DAY_NAMES[d]).join(", ")}</p>
                  <p><strong>Time:</strong> {startTime} – {endTime}{scoringMode === "time_capped_points" ? "" : ` (${matchDuration} min per match)`}</p>
                </>
              )}
              <p><strong>Courts:</strong> {Array.from(selectedCourtIds).map((id) => getCourtName(id)).join(", ")}</p>
              <p><strong>Format:</strong> {roundFormat === "double_round_robin" ? "Double round-robin (home & away)" : roundFormat === "cross_league" ? "League vs League (cross-league only)" : "Single round-robin"}{roundFormat === "double_round_robin" ? ` · Bye: ${byeHandling.replace(/_/g, " ")}` : ""}</p>
              <p><strong>Playoffs:</strong> {enablePlayoffs ? "Yes — position-based knockout after group stage" : "No"}</p>
              <p><strong>Final winner:</strong> {championScope === "pool" ? "One winner per pool" : "One champion per league — pool winners meet in the league final"}</p>
            </div>

            <Separator />

            {awaitingPlayerPairs && (
              <p className="text-sm text-muted-foreground rounded-lg border p-3">
                Save this tournament now. Once players have registered and confirmed partners, reopen it to generate groups and fixtures.
              </p>
            )}

            {!awaitingPlayerPairs && editingChampId && (
              <p className="text-xs text-muted-foreground rounded-lg border p-2 bg-muted/30">
                <strong>Rebuild Schedule</strong> recreates the <em>first</em> fixture list and tournament page entries using the leagues/pairs shown above — it does <em>not</em> change who's paired with whom or which league they're in, and it is <em>not</em> how you advance the draw. Later rounds are generated from <strong>Tournament progress</strong> below (and on the tournament page) once the current round is played. Court bookings are written separately via <strong>Make Court Bookings</strong>.
              </p>
            )}

            {editingChampId && (
              <TournamentProgressCard
                champId={editingChampId}
                canManage
                selfScheduled={schedulingMode === "self"}
                championScope={championScope}
                groupLabel={(gn) => groupLabels[String(gn)] || `League ${gn}`}
              />
            )}

            {editingChampId && <DrawLockCard champId={editingChampId} />}



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
                      <h4 className="font-medium mb-2">{getGroupLabel({ group_labels: groupLabels }, gi + 1)}</h4>
                      <div className="text-xs space-y-1">
                        {groupMatches.map((m, mi) => {
                          const bye = isByeEntity(m.entityA) || isByeEntity(m.entityB);
                          const player = isByeEntity(m.entityA) ? m.entityB : m.entityA;
                          return (
                            <div key={mi} className="flex items-center gap-2 p-1.5 rounded bg-muted/50">
                              <span className="text-muted-foreground w-20">{m.date ? format(new Date(m.date), "EEE dd MMM") : "TBD"}</span>
                              <span className="text-muted-foreground w-12">{m.time || "TBD"}</span>
                              {bye ? (
                                <>
                                  <span className="font-medium">{getEntityLabel(player)}</span>
                                  <Badge variant="secondary" className="text-[10px]">Bye — no match this round</Badge>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium">{getEntityLabel(m.entityA)}</span>
                                  <span className="text-muted-foreground">vs</span>
                                  <span className="font-medium">{getEntityLabel(m.entityB)}</span>
                                </>
                              )}
                              {m.courtId && !bye && <Badge variant="outline" className="ml-auto text-[10px]">{getCourtName(m.courtId)}</Badge>}
                            </div>
                          );
                        })}

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

      {/* ── STEP: PREVIEW SCHEDULE (post-rebuild) ── */}
      {step === "preview" && editingChampId && (
        <ChampSchedulePreview
          champId={editingChampId}
          onBack={() => setStep("review")}
          onFinalize={() => { setShowWizard(false); resetWizard(); }}
          onMakeBookings={() => createBookings.mutate()}
          isBooking={createBookings.isPending}
        />
      )}

      {/* Navigation */}
      {step !== "preview" && (
        <div className="flex justify-between items-center gap-2">
          <Button variant="outline" onClick={() => { if (stepIdx === 0) { setShowWizard(false); } else { setStep(activeSteps[stepIdx - 1]); void saveDraft(); } }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {stepIdx === 0 ? "Cancel" : "Back"}
          </Button>
          <Button variant="secondary" onClick={() => void handleManualSave()}>
            <Save className="w-4 h-4 mr-1" /> Save Progress
          </Button>
          {step === "review" ? (
            <Button
              onClick={() => {
                // A rebuild on a live tournament deletes and re-creates every
                // fixture — never let that happen on a single click.
                if (editingChampId && rebuildImpact.requiresConfirmation) {
                  setRebuildConfirmOpen(true);
                  return;
                }
                createChamp.mutate();
              }}
              disabled={createChamp.isPending}
            >
              {createChamp.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {awaitingPlayerPairs ? "Save Tournament" : editingChampId ? "Rebuild Schedule" : "Generate Schedule"}
            </Button>
          ) : (

            <Button
              onClick={handleNext}
              // Basics has only two visible choices — keep the button disabled
              // there. Every later step stays clickable so Next can scroll the
              // admin to whatever is still missing on that step.
              disabled={step === "category" && !canProceed()}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Rebuild confirmation — a live tournament must never be reshuffled by accident */}
      <Dialog open={rebuildConfirmOpen} onOpenChange={setRebuildConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rebuild this tournament's schedule?</DialogTitle>
            <DialogDescription>{rebuildImpact.summary}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {rebuildImpact.played > 0 && <li>· {rebuildImpact.played} played result(s) will be carried across</li>}
            {rebuildImpact.inProgress > 0 && (
              <li className="text-destructive">
                · {rebuildImpact.inProgress} match(es) are being marked right now — wait until they finish
              </li>
            )}
            {rebuildImpact.booked > 0 && <li>· {rebuildImpact.booked} player court booking(s) will be kept</li>}
            <li>· {rebuildImpact.pending} unplayed fixture(s) may be re-drawn</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebuildConfirmOpen(false)}>
              Keep current schedule
            </Button>
            <Button
              variant="destructive"
              disabled={createChamp.isPending || rebuildImpact.inProgress > 0}
              onClick={() => {
                setRebuildConfirmOpen(false);
                createChamp.mutate();
              }}
            >
              Rebuild anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>





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
        divisionFormats={inviteDivisionFormats()}
        selfScheduled={schedulingMode === "self"}
        roundDeadlines={roundDeadlines}
        inviteExtraDetails={inviteExtraDetails}
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
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");

  // For mixed doubles, show men for P1 and ladies for P2
  const isMixed = gender === "mixed";

  const nameOf = (m: any) => (m.name || m.profiles?.name || "").toLowerCase();

  const basePool1 = isMixed
    ? availablePlayers.filter((m) => m.gender && ["men", "male", "m"].includes(m.gender.toLowerCase()))
    : availablePlayers.filter((m) => m.id !== player2);

  const basePool2 = isMixed
    ? availablePlayers.filter((m) => m.gender && ["ladies", "female", "f", "women"].includes(m.gender.toLowerCase()))
    : availablePlayers.filter((m) => m.id !== player1);

  const MAX_VISIBLE = 50;
  const filtered1 = search1.trim()
    ? basePool1.filter((m) => nameOf(m).includes(search1.trim().toLowerCase()))
    : basePool1;
  const filtered2 = search2.trim()
    ? basePool2.filter((m) => nameOf(m).includes(search2.trim().toLowerCase()))
    : basePool2;
  const pool1 = filtered1.slice(0, MAX_VISIBLE);
  const pool2 = filtered2.slice(0, MAX_VISIBLE);
  const truncated1 = filtered1.length > MAX_VISIBLE;
  const truncated2 = filtered2.length > MAX_VISIBLE;

  const handleAdd = () => {
    if (player1 && player2 && player1 !== player2) {
      onAddPair(player1, player2);
      setPlayer1("");
      setPlayer2("");
      setSearch1("");
      setSearch2("");
    }
  };

  const renderColumn = (
    label: string,
    search: string,
    setSearch: (v: string) => void,
    pool: ClubMember[],
    filteredLen: number,
    truncated: boolean,
    selectedId: string,
    setSelected: (v: string) => void,
  ) => {
    const selectedMember = selectedId
      ? (pool.find((m) => m.id === selectedId) as any) ||
        (availablePlayers.find((m) => m.id === selectedId) as any)
      : null;
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <Input
          placeholder="Search name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
        {selectedId && selectedMember && (
          <div className="flex items-center justify-between rounded border bg-primary/10 border-primary/30 px-2 py-1 text-xs">
            <span className="truncate font-medium">{selectedMember.name || selectedMember.profiles?.name || getMemberName(selectedId)}</span>
            <button
              type="button"
              onClick={() => setSelected("")}
              className="text-muted-foreground hover:text-foreground ml-2"
              aria-label="Clear"
            >
              ×
            </button>
          </div>
        )}
        <div className="max-h-56 overflow-y-auto rounded border bg-background">
          {pool.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>
          ) : (
            pool.map((m) => {
              const isSel = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m.id)}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs hover:bg-accent",
                    isSel && "bg-primary/15 font-medium",
                  )}
                >
                  {m.name || (m as any).profiles?.name || "—"}
                </button>
              );
            })
          )}
          {truncated && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground border-t">
              Showing {MAX_VISIBLE} of {filteredLen} — type to narrow
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Add a pair</Label>
      <div className="grid grid-cols-2 gap-3">
        {renderColumn(isMixed ? "Player (Men)" : "Player 1", search1, setSearch1, pool1, filtered1.length, truncated1, player1, setPlayer1)}
        {renderColumn(isMixed ? "Player (Ladies)" : "Player 2", search2, setSearch2, pool2, filtered2.length, truncated2, player2, setPlayer2)}
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
  divisionFormats,
  selfScheduled,
  roundDeadlines,
  inviteExtraDetails,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentName: string;
  description: string;
  inviteExtraDetails?: string;
  methods: Set<"app" | "email" | "whatsapp">;
  gender: GenderCategory;
  matchType: "singles" | "doubles";
  scoringMode: string;
  roundFormat: "" | "single_round_robin" | "double_round_robin" | "cross_league" | "swiss";
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
  divisionFormats?: string[];
  selfScheduled?: boolean;
  roundDeadlines?: { label: string; date: string }[];
}) {
  const descHasDetails = /— Tournament details —/.test(description || "");
  const detailLines = descHasDetails ? [] : buildInviteDetailLines({
    gender, matchType, scoringMode, roundFormat, byeHandling, partnerMode,
    startDate, endDate, startTime, endTime, customizeDailySchedule, daySchedules,
    registrationOpensAt, registrationClosesAt, entryFeeRand,
    pointsPerGame, bestOf,
    registrationRequired, registrationMode,
    tournamentName, divisionFormats,
    selfScheduled, roundDeadlines,
  });

  const appBody =
    `You have been invited to ${tournamentName}.` +
    (detailLines.length ? `\n\n${detailLines.map((l) => `• ${l}`).join("\n")}` : "") +
    (description?.trim() ? `\n\n${description.trim()}` : "") +
    (inviteExtraDetails?.trim() ? `\n\n${inviteExtraDetails.trim()}` : "");



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Invite preview</DialogTitle>
          <p className="text-xs text-muted-foreground">
            How invited members will see this tournament. Delivery: {Array.from(methods).join(" + ") || "app"}.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto pr-1">
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
                {inviteExtraDetails?.trim() && (
                  <div className="text-sm whitespace-pre-wrap border-l-2 border-amber-500/40 pl-3 text-muted-foreground">
                    {inviteExtraDetails.trim()}
                  </div>
                )}
                <p>Tap the button below to register or decline.</p>
                <span className="inline-block text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground">
                  Accept / Register
                </span>
              </div>
              {!methods.has("email") && (
                <p className="text-[11px] text-muted-foreground italic">
                  Not sent by email — in-app only is selected.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
