import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Best-effort background enrichment: members who never came through an
 * association import have no SportyHQ profile yet, so their regional /
 * national standings cannot be resolved. Kick off a one-off lookup
 * (at most once a day per member) and refresh once it lands.
 */
export function useSportyhqAutoLink(
  memberId: string | null,
  hasProfileData: boolean,
  ready: boolean,
  onLinked?: () => void,
) {
  const triggered = useRef(false);
  useEffect(() => {
    if (!memberId || !ready || hasProfileData || triggered.current) return;
    const key = `sh.sportyhq.autolink.${memberId}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    triggered.current = true;
    localStorage.setItem(key, String(Date.now()));
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("sportyhq-lookup", {
          body: { action: "auto_link", club_member_id: memberId },
        });
        if ((data as any)?.status === "saved") onLinked?.();
      } catch {
        /* silent — best-effort enrichment */
      }
    })();
  }, [memberId, ready, hasProfileData, onLinked]);
}
