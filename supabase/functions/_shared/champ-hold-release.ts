// Existing Uitsig pilot schedule, shared by both provider sync paths.
const PILOT_CLUB = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
export function expiredChampHold(clubId: string, date: string, name: unknown, now = new Date()): boolean {
  if (clubId !== PILOT_CLUB || !/^club championship/i.test(String(name ?? "").trim())) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T00:00:00+02:00`);
  if (!Number.isFinite(day.getTime())) return false;
  const saturday = new Date(`${date}T12:00:00Z`).getUTCDay() === 6;
  const cutoff = saturday ? day.getTime() - 7 * 60 * 60 * 1000 : day.getTime() + 12 * 60 * 60 * 1000;
  return now.getTime() >= cutoff;
}
