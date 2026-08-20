import { cn } from "@/lib/utils";
import { APP_BUILD_ID, APP_BUILD_SHORT, buildStamp, formatBuildTime } from "@/lib/app-version";

interface AppVersionBadgeProps {
  className?: string;
  /** "short" renders just the build id, "full" adds the build timestamp. */
  variant?: "short" | "full";
}

/**
 * Visible build/version stamp so anyone can confirm which build production is
 * running (deployment verification).
 */
export function AppVersionBadge({ className, variant = "full" }: AppVersionBadgeProps) {
  const title = `${APP_BUILD_ID}${formatBuildTime() ? ` · built ${formatBuildTime()}` : ""}`;
  return (
    <span
      title={title}
      data-build-id={APP_BUILD_ID}
      className={cn("text-[10px] text-muted-foreground/70 font-mono tracking-tight", className)}
    >
      {variant === "full" ? buildStamp() : `Build ${APP_BUILD_SHORT}`}
    </span>
  );
}

export default AppVersionBadge;
