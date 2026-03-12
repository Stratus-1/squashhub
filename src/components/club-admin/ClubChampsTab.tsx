import { useState, useMemo } from "react";
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
import { toast } from "sonner";
import { Calendar, Users, Trophy, ChevronRight, ChevronLeft, Loader2, Trash2, Eye } from "lucide-react";
import { format, eachDayOfInterval, getDay } from "date-fns";

interface ClubChampsTabProps {
  clubId: string;
}

type WizardStep = "gender" | "players" | "groups" | "schedule" | "review";

const STEPS: WizardStep[] = ["gender", "players", "groups", "schedule", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  gender: "Category",
  players: "Select Players",
  groups: "Groups",
  schedule: "Schedule",
  review: "Review & Generate",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function generateRoundRobinRounds(playerIds: string[]): [string, string][][] {
  const players = [...playerIds];
  if (players.length % 2 !== 0) players.push("BYE");
  const n = players.length;
  const rounds: [string, string][][] = [];
  for (let round = 0; round < n - 1; round++) {
    const matches: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = players[i];
      const b = players[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") {
        matches.push([a, b]);
      }
    }
    rounds.push(matches);
    // rotate: fix first, rotate rest
    const last = players.pop()!;
    players.splice(1, 0, last);
  }
  return rounds;
}

