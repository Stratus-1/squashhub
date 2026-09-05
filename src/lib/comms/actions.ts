/**
 * Action registry for the Communications engine.
 *
 * Templates store a logical ACTION KEY (e.g. `profile_skills`) — never a raw
 * URL. The engine resolves that key to:
 *   - an in-app route (used by in-app notifications / native deep links)
 *   - a public web URL (used by email buttons and WhatsApp links)
 *
 * If a route ever changes, it changes here once and every existing template
 * keeps working.
 */

export type CommsChannel = "email" | "whatsapp" | "sms" | "in_app";

export const COMMS_CHANNELS: { key: CommsChannel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "in_app", label: "In-app" },
];

export type CommsActionParams = Record<string, string | undefined>;

export type CommsActionDef = {
  key: string;
  label: string;
  group: string;
  /** Default button/link wording used when the admin doesn't override it. */
  defaultLabel: string;
  /** Builds the in-app route (path + optional hash), given params. */
  path: (params: CommsActionParams) => string;
  /** Extra params the admin must supply (e.g. tournament id). */
  requiredParams?: string[];
  /** Free-form external URL instead of an app route. */
  external?: boolean;
};

export const COMMS_ACTIONS: CommsActionDef[] = [
  {
    key: "none",
    label: "No action",
    group: "General",
    defaultLabel: "",
    path: () => "",
  },
  {
    key: "profile",
    label: "My Profile",
    group: "Profile",
    defaultLabel: "Open my profile",
    path: () => "/profile",
  },
  {
    key: "profile_skills",
    label: "My Profile → Skills & Expertise",
    group: "Profile",
    defaultLabel: "Update my skills & expertise",
    path: () => "/profile#skills",
  },
  {
    key: "my_account",
    label: "My Account & Fees",
    group: "Finance",
    defaultLabel: "View my account",
    path: () => "/my-account",
  },
  {
    key: "bookings",
    label: "Court Bookings",
    group: "Courts",
    defaultLabel: "Book a court",
    path: () => "/bookings",
  },
  {
    key: "events",
    label: "Club Events",
    group: "Club",
    defaultLabel: "See club events",
    path: () => "/events",
  },
  {
    key: "event_detail",
    label: "Specific event",
    group: "Club",
    defaultLabel: "View the event",
    requiredParams: ["event_id"],
    path: (p) => `/events/${p.event_id ?? ""}`,
  },
  {
    key: "tournaments",
    label: "Tournaments",
    group: "Competition",
    defaultLabel: "View tournaments",
    path: () => "/tournaments",
  },
  {
    key: "tournament_entry",
    label: "Tournament entry",
    group: "Competition",
    defaultLabel: "Enter the tournament",
    requiredParams: ["tournament_id"],
    path: (p) => `/tournaments?tournamentId=${p.tournament_id ?? ""}`,
  },
  {
    key: "league_games",
    label: "League fixtures",
    group: "Competition",
    defaultLabel: "View my fixtures",
    path: () => "/league-games",
  },
  {
    key: "availability",
    label: "League availability",
    group: "Competition",
    defaultLabel: "Set my availability",
    path: () => "/availability",
  },
  {
    key: "ladder",
    label: "Club ladder",
    group: "Competition",
    defaultLabel: "View the ladder",
    path: () => "/ladder",
  },
  {
    key: "notifications",
    label: "Notifications",
    group: "General",
    defaultLabel: "Open notifications",
    path: () => "/notifications",
  },
  {
    key: "club_landing",
    label: "Club landing page",
    group: "Club",
    defaultLabel: "Visit our club page",
    path: () => "/",
  },
  {
    key: "external",
    label: "External link",
    group: "General",
    defaultLabel: "Open link",
    external: true,
    requiredParams: ["url"],
    path: (p) => String(p.url ?? ""),
  },
];

export const COMMS_ACTION_MAP: Record<string, CommsActionDef> = Object.fromEntries(
  COMMS_ACTIONS.map((a) => [a.key, a]),
);

/** Stored on templates/campaigns. */
export type CommsAction = {
  key: string;
  label?: string | null;
  params?: CommsActionParams;
};

export type ResolvedAction = {
  key: string;
  label: string;
  /** In-app route, e.g. `/profile#skills`. Empty for external links. */
  appPath: string;
  /** Absolute URL used by email + WhatsApp. */
  webUrl: string;
  hasAction: boolean;
};

/** Public web base for a club, safe to call on the server too. */
export function clubWebBase(subdomain?: string | null, origin?: string | null): string {
  const sub = String(subdomain || "").trim();
  if (origin) {
    // Preview / localhost keep the /c/:subdomain path shape.
    if (/localhost|lovable\.app/.test(origin) && sub) return `${origin.replace(/\/$/, "")}/c/${sub}`;
    return origin.replace(/\/$/, "");
  }
  return sub ? `https://${sub}.squashhub.co.za` : "https://squashhub.co.za";
}

export function resolveAction(
  action: CommsAction | null | undefined,
  ctx: { clubSubdomain?: string | null; origin?: string | null } = {},
): ResolvedAction {
  const key = action?.key || "none";
  const def = COMMS_ACTION_MAP[key];
  if (!def || key === "none") {
    return { key: "none", label: "", appPath: "", webUrl: "", hasAction: false };
  }
  const params = action?.params ?? {};
  const label = (action?.label || "").trim() || def.defaultLabel;

  if (def.external) {
    const url = String(params.url || "").trim();
    return { key, label, appPath: "", webUrl: url, hasAction: !!url };
  }

  const path = def.path(params);
  const base = clubWebBase(ctx.clubSubdomain, ctx.origin);
  const webUrl = `${base}${path === "/" ? "" : path}`;
  return { key, label, appPath: path, webUrl, hasAction: true };
}

/** Missing required params for an action (used by campaign validation). */
export function missingActionParams(action: CommsAction | null | undefined): string[] {
  const def = action?.key ? COMMS_ACTION_MAP[action.key] : null;
  if (!def?.requiredParams?.length) return [];
  return def.requiredParams.filter((p) => !String(action?.params?.[p] || "").trim());
}
