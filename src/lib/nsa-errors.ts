/**
 * Turn a supabase.functions.invoke() failure into a clear, human message.
 *
 * FunctionsHttpError.message is always "Edge Function returned a non-2xx
 * status code" — the real reason lives in the response body, so we read it
 * and then map common NSA failures (especially "you are not the registered
 * captain") to plain-English copy.
 */
export async function readFunctionError(err: any, fallback = "Submission failed"): Promise<string> {
  let raw = "";
  try {
    // supabase-js v2: err.context IS the Response (older builds nest it under .response)
    const ctx: any = err?.context?.response ?? err?.context;
    if (ctx && typeof ctx.clone === "function") {
      const text = await ctx.clone().text();
      try {
        const body = JSON.parse(text);
        raw = body?.error || body?.message || text;
      } catch {
        raw = text;
      }
    } else if (ctx && typeof ctx.text === "function") {
      raw = await ctx.text();
    }
  } catch {
    /* ignore body-parse failures */
  }
  if (!raw || /non-2xx status/i.test(raw)) raw = String(err?.message || "");
  return friendlyNsaMessage(raw, fallback);
}

export function friendlyNsaMessage(raw: string, fallback = "Submission failed"): string {
  const s = (raw || "").toLowerCase();

  // Not the NSA-registered captain for this fixture
  if (s.includes("does not list") && s.includes("captain")) {
    // Keep NSA's fixture detail but lead with a clear explanation.
    return `You are not the NSA-registered captain for this fixture, so NSA won't accept the scorecard from your login. Only the captain registered with NSA for this team can post the result — ask them to post it (or have NSA update the registered captain). Details: ${raw}`;
  }
  if (s.includes("not your member record")) {
    return "You're signed in on a different linked profile. Switch to your own player profile and try posting again.";
  }
  if (s.includes("no nsa login saved")) {
    return "No NSA login saved yet. Enter your NSA username (NSF number) and password in this dialog first, then post.";
  }
  if (s.includes("nsa login failed")) {
    return `NSA rejected your login. Check your NSA username and password and save them again. (${raw})`;
  }
  if (s.includes("fixture_id required") || s.includes("no nsa fixture")) {
    return "This fixture isn't linked to an NSA fixture ID yet — pick the matching NSA fixture above before posting.";
  }
  if (s.includes("unauthorized")) {
    return "Your session expired. Sign in again and retry.";
  }
  if (s.includes("non-2xx status") || s === "failed to fetch" || s === "load failed") {
    return `${fallback} — couldn't reach NSA. Please try again in a moment.`;
  }
  return raw || fallback;
}
