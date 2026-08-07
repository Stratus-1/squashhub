import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Save, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small state helper for "locked until you click Edit" setup sections.
 * `reset` should restore the local form state from the saved record.
 */
export function useEditLock(reset?: () => void) {
  const [editing, setEditing] = useState(false);
  return {
    editing,
    edit: () => setEditing(true),
    cancel: () => {
      reset?.();
      setEditing(false);
    },
    done: () => setEditing(false),
  };
}

interface EditLockProps {
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  /** Hard-disable editing entirely (e.g. the feature toggle above is off) */
  locked?: boolean;
  /** Explanation shown when `locked` is true */
  lockedHint?: string;
  /** Optional label on the left of the control bar */
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a group of setup fields so they are read-only until the admin
 * explicitly clicks Edit. Uses a native <fieldset disabled> so every input,
 * select, switch and button inside is inert while locked.
 */
export function EditLock({
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  locked,
  lockedHint,
  title,
  children,
  className,
}: EditLockProps) {
  const disabled = locked || !editing;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {locked ? (
            <>
              <Lock className="w-3 h-3" />
              {lockedHint || "Turn this feature on above to fill in these settings."}
            </>
          ) : editing ? (
            <>{title ? `Editing ${title}` : "Editing — remember to save your changes."}</>
          ) : (
            <>
              <Lock className="w-3 h-3" />
              Locked to prevent accidental changes. Click Edit to change anything here.
            </>
          )}
        </p>
        {!locked && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={() => onSave()} disabled={saving}>
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

      <fieldset
        disabled={disabled}
        className={cn(
          "min-w-0 border-0 p-0 m-0 space-y-4",
          disabled && "opacity-70 [&_input]:cursor-not-allowed [&_textarea]:cursor-not-allowed"
        )}
      >
        {children}
      </fieldset>
    </div>
  );
}
