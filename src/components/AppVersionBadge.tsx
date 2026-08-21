import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { APP_BUILD_ID, APP_BUILD_SHORT, buildStamp, formatBuildTime } from "@/lib/app-version";
import { checkForUpdateNow, hardRefresh } from "@/lib/pwa-update";

interface AppVersionBadgeProps {
  className?: string;
  /** "short" renders just the build id, "full" adds the build timestamp. */
  variant?: "short" | "full";
}

/**
 * Visible build/version stamp so anyone can confirm which build production is
 * running (deployment verification). Clicking it checks for a newer build —
 * useful for installed desktop PWAs that are holding on to an older shell.
 */
export function AppVersionBadge({ className, variant = "full" }: AppVersionBadgeProps) {
  const [busy, setBusy] = useState(false);
  const title = `${APP_BUILD_ID}${formatBuildTime() ? ` · built ${formatBuildTime()}` : ""} — click to check for updates`;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const applied = await checkForUpdateNow();
      if (!applied) {
        toast.info("Refreshing to the latest build…");
        await hardRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      data-build-id={APP_BUILD_ID}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-mono tracking-tight hover:text-foreground transition-colors",
        className,
      )}
    >
      <RefreshCw className={cn("h-2.5 w-2.5", busy && "animate-spin")} />
      {variant === "full" ? buildStamp() : `Build ${APP_BUILD_SHORT}`}
    </button>
  );
}

export default AppVersionBadge;
