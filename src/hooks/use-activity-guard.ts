import { useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { beginActivity, type ActivityKind } from "@/lib/app-activity";

/**
 * Marks the user as "busy" for as long as `active` is true.
 * While busy, the safe-silent-update system never prompts or reloads.
 *
 *   useActivityGuard("form", isDirty);
 *   useActivityGuard("upload", uploading);
 */
export function useActivityGuard(kind: ActivityKind, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const end = beginActivity(kind);
    return end;
  }, [kind, active]);
}

/** Registers in-flight React Query mutations as activity. Mount once. */
export function useMutationActivity(): void {
  const mutating = useIsMutating();
  useActivityGuard("mutation", mutating > 0);
}
