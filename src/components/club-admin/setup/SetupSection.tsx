import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Save, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SetupSectionProps {
  /** Plain-language title of what this page does */
  title: string;
  /** One-line description of what gets done here */
  description?: string;
  /** Whether the section's required fields are filled */
  complete?: boolean;
  /** Locked = read-only summary. Unlocked = inputs. */
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  /** Hide the Edit/Save controls (for sections that manage their own saving, e.g. lists) */
  readOnlyControls?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Shared shell for every club setup page.
 * Renders a titled card with a "what this page does" line, a completion pill,
 * and Edit / Save / Cancel controls so saved data can't be changed accidentally.
 */
export function SetupSection({
  title,
  description,
  complete,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  readOnlyControls,
  children,
  className,
}: SetupSectionProps) {
  return (
    <Card className={cn("p-4 md:p-5 space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{title}</h3>
            {complete !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  "h-5 gap-1 text-[10px] font-medium",
                  complete
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/40 text-amber-700 dark:text-amber-400"
                )}
              >
                {complete ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {complete ? "Complete" : "Needs info"}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{description}</p>
          )}
        </div>

        {!readOnlyControls && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <div>{children}</div>
    </Card>
  );
}
