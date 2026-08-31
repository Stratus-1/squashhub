/**
 * Canonical per-club capability registry.
 *
 * A "capability" is a plain-language thing a club either does or doesn't do.
 * Core setup (club identity, settings, members, users, permissions, subscription,
 * communications) is always available and is NOT a capability.
 *
 * The master switch lives in the `club_capabilities` table. Legacy boolean columns
 * (clubs.honesty_bar_enabled / whatsapp_enabled / ranking_points_enabled /
 * lights_integration_enabled and club_secrets.wifi_enabled) are kept in sync by a
 * database trigger, so they remain readable but are never a second source of truth.
 */

export const CAPABILITIES = [
  "bookings",
  "access_control",
  "wifi",
  "membership_fees",
  "payments",
  "finance",
  "bar",
  "leagues",
  "tournaments",
  "ladder",
  "ranking_points",
  "visitors",
  "whatsapp",
  "lights",
  "gadgets",
  "events",
  "skills",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityGroup = "facilities" | "money" | "competition" | "community";

export interface CapabilityMeta {
  slug: Capability;
  /** Plain-language label a club admin understands */
  label: string;
  /** Question asked in Quick Setup */
  question: string;
  description: string;
  group: CapabilityGroup;
  /** Capabilities that must also be on for this one to work */
  requires: Capability[];
  /** Capabilities that work better together but are not required */
  worksWith?: Capability[];
  /** Recommended default for a small squash club */
  defaultOn: boolean;
  /** Admin tab values unlocked by this capability */
  tabs: string[];
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  bookings: {
    slug: "bookings",
    label: "Court Bookings",
    question: "Do members book courts through the app?",
    description: "Court list, booking grid, slot lengths, peak hours and daily limits.",
    group: "facilities",
    requires: [],
    worksWith: ["access_control", "lights", "payments"],
    defaultOn: true,
    tabs: ["courts"],
  },
  access_control: {
    slug: "access_control",
    label: "Door Access",
    question: "Does the app open your clubhouse or court doors?",
    description: "Shelly relay, remote trigger, tap card, PIN or face recognition.",
    group: "facilities",
    requires: [],
    worksWith: ["bookings"],
    defaultOn: false,
    tabs: ["access"],
  },
  wifi: {
    slug: "wifi",
    label: "Member Wi-Fi",
    question: "Do you share Wi-Fi with members through the app?",
    description: "Wi-Fi details, optional monthly Wi-Fi fee and router monitoring.",
    group: "facilities",
    requires: [],
    worksWith: ["membership_fees", "payments"],
    defaultOn: false,
    tabs: ["router"],
  },
  lights: {
    slug: "lights",
    label: "Court Lights",
    question: "Does the app switch court lights on and off?",
    description: "Smart relay control and optional per-hour light fees.",
    group: "facilities",
    requires: ["bookings"],
    worksWith: ["finance"],
    defaultOn: false,
    tabs: [],
  },
  gadgets: {
    slug: "gadgets",
    label: "Gadgets & Devices",
    question: "Do you switch other equipment — a geyser, pump or heater — from the app?",
    description:
      "Smart-relay control for geysers, pumps, heaters, gates and club lights, grouped on the dashboard. Admin and staff only.",
    group: "facilities",
    requires: [],
    worksWith: ["access_control", "lights"],
    defaultOn: false,
    tabs: ["devices"],
  },
  membership_fees: {
    slug: "membership_fees",
    label: "Membership & Fees",
    question: "Do you charge membership or subscription fees?",
    description: "Fee categories, renewals, invoices and member statements.",
    group: "money",
    requires: [],
    worksWith: ["finance", "payments", "whatsapp"],
    defaultOn: false,
    tabs: ["fees"],
  },
  payments: {
    slug: "payments",
    label: "Banking & Payments",
    question: "Do members pay you through the app (card, EFT or debit order)?",
    description: "Bank details, payment gateway and debit-order mandates.",
    group: "money",
    requires: [],
    worksWith: ["finance", "membership_fees"],
    defaultOn: false,
    tabs: ["banking"],
  },
  finance: {
    slug: "finance",
    label: "Club Books",
    question: "Do you keep the club's books in the app?",
    description: "Ledger, journals, income statement and reconciliation.",
    group: "money",
    requires: [],
    defaultOn: false,
    tabs: ["finance"],
  },
  bar: {
    slug: "bar",
    label: "Bar / POS",
    question: "Do you run a bar, tuck shop or self-service POS?",
    description: "Stock, member account tabs, visitor card sales and scan-to-pay Menu / Product QR codes.",
    group: "money",
    requires: [],
    worksWith: ["finance", "payments", "visitors"],
    defaultOn: false,
    tabs: ["bar"],
  },
  leagues: {
    slug: "leagues",
    label: "Leagues",
    question: "Does your club play in leagues?",
    description: "League setup, fixtures, line-ups, results and awards.",
    group: "competition",
    requires: [],
    worksWith: ["bookings", "ladder", "ranking_points"],
    defaultOn: false,
    tabs: ["leagues", "awards"],
  },
  tournaments: {
    slug: "tournaments",
    label: "Tournaments",
    question: "Do you run tournaments or club champs?",
    description: "Tournament wizard, draws, entries and scheduling.",
    group: "competition",
    requires: [],
    worksWith: ["bookings", "payments", "visitors"],
    defaultOn: false,
    tabs: ["champs"],
  },
  ladder: {
    slug: "ladder",
    label: "Ladder & Ranking",
    question: "Do you run a club ladder?",
    description: "Ladder positions, challenges and ranking rules.",
    group: "competition",
    requires: [],
    worksWith: ["ranking_points"],
    defaultOn: true,
    tabs: ["ladder"],
  },
  ranking_points: {
    slug: "ranking_points",
    label: "Ranking Points",
    question: "Do you award ranking points for matches?",
    description: "Points ledger and awarding rules on top of the ladder.",
    group: "competition",
    requires: ["ladder"],
    defaultOn: false,
    tabs: ["ranking-points"],
  },
  visitors: {
    slug: "visitors",
    label: "Visitors",
    question: "Do non-members play at your club?",
    description: "Visitor register, visitor fees and visitor bar sales.",
    group: "community",
    requires: [],
    defaultOn: false,
    tabs: ["visitors"],
  },
  whatsapp: {
    slug: "whatsapp",
    label: "WhatsApp Messaging",
    question: "Do you want to send WhatsApp messages to members?",
    description: "WhatsApp invites, RSVPs and reminders (metered, billed monthly).",
    group: "community",
    requires: [],
    worksWith: ["finance"],
    defaultOn: false,
    tabs: ["whatsapp"],
  },
  skills: {
    slug: "skills",
    label: "Skills & Volunteers",
    question: "Do you collect members' skills, trades and volunteer offers?",
    description: "Optional Skills & Expertise section on member profiles plus the admin Skills Directory.",
    group: "community",
    requires: [],
    worksWith: ["events"],
    defaultOn: true,
    tabs: ["skills"],
  },
  events: {
    slug: "events",
    label: "Club Events",
    question: "Do you run social or club events?",
    description: "Event calendar, RSVPs and recurring events.",
    group: "community",
    requires: [],
    defaultOn: true,
    tabs: [],
  },
};

export const CAPABILITY_LIST: CapabilityMeta[] = CAPABILITIES.map((c) => CAPABILITY_META[c]);

export const GROUP_LABELS: Record<CapabilityGroup, string> = {
  facilities: "Facilities",
  money: "Money",
  competition: "Competition",
  community: "Community",
};

/** Admin tabs that are always visible — core setup, no capability required. */
export const CORE_TABS = [
  "club",
  "settings",
  "members",
  "users",
  "permissions",
  "subscription",
  "comms",
  "features",
] as const;

/** Core setup items counted in "Core setup: X/Y complete". */
export const CORE_SETUP_KEYS = ["club", "settings", "comms"] as const;

/** Tab value -> capability that unlocks it (tabs not listed are core). */
export const TAB_CAPABILITY: Record<string, Capability> = (() => {
  const map: Record<string, Capability> = {};
  for (const meta of CAPABILITY_LIST) {
    for (const tab of meta.tabs) map[tab] = meta.slug;
  }
  return map;
})();

/**
 * Expand a capability to itself + everything it requires (transitively).
 * Used when enabling: turning on Bar also turns on Club Books.
 */
export function withDependencies(slug: Capability, acc = new Set<Capability>()): Set<Capability> {
  if (acc.has(slug)) return acc;
  acc.add(slug);
  for (const dep of CAPABILITY_META[slug].requires) withDependencies(dep, acc);
  return acc;
}

/**
 * Capabilities that would break if `slug` were switched off — i.e. anything
 * currently enabled that requires it (transitively).
 */
export function dependentsOf(slug: Capability, enabled: Set<string>): Capability[] {
  const out = new Set<Capability>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const meta of CAPABILITY_LIST) {
      if (out.has(meta.slug) || meta.slug === slug) continue;
      if (!enabled.has(meta.slug)) continue;
      if (meta.requires.some((r) => r === slug || out.has(r))) {
        out.add(meta.slug);
        changed = true;
      }
    }
  }
  return [...out];
}

