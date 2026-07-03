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

  const s: any = secrets || {};
  const clubComplete = !!(
    club?.name &&
    club?.address &&
    (club?.contact_email || club?.email) &&
    club?.phone &&
    club?.logo_url
  );
  const settingsComplete = !!(
    club?.email_signature &&
    club?.email_disclaimer &&
    s.sender_email &&
    s.smtp_host &&
    s.smtp_user &&
    s.smtp_pass
  );
  const courtsComplete = courtsCount > 0;
  const feesComplete = feesCount > 0;
  const bankingComplete = !!(
    s.bank_name &&
    s.bank_account_name &&
    s.bank_account_number &&
    s.bank_branch_code
  );

  // Access: required fields depend on the chosen method
  const accessType: string = s.access_control_type || "none";
  let accessComplete = false;
  if (accessType === "none") {
    accessComplete = false; // not yet configured
  } else if (accessType === "key" || accessType === "other") {
    accessComplete = true; // no extra config required
  } else if (accessType === "remote_trigger") {
    accessComplete = !!(s.fluss_api_token && s.fluss_default_device_id);
  } else if (accessType === "shelly_relay") {
    accessComplete = !!(s.shelly_auth_key && s.shelly_door_device_id);
  } else if (accessType === "face_recognition") {
    const provider = s.access_provider;
    if (provider === "zkbio" || provider === "hikvision") {
      accessComplete = !!(s.access_control_endpoint && s.access_control_api_user && s.access_control_api_pass);
    } else if (provider === "zk_push") {
      accessComplete = !!s.access_control_api_key;
    } else {
      accessComplete = !!provider;
    }
  } else if (accessType === "tap_card" || accessType === "pin") {
    accessComplete = !!s.access_control_api_key;
  }

  const commsComplete = !!(
    club?.email_signature &&
    club?.email_disclaimer &&
    s.smtp_host &&
    s.smtp_port &&
    s.smtp_user &&
    s.smtp_pass &&
    s.sender_email &&
    s.sender_name
  );

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
