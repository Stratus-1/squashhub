/**
 * Places a round's games into the court sessions set up in Stages & scheduling
 * (day → start/end time → courts), one game per court per slot of `slotMinutes`.
 * Pure: returns assignments; games that don't fit stay unscheduled (play-by).
 */
export type SessionDay = { date: string; from: string; to: string; courtIds: Array<string | number> };
export type SlotAssignment = { id: string; scheduled_date: string; scheduled_time: string; court_id: number };

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function sessionSlots(days: SessionDay[], slotMinutes: number) {
  const out: Array<{ date: string; time: string; court: number }> = [];
  if (!(slotMinutes > 0)) return out;
  for (const d of [...days].filter((x) => x.date && x.from && x.to).sort((a, b) => a.date.localeCompare(b.date))) {
    const courts = d.courtIds.map(Number).filter(Number.isFinite);
    for (let t = toMin(d.from); t + slotMinutes <= toMin(d.to); t += slotMinutes)
      for (const c of courts) out.push({ date: d.date, time: toHHMM(t), court: c });
  }
  return out;
}

export type BusyCell = { date: string; court: number; start: string; end: string };

/** Fills free slots only: any slot overlapping a busy cell (other game, member booking) is skipped. */
export function placeGamesInSessions(gameIds: string[], days: SessionDay[], slotMinutes: number, busy: BusyCell[] = []) {
  const slots = sessionSlots(days, slotMinutes).filter((s) => {
    const a = toMin(s.time), b = a + slotMinutes;
    return !busy.some((x) => x.date === s.date && Number(x.court) === s.court && toMin(x.start) < b && toMin(x.end) > a);
  });
  const placed: SlotAssignment[] = gameIds.slice(0, slots.length).map((id, i) => ({ id, scheduled_date: slots[i].date, scheduled_time: slots[i].time, court_id: slots[i].court }));
  return { placed, slots: slots.length, unplaced: gameIds.slice(slots.length) };
}

/**
 * Applies the setup's scheduled sessions (Stages & scheduling: "Scheduled" rounds with days, times, courts)
 * to that round's generated games. Main-phase stage N = round N. Never moves a played, booked or already-timed game,
 * and never places a game on a court/time already held by another game (any tournament) or an active booking
 * (except the tournament's own "sbs:" session reservation, which is the room games go into).
 */
