/**
 * AI Assistant action registry.
 *
 * The assistant NEVER emits raw URLs. It picks a logical action key, and this
 * registry resolves it to an in-app route (and a public web URL when the same
 * action has to travel over email/WhatsApp).
 *
 * The base registry is the Communications action registry — one shared source
 * of truth so a route change is made in exactly one place. Assistant-only
 * targets (mostly admin destinations that never appear in a member campaign)
 * are added on top.
 */
import {
  COMMS_ACTIONS,
  clubWebBase,
  type CommsAction,
  type CommsActionDef,
  type CommsActionParams,
  type ResolvedAction,
} from "@/lib/comms/actions";

export type AiActionDef = CommsActionDef & {
  /** Only offered to club admins / office bearers. */
  adminOnly?: boolean;
  /** Capability that must be enabled for the club. */
  capability?: string;
};

/** Admin + operational destinations the assistant can open. */
const ASSISTANT_ONLY_ACTIONS: AiActionDef[] = [
  {
    key: "admin_leagues",
    label: "Club Admin → Leagues",
    group: "Admin",
    defaultLabel: "Open league setup",
    adminOnly: true,
    capability: "leagues",
    path: () => "/club-admin?tab=leagues",
  },
  {
    key: "admin_tournaments",
    label: "Club Admin → Tournaments",
    group: "Admin",
    defaultLabel: "Open tournament setup",
    adminOnly: true,
    capability: "tournaments",
    path: () => "/club-admin?tab=tournaments",
  },
  {
    key: "admin_fees",
    label: "Club Admin → Fees & Invoices",
    group: "Admin",
    defaultLabel: "Open fees & invoices",
    adminOnly: true,
    capability: "membership_fees",
    path: () => "/club-admin?tab=fees",
  },
  {
    key: "admin_members",
    label: "Club Admin → Members",
    group: "Admin",
    defaultLabel: "Open the member roster",
    adminOnly: true,
    path: () => "/club-admin?tab=members",
  },
  {
    key: "admin_comms",
    label: "Club Admin → Communications",
    group: "Admin",
    defaultLabel: "Open communications",
    adminOnly: true,
    path: () => "/club-admin?tab=comms",
  },
  {
    key: "admin_banking",
    label: "Club Admin → Banking & Payments",
    group: "Admin",
    defaultLabel: "Open banking & payments",
    adminOnly: true,
    capability: "payments",
    path: () => "/club-admin?tab=banking",
  },
  {
    key: "league_fixture",
    label: "A specific league fixture",
    group: "Competition",
    defaultLabel: "Open the fixture",
    capability: "leagues",
    requiredParams: ["fixture_id"],
    path: (p) => `/league-games/${p.fixture_id ?? ""}`,
  },
  {
    key: "club_champs",
    label: "Club championship",
    group: "Competition",
    defaultLabel: "Open the championship",
    capability: "tournaments",
    requiredParams: ["champ_id"],
    path: (p) => `/club-champs/${p.champ_id ?? ""}`,
  },
  {
    key: "match_marker",
    label: "Score a match",
    group: "Competition",
    defaultLabel: "Start marking",
    path: () => "/match-marker",
  },
  {
    key: "add_result",
    label: "Capture a result",
    group: "Competition",
    defaultLabel: "Capture a result",
    path: () => "/add-result",
  },
  {
    key: "honesty_bar",
    label: "Bar & POS",
    group: "Club",
    defaultLabel: "Open the bar",
    capability: "bar",
    path: () => "/honesty-bar",
  },
  {
    key: "support",
    label: "Support",
    group: "General",
    defaultLabel: "Contact support",
    path: () => "/support",
  },
  {
    key: "settings",
    label: "Settings",
    group: "General",
    defaultLabel: "Open settings",
    path: () => "/settings",
  },
];

export const AI_ACTIONS: AiActionDef[] = [
  ...(COMMS_ACTIONS as AiActionDef[]),
  ...ASSISTANT_ONLY_ACTIONS,
];

export const AI_ACTION_MAP: Record<string, AiActionDef> = Object.fromEntries(
  AI_ACTIONS.map((a) => [a.key, a]),
);

export type AiActionContext = {
  isAdmin?: boolean;
  capabilities?: Set<string> | string[];
  clubSubdomain?: string | null;
  origin?: string | null;
};

function capSet(caps: AiActionContext["capabilities"]): Set<string> | null {
  if (!caps) return null;
  return caps instanceof Set ? caps : new Set(caps);
}

/** Actions this user is allowed to be offered right now. */
export function allowedActions(ctx: AiActionContext): AiActionDef[] {
  const caps = capSet(ctx.capabilities);
  return AI_ACTIONS.filter((a) => {
    if (a.key === "none" || a.key === "external") return false;
    if (a.adminOnly && !ctx.isAdmin) return false;
    if (a.capability && caps && !caps.has(a.capability)) return false;
    return true;
  });
}

export function isActionAllowed(key: string, ctx: AiActionContext): boolean {
  return allowedActions(ctx).some((a) => a.key === key);
}

/**
 * Resolve an action key to a route. Returns `hasAction: false` when the key is
 * unknown, blocked by role/capability, or missing required params — the UI then
 * simply shows no button instead of a broken link.
 */
export function resolveAiAction(
  action: CommsAction | null | undefined,
  ctx: AiActionContext = {},
): ResolvedAction {
  const key = action?.key || "none";
  const def = AI_ACTION_MAP[key];
  if (!def || key === "none") {
    return { key: "none", label: "", appPath: "", webUrl: "", hasAction: false };
  }
  if (!isActionAllowed(key, ctx)) {
    return { key, label: "", appPath: "", webUrl: "", hasAction: false };
  }
  const params: CommsActionParams = action?.params ?? {};
  const missing = (def.requiredParams ?? []).filter((p) => !String(params[p] || "").trim());
  if (missing.length) {
    return { key, label: "", appPath: "", webUrl: "", hasAction: false };
  }

  const label = (action?.label || "").trim() || def.defaultLabel;
  const path = def.path(params);
  const base = clubWebBase(ctx.clubSubdomain, ctx.origin);
  return {
    key,
    label,
    appPath: path,
    webUrl: `${base}${path === "/" ? "" : path}`,
    hasAction: !!path,
  };
}

/** Compact catalogue handed to the model so it can only pick real keys. */
export function actionCatalogue(ctx: AiActionContext): { key: string; label: string; needs?: string[] }[] {
  return allowedActions(ctx).map((a) => ({
    key: a.key,
    label: a.label,
    ...(a.requiredParams?.length ? { needs: a.requiredParams } : {}),
  }));
}
