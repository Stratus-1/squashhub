export type BreadcrumbItem = {
  label: string;
  to?: string;
};

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Rule = {
  re: RegExp;
  crumbs: BreadcrumbItem[];
  backTo?: string;
};

const rules: Rule[] = [
  { re: /^\/$/, crumbs: [{ label: "Home", to: "/" }] },
  { re: /^\/dashboard$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }] },
  { re: /^\/bookings$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Bookings" }], backTo: "/dashboard" },
  { re: /^\/ladder$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Ladder" }], backTo: "/dashboard" },
  { re: /^\/players\/[^/]+$/, crumbs: [{ label: "Ladder", to: "/ladder" }, { label: "Player" }], backTo: "/ladder" },
  { re: /^\/challenges$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Challenges" }], backTo: "/dashboard" },
  { re: /^\/challenges\/new$/, crumbs: [{ label: "Challenges", to: "/challenges" }, { label: "New" }], backTo: "/challenges" },
  { re: /^\/match-tracker\/[^/]+$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Match tracker" }], backTo: "/dashboard" },
  { re: /^\/events$/, crumbs: [{ label: "Events" }] },
  { re: /^\/events\/[^/]+$/, crumbs: [{ label: "Events", to: "/events" }, { label: "Event" }], backTo: "/events" },
  { re: /^\/seasons$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Seasons" }], backTo: "/dashboard" },
  { re: /^\/analytics$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Analytics" }], backTo: "/dashboard" },
  { re: /^\/feed$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Feed" }], backTo: "/dashboard" },
  { re: /^\/availability$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Availability" }], backTo: "/dashboard" },
  { re: /^\/notifications$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Notifications" }], backTo: "/dashboard" },
  { re: /^\/support$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Support" }], backTo: "/dashboard" },
  { re: /^\/achievements$/, crumbs: [{ label: "Dashboard", to: "/dashboard" }, { label: "Achievements" }], backTo: "/dashboard" },
  { re: /^\/admin$/, crumbs: [{ label: "Admin" }], backTo: "/dashboard" },
  { re: /^\/admin\/support$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Support" }], backTo: "/admin" },
  { re: /^\/admin\/events\/new$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Events" }, { label: "New" }], backTo: "/admin" },
  { re: /^\/admin\/events\/[^/]+$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Events" }, { label: "Edit" }], backTo: "/admin" },
  { re: /^\/terms$/, crumbs: [{ label: "Terms" }], backTo: "/" },
  { re: /^\/privacy$/, crumbs: [{ label: "Privacy" }], backTo: "/" },
];

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const rule of rules) {
    if (rule.re.test(clean)) return rule.crumbs;
  }

  const parts = clean.split("/").filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: "Home", to: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const isIdLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part);
    crumbs.push({
      label: isIdLike ? "Details" : titleCase(part),
      to: current,
    });
  }
  if (crumbs.length > 0) crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1], to: undefined };
  return crumbs;
}

export function getBackFallback(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const rule of rules) {
    if (rule.re.test(clean) && rule.backTo) return rule.backTo;
  }
  if (clean.startsWith("/admin")) return "/dashboard";
  if (clean.startsWith("/events/")) return "/events";
  if (clean.startsWith("/players/")) return "/ladder";
  if (clean.startsWith("/match-tracker/")) return "/dashboard";
  if (clean.startsWith("/challenges/")) return "/challenges";
  return "/dashboard";
}

