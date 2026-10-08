/**
 * Peak-hour cancellation rules — pure mirror of public.booking_peak_late_status /
 * cancel_booking_checked (the backend is authoritative; this is for UI hints and tests).
 */
import { toHHMM, toMin } from "./peak-hours";

/** First booking start, last booking start and when courts close, from club settings. */
export function bookingHoursSummary(slotMinutes: number, openTime: string, lastSlotTime: string) {
  const step = slotMinutes || 30;
  const first = String(openTime || "").slice(0, 5);
  const last = String(lastSlotTime || "").slice(0, 5);
  return { first, last, close: toHHMM(toMin(last) + step), step };
}

export type CancelRuleInput = {
  restrictEnabled: boolean;
  penaltiesEnabled: boolean;
  /** SquashHub manages this club's court lights (never inferred from GoBook etc.). */
  squashhubLighting: boolean;
  lateCancelAllowed: boolean;
  lateCancelFee: number;
  slotMinutes: number;
  isPeak: boolean;
  isAdmin: boolean;
  /** Minutes from now until the booking starts (negative once started). */
  minutesToStart: number;
  /** Booking was created after penalties were switched on (no backdating). */
  createdAfterEnabled: boolean;
};

export type CancelDecision =
  | { action: "allow"; fee: 0 }
  | { action: "allow_admin_waiver"; fee: 0 }
  | { action: "allow_with_fee"; fee: number }
  | { action: "block"; fee: 0; reason: string };

export function inLateWindow(minutesToStart: number, slotMinutes: number) {
  return minutesToStart <= (slotMinutes || 30);
}

export function decideCancel(i: CancelRuleInput): CancelDecision {
  if (!i.restrictEnabled || !i.isPeak || !inLateWindow(i.minutesToStart, i.slotMinutes)) {
    return { action: "allow", fee: 0 };
  }
  if (i.isAdmin) return { action: "allow_admin_waiver", fee: 0 };
  if (i.minutesToStart <= 0) return { action: "block", fee: 0, reason: "started" };
  const penaltiesActive = i.penaltiesEnabled && i.squashhubLighting && i.createdAfterEnabled;
  if (penaltiesActive && i.lateCancelAllowed) {
    return { action: "allow_with_fee", fee: Math.max(0, i.lateCancelFee || 0) };
  }
  return { action: "block", fee: 0, reason: "late_window" };
}
