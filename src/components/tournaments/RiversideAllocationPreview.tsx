import { useQuery } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { AllocationPreview } from "./AllocationPreview";
import { verifyPlanBlocks, type AllocationBooking, type AllocationMatch } from "@/lib/tournaments/allocation-preview";
import { stageScheduleIndex } from "@/lib/tournaments/stage-schedule";
import { Button } from "@/components/ui/button";
const RIVERSIDE = "11111111-1111-1111-1111-111111111111";
async function readAll(make: () => any) {
  const out: any[] = [];
  for (let start = 0; start < 10000; start += 1000) {
    const { data, error } = await make().range(start, start + 999).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
  throw new Error("Availability exceeds safe preview read limit");
}
/** Read-only inventory; the permission RPC also only reads. No commit exists. */
export function RiversideAllocationPreview({ clubId, tournamentId }: { clubId: string; tournamentId: string }) {
  const query = useQuery({
    queryKey: ["riverside-allocation-preview", clubId, tournamentId], enabled: clubId === RIVERSIDE,
    retry: false, refetchInterval: 10000,
    queryFn: async () => {
      const permission = await rpcExt("can_manage_tournament", { _tournament_id: tournamentId }).abortSignal(AbortSignal.timeout(15000));
      if (permission.error) throw permission.error;
      if (permission.data !== true) return null;
      const tournaments = await readAll(() => fromExt("tournaments").select("id,club_id,name,match_duration_minutes,group_durations,pool_durations,court_ids,beta_lifecycle,builder_spec,default_break_minutes").eq("club_id", clubId).order("id"));
      const tournament = tournaments.find((t) => t.id === tournamentId);
      if (!tournament) throw new Error("Selected tournament unavailable");
      const [bookings, rows, members] = await Promise.all([
        readAll(() => fromExt("bookings").select("id,club_id,court_id,date,start_time,end_time,external_id,source,booking_type,ops_note,user_id,club_member_id,opponent_id,opponent_member_id,guest_name,external_booker_name").eq("club_id", clubId).eq("status", "active").order("id")),
        readAll(() => fromExt("club_champs_matches").select("id,champ_id,group_number,pool_number,stage_key,scheduled_date,scheduled_time,court_id,booking_id,status,score,game_scores,winner_member_id,side_a_points,side_b_points,is_bye,play_by,player_a_member_id,player_b_member_id,partner_a_member_id,partner_b_member_id").in("champ_id", tournaments.map((t) => t.id)).order("id")),
        readAll(() => fromExt("club_members").select("id,name,person_id").eq("club_id", clubId).order("id")),
      ]);
      const byId = new Map(members.map((m) => [m.id, m]));
      const matches: AllocationMatch[] = rows.map((m) => {
        const parent = tournaments.find((t) => t.id === m.champ_id);
        const stage = stageScheduleIndex(parent?.builder_spec).get(m.stage_key);
        const duration = Number(parent?.pool_durations?.[`${m.group_number}:${m.pool_number}`] ?? parent?.group_durations?.[String(m.group_number)] ?? parent?.match_duration_minutes);
        return { ...m, duration: Number.isFinite(duration) && duration > 0 ? duration : null,
          deadline: stage?.rule === "play_by" ? stage.deadline : m.play_by,
          windowDate: stage?.rule === "fixed" ? stage.date : null, windowFrom: stage?.timeFrom, windowTo: stage?.timeTo,
          allowedCourts: stage?.courtIds.length ? stage.courtIds : parent?.court_ids?.length ? parent.court_ids : undefined,
          restMinutes: Number(parent?.default_break_minutes) || 0,
          title: `${byId.get(m.player_a_member_id)?.name ?? "TBD"} v ${byId.get(m.player_b_member_id)?.name ?? "TBD"}`,
          category: `Group ${m.group_number}${m.pool_number ? ` · Pool ${m.pool_number}` : ""}` };
      });
      const ids = matches.filter((m) => m.champ_id === tournamentId).map((m) => m.id);
      const locks = ids.length ? await readAll(() => fromExt("champ_marker_locks").select("match_id,heartbeat_at").in("match_id", ids).order("match_id")) : [];
      const fresh = new Set(locks.filter((l) => Date.now() - new Date(l.heartbeat_at).getTime() < 60000).map((l) => l.match_id));
      return { clubId, tournamentId, authorized: true, complete: true, bookings: bookings as AllocationBooking[],
        blocks: verifyPlanBlocks(bookings, tournament), matches: matches.map((m) => fresh.has(m.id) ? { ...m, status: "in_progress" } : m),
        personByMember: Object.fromEntries(members.filter((m) => m.person_id).map((m) => [m.id, m.person_id])),
        now: new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T") };
    },
  });
  if (clubId !== RIVERSIDE || query.data === null) return null;
  if (query.isPending) return <p className="mt-3 text-xs text-muted-foreground">Loading read-only allocation availability…</p>;
  if (query.isError) return <div className="mt-3 text-xs"><p>Move / Swap preview unavailable: ownership or availability could not be verified.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry preview</Button></div>;
  return query.data ? <AllocationPreview key={tournamentId} context={query.data} /> : null;
}
