import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DrawNoticeDialog } from "./DrawNoticeDialog";
import { clearDrawNoticePending, drawNoticeSent, pendingDrawNotices, type PendingDrawNotice } from "@/lib/smart-builder/draw-notice";

/**
 * Shows the saved "Send draw to players now?" decision for a committed draw. Lives above the lifecycle
 * step panels so advancing the step (or reloading) never loses it. Nothing is sent until the organiser
 * confirms inside the composer; Later clears the pending flag and the round stays in Player Notifications.
 */
export function PendingDrawNoticePrompt({ clubId, tournamentId, tournamentName, reloadKey }: {
  clubId: string; tournamentId: string; tournamentName: string; reloadKey?: number;
}) {
  const [item, setItem] = useState<(PendingDrawNotice & { key: string }) | null>(null);
  const [bl, setBl] = useState<any>(null);
  const load = async () => {
    const { data } = await (supabase as any).from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
    const life = (data as any)?.beta_lifecycle ?? {};
    setBl(life);
    setItem(pendingDrawNotices(life)[0] ?? null);
  };
  useEffect(() => { load().catch(() => {}); }, [tournamentId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  return (
    <DrawNoticeDialog open clubId={clubId} tournamentId={tournamentId} tournamentName={tournamentName} scope={item.scope}
      sentBefore={drawNoticeSent(bl, item.key)}
      onClose={() => { clearDrawNoticePending(tournamentId, item.key).finally(() => load()); setItem(null); }}
      onSent={() => { load().catch(() => {}); }} />
  );
}
