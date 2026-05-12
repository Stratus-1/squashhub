export const MARKER_CONFIG_KEY = "marker:active-config:v1";
export const MARKER_STATE_KEY = "marker:active-state:v1";

interface MarkerSessionIdentity {
  source?: string;
  sourceId?: string;
  sourcePosition?: string | number;
  playerA: { clubMemberId?: string | null; name?: string | null };
  playerB: { clubMemberId?: string | null; name?: string | null };
  partnerA?: { clubMemberId?: string | null; name?: string | null } | null;
  partnerB?: { clubMemberId?: string | null; name?: string | null } | null;
  scoringFormat: string;
  bestOf: number;
}

function getLegacyMarkerSessionKey(config: MarkerSessionIdentity): string {
  const a = config.playerA.clubMemberId || config.playerA.name || "?";
  const b = config.playerB.clubMemberId || config.playerB.name || "?";
  const pa = config.partnerA?.clubMemberId || config.partnerA?.name || "";
  const pb = config.partnerB?.clubMemberId || config.partnerB?.name || "";
  return [config.source, config.sourceId || "", a, b, pa, pb, config.scoringFormat, config.bestOf].join("|");
}

export function getMarkerSessionKey(config: MarkerSessionIdentity): string {
  if (config.source && config.sourceId && config.sourcePosition !== undefined && config.sourcePosition !== null) {
    return [config.source, config.sourceId, `pos:${config.sourcePosition}`, config.scoringFormat, config.bestOf].join("|");
  }
  return getLegacyMarkerSessionKey(config);
}

export function getMarkerSessionKeys(config: MarkerSessionIdentity): string[] {
  const primary = getMarkerSessionKey(config);
  const legacy = getLegacyMarkerSessionKey(config);
  return primary === legacy ? [primary] : [primary, legacy];
}

export function clearMarkerStateForSession(sessionKey: string | string[]) {
  try {
    const raw = localStorage.getItem(MARKER_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { sessionKey?: string };
    const keys = Array.isArray(sessionKey) ? sessionKey : [sessionKey];
    if (parsed.sessionKey && keys.includes(parsed.sessionKey)) localStorage.removeItem(MARKER_STATE_KEY);
  } catch {}
}

export function hasMarkerStateForSession(sessionKey: string | string[]): boolean {
  try {
    const raw = localStorage.getItem(MARKER_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { sessionKey?: string };
    const keys = Array.isArray(sessionKey) ? sessionKey : [sessionKey];
    return !!parsed.sessionKey && keys.includes(parsed.sessionKey);
  } catch {
    return false;
  }
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