export async function applySetupSessions(db: any, tournamentId: string) {
  const [{ data: t }, { data: entries }] = await Promise.all([
    db.from("tournaments").select("beta_lifecycle, group_labels").eq("id", tournamentId).maybeSingle(),
    db.from("club_champs_entries").select("club_member_id, partner_member_id, group_number").eq("champ_id", tournamentId),
  ]);
  const bl: any = (t as any)?.beta_lifecycle ?? {};
  const ans = bl?.answers ?? {};
  const slot = Number(ans?.scheduling?.singles) || 0;
  const prefs = normaliseSchedulingPrefs(bl?.scheduling_prefs);
  const labels: Record<string, string> = ((t as any)?.group_labels ?? {}) as Record<string, string>;
  const keyOf = (g: number) => labels[String(g)];
  const entryGroup = new Map<string, number>();
  for (const e of (entries ?? []) as any[]) { entryGroup.set(e.club_member_id, Number(e.group_number)); if (e.partner_member_id) entryGroup.set(e.partner_member_id, Number(e.group_number)); }
  const stages: any[] = (ans?.stages ?? []).filter((s: any) => (s.phase ?? "main") === "main");
  const results: Array<{ round: number; name: string; games: number; placed: number; slots: number; unplaced: number; noSlot?: boolean; note?: string }> = [];
  const placedNow: BusyCell[] = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.mode !== "scheduled") continue;
    const days: SessionDay[] = [{ date: s.date, from: s.from, to: s.to, courtIds: s.courtIds ?? [] }, ...(s.extraDays ?? [])];
    const { data: ms } = await db.from("club_champs_matches")
      .select("id, status, winner_member_id, booking_id, scheduled_time, group_number, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, created_at")
      .eq("champ_id", tournamentId).eq("round_number", i + 1).order("created_at").order("id");
    const open = ((ms ?? []) as any[]).filter((m) => m.player_a_member_id && m.player_b_member_id && !m.winner_member_id && !m.booking_id && !m.scheduled_time
      && !["completed", "confirmed", "in_progress", "live", "walkover", "forfeit"].includes(String(m.status ?? "").toLowerCase()));
    if (!slot) { results.push({ round: i + 1, name: s.name, games: open.length, placed: 0, slots: 0, unplaced: open.length, noSlot: true }); continue; }
    const dates = Array.from(new Set(days.map((d) => d.date).filter(Boolean)));
    const courts = Array.from(new Set(days.flatMap((d) => (d.courtIds ?? []).map(Number)).filter(Number.isFinite)));
    const busy: BusyCell[] = [...placedNow];
    if (open.length && dates.length && courts.length) {
      const [{ data: dayGames, error: e1 }, { data: bk, error: e2 }] = await Promise.all([
        db.from("club_champs_matches").select("id, court_id, scheduled_date, scheduled_time").in("scheduled_date", dates).in("court_id", courts),
        db.from("bookings").select("court_id, date, start_time, end_time, external_id").in("date", dates).eq("status", "active").in("court_id", courts),
      ]);
      if (e1 || e2) throw new Error((e1 ?? e2).message);
      for (const m of (dayGames ?? []) as any[]) if (m.scheduled_time)
        busy.push({ date: String(m.scheduled_date).slice(0, 10), court: Number(m.court_id), start: String(m.scheduled_time).slice(0, 5), end: toHHMM(toMin(m.scheduled_time) + slot) });
      for (const b of (bk ?? []) as any[]) if (!String(b.external_id ?? "").startsWith("sbs:"))
        busy.push({ date: String(b.date).slice(0, 10), court: Number(b.court_id), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5) });
    }
    // Active preferences use the shared planner (category courts/evenings, rest) — same rules as the
    // Generate-draw preview. When preferences cannot fit everything, fall back to plain placement.
    let placed: SlotAssignment[] = [];
    let slots = 0, unplaced = 0, note: string | undefined;
    if (prefsActive(prefs)) {
      const prefGames = open.map((m) => {
        const people = [m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id].filter(Boolean);
        const groups = [...new Set([entryGroup.get(m.player_a_member_id), entryGroup.get(m.player_b_member_id)].filter((g): g is number => g != null))];
        return { id: m.id, round: i + 1, people, groups: groups.length ? groups : [Number(m.group_number) || 0] };
      });
      const prefBusy = busy.map((b) => ({ date: b.date, courtId: Number(b.court), start: b.start, end: b.end }));
      const plan = planPrefWaves({ games: prefGames, days: days as any, minutes: slot, busy: prefBusy, prefs, keyOf });
      if (plan.issues.length) note = `${s.name}: scheduling preferences could not fit every game (${plan.issues[0]}). Games were placed without them.`;
      else {
        placed = plan.slots.map((sl) => ({ id: sl.id, scheduled_date: sl.date, scheduled_time: sl.time, court_id: sl.courtId }));
        slots = plan.available; unplaced = 0;
      }
    }
    if (!placed.length) {
      const r = placeGamesInSessions(open.map((m) => m.id), days, slot, busy);
      placed = r.placed; slots = r.slots; unplaced = r.unplaced.length;
    }
    for (const p of placed) {
      const { error } = await db.from("club_champs_matches").update({ scheduled_date: p.scheduled_date, scheduled_time: p.scheduled_time, court_id: p.court_id }).eq("id", p.id);
      if (error) throw new Error(error.message);
      placedNow.push({ date: p.scheduled_date, court: p.court_id, start: p.scheduled_time, end: toHHMM(toMin(p.scheduled_time) + slot) });
    }
    results.push({ round: i + 1, name: s.name, games: open.length, placed: placed.length, slots, unplaced, ...(note ? { note } : {}) });
  }
  return results;
}
