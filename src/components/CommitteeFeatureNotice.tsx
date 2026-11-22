import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, FolderOpen, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useCanManageClubDocuments } from "@/hooks/use-club-documents";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** One-time committee announcement. Closing it records a dismissal for the
 *  person (server-side), so it never shows again on any device. */
export const COMMITTEE_NOTICE_KEY = "committee-2026-11-approvals-documents";

export function CommitteeFeatureNotice() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { club: tenantClub } = useClubContext();
  const { data: myClub } = useMyClub();
  const isClubAdmin = useIsClubAdmin();
  // Same club Club Admin opens: the tenant club, else the member's active club.
  const { data: canManageDocs } = useCanManageClubDocuments(tenantClub?.id ?? myClub?.club?.id);
  const docsInAdmin = !!canManageDocs || !!isClubAdmin;
  const [closed, setClosed] = useState(false);

  const { data: show } = useQuery({
    queryKey: ["committee-feature-notice", user?.id, COMMITTEE_NOTICE_KEY],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data: dismissed } = await supabase
        .from("feature_notice_dismissals")
        .select("notice_key")
        .eq("user_id", user!.id)
        .eq("notice_key", COMMITTEE_NOTICE_KEY)
        .maybeSingle();
      if (dismissed) return false;
      const { data: eligible, error } = await supabase.rpc("is_committee_at_active_club");
      if (error) return false;
      return !!eligible;
    },
  });

  const dismiss = async () => {
    setClosed(true);
    if (!user?.id) return;
    await supabase
      .from("feature_notice_dismissals")
      .upsert({ user_id: user.id, notice_key: COMMITTEE_NOTICE_KEY }, { onConflict: "user_id,notice_key", ignoreDuplicates: true });
    qc.setQueryData(["committee-feature-notice", user.id, COMMITTEE_NOTICE_KEY], false);
  };

  const go = (path: string) => {
    void dismiss();
    navigate(path);
  };

  if (!show || closed) return null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) void dismiss(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            New for club committees
          </DialogTitle>
          <DialogDescription className="text-xs">This message shows only once.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileSignature className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-semibold">New: Committee approvals</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You can now ask other committee members to approve a decision or expense inside SquashHub.
            </p>
            <p className="text-xs text-muted-foreground">
              Go to <strong className="text-foreground">Club Admin → Approvals → New request</strong>. Add a topic and
              description, attach any documents, sign it, and choose the committee members who must approve.
            </p>
            <p className="text-xs text-muted-foreground">
              They get a notice in the app and an email with a private link. They can open the request, read the
              documents, then sign and approve, or decline, without logging in. Approved requests are kept as a
              permanent record with every signature.
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => go("/club-admin?tab=approvals")}>
              Open Approvals
            </Button>
          </Card>

          <Card className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-semibold">New: Club documents</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Your club now has its own document library. Upload your constitution, AGM documents, financial reports
              and other club documents in <strong className="text-foreground">Club Admin → Rules &amp; Documents → Club documents</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Group them in standard or your own categories. Tick <strong className="text-foreground">Visible to members</strong> to
              show a document on every member's <strong className="text-foreground">Club Documents</strong> tile on the home
              screen. SquashHub also suggests a short description and the document date when you upload.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => go(docsInAdmin ? "/club-admin?tab=rules#club-documents" : "/club-documents")}
            >
              Open Club documents
            </Button>
          </Card>
        </div>

        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={() => void dismiss()}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
