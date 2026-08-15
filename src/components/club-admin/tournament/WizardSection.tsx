import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, Check, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardSectionProps {
  /** Section heading */
  title: string;
  /** One-line summary shown under the heading (always visible, most useful when collapsed) */
  summary?: ReactNode;
  /** Whether the section's required inputs are filled */
  complete?: boolean;
  /** Open on first render (ignored once the user toggles it) */
  defaultOpen?: boolean;
  /** Collapse automatically the moment `complete` flips to true (unless the user opened it) */
  autoCollapse?: boolean;
  /** Optional right-hand adornment (counts, badges…) */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible section shell for the tournament builder.
 * Purely presentational — it never touches tournament logic, it only decides
 * whether its children are visible and renders a completion indicator + summary.
 */
export function WizardSection({
  title,
  summary,
  complete,
  defaultOpen = true,
  autoCollapse = true,
  aside,
  children,
  className,
}: WizardSectionProps) {
  const [open, setOpen] = useState(defaultOpen && !complete);
  const touched = useRef(false);
  const wasComplete = useRef(!!complete);

  // Auto-collapse the first time the section becomes complete, unless the
  // admin has explicitly opened/closed it themselves.
  useEffect(() => {
    if (!autoCollapse) return;
    if (complete && !wasComplete.current && !touched.current) setOpen(false);
    wasComplete.current = !!complete;
  }, [complete, autoCollapse]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-sm overflow-hidden",
        complete ? "border-emerald-500/40" : "border-border",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          touched.current = true;
          setOpen((o) => !o);
        }}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <span
          className={cn(
            "mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0",
            complete ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          {complete ? <Check className="w-3 h-3" /> : <CircleDashed className="w-3.5 h-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {aside}
          </span>
          {summary && (
            <span className="block text-[11px] text-muted-foreground truncate mt-0.5">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform mt-0.5",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-4 border-t border-border/60">{children}</div>}
    </div>
  );
}
