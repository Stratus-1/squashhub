import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fromExt } from "@/lib/supabase-ext";
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
import { Calendar as CalendarIcon, Users, Trophy, ChevronRight, ChevronLeft, Loader2, Trash2, Eye, Pencil, Plus, X, GripVertical } from "lucide-react";
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

type WizardStep = "category" | "registration" | "players" | "groups" | "schedule" | "review";
type GenderCategory = "men" | "ladies" | "mixed" | "open";
type MatchType = "singles" | "doubles";

const STEPS: WizardStep[] = ["category", "registration", "players", "groups", "schedule", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  category: "Category",
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

  // Wizard state
  const [gender, setGender] = useState<GenderCategory>("men");
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [enablePlayoffs, setEnablePlayoffs] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [numGroups, setNumGroups] = useState(2);
  const [champName, setChampName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playDays, setPlayDays] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [matchDuration, setMatchDuration] = useState(30);
  const [scoringMode, setScoringMode] = useState<"standard" | "time_capped_points">("standard");
  const [groupDurations, setGroupDurations] = useState<Record<string, number>>({});
  const [roundFormat, setRoundFormat] = useState<"single_round_robin" | "double_round_robin">("single_round_robin");
  const [byeHandling, setByeHandling] = useState<"no_match" | "walkover_win" | "neutral">("no_match");
  const [selectedCourtIds, setSelectedCourtIds] = useState<Set<number>>(new Set());
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
  const [registrationMode, setRegistrationMode] = useState<"open" | "invite">("open");
  const [partnerMode, setPartnerMode] = useState<"admin" | "players">("admin");
  const [registrationOpensAt, setRegistrationOpensAt] = useState<string>("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState<string>("");
  const [entryFeeRand, setEntryFeeRand] = useState<string>("0");
  const [paymentMethods, setPaymentMethods] = useState<Set<"card" | "eft">>(new Set(["card"]));
  const [paymentRequired, setPaymentRequired] = useState<boolean>(true);
  const [inviteMethods, setInviteMethods] = useState<Set<"app" | "email">>(new Set(["app"]));
  // Controls WHEN invites go out: 'manual' (admin clicks Send later — default),
  // 'now' (prompt on save), or 'scheduled' (admin gets a reminder for the chosen date).
  const [inviteTiming, setInviteTiming] = useState<"manual" | "now" | "scheduled">("manual");
  const [inviteScheduledAt, setInviteScheduledAt] = useState<string>("");
  const [description, setDescription] = useState("");
  const [showInvitePreview, setShowInvitePreview] = useState(false);

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

  // Re-fetch & merge players whenever the league selection changes
  const applyLeaguePrefill = async (leagueIds: Set<string>) => {
    setSourceLeagueIds(leagueIds);
    if (leagueIds.size === 0) {
      setSelectedPlayerIds(new Set());
      return;
    }
    const { data: regs, error } = await fromExt("member_league_registrations")
      .select("club_member_id")
      .in("league_id", Array.from(leagueIds));
    if (error) {
      toast.error("Failed to load league players");
      return;
    }
    const ids = new Set<string>((regs || []).map((r: any) => r.club_member_id).filter(Boolean));
    setSelectedPlayerIds(ids);
    if (ids.size > 0) {
      toast.success(`Pre-filled ${ids.size} player${ids.size === 1 ? "" : "s"} from ${leagueIds.size} league${leagueIds.size === 1 ? "" : "s"}`);
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
  const selfPairInviteSelection = isDoubles && partnerMode === "players" && registrationMode === "invite";
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
      ? ["category", "registration", "players", "review"]
      : ["category", "registration", "review"];
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
    if (!clubId) return;
    if (!startDate || !endDate) return;
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
      group_durations: groupDurations,
      round_format: roundFormat,
      bye_handling: byeHandling,
      source_league_id: Array.from(sourceLeagueIds)[0] || null,
      source_league_ids: Array.from(sourceLeagueIds),
      registration_mode: registrationMode,
      partner_mode: partnerMode,
      registration_opens_at: registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
      registration_closes_at: registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
      entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
      payment_methods: Array.from(paymentMethods),
      payment_required: paymentRequired,
      invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
      include_visitors: includeVisitors,
      visitor_clubs: Array.from(selectedVisitorClubs),
      description: description.trim() || null,
    };
    try {
      if (editingChampId) {
        await fromExt("club_champs").update(payload).eq("id", editingChampId);
      } else {
        const { data, error } = await fromExt("club_champs")
          .insert({ club_id: clubId, status: "planning", ...payload })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setEditingChampId(data.id);
      }
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    } catch (e) {
      // Silent — don't block navigation on autosave failure
      console.warn("Tournament autosave failed:", e);
    }
  };

  const goToStep = (s: WizardStep) => {
    if (s === "players" && (step === "category" || step === "registration")) {
      // Don't override if league pre-fill already set the player list
      if (!isDoubles && !hasLeagueSelection) {
        const memberIds = genderMembers.map((m) => m.id);
        const visitorIds = filteredVisitors.map((v) => `visitor-${v.id}`);
        setSelectedPlayerIds(new Set([...memberIds, ...visitorIds]));
      }
    }
    if (s === "groups") {
      if (isDoubles) {
        // Auto-seed pair group assignments via snake draft
        const newMap = new Map<string, number>();
        doublesPairs.forEach((p, i) => {
          const cycle = Math.floor(i / numGroups);
          const idx = cycle % 2 === 0 ? i % numGroups : numGroups - 1 - (i % numGroups);
          newMap.set(p.id, idx);
        });
        setPairGroupAssignments(newMap);
      } else {
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
    const allDates = eachDayOfInterval({
      start: new Date(startDate),
      end: new Date(endDate),
    }).filter((d) => playDays.has(getDay(d)));

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const slotsPerSession = Math.floor((endMins - startMins) / matchDuration);

    const timeSlots: string[] = [];
    for (let i = 0; i < slotsPerSession; i++) {
      const mins = startMins + i * matchDuration;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      timeSlots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }

    const totalSlots = allDates.length * timeSlots.length * courtIds.length;

    type MatchDef = {
      groupNum: number; roundNum: number;
      entityA: string; entityB: string; // player ID or pair ID
      leg: "home" | "away" | null;
      isBye?: boolean;
      byeEntityId?: string;
      date?: string; time?: string; courtId?: number;
    };
    const allMatches: MatchDef[] = [];
    const fmt = roundFormat === "double_round_robin" ? "double" : "single";

    const ingestRounds = (gi: number, ids: string[]) => {
      const { rounds, byesPerRound } = generateRoundRobinRounds(ids, fmt);
      rounds.forEach((roundMatches, ri) => {
        roundMatches.forEach(([a, b, leg]) => {
          allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, entityA: a, entityB: b, leg });
        });
        // Record byes (only when there's actually an odd entity count and admin
        // wants them tracked). Walkover/neutral are scoring concerns; the schedule
        // simply notes who has the bye that round.
        const byeId = byesPerRound[ri];
        if (byeId && byeHandling !== "no_match") {
          allMatches.push({
            groupNum: gi + 1,
            roundNum: ri + 1,
            entityA: byeId,
            entityB: byeId,
            leg: null,
            isBye: true,
            byeEntityId: byeId,
          });
        }
      });
    };

    if (isDoubles) {
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

    // For doubles, also check individual players
    const getPlayersForEntity = (entityId: string): string[] => {
      if (!isDoubles) return [entityId];
      const pair = doublesPairs.find((p) => p.id === entityId);
      return pair ? [pair.player1Id, pair.player2Id] : [entityId];
    };

    type Slot = { date: string; time: string; courtId: number };
    const allSlots: Slot[] = [];
    for (const d of allDates) {
      const ds = format(d, "yyyy-MM-dd");
      for (const ts of timeSlots) {
        for (const cid of courtIds) {
          allSlots.push({ date: ds, time: ts, courtId: cid });
        }
      }
    }

    const isBellsMode = scoringMode === "time_capped_points" && isDoubles;

    if (isBellsMode) {
      // Bells: single-day, per-league time caps, auto-distribute courts across leagues,
      // rotate pairs across their league's assigned courts as the schedule progresses.
      const startDateOnly = format(new Date(startDate), "yyyy-MM-dd");
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
        // Weight courts by (matches × cap) so longer/larger leagues get more courts.
        const weights = leagues.map((gn) => byLeague.get(gn)!.length * capFor(gn));
        const totalW = weights.reduce((a, b) => a + b, 0) || 1;
        let allocs = leagues.map((_, i) =>
          Math.max(1, Math.floor((weights[i] / totalW) * courtIds.length))
        );
        let sum = allocs.reduce((a, b) => a + b, 0);
        // Trim excess from the largest allocation (never below 1).
        while (sum > courtIds.length) {
          let idx = 0;
          for (let i = 1; i < allocs.length; i++) if (allocs[i] > allocs[idx]) idx = i;
          if (allocs[idx] <= 1) break;
          allocs[idx]--; sum--;
        }
        // Hand out remaining courts to the league with the highest load per court.
        while (sum < courtIds.length) {
          let best = 0; let bestVal = -Infinity;
          for (let i = 0; i < leagues.length; i++) {
            const v = weights[i] / allocs[i];
            if (v > bestVal) { bestVal = v; best = i; }
          }
          allocs[best]++; sum++;
        }
        // If we have more leagues than courts, the trim loop leaves some at 1
        // and others starved — fall back to one court per league, leagues share.
        let cursor = 0;
        const leagueCourts = new Map<number, number[]>();
        leagues.forEach((gn, i) => {
          if (cursor >= courtIds.length) {
            // Share courts cyclically when court pool is too small.
            leagueCourts.set(gn, [courtIds[i % courtIds.length]]);
          } else {
            leagueCourts.set(
              gn,
              courtIds.slice(cursor, cursor + allocs[i])
            );
            cursor += allocs[i];
          }
        });

        // Assign date / time / court for each match. Pairs naturally rotate across
        // their league's courts because match index advances both court and round.
        for (const gn of leagues) {
          const cap = capFor(gn);
          const lCourts = leagueCourts.get(gn)!;
          const lMatches = byLeague.get(gn)!;
          lMatches.forEach((m, idx) => {
            const round = Math.floor(idx / lCourts.length);
            const courtIdx = idx % lCourts.length;
            const t = startMins + round * cap;
            const h = Math.floor(t / 60);
            const mm = t % 60;
            m.date = startDateOnly;
            m.time = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            m.courtId = lCourts[courtIdx];
          });
        }
      }
    } else {
      const usedSlots = new Set<number>();
      for (const match of allMatches) {
        // Bye placeholders don't get a court / slot.
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
  }, [groups, isDoubles, doublesPairs, startDate, endDate, playDays, selectedCourtIds, startTime, endTime, matchDuration, roundFormat, byeHandling, scoringMode, groupDurations]);

  // Create/update champ
  const createChamp = useMutation({
    mutationFn: async () => {
      if (!schedulePreview && !awaitingPlayerPairs) throw new Error("No schedule generated");

      let champId: string;
      const defaultName = `${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Tournament ${new Date().getFullYear()}`;

      if (editingChampId) {
        const { data: oldMatches } = await fromExt("club_champs_matches")
          .select("scheduled_date, scheduled_time, court_id, player_a_member_id, player_b_member_id")
          .eq("champ_id", editingChampId);
        if (oldMatches && oldMatches.length > 0) {
          const memberIds = [...new Set(oldMatches.flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id]))];
          const { data: memberUsers } = await fromExt("club_members").select("id, user_id").in("id", memberIds);
          const memberMap = new Map((memberUsers || []).map((m: any) => [m.id, m.user_id]));
          for (const m of oldMatches) {
            const userId = memberMap.get(m.player_a_member_id);
            if (!userId || !m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
            await fromExt("bookings").delete()
              .eq("user_id", userId).eq("date", m.scheduled_date)
              .eq("start_time", m.scheduled_time).eq("court_id", m.court_id);
          }
        }
        await fromExt("club_champs_matches").delete().eq("champ_id", editingChampId);
        await fromExt("club_champs_entries").delete().eq("champ_id", editingChampId);

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
            group_durations: groupDurations,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: registrationMode,
            partner_mode: partnerMode,
            registration_opens_at: registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
            registration_closes_at: registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
            include_visitors: includeVisitors,
            visitor_clubs: Array.from(selectedVisitorClubs),
            description: description.trim() || null,
          })
          .eq("id", editingChampId);
        if (updateErr) throw updateErr;
        champId = editingChampId;
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
            group_durations: groupDurations,
            round_format: roundFormat,
            bye_handling: byeHandling,
            source_league_id: Array.from(sourceLeagueIds)[0] || null,
            source_league_ids: Array.from(sourceLeagueIds),
            registration_mode: registrationMode,
            partner_mode: partnerMode,
            registration_opens_at: registrationOpensAt ? new Date(registrationOpensAt).toISOString() : null,
            registration_closes_at: registrationClosesAt ? new Date(registrationClosesAt).toISOString() : null,
            entry_fee_cents: Math.max(0, Math.round(Number(entryFeeRand) * 100) || 0),
            payment_methods: Array.from(paymentMethods),
            payment_required: paymentRequired,
            invite_methods: Array.from(inviteMethods.size > 0 ? inviteMethods : new Set(["app"])),
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
        if (registrationMode === "invite") {
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

      // Create entries
      if (isDoubles) {
        const entries = doublesPairs.flatMap((pair) => {
          const gi = pairGroupAssignments.get(pair.id) ?? 0;
          return [
            {
              champ_id: champId,
              club_member_id: toDbId(pair.player1Id),
              partner_member_id: toDbId(pair.player2Id),
              group_number: gi + 1,
            },
          ];
        });
        const { error: entryErr } = await fromExt("club_champs_entries").insert(entries);
        if (entryErr) throw entryErr;
      } else {
        const entries = (groups as ClubMember[][]).flatMap((groupPlayers, gi) =>
          groupPlayers.map((p) => ({
            champ_id: champId,
            club_member_id: toDbId(p.id),
            group_number: gi + 1,
          }))
        );
        const { error: entryErr } = await fromExt("club_champs_entries").insert(entries);
        if (entryErr) throw entryErr;
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

      // Auto-book courts
      const memberUserMap = new Map<string, string>();
      members.forEach((m) => { if (m.user_id) memberUserMap.set(m.id, m.user_id); });

      const bookings = schedulePreview.allMatches
        .filter((m) => !m.isBye && m.date && m.time && m.courtId)
        .map((m) => {
          let bookerId: string | undefined;
          if (isDoubles) {
            const pairA = pairMap.get(m.entityA);
            bookerId = pairA ? memberUserMap.get(pairA.player1Id) : undefined;
          } else {
            bookerId = memberUserMap.get(m.entityA);
          }
          if (!bookerId) return null;

          const [h, min] = m.time!.split(":").map(Number);
          // Bells: each league has its own time cap (group_durations[league]).
          const isBellsMode = scoringMode === "time_capped_points" && isDoubles;
          const cap = isBellsMode
            ? (Number(groupDurations[String(m.groupNum)]) || matchDuration)
            : matchDuration;
          const endMins = h * 60 + min + cap;
          const endH = Math.floor(endMins / 60);
          const endM = endMins % 60;
          const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          return {
            user_id: bookerId,
            court_id: m.courtId!,
            date: m.date!,
            start_time: m.time!,
            end_time: endTimeStr,
            status: "active",
            is_friendly: false,
          };
        })
        .filter(Boolean);

      if (bookings.length > 0) {
        const { error: bookErr } = await fromExt("bookings").insert(bookings);
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
      const isNewInvite = !editingChampId && awaitingPlayerPairs && registrationMode === "invite";
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
    onError: (err: any) => toast.error(err.message || "Failed to create tournament"),
  });

  // Shared helper: send invite notifications (and flag rows as invited) for a champ.
  // Used by both the post-create prompt and the "Send / Re-send invites" button.
  async function sendChampInvites(champId: string, opts?: { confirm?: boolean }) {
    try {
      if (opts?.confirm && !confirm("Send invite notification/email to all invited members now?")) return;

      // If the wizard is currently open editing this tournament in invite mode,
      // ensure the registrations table reflects the latest audience selection
      // BEFORE we read it. This guarantees that newly-added invitees (e.g. after
      // an admin expanded the audience from a shortlist to "all members") get a
      // registration row and therefore receive the invite. We only insert
      // missing rows — existing rows (paid / cancelled / etc.) are left intact.
      const shouldBackfillOpenAudience = editingChampId === champId && registrationMode === "open";
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
      const rows = (regs || []).filter((r: any) =>
        r.club_member_id && !SKIP_STATUSES.has(String(r.status || "").toLowerCase())
      );
      if (rows.length === 0) {
        toast.info("No pending invitees to notify — everyone has already registered or cancelled.");
        return;
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
      const msg = `You have been invited to ${champName || "a tournament"}.` +
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
        read: !sendApp,
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
    }
  }


  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; withBookings: boolean } | null>(null);
  const [registrationsChamp, setRegistrationsChamp] = useState<any | null>(null);

  const deleteChamp = useMutation({
    mutationFn: async ({ id, withBookings }: { id: string; withBookings: boolean }) => {
      if (withBookings) {
        const { data: champMatches } = await fromExt("club_champs_matches")
          .select("scheduled_date, scheduled_time, court_id, player_a_member_id, player_b_member_id")
          .eq("champ_id", id);
        if (champMatches && champMatches.length > 0) {
          const memberIds = [...new Set(champMatches.flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id]))];
          const { data: memberUsers } = await fromExt("club_members").select("id, user_id").in("id", memberIds);
          const memberMap = new Map((memberUsers || []).map((m: any) => [m.id, m.user_id]));
          for (const m of champMatches) {
            const userId = memberMap.get(m.player_a_member_id);
            if (!userId || !m.scheduled_date || !m.scheduled_time || !m.court_id) continue;
            await fromExt("bookings").delete()
              .eq("user_id", userId).eq("date", m.scheduled_date)
              .eq("start_time", m.scheduled_time).eq("court_id", m.court_id);
          }
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

  const resetWizard = () => {
    setStep("category");
    setGender("men");
    setMatchType("singles");
    setEnablePlayoffs(false);
    setNumGroups(2);
    setChampName("");
    setStartDate("");
    setEndDate("");
    setPlayDays(new Set());
    setStartTime("18:00");
    setEndTime("20:00");
    setMatchDuration(30);
    setScoringMode("standard");
    setGroupDurations({});
    setRoundFormat("single_round_robin");
    setByeHandling("no_match");
    setSelectedCourtIds(new Set());
    setGroupAssignments(new Map());
    setDoublesPairs([]);
    setPairGroupAssignments(new Map());
    setSourceLeagueIds(new Set());
    setRegistrationMode("open");
    setPartnerMode("admin");
    setRegistrationOpensAt("");
    setRegistrationClosesAt("");
    setEntryFeeRand("0");
    setPaymentMethods(new Set(["card"]));
    setPaymentRequired(true);
    setInviteMethods(new Set(["app"]));
    setInviteTiming("manual");
    setInviteScheduledAt("");
    setDescription("");
    setIncludeVisitors(false);
    setSelectedVisitorClubs(new Set());
    setEditingChampId(null);
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
    setMatchDuration(champ.match_duration_minutes || 30);
    setScoringMode(((champ as any).scoring_mode as any) || "standard");
    setGroupDurations(((champ as any).group_durations as Record<string, number>) || {});
    setRoundFormat((champ.round_format as any) || "single_round_robin");
    setByeHandling((champ.bye_handling as any) || "no_match");
    const initialLeagueIds: string[] = Array.isArray(champ.source_league_ids) && champ.source_league_ids.length > 0
      ? champ.source_league_ids
      : (champ.source_league_id ? [champ.source_league_id] : []);
    setSourceLeagueIds(new Set(initialLeagueIds));
    setRegistrationMode((champ.registration_mode as any) || "open");
    setPartnerMode((champ.partner_mode as any) || "admin");
    setRegistrationOpensAt(champ.registration_opens_at ? new Date(champ.registration_opens_at).toISOString().slice(0,16) : "");
    setRegistrationClosesAt(champ.registration_closes_at ? new Date(champ.registration_closes_at).toISOString().slice(0,16) : "");
    setEntryFeeRand(((champ.entry_fee_cents || 0) / 100).toString());
    setPaymentMethods(new Set(((champ.payment_methods || ["card"]) as ("card"|"eft")[])));
    setPaymentRequired(champ.payment_required !== false);
    setInviteMethods(new Set(((champ.invite_methods || ["app"]) as ("app"|"email")[])));
    setIncludeVisitors(!!champ.include_visitors);
    setSelectedVisitorClubs(new Set((champ.visitor_clubs as string[] | null) || []));
    setDescription(champ.description || "");

    const { data: entries } = await fromExt("club_champs_entries")
      .select("*")
      .eq("champ_id", champ.id);

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
        const assignments = new Map<string, number>();
        pairs.forEach((p, i) => {
          const entry = entries[i];
          assignments.set(p.id, (entry as any).group_number - 1);
        });
        setPairGroupAssignments(assignments);
      } else {
        setSelectedPlayerIds(new Set(entries.map((e: any) => e.club_member_id)));
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

    const { data: champMatches } = await fromExt("club_champs_matches")
      .select("court_id")
      .eq("champ_id", champ.id);
    if (champMatches) {
      const courtIds = new Set(champMatches.map((m: any) => m.court_id).filter(Boolean) as number[]);
      setSelectedCourtIds(courtIds);
    }

    // Open the wizard at step 1 so admin can review/edit every step.
    setStep("category");
    setShowWizard(true);
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

  const canProceed = () => {
    switch (step) {
      case "category": return true;
      case "registration":
        if (!startDate || !endDate) return false;
        if (new Date(endDate) < new Date(startDate)) return false;
        if (Number(entryFeeRand) > 0 && paymentMethods.size === 0) return false;
        if (registrationOpensAt && registrationClosesAt && new Date(registrationClosesAt) <= new Date(registrationOpensAt)) return false;
        return true;
      case "players":
        if (selfPairInviteSelection) return selectedPlayerIds.size >= 2;
        if (isDoubles) return doublesPairs.length >= 2;
        return selectedPlayerIds.size >= 3;
      case "groups":
        return numGroups >= 1 && numGroups <= Math.floor(entityCount / 2);
      case "schedule":
        if (awaitingPlayerPairs) return startDate && endDate && playDays.size > 0 && selectedCourtIds.size > 0;
        return startDate && endDate && playDays.size > 0 && selectedCourtIds.size > 0 && schedulePreview && schedulePreview.totalSlots >= schedulePreview.totalMatches;
      case "review": return true;
      default: return false;
    }
  };

  // ── LIST VIEW ──
  if (!showWizard) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Club Tournaments</h2>
          <Button onClick={() => { resetWizard(); setShowWizard(true); }}>
            <Trophy className="w-4 h-4 mr-2" /> Plan New Tournament
          </Button>
        </div>

        {champsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : existingChamps.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No tournaments planned yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {existingChamps.map((c: any) => (
              <Card key={c.id}>
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
                    <Button variant="outline" size="sm" onClick={() => setRegistrationsChamp(c)}>
                      <UsersIcon className="w-4 h-4 mr-1" /> Registrations
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadChampForEdit(c)}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ id: c.id, withBookings: true })}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
              <Label className="text-sm font-medium mb-2 block">Gender Category</Label>
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
              <Label className="text-sm font-medium mb-2 block">Match Type</Label>
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

            <div>
              <Label>Championship Name (optional)</Label>
              <Input
                placeholder={`${GENDER_LABELS[gender]} ${isDoubles ? "Doubles" : "Singles"} Club Champs ${new Date().getFullYear()}`}
                value={champName}
                onChange={(e) => setChampName(e.target.value)}
              />
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
            {/* Registration mode */}
            <div className="space-y-2">
              <Label className="text-sm">Who can register?</Label>
              <Select value={registrationMode} onValueChange={(v) => setRegistrationMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open — any eligible club member</SelectItem>
                  <SelectItem value="invite">Invite-only — admin shortlists members</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Invite methods */}
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

            {/* Invite send timing */}
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



            {/* Tournament description / invite body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Tournament details (shown in invites)</Label>
                <div className="flex gap-2">
                  {editingChampId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => sendChampInvites(editingChampId, { confirm: true })}
                    >
                      Send / Re-send invites
                    </Button>
                  )}
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
                rows={5}
                placeholder={`E.g.\nFormat: Round robin → top 2 to playoffs\nVenue: Main courts, 18:00 start\nPrizes: Trophy + R500 voucher\nDress code: Club shirts\nQueries: contact the captain`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Appears inside the in-app notification and the email invitation. Creating or saving the tournament does NOT auto-notify — use "Send / Re-send invites" above.
              </p>
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
                    // Workaround: Radix Select scroll-lock can reset the page scroll
                    // position. Capture and restore it on the next tick.
                    const y = window.scrollY;
                    requestAnimationFrame(() => window.scrollTo({ top: y }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} onCloseAutoFocus={(e) => e.preventDefault()}>
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

            {/* Tournament dates */}
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
            <p className="text-xs text-muted-foreground -mt-1">Shown to invitees so they know when the tournament will be played.</p>

            {/* Registration window */}
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


            {/* Entry fee */}
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

            {/* Payment methods */}
            {Number(entryFeeRand) > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Accepted payment methods</Label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={paymentMethods.has("card")}
                        onCheckedChange={(c) => {
                          const next = new Set(paymentMethods);
                          c ? next.add("card") : next.delete("card");
                          setPaymentMethods(next);
                        }}
                      />
                      Card (online)
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={paymentMethods.has("eft")}
                        onCheckedChange={(c) => {
                          const next = new Set(paymentMethods);
                          c ? next.add("eft") : next.delete("eft");
                          setPaymentMethods(next);
                        }}
                      />
                      EFT (admin marks paid)
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch id="payment-required" checked={paymentRequired} onCheckedChange={setPaymentRequired} />
                  <Label htmlFor="payment-required" className="text-sm">
                    Player must pay before they qualify to play
                  </Label>
                </div>
              </>
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
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {allSelectablePlayers.map((m: any, i: number) => (
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
                ))}
              </div>
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
              <Select value={String(numGroups)} onValueChange={(v) => {
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
                <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.floor(entityCount / 2) }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} league{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              {isDoubles ? "Pairs" : "Players"} are auto-distributed by order. Drag a row into another league to move it, drag within a league to reorder, or use the dropdown.
            </p>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCrossLeagueDragEnd}>
              <div className="space-y-4">
                {isDoubles ? (
                  (groups as DoublePair[][]).map((g, gi) => (
                    <DroppableLeague key={gi} id={`league-${gi}`} className="border rounded-lg p-3 min-h-[60px] transition-colors">
                      <h4 className="font-medium text-sm mb-2">League {gi + 1} <span className="text-muted-foreground font-normal">({g.length} pairs)</span></h4>
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
                                    <SelectItem key={i} value={String(i)}>League {i + 1}</SelectItem>
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
                      <h4 className="font-medium text-sm mb-2">League {gi + 1} <span className="text-muted-foreground font-normal">({g.length} players)</span></h4>
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
                                    <SelectItem key={i} value={String(i)}>League {i + 1}</SelectItem>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(parseISO(startDate), "dd MMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={startDate ? parseISO(startDate) : undefined}
                      onSelect={(d) => d && setStartDate(format(d, "yyyy-MM-dd"))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(parseISO(endDate), "dd MMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={endDate ? parseISO(endDate) : undefined}
                      onSelect={(d) => d && setEndDate(format(d, "yyyy-MM-dd"))}
                      disabled={(d) => startDate ? d < parseISO(startDate) : false}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Play Days</Label>
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div><Label>Start Time</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
              <div><Label>End Time</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
              <div>
                <Label>Match Duration</Label>
                <Select value={String(matchDuration)} onValueChange={(v) => setMatchDuration(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scoring format — driven by the tournament-format registry */}
            <div className="rounded-lg border p-3 bg-muted/30 space-y-3">
              <div>
                <Label className="text-sm font-medium">Scoring format</Label>
                <Select
                  value={scoringMode}
                  onValueChange={(v) => {
                    const fmt = getTournamentFormat(v);
                    setScoringMode(v as any);
                    // Format-driven match-type lock (Bells requires doubles).
                    if (fmt.requiresDoubles && matchType !== "doubles") {
                      setMatchType("doubles");
                    }
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {listTournamentFormats().map((fmt) => (
                      <SelectItem key={fmt.key} value={fmt.key}>{fmt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {getTournamentFormat(scoringMode).description}
                </p>
                {getTournamentFormat(scoringMode).requiresDoubles && !isDoubles && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    This format requires doubles — match type will be set to Doubles.
                  </p>
                )}
              </div>

              {scoringMode === "time_capped_points" && numGroups > 0 && (
                <div>
                  <Label className="text-sm font-medium">Time cap per league (minutes)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {Array.from({ length: numGroups }, (_, i) => i + 1).map((gn) => (
                      <div key={gn} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">League {gn}</span>
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
                              if (v === "") delete next[String(gn)];
                              else next[String(gn)] = Math.max(1, Number(v));
                              return next;
                            });
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Leave blank to fall back to the default Match Duration above.
                  </p>
                </div>
              )}
            </div>



            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-3 bg-muted/30">
              <div>
                <Label className="text-sm font-medium">Round Format</Label>
                <Select value={roundFormat} onValueChange={(v) => setRoundFormat(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_round_robin">Single round-robin (each plays once)</SelectItem>
                    <SelectItem value="double_round_robin">Double round-robin (home &amp; away, 2 rounds)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {roundFormat === "double_round_robin"
                    ? "All teams play one another twice — first round home, second round away."
                    : "All teams play one another once."}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Bye Handling</Label>
                <Select value={byeHandling} onValueChange={(v) => setByeHandling(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
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
              <Label>Available Courts</Label>
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
              </div>
            </div>

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
          <p><strong>{isDoubles ? "Pairs" : "Players"}:</strong> {awaitingPlayerPairs ? `${registrationMode === "invite" ? selectedPlayerIds.size : "Open"} registrations before scheduling` : `${entityCount} in ${numGroups} league${numGroups > 1 ? "s" : ""}`}</p>
              <p><strong>Period:</strong> {startDate} to {endDate}</p>
              <p><strong>Days:</strong> {Array.from(playDays).sort().map((d) => DAY_NAMES[d]).join(", ")}</p>
              <p><strong>Time:</strong> {startTime} – {endTime} ({matchDuration} min per match)</p>
              <p><strong>Courts:</strong> {Array.from(selectedCourtIds).map((id) => getCourtName(id)).join(", ")}</p>
              <p><strong>Format:</strong> {roundFormat === "double_round_robin" ? "Double round-robin (home & away)" : "Single round-robin"}{roundFormat === "double_round_robin" ? ` · Bye: ${byeHandling.replace(/_/g, " ")}` : ""}</p>
              <p><strong>Playoffs:</strong> {enablePlayoffs ? "Yes — position-based knockout after group stage" : "No"}</p>
            </div>

            <Separator />

            {awaitingPlayerPairs && (
              <p className="text-sm text-muted-foreground rounded-lg border p-3">
                Save this tournament now. Once players have registered and confirmed partners, reopen it to generate groups and fixtures.
              </p>
            )}

            {!awaitingPlayerPairs && schedulePreview && (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {Array.from({ length: numGroups }, (_, gi) => {
                  const groupMatches = schedulePreview.allMatches.filter((m) => m.groupNum === gi + 1);
                  return (
                    <div key={gi}>
                      <h4 className="font-medium mb-2">Group {gi + 1}</h4>
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
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => { if (stepIdx === 0) { setShowWizard(false); } else { setStep(activeSteps[stepIdx - 1]); void saveDraft(); } }}>
          <ChevronLeft className="w-4 h-4 mr-1" /> {stepIdx === 0 ? "Cancel" : "Back"}
        </Button>
        {step === "review" ? (
          <Button onClick={() => createChamp.mutate()} disabled={createChamp.isPending}>
            {createChamp.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {awaitingPlayerPairs ? "Save Tournament" : editingChampId ? "Regenerate Matches" : "Generate Matches"}
          </Button>
        ) : (
          <Button onClick={() => goToStep(activeSteps[stepIdx + 1])} disabled={!canProceed()}>
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
        startDate={startDate}
        endDate={endDate}
        entryFeeRand={entryFeeRand}
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
  startDate,
  endDate,
  entryFeeRand,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentName: string;
  description: string;
  methods: Set<"app" | "email">;
  startDate: string;
  endDate: string;
  entryFeeRand: string;
}) {
  const fee = Number(entryFeeRand) || 0;
  const dateLine =
    startDate && endDate
      ? startDate === endDate
        ? `Date: ${startDate}`
        : `Dates: ${startDate} → ${endDate}`
      : null;
  const feeLine = fee > 0 ? `Entry fee: R${fee.toFixed(2)}` : "Entry fee: Free";

  const appBody =
    `You have been invited to ${tournamentName}.` +
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
              {(dateLine || feeLine) && (
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {dateLine && <li>{dateLine}</li>}
                  <li>{feeLine}</li>
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
