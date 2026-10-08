import { Megaphone } from "lucide-react";
import { PlatformUpdatesInbox } from "@/components/club-admin/PlatformUpdatesInbox";
import { useClubContext } from "@/contexts/ClubContext";

/** "Updates from SquashHub" for every signed-in member (own rows only via RLS). */
export default function Updates() {
  const { club } = useClubContext();
  return (
    <div className="bottom-nav-safe mx-auto w-full max-w-3xl space-y-3 p-4">
      <div>
        <h1 className="font-heading text-lg font-semibold inline-flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" /> Updates from SquashHub
        </h1>
        <p className="text-xs text-muted-foreground">What's new in the app, from the SquashHub team.</p>
      </div>
      <PlatformUpdatesInbox clubId={club?.id ?? ""} />
    </div>
  );
}
