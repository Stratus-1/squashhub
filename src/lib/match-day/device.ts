/**
 * Routes the shared data client through the Match Day token while a secure
 * link is open: requests go as the anonymous role (never the member's own
 * login, which stays untouched in storage) plus the token header, so the
 * database scopes them to that one competition. Restored on exit.
 */
import { supabase } from "@/integrations/supabase/client";

const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let restore: (() => void) | null = null;

export function enableMatchDayDevice(token: string, court: number | null) {
  disableMatchDayDevice();
  const rest: any = (supabase as any).rest;
  const original = rest.fetch;
  rest.fetch = (input: any, init: any = {}) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${ANON_KEY}`);
    headers.set("x-match-day-token", token);
    if (court != null) headers.set("x-match-day-court", String(court));
    else headers.delete("x-match-day-court");
    // The club_champs compatibility view ignores row rules, so the link reads
    // its own filtered copy (md_club_champs: only this tournament).
    if (typeof input === "string") input = input.replace(/\/rest\/v1\/club_champs(?=\?|$)/, "/rest/v1/md_club_champs");
    else if (input instanceof URL) input = new URL(input.toString().replace(/\/rest\/v1\/club_champs(?=\?|$)/, "/rest/v1/md_club_champs"));
    return original(input, { ...init, headers });
  };
  restore = () => { rest.fetch = original; };
}

export function disableMatchDayDevice() {
  if (restore) { restore(); restore = null; }
}

/** Stable random id for this browser, used only to own marker locks. */
export function matchDayDeviceId(): string {
  const key = "sh.md.device-id";
  try {
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
