import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, ChevronRight, Calendar, CalendarClock } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TournamentRegisterCard } from "@/components/TournamentRegisterCard";
import { splitTournamentsByLifecycle } from "@/lib/tournaments/lifecycle";
import { ScheduleMatchDialog } from "@/components/tournaments/ScheduleMatchDialog";
import { EnterResultDialog } from "@/components/tournaments/EnterResultDialog";
import { canSelfScheduleMatch, isUnscheduled } from "@/lib/tournaments/self-schedule";
import { isCentrallyScheduled } from "@/lib/tournaments/fixture-scheduling";
import { uitsigLadiesBRoundFromDeadline } from "@/lib/tournaments/uitsig-ladies-b-round-labels";
import { canEnterChampResult } from "@/lib/tournaments/quick-result";
import { useMyPersonMemberIds } from "@/hooks/use-my-person-member-ids";
import { mySide, myRecord, myScheduleState, myFixturesHref, isUpcomingFixture } from "@/lib/tournaments/my-fixtures";
import { supabase } from "@/integrations/supabase/client";


const COLS = "id, name, gender, match_type, status, start_date, end_date, registration_mode, registration_opens_at, registration_closes_at, entry_fee_cents, payment_methods, payment_required, entries_locked, partner_mode, scheduling_mode, scoring_mode, round_play_by, best_of, points_per_game, court_ids, match_duration_minutes, club_id";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export function MyChampionships() {
  const navigate = useNavigate();
  const { activeMember } = useMemberContext();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const clubId = contextClub?.id || clubData?.club?.id;
  const memberId = activeMember?.id;
  const myIds = useMyPersonMemberIds();
  const idsKey = [...myIds].sort().join(",");
  const [scheduling, setScheduling] = useState<{ match: any; opponent: string; champ: any } | null>(null);
  const [entering, setEntering] = useState<{ match: any; champ: any; a: string; b: string } | null>(null);

  // Get all active champs for the club
  const { data: allChamps = [] } = useQuery({
    queryKey: ["club-champs-active", clubId, idsKey],
    queryFn: async () => {
      // eslint-disable-next-line prefer-const
      let { data, error } = await fromExt("club_champs")
        .select(COLS)
        .eq("club_id", clubId!)
        .order("start_date");
      if (error) throw error;
      let rows = (data || []) as any[];
      // Tournaments hosted by OTHER clubs the person is entered in.
      if (idsKey) {
        const { data: regs } = await (supabase as any).from("club_champs_registrations").select("champ_id")
          .or(`club_member_id.in.(${idsKey}),partner_member_id.in.(${idsKey})`).neq("status", "cancelled");
        const own = new Set(rows.map((r) => r.id));
        const extra = [...new Set(((regs || []) as any[]).map((r) => r.champ_id))].filter((id) => id && !own.has(id));
        if (extra.length) {
          const { data: x } = await fromExt("club_champs").select(COLS).in("id", extra as string[]);
          rows = [...rows, ...((x || []) as any[])];
        }
      }
      data = rows as any;
      // Only genuinely current/upcoming tournaments belong on the dashboard —
      // finished, cancelled and undated rows are filtered out here so this
      // surface matches the Tournaments page exactly.
      return splitTournamentsByLifecycle((data || []) as any[]).current;
    },
    enabled: !!clubId,
  });

  // Club payment gateway for member-side card checkout
  const { data: clubInfo } = useQuery({
    queryKey: ["club-payment-gateway", clubId],
    queryFn: async () => {
      const { data } = await fromExt("clubs").select("payment_gateway").eq("id", clubId!).maybeSingle();
      return data as { payment_gateway: string | null } | null;
    },
    enabled: !!clubId,
  });

  const champIds = allChamps.map((c: any) => c.id);

  // Get entries for these champs (to find which ones the member is in)
  const { data: myEntries = [] } = useQuery({
    queryKey: ["my-champ-entries-dashboard", memberId, champIds],
    queryFn: async () => {
      if (!champIds.length || !memberId) return [];
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, partner:partner_member_id(id, name, profiles:user_id(name))")
        .in("champ_id", champIds)
        .or(`club_member_id.eq.${memberId},partner_member_id.eq.${memberId}`);
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0 && !!memberId,
  });

  // Get upcoming matches for this member. Search every current tournament,
  // not only ones with an entry row: placed/imported players (e.g. league-style
  // tournaments) can have fixtures without a club_champs_entries row.
  const myChampIds = champIds;

  const { data: myMatches = [] } = useQuery({
    queryKey: ["my-champ-matches-dashboard", idsKey, myChampIds],
    queryFn: async () => {
      if (!myChampIds.length || !idsKey) return [];
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .in("champ_id", myChampIds)
        .or(`player_a_member_id.in.(${idsKey}),player_b_member_id.in.(${idsKey}),partner_a_member_id.in.(${idsKey}),partner_b_member_id.in.(${idsKey})`)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: myChampIds.length > 0 && !!idsKey,
  });

  // My registrations across active champs (to filter what to offer)
  const { data: myRegs = [] } = useQuery({
    queryKey: ["my-champ-registrations", memberId, champIds],
    queryFn: async () => {
      if (!champIds.length || !memberId) return [];
      const { data, error } = await fromExt("club_champs_registrations")
        .select("champ_id, status")
        .in("champ_id", champIds)
        .eq("club_member_id", memberId);
      if (error) throw error;
      return (data || []) as Array<{ champ_id: string; status: string }>;
    },
    enabled: champIds.length > 0 && !!memberId,
  });

  // Pending partner invites where this member is the proposed partner
  const { data: partnerInvites = [], refetch: refetchInvites } = useQuery({
    queryKey: ["my-champ-partner-invites", memberId, champIds],
    queryFn: async () => {
      if (!champIds.length || !memberId) return [];
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, champ_id, club_member_id, partner_confirmed, status, inviter:club_member_id(id, name, profiles:user_id(name))")
        .in("champ_id", champIds)
        .eq("partner_member_id", memberId)
        .eq("partner_confirmed", false)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: champIds.length > 0 && !!memberId,
  });

  const registeredChampIds = new Set(myRegs.filter(r => r.status !== "cancelled").map(r => r.champ_id));

  const now = new Date();
  const openForRegistration = (allChamps as any[]).filter((c) => {
    if (registeredChampIds.has(c.id)) return false;
    if (c.entries_locked) return false;
    if (c.registration_mode !== "open") return false;
    const opens = c.registration_opens_at ? new Date(c.registration_opens_at) : null;
    const closes = c.registration_closes_at ? new Date(c.registration_closes_at) : null;
    if (opens && now < opens) return false;
    if (closes && now > closes) return false;
    return true;
  });

  const respondToPartnerInvite = async (regId: string, accept: boolean) => {
    const payload = accept
      ? { partner_confirmed: true }
      : { partner_member_id: null, partner_confirmed: false };
    const { error } = await fromExt("club_champs_registrations").update(payload).eq("id", regId);
    if (error) {
      const { toast } = await import("sonner");
      toast.error(error.message);
      return;
    }
    refetchInvites();
  };

  if (!myEntries.length && !myMatches.length && openForRegistration.length === 0 && partnerInvites.length === 0) return null;

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => b ? `${getName(a)} & ${getName(b)}` : getName(a);

  // Self-scheduled tournaments create matches with no court/date/time — those
  // are "upcoming" too, and the players themselves arrange them.
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const upcomingMatches = myMatches.filter((m: any) => isUpcomingFixture(m, todayStr));
  const completedMatches = myMatches.filter((m: any) => m.status === "completed");

  // Graduated knockouts intentionally place a player in several sections
  // (one entry row per section). Render ONE card per tournament, not per entry.
  const seenChamps = new Set<string>();
  const uniqueEntries = myEntries.filter((e: any) => {
    if (seenChamps.has(e.champ_id)) return false;
    seenChamps.add(e.champ_id);
    return true;
  });
  // Tournaments where the member has fixtures but no entry row.
  for (const m of myMatches as any[]) {
    if (seenChamps.has(m.champ_id)) continue;
    seenChamps.add(m.champ_id);
    uniqueEntries.push({ id: `m-${m.champ_id}`, champ_id: m.champ_id, partner: null });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold font-heading flex items-center gap-1.5">
          <Trophy className="w-4 h-4" /> My Tournaments
        </h2>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/tournaments")}>
          View all <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {partnerInvites.map((inv: any) => {
        const champ = (allChamps as any[]).find((c) => c.id === inv.champ_id);
        const inviterName = inv.inviter?.name || inv.inviter?.profiles?.name || "A member";
        return (
          <Card key={`inv-${inv.id}`} className="p-3 mb-2 border-amber-500/40 bg-amber-500/5">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Doubles partner invite
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {inviterName} invited you to partner in <span className="font-medium text-foreground">{champ?.name || "a tournament"}</span>.
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" className="h-7 text-xs" onClick={() => respondToPartnerInvite(inv.id, true)}>Accept</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => respondToPartnerInvite(inv.id, false)}>Decline</Button>
            </div>
          </Card>
        );
      })}

      {openForRegistration.map((c: any) => (
        <TournamentRegisterCard
          key={`reg-${c.id}`}
          champ={c}
          clubId={clubId!}
          memberId={memberId!}
          paymentGateway={clubInfo?.payment_gateway || null}
        />
      ))}



      {uniqueEntries.map((entry: any) => {
        const champ = allChamps.find((c: any) => c.id === entry.champ_id);
        if (!champ) return null;
        const isDoubles = champ.match_type === "doubles";
        // Self-scheduled knockout matches (players book their own court) only
        // offer result entry — no point-by-point marking from this list.
        const partnerName = entry.partner ? getName(entry.partner) : null;
        const champUpcoming = upcomingMatches.filter((m: any) => m.champ_id === champ.id);
        const champCompleted = completedMatches.filter((m: any) => m.champ_id === champ.id);

        return (
          <Card key={entry.id} className="p-3 mb-2 border-primary/20" onClick={() => navigate(`/club-champs/${champ.id}`)} role="button">
            <div className="flex items-center justify-between mb-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{champ.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"}
                  {(champ.start_date || champ.end_date) && (
                    <> · {champ.start_date}{champ.end_date && champ.end_date !== champ.start_date ? ` to ${champ.end_date}` : ""}</>
                  )}
                  {isDoubles && partnerName && <> · Partner: <span className="font-medium text-foreground">{partnerName}</span></>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>

            {champUpcoming.length > 0 ? (
              <div className="space-y-1 mt-1.5">
                {champUpcoming.slice(0, 3).map((m: any) => {
                  const isA = mySide(m, myIds) === "a";
                  const opponent = isA
                    ? (isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b))
                    : (isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a));
                  const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
                  const today = matchDate && isToday(matchDate);

                  const unscheduled = isUnscheduled(m);
                  const perm = canSelfScheduleMatch(m, memberId);
                  // Only "By Date" (play-by) matches are member-reschedulable.
                  // Organiser-fixed games (date/time set by the club, no player
                  // booking, no play-by) can only be moved by an admin.
                  const centrallyFixed =
                    !unscheduled &&
                    isCentrallyScheduled({ ...m, scheduling_mode: champ.scheduling_mode });
                  // Entering an already-played score is independent of both the
                  // scheduling mode and any court booking.
                  const resultPerm = canEnterChampResult(m, memberId, { anyClubMember: true });
                  const openResult = (e: any) => {
                    e.stopPropagation();
                    setEntering({
                      match: m,
                      champ,
                      a: isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a),
                      b: isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b),
                    });
                  };

                  if (unscheduled) {
                    return (
                      <div
                        key={m.id}
                        className="rounded p-1.5 bg-amber-500/5 border border-amber-500/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 text-[12px]">
                          <CalendarClock className="w-3 h-3 text-amber-600 shrink-0" />
                          <span className="font-medium truncate">vs {opponent}</span>
                          {m.stage_label && (
                            <Badge variant="outline" className="text-[9px] shrink-0">{m.stage_label}</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Upcoming match — not yet scheduled
                          {m.play_by && <> · play by {format(new Date(m.play_by), "EEE dd MMM")}</>}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {perm.allowed ? (
                            <Button
                              size="sm"
                              className="h-6 text-[11px] rounded-full bg-reschedule text-reschedule-foreground hover:bg-reschedule/90 font-semibold shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setScheduling({ match: m, opponent, champ });
                              }}
                            >
                              Make your court booking
                            </Button>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">{perm.reason}</p>
                          )}
                          {resultPerm.allowed && (
                            <Button
                              size="sm"
                              className="h-6 text-[11px] rounded-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
                              onClick={openResult}
                            >
                              Enter your result
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={cn(
                      "flex items-center gap-2 text-[12px] p-1.5 rounded",
                      today ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
                    )}>
                      <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground shrink-0">
                        {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
                      </span>
                      <span className="text-muted-foreground shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">vs {opponent}</span>
                        {(m.stage_label || m.round_number) && (
                          <span className="text-muted-foreground"> · {m.stage_label || `Round ${uitsigLadiesBRoundFromDeadline(m.champ_id, m.group_number, m.play_by) ?? m.round_number}`}</span>
                        )}
                        {m.status === "in_progress" && <span className="text-primary"> · Live</span>}
                      </span>
                      {m.court && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{m.court.name}</Badge>}
                      {today && <Badge className="text-[9px] shrink-0">Today</Badge>}
                        {perm.allowed && !centrallyFixed && (
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-2 shrink-0 rounded-full bg-reschedule text-reschedule-foreground hover:bg-reschedule/90 font-semibold shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setScheduling({ match: m, opponent, champ });
                            }}
                          >
                            Reschedule your court booking
                          </Button>
                        )}
                      {resultPerm.allowed && (
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-2 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
                          onClick={openResult}
                        >
                          Enter your result
                        </Button>
                      )}
                    </div>
                  );
                })}
                {champUpcoming.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-full text-[11px]"
                    onClick={(e) => { e.stopPropagation(); navigate(myFixturesHref(champ.id)); }}
                  >
                    View all {champUpcoming.length} upcoming games <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                {myScheduleState(myMatches.filter((m: any) => m.champ_id === champ.id), todayStr) === "finished"
                  ? `No upcoming matches · ${champCompleted.length} played`
                  : "Schedule not yet available"}
              </p>
            )}

            <div className="flex items-center gap-3 mt-1.5 text-[11px]">
              {champCompleted.length > 0 && (() => {
                const rec = myRecord(champCompleted, myIds);
                return (
                  <>
                    <span className="text-muted-foreground">{champCompleted.length} played</span>
                    <span className="text-primary font-medium">W {rec.w}</span>
                    <span className="text-destructive font-medium">L {rec.l}</span>
                  </>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] ml-auto"
                onClick={(e) => { e.stopPropagation(); navigate(myFixturesHref(champ.id)); }}
              >
                View my fixtures <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
          </Card>
        );
      })}

      <ScheduleMatchDialog
        open={!!scheduling}
        onOpenChange={(v) => !v && setScheduling(null)}
        clubId={clubId}
        match={scheduling?.match || null}
        opponentName={scheduling?.opponent}
        durationMinutes={scheduling?.champ?.match_duration_minutes ?? undefined}
        allowedCourtIds={scheduling?.champ?.court_ids ?? []}
      />

      <EnterResultDialog
        open={!!entering}
        onOpenChange={(v) => !v && setEntering(null)}
        clubId={clubId}
        match={entering?.match || null}
        playerAName={entering?.a || ""}
        playerBName={entering?.b || ""}
        bestOf={entering?.champ?.best_of ?? null}
        pointsTarget={entering?.champ?.points_per_game ?? null}
        scoringMode={(entering?.champ as any)?.scoring_mode ?? null}
      />
    </div>
  );
}
