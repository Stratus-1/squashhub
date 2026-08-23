import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ArrowRight, Check, Users, Shuffle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useLeagueAssociations, useLeagues, useClubMembers, type ClubMember } from "@/hooks/use-club";
import { useAssociationRules } from "@/hooks/use-association-rules";
import { inheritLeagueConfig, teamSetupQuestions, buildTeamAllocation } from "@/lib/leagues/team-setup";
import { CATEGORY_LABELS, DISCIPLINE_LABELS, type CompetitionCategory } from "@/lib/leagues/category";

type Gender = "men" | "ladies" | "mixed" | "open";
type Distribution = "snake" | "rotation" | "reverse_snake";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "ladies", label: "Ladies" },
  { value: "mixed", label: "Mixed" },
  // Open = any eligible player regardless of gender; deliberately distinct from Mixed.
  { value: "open", label: "Open" },
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const TEAM_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const DISTRIBUTIONS: { value: Distribution; title: string; example: string }[] = [
  {
    value: "snake",
    title: "Snake draft (zig-zag)",
    example: "Round 1: T1 → T2 → T3 • Round 2: T3 → T2 → T1 • Round 3: T1 → T2 → T3 — balances team strength evenly.",
  },
  {
    value: "rotation",
    title: "Pure rotation (top-down)",
    example: "Round 1: T1 → T2 → T3 • Round 2: T1 → T2 → T3 — Team 1 always gets the top picks per round.",
  },
  {
    value: "reverse_snake",
    title: "Reverse snake",
    example: "Round 1: T3 → T2 → T1 • Round 2: T1 → T2 → T3 — weakest team gets first pick first.",
  },
];

function isMaleGender(g?: string | null) { return (g || "").toLowerCase().startsWith("m") || (g || "").toLowerCase() === "male"; }
function isFemaleGender(g?: string | null) { return (g || "").toLowerCase().startsWith("f") || (g || "").toLowerCase() === "female"; }

function filterByGender(members: ClubMember[], gender: Gender): ClubMember[] {
  if (gender === "men") return members.filter(m => isMaleGender((m as any).gender));
  if (gender === "ladies") return members.filter(m => isFemaleGender((m as any).gender));
  return members;
}

/** Build the draft order across rounds for chosen distribution. Returns array of team indexes per pick. */
function buildDraftOrder(numTeams: number, totalPicks: number, mode: Distribution): number[] {
  const order: number[] = [];
  let round = 0;
  while (order.length < totalPicks) {
    let seq: number[];
    if (mode === "rotation") seq = Array.from({ length: numTeams }, (_, i) => i);
    else if (mode === "snake") seq = round % 2 === 0 ? Array.from({ length: numTeams }, (_, i) => i) : Array.from({ length: numTeams }, (_, i) => numTeams - 1 - i);
    else seq = round % 2 === 0 ? Array.from({ length: numTeams }, (_, i) => numTeams - 1 - i) : Array.from({ length: numTeams }, (_, i) => i);
    for (const t of seq) {
      if (order.length >= totalPicks) break;
      order.push(t);
    }
    round++;
  }
  return order;
}

