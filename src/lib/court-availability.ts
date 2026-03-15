import { supabase } from "@/integrations/supabase/client";

/**
 * Check if a court is available for a 1-hour slot on a given date/time.
 * Returns true if available, false if there's a conflicting booking.
 */
export async function isCourtAvailable(
  courtId: number,
  date: string,
  startTime: string
): Promise<{ available: boolean; conflictMessage?: string }> {
  // Normalise to HH:MM:SS
  const start = startTime.length === 5 ? startTime + ":00" : startTime;
  const endH = (parseInt(start.slice(0, 2)) + 1) % 24;
  const end = `${String(endH).padStart(2, "0")}:${start.slice(3, 5)}:00`;

  const { data, error } = await supabase
    .from("bookings")
    .select("id, start_time, end_time")
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "active")
    .lt("start_time", end)
    .gt("end_time", start);

  if (error) {
    console.error("Court availability check failed:", error);
    return { available: true }; // fail open so challenges aren't blocked by a bug
  }

  if (data && data.length > 0) {
    return {
      available: false,
      conflictMessage: `This court is already booked on ${date} at ${startTime.slice(0, 5)}. Please choose a different time or court.`,
    };
  }

  return { available: true };
}
