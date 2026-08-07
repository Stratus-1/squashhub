import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A single setup field. When locked it shows the saved value as plain text
 * (or a muted "Not set"), when unlocked it renders the supplied input.
 */
export function SetupField({
  label,
  hint,
  editing,
  value,
  children,
  className,
}: {
  label: string;
  hint?: string;
  editing: boolean;
  /** Read-only display value shown when locked */
  value?: ReactNode;
  /** The input to render when unlocked */
  children: ReactNode;
  className?: string;
}) {
  const isEmpty =
    value === undefined || value === null || value === "" || value === false;
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {editing ? (
        children
      ) : (
        <p
          className={cn(
            "text-[13px] min-h-[32px] flex items-center rounded-md border border-transparent bg-muted/40 px-2 py-1.5",
            isEmpty ? "text-muted-foreground italic" : "text-foreground font-medium"
          )}
        >
          {isEmpty ? "Not set" : value}
        </p>
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
