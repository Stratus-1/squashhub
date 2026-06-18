import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, FileSpreadsheet, Printer, User, CalendarClock, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, eachDayOfInterval, getDay } from "date-fns";
import { useMemberContext } from "@/contexts/MemberContext";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { TournamentRegisterCard } from "@/components/TournamentRegisterCard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { SwapFixtureButton } from "@/components/tournaments/SwapFixtureButton";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed", open: "Open" };

/**
 * Rank-based heat colour for standings rows.
 * Top = dark green, fading through light green, then pink, to red at the bottom.
 */
function getRankRowStyle(rank: number, total: number): React.CSSProperties {
  if (total <= 1) return { backgroundColor: "hsl(140 55% 40% / 0.85)", color: "hsl(0 0% 100%)" };
  const t = rank / (total - 1); // 0 = top, 1 = bottom
  let h: number, s: number, l: number;
  if (t <= 0.5) {
    // Dark green -> light green
    const k = t / 0.5;
    h = 140;
    s = 50 - k * 15;        // 50% -> 35%
    l = 38 + k * 50;        // 38% -> 88%
  } else {
    // Light pink -> red
    const k = (t - 0.5) / 0.5;
    h = 350 - k * 10;       // 350 -> 340 (pink -> red-pink)
    s = 70 + k * 10;        // 70% -> 80%
    l = 88 - k * 38;        // 88% -> 50%
  }
  const bg = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  const color = l < 55 ? "hsl(0 0% 100%)" : "hsl(220 25% 15%)";
  return { backgroundColor: bg, color };
}

