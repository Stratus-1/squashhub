type GridBooking = { court_id: number; start_time: string; end_time: string };

function minutes(time: string): number {
  const [hours, mins] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + mins;
}

// Presentation only: a continuation must never hide another game's entry.
export function bookingsForGridRow<T extends GridBooking>(
  bookings: readonly T[], courtId: number, time: string, slotMinutes: number,
): T[] {
  const rowStart = minutes(time);
  return bookings.filter((booking) => booking.court_id === courtId
    && minutes(booking.start_time) < rowStart + slotMinutes
    && minutes(booking.end_time) > rowStart)
    .sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
}
