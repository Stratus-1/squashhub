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
  { re: /^\/bookings$/, crumbs: [{ label: "Home", to: "/" }, { label: "Bookings" }], backTo: "/" },
  { re: /^\/ladder$/, crumbs: [{ label: "Home", to: "/" }, { label: "Ladder" }], backTo: "/" },
  { re: /^\/players\/[^/]+$/, crumbs: [{ label: "Ladder", to: "/ladder" }, { label: "Player" }], backTo: "/ladder" },
  { re: /^\/challenges$/, crumbs: [{ label: "Home", to: "/" }, { label: "Challenges" }], backTo: "/" },
  { re: /^\/challenges\/new$/, crumbs: [{ label: "Challenges", to: "/challenges" }, { label: "New" }], backTo: "/challenges" },
  { re: /^\/match-tracker\/[^/]+$/, crumbs: [{ label: "Home", to: "/" }, { label: "Match tracker" }], backTo: "/" },
  { re: /^\/events$/, crumbs: [{ label: "Events" }] },
  { re: /^\/events\/[^/]+$/, crumbs: [{ label: "Events", to: "/events" }, { label: "Event" }], backTo: "/events" },
  { re: /^\/seasons$/, crumbs: [{ label: "Home", to: "/" }, { label: "Seasons" }], backTo: "/" },
  { re: /^\/analytics$/, crumbs: [{ label: "Home", to: "/" }, { label: "Analytics" }], backTo: "/" },
  { re: /^\/feed$/, crumbs: [{ label: "Home", to: "/" }, { label: "Feed" }], backTo: "/" },
  { re: /^\/availability$/, crumbs: [{ label: "Home", to: "/" }, { label: "Availability" }], backTo: "/" },
  { re: /^\/notifications$/, crumbs: [{ label: "Home", to: "/" }, { label: "Notifications" }], backTo: "/" },
  { re: /^\/support$/, crumbs: [{ label: "Home", to: "/" }, { label: "Support" }], backTo: "/" },
  { re: /^\/achievements$/, crumbs: [{ label: "Home", to: "/" }, { label: "Achievements" }], backTo: "/" },
  { re: /^\/admin$/, crumbs: [{ label: "Admin" }], backTo: "/" },
  { re: /^\/admin\/support$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Support" }], backTo: "/admin" },
  { re: /^\/admin\/events\/new$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Events" }, { label: "New" }], backTo: "/admin" },
  { re: /^\/admin\/events\/[^/]+$/, crumbs: [{ label: "Admin", to: "/admin" }, { label: "Events" }, { label: "Edit" }], backTo: "/admin" },
  { re: /^\/profile$/, crumbs: [{ label: "Home", to: "/" }, { label: "Profile" }], backTo: "/" },
  { re: /^\/my-account$/, crumbs: [{ label: "Home", to: "/" }, { label: "My Account" }], backTo: "/" },
  { re: /^\/register-club$/, crumbs: [{ label: "Home", to: "/" }, { label: "Register Club" }], backTo: "/" },
  { re: /^\/club-admin$/, crumbs: [{ label: "Home", to: "/" }, { label: "Club Admin" }], backTo: "/" },
  { re: /^\/club-champs\/[^/]+$/, crumbs: [{ label: "Club Admin", to: "/club-admin" }, { label: "Championships" }], backTo: "/club-admin" },
  { re: /^\/c\/[^/]+$/, crumbs: [{ label: "Club" }] },
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
  if (clean.startsWith("/admin")) return "/";
  if (clean.startsWith("/events/")) return "/events";
  if (clean.startsWith("/players/")) return "/ladder";
  if (clean.startsWith("/match-tracker/")) return "/";
  if (clean.startsWith("/challenges/")) return "/challenges";
  return "/";
}
