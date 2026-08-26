// Release metadata: criticality + phased rollout.
//
// A deployed build only becomes "offerable" to a given device when that device
// falls inside the release's rollout cohort. Critical releases bypass the
// polite deferral and force a (still graceful) reload.

import { supabase } from "@/integrations/supabase/client";

export type ReleaseSeverity = "normal" | "critical";

export interface ReleaseInfo {
  build_id: string;
  severity: ReleaseSeverity;
  rollout_percent: number;
  target_club_ids: string[];
  notes?: string | null;
}

const DEVICE_KEY = "sh.deviceId";

/** Stable per-device identifier used for rollout bucketing. */
export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "anonymous";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/**
 * Deterministic 0-99 bucket for a seed string (FNV-1a).
 * Same seed + same build always lands in the same bucket, so a device never
 * flip-flops in and out of a rollout.
 */
export function hashToBucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/** Is this device/club inside the release cohort? */
export function isInRolloutCohort(
  release: ReleaseInfo | null,
  seed: string,
  clubId?: string | null,
): boolean {
  // No metadata for this build = ship to everyone (default behaviour).
  if (!release) return true;
  if (release.severity === "critical") return true;

  const targets = release.target_club_ids ?? [];
  if (targets.length > 0) {
    if (!clubId || !targets.includes(clubId)) return false;
  }

  const pct = Math.max(0, Math.min(100, release.rollout_percent ?? 100));
  if (pct >= 100) return true;
  if (pct <= 0) return false;

  return hashToBucket(`${release.build_id}:${seed}`) < pct;
}

/** Newest release row, or null when the table is empty / unreachable. */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const { data, error } = await supabase
      .from("app_releases")
      .select("build_id, severity, rollout_percent, target_club_ids, notes")
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      build_id: data.build_id,
      severity: (data.severity as ReleaseSeverity) ?? "normal",
      rollout_percent: data.rollout_percent ?? 100,
      target_club_ids: (data.target_club_ids as string[]) ?? [],
      notes: data.notes,
    };
  } catch {
    return null;
  }
}
