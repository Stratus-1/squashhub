/** Bounded read-only hydration. Late results cannot mount a stale scoreboard. */
export function startMarkerLoadDeadline(onTimeout: () => void, milliseconds: number | null = 20000) {
  const controller = new AbortController();
  const timer = milliseconds == null ? null : setTimeout(() => { controller.abort(); onTimeout(); }, milliseconds);
  return { signal: controller.signal, cancel: () => { if (timer != null) clearTimeout(timer); controller.abort(); } };
}