export default function ClubChampsView() {
  const { champId } = useParams<{ champId: string }>();
  const { activeMember } = useMemberContext();
  const myMemberId = activeMember?.id;

  const { data: champ, isLoading } = useQuery({
    queryKey: ["club-champ", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs").select("*").eq("id", champId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!champId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["club-champ-entries", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, club_members:club_member_id(id, name, user_id, ladder_position, profiles:user_id(name, avatar_url)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!champId,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["club-champ-matches", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .eq("champ_id", champId!)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!champId,
    refetchInterval: 5000,
  });

  const isDoubles = champ?.match_type === "doubles";

  const { data: clubInfo } = useQuery({
    queryKey: ["club-payment-gateway", champ?.club_id],
    queryFn: async () => {
      const { data } = await fromExt("clubs").select("payment_gateway").eq("id", champ!.club_id).maybeSingle();
      return data as { payment_gateway: string | null } | null;
    },
    enabled: !!champ?.club_id,
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ["club-champ-registrations", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, status, partner_confirmed, club_member_id, partner_member_id, member:club_member_id(id, name, profiles:user_id(name, avatar_url)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId!)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champId,
  });

  // Admin-only: include cancelled (declined) rows so admins can see who said no
  const { data: allRegistrations = [] } = useQuery({
    queryKey: ["club-champ-registrations-all", champId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, status, partner_confirmed, club_member_id, invited_at, confirmed_at, confirmation_source, paid_at, fee_paid_cents, member:club_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", champId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!champId,
  });



  const getPlayerName = (player: any) => player?.name || player?.profiles?.name || "Unknown";

  const getTeamName = (player: any, partner: any) => {
    if (!partner) return getPlayerName(player);
    return `${getPlayerName(player)} & ${getPlayerName(partner)}`;
  };

  // Build standings per league (includes substitutes who appear in completed matches but were not in original entries)
  const byeHandling: string = (champ as any)?.bye_handling || "no_match";
  const tournamentFormat = getTournamentFormat((champ as any)?.scoring_mode);
  const standingsColumns = tournamentFormat.standingsColumns;
  const isBells = tournamentFormat.key === "time_capped_points";

  // Chronological sort for per-game point columns
  const sortMatchesChrono = (arr: any[]) =>
    [...arr].sort((a, b) => {
      const aKey = `${a.scheduled_date || "9999-12-31"} ${a.scheduled_time || "23:59:59"} ${String(a.round_number ?? 99).padStart(3, "0")}`;
      const bKey = `${b.scheduled_date || "9999-12-31"} ${b.scheduled_time || "23:59:59"} ${String(b.round_number ?? 99).padStart(3, "0")}`;
      return aKey.localeCompare(bKey);
    });


  const isCrossLeague = (champ as any)?.round_format === "cross_league";

  const getGroupStandings = (groupNum: number) => {
    const groupEntries = entries.filter((e: any) => e.group_number === groupNum);
    const groupMemberIds = new Set<string>(
      groupEntries.flatMap((e: any) => [e.club_member_id, e.partner_member_id].filter(Boolean) as string[])
    );
    // For cross-league play, a match "belongs" to this league if any of the league's
    // members took part. Otherwise we filter by group_number as before.
    const matchBelongsToGroup = (m: any) => {
      if (!isCrossLeague) return m.group_number === groupNum;
      return (
        groupMemberIds.has(m.player_a_member_id) ||
        groupMemberIds.has(m.player_b_member_id) ||
        (isDoubles && (groupMemberIds.has(m.partner_a_member_id) || groupMemberIds.has(m.partner_b_member_id)))
      );
    };
    // Exclude byes from standings entirely; we'll add walkover credit separately.
    const groupMatchesAll = matches.filter(
      (m: any) => matchBelongsToGroup(m) && !m.is_bye,
    );
    const groupMatches = sortMatchesChrono(groupMatchesAll.filter((m: any) => m.status === "completed"));
    const groupByes = matches.filter(
      (m: any) => matchBelongsToGroup(m) && m.is_bye,
    );
    // For per-game columns, count scheduled slots per pair (completed or not)
    const scheduledForMember = (memberId: string) =>
      sortMatchesChrono(groupMatchesAll).filter((m: any) =>
        m.player_a_member_id === memberId ||
        m.player_b_member_id === memberId ||
        (isDoubles && (m.partner_a_member_id === memberId || m.partner_b_member_id === memberId))
      );

    const computeFor = (memberId: string) => {
      const stats = {
        played: 0, won: 0, lost: 0,
        gamesWon: 0, gamesLost: 0, byes: 0,
        pointsFor: 0, pointsAgainst: 0,
      };
      groupByes.forEach((m: any) => {
        if (m.bye_member_id === memberId || m.player_a_member_id === memberId) stats.byes++;
      });
      groupMatches.forEach((m: any) => {
        tournamentFormat.applyMatchToStats(stats, m, memberId, isDoubles);
      });
      // Per-game points for the member, in chronological order across ALL scheduled matches
      // (so an unplayed slot leaves a gap = '-')
      const gamePoints: (number | null)[] = scheduledForMember(memberId).map((m: any) => {
        if (m.status !== "completed") return null;
        const isA =
          m.player_a_member_id === memberId ||
          (isDoubles && m.partner_a_member_id === memberId);
        const a = Number(m.side_a_points) || 0;
        const b = Number(m.side_b_points) || 0;
        return isA ? a : b;
      });
      return { ...stats, gamePoints };
    };

    const buildRow = (stats: ReturnType<typeof computeFor>) => {
      const byeWins = byeHandling === "walkover_win" ? stats.byes : 0;
      const totalPlayed = stats.played + byeWins;
      const totalWon = stats.won + byeWins;
      return {
        ...stats,
        played: totalPlayed,
        won: totalWon,
        gameDiff: stats.gamesWon - stats.gamesLost,
        pointsDiff: stats.pointsFor - stats.pointsAgainst,
        // Standard tournament points (used for ranking in standard mode).
        points: totalWon * 2 + (totalPlayed - totalWon - stats.lost),
      };
    };

    const rows = groupEntries.map((e: any) => {
      const stats = computeFor(e.club_member_id);
      return {
        ...e,
        ...buildRow(stats),
        name: isDoubles
          ? getTeamName(e.club_members, e.partner)
          : getPlayerName(e.club_members),
      };
    });

    // Add substitutes — any member appearing in completed matches but not already represented by an entry
    const knownIds = new Set<string>();
    groupEntries.forEach((e: any) => {
      if (e.club_member_id) knownIds.add(e.club_member_id);
      if (e.partner_member_id) knownIds.add(e.partner_member_id);
    });
    const subs = new Map<string, { name: string }>();
    groupMatches.forEach((m: any) => {
      const slots: Array<["player_a" | "player_b" | "partner_a" | "partner_b", any]> = [
        ["player_a", m.player_a],
        ["player_b", m.player_b],
      ];
      if (isDoubles) {
        slots.push(["partner_a", m.partner_a]);
        slots.push(["partner_b", m.partner_b]);
      }
      slots.forEach(([slot, p]) => {
        const id = m[`${slot}_member_id`];
        if (id && !knownIds.has(id) && !subs.has(id)) {
          subs.set(id, { name: getPlayerName(p) });
        }
      });
    });

    subs.forEach((info, id) => {
      const stats = computeFor(id);
      if (stats.played === 0 && stats.byes === 0) return;
      rows.push({
        id: `sub-${id}`,
        club_member_id: id,
        partner_member_id: null,
        ...buildRow(stats),
        name: info.name,
        isSubstitute: true,
      } as any);
    });

    // Strategy-driven ranking.
    return rows.sort((a: any, b: any) => tournamentFormat.rankStandings(a, b));
  };


  const groupNumbers = [...new Set(entries.map((e: any) => e.group_number as number))].sort();

  const hcLabel = (h: any) => {
    const n = Number(h) || 0;
    return n !== 0 ? ` (HCP ${n > 0 ? "+" : ""}${n})` : "";
  };
  const getMatchTeamA = (m: any) => (isDoubles ? getTeamName(m.player_a, m.partner_a) : getPlayerName(m.player_a)) + hcLabel(m.handicap_a);
  const getMatchTeamB = (m: any) => (isDoubles ? getTeamName(m.player_b, m.partner_b) : getPlayerName(m.player_b)) + hcLabel(m.handicap_b);

  const isMyMatch = (m: any) =>
    myMemberId && (m.player_a_member_id === myMemberId || m.player_b_member_id === myMemberId ||
      m.partner_a_member_id === myMemberId || m.partner_b_member_id === myMemberId);

  const myMatches = matches.filter(isMyMatch);
  const myGroupNumbers = [...new Set(entries.filter((e: any) => e.club_member_id === myMemberId || e.partner_member_id === myMemberId).map((e: any) => e.group_number as number))];


  const getCrossLeagueCsvHeaders = () => {
    if (!champ || !isCrossLeague) return null;
    const sample = matches.find((m: any) => m.player_a_member_id && m.player_b_member_id);
    if (!sample) return null;
    const entryGroup = (memberId: string | null) => {
      if (!memberId) return null;
      const e = entries.find((entry: any) =>
        entry.club_member_id === memberId || entry.partner_member_id === memberId
      );
      return e?.group_number ?? null;
    };
    const gA = entryGroup(sample.player_a_member_id) ?? entryGroup(sample.partner_a_member_id);
    const gB = entryGroup(sample.player_b_member_id) ?? entryGroup(sample.partner_b_member_id);
    if (gA == null || gB == null) return null;
    return { a: getGroupLabel(champ, gA), b: getGroupLabel(champ, gB) };
  };

  const exportCSV = () => {
    if (!champ) return;
    const crossHeaders = getCrossLeagueCsvHeaders();
    const headerA = crossHeaders ? crossHeaders.a : (isDoubles ? "Team A" : "Player A");
    const headerB = crossHeaders ? crossHeaders.b : (isDoubles ? "Team B" : "Player B");
    const rows = [["Date", "Time", "Court", "League", headerA, headerB, "Status", "Winner", "Score"]];
    matches.forEach((m: any) => {
      rows.push([
        m.scheduled_date || "",
        m.scheduled_time || "",
        m.court?.name || "",
        `League ${m.group_number}`,
        getMatchTeamA(m),
        getMatchTeamB(m),
        m.status,
        m.winner_member_id ? (m.winner_member_id === m.player_a_member_id ? getMatchTeamA(m) : getMatchTeamB(m)) : "",
        m.score || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${champ.name.replace(/\s+/g, "_")}_fixtures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canManage = useHasPermission("champs");
  const qc = useQueryClient();

  const unassignedCount = matches.filter(
    (m: any) => !m.is_bye && m.status === "scheduled" && (!m.scheduled_date || !m.scheduled_time || !m.court_id),
  ).length;

  const rescheduleUnassigned = useMutation({
    mutationFn: async () => {
      if (!champ) throw new Error("Tournament not loaded");

      // 1. Identify TBD matches needing slots
      const tbdMatches = matches.filter(
        (m: any) => !m.is_bye && m.status === "scheduled" && (!m.scheduled_date || !m.scheduled_time || !m.court_id),
      );
      if (tbdMatches.length === 0) {
        throw new Error("No unassigned matches to reschedule");
      }

      // 2. Determine candidate slots: play days × time slots × courts
      const playDaysSet = new Set((champ.play_days as number[]) || []);
      const allDates = eachDayOfInterval({
        start: new Date(champ.start_date),
        end: new Date(champ.end_date),
      }).filter((d) => playDaysSet.has(getDay(d)));

      const matchDuration = champ.match_duration_minutes || 30;
      const [sh, sm] = (champ.start_time || "18:00").split(":").map(Number);
      const [eh, em] = (champ.end_time || "20:00").split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const slotsPerSession = Math.max(0, Math.floor((endMins - startMins) / matchDuration));
      const timeSlots: string[] = [];
      for (let i = 0; i < slotsPerSession; i++) {
        const mins = startMins + i * matchDuration;
        timeSlots.push(
          `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
        );
      }

      // Reuse the courts already used by this tournament's existing matches
      const courtIds = [
        ...new Set(
          matches.map((m: any) => m.court_id).filter((c: any) => c != null) as number[],
        ),
      ];
      if (courtIds.length === 0) {
        throw new Error("This tournament has no courts assigned. Edit it from the admin panel first.");
      }

      // 3. Build the set of slots already taken (by THIS champ's other matches)
      const takenSlots = new Set<string>();
      matches.forEach((m: any) => {
        if (m.scheduled_date && m.scheduled_time && m.court_id) {
          takenSlots.add(`${m.scheduled_date}|${m.scheduled_time.slice(0, 5)}|${m.court_id}`);
        }
      });

      // 4. Track each player's last play date (2-day gap rule)
      const entityLastDate = new Map<string, string>();
      matches.forEach((m: any) => {
        if (!m.scheduled_date) return;
        [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id]
          .filter(Boolean)
          .forEach((pid: string) => {
            const cur = entityLastDate.get(pid);
            if (!cur || new Date(m.scheduled_date) > new Date(cur)) {
              entityLastDate.set(pid, m.scheduled_date);
            }
          });
      });

      const canScheduleOn = (pid: string, dateStr: string) => {
        const last = entityLastDate.get(pid);
        if (!last) return true;
        const diff = Math.round(
          (new Date(dateStr).getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24),
        );
        return Math.abs(diff) >= 2;
      };

      // 5. Allocate slots
      const updates: { id: string; date: string; time: string; courtId: number; players: string[] }[] = [];
      for (const m of tbdMatches) {
        const players = [
          m.player_a_member_id,
          m.player_b_member_id,
          m.partner_a_member_id,
          m.partner_b_member_id,
        ].filter(Boolean) as string[];

        let assigned = false;
        outer: for (const d of allDates) {
          const ds = format(d, "yyyy-MM-dd");
          if (!players.every((p) => canScheduleOn(p, ds))) continue;
          for (const ts of timeSlots) {
            for (const cid of courtIds) {
              const key = `${ds}|${ts}|${cid}`;
              if (takenSlots.has(key)) continue;
              updates.push({ id: m.id, date: ds, time: ts, courtId: cid, players });
              takenSlots.add(key);
              players.forEach((p) => entityLastDate.set(p, ds));
              assigned = true;
              break outer;
            }
          }
        }
        if (!assigned) break; // out of capacity
      }

      if (updates.length === 0) {
        throw new Error("No free slots available — try expanding the tournament window or adding courts.");
      }

      // 6. Persist match updates one by one
      for (const u of updates) {
        const { error } = await fromExt("club_champs_matches")
          .update({
            scheduled_date: u.date,
            scheduled_time: u.time,
            court_id: u.courtId,
          })
          .eq("id", u.id);
        if (error) throw error;
      }

      // 7. Create court bookings (best-effort)
      const allPlayerIds = [...new Set(updates.flatMap((u) => u.players))];
      const { data: memberUsers } = await fromExt("club_members")
        .select("id, user_id")
        .in("id", allPlayerIds);
      const userMap = new Map((memberUsers || []).map((m: any) => [m.id, m.user_id]));

      const bookings = updates
        .map((u) => {
          const bookerId = userMap.get(u.players[0]);
          if (!bookerId) return null;
          const [h, mn] = u.time.split(":").map(Number);
          const endTotal = h * 60 + mn + matchDuration;
          const endTimeStr = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
          return {
            user_id: bookerId,
            court_id: u.courtId,
            date: u.date,
            start_time: u.time,
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

      return { scheduled: updates.length, remaining: tbdMatches.length - updates.length };
    },
    onSuccess: ({ scheduled, remaining }) => {
      if (remaining > 0) {
        toast.warning(`Scheduled ${scheduled} match${scheduled === 1 ? "" : "es"}; ${remaining} could not fit. Expand dates or add courts.`);
      } else {
        toast.success(`Scheduled ${scheduled} previously TBD match${scheduled === 1 ? "" : "es"}.`);
      }
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to reschedule"),
  });

  // Safety-net: if the tournament is not visible on the current host (typically
  // because the user opened the invite link on www.squashhub.co.za but the
  // tournament belongs to a club subdomain like nsc.squashhub.co.za), look up
  // the owning club's subdomain and redirect to the correct host.
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (isLoading || champ || !champId) return;
    const host = window.location.hostname.toLowerCase();
    // Only attempt cross-host redirect on the production root domain.
    if (host !== "www.squashhub.co.za" && host !== "squashhub.co.za") return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await rpcExt("get_champ_host", { _champ_id: champId });
        if (error || cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        const sub = row?.subdomain as string | undefined;
        if (sub) {
          setRedirecting(true);
          window.location.replace(`https://${sub}.squashhub.co.za/club-champs/${champId}`);
        }
      } catch {
        /* swallow — falls through to "Tournament not found" */
      }
    })();
    return () => { cancelled = true; };
  }, [isLoading, champ, champId]);

  if (isLoading || redirecting) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!champ) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Tournament not found.</div>;
  }


  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-6 print:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <button onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = "/league-games")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex gap-2 flex-wrap justify-end">
            {canManage && unassignedCount > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => rescheduleUnassigned.mutate()}
                disabled={rescheduleUnassigned.isPending}
              >
                {rescheduleUnassigned.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <CalendarClock className="w-4 h-4 mr-1" />
                )}
                Reschedule {unassignedCount} TBD match{unassignedCount === 1 ? "" : "es"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold font-heading">{champ.name}</h1>
          <p className="text-muted-foreground">
            {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"} Tournament · {champ.start_date} to {champ.end_date}
          </p>
          <p className="text-sm text-muted-foreground">
            {(champ.play_days as number[])?.map((d: number) => DAY_NAMES[d]).join(", ")} · {champ.start_time?.slice(0, 5)} – {champ.end_time?.slice(0, 5)}
          </p>
        </div>


        {canManage && allRegistrations.length > 0 && (() => {
          const hasFee = Number((champ as any)?.entry_fee_cents || 0) > 0;
          const DECLINED = new Set(["cancelled"]);
          const PAID_STATUSES = new Set(["paid", "waived"]);
          const nameOf = (r: any) => r.member?.name || r.member?.profiles?.name || "Unknown";

          const buckets = {
            notInvited: [] as any[],
            invitedPending: [] as any[],
            confirmed: [] as any[],
            declined: [] as any[],
          };
          allRegistrations.forEach((r: any) => {
            const s = String(r.status || "").toLowerCase();
            if (DECLINED.has(s)) { buckets.declined.push(r); return; }
            if (r.confirmed_at) { buckets.confirmed.push(r); return; }
            if (!r.invited_at && !r.invited_by_admin) { buckets.notInvited.push(r); return; }
            buckets.invitedPending.push(r);
          });

          const paidCount = allRegistrations.filter((r: any) =>
            PAID_STATUSES.has(String(r.status || "").toLowerCase()) || (r.fee_paid_cents || 0) > 0
          ).length;
          const totalActive = allRegistrations.filter((r: any) => !DECLINED.has(String(r.status || "").toLowerCase())).length;

          const markInvited = async (ids: string[]) => {
            const { error } = await fromExt("club_champs_registrations")
              .update({ invited_at: new Date().toISOString() })
              .in("id", ids)
              .is("invited_at", null);
            if (error) { toast.error(error.message); return; }
            toast.success(`Marked ${ids.length} as invited`);
            qc.invalidateQueries({ queryKey: ["club-champ-registrations-all", champId] });
          };
          const toggleConfirmed = async (r: any) => {
            const patch: any = r.confirmed_at
              ? { confirmed_at: null, confirmed_by: null, confirmation_source: null }
              : { confirmed_at: new Date().toISOString(), confirmation_source: "admin" };
            const { error } = await fromExt("club_champs_registrations").update(patch).eq("id", r.id);
            if (error) { toast.error(error.message); return; }
            qc.invalidateQueries({ queryKey: ["club-champ-registrations-all", champId] });
          };

          const Row = ({ r, showInvite }: { r: any; showInvite?: boolean }) => {
            const isPaid = PAID_STATUSES.has(String(r.status || "").toLowerCase()) || (r.fee_paid_cents || 0) > 0;
            return (
              <li className="flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-background/60 border">
                <span className="flex-1 min-w-0 truncate">{nameOf(r)}</span>
                {hasFee && (
                  <Badge variant={isPaid ? "default" : "outline"} className="text-[10px] px-1 py-0">
                    {isPaid ? "Paid" : "Unpaid"}
                  </Badge>
                )}
                {showInvite && !r.invited_at && (
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => markInvited([r.id])}>
                    Mark invited
                  </Button>
                )}
                {!DECLINED.has(String(r.status || "").toLowerCase()) && (
                  <Button
                    size="sm"
                    variant={r.confirmed_at ? "secondary" : "ghost"}
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => toggleConfirmed(r)}
                  >
                    {r.confirmed_at ? "Unconfirm" : "Confirm"}
                  </Button>
                )}
              </li>
            );
          };

          const Section = ({ icon: Icon, label, items, tone, showInvite }: any) => (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className={cn("w-3.5 h-3.5", tone)} /> {label} ({items.length})
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">None</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((r: any) => <Row key={r.id} r={r} showInvite={showInvite} />)}
                </ul>
              )}
            </div>
          );

          return (
            <Card className="print:hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Attendance Confirmations
                  {hasFee && (
                    <Badge variant="outline" className="text-[10px]">
                      Paid {paidCount}/{totalActive}
                    </Badge>
                  )}
                  <Badge variant="outline" className="ml-auto text-[10px]">Admin only</Badge>
                  {buckets.notInvited.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => markInvited(buckets.notInvited.map((r: any) => r.id))}
                    >
                      Mark all {buckets.notInvited.length} as invited
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Section icon={Clock} tone="text-muted-foreground" label="Not invited" items={buckets.notInvited} showInvite />
                  <Section icon={Clock} tone="text-amber-600" label="Invited – awaiting" items={buckets.invitedPending} />
                  <Section icon={CheckCircle2} tone="text-green-600" label="Confirmed" items={buckets.confirmed} />
                  <Section icon={XCircle} tone="text-red-600" label="Declined" items={buckets.declined} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  {hasFee
                    ? "Paid and Confirmed are tracked separately. A player is ready when both are ticked."
                    : "This tournament has no entry fee — only confirmation is tracked."}
                </p>
              </CardContent>
            </Card>
          );
        })()}


        {groupNumbers.length === 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Registration pending</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The tournament schedule will appear here once players have accepted and registrations are finalized.
              </p>
              {myMemberId ? (
                (() => {
                  const myReg = registrations.find(
                    (r: any) => r.club_member_id === myMemberId || r.partner_member_id === myMemberId,
                  );
                  const isInviteOnly = champ.registration_mode === "invite";
                  // In invite mode, only show the register card to invitees (anyone with a
                  // pre-created registration row). In open mode, show to everyone.
                  if (isInviteOnly && !myReg) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        This tournament is invitation only. You haven't been invited — please contact the tournament organiser if you'd like to take part.
                      </p>
                    );
                  }
                  return (
                    <div id="tournament-register-card">
                      <TournamentRegisterCard
                        champ={champ}
                        clubId={champ.club_id}
                        memberId={myMemberId}
                        paymentGateway={clubInfo?.payment_gateway || null}
                        allowSelfSignup
                      />
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-muted-foreground">Please sign in with the invited member account to respond.</p>
              )}

              {(() => {
                // Hide players who have already been chosen as someone else's partner
                // so they don't show up twice (once as the paired team, once as a solo entry).
                const partneredIds = new Set<string>(
                  registrations
                    .filter((r: any) => r.partner_member_id)
                    .map((r: any) => r.partner_member_id as string),
                );
                const visible = registrations.filter(
                  (r: any) => !partneredIds.has(r.club_member_id),
                );
                const byLadder = (a: any, b: any) => {
                  const ap = a.member?.ladder_position ?? Number.MAX_SAFE_INTEGER;
                  const bp = b.member?.ladder_position ?? Number.MAX_SAFE_INTEGER;
                  if (ap !== bp) return ap - bp;
                  return getPlayerName(a.member).localeCompare(getPlayerName(b.member));
                };
                const registered = visible
                  .filter((r: any) => r.status === "paid" || r.status === "waived")
                  .sort(byLadder);
                const invited = visible
                  .filter((r: any) => r.status === "pending_payment" || r.status === "pending_eft")
                  .sort(byLadder);


                const renderRow = (r: any, kind: "registered" | "invited") => {
                  const name = getPlayerName(r.member);
                  const partnerName = r.partner ? getPlayerName(r.partner) : null;
                  const isMe = r.club_member_id === myMemberId || r.partner_member_id === myMemberId;
                  const myInvite = isMe && kind === "invited";
                  return (
                    <li
                      key={r.id}
                      onClick={myInvite ? () => {
                        document.getElementById("tournament-register-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      } : undefined}
                      className={cn(
                        "flex items-center gap-2 text-sm p-2 rounded bg-background/60 border",
                        isMe && "ring-1 ring-primary/40",
                        myInvite && "cursor-pointer hover:bg-primary/10",
                      )}
                    >
                      <span className="font-medium flex-1 truncate">
                        {name}
                        {partnerName && <span className="text-muted-foreground"> & {partnerName}</span>}
                        {isMe && <Badge variant="secondary" className="text-[9px] ml-1.5">You</Badge>}
                        {myInvite && <span className="text-[10px] text-primary ml-1.5">· click to register</span>}
                      </span>
                      <Badge variant={kind === "registered" ? "default" : "outline"} className="text-[10px]">
                        {kind === "registered"
                          ? (r.status === "waived" ? "Entered" : "Registered")
                          : r.status === "pending_eft" ? "EFT pending" : "Invited"}
                      </Badge>
                    </li>
                  );
                };

                return (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Registered Players ({registered.length})
                      </p>
                      {registered.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No one has registered yet.</p>
                      ) : (
                        <ul className="space-y-1.5">{registered.map((r) => renderRow(r, "registered"))}</ul>
                      )}
                    </div>

                    {invited.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Invited — Awaiting Payment ({invited.length})
                        </p>
                        <ul className="space-y-1.5">{invited.map((r) => renderRow(r, "invited"))}</ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {groupNumbers.length > 0 && myMemberId && myMatches.length > 0 ? (

          <Tabs defaultValue="my-fixtures" className="space-y-4">
            <TabsList className="w-full">
              <TabsTrigger value="my-fixtures" className="flex-1 gap-1"><User className="w-3.5 h-3.5" /> My Fixtures</TabsTrigger>
              <TabsTrigger value="all-groups" className="flex-1">All Leagues</TabsTrigger>
            </TabsList>

            <TabsContent value="my-fixtures" className="space-y-4">
              {/* My league standings */}
              {myGroupNumbers.map((gn: number) => {
                const standings = getGroupStandings(gn);
                const maxGames = Math.max(0, ...standings.map((s: any) => s.gamePoints?.length || 0));
                return (
                  <Card key={gn}>
                    <CardHeader><CardTitle className="text-lg">{getGroupLabel(champ, gn)}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 font-medium">#</th>
                              <th className="pb-2 font-medium">{isDoubles ? "Team" : "Player"}</th>
                              {isBells ? (
                                <>
                                  <th className="pb-2 font-medium text-center" title="Games played">GP</th>
                                  <th className="pb-2 font-medium text-center" title="Games won">W</th>
                                  <th className="pb-2 font-medium text-center" title="Games lost">L</th>
                                  <th className="pb-2 font-medium text-center" title="Points for (scored) — used for ranking">PF</th>
                                  <th className="pb-2 font-medium text-center" title="Points against (conceded)">PA</th>
                                  <th className="pb-2 font-medium text-center" title="Points difference">+/-</th>
                                  {Array.from({ length: maxGames }).map((_, gi) => (
                                    <th key={`g${gi}`} className="pb-2 font-medium text-center text-muted-foreground" title={`Game ${gi + 1} points scored`}>G{gi + 1}</th>
                                  ))}
                                </>
                              ) : (
                                <>
                                  <th className="pb-2 font-medium text-center">P</th>
                                  <th className="pb-2 font-medium text-center">W</th>
                                  <th className="pb-2 font-medium text-center">L</th>
                                  {standingsColumns.map((col) => (
                                    <th key={col.key} className="pb-2 font-medium text-center" title={col.title}>{col.label}</th>
                                  ))}
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((s: any, i: number) => {
                              const isMe = s.club_member_id === myMemberId || s.partner_member_id === myMemberId;
                              const rowStyle = getRankRowStyle(i, standings.length);
                              return (
                                <tr key={s.id} style={rowStyle} className={cn("border-b border-border/30", isMe && "font-semibold ring-2 ring-inset ring-primary/60")}>
                                  <td className="py-2 text-muted-foreground">{i + 1}</td>
                                  <td className="py-2 font-medium">{s.name} {isMe && <Badge variant="secondary" className="text-[9px] ml-1">You</Badge>} {s.isSubstitute && <Badge variant="outline" className="text-[9px] ml-1">Sub</Badge>}</td>
                                  {isBells ? (
                                    <>
                                      <td className="py-2 text-center tabular-nums">{s.played}</td>
                                      <td className="py-2 text-center tabular-nums">{s.won}</td>
                                      <td className="py-2 text-center tabular-nums">{s.lost}</td>
                                      <td className="py-2 text-center font-semibold tabular-nums">{s.pointsFor}</td>
                                      <td className="py-2 text-center tabular-nums">{s.pointsAgainst}</td>
                                      <td className="py-2 text-center tabular-nums">{s.pointsDiff > 0 ? `+${s.pointsDiff}` : s.pointsDiff}</td>
                                      {Array.from({ length: maxGames }).map((_, gi) => {
                                        const v = s.gamePoints?.[gi];
                                        return (
                                          <td key={`g${gi}`} className="py-2 text-center tabular-nums text-muted-foreground">
                                            {v == null ? "–" : v}
                                          </td>
                                        );
                                      })}
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2 text-center">{s.played}</td>
                                      <td className="py-2 text-center">{s.won}</td>
                                      <td className="py-2 text-center">{s.lost}</td>
                                      {standingsColumns.map((col) => (
                                        <td key={col.key} className={cn("py-2 text-center", col.cellClassName)}>{col.render(s)}</td>
                                      ))}
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* My fixtures list */}
              <Card>
                <CardHeader><CardTitle className="text-lg">My Schedule</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {myMatches.map((m: any) => {
                      const isA = m.player_a_member_id === myMemberId || m.partner_a_member_id === myMemberId;
                      const opponent = isA ? getMatchTeamB(m) : getMatchTeamA(m);
                      const won = m.winner_member_id === myMemberId;
                      const lost = m.winner_member_id && m.winner_member_id !== myMemberId;
                      const isBye = !!m.is_bye;

                      const dateLabel = m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : isBye ? `Round ${m.round_number}` : "TBD";
                      const timeLabel = isBye ? "—" : (m.scheduled_time?.slice(0, 5) || "TBD");
                      const statusLabel = isBye
                        ? (byeHandling === "walkover_win" ? "Bye · walkover" : "Bye")
                        : m.status === "completed" ? (won ? "Won" : lost ? "Lost" : "Played") : m.status;
                      return (
                        <div key={m.id} className={cn(
                          "text-sm p-2 rounded",
                          isBye ? "bg-amber-500/10 border border-amber-500/20" :
                          m.status === "completed"
                            ? won ? "bg-green-500/10" : lost ? "bg-destructive/10" : "bg-muted/50"
                            : "bg-muted/50"
                        )}>
                          {/* Top row: date · time · court · status */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{dateLabel}</span>
                            <span>{timeLabel}</span>
                            {!isBye && m.court && <span>· {m.court.name}</span>}
                            <Badge
                              variant={isBye ? "outline" : m.status === "completed" ? (won ? "default" : "secondary") : "secondary"}
                              className={cn("ml-auto text-[10px] shrink-0", isBye && "border-amber-500/40 text-amber-600 dark:text-amber-400")}
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                          {/* Bottom row: opponent + score */}
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-medium flex-1 min-w-0 break-words">
                              {isBye ? "BYE (rest round)" : `vs ${opponent}`}
                            </span>
                            {!isBye && m.score && <Badge variant="secondary" className="text-xs shrink-0">{m.score}</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all-groups" className="space-y-4">
              {renderAllGroups()}
            </TabsContent>
          </Tabs>
        ) : groupNumbers.length > 0 ? (
          <div className="space-y-4">{renderAllGroups()}</div>
        ) : null}
      </div>
    </div>
  );

  function computeLeagueTotals() {
    const memberToGroup = new Map<string, number>();
    entries.forEach((e: any) => {
      if (e.club_member_id) memberToGroup.set(e.club_member_id, e.group_number);
      if (e.partner_member_id) memberToGroup.set(e.partner_member_id, e.group_number);
    });
    const totals = new Map<number, { gp: number; won: number; lost: number; pf: number; pa: number }>();
    groupNumbers.forEach((gn: number) => totals.set(gn, { gp: 0, won: 0, lost: 0, pf: 0, pa: 0 }));

    const completed = matches.filter((m: any) => !m.is_bye && m.status === "completed");
    for (const m of completed) {
      const aGroup = memberToGroup.get(m.player_a_member_id) ?? (isDoubles ? memberToGroup.get(m.partner_a_member_id) : undefined);
      const bGroup = memberToGroup.get(m.player_b_member_id) ?? (isDoubles ? memberToGroup.get(m.partner_b_member_id) : undefined);
      if (aGroup == null || bGroup == null || aGroup === bGroup) continue;
      const a = Number(m.side_a_points) || 0;
      const b = Number(m.side_b_points) || 0;
      const tA = totals.get(aGroup)!;
      const tB = totals.get(bGroup)!;
      tA.gp += 1; tB.gp += 1;
      tA.pf += a; tA.pa += b;
      tB.pf += b; tB.pa += a;
      if (a > b) { tA.won += 1; tB.lost += 1; }
      else if (b > a) { tB.won += 1; tA.lost += 1; }
    }
    return totals;
  }

  function renderCrossLeagueSummary() {
    if (!isCrossLeague || groupNumbers.length < 2) return null;
    const totals = computeLeagueTotals();
    const rows = groupNumbers.map((gn: number) => ({ gn, ...totals.get(gn)! }));
    const anyPlayed = rows.some((r) => r.gp > 0);
    const maxPf = Math.max(...rows.map((r) => r.pf));
    const winners = rows.filter((r) => r.pf === maxPf).map((r) => r.gn);

    return (
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            League vs League — Summary
            {!anyPlayed ? (
              <Badge variant="secondary" className="ml-auto">Awaiting results</Badge>
            ) : winners.length === 1 ? (
              <Badge className="ml-auto">{getGroupLabel(champ, winners[0])} leading</Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">Tied</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">League</th>
                  <th className="pb-2 font-medium text-center" title="Cross-league games played">GP</th>
                  <th className="pb-2 font-medium text-center">W</th>
                  <th className="pb-2 font-medium text-center">L</th>
                  <th className="pb-2 font-medium text-center" title="Total points scored">PF</th>
                  <th className="pb-2 font-medium text-center" title="Total points conceded">PA</th>
                  <th className="pb-2 font-medium text-center" title="Points difference">+/-</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sorted = [...rows].sort((a, b) => b.pf - a.pf || (b.pf - b.pa) - (a.pf - a.pa));
                  return sorted.map((r, i) => {
                    const diff = r.pf - r.pa;
                    const isWinner = winners.length === 1 && winners[0] === r.gn;
                    const rowStyle = getRankRowStyle(i, sorted.length);
                    return (
                      <tr key={r.gn} style={rowStyle} className={cn("border-b border-border/30", isWinner && "font-semibold")}>
                        <td className="py-2">{getGroupLabel(champ, r.gn)}{isWinner && <Badge variant="default" className="text-[9px] ml-2">Leading</Badge>}</td>
                        <td className="py-2 text-center tabular-nums">{r.gp}</td>
                        <td className="py-2 text-center tabular-nums">{r.won}</td>
                        <td className="py-2 text-center tabular-nums">{r.lost}</td>
                        <td className="py-2 text-center font-semibold tabular-nums">{r.pf}</td>
                        <td className="py-2 text-center tabular-nums">{r.pa}</td>
                        <td className="py-2 text-center tabular-nums">{diff > 0 ? `+${diff}` : diff}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Winner ranked by total points scored (PF) across cross-league matches.
          </p>
        </CardContent>
      </Card>
    );
  }

  function renderMatchRow(m: any) {
    const mine = isMyMatch(m);
    const completed = m.status === "completed";
    const isBye = !!m.is_bye;
    const winnerIsA = !isBye && completed && m.winner_member_id === m.player_a_member_id;
    const winnerIsB = !isBye && completed && m.winner_member_id === m.player_b_member_id;

    let gameBadges: { a: number; b: number }[] = [];
    if (!isBye && m.game_scores) {
      try {
        const gs = JSON.parse(m.game_scores);
        gameBadges = gs.sets || [];
      } catch { /* ignore */ }
    }

    if (isBye) {
      return (
        <div key={m.id} className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm p-2 rounded border border-amber-500/20 bg-amber-500/10",
          mine && "ring-1 ring-primary/30",
        )}>
          <span className="text-muted-foreground w-24 shrink-0 text-xs">Round {m.round_number}</span>
          <span className="text-muted-foreground w-12 shrink-0 text-xs">—</span>
          <span className="font-medium">{getMatchTeamA(m)}</span>
          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">— BYE (rest round)</span>
          <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
            {byeHandling === "walkover_win" ? "Walkover" : byeHandling === "neutral" ? "Neutral" : "Bye"}
          </Badge>
        </div>
      );
    }

    const bellActive = !!m.bell_ends_at && new Date(m.bell_ends_at).getTime() > Date.now();
    const paused = typeof m.bell_paused_seconds === "number" && m.bell_paused_seconds > 0;
    const hasPoints = (m.side_a_points ?? 0) > 0 || (m.side_b_points ?? 0) > 0;
    const isLiveMatch = !completed && (bellActive || paused || (m.status === "in_progress" && hasPoints));
    const liveAAhead = isLiveMatch && (m.side_a_points ?? 0) > (m.side_b_points ?? 0);
    const liveBAhead = isLiveMatch && (m.side_b_points ?? 0) > (m.side_a_points ?? 0);

    return (
      <div key={m.id} className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm p-2 rounded",
        mine ? "bg-primary/10 border border-primary/20" : completed ? "bg-muted/30" : "bg-muted/50"
      )}>
        <span className="text-muted-foreground w-24 shrink-0 text-xs">
          {m.scheduled_date ? format(new Date(m.scheduled_date), "EEE dd MMM") : "TBD"}
        </span>
        <span className="text-muted-foreground w-12 shrink-0 text-xs">{m.scheduled_time?.slice(0, 5) || "TBD"}</span>
        <span className={cn(
          "font-medium px-2 py-0.5 rounded",
          ((completed && winnerIsA) || liveAAhead) && "bg-green-500/20 text-green-700 dark:text-green-300",
          ((completed && winnerIsB) || liveBAhead) && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        )}>
          {getMatchTeamA(m)}
        </span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className={cn(
          "font-medium px-2 py-0.5 rounded",
          ((completed && winnerIsB) || liveBAhead) && "bg-green-500/20 text-green-700 dark:text-green-300",
          ((completed && winnerIsA) || liveAAhead) && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        )}>
          {getMatchTeamB(m)}
        </span>

        {gameBadges.length > 0 && (
          <div className="flex gap-1 ml-auto">
            {gameBadges.map((g, i) => (
              <Badge key={i} variant="outline" className="text-[10px] tabular-nums px-1.5">
                {g.a}-{g.b}
              </Badge>
            ))}
          </div>
        )}
        {!gameBadges.length && m.score && (
          <Badge variant="secondary" className="ml-auto text-xs">{m.score}</Badge>
        )}

        {m.court && <Badge variant="outline" className="text-[10px]">{m.court.name}</Badge>}
        {(() => {
          if (completed) return null;
          if (isLiveMatch) {
            return (
              <span className="live-indicator text-[10px] px-2.5 py-1">
                LIVE {m.side_a_points ?? 0}-{m.side_b_points ?? 0}
              </span>
            );
          }
          return <Badge variant="secondary" className="text-[10px]">{m.status}</Badge>;
        })()}

        {canManage && !completed && m.scheduled_date && m.scheduled_time && (
          <SwapFixtureButton
            match={m}
            allMatches={matches}
            getMatchLabel={(x) => `${getMatchTeamA(x)} vs ${getMatchTeamB(x)}`}
            getCourtName={(x) => x.court?.name || ""}
            invalidateKeys={[["club-champ-matches", champId]]}
          />
        )}
      </div>
    );
  }

  function renderAllGroups() {

    const summary = renderCrossLeagueSummary();
    const leagueTotals = isCrossLeague ? computeLeagueTotals() : null;
    const maxLeaguePf = leagueTotals
      ? Math.max(0, ...Array.from(leagueTotals.values()).map((t) => t.pf))
      : 0;
    // When cross-league, order groups by leading PF so the league ahead is on top.
    const orderedGroups = isCrossLeague && leagueTotals
      ? [...groupNumbers].sort((a: number, b: number) => {
          const ta = leagueTotals.get(a)!;
          const tb = leagueTotals.get(b)!;
          return (tb.pf - ta.pf) || ((tb.pf - tb.pa) - (ta.pf - ta.pa)) || (a - b);
        })
      : groupNumbers;
    const groups = orderedGroups.map((gn: number) => {
      const standings = getGroupStandings(gn);
      const groupMemberIds = new Set<string>(
        entries.filter((e: any) => e.group_number === gn)
          .flatMap((e: any) => [e.club_member_id, e.partner_member_id].filter(Boolean) as string[])
      );
      const groupMatches = matches.filter((m: any) =>
        isCrossLeague
          ? (groupMemberIds.has(m.player_a_member_id) || groupMemberIds.has(m.player_b_member_id) ||
             (isDoubles && (groupMemberIds.has(m.partner_a_member_id) || groupMemberIds.has(m.partner_b_member_id))))
          : m.group_number === gn
      );
      const maxGames = Math.max(0, ...standings.map((s: any) => s.gamePoints?.length || 0));
      const leagueTotal = leagueTotals?.get(gn);
      const isLeading = !!leagueTotal && leagueTotal.pf > 0 && leagueTotal.pf === maxLeaguePf;

      return (
        <Card key={gn} className={cn(isLeading && "border-primary/40")}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
              <span>{getGroupLabel(champ, gn)}</span>
              {leagueTotal && leagueTotal.gp > 0 && (
                <>
                  <Badge variant={isLeading ? "default" : "secondary"} className="text-xs tabular-nums">
                    {leagueTotal.pf} pts{isLeading ? " · Leading" : ""}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-normal">
                    {leagueTotal.won}W–{leagueTotal.lost}L · {leagueTotal.pf}-{leagueTotal.pa}
                  </span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">{isDoubles ? "Team" : "Player"}</th>
                    {isBells ? (
                      <>
                        <th className="pb-2 font-medium text-center" title="Games played">GP</th>
                        <th className="pb-2 font-medium text-center" title="Games won">W</th>
                        <th className="pb-2 font-medium text-center" title="Games lost">L</th>
                        <th className="pb-2 font-medium text-center" title="Points for (scored) — used for ranking">PF</th>
                        <th className="pb-2 font-medium text-center" title="Points against (conceded)">PA</th>
                        <th className="pb-2 font-medium text-center" title="Points difference">+/-</th>
                        {Array.from({ length: maxGames }).map((_, gi) => (
                          <th key={`g${gi}`} className="pb-2 font-medium text-center text-muted-foreground" title={`Game ${gi + 1} points scored`}>G{gi + 1}</th>
                        ))}
                      </>
                    ) : (
                      <>
                        <th className="pb-2 font-medium text-center">P</th>
                        <th className="pb-2 font-medium text-center">W</th>
                        <th className="pb-2 font-medium text-center">L</th>
                        {standingsColumns.map((col) => (
                          <th key={col.key} className="pb-2 font-medium text-center" title={col.title}>{col.label}</th>
                        ))}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s: any, i: number) => {
                    const isMe = myMemberId && (s.club_member_id === myMemberId || s.partner_member_id === myMemberId);
                    const rowStyle = getRankRowStyle(i, standings.length);
                    return (
                      <tr key={s.id} style={rowStyle} className={cn("border-b border-border/30", isMe && "ring-2 ring-inset ring-primary/60")}>
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-medium">{s.name} {isMe && <Badge variant="secondary" className="text-[9px] ml-1">You</Badge>} {s.isSubstitute && <Badge variant="outline" className="text-[9px] ml-1">Sub</Badge>}</td>
                        {isBells ? (
                          <>
                            <td className="py-2 text-center tabular-nums">{s.played}</td>
                            <td className="py-2 text-center tabular-nums">{s.won}</td>
                            <td className="py-2 text-center tabular-nums">{s.lost}</td>
                            <td className="py-2 text-center font-semibold tabular-nums">{s.pointsFor}</td>
                            <td className="py-2 text-center tabular-nums">{s.pointsAgainst}</td>
                            <td className="py-2 text-center tabular-nums">{s.pointsDiff > 0 ? `+${s.pointsDiff}` : s.pointsDiff}</td>
                            {Array.from({ length: maxGames }).map((_, gi) => {
                              const v = s.gamePoints?.[gi];
                              return (
                                <td key={`g${gi}`} className="py-2 text-center tabular-nums text-muted-foreground">
                                  {v == null ? "–" : v}
                                </td>
                              );
                            })}
                          </>
                        ) : (
                          <>
                            <td className="py-2 text-center">{s.played}</td>
                            <td className="py-2 text-center">{s.won}</td>
                            <td className="py-2 text-center">{s.lost}</td>
                            {standingsColumns.map((col) => (
                              <td key={col.key} className={cn("py-2 text-center", col.cellClassName)}>{col.render(s)}</td>
                            ))}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isCrossLeague && (
              <>
                <Separator />

                  <div>
                  <h4 className="font-medium text-sm mb-2">Fixtures & Results</h4>
                  <div className="space-y-1.5">
                    {groupMatches.map((m: any) => renderMatchRow(m))}
                  </div>
                </div>
              </>
            )}

          </CardContent>
        </Card>
      );
    });
    // Cross-league: render a single combined Fixtures & Results card (matches are shared across leagues).
    const combinedFixtures = isCrossLeague ? (
      <Card key="cross-fixtures">
        <CardHeader>
          <CardTitle className="text-lg">Fixtures & Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {matches.map((m: any) => renderMatchRow(m))}
          </div>
        </CardContent>
      </Card>
    ) : null;
    return (
      <>
        {summary}
        {groups}
        {combinedFixtures}
      </>
    );
  }

}
