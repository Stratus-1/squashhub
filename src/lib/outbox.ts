import { supabase } from "@/integrations/supabase/client";

export type OutboxKind = "booking_flow" | "create_match";

export type OutboxItemBase = {
  id: string;
  kind: OutboxKind;
  user_id: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
};

export type BookingFlowPayload = {
  booking: {
    id: string;
    user_id: string;
    court_id: number;
    date: string;
    start_time: string;
    end_time: string;
    opponent_id: string | null;
    is_friendly: boolean;
  };
  challenge?: {
    id: string;
    opponent_id: string;
    proposed_date: string | null;
  };
};

export type CreateMatchPayload = {
  match: {
    id: string;
    player_a: string;
    player_b: string;
    winner_id: string | null;
    score: string | null;
    game_scores: string | null;
    match_date: string;
    court_id: number | null;
    challenge_id: string | null;
    duration_s: number | null;
    notes: string | null;
    submitted_by: string;
    confirmed: boolean;
    disputed: boolean;
  };
};

export type OutboxItem =
  | (OutboxItemBase & { kind: "booking_flow"; payload: BookingFlowPayload })
  | (OutboxItemBase & { kind: "create_match"; payload: CreateMatchPayload });

const STORAGE_KEY = "gb_outbox_v1";
const CHANGE_EVENT = "gb:outbox:changed";

function emitChange() {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

export function subscribeOutboxChanged(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

export function loadOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitChange();
}

export function getOutboxCounts() {
  const items = loadOutbox();
  return { pending: items.length };
}

export function enqueueOutbox(item: Omit<OutboxItemBase, "attempts" | "last_error"> & { payload: any }) {
  const items = loadOutbox();
  const next: OutboxItem = {
    ...(item as any),
    attempts: 0,
    last_error: null,
  };
  if (!items.find((i) => i.id === next.id)) items.unshift(next);
  saveOutbox(items);
}

function isLikelyNetworkError(err: any) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("fetch failed") ||
    msg.includes("Load failed") ||
    msg.includes("TypeError:") ||
    msg.includes("Network request failed")
  );
}

async function flushBookingFlow(item: Extract<OutboxItem, { kind: "booking_flow" }>) {
  const { booking, challenge } = item.payload;

  // Upsert booking for idempotency.
  const { data: bookingRow, error: bookingError } = await supabase
    .from("bookings")
    .upsert(
      {
        id: booking.id,
        user_id: booking.user_id,
        court_id: booking.court_id,
        date: booking.date,
        start_time: booking.start_time,
        end_time: booking.end_time,
        opponent_id: booking.opponent_id,
        is_friendly: booking.is_friendly,
        status: "active",
      } as any,
      { onConflict: "id" }
    )
    .select("*")
    .single();
  if (bookingError) throw bookingError;

  if (!challenge) return;
  if (booking.is_friendly) return;
  if (!booking.opponent_id) return;

  // Create challenge (or reuse an existing active one).
  let challengeId = challenge.id;
  const { error: insertChallengeError } = await supabase
    .from("challenges")
    .insert({
      id: challenge.id,
      challenger_id: item.user_id,
      opponent_id: challenge.opponent_id,
      proposed_date: challenge.proposed_date,
      status: "pending",
    } as any);

  if (insertChallengeError) {
    // If it already exists between players, reuse it.
    const { data: existing } = await supabase
      .from("challenges")
      .select("id")
      .in("status", ["pending", "accepted"] as any)
      .or(
        `and(challenger_id.eq.${item.user_id},opponent_id.eq.${challenge.opponent_id}),and(challenger_id.eq.${challenge.opponent_id},opponent_id.eq.${item.user_id})`
      )
      .limit(1)
      .maybeSingle();
    if (existing?.id) challengeId = existing.id;
    else throw insertChallengeError;
  }

  // Link booking to challenge if not already linked.
  if (!(bookingRow as any)?.challenge_id) {
    const { error: linkError } = await supabase
      .from("bookings")
      .update({ challenge_id: challengeId } as any)
      .eq("id", booking.id);
    if (linkError) throw linkError;
  }
}

async function flushCreateMatch(item: Extract<OutboxItem, { kind: "create_match" }>) {
  const m = item.payload.match;

  const { error } = await supabase
    .from("matches")
    .upsert(m as any, { onConflict: "id" });

  if (error) {
    // If another match already exists for this challenge, treat as delivered.
    const msg = String((error as any)?.message || "");
    if (m.challenge_id && msg.includes("matches_unique_challenge_id")) {
      return;
    }
    throw error;
  }
}

export async function flushOutbox(options?: { maxAttempts?: number }) {
  const maxAttempts = options?.maxAttempts ?? 5;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return { flushed: 0, remaining: loadOutbox().length, needsLogin: true };

  const uid = session.user.id;
  const items = loadOutbox();
  if (items.length === 0) return { flushed: 0, remaining: 0, needsLogin: false };

  const remaining: OutboxItem[] = [];
  let flushed = 0;

  for (const item of items) {
    // Must be logged in as the same user that queued the action.
    if (item.user_id !== uid) {
      remaining.push(item);
      continue;
    }

    if (item.attempts >= maxAttempts) {
      remaining.push(item);
      continue;
    }

    try {
      if (item.kind === "booking_flow") await flushBookingFlow(item);
      if (item.kind === "create_match") await flushCreateMatch(item);
      flushed += 1;
    } catch (e: any) {
      // Keep it for retry later.
      const updated: OutboxItem = {
        ...item,
        attempts: item.attempts + 1,
        last_error: String(e?.message || e || "Unknown error"),
      };
      // If it looks like a network error, stop flushing further to avoid hammering.
      remaining.push(updated);
      if (isLikelyNetworkError(e)) {
        // push the rest unmodified
        const idx = items.indexOf(item);
        for (const rest of items.slice(idx + 1)) remaining.push(rest);
        break;
      }
    }
  }

  saveOutbox(remaining);
  return { flushed, remaining: remaining.length, needsLogin: false };
}
