import { Building2, Flag, Globe2, MapPinned, Trophy, type LucideIcon } from "lucide-react";

/** Structure levels shown across SquashHub (workspace switcher, structure trees). */
export type OrgLevel = "club" | "association" | "provincial" | "zone" | "national";

export interface OrgLevelStyle {
  label: string;
  icon: LucideIcon;
  /** Icon colour (works in light and dark). */
  iconClass: string;
  /** Badge colours (tinted background, border and text). */
  badgeClass: string;
}

// One colour per level so clubs, regional associations, provincial associations and zones are told apart at a glance.
export const ORG_LEVEL_STYLES: Record<OrgLevel, OrgLevelStyle> = {
  club: {
    label: "Club", icon: Building2,
    iconClass: "text-sky-600 dark:text-sky-400",
    badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  association: {
    label: "Regional association", icon: Trophy,
    iconClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  provincial: {
    label: "Provincial association", icon: MapPinned,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  zone: {
    label: "Zone", icon: Globe2,
    iconClass: "text-violet-600 dark:text-violet-400",
    badgeClass: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  national: {
    label: "National", icon: Flag,
    iconClass: "text-rose-600 dark:text-rose-400",
    badgeClass: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

/** Resolve a level from an organisation kind or a tenant type ("club" / "association"). */
export function orgLevel(kind: string | null | undefined): OrgLevel {
  return kind && kind in ORG_LEVEL_STYLES ? (kind as OrgLevel) : "club";
}
