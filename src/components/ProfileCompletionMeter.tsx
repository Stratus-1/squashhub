import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserCog, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";

interface ProfileCompletionMeterProps {
  profile: {
    name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  } | null;
  onAction?: (action: string) => void;
}

/**
 * Single-prompt profile completion banner.
 *
 * Shown whenever any member detail is missing (name, phone, ID, gender,
 * address, fee category, member number) — or face enrolment if the club
 * requires it. Tapping the CTA opens the Edit Profile dialog (action="edit").
 * League participation lives inside that dialog now, so this banner stays
 * focused on a single next step instead of a multi-row checklist.
 */
export function ProfileCompletionMeter({ profile, onAction }: ProfileCompletionMeterProps) {
  const [dismissed, setDismissed] = useState(false);
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const { club: ctxClub } = useClubContext();
  const clubMemberId = myClubMember?.id;
  const club = clubData?.club || ctxClub;
  const faceRequired = !!(club as any)?.face_enrolment_required;

  if (!profile || dismissed || !clubMemberId) return null;

  const missingProfile =
    !profile.name ||
    profile.name === "" ||
    profile.name === "New Player" ||
    !profile.phone ||
    String(profile.phone).trim().length === 0;

  const missingMember =
    !myClubMember ||
    !myClubMember.id_number ||
    !myClubMember.gender ||
    !myClubMember.address ||
    !myClubMember.fee_category_id ||
    !myClubMember.club_member_number;

  const missingFace = faceRequired && !myClubMember?.avatar_url;

  // Nothing missing → don't show
  if (!missingProfile && !missingMember && !missingFace) return null;

  const isFaceOnly = missingFace && !missingProfile && !missingMember;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
      >
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <UserCog className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight font-heading">
                  {isFaceOnly ? "Enrol your face for court access" : "Complete your profile"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isFaceOnly
                    ? "One quick step left so the access gates can recognise you."
                    : "We need a few more details to finish setting up your membership and any league fees."}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      onAction?.(isFaceOnly ? "face" : "edit-then-account")
                    }
                  >
                    {isFaceOnly ? "Enrol face" : "Complete profile"}
                  </Button>
                </div>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
