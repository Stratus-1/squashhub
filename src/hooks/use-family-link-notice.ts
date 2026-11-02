import { useEffect } from "react";
import { toast } from "sonner";

/** Clubs that must not see the family-linking notice. */
const EXCLUDED = ["uitsig"];

export function isFamilyNoticeExcluded(club?: { name?: string | null; subdomain?: string | null } | null) {
  const hay = `${club?.subdomain ?? ""} ${club?.name ?? ""}`.toLowerCase();
  return EXCLUDED.some((k) => hay.includes(k));
}

/** Once-off, dismissible family-package notice per club per device. Display only. */
export function useFamilyLinkNotice(
  club: { id?: string | null; name?: string | null; subdomain?: string | null } | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !club?.id || isFamilyNoticeExcluded(club)) return;
    const key = `sh.family-notice.${club.id}`;
    try { if (localStorage.getItem(key)) return; } catch { return; }
    const t = setTimeout(() => {
      toast("Family package?", {
        id: key,
        duration: Infinity,
        closeButton: true,
        description:
          "The main member can go to My Account → My family → Add family member. Not registered yet? Choose New person. Already a member? Choose Existing member and add them to the family package.",
        onDismiss: () => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } },
        action: { label: "Got it", onClick: () => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } } },
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [enabled, club?.id, club?.name, club?.subdomain]);
}
