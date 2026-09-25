// Structured BUG records for the AI assistant.
// A bug = SquashHub itself behaving incorrectly (established by the AI from
// live data), as opposed to a support request needing a person.
// Repeated reports of the same issue add occurrences to the open bug.

export type BugInput = {
  issue_key: string;
  title: string;
  feature: string;
  expected_behaviour: string;
  actual_behaviour: string;
  evidence: string;
  reproduction: string;
  severity: "low" | "medium" | "high" | "critical";
  verified: boolean;
  related_ids: Record<string, string>;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);

/** Every state in which a bug is still being worked on; repeats attach here. */
export const OPEN_BUG_STATUSES = ["open", "investigating", "fix_in_development", "fix_ready", "published"];

/** Stable identity of an underlying issue: feature + issue key + primary record. */
export function bugFingerprint(clubId: string | null, b: Pick<BugInput, "issue_key" | "feature" | "related_ids">): string {
  const ids = b.related_ids ?? {};
  const primary = ids.tournament_id || ids.champId || ids.league_id || ids.booking_id || ids.member_id || clubId || "global";
  return `${slug(b.feature)}|${slug(b.issue_key)}|${primary}`;
}

/** Members may only report suspected, non-critical issues; admins/super may mark verified. */
export function sanitiseBug(b: BugInput, canVerify: boolean): BugInput {
  const sev = ["low", "medium", "high", "critical"].includes(b.severity) ? b.severity : "medium";
  return {
    ...b,
    verified: canVerify ? !!b.verified : false,
    severity: canVerify ? sev : (sev === "low" ? "low" : "medium"),
    related_ids: Object.fromEntries(Object.entries(b.related_ids ?? {}).filter(([, v]) => typeof v === "string" && v.length <= 80).slice(0, 20)),
  };
}

export async function recordBug(admin: any, p: {
  clubId: string | null; userId: string; role: string; route: string | null; canVerify: boolean; bug: BugInput;
}): Promise<{ id: string; duplicate: boolean; occurrences: number; status?: string }> {
  const bug = sanitiseBug(p.bug, p.canVerify);
  const fp = bugFingerprint(p.clubId, bug);
  const now = new Date().toISOString();
  const occ = { at: now, user_id: p.userId, role: p.role, club_id: p.clubId, route: p.route, evidence: bug.evidence.slice(0, 1000) };
  const { data: existing } = await admin.from("ai_bug_reports").select("id, occurrences, occurrence_log, verification, status")
    .eq("fingerprint", fp).in("status", OPEN_BUG_STATUSES).maybeSingle();
  if (existing) {
    const n = (existing.occurrences ?? 1) + 1;
    await admin.from("ai_bug_reports").update({
      occurrences: n, last_seen_at: now, updated_at: now,
      occurrence_log: [...(existing.occurrence_log ?? []), occ].slice(-50),
      ...(bug.verified && existing.verification !== "verified" ? { verification: "verified" } : {}),
    }).eq("id", existing.id);
    return { id: existing.id, duplicate: true, occurrences: n, status: existing.status };
  }
  // Supposedly fixed but reproduced live -> reopen the same bug (regression), never a fresh duplicate.
  const { data: fixed } = await admin.from("ai_bug_reports").select("id, occurrences, occurrence_log, reopened_count")
    .eq("fingerprint", fp).in("status", ["fixed", "closed"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (fixed) {
    const n = (fixed.occurrences ?? 1) + 1;
    await admin.from("ai_bug_reports").update({
      status: "open", occurrences: n, last_seen_at: now, updated_at: now, reopened_count: (fixed.reopened_count ?? 0) + 1,
      occurrence_log: [...(fixed.occurrence_log ?? []), { ...occ, reopened: true }].slice(-50),
    }).eq("id", fixed.id);
    return { id: fixed.id, duplicate: true, occurrences: n, status: "reopened" };
  }
  const { data, error } = await admin.from("ai_bug_reports").insert({
    fingerprint: fp, club_id: p.clubId, reporter_user_id: p.userId, reporter_role: p.role,
    title: bug.title.slice(0, 200), feature: bug.feature.slice(0, 120), screen: p.route,
    expected_behaviour: bug.expected_behaviour, actual_behaviour: bug.actual_behaviour, evidence: bug.evidence,
    related_ids: bug.related_ids, reproduction: bug.reproduction, severity: bug.severity,
    verification: bug.verified ? "verified" : "suspected", occurrence_log: [occ],
  }).select("id").single();
  if (error) {
    // Lost a race with a concurrent identical report — fold into it.
    if ((error as any).code === "23505") return recordBug(admin, p);
    throw error;
  }
  return { id: data.id, duplicate: false, occurrences: 1 };
}
