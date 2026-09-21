/**
 * Independent visitor passes.
 *
 * A visitor who is in town buys a pass (day / 3-day / month), pays for it, and
 * may then book courts themselves for as long as the pass is valid. This is
 * completely separate from the "a member brings a guest" fee, which stays with
 * the court booking rules.
 *
 * Fee amounts live in the club's Fee Structure (`member_fee_categories` rows
 * carrying `visitor_pass_kind`). This module holds no prices — only the rules.
 */

export type VisitorPassKind = "day" | "three_day" | "month";

export type VisitorPassStatus =
  | "pending_payment"
  | "pending_approval"
  | "active"
  | "expired"
  | "cancelled";

export interface VisitorPassOption {
  /** member_fee_categories.id */
  id: string;
  kind: VisitorPassKind;
  name: string;
  amount: number;
  /**
   * `active = false` means the club has NOT set this pass up — it must not be
   * offered. `active = true` with amount 0 is a deliberate FREE pass.
   */
  active: boolean;
}

export interface VisitorPass {
  id: string;
  club_id: string;
  club_member_id: string;
  pass_kind: VisitorPassKind;
  amount: number;
  status: VisitorPassStatus;
  valid_from: string | null;
  valid_until: string | null;
  approved_at: string | null;
  fee_payment_id: string | null;
  created_at: string;
}

export const VISITOR_PASS_KINDS: VisitorPassKind[] = ["day", "three_day", "month"];

export const VISITOR_PASS_LABEL: Record<VisitorPassKind, string> = {
  day: "Day pass",
  three_day: "3-day pass",
  month: "Monthly pass",
};

/** Plain-language validity, shown next to each option before purchase. */
export const VISITOR_PASS_VALIDITY: Record<VisitorPassKind, string> = {
  day: "Valid for 24 hours from activation",
  three_day: "Valid for 72 hours from activation",
  month: "Valid for one month from activation",
};

/**
 * Expiry maths — mirrors `visitor_pass_duration()` in the database, which is
 * the authority. Day = 24h, 3-day = 72h, month = one calendar month.
 */
export function computeValidUntil(kind: VisitorPassKind, from: Date): Date {
  const d = new Date(from.getTime());
  if (kind === "day") return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  if (kind === "three_day") return new Date(d.getTime() + 72 * 60 * 60 * 1000);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/** A pass only grants booking rights while it is active AND inside its window. */
export function isPassLive(pass: Pick<VisitorPass, "status" | "valid_from" | "valid_until"> | null | undefined, now: Date = new Date()): boolean {
  if (!pass || pass.status !== "active") return false;
  if (!pass.valid_from || !pass.valid_until) return false;
  return new Date(pass.valid_from) <= now && new Date(pass.valid_until) > now;
}

/** True when a club genuinely offers this pass (including a free one). */
export function isPassOffered(option: Pick<VisitorPassOption, "active"> | null | undefined): boolean {
  return !!option?.active;
}

export function isFreePass(option: Pick<VisitorPassOption, "active" | "amount">): boolean {
  return !!option.active && Number(option.amount || 0) <= 0;
}

/**
 * What the visitor is waiting for, in their words.
 */
export function visitorPassStatusLabel(
  pass: Pick<VisitorPass, "status" | "valid_until"> | null | undefined,
  now: Date = new Date(),
): string {
  if (!pass) return "No visitor pass";
  switch (pass.status) {
    case "pending_payment":
      return "Awaiting payment";
    case "pending_approval":
      return "Awaiting club approval";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "active":
      if (!isPassLive(pass as any, now)) return "Expired";
      return "Active";
  }
  return "No visitor pass";
}

export interface VisitorBookingDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether an independent visitor may book a court right now.
 * Mirrors `booking_visitor_entitled()` in the database — the UI copy of a rule
 * that is enforced server-side, never the only check.
 */
export function visitorBookingDecision(opts: {
  isVisitor: boolean;
  visitorsCanBook: boolean;
  pass: Pick<VisitorPass, "status" | "valid_from" | "valid_until"> | null | undefined;
  now?: Date;
}): VisitorBookingDecision {
  if (!opts.isVisitor) return { allowed: true };
  const pass = opts.pass;
  // A paid, live pass is what a visitor buys the right to book with — it stands
  // on its own, including booking a court alone.
  if (isPassLive(pass, opts.now ?? new Date())) return { allowed: true };
  if (!opts.visitorsCanBook) {
    return {
      allowed: false,
      reason: "Visitor bookings aren't enabled at this club. Please ask a member or the club admin to book on your behalf.",
    };
  }
  if (!pass || pass.status === "expired" || pass.status === "cancelled") {
    return { allowed: false, reason: "You need a valid visitor pass to book a court. Buy one from your account." };
  }
  if (pass.status === "pending_payment") {
    return { allowed: false, reason: "Your visitor pass is not paid yet — settle it on your account to start booking." };
  }
  return { allowed: false, reason: "Your visitor pass is waiting for the club to approve it." };
}
