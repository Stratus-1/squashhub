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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Calendar, Users, Trophy, ChevronRight, ChevronLeft, Loader2, Trash2, Eye, Pencil, Plus, X } from "lucide-react";
import { format, eachDayOfInterval, getDay } from "date-fns";

interface ClubChampsTabProps {
  clubId: string;
}

type WizardStep = "category" | "players" | "groups" | "schedule" | "review";
type GenderCategory = "men" | "ladies" | "mixed";
type MatchType = "singles" | "doubles";

const STEPS: WizardStep[] = ["category", "players", "groups", "schedule", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  category: "Category",
  players: "Players",
  groups: "Groups",
  schedule: "Schedule",
  review: "Review & Generate",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DoublePair {
  id: string; // temporary id for UI
  player1Id: string;
  player2Id: string;
}

function generateRoundRobinRounds(entityIds: string[]): [string, string][][] {
  const entities = [...entityIds];
  if (entities.length % 2 !== 0) entities.push("BYE");
  const n = entities.length;
  const rounds: [string, string][][] = [];
  for (let round = 0; round < n - 1; round++) {
    const matches: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = entities[i];
      const b = entities[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") {
        matches.push([a, b]);
      }
    }
    rounds.push(matches);
    const last = entities.pop()!;
    entities.splice(1, 0, last);
  }
  return rounds;
}

