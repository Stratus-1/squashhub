// Mirror of supabase/functions/_shared/maintenance-policy.ts.
// Keep byte-identical in behaviour: the edge function enforces server-side,
// this mirror drives UI gating + tests.
export type Risk = "low" | "medium" | "high";

export type MaintenanceStatus =
  | "new" | "analysing" | "needs_info" | "issue_identified" | "fix_in_progress"
  | "awaiting_approval" | "approved" | "ready_for_release" | "released"
  | "completed" | "unable_to_resolve" | "rejected";

export const SENSITIVE_AREAS = [
  "payments_billing",
  "member_deletion_merge",
  "rankings_ratings",
  "results_structures",
  "permissions_security_roles",
  "organisation_hierarchy",
  "schema_migration",
  "destructive_data",
] as const;

export const SENSITIVE_LABELS: Record<string, string> = {
  payments_billing: "Payments / billing",
  member_deletion_merge: "Member delete / merge",
  rankings_ratings: "Rankings / ratings",
  results_structures: "Results / structures",
  permissions_security_roles: "Permissions / security",
  organisation_hierarchy: "Organisation hierarchy",
  schema_migration: "Schema / migration",
  destructive_data: "Destructive operation",
};

const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/payment|billing|payfast|stitch|yoco|invoice|subscription|mandate|bar[_ ]?tab|gateway fee/i, "payments_billing"],
  [/member.{0,24}(delet|remov|merge)|merge.{0,24}member|dedupe|duplicate.{0,16}record/i, "member_deletion_merge"],
  [/ranking|rating|ladder[_ ]?position|ladder order|skill tier|points ledger/i, "rankings_ratings"],
  [/tournament|league result|standing|winner|fixture|draw|seed|pool|stage|round/i, "results_structures"],
  [/permission|user[_ ]?role|has_role|rls|security|password|secret|token|admin role|escalat.{0,10}privilege/i, "permissions_security_roles"],
  [/organisation|organization|federation|association structure|hierarchy|national body/i, "organisation_hierarchy"],
  [/migration|schema|alter table|add column|drop column|constraint|policy|trigger|function/i, "schema_migration"],
  [/delete from|drop table|truncate|wipe|purge|destroy|bulk delete|irreversible/i, "destructive_data"],
];

export function detectSensitiveAreas(...texts: (string | null | undefined)[]): string[] {
  const hay = texts.filter(Boolean).join(" \n ");
  const found = new Set<string>();
  for (const [re, area] of SENSITIVE_PATTERNS) if (re.test(hay)) found.add(area);
  return [...found];
}

const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

export function maxRisk(a: Risk, b: Risk): Risk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

// Severity of a report can only push risk up, never down.
export function finaliseRisk(proposed: Risk | string | undefined, severity?: string | null): Risk {
  let risk: Risk = proposed === "low" ? "low" : proposed === "high" ? "high" : "medium";
  if (severity === "critical" || severity === "high") risk = maxRisk(risk, "high");
  else if (severity === "low") risk = maxRisk(risk, "low"); // still floors at proposed
  return risk;
}

export function policyFor(risk: Risk, sensitiveAreas: string[]): { requires_approval: boolean; auto_allowed: boolean } {
  const requires_approval = risk !== "low" || sensitiveAreas.length > 0;
  return { requires_approval, auto_allowed: !requires_approval };
}

// Redact PII before member text is stored into maintenance records or shown
// beyond the case context.
export function redactPii(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, "[email]")
    .replace(/\b\d{13}\b/g, "[id-number]")
    .replace(/\b(?:\+?27|0)\s?\d{2}\s?\d{3}\s?\d{4}\b/g, "[phone]")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[date]");
}

// Must mirror public.maintenance_case_can_transition in the database.
const TRANSITIONS: [MaintenanceStatus, MaintenanceStatus][] = [
  ["new", "analysing"], ["new", "needs_info"], ["new", "unable_to_resolve"], ["new", "rejected"],
  ["analysing", "issue_identified"], ["analysing", "needs_info"], ["analysing", "unable_to_resolve"], ["analysing", "rejected"],
  ["needs_info", "analysing"],
  ["issue_identified", "fix_in_progress"], ["issue_identified", "awaiting_approval"], ["issue_identified", "unable_to_resolve"], ["issue_identified", "rejected"],
  ["awaiting_approval", "approved"], ["awaiting_approval", "rejected"],
  ["approved", "fix_in_progress"], ["approved", "ready_for_release"],
  ["fix_in_progress", "ready_for_release"], ["fix_in_progress", "issue_identified"], ["fix_in_progress", "unable_to_resolve"],
  ["ready_for_release", "released"], ["ready_for_release", "rejected"],
  ["released", "completed"],
];

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS.some(([f, t]) => f === from && t === to);
}

// Automated actors never pass ready_for_release — approvals are human-only.
export const AUTOMATED_ACTORS = ["system", "assistant", "agent"] as const;
export const HUMAN_ONLY_STATUSES: MaintenanceStatus[] = ["approved", "released", "completed"];

// Derived bug-report status from the authoritative maintenance case status.
// Must mirror public.sync_maintenance_bug_status in the database.
export function caseToBugStatus(caseStatus: MaintenanceStatus): string | null {
  const map: Record<MaintenanceStatus, string | null> = {
    new: "investigating", analysing: "investigating", needs_info: "investigating",
    issue_identified: "fix_in_development", fix_in_progress: "fix_in_development",
    awaiting_approval: "fix_in_development", approved: "fix_in_development",
    ready_for_release: "fix_ready", released: "published", completed: "fixed",
    unable_to_resolve: "wont_fix", rejected: "wont_fix",
  };
  return map[caseStatus];
}
