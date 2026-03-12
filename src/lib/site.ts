const DEFAULT_SITE_URL = "https://squashhub.lovable.app";

function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_SITE_URL as string | undefined);
  return normalizeSiteUrl(fromEnv || DEFAULT_SITE_URL);
}

export function absoluteUrl(pathOrUrl: string): string {
  const value = (pathOrUrl || "").trim();
  if (!value) return getSiteUrl();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const base = getSiteUrl();
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}

