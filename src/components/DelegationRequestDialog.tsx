import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Check, X, ShieldCheck } from "lucide-react";

/**
 * Global handler: when a notification link contains ?delegation=<id>,
 * show an Accept / Decline dialog directly instead of dumping the user
 * on their own Profile page.
 */
export function DelegationRequestDialog() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const delegationId = searchParams.get("delegation");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [row, setRow] = useState<any>(null);
  const [grantor, setGrantor] = useState<any>(null);

  useEffect(() => {
    if (!delegationId || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: d } = await fromExt("member_account_delegations")
          .select("*")
          .eq("id", delegationId)
          .maybeSingle();
        if (cancelled) return;
        setRow(d);
        if (d?.grantor_member_id) {
          const { data: g } = await fromExt("club_members")
            .select("id, name, club_member_number")
            .eq("id", d.grantor_member_id)
            .maybeSingle();
          if (!cancelled) setGrantor(g);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [delegationId, user?.id]);

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("delegation");
      return next;
    }, { replace: true });
    setRow(null);
    setGrantor(null);
  };

  const respond = async (accept: boolean) => {
    if (!row) return;
    setActing(true);
    try {
      const { error } = await fromExt("member_account_delegations")
        .update({ status: accept ? "active" : "declined", responded_at: new Date().toISOString() } as any)
        .eq("id", row.id);
      if (error) throw error;
      toast.success(accept ? "Access granted" : "Request declined");
      close();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setActing(false);
    }
  };

  const open = !!delegationId;
  const alreadyResponded = row && row.status !== "pending";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Account access request
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading…"
              : !row
                ? "This request is no longer available."
                : alreadyResponded
                  ? `This request was already ${row.status}.`
                  : `${grantor?.name || "A club member"}${grantor?.club_member_number ? ` (#${grantor.club_member_number})` : ""} wants you to view and pay their account fees. You can revoke access at any time.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : row && !alreadyResponded ? (
          <div className="flex gap-2 mt-2">
            <Button className="flex-1 gap-1" disabled={acting} onClick={() => respond(true)}>
              <Check className="w-4 h-4" /> Accept
            </Button>
            <Button className="flex-1 gap-1" variant="outline" disabled={acting} onClick={() => respond(false)}>
              <X className="w-4 h-4" /> Decline
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={close}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
