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

type Gender = "men" | "ladies" | "mixed";
type Distribution = "snake" | "rotation" | "reverse_snake";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "ladies", label: "Ladies" },
  { value: "mixed", label: "Mixed" },
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

export function StepByStepLeagueSetup({ clubId, open, onOpenChange }: {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const { data: members = [] } = useClubMembers(clubId);

  const [step, setStep] = useState(1);
  const [associationId, setAssociationId] = useState<string>("");
  const [gender, setGender] = useState<Gender>("men");
  const [leagueNumber, setLeagueNumber] = useState<string>("1st");
  const [numMembers, setNumMembers] = useState<number>(0);
  const [numTeams, setNumTeams] = useState<number>(1);
  const [perTeam, setPerTeam] = useState<number>(4);
  const [reserves, setReserves] = useState<number>(0);
  const [distribution, setDistribution] = useState<Distribution>("snake");
  const [submitting, setSubmitting] = useState(false);
  // Track member IDs allocated to a saved league this session (so they're excluded from later rounds)
  const [allocatedIds, setAllocatedIds] = useState<Set<string>>(new Set());
  // Summary of leagues set up so far this session
  const [sessionSummary, setSessionSummary] = useState<Array<{ label: string; count: number }>>([]);
  // After-save view: show success + "set up another league" / "finish" choices
  const [savedLastRound, setSavedLastRound] = useState(false);

  // Reset state when dialog re-opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setAssociationId("");
      setGender("men");
      setLeagueNumber("1st");
      setNumMembers(0);
      setNumTeams(1);
      setPerTeam(4);
      setReserves(0);
      setDistribution("snake");
      setAllocatedIds(new Set());
      setSessionSummary([]);
      setSavedLastRound(false);
    }
  }, [open]);

  // Eligible pool = plays_league + matches association + gender, MINUS anyone already allocated this session
  const eligiblePool = useMemo(() => {
    if (!associationId) return [];
    const opted = members.filter((m: any) =>
      m.plays_league
      && m.enable_league_association_id === associationId
      && !allocatedIds.has(m.id)
    );
    return filterByGender(opted, gender);
  }, [members, associationId, gender, allocatedIds]);

  // Load ladder positions for the eligible pool
  const eligibleIds = eligiblePool.map(m => m.id);
  const { data: laddered = [] } = useQuery({
    queryKey: ["sbs-ladder", clubId, associationId, gender, eligibleIds.join(",")],
    enabled: open && step >= 4 && eligibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, gender, ladder_position")
        .in("id", eligibleIds);
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string | null; gender: string | null; ladder_position: number | null }>;
    },
  });

  // Sort eligible pool by ladder_position (nulls last), then name
  const sortedPool = useMemo(() => {
    if (laddered.length === 0) return eligiblePool.map(m => ({ id: m.id, name: m.name, ladder_position: (m as any).ladder_position ?? null }));
    return [...laddered].sort((a, b) => {
      const ap = a.ladder_position ?? Number.POSITIVE_INFINITY;
      const bp = b.ladder_position ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [laddered, eligiblePool]);

  // Compute the proposed allocation
  const allocation = useMemo(() => {
    const teamPlayers = numTeams * perTeam;
    const totalToTake = Math.min(numMembers, sortedPool.length);
    const top = sortedPool.slice(0, totalToTake);
    const teamPicks = top.slice(0, teamPlayers);
    const reservePicks = top.slice(teamPlayers, teamPlayers + reserves);
    const order = buildDraftOrder(numTeams, teamPicks.length, distribution);
    const teams: Array<{ name: string; picks: typeof top }> = Array.from({ length: numTeams }, (_, i) => ({
      name: `${leagueNumber} ${TEAM_LETTERS[i] || String(i + 1)}`,
      picks: [],
    }));
    teamPicks.forEach((p, idx) => { teams[order[idx]].picks.push(p); });
    // Sort each team by ladder_position so position 1 = strongest
    teams.forEach(t => t.picks.sort((a, b) => {
      const ap = a.ladder_position ?? Number.POSITIVE_INFINITY;
      const bp = b.ladder_position ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    }));
    return { teams, reserves: reservePicks, taken: top.length };
  }, [sortedPool, numMembers, numTeams, perTeam, reserves, distribution, leagueNumber]);

  // Detect existing league rows for this association+gender+number that we'd need
  const existingLeagueNames = useMemo(() => {
    const prefix = `${gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : "Mixed"} ${leagueNumber}`;
    return leagues
      .filter(l => l.association_id === associationId && l.name.startsWith(prefix))
      .map(l => l.name);
  }, [leagues, associationId, gender, leagueNumber]);

  const association = associations.find(a => a.id === associationId);
  const canNext1 = !!associationId;
  const canNext2 = !!gender;
  const canNext3 = !!leagueNumber;
  const canNext4 = numMembers > 0 && numTeams > 0 && perTeam > 0 && (numTeams * perTeam + reserves) <= numMembers;

  const handleSubmit = async () => {
    if (!canNext4) return;
    setSubmitting(true);
    try {
      const genderLabel = gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : "Mixed";
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
        const teamName = `${genderLabel} ${leagueNumber} ${TEAM_LETTERS[i] || String(i + 1)}`;
        const existing = leagues.find(l => l.association_id === associationId && l.name === teamName);
        if (existing) {
          createdLeagueIds.push(existing.id);
        } else {
          const code = `${codePrefix}${String(nextCode++).padStart(3, "0")}`;
          const { data, error } = await fromExt("leagues")
            .insert({ club_id: clubId, association_id: associationId, name: teamName, code })
            .select("id")
            .single();
          if (error) throw error;
          createdLeagueIds.push(data.id);
        }
      }

      // For reserves, create a "Reserves" league row tied to this number
      let reservesLeagueId: string | null = null;
      if (allocation.reserves.length > 0) {
        const reservesName = `${genderLabel} ${leagueNumber} Reserves`;
        const existing = leagues.find(l => l.association_id === associationId && l.name === reservesName);
        if (existing) reservesLeagueId = existing.id;
        else {
          const code = `${codePrefix}${String(nextCode++).padStart(3, "0")}`;
          const { data, error } = await fromExt("leagues")
            .insert({ club_id: clubId, association_id: associationId, name: reservesName, code })
            .select("id")
            .single();
          if (error) throw error;
          reservesLeagueId = data.id;
        }
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
          });
        });
      }
      if (inserts.length > 0) {
        const { error } = await fromExt("member_league_registrations").insert(inserts);
        if (error) throw error;
      }

      // Track who got allocated this session
      const newlyAllocated = new Set(allocatedIds);
      allocation.teams.forEach(t => t.picks.forEach(p => newlyAllocated.add(p.id)));
      allocation.reserves.forEach(p => newlyAllocated.add(p.id));
      setAllocatedIds(newlyAllocated);

      const genderLabelShort = gender === "men" ? "Men's" : gender === "ladies" ? "Ladies" : "Mixed";
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
    setStep(2);
    setGender("men");
    setLeagueNumber("1st");
    setNumMembers(0);
    setNumTeams(1);
    setPerTeam(4);
    setReserves(0);
    setDistribution("snake");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Step by Step League Setup</DialogTitle>
          <DialogDescription>
            Build one league number at a time — pick the association, gender, league number, then split players into teams.
            Members allocated in this session are removed from the pool for later rounds.
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

        {/* Step 1: Association */}
        {step === 1 && (
          <div className="space-y-3">
            <Label>Step 1 — Choose League Association</Label>
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

        {/* Step 2: Gender */}
        {step === 2 && (
          <div className="space-y-3">
            <Label>Step 2 — Choose Category</Label>
            <RadioGroup value={gender} onValueChange={(v) => setGender(v as Gender)} className="grid grid-cols-3 gap-2">
              {GENDERS.map(g => (
                <label key={g.value} className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer hover:bg-accent ${gender === g.value ? "border-primary bg-accent" : ""}`}>
                  <RadioGroupItem value={g.value} />
                  <span className="text-sm font-medium">{g.label}</span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Eligible pool: <strong>{filterByGender(members.filter((m: any) => m.plays_league && m.enable_league_association_id === associationId), gender).length}</strong> members opted into {association?.abbreviation || association?.name || "this association"}.
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
              <div>
                <Label className="text-xs">a. How many members?</Label>
                <Input type="number" min={0} max={eligiblePool.length} value={numMembers || ""} onChange={(e) => setNumMembers(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">b. How many teams?</Label>
                <Input type="number" min={1} max={8} value={numTeams || ""} onChange={(e) => setNumTeams(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <Label className="text-xs">c. Members per team?</Label>
                <Input type="number" min={1} max={8} value={perTeam || ""} onChange={(e) => setPerTeam(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <Label className="text-xs">d. How many reserves?</Label>
                <Input type="number" min={0} value={reserves || 0} onChange={(e) => setReserves(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="text-xs rounded-md bg-muted p-2.5 space-y-0.5">
              <p>Team players needed: <strong>{numTeams * perTeam}</strong></p>
              <p>+ Reserves: <strong>{reserves}</strong></p>
              <p>Total to allocate: <strong>{numTeams * perTeam + reserves}</strong> / {numMembers} requested</p>
              {(numTeams * perTeam + reserves) > numMembers && (
                <p className="text-destructive font-medium mt-1">⚠ Teams + reserves exceeds member count.</p>
              )}
              {numMembers > eligiblePool.length && (
                <p className="text-destructive font-medium mt-1">⚠ Requested more members than the eligible pool ({eligiblePool.length}).</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">e. Distribution method</Label>
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
          </div>
        )}

        {/* Step 5: Preview */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base flex items-center gap-2"><Shuffle className="w-4 h-4" />Step 5 — Preview Allocation</Label>
              <Badge variant="outline" className="text-[10px]">{distribution === "snake" ? "Snake" : distribution === "rotation" ? "Rotation" : "Reverse snake"}</Badge>
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(allocation.teams.length, 3)}, minmax(0, 1fr))` }}>
              {allocation.teams.map((team, i) => (
                <Card key={i} className="p-2.5">
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />{team.name}
                  </p>
                  <ol className="space-y-0.5 text-[11px]">
                    {team.picks.map((p, idx) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="truncate"><span className="text-muted-foreground">{idx + 1}.</span> {p.name || "Unnamed"}</span>
                        <span className="text-muted-foreground tabular-nums">#{p.ladder_position ?? "—"}</span>
                      </li>
                    ))}
                    {team.picks.length === 0 && <li className="text-muted-foreground italic">empty</li>}
                  </ol>
                </Card>
              ))}
            </div>

            {allocation.reserves.length > 0 && (
              <Card className="p-2.5 border-dashed">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />Reserves
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {allocation.reserves.length} filled / {perTeam} slots
                  </Badge>
                </div>
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
                <p className="text-[10px] text-muted-foreground mt-1.5 italic">
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
          <Button variant="ghost" size="sm" disabled={step === 1 || submitting} onClick={() => setStep(s => Math.max(1, s - 1))}>
            <ArrowLeft className="w-4 h-4 mr-1" />Back
          </Button>
          {step < 5 ? (
            <Button
              size="sm"
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2) || (step === 3 && !canNext3) || (step === 4 && !canNext4)}
              onClick={() => setStep(s => Math.min(5, s + 1))}
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