const GENDER_LABELS: Record<GenderCategory, string> = {
  men: "Men's",
  ladies: "Ladies'",
  mixed: "Mixed",
};

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
  const [selectedCourtIds, setSelectedCourtIds] = useState<Set<number>>(new Set());
  const [groupAssignments, setGroupAssignments] = useState<Map<string, number>>(new Map());

  // Doubles-specific state
  const [doublesPairs, setDoublesPairs] = useState<DoublePair[]>([]);
  const [pairGroupAssignments, setPairGroupAssignments] = useState<Map<string, number>>(new Map());

  const stepIdx = STEPS.indexOf(step);

  // Filter members by gender
  const genderMembers = useMemo(() => {
    if (gender === "mixed") {
      return members.sort((a, b) => (a.ladder_position || 999) - (b.ladder_position || 999));
    }
    const matchValues = gender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return members
      .filter((m) => m.gender && matchValues.includes(m.gender.toLowerCase()))
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

  // Entities for scheduling = players (singles) or pair IDs (doubles)
  const isDoubles = matchType === "doubles";

  const goToStep = (s: WizardStep) => {
    if (s === "players" && step === "category") {
      if (!isDoubles) {
        setSelectedPlayerIds(new Set(genderMembers.map((m) => m.id)));
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
  };

  const selectedPlayers = useMemo(
    () => genderMembers.filter((m) => selectedPlayerIds.has(m.id)),
    [genderMembers, selectedPlayerIds]
  );

  // Number of "entities" (players for singles, pairs for doubles)
  const entityCount = isDoubles ? doublesPairs.length : selectedPlayerIds.size;

  // Build groups
  const groups = useMemo(() => {
    if (isDoubles) {
      const g: DoublePair[][] = Array.from({ length: numGroups }, () => []);
      doublesPairs.forEach((p) => {
        const gi = pairGroupAssignments.get(p.id) ?? 0;
        if (gi < numGroups) g[gi].push(p);
      });
      return g;
    }
    const g: ClubMember[][] = Array.from({ length: numGroups }, () => []);
    selectedPlayers.forEach((p) => {
      const gi = groupAssignments.get(p.id) ?? 0;
      if (gi < numGroups) g[gi].push(p);
    });
    return g;
  }, [isDoubles, selectedPlayers, doublesPairs, numGroups, groupAssignments, pairGroupAssignments]);

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
      date?: string; time?: string; courtId?: number;
    };
    const allMatches: MatchDef[] = [];

    if (isDoubles) {
      (groups as DoublePair[][]).forEach((groupPairs, gi) => {
        const pairIds = groupPairs.map((p) => p.id);
        const rounds = generateRoundRobinRounds(pairIds);
        rounds.forEach((roundMatches, ri) => {
          roundMatches.forEach(([a, b]) => {
            allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, entityA: a, entityB: b });
          });
        });
      });
    } else {
      (groups as ClubMember[][]).forEach((groupPlayers, gi) => {
        const playerIds = groupPlayers.map((p) => p.id);
        const rounds = generateRoundRobinRounds(playerIds);
        rounds.forEach((roundMatches, ri) => {
          roundMatches.forEach(([a, b]) => {
            allMatches.push({ groupNum: gi + 1, roundNum: ri + 1, entityA: a, entityB: b });
          });
        });
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

    const usedSlots = new Set<number>();
    for (const match of allMatches) {
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

    return { allMatches, totalSlots, totalMatches: allMatches.length, allDates, timeSlots };
  }, [groups, isDoubles, doublesPairs, startDate, endDate, playDays, selectedCourtIds, startTime, endTime, matchDuration]);

  // Create/update champ
  const createChamp = useMutation({
    mutationFn: async () => {
      if (!schedulePreview) throw new Error("No schedule generated");

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
          })
          .select()
          .single();
        if (champErr) throw champErr;
        champId = champ.id;
      }

      // Create entries
      if (isDoubles) {
        const entries = doublesPairs.flatMap((pair) => {
          const gi = pairGroupAssignments.get(pair.id) ?? 0;
          return [
            {
              champ_id: champId,
              club_member_id: pair.player1Id,
              partner_member_id: pair.player2Id,
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
            club_member_id: p.id,
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
        if (isDoubles) {
          const pairA = pairMap.get(m.entityA);
          const pairB = pairMap.get(m.entityB);
          return {
            champ_id: champId,
            group_number: m.groupNum,
            round_number: m.roundNum,
            player_a_member_id: pairA?.player1Id || m.entityA,
            partner_a_member_id: pairA?.player2Id || null,
            player_b_member_id: pairB?.player1Id || m.entityB,
            partner_b_member_id: pairB?.player2Id || null,
            scheduled_date: m.date,
            scheduled_time: m.time,
            court_id: m.courtId,
          };
        }
        return {
          champ_id: champId,
          group_number: m.groupNum,
          round_number: m.roundNum,
          player_a_member_id: m.entityA,
          player_b_member_id: m.entityB,
          scheduled_date: m.date,
          scheduled_time: m.time,
          court_id: m.courtId,
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
        .filter((m) => m.date && m.time && m.courtId)
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
          const endMins = h * 60 + min + matchDuration;
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
    onSuccess: () => {
      toast.success(editingChampId ? "Tournament updated & rescheduled!" : "Tournament created with all matches scheduled!");
      qc.invalidateQueries({ queryKey: ["club-champs"] });
      qc.invalidateQueries({ queryKey: ["club-champ-entries"] });
      qc.invalidateQueries({ queryKey: ["club-champ-matches"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setShowWizard(false);
      resetWizard();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create tournament"),
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; withBookings: boolean } | null>(null);

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
    setSelectedCourtIds(new Set());
    setGroupAssignments(new Map());
    setDoublesPairs([]);
    setPairGroupAssignments(new Map());
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

    const { data: entries } = await fromExt("club_champs_entries")
      .select("*")
      .eq("champ_id", champ.id);

    if (entries) {
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
    }

    const { data: champMatches } = await fromExt("club_champs_matches")
      .select("court_id")
      .eq("champ_id", champ.id);
    if (champMatches) {
      const courtIds = new Set(champMatches.map((m: any) => m.court_id).filter(Boolean) as number[]);
      setSelectedCourtIds(courtIds);
    }

    setStep("players");
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
    if (gender === "mixed") return members.filter((m) => !usedPlayerIds.has(m.id));
    const matchValues = gender === "men" ? ["men", "male", "m"] : ["ladies", "female", "f", "women"];
    return members
      .filter((m) => m.gender && matchValues.includes(m.gender.toLowerCase()) && !usedPlayerIds.has(m.id));
  }, [members, gender, usedPlayerIds]);

  const canProceed = () => {
    switch (step) {
      case "category": return true;
      case "players":
        if (isDoubles) return doublesPairs.length >= 2;
        return selectedPlayerIds.size >= 3;
      case "groups":
        return numGroups >= 1 && numGroups <= Math.floor(entityCount / 2);
      case "schedule":
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
      </div>
    );
  }

  // ── WIZARD VIEW ──
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

      {/* ── STEP: CATEGORY ── */}
      {step === "category" && (
        <Card>
          <CardHeader><CardTitle>Select Category</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium mb-2 block">Gender Category</Label>
              <div className="grid grid-cols-3 gap-3">
                {(["men", "ladies", "mixed"] as GenderCategory[]).map((g) => (
                  <Button
                    key={g}
                    variant={gender === g ? "default" : "outline"}
                    className="h-16 text-base"
                    onClick={() => setGender(g)}
                  >
                    {g === "men" ? "🏆 Men's" : g === "ladies" ? "🏆 Ladies'" : "🏆 Mixed"}
                  </Button>
                ))}
              </div>
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
                <Label className="text-sm font-medium">Enable Playoffs</Label>
                <p className="text-xs text-muted-foreground">
                  After group stages, matching positions play off (e.g. #1 vs #1, #2 vs #2). With 4+ groups, semi-finals and a final are added.
                </p>
              </div>
              <Switch checked={enablePlayoffs} onCheckedChange={setEnablePlayoffs} />
            </div>


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

      {/* ── STEP: PLAYERS (Singles) ── */}
      {step === "players" && !isDoubles && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Select Players — {GENDER_LABELS[gender]}</CardTitle>
              <Button
                variant="outline" size="sm"
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
              {selectedPlayerIds.size} of {genderMembers.length} selected
            </p>
          </CardHeader>
          <CardContent>
            {genderMembers.length === 0 ? (
              <p className="text-muted-foreground py-4">No matching members found. Check member gender settings.</p>
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
                    {m.gender && <Badge variant="outline" className="text-[10px]">{m.gender}</Badge>}
                    {m.ladder_position && <Badge variant="secondary" className="text-xs">#{m.ladder_position}</Badge>}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP: PLAYERS (Doubles — Pair Builder) ── */}
      {step === "players" && isDoubles && (
        <Card>
          <CardHeader>
            <CardTitle>Form Doubles Pairs — {GENDER_LABELS[gender]}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {doublesPairs.length} pair{doublesPairs.length !== 1 ? "s" : ""} formed. Select two players to create each pair.
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

      {/* ── STEP: GROUPS ── */}
      {step === "groups" && (
        <Card>
          <CardHeader><CardTitle>Number of Groups</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Divide {entityCount} {isDoubles ? "pairs" : "players"} into how many groups?</Label>
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
                    <SelectItem key={n} value={String(n)}>{n} group{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              {isDoubles ? "Pairs" : "Players"} are auto-distributed by order. Use the dropdown to move between groups.
            </p>
            <div className="space-y-4">
              {isDoubles ? (
                (groups as DoublePair[][]).map((g, gi) => (
                  <div key={gi} className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Group {gi + 1} <span className="text-muted-foreground font-normal">({g.length} pairs)</span></h4>
                    <div className="space-y-1">
                      {g.map((pair) => (
                        <div key={pair.id} className="flex items-center gap-2 py-1">
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
                                <SelectItem key={i} value={String(i)}>Group {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                (groups as ClubMember[][]).map((g, gi) => (
                  <div key={gi} className="border rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2">Group {gi + 1} <span className="text-muted-foreground font-normal">({g.length} players)</span></h4>
                    <div className="space-y-1">
                      {g.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 py-1">
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
                                <SelectItem key={i} value={String(i)}>Group {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP: SCHEDULE ── */}
      {step === "schedule" && (
        <Card>
          <CardHeader><CardTitle>Schedule Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
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
              <p><strong>{isDoubles ? "Pairs" : "Players"}:</strong> {entityCount} in {numGroups} group{numGroups > 1 ? "s" : ""}</p>
              <p><strong>Period:</strong> {startDate} to {endDate}</p>
              <p><strong>Days:</strong> {Array.from(playDays).sort().map((d) => DAY_NAMES[d]).join(", ")}</p>
              <p><strong>Time:</strong> {startTime} – {endTime} ({matchDuration} min per match)</p>
              <p><strong>Courts:</strong> {Array.from(selectedCourtIds).map((id) => getCourtName(id)).join(", ")}</p>
            </div>

            <Separator />

            {schedulePreview && (
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
        <Button variant="outline" onClick={() => stepIdx === 0 ? setShowWizard(false) : setStep(STEPS[stepIdx - 1])}>
          <ChevronLeft className="w-4 h-4 mr-1" /> {stepIdx === 0 ? "Cancel" : "Back"}
        </Button>
        {step === "review" ? (
          <Button onClick={() => createChamp.mutate()} disabled={createChamp.isPending}>
            {createChamp.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {editingChampId ? "Regenerate Matches" : "Generate Matches"}
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
