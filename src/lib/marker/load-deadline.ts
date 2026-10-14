/** Bounded read-only hydration. Late results cannot mount a stale scoreboard. */
export function startMarkerLoadDeadline(onTimeout: () => void, milliseconds = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); onTimeout(); }, milliseconds);
  return { signal: controller.signal, cancel: () => { clearTimeout(timer); controller.abort(); } };
}