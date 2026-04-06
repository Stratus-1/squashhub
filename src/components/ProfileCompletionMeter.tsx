import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";
import { fromExt } from "@/lib/supabase-ext";

type Step = { key: string; label: string; done: boolean; action?: string };

interface ProfileCompletionMeterProps {
  profile: {
    name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
  } | null;
  onAction?: (action: string) => void;
}

export function ProfileCompletionMeter({ profile, onAction }: ProfileCompletionMeterProps) {
  const [dismissed, setDismissed] = useState(false);
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const { club: ctxClub } = useClubContext();
  const clubMemberId = myClubMember?.id;
  const club = clubData?.club || ctxClub;
  const faceRequired = !!(club as any)?.face_enrolment_required;

  // Check if fee payment records exist for this member
  const { data: feePayments } = useQuery({
    queryKey: ["profile-completion-fees", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("id, paid")
        .eq("club_member_id", clubMemberId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId,
    staleTime: 30_000,
  });

  if (!profile || dismissed || !clubMemberId) return null;

  // Step 1: Profile basics (name + phone)
  const profileDone =
    !!profile.name &&
    profile.name !== "" &&
    profile.name !== "New Player" &&
    !!profile.phone &&
    String(profile.phone).trim().length > 0;

  // Step 2: Club member data complete (ID, gender, address, fee category, member number)
  const memberDataDone =
    !!myClubMember &&
    !!myClubMember.id_number &&
    !!myClubMember.gender &&
    !!myClubMember.address &&
    !!myClubMember.fee_category_id &&
    !!myClubMember.club_member_number;

  // Step 3: Fees captured (fee payment records exist)
  const feesCaptured = (feePayments || []).length > 0;

  // Step 4: All fees paid
  const allFeesPaid = feesCaptured && (feePayments || []).every((f: any) => f.paid);

  // Step 5 (conditional): Face enrolled
  const faceEnrolled = !!myClubMember?.avatar_url;

  const steps: Step[] = [
    { key: "profile", label: "Complete your profile", done: profileDone, action: "edit" },
    { key: "member", label: "Member details captured", done: memberDataDone, action: "edit" },
    { key: "fees-captured", label: "Fees allocated", done: feesCaptured, action: "account" },
    { key: "fees-paid", label: "All fees paid", done: allFeesPaid, action: "account" },
  ];

  if (faceRequired) {
    steps.push({ key: "face", label: "Face enrolled for access", done: faceEnrolled, action: "face" });
  }

  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  if (pct === 100) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
      >
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold font-heading">Membership progress</p>
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <Progress value={pct} className="h-2 flex-1" />
              <span className="text-xs font-bold text-primary tabular-nums">{pct}%</span>
            </div>
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    step.done ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={cn(step.done && "line-through")}>{step.label}</span>
                  {!step.done && step.action && onAction && (
                    <button
                      className="ml-auto text-primary text-[10px] font-medium flex items-center gap-0.5 hover:underline"
                      onClick={() => onAction(step.action!)}
                    >
                      View <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
