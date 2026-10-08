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

export function placeGamesInSessions(gameIds: string[], days: SessionDay[], slotMinutes: number) {
  const slots = sessionSlots(days, slotMinutes);
  const placed: SlotAssignment[] = gameIds.slice(0, slots.length).map((id, i) => ({ id, scheduled_date: slots[i].date, scheduled_time: slots[i].time, court_id: slots[i].court }));
  return { placed, slots: slots.length, unplaced: gameIds.slice(slots.length) };
}

/**
 * Applies the setup's scheduled sessions (Stages & scheduling: "Scheduled" rounds with days, times, courts)
 * to that round's generated games. Main-phase stage N = round N. Never moves a played, booked or already-timed game.
 */
export async function applySetupSessions(db: any, tournamentId: string) {
  const { data: t } = await db.from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
  const ans = t?.beta_lifecycle?.answers ?? {};
  const slot = Number(ans?.scheduling?.singles) || 0;
  const stages: any[] = (ans?.stages ?? []).filter((s: any) => (s.phase ?? "main") === "main");
  const results: Array<{ round: number; name: string; games: number; placed: number; slots: number; unplaced: number; noSlot?: boolean }> = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.mode !== "scheduled") continue;
    const days: SessionDay[] = [{ date: s.date, from: s.from, to: s.to, courtIds: s.courtIds ?? [] }, ...(s.extraDays ?? [])];
    const { data: ms } = await db.from("club_champs_matches")
      .select("id, status, winner_member_id, booking_id, scheduled_time, player_a_member_id, player_b_member_id, created_at")
      .eq("champ_id", tournamentId).eq("round_number", i + 1).order("created_at").order("id");
    const open = ((ms ?? []) as any[]).filter((m) => m.player_a_member_id && m.player_b_member_id && !m.winner_member_id && !m.booking_id && !m.scheduled_time
      && !["completed", "confirmed", "in_progress", "live", "walkover", "forfeit"].includes(String(m.status ?? "").toLowerCase()));
    if (!slot) { results.push({ round: i + 1, name: s.name, games: open.length, placed: 0, slots: 0, unplaced: open.length, noSlot: true }); continue; }
    const r = placeGamesInSessions(open.map((m) => m.id), days, slot);
    for (const p of r.placed) {
      const { error } = await db.from("club_champs_matches").update({ scheduled_date: p.scheduled_date, scheduled_time: p.scheduled_time, court_id: p.court_id }).eq("id", p.id);
      if (error) throw new Error(error.message);
    }
    results.push({ round: i + 1, name: s.name, games: open.length, placed: r.placed.length, slots: r.slots, unplaced: r.unplaced.length });
  }
  return results;
}
