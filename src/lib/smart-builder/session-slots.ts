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
