import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function NotificationDeepLinkHandler() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const notificationId = (searchParams.get("notificationId") || "").trim();
    if (!notificationId) return;
    if (lastHandled.current === notificationId) return;

    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId);
    if (!looksLikeUuid) return;

    lastHandled.current = notificationId;

    (async () => {
      try {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", notificationId)
          .eq("user_id", user.id);
      } catch {
        // ignore
      }
    })();

    // Keep the param on /notifications so the page can open the detail view.
    if (location.pathname === "/notifications") return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("notificationId");
      return next;
    }, { replace: true });
  }, [location.pathname, searchParams, setSearchParams, user?.id]);

  return null;
}

