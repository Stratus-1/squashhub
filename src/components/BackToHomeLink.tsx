import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating back-to-home link used on full-screen auth / signup pages.
 * Anchors to top-left and links to the marketing root ("/").
 */
export function BackToHomeLink({
  className,
  label = "Back to home",
  to = "/",
}: {
  className?: string;
  label?: string;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "absolute top-4 left-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors shadow-sm",
        className
      )}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}