export function StepByStepLeagueSetup({ clubId, open, onOpenChange, editContext }: {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /**
   * When set, the wizard opens pre-filled to edit an existing league group
   * (one specific association+gender+leagueNumber). Saving overwrites the
   * matching league rows.
   */
  editContext?: {
    associationId: string;
    gender: Gender;
    leagueNumber: string;
    numTeams: number;
    perTeam: number;
    reserves: number;
    teamNames: Record<number, string>;
    reservesName: string;
  } | null;
}) {
  const qc = useQueryClient();
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const { data: members = [] } = useClubMembers(clubId);

  const [step, setStep] = useState(1);
  const [associationId, setAssociationId] = useState<string>("");
  const [gender, setGender] = useState<Gender>("men");
  const [leagueNumber, setLeagueNumber] = useState<string>("1st");
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());
  const [startPosition, setStartPosition] = useState<number>(1);
  const [numMembers, setNumMembers] = useState<number>(0);
  const [numTeams, setNumTeams] = useState<number>(1);
  const [perTeam, setPerTeam] = useState<number>(4);
  const [reserves, setReserves] = useState<number>(0);
  const [distribution, setDistribution] = useState<Distribution>("snake");
  const [singlesRubbers, setSinglesRubbers] = useState<number>(0);
  const [doublesRubbers, setDoublesRubbers] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  // Track member IDs allocated to a saved league this session (so they're excluded from later rounds)
  const [allocatedIds, setAllocatedIds] = useState<Set<string>>(new Set());
  // Summary of leagues set up so far this session
  const [sessionSummary, setSessionSummary] = useState<Array<{ label: string; count: number }>>([]);
  // After-save view: show success + "set up another league" / "finish" choices
  const [savedLastRound, setSavedLastRound] = useState(false);
  // Custom team names keyed by team index (0..numTeams-1). Empty string = use default.
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [reservesName, setReservesName] = useState<string>("");

  // Reset state when dialog re-opens
  useEffect(() => {
    if (open) {
      if (editContext) {
        // Edit mode: jump straight to step 4 with values pre-filled.
        setStep(4);
        setAssociationId(editContext.associationId);
        setGender(editContext.gender);
        setLeagueNumber(editContext.leagueNumber);
        setStartPosition(1);
        setNumTeams(editContext.numTeams);
        setPerTeam(editContext.perTeam);
        setReserves(editContext.reserves);
        setNumMembers(editContext.numTeams * editContext.perTeam + editContext.reserves);
        setDistribution("snake");
        setAllocatedIds(new Set());
        setSessionSummary([]);
        setSavedLastRound(false);
        setTeamNames(editContext.teamNames || {});
        setReservesName(editContext.reservesName || "");
      } else {
        setStep(1);
        setAssociationId("");
        setGender("men");
        setLeagueNumber("1st");
        setStartPosition(1);
        setNumMembers(0);
        setNumTeams(1);
        setPerTeam(4);
        setReserves(0);
        setDistribution("snake");
        setAllocatedIds(new Set());
        setSessionSummary([]);
        setSavedLastRound(false);
        setTeamNames({});
        setReservesName("");
      }
    }
  }, [open, editContext]);

  // Source of truth for who's "in" an association = active rows in
  // `member_association_affiliations` (mirrors what Edit Profile / Edit Member writes).
  const { data: activeAffiliatedIds = [] } = useQuery({
    queryKey: ["sbs-active-affiliated", clubId, associationId],
    enabled: open && !!associationId,
    queryFn: async () => {
      const { data, error } = await fromExt("member_association_affiliations")
        .select("club_member_id")
        .eq("association_id", associationId)
        .eq("active", true);
      if (error) throw error;
      return (data || []).map((r: any) => r.club_member_id as string);
    },
  });
  const activeAffiliatedSet = useMemo(() => new Set<string>(activeAffiliatedIds), [activeAffiliatedIds]);

  /* ── Step 1 inheritance ────────────────────────────────────────────────
   * Discipline, competition category, rubber composition and pairing policy
   * are defined ONCE when the league is created. This wizard inherits them
   * and never re-asks those questions.                                     */
  const associationRow = associations.find((a: any) => a.id === associationId) as any;
  const { data: leagueRules } = useAssociationRules(associationId || undefined);
  const inherited = useMemo(
    () => inheritLeagueConfig(associationRow, leagueRules as any),
    [associationRow, leagueRules],
  );
  const questions = useMemo(
    () => teamSetupQuestions(inherited, leagueRules as any),
    [inherited, leagueRules],
  );

  // Category is a league-level attribute — mirror it into the local pool filter.
  useEffect(() => {
    const c = inherited.category as CompetitionCategory | null;
    if (!c) return;
    setGender(c === "mens" ? "men" : c === "ladies" ? "ladies" : c === "mixed" ? "mixed" : "open");
  }, [inherited.category]);

  /* Step 2 owns match composition. Seed the editable fields from whatever the
   * league last saved, then let the admin change them here (the single
   * authoritative place). */
  useEffect(() => {
    setSinglesRubbers(inherited.singlesRubbers);
    setDoublesRubbers(inherited.doublesRubbers);
  }, [inherited.singlesRubbers, inherited.doublesRubbers]);

  const effectiveSinglesRubbers = questions.askSinglesRubbers
    ? singlesRubbers
    : questions.askPlayersPerMatch
      ? perTeam
      : inherited.discipline === "doubles"
        ? 0
        : inherited.singlesRubbers;
  const effectiveDoublesRubbers = questions.askDoublesRubbers ? doublesRubbers : 0;
  const singlesPerTeam = effectiveSinglesRubbers;
  const effectivePairsPerTeam = effectiveDoublesRubbers;

  const requirements = useMemo(
    () =>
      computeTeamRequirements({
        composition: {
          singlesRubbers: effectiveSinglesRubbers,
          doublesRubbers: effectiveDoublesRubbers,
          allowDualParticipation: inherited.allowDualParticipation,
        },
        numTeams,
        reservesPerTeam: reserves,
        availablePlayers: eligiblePoolCount,
      }),
    [effectiveSinglesRubbers, effectiveDoublesRubbers, inherited.allowDualParticipation, numTeams, reserves, eligiblePoolCount],
  );
  const slotsPerTeam = requirements.startingPlayersPerTeam;



  // Eligible pool = active affiliation + gender, MINUS anyone already allocated this session
  const eligiblePool = useMemo(() => {
    if (!associationId) return [];
    const opted = members.filter((m: any) =>
      activeAffiliatedSet.has(m.id) && !allocatedIds.has(m.id)
    );
    return filterByGender(opted, gender);
  }, [members, associationId, gender, allocatedIds, activeAffiliatedSet]);

  // Sort eligible pool by ladder_position (nulls last), then name.
  // ladder_position already comes from useClubMembers (`select *`), so we don't
  // need a separate query — using a separate query introduced a race where the
  // pool was briefly in role/joined_at order, causing top players to be missed
  // when the admin proceeded to step 4 quickly.
  const sortedPool = useMemo(() => {
    return eligiblePool
      .map(m => ({ id: m.id, name: m.name, ladder_position: (m as any).ladder_position ?? null }))
      .sort((a, b) => {
        const ap = a.ladder_position ?? Number.POSITIVE_INFINITY;
        const bp = b.ladder_position ?? Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [eligiblePool]);

  // Compute the proposed allocation.
  // Singles (and hybrid singles slots) keep the ladder draft; Doubles allocates
  // real players into real pairs — never ladder-ranked unless a league rule
  // explicitly opts in.
  const allocation = useMemo(() => {
    const teamPlayers = numTeams * slotsPerTeam;
    const startIdx = questions.askLadderStart ? Math.max(0, (startPosition || 1) - 1) : 0;
    const available = sortedPool.slice(startIdx);
    const totalToTake = Math.min(numMembers, available.length);
    const top = available.slice(0, totalToTake);
    const teamPicks = top.slice(0, teamPlayers);
    const reservePicks = top.slice(teamPlayers, teamPlayers + reserves);

    if (questions.allocationMode === "ladder") {
      const order = buildDraftOrder(numTeams, teamPicks.length, distribution);
      const teams: Array<{ name: string; picks: typeof top; pairs: Array<[typeof top[number], typeof top[number]]> }> =
        Array.from({ length: numTeams }, (_, i) => ({
          name: `${leagueNumber} ${TEAM_LETTERS[i] || String(i + 1)}`,
          picks: [],
          pairs: [],
        }));
      teamPicks.forEach((p, idx) => { teams[order[idx]].picks.push(p); });
      // Sort each team by ladder_position so position 1 = strongest
      teams.forEach(t => t.picks.sort((a, b) => {
        const ap = a.ladder_position ?? Number.POSITIVE_INFINITY;
        const bp = b.ladder_position ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      }));
      return { teams, reserves: reservePicks, taken: top.length };
    }

    const built = buildTeamAllocation(teamPicks, {
      numTeams,
      singlesPerTeam,
      pairsPerTeam: effectivePairsPerTeam,
    });
    const teams = built.teams.map((t, i) => ({
      name: `${leagueNumber} ${TEAM_LETTERS[i] || String(i + 1)}`,
      picks: [...t.singles, ...t.pairs.flat()],
      pairs: t.pairs as Array<[typeof top[number], typeof top[number]]>,
    }));
    return { teams, reserves: reservePicks, taken: top.length };
  }, [sortedPool, numMembers, numTeams, slotsPerTeam, singlesPerTeam, effectivePairsPerTeam, reserves, distribution, leagueNumber, startPosition, questions.allocationMode, questions.askLadderStart]);


  // Detect existing league rows for this association+gender+number that we'd need
  const existingLeagueNames = useMemo(() => {
    const prefix = `${gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : gender === "open" ? "Open" : "Mixed"} ${leagueNumber}`;
    return leagues
      .filter(l => l.association_id === associationId && l.name.startsWith(prefix))
      .map(l => l.name);
  }, [leagues, associationId, gender, leagueNumber]);

  const association = associations.find(a => a.id === associationId);
  const canNext1 = !!associationId;
  const canNext2 = !!gender;
  const canNext3 = !!leagueNumber;
  const canNext4 = numMembers > 0 && numTeams > 0 && slotsPerTeam > 0 && (numTeams * slotsPerTeam + reserves) <= numMembers;

  const handleSubmit = async () => {
    if (!canNext4) return;
    setSubmitting(true);
    try {
      const genderLabel = gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : gender === "open" ? "Open" : "Mixed";
      // Determine code prefix: try to reuse existing league code prefix for that association (e.g. NSC001 → NSC)
      const sample = leagues.find(l => l.association_id === associationId);
      const codePrefix = sample?.code?.replace(/\d+$/, "") || (association?.abbreviation || "LG");

      // Find max existing numeric suffix to continue numbering
      const existingNums = leagues
        .filter(l => l.association_id === associationId && l.code?.startsWith(codePrefix))
        .map(l => parseInt(l.code!.match(/\d+$/)?.[0] || "0", 10));
      let nextCode = (existingNums.length ? Math.max(...existingNums) : 0) + 1;

      // Ensure one league row exists per team
      const createdLeagueIds: string[] = [];
      for (let i = 0; i < allocation.teams.length; i++) {
        const customName = (teamNames[i] || "").trim();
        const teamName = customName
          ? `${genderLabel} ${leagueNumber} ${customName}`
          : `${genderLabel} ${leagueNumber} ${TEAM_LETTERS[i] || String(i + 1)}`;
        const existing = leagues.find(l => l.association_id === associationId && l.name === teamName);
        if (existing) {
          createdLeagueIds.push(existing.id);
        } else {
          const code = `${codePrefix}${String(nextCode++).padStart(3, "0")}`;
          const { data, error } = await fromExt("leagues")
            .insert({
              club_id: clubId,
              association_id: associationId,
              name: teamName,
              code,
              reserves_per_team: reserves,
              // Canonical structure: season + level, independent of the display name.
              level: parseInt(leagueNumber, 10) || null,
              season_year: seasonYear,
              is_reserve: false,
              level_source: "manual",
              season_source: "manual",
            })
            .select("id")
            .single();
          if (error) throw error;
          createdLeagueIds.push(data.id);
        }
      }

      // For reserves, create a "Reserves" league row tied to this number
      let reservesLeagueId: string | null = null;
      if (allocation.reserves.length > 0) {
        const customRes = (reservesName || "").trim();
        const reservesNameFinal = customRes
          ? `${genderLabel} ${leagueNumber} ${customRes}`
          : `${genderLabel} ${leagueNumber} Reserves`;
        const existing = leagues.find(l => l.association_id === associationId && l.name === reservesNameFinal);
        if (existing) reservesLeagueId = existing.id;
        else {
          const code = `${codePrefix}${String(nextCode++).padStart(3, "0")}`;
          const { data, error } = await fromExt("leagues")
            .insert({
              club_id: clubId,
              association_id: associationId,
              name: reservesNameFinal,
              code,
              // Reserves inherit the same season + level as their teams.
              level: parseInt(leagueNumber, 10) || null,
              season_year: seasonYear,
              is_reserve: true,
              level_source: "manual",
              season_source: "manual",
            })
            .select("id")
            .single();
          if (error) throw error;
          reservesLeagueId = data.id;
        }
      }


      // Persist the "players per match" rule for every league row in this batch
      // (regular teams + reserves). Upsert by league_id so re-running setup updates.
      const allLeagueIdsForRules = [...createdLeagueIds, ...(reservesLeagueId ? [reservesLeagueId] : [])];
      if (allLeagueIdsForRules.length > 0) {
        const rulesRows = allLeagueIdsForRules.map((lid) => ({
          league_id: lid,
          club_id: clubId,
          association_id: associationId,
          team_size: slotsPerTeam,
          team_size_mode: "fixed" as const,
        }));
        const { error: rulesError } = await fromExt("league_rules").upsert(rulesRows, { onConflict: "league_id" });
        if (rulesError) throw rulesError;
      }

      // Wipe any existing registrations on these league rows, then insert fresh
      const allLeagueIds = [...createdLeagueIds, ...(reservesLeagueId ? [reservesLeagueId] : [])];
      for (const lid of allLeagueIds) {
        await fromExt("member_league_registrations").delete().eq("league_id", lid);
      }

      const inserts: any[] = [];
      allocation.teams.forEach((team, i) => {
        team.picks.forEach((p, posIdx) => {
          inserts.push({
            club_member_id: p.id,
            league_id: createdLeagueIds[i],
            player_rank: posIdx + 1,
            is_captain: posIdx === 0,
          });
        });
      });
      if (reservesLeagueId) {
        // Reserves "team" gets the same number of position slots as a regular team (perTeam),
        // so admin can later drag a reserve into position 1..perTeam at their discretion.
        // Initial player_rank assignment goes 1..N by ladder strength up to perTeam slots;
        // any extra reserves get sequential ranks beyond perTeam (still draggable).
        allocation.reserves.forEach((p, posIdx) => {
          inserts.push({
            club_member_id: p.id,
            league_id: reservesLeagueId!,
            player_rank: posIdx + 1,
            is_captain: false,
            is_reserve: true,
            reserve_order: posIdx + 1,
          });
        });
      }
      if (inserts.length > 0) {
        const { error } = await fromExt("member_league_registrations").insert(inserts);
        if (error) throw error;
      }

      // Doubles / Hybrid: persist the allocated pairs as REAL member pairs.
      if (effectivePairsPerTeam > 0) {
        const pairRows: any[] = [];
        allocation.teams.forEach((team, i) => {
          (team.pairs || []).forEach(([a, b], idx) => {
            pairRows.push({
              club_id: clubId,
              league_id: createdLeagueIds[i],
              player_one_member_id: a.id,
              player_two_member_id: b.id,
              pair_order: idx + 1,
            });
          });
        });
        if (pairRows.length > 0) {
          for (const lid of createdLeagueIds) {
            await fromExt("league_team_pairs").delete().eq("league_id", lid);
          }
          const { error: pairErr } = await fromExt("league_team_pairs").insert(pairRows);
          if (pairErr) throw pairErr;
        }
      }


      // Track who got allocated this session
      const newlyAllocated = new Set(allocatedIds);
      allocation.teams.forEach(t => t.picks.forEach(p => newlyAllocated.add(p.id)));
      allocation.reserves.forEach(p => newlyAllocated.add(p.id));
      setAllocatedIds(newlyAllocated);

      const genderLabelShort = gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : gender === "open" ? "Open" : "Mixed";
      setSessionSummary(prev => [
        ...prev,
        { label: `${genderLabelShort} ${leagueNumber} — ${allocation.teams.length} team${allocation.teams.length !== 1 ? "s" : ""}${allocation.reserves.length ? ` + ${allocation.reserves.length} reserves` : ""}`, count: inserts.length },
      ]);

      toast.success(`Set up ${allocation.teams.length} team${allocation.teams.length !== 1 ? "s" : ""} with ${inserts.length} placements`);
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["league-registrations"] });
      setSavedLastRound(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save setup");
    } finally {
      setSubmitting(false);
    }
  };

  // Start another round of setup, keeping the association and the running allocated-ID list
  const handleSetupAnother = () => {
    setSavedLastRound(false);
    setStep(questions.askCategory ? 2 : 3);
    if (questions.askCategory) setGender("men");
    setLeagueNumber("1st");
    setStartPosition(1);
    setNumMembers(0);
    setNumTeams(1);
    setPerTeam(4);
    setReserves(0);
    setDistribution("snake");
    setTeamNames({});
    setReservesName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editContext ? `Edit Setup — ${gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : gender === "open" ? "Open" : "Mixed"} ${leagueNumber}` : "Step by Step League Setup"}</DialogTitle>
          <DialogDescription>
            {editContext
              ? "Pre-filled from this league group. Adjust counts, team names or reserves; saving overwrites the group's registrations."
              : "Build one league number at a time — pick the league, gender, league number, then split players into teams. Members allocated in this session are removed from the pool for later rounds."}
          </DialogDescription>
        </DialogHeader>

        {/* Running session summary */}
        {sessionSummary.length > 0 && (
          <Card className="p-2.5 bg-primary/5 border-primary/30 text-xs space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" />
              Saved this session ({allocatedIds.size} member{allocatedIds.size !== 1 ? "s" : ""} allocated)
            </p>
            {sessionSummary.map((s, i) => (
              <p key={i} className="text-muted-foreground pl-5">• {s.label}</p>
            ))}
          </Card>
        )}

        {!savedLastRound && (
          <>
        {/* Progress dots */}
        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`flex items-center gap-2 ${s <= step ? "text-foreground" : "text-muted-foreground"}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${s < step ? "bg-primary text-primary-foreground" : s === step ? "bg-primary/20 border border-primary text-primary" : "bg-muted"}`}>
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 5 && <div className={`w-6 h-px ${s < step ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Inherited league configuration — read-only context, never re-asked */}
        {step > 1 && associationId && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
            <span className="text-muted-foreground">Inherited from the league:</span>
            <Badge variant="secondary" className="h-5 text-[10px]">{DISCIPLINE_LABELS[inherited.discipline]}</Badge>
            {inherited.category && (
              <Badge variant="secondary" className="h-5 text-[10px]">{CATEGORY_LABELS[inherited.category]}</Badge>
            )}
            {inherited.singlesRubbers > 0 && (
              <Badge variant="outline" className="h-5 text-[10px]">{inherited.singlesRubbers} singles rubber{inherited.singlesRubbers !== 1 ? "s" : ""}</Badge>
            )}
            {inherited.doublesRubbers > 0 && (
              <Badge variant="outline" className="h-5 text-[10px]">{inherited.doublesRubbers} doubles rubber{inherited.doublesRubbers !== 1 ? "s" : ""}</Badge>
            )}
            {questions.askPairsPerTeam && (
              <Badge variant="outline" className="h-5 text-[10px]">
                {inherited.pairingPolicy === "fixed" ? "Fixed season pairs" : "Pairs per fixture"}
              </Badge>
            )}
          </div>
        )}



        {/* Step 1: Association */}
        {step === 1 && (
          <div className="space-y-3">
            <Label>Step 1 — Choose League</Label>
            <Select value={associationId} onValueChange={setAssociationId}>
              <SelectTrigger><SelectValue placeholder="Pick an association (e.g. LS, NIL)" /></SelectTrigger>
              <SelectContent>
                {associations.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}{a.abbreviation ? ` (${a.abbreviation})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {associations.length === 0 && (
              <p className="text-xs text-muted-foreground">No associations exist yet. Create one in the Leagues tab first.</p>
            )}
          </div>
        )}

        {/* Step 2: Category — only when the league itself has none (legacy) */}
        {step === 2 && (
          <div className="space-y-3">
            {questions.askCategory ? (
              <>
                <Label>Step 2 — Choose Category</Label>
                <RadioGroup value={gender} onValueChange={(v) => setGender(v as Gender)} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {GENDERS.map(g => (
                    <label key={g.value} className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:bg-accent ${gender === g.value ? "border-primary bg-accent" : ""}`}>
                      <RadioGroupItem value={g.value} />
                      <span className="text-sm font-medium">{g.label}</span>
                    </label>
                  ))}
                </RadioGroup>
                <p className="text-[11px] text-muted-foreground">
                  This legacy league has no category saved. Newer leagues set this once when the league is created.
                </p>
              </>
            ) : (
              <>
                <Label>Step 2 — League configuration (inherited)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Defined when this league was created. Change it in Step 1 — Create League.
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Eligible pool: <strong>{filterByGender(members.filter((m: any) => activeAffiliatedSet.has(m.id)), gender).length}</strong> members opted into {association?.abbreviation || association?.name || "this association"}.
            </p>
          </div>
        )}


        {/* Step 3: League number */}
        {step === 3 && (
          <div className="space-y-3">
            <Label>Step 3 — Choose League Number</Label>
            <Select value={leagueNumber} onValueChange={setLeagueNumber}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDINALS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Season (year)</Label>
              <Input
                type="number"
                value={seasonYear}
                onChange={(e) => setSeasonYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              />
              <p className="text-[11px] text-muted-foreground">
                A new season creates a fresh set of teams. Previous years keep their own teams, fixtures and results.
              </p>
            </div>

            {existingLeagueNames.length > 0 && (
              <Card className="p-2.5 border-warning/40 bg-warning/10 text-xs space-y-1">
                <p className="font-medium text-foreground">Existing league rows for this number:</p>
                {existingLeagueNames.map(n => <p key={n} className="text-muted-foreground">• {n}</p>)}
                <p className="text-muted-foreground mt-1">Saving will overwrite registrations on these rows.</p>
              </Card>
            )}
          </div>
        )}

        {/* Step 4: Counts + distribution */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-base">Step 4 — How many?</Label>
              <p className="text-xs text-muted-foreground">
                Pool available: <strong>{eligiblePool.length}</strong> {gender} player{eligiblePool.length !== 1 ? "s" : ""} opted into {association?.abbreviation || association?.name}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {questions.askLadderStart && (
                <div>
                  <Label className="text-xs">Starting ladder position</Label>
                  <Input type="number" min={1} value={startPosition || ""} onChange={(e) => setStartPosition(parseInt(e.target.value) || 1)} />
                  <p className="text-[10px] text-muted-foreground mt-1">Pick from position {startPosition} downward (e.g. 30 → 30, 31, 32…). Use higher numbers for lower leagues.</p>
                </div>
              )}
              <div>
                <Label className="text-xs">How many members?</Label>
                <Input type="number" min={0} value={numMembers || ""} onChange={(e) => setNumMembers(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">How many teams?</Label>
                <Input type="number" min={1} max={8} value={numTeams || ""} onChange={(e) => setNumTeams(parseInt(e.target.value) || 1)} />
              </div>
              {questions.askPlayersPerMatch && (
                <div>
                  <Label className="text-xs">Players per match (league rule)?</Label>
                  <Input type="number" min={1} max={8} value={perTeam || ""} onChange={(e) => setPerTeam(parseInt(e.target.value) || 1)} />
                  <p className="text-[10px] text-muted-foreground mt-1">Saved as the league rule. Marker scorecard will use this number of rows for every team in this league.</p>
                </div>
              )}
              {questions.askPairsPerTeam && (
                <div>
                  <Label className="text-xs">Pairs per team</Label>
                  <Input type="number" min={0} max={10} value={pairsPerTeam || ""} onChange={(e) => setPairsPerTeam(parseInt(e.target.value) || 0)} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Two real players per pair. The league plays {inherited.doublesRubbers} doubles rubber{inherited.doublesRubbers !== 1 ? "s" : ""} per fixture.
                  </p>
                </div>
              )}
              <div>
                <Label className="text-xs">How many reserves?</Label>
                <Input type="number" min={0} value={reserves || 0} onChange={(e) => setReserves(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="text-xs rounded-md bg-muted p-2.5 space-y-0.5">
              {questions.askLadderStart && <p>Starting from ladder position: <strong>{startPosition}</strong></p>}
              {questions.askPairsPerTeam && (
                <p>Per team: <strong>{singlesPerTeam}</strong> singles + <strong>{effectivePairsPerTeam}</strong> pair{effectivePairsPerTeam !== 1 ? "s" : ""} = <strong>{slotsPerTeam}</strong> players</p>
              )}
              <p>Team players needed: <strong>{numTeams * slotsPerTeam}</strong></p>
              <p>+ Reserves: <strong>{reserves}</strong></p>
              <p>Total to allocate: <strong>{numTeams * slotsPerTeam + reserves}</strong> / {numMembers} requested</p>
              {(numTeams * slotsPerTeam + reserves) > numMembers && (
                <p className="text-destructive font-medium mt-1">⚠ Teams + reserves exceeds member count.</p>
              )}
              {questions.askLadderStart && (startPosition - 1 + numMembers) > eligiblePool.length && numMembers > 0 && (
                <p className="text-destructive font-medium mt-1">⚠ Start position + members exceeds the eligible pool ({eligiblePool.length}).</p>
              )}
            </div>

            {questions.askDistribution && (
              <div className="space-y-2">
                <Label className="text-xs">Distribution method</Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Only affects the initial auto-draft of players into team slots from the ranked pool. It does <strong>not</strong> decide fixtures or which team plays which week — that's handled later by the fixture scheduler.
                </p>
                <RadioGroup value={distribution} onValueChange={(v) => setDistribution(v as Distribution)} className="space-y-2">
                  {DISTRIBUTIONS.map(d => (
                    <label key={d.value} className={`flex items-start gap-2 border rounded-md p-2.5 cursor-pointer hover:bg-accent ${distribution === d.value ? "border-primary bg-accent" : ""}`}>
                      <RadioGroupItem value={d.value} className="mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{d.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{d.example}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

          </div>
        )}

        {/* Step 5: Preview */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base flex items-center gap-2"><Shuffle className="w-4 h-4" />Step 5 — Preview Allocation</Label>
              {questions.askDistribution && (
                <Badge variant="outline" className="text-[10px]">{distribution === "snake" ? "Snake" : distribution === "rotation" ? "Rotation" : "Reverse snake"}</Badge>
              )}
            </div>


            <p className="text-[11px] text-muted-foreground -mb-1">
              Optional: name each team (e.g. <em>Warriors</em>, <em>Bulldogs</em>). Leave blank to use {leagueNumber} A, B, C…
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(allocation.teams.length, 3)}, minmax(0, 1fr))` }}>
              {allocation.teams.map((team, i) => {
                const customName = (teamNames[i] || "").trim();
                const displayName = customName
                  ? `${leagueNumber} ${customName}`
                  : team.name;
                return (
                  <Card key={i} className="p-2.5 space-y-1.5">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />{displayName}
                    </p>
                    <Input
                      className="h-7 text-xs"
                      placeholder={`Team name (e.g. ${["Warriors","Bulldogs","Lions","Hawks","Panthers","Eagles","Tigers","Sharks"][i] || "Team"})`}
                      value={teamNames[i] ?? ""}
                      onChange={(e) => setTeamNames(prev => ({ ...prev, [i]: e.target.value }))}
                    />
                    <ol className="space-y-0.5 text-[11px]">
                      {team.picks.map((p, idx) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="truncate"><span className="text-muted-foreground">{idx + 1}.</span> {p.name || "Unnamed"}</span>
                          <span className="text-muted-foreground tabular-nums">#{p.ladder_position ?? "—"}</span>
                        </li>
                      ))}
                      {team.picks.length === 0 && <li className="text-muted-foreground italic">empty</li>}
                    </ol>
                    {(team.pairs?.length ?? 0) > 0 && (
                      <div className="space-y-0.5 border-t border-dashed pt-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground">Pairs</p>
                        {team.pairs.map(([a, b], idx) => (
                          <p key={`${a.id}-${b.id}`} className="text-[11px] truncate">
                            <span className="text-muted-foreground">{idx + 1}.</span> {a.name || "Unnamed"} &amp; {b.name || "Unnamed"}
                          </p>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}

            </div>

            {allocation.reserves.length > 0 && (
              <Card className="p-2.5 border-dashed space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {(reservesName || "").trim() ? `${leagueNumber} ${reservesName.trim()}` : "Reserves"}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {allocation.reserves.length} filled / {perTeam} slots
                  </Badge>
                </div>
                <Input
                  className="h-7 text-xs"
                  placeholder="Reserves name (default: Reserves)"
                  value={reservesName}
                  onChange={(e) => setReservesName(e.target.value)}
                />
                <ol className="space-y-0.5 text-[11px]">
                  {Array.from({ length: Math.max(perTeam, allocation.reserves.length) }).map((_, idx) => {
                    const p = allocation.reserves[idx];
                    return (
                      <li key={idx} className="flex justify-between gap-2 border-b border-dashed border-border/50 last:border-0 py-0.5">
                        <span className="truncate">
                          <span className="text-muted-foreground">{idx + 1}.</span>{" "}
                          {p ? (p.name || "Unnamed") : <span className="italic text-muted-foreground">(empty slot)</span>}
                        </span>
                        {p && <span className="text-muted-foreground tabular-nums">#{p.ladder_position ?? "—"}</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[10px] text-muted-foreground italic">
                  Reserves get {perTeam} draggable position slots so admin can promote any reserve into positions 1–{perTeam}.
                </p>
              </Card>
            )}


            <p className="text-[11px] text-muted-foreground">
              Saving will create league rows (one per team + one for reserves) and assign player ranks. Admin can still drag players around afterwards in the Allocate dialog or Fill Up Leagues.
            </p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" disabled={step === 1 || submitting} onClick={() => setStep(s => (s === 3 && !questions.askCategory ? 1 : Math.max(1, s - 1)))}>
            <ArrowLeft className="w-4 h-4 mr-1" />Back
          </Button>
          {step < 5 ? (
            <Button
              size="sm"
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2) || (step === 3 && !canNext3) || (step === 4 && !canNext4)}
              onClick={() => setStep(s => (s === 1 && !questions.askCategory ? 3 : Math.min(5, s + 1)))}
            >
              Next<ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving…</> : <><Check className="w-4 h-4 mr-1" />Confirm & Save</>}
            </Button>
          )}
        </div>
          </>
        )}

        {/* After-save: choose to set up another league or finish */}
        {savedLastRound && (
          <div className="space-y-4">
            <Card className="p-4 bg-primary/5 border-primary/40 text-center space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              <p className="font-semibold">League saved successfully</p>
              <p className="text-xs text-muted-foreground">
                {allocatedIds.size} member{allocatedIds.size !== 1 ? "s" : ""} allocated so far this session.
                Remaining eligible pool will exclude them automatically.
              </p>
            </Card>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={handleSetupAnother}>
                <ArrowRight className="w-4 h-4 mr-1" />Set up another league
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                <Check className="w-4 h-4 mr-1" />Finish
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
