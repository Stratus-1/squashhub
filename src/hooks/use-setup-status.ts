import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubSecrets } from "@/hooks/use-club-secrets";

export type SetupState = "complete" | "incomplete";

export interface SetupStatusMap {
  club: SetupState;
  settings: SetupState;
  fees: SetupState;
  courts: SetupState;
  banking: SetupState;
  access: SetupState;
  comms: SetupState;
  permissions: SetupState;
}

/**
 * Determines whether each Setup tile is "Complete" or needs attention.
 * Heuristics are lightweight — they check that the minimum config exists.
 */
export function useSetupStatus(clubId?: string, club?: any): SetupStatusMap {
  const { data: secrets } = useClubSecrets(clubId);

  const { data: courtsCount = 0 } = useQuery({
    queryKey: ["setup-status-courts", clubId],
    queryFn: async () => {
      const { count } = await fromExt("courts").select("id", { count: "exact", head: true }).eq("club_id", clubId!);
      return count ?? 0;
    },
    enabled: !!clubId,
  });

  const { data: feesCount = 0 } = useQuery({
    queryKey: ["setup-status-fees", clubId],
    queryFn: async () => {
      const { count } = await fromExt("member_fee_categories").select("id", { count: "exact", head: true }).eq("club_id", clubId!);
      return count ?? 0;
    },
    enabled: !!clubId,
  });

  const clubComplete = !!(club?.name && club?.address && (club?.contact_email || club?.email) && club?.logo_url);
  const settingsComplete = !!(
    club?.email_signature &&
    club?.email_disclaimer &&
    secrets?.sender_email &&
    secrets?.smtp_host &&
    secrets?.smtp_user &&
    secrets?.smtp_pass
  );
  const courtsComplete = courtsCount > 0;
  const feesComplete = feesCount > 0;
  const bankingComplete = !!(secrets?.bank_account_number || secrets?.payment_gateway_secret_key);
  const accessComplete = !!((secrets as any)?.access_control_type && (secrets as any).access_control_type !== "none");
  const commsComplete = !!(club?.email_signature && secrets?.smtp_host && secrets?.sender_email);

  return {
    club: clubComplete ? "complete" : "incomplete",
    settings: settingsComplete ? "complete" : "incomplete",
    fees: feesComplete ? "complete" : "incomplete",
    courts: courtsComplete ? "complete" : "incomplete",
    banking: bankingComplete ? "complete" : "incomplete",
    access: accessComplete ? "complete" : "incomplete",
    comms: commsComplete ? "complete" : "incomplete",
    permissions: "complete", // always-available, no required setup
  };
}
