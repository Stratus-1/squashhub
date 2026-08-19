import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCapabilities } from "@/hooks/use-club-capabilities";
import { useMyClub } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";
import type { Capability } from "@/lib/capabilities";

interface Props {
  capability: Capability;
  children: ReactNode;
  /** Where to send members when the club doesn't use this feature */
  redirectTo?: string;
}

/**
 * Route guard for optional capabilities. Hiding a tile is not enough — a
 * disabled feature must not be reachable by typing the URL either.
 *
 * Fails open while loading, for association tenants, and for clubs that have
 * no capability rows yet, so nothing that works today ever disappears.
 */
export function CapabilityRoute({ capability, children, redirectTo = "/" }: Props) {
  const { data: clubData } = useMyClub();
  const { club: contextClub } = useClubContext();
  const { enabled, isLoading, hasRows } = useCapabilities();

  const tenantType =
    (clubData?.club as any)?.tenant_type ?? (contextClub as any)?.tenant_type;

  if (isLoading || !hasRows || tenantType === "association") return <>{children}</>;
  if (!enabled.has(capability)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