export function ClubChampsTab({ clubId }: ClubChampsTabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: members = [] } = useClubMembers(clubId);

  // Fetch courts
  const { data: courts = [] } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId);
      if (error) throw error;
      return data as { id: number; name: string }[];
    },
    enabled: !!clubId,
  });

  // Fetch existing champs
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

  const [step, setStep] = useState<WizardStep>("gender");
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [gender, setGender] = useState<"men" | "ladies">("men");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [numGroups, setNumGroups] = useState(2);
  const [champName, setChampName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playDays, setPlayDays] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [matchDuration, setMatchDuration] = useState(30);
  const [selectedCourtIds, setSelectedCourtIds] = useState<Set<number>>(new Set());
  const [groupAssignments, setGroupAssignments] = useState<Map<string, number>>(new Map());

  const stepIdx = STEPS.indexOf(step);

  // Filter members by gender
  const genderMembers = useMemo(() => {
    const matchValues = gender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return members
      .filter((m) => m.gender && matchValues.includes(m.gender.toLowerCase()))
      .sort((a, b) => (a.league_player_rank || 999) - (b.league_player_rank || 999));
  }, [members, gender]);

  // When entering players step, pre-select all; when entering groups, auto-seed assignments
  const goToStep = (s: WizardStep) => {
    if (s === "players" && step === "gender") {
      setSelectedPlayerIds(new Set(genderMembers.map((m) => m.id)));
    }
    if (s === "groups") {
      // Auto-seed group assignments via snake draft
      const newMap = new Map<string, number>();
      selectedPlayers.forEach((p, i) => {
        const cycle = Math.floor(i / numGroups);
        const idx = cycle % 2 === 0 ? i % numGroups : numGroups - 1 - (i % numGroups);
        newMap.set(p.id, idx);
      });
      setGroupAssignments(newMap);
    }
    setStep(s);
  };

  const selectedPlayers = useMemo(
    () => genderMembers.filter((m) => selectedPlayerIds.has(m.id)),
    [genderMembers, selectedPlayerIds]
  );

  // Build groups from assignments map
  const groups = useMemo(() => {
    const g: ClubMember[][] = Array.from({ length: numGroups }, () => []);
    selectedPlayers.forEach((p) => {
      const gi = groupAssignments.get(p.id) ?? 0;
      if (gi < numGroups) g[gi].push(p);
    });
    return g;
  }, [selectedPlayers, numGroups, groupAssignments]);

  // Generate schedule preview
  const schedulePreview = useMemo(() => {
    if (!startDate || !endDate || playDays.size === 0 || selectedCourtIds.size === 0) return null;

    const courtIds = Array.from(selectedCourtIds);
    const allDates = eachDayOfInterval({
      start: new Date(startDate),
      end: new Date(endDate),
    }).filter((d) => playDays.has(getDay(d)));

    // Time slots
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

    // Total available slots
    const totalSlots = allDates.length * timeSlots.length * courtIds.length;

    // Generate all matches for all groups
    type MatchDef = { groupNum: number; roundNum: number; playerA: string; playerB: string; date?: string; time?: string; courtId?: number };
    const allMatches: MatchDef[] = [];

    groups.forEach((groupPlayers, gi) => {
      const playerIds = groupPlayers.map((p) => p.id);
      const rounds = generateRoundRobinRounds(playerIds);
      rounds.forEach((roundMatches, ri) => {
        roundMatches.forEach(([a, b]) => {
          allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, playerA: a, playerB: b });
        });
      });
    });

    // Assign matches to slots
    let slotIdx = 0;
    for (const match of allMatches) {
      if (slotIdx >= totalSlots) break;
      const dateIdx = Math.floor(slotIdx / (timeSlots.length * courtIds.length));
      const remainder = slotIdx % (timeSlots.length * courtIds.length);
      const timeIdx = Math.floor(remainder / courtIds.length);
      const courtIdx = remainder % courtIds.length;

      match.date = format(allDates[dateIdx], "yyyy-MM-dd");
      match.time = timeSlots[timeIdx];
      match.courtId = courtIds[courtIdx];
      slotIdx++;
    }

    return { allMatches, totalSlots, totalMatches: allMatches.length, allDates, timeSlots };
  }, [groups, startDate, endDate, playDays, selectedCourtIds, startTime, endTime, matchDuration]);

  // Create champ mutation
  const createChamp = useMutation({
    mutationFn: async () => {
      if (!schedulePreview) throw new Error("No schedule generated");

      // 1. Create champ record
      const { data: champ, error: champErr } = await fromExt("club_champs")
        .insert({
          club_id: clubId,
          name: champName || `${gender === "men" ? "Men's" : "Ladies'"} Club Champs ${new Date().getFullYear()}`,
          gender,
          num_groups: numGroups,
          start_date: startDate,
          end_date: endDate,
          play_days: Array.from(playDays),
          start_time: startTime,
          end_time: endTime,
          match_duration_minutes: matchDuration,
        })
        .select()
        .single();
      if (champErr) throw champErr;

      // 2. Create entries
      const entries = groups.flatMap((groupPlayers, gi) =>
        groupPlayers.map((p) => ({
          champ_id: champ.id,
          club_member_id: p.id,
          group_number: gi + 1,
        }))
      );
      const { error: entryErr } = await fromExt("club_champs_entries").insert(entries);
      if (entryErr) throw entryErr;

      // 3. Create matches
      const matches = schedulePreview.allMatches.map((m) => ({
        champ_id: champ.id,
        group_number: m.groupNum,
        round_number: m.roundNum,
        player_a_member_id: m.playerA,
        player_b_member_id: m.playerB,
        scheduled_date: m.date,
        scheduled_time: m.time,
        court_id: m.courtId,
      }));
      if (matches.length > 0) {
        const { error: matchErr } = await fromExt("club_champs_matches").insert(matches);
        if (matchErr) throw matchErr;
      }

      // 4. Auto-book courts for matches with linked user accounts
      const memberMap = new Map<string, string>(); // club_member_id -> user_id
      selectedPlayers.forEach((p) => { if (p.user_id) memberMap.set(p.id, p.user_id); });

      const bookings = schedulePreview.allMatches
        .filter((m) => m.date && m.time && m.courtId && memberMap.has(m.playerA))
        .map((m) => {
          const [h, min] = m.time!.split(":").map(Number);
          const endMins = h * 60 + min + matchDuration;
          const endH = Math.floor(endMins / 60);
          const endM = endMins % 60;
          const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          return {
            user_id: memberMap.get(m.playerA)!,
            opponent_id: memberMap.get(m.playerB) || null,
            court_id: m.courtId!,
            date: m.date!,
            start_time: m.time!,
            end_time: endTimeStr,
            status: "active",
            is_friendly: false,
            guest_name: !memberMap.has(m.playerB) ? getMemberName(m.playerB) : null,
          };
        });

      if (bookings.length > 0) {
        const { error: bookErr } = await fromExt("bookings").insert(bookings);
        if (bookErr) console.warn("Some bookings could not be created:", bookErr.message);
      }

      return champ;
    },
    onSuccess: () => {
      toast.success("Club Champs created with all matches scheduled!");
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      setShowWizard(false);
      resetWizard();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create champs"),
  });

  const deleteChamp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("club_champs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Champs deleted");
      qc.invalidateQueries({ queryKey: ["club-champs"] });
    },
  });

  const resetWizard = () => {
    setStep("gender");
    setGender("men");
    setSelectedPlayerIds(new Set());
    setNumGroups(2);
    setChampName("");
    setStartDate("");
    setEndDate("");
    setPlayDays(new Set());
    setStartTime("18:00");
    setEndTime("20:00");
    setMatchDuration(30);
    setSelectedCourtIds(new Set());
    setGroupAssignments(new Map());
  };

  const getMemberName = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  const getCourtName = (id: number) => courts.find((c) => c.id === id)?.name || `Court ${id}`;

  const canProceed = () => {
    switch (step) {
      case "gender": return true;
      case "players": return selectedPlayerIds.size >= 3;
      case "groups": return numGroups >= 1 && numGroups <= Math.floor(selectedPlayerIds.size / 2);
      case "schedule":
        return startDate && endDate && playDays.size > 0 && selectedCourtIds.size > 0 && schedulePreview && schedulePreview.totalSlots >= schedulePreview.totalMatches;
      case "review": return true;
      default: return false;
    }
  };

  if (!showWizard) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Club Championships</h2>
          <Button onClick={() => { resetWizard(); setShowWizard(true); }}>
            <Trophy className="w-4 h-4 mr-2" /> Plan New Champs
          </Button>
        </div>

        {champsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : existingChamps.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No club championships planned yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {existingChamps.map((c: any) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.gender === "men" ? "Men's" : "Ladies'"} · {c.num_groups} groups · {c.status}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.start_date} to {c.end_date}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/club-champs/${c.id}`)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteChamp.mutate(c.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 text-sm overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            {i > 0 && <ChevronRight className="w-3 h-3 mx-1 text-muted-foreground shrink-0" />}
            <span className={`whitespace-nowrap px-2 py-1 rounded ${s === step ? "bg-primary text-primary-foreground font-medium" : i < stepIdx ? "text-primary" : "text-muted-foreground"}`}>
              {STEP_LABELS[s]}
            </span>
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === "gender" && (
        <Card>
          <CardHeader><CardTitle>Select Category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {(["men", "ladies"] as const).map((g) => (
                <Button
                  key={g}
                  variant={gender === g ? "default" : "outline"}
                  className="h-20 text-lg"
                  onClick={() => setGender(g)}
                >
                  {g === "men" ? "🏆 Men's" : "🏆 Ladies'"}
                </Button>
              ))}
            </div>
            <div>
              <Label>Championship Name (optional)</Label>
              <Input
                placeholder={`${gender === "men" ? "Men's" : "Ladies'"} Club Champs ${new Date().getFullYear()}`}
                value={champName}
                onChange={(e) => setChampName(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === "players" && (
        <Card>
           <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Select Players — {gender === "men" ? "Men" : "Ladies"}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedPlayerIds.size === genderMembers.length) {
                    setSelectedPlayerIds(new Set());
                  } else {
                    setSelectedPlayerIds(new Set(genderMembers.map((m) => m.id)));
                  }
                }}
              >
                {selectedPlayerIds.size === genderMembers.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedPlayerIds.size} of {genderMembers.length} selected. Uncheck to remove.
            </p>
          </CardHeader>
          <CardContent>
            {genderMembers.length === 0 ? (
              <p className="text-muted-foreground py-4">No {gender === "men" ? "male" : "female"} members found. Check member gender settings.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {genderMembers.map((m, i) => (
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
                    {m.league_player_rank && (
                      <Badge variant="secondary" className="text-xs">Rank {m.league_player_rank}</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "groups" && (
        <Card>
          <CardHeader><CardTitle>Number of Groups</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Divide {selectedPlayerIds.size} players into how many groups?</Label>
              <Select value={String(numGroups)} onValueChange={(v) => {
                const n = Number(v);
                setNumGroups(n);
                // Re-seed assignments for new group count
                const newMap = new Map<string, number>();
                selectedPlayers.forEach((p, i) => {
                  const cycle = Math.floor(i / n);
                  const idx = cycle % 2 === 0 ? i % n : n - 1 - (i % n);
                  newMap.set(p.id, idx);
                });
                setGroupAssignments(newMap);
              }}>
                <SelectTrigger className="w-32 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.floor(selectedPlayerIds.size / 2) }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} group{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Players are auto-distributed by ranking. Use the dropdown next to each player to move them between groups.
            </p>
            <div className="space-y-4">
              {groups.map((g, gi) => (
                <div key={gi} className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2">Group {gi + 1} <span className="text-muted-foreground font-normal">({g.length} players)</span></h4>
                  <div className="space-y-1">
                    {g.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 py-1">
                        <span className="flex-1 text-sm font-medium">{p.name || p.profiles?.name}</span>
                        {p.league_player_rank && (
                          <Badge variant="secondary" className="text-[10px]">#{p.league_player_rank}</Badge>
                        )}
                        <Select
                          value={String(groupAssignments.get(p.id) ?? 0)}
                          onValueChange={(v) => {
                            const newMap = new Map(groupAssignments);
                            newMap.set(p.id, Number(v));
                            setGroupAssignments(newMap);
                          }}
                        >
                          <SelectTrigger className="w-28 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: numGroups }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>Group {i + 1}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "schedule" && (
        <Card>
          <CardHeader><CardTitle>Schedule Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
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
                <p>🏟️ <strong>{schedulePreview.totalSlots}</strong> total slots ({schedulePreview.timeSlots.length} time slots × {selectedCourtIds.size} courts × {schedulePreview.allDates.length} days)</p>
                {schedulePreview.totalSlots < schedulePreview.totalMatches && (
                  <p className="text-destructive font-medium">⚠️ Not enough slots! Add more days, courts, or extend the time range.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader><CardTitle>Review & Generate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              <p><strong>Name:</strong> {champName || `${gender === "men" ? "Men's" : "Ladies'"} Club Champs ${new Date().getFullYear()}`}</p>
              <p><strong>Players:</strong> {selectedPlayerIds.size} in {numGroups} group{numGroups > 1 ? "s" : ""}</p>
              <p><strong>Period:</strong> {startDate} to {endDate}</p>
              <p><strong>Days:</strong> {Array.from(playDays).sort().map((d) => DAY_NAMES[d]).join(", ")}</p>
              <p><strong>Time:</strong> {startTime} – {endTime} ({matchDuration} min per match)</p>
              <p><strong>Courts:</strong> {Array.from(selectedCourtIds).map((id) => getCourtName(id)).join(", ")}</p>
            </div>

            <Separator />

            {schedulePreview && (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {groups.map((g, gi) => {
                  const groupMatches = schedulePreview.allMatches.filter((m) => m.groupNum === gi + 1);
                  return (
                    <div key={gi}>
                      <h4 className="font-medium mb-2">Group {gi + 1}</h4>
                      <div className="text-xs space-y-1">
                        {groupMatches.map((m, mi) => (
                          <div key={mi} className="flex items-center gap-2 p-1.5 rounded bg-muted/50">
                            <span className="text-muted-foreground w-20">{m.date ? format(new Date(m.date), "EEE dd MMM") : "TBD"}</span>
                            <span className="text-muted-foreground w-12">{m.time || "TBD"}</span>
                            <span className="font-medium">{getMemberName(m.playerA)}</span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="font-medium">{getMemberName(m.playerB)}</span>
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
        <Button variant="outline" onClick={() => stepIdx === 0 ? setShowWizard(false) : setStep(STEPS[stepIdx - 1])}>
          <ChevronLeft className="w-4 h-4 mr-1" /> {stepIdx === 0 ? "Cancel" : "Back"}
        </Button>
        {step === "review" ? (
          <Button onClick={() => createChamp.mutate()} disabled={createChamp.isPending}>
            {createChamp.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Generate Matches
          </Button>
        ) : (
          <Button onClick={() => goToStep(STEPS[stepIdx + 1])} disabled={!canProceed()}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
