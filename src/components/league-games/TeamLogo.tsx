import { cn } from "@/lib/utils";

interface TeamLogoProps {
  logoUrl?: string | null;
  name?: string | null;
  size?: number; // pixels
  className?: string;
}

/**
 * Small team logo. Falls back to colored circle with initials when no logo.
 */
export function TeamLogo({ logoUrl, name, size = 24, className }: TeamLogoProps) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name || "Team logo"}
        style={{ width: size, height: size }}
        className={cn("rounded object-contain bg-white/40 flex-shrink-0", className)}
        loading="lazy"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
      className={cn(
        "rounded bg-primary/10 text-primary font-semibold flex items-center justify-center flex-shrink-0",
        className,
      )}
      aria-label={name || "Team"}
    >
      {initials}
    </div>
  );
}
