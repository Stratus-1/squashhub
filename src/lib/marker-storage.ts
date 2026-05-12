export const MARKER_CONFIG_KEY = "marker:active-config:v1";
export const MARKER_STATE_KEY = "marker:active-state:v1";

interface MarkerSessionIdentity {
  source?: string;
  sourceId?: string;
  playerA: { clubMemberId?: string | null; name?: string | null };
  playerB: { clubMemberId?: string | null; name?: string | null };
  partnerA?: { clubMemberId?: string | null; name?: string | null } | null;
  partnerB?: { clubMemberId?: string | null; name?: string | null } | null;
  scoringFormat: string;
  bestOf: number;
}

export function getMarkerSessionKey(config: MarkerSessionIdentity): string {
  const a = config.playerA.clubMemberId || config.playerA.name || "?";
  const b = config.playerB.clubMemberId || config.playerB.name || "?";
  const pa = config.partnerA?.clubMemberId || config.partnerA?.name || "";
  const pb = config.partnerB?.clubMemberId || config.partnerB?.name || "";
  return [config.source, config.sourceId || "", a, b, pa, pb, config.scoringFormat, config.bestOf].join("|");
}

export function clearMarkerStateForSession(sessionKey: string) {
  try {
    const raw = localStorage.getItem(MARKER_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { sessionKey?: string };
    if (parsed.sessionKey === sessionKey) localStorage.removeItem(MARKER_STATE_KEY);
  } catch {}
}

export function clearMarkerSession() {
  try {
    localStorage.removeItem(MARKER_CONFIG_KEY);
    localStorage.removeItem(MARKER_STATE_KEY);
  } catch {}
}

export function hasActiveMarkerSession(): boolean {
  try {
    return !!localStorage.getItem(MARKER_CONFIG_KEY);
  } catch {
    return false;
  }
}
