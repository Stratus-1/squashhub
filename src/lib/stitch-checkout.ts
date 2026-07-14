import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "gbsquash";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";
const PENDING_STITCH_SESSION_KEY = "gbsquash.pendingStitchSession";

type PendingStitchSession = {
  sessionId: string;
  returnPath: string;
  createdAt: number;
};

const PAY_RETURN_COOKIE = "sh_pay_to";

function setPayReturnCookie(target: string) {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  // Cookie must be readable by the /pay/return page on the apex domain, so
  // scope it to `.squashhub.co.za`. On the lovable.app preview host cookies
  // are same-origin only (no shared apex), which is fine because the payer
  // returns to the same preview host.
  let domainAttr = "";
  if (host === "squashhub.co.za" || host.endsWith(".squashhub.co.za")) {
    domainAttr = "; domain=.squashhub.co.za";
  }
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie =
    `${PAY_RETURN_COOKIE}=${encodeURIComponent(target)}; path=/${domainAttr}; max-age=3600; samesite=lax${secure}`;
}

export function readPayReturnCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${PAY_RETURN_COOKIE}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.split("=").slice(1).join("="));
  } catch {
    return null;
  }
}

export function clearPayReturnCookie() {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const domainAttr =
    host === "squashhub.co.za" || host.endsWith(".squashhub.co.za")
      ? "; domain=.squashhub.co.za"
      : "";
  document.cookie = `${PAY_RETURN_COOKIE}=; path=/${domainAttr}; max-age=0; samesite=lax`;
}

export function buildStitchReturnUrl(pathAndSearch: string) {
  if (Capacitor.isNativePlatform()) {
    const nativePath = pathAndSearch.replace(/^\/+/, "");
    return `${APP_SCHEME}://${nativePath}`;
  }

  const safePath = pathAndSearch.startsWith("/") && !pathAndSearch.startsWith("//")
    ? pathAndSearch
    : `/${pathAndSearch.replace(/^\/+/, "")}`;

  // Resolve the payer's real destination (their current subdomain) and stash it
  // before Stitch opens. Stitch itself should only receive the canonical
  // whitelisted return URL; /pay/return forwards back to this saved target.
  let originHere = PUBLIC_APP_ORIGIN;
  let hostHere = "";
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname;
    if (
      host === "squashhub.co.za" ||
      host.endsWith(".squashhub.co.za") ||
      host.endsWith(".lovable.app") ||
      host === "localhost"
    ) {
      hostHere = host;
      originHere = window.location.origin.replace(/\/+$/, "");
    }
  }

  try {
    const target = new URL(safePath, originHere);
    setPayReturnCookie(target.toString());

    const returnOrigin =
      hostHere === "squashhub.co.za" || hostHere.endsWith(".squashhub.co.za")
        ? PUBLIC_APP_ORIGIN
        : originHere;
    return `${returnOrigin}/pay/return`;
  } catch {
    setPayReturnCookie(`${originHere}/my-account`);
    const returnOrigin =
      hostHere === "squashhub.co.za" || hostHere.endsWith(".squashhub.co.za")
        ? PUBLIC_APP_ORIGIN
        : originHere;
    return `${returnOrigin}/pay/return`;
  }
}



export async function openStitchCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch { /* cross-origin frame */ }
  window.location.assign(url);
}

export function rememberPendingStitchSession(sessionId: string, returnPath: string) {
  if (!sessionId) return;
  localStorage.setItem(
    PENDING_STITCH_SESSION_KEY,
    JSON.stringify({ sessionId, returnPath, createdAt: Date.now() } satisfies PendingStitchSession),
  );
}

export function getPendingStitchSession() {
  try {
    const raw = localStorage.getItem(PENDING_STITCH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStitchSession;
    if (!parsed?.sessionId || Date.now() - Number(parsed.createdAt || 0) > 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
    return null;
  }
}

export function clearPendingStitchSession(sessionId?: string) {
  const pending = getPendingStitchSession();
  if (!sessionId || pending?.sessionId === sessionId) {
    localStorage.removeItem(PENDING_STITCH_SESSION_KEY);
  }
}
