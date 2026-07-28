import { supabase } from "@/integrations/supabase/client";

/**
 * Real "sign in as member" support.
 *
 * Unlike the old client-side "view as", this swaps the browser's Supabase
 * session for a genuine session belonging to the target member. The admin's
 * own tokens are stashed in sessionStorage so the banner can restore them.
 */

const KEY = "sh.impersonation";

export interface ImpersonationState {
  adminAccessToken: string;
  adminRefreshToken: string;
  adminEmail: string | null;
  memberName: string | null;
  memberId: string;
  startedAt: number;
}

export function getImpersonation(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

function clearImpersonation() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Sign in as the given club member. Throws with a friendly message on failure. */
export async function startImpersonation(clubMemberId: string, memberName?: string | null) {
  const { data: sessionRes } = await supabase.auth.getSession();
  const current = sessionRes.session;
  if (!current) throw new Error("Your session expired — please sign in again.");

  const { data, error } = await supabase.functions.invoke("admin-impersonate", {
    body: { club_member_id: clubMemberId },
  });

  const payloadError = (data as any)?.error;
  if (error || payloadError) {
    let message = payloadError || error?.message || "Could not sign in as this member.";
    // Edge function non-2xx responses hide the body in error.message — read it.
    const ctx = (error as any)?.context;
    if (!payloadError && ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }

  const { token_hash, email } = data as { token_hash: string; email: string };

  // Stash admin tokens BEFORE swapping the session.
  const state: ImpersonationState = {
    adminAccessToken: current.access_token,
    adminRefreshToken: current.refresh_token,
    adminEmail: current.user?.email ?? null,
    memberName: memberName ?? null,
    memberId: clubMemberId,
    startedAt: Date.now(),
  };
  sessionStorage.setItem(KEY, JSON.stringify(state));

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash,
    email,
  } as any);

  if (otpErr) {
    clearImpersonation();
    throw new Error(otpErr.message || "Could not start the member session.");
  }

  // Drop any stale "view as" selection so the member sees their own data.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("active_member_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Restore the admin's own session. */
export async function stopImpersonation() {
  const state = getImpersonation();
  clearImpersonation();
  if (!state) {
    await supabase.auth.signOut({ scope: "local" });
    return;
  }
  const { error } = await supabase.auth.setSession({
    access_token: state.adminAccessToken,
    refresh_token: state.adminRefreshToken,
  });
  if (error) {
    // Admin token expired while impersonating — force a clean sign-in.
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("Your admin session expired — please sign in again.");
  }
}
