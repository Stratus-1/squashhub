import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { flushOutbox } from "@/lib/outbox";
import { useAuth } from "@/contexts/AuthContext";

export function OutboxSync() {
  const { user } = useAuth();
  const flushing = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    const run = async (reason: string) => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        const res = await flushOutbox();
        if (res.needsLogin) return;
        if (res.flushed > 0) {
          toast.success(`Synced ${res.flushed} offline action${res.flushed === 1 ? "" : "s"}`);
        }
        if (reason === "online" && res.remaining > 0) {
          toast.message("Some actions still need attention", {
            description: "Open the app while online to retry syncing.",
          });
        }
      } finally {
        flushing.current = false;
      }
    };

    // Flush on mount (if we're already online).
    if (typeof navigator !== "undefined" && navigator.onLine) {
      run("mount").catch(() => {});
    }

    const onOnline = () => run("online").catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user?.id]);

  return null;
}

