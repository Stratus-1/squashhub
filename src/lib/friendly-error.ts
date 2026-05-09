/**
 * Convert raw Supabase / Postgres errors into user-friendly toast messages.
 * Specifically catches RLS / permission failures and points users to the
 * support ticket system.
 */

export interface FriendlyError {
  title: string;
  description: string;
  isPermission: boolean;
}

const PERMISSION_PATTERNS = [
  /row-level security/i,
  /violates row[- ]level security policy/i,
  /permission denied/i,
  /not authorized/i,
  /\bRLS\b/i,
  /policy.*violat/i,
  /403/,
  /401/,
];

const PERMISSION_CODES = new Set(["42501", "PGRST301", "PGRST204", "P0001"]);

export function friendlyError(err: any): FriendlyError {
  const raw = err?.message || err?.error_description || err?.error || String(err || "");
  const code = err?.code || err?.status?.toString() || "";

  const isPermission =
    PERMISSION_CODES.has(code) ||
    PERMISSION_PATTERNS.some((re) => re.test(raw));

  if (isPermission) {
    return {
      title: "You may not have permission to do this",
      description:
        "If you think you should have permission, please open a support ticket and we'll help you sort it out.",
      isPermission: true,
    };
  }

  return {
    title: "Something went wrong",
    description: raw || "Please try again.",
    isPermission: false,
  };
}
