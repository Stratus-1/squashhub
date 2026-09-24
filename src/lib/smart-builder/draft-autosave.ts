/**
 * Server autosave for Beta builder drafts (smart_tournament_drafts is the source of truth).
 * - Debounced; saves are serialised (never two writes in flight).
 * - "saved" only after the server confirms the write.
 * - Optimistic concurrency: each write requires the revision we last saw; a mismatch = conflict,
 *   and autosave stops rather than overwrite newer work from another tab/session.
 * - Saving a draft never generates structure or fixtures.
 */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";
export interface SaveState { status: SaveStatus; savedAt: number | null; error: string | null }

/** Returns the new revision, or null when the expected revision no longer matches (stale). Throws on failure. */
export type DraftWriter<P> = (payload: P, expectedRevision: number) => Promise<number | null>;

export class DraftAutosaver<P> {
  private pending: P | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private listeners = new Set<(s: SaveState) => void>();
  state: SaveState = { status: "idle", savedAt: null, error: null };

  constructor(private write: DraftWriter<P>, public revision: number, private debounceMs = 800) {}

  subscribe(fn: (s: SaveState) => void) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn); }; }
  private set(p: Partial<SaveState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((f) => f(this.state)); }

  /** Queue the latest full payload (whole draft, never one tab). */
  schedule(payload: P) {
    if (this.state.status === "conflict") return;
    this.pending = payload;
    this.set({ status: "pending" });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.debounceMs);
  }

  get hasUnsaved() { return this.pending !== null || !!this.inflight || this.state.status === "error"; }

  /** Write now (navigation away, tab hidden, Retry). Resolves when everything queued is saved or failed. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.inflight) { await this.inflight; if (this.pending === null) return; }
    if (this.pending === null || this.state.status === "conflict") return;
    const payload = this.pending;
    this.pending = null;
    this.set({ status: "saving", error: null });
    this.inflight = (async () => {
      try {
        const rev = await this.write(payload, this.revision);
        if (rev === null) { this.set({ status: "conflict", error: "This draft was changed in another tab or session." }); return; }
        this.revision = rev;
        if (this.pending === null) this.set({ status: "saved", savedAt: Date.now() });
      } catch (e: any) {
        if (this.pending === null) this.pending = payload; // keep it for Retry
        this.set({ status: "error", error: e?.message ?? "Save failed" });
      }
    })();
    await this.inflight;
    this.inflight = null;
    if (this.pending !== null && this.state.status === "pending") await this.flush();
  }

  retry() { if (this.state.status === "error") return this.flush(); return Promise.resolve(); }
  dispose() { if (this.timer) clearTimeout(this.timer); this.listeners.clear(); }
}
