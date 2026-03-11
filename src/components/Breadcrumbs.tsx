import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBreadcrumbs } from "@/lib/breadcrumbs";

export function Breadcrumbs({ className }: { className?: string }) {
  const location = useLocation();
  const crumbs = getBreadcrumbs(location.pathname || "/");

  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-[11px] text-muted-foreground", className)}>
      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <div key={`${c.label}-${idx}`} className="flex items-center gap-1 min-w-0">
            {idx > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-70" />}
            {c.to && !isLast ? (
              <Link to={c.to} className="hover:text-foreground transition-colors truncate">
                {c.label}
              </Link>
            ) : (
              <span className={cn("truncate", isLast && "text-foreground/80")}>{c.label}</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

