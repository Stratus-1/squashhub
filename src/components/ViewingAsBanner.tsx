import { useMemberContext } from "@/contexts/MemberContext";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";

/**
 * Persistent app-wide banner shown while a club admin (or family account) is
 * viewing the app as another member. Gives a one-tap way back to own profile.
 */
export function ViewingAsBanner() {
  const { isViewingAs, activeMember, resetToSelf } = useMemberContext();

  if (!isViewingAs || !activeMember) return null;

  const name = activeMember.name || activeMember.club_member_number || "member";

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto max-w-7xl px-3 py-1.5 flex items-center gap-2 text-[12px]">
        <Eye className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          Viewing as <strong>{name}</strong> — you are seeing this member's view
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-[11px] ml-auto shrink-0 gap-1"
          onClick={resetToSelf}
        >
          <X className="w-3 h-3" /> Exit
        </Button>
      </div>
    </div>
  );
}
