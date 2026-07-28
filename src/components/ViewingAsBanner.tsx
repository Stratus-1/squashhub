import { useEffect, useState } from "react";
import { useMemberContext } from "@/contexts/MemberContext";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { getImpersonation, stopImpersonation } from "@/lib/impersonation";
import { toast } from "sonner";

/**
 * Persistent app-wide banner shown while an admin is signed in as another
 * member (real session swap), or — legacy — viewing as another member.
 */
export function ViewingAsBanner() {
  const { isViewingAs, activeMember, resetToSelf } = useMemberContext();
  const [impersonation, setImpersonation] = useState(getImpersonation());
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setImpersonation(getImpersonation()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleExitImpersonation = async () => {
    setExiting(true);
    try {
      await stopImpersonation();
      setImpersonation(null);
      window.location.href = "/";
    } catch (e: any) {
      toast.error(e?.message || "Could not switch back");
      window.location.href = "/auth";
    }
  };

  if (impersonation) {
    const name = impersonation.memberName || "member";
    return (
      <div className="fixed top-0 left-0 right-0 z-[60] bg-destructive text-destructive-foreground shadow-md">
        <div className="mx-auto max-w-7xl px-3 py-1.5 flex items-center gap-2 text-[12px]">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            Signed in as <strong>{name}</strong> — everything you do is recorded against this member
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px] ml-auto shrink-0 gap-1"
            onClick={handleExitImpersonation}
            disabled={exiting}
          >
            <X className="w-3 h-3" /> {exiting ? "Switching…" : "Back to my account"}
          </Button>
        </div>
      </div>
    );
  }

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