/** Defaults recommended for a small squash club. */
export const DEFAULT_CAPABILITIES: Capability[] = CAPABILITY_LIST.filter((c) => c.defaultOn).map(
  (c) => c.slug
);

export type ModuleState = "off" | "needs_setup" | "ready";

/**
 * Should an admin tab be shown?
 *
 * Core tabs (no capability tag) are always visible. Optional tabs appear only
 * when their capability is enabled. Fails open when a club has no capability
 * rows yet, so un-migrated tenants keep everything.
 */
export function isTabVisible(
  tab: { capability?: Capability },
  enabled: Set<string>,
  hasRows = true
): boolean {
  if (!tab.capability) return true;
  if (!hasRows) return true;
  return enabled.has(tab.capability);
}

/** Which setup-status key (if any) tells us whether a capability is configured. */
export const CAPABILITY_SETUP_KEY: Partial<Record<Capability, string>> = {
  bookings: "courts",
  membership_fees: "fees",
  payments: "banking",
  access_control: "access",
};

/**
 * Module status shown on an optional tile:
 *  - "off"         capability disabled (data kept, just hidden)
 *  - "needs_setup" enabled but configuration is incomplete
 *  - "ready"       enabled and configured
 */
export function moduleState(
  slug: Capability,
  enabled: Set<string>,
  setupStatus: Record<string, string> = {}
): ModuleState {
  if (!enabled.has(slug)) return "off";
  const key = CAPABILITY_SETUP_KEY[slug];
  if (key && setupStatus[key] !== "complete") return "needs_setup";
  return "ready";
}
