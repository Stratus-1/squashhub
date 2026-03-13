import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub, useFeeCategories, useLeagueAssociations, useNationalBodyFees, MemberFeeCategory, SKILL_LEVELS } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { User, ChevronRight, ChevronLeft, Check, Loader2, CreditCard, Users, FileText, Trophy } from "lucide-react";

const STEPS = [
  { id: "welcome", label: "Welcome", icon: User },
  { id: "personal", label: "Personal Details", icon: FileText },
  { id: "membership", label: "Membership", icon: Users },
  { id: "fees", label: "Fees & Payment", icon: CreditCard },
  { id: "done", label: "Complete", icon: Check },
];

/** Extract date of birth from SA ID number (first 6 digits = YYMMDD) */
function getAgeFromSAId(idNumber: string): number | null {
  if (!idNumber || idNumber.length < 6) return null;
  const yy = parseInt(idNumber.substring(0, 2), 10);
  const mm = parseInt(idNumber.substring(2, 4), 10);
  const dd = parseInt(idNumber.substring(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
  const dob = new Date(year, mm - 1, dd);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Detect gender from SA ID (digit at position 6: 0-4 = female, 5-9 = male) */
function getGenderFromSAId(idNumber: string): string | null {
  if (!idNumber || idNumber.length < 7) return null;
  const genderDigit = parseInt(idNumber[6], 10);
  if (isNaN(genderDigit)) return null;
  return genderDigit >= 5 ? "male" : "female";
}

/** Generate next member number based on club settings */
function generateMemberNumber(
  prefix: string,
  length: number,
  start: number,
  existingNumbers: string[]
): string {
  // Find the highest existing number
  let maxNum = start - 1;
  for (const num of existingNumbers) {
    const stripped = num.replace(prefix, "");
    const parsed = parseInt(stripped, 10);
    if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
  }
  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(length, "0");
  return `${prefix}${padded}`;
}

/** Calculate pro-rated fee based on months remaining */
function proRateFee(annualFee: number, dueMonth: number): number {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  let monthsRemaining: number;
  if (currentMonth <= dueMonth) {
    monthsRemaining = dueMonth - currentMonth;
  } else {
    monthsRemaining = 12 - currentMonth + dueMonth;
  }
  if (monthsRemaining === 0) return annualFee; // Full year if at due month
  return Math.round((annualFee / 12) * monthsRemaining * 100) / 100;
}

export function MemberOnboardingWizard({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const { club: ctxClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const club = clubData?.club;
  const clubId = club?.id || ctxClub?.id;

  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: leagueAssocs = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);

  // Personal details
  const [name, setName] = useState(user?.user_metadata?.name || "");
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [skillLevel, setSkillLevel] = useState("");

  // Membership
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [playsLeague, setPlaysLeague] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [suggestedCategory, setSuggestedCategory] = useState<string>("");

  // Auto-detect gender and suggest category from ID
  useEffect(() => {
    if (idNumber.length >= 7) {
      const detectedGender = getGenderFromSAId(idNumber);
      if (detectedGender && !gender) setGender(detectedGender);
    }
    if (idNumber.length >= 6 && feeCategories.length > 0) {
      const age = getAgeFromSAId(idNumber);
      if (age !== null) {
        // Find pensioner category (age 60+) or normal
        const pensionerCat = feeCategories.find(c => c.name.toLowerCase().includes("pension"));
        const normalCat = feeCategories.find(c => c.name.toLowerCase() === "normal" || c.name.toLowerCase() === "standard" || c.name.toLowerCase() === "adult");
        
        if (age >= 60 && pensionerCat) {
          setSuggestedCategory(pensionerCat.id);
          if (!feeCategoryId) setFeeCategoryId(pensionerCat.id);
        } else if (normalCat) {
          setSuggestedCategory(normalCat.id);
          if (!feeCategoryId) setFeeCategoryId(normalCat.id);
        } else if (feeCategories.length > 0 && !feeCategoryId) {
          setFeeCategoryId(feeCategories[0].id);
        }
      }
    }
  }, [idNumber, feeCategories, gender, feeCategoryId]);

  // Auto-generate member number when reaching membership step
  useEffect(() => {
    if (step === 2 && clubId && !memberNumber) {
      (async () => {
        const prefix = (club as any)?.member_number_prefix || "";
        const length = (club as any)?.member_number_length || 4;
        const start = (club as any)?.member_number_start || 1;
        
        const { data: existing } = await fromExt("club_members")
          .select("club_member_number")
          .eq("club_id", clubId)
          .not("club_member_number", "is", null);
        
        const existingNums = (existing || []).map((r: any) => r.club_member_number || "");
        const nextNumber = generateMemberNumber(prefix, length, start, existingNums);
        setMemberNumber(nextNumber);
      })();
    }
  }, [step, clubId, club, memberNumber]);

  const selectedCategory = feeCategories.find(c => c.id === feeCategoryId);
  const dueMonth = (club as any)?.member_fee_due_month || 1;

  // Calculate fees
  const feeBreakdown = useMemo(() => {
    const items: { label: string; amount: number; type: string }[] = [];
    
    if (selectedCategory) {
      const proRated = proRateFee(selectedCategory.annual_fee, dueMonth);
      items.push({
        label: `Club Membership (${selectedCategory.name})${proRated < selectedCategory.annual_fee ? " — Pro-rated" : ""}`,
        amount: proRated,
        type: "club",
      });
    }

    if (playsLeague) {
      // League association fees
      for (const assoc of leagueAssocs) {
        if (assoc.fee_annual && assoc.fee_annual > 0) {
          items.push({
            label: `${assoc.name}${assoc.abbreviation ? ` (${assoc.abbreviation})` : ""} Registration`,
            amount: assoc.fee_annual,
            type: "association",
          });
        }
      }
      // National body fees (e.g. SSA)
      for (const nbf of nationalFees) {
        if (nbf.fee_annual && (nbf.fee_annual as number) > 0) {
          items.push({
            label: `${nbf.body_name}${nbf.abbreviation ? ` (${nbf.abbreviation})` : ""}`,
            amount: nbf.fee_annual as number,
            type: "national",
          });
        }
      }
    }
    
    return items;
  }, [selectedCategory, playsLeague, leagueAssocs, nationalFees, dueMonth]);

  const totalFees = feeBreakdown.reduce((sum, f) => sum + f.amount, 0);

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleSave = async () => {
    if (!user || !clubId) return;
    setSaving(true);
    try {
      // 1. Update profile
      const { error: profileErr } = await (supabase as any)
        .from("profiles")
        .update({
          name: name.trim() || "New Player",
          phone: phone.trim() || null,
          onboarding_completed: true,
        })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      // 2. Update or create club_member record
      const { data: existingMember } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle();

      const memberData = {
        name: name.trim(),
        phone: phone.trim() || null,
        id_number: idNumber.trim() || null,
        gender: gender || null,
        address: address.trim() || null,
        skill_level: skillLevel || null,
        fee_category_id: feeCategoryId || null,
        plays_league: playsLeague,
        club_member_number: memberNumber || null,
      };

      if (existingMember) {
        const { error: memErr } = await fromExt("club_members")
          .update(memberData)
          .eq("id", existingMember.id);
        if (memErr) throw memErr;
      } else {
        const { error: memErr } = await fromExt("club_members")
          .insert({ ...memberData, club_id: clubId, user_id: user.id, role: "member" });
        if (memErr) throw memErr;
      }

      // 3. Create fee payment records
      if (feeBreakdown.length > 0) {
        // Get the club_member_id
        const { data: cmData } = await fromExt("club_members")
          .select("id")
          .eq("club_id", clubId)
          .eq("user_id", user.id)
          .single();

        if (cmData) {
          const currentYear = new Date().getFullYear();
          const feeRecords = feeBreakdown.map(fee => ({
            club_member_id: cmData.id,
            fee_label: fee.label,
            fee_type: fee.type,
            amount: fee.amount,
            season_year: currentYear,
            paid: false,
          }));

          const { error: feeErr } = await fromExt("club_member_fee_payments")
            .insert(feeRecords);
          if (feeErr) throw feeErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-club"] });
      queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
      toast.success("Registration complete! Welcome to the club 🎉");
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to save registration");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      handleSave();
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const canProceed = () => {
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return !!feeCategoryId;
    return true;
  };

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-lg gap-0 p-0 overflow-hidden [&>button]:hidden max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="px-6 pt-6 pb-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-muted-foreground">
              {STEPS[step].label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 min-h-[320px] flex flex-col">
          <AnimatePresence mode="wait">
            {/* ─── WELCOME ─── */}
            {step === 0 && (
              <motion.div key="welcome" {...slideVariants}
                className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <DialogHeader className="items-center">
                  <DialogTitle className="text-xl font-heading">Welcome to {club?.name || "the Club"}!</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground max-w-[320px]">
                    Let's complete your membership registration. We'll collect your details, assign your membership, and show you the fees applicable.
                  </DialogDescription>
                </DialogHeader>
              </motion.div>
            )}

            {/* ─── PERSONAL DETAILS ─── */}
            {step === 1 && (
              <motion.div key="personal" {...slideVariants} className="flex-1 space-y-4 pt-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Personal Details</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Your details help us set up your membership correctly.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="onb-name">Full Name <span className="text-destructive">*</span></Label>
                    <Input id="onb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="onb-id">SA ID Number</Label>
                    <Input id="onb-id" value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="e.g. 8501015800082" maxLength={13} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Used to auto-detect age, gender & fee category</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="onb-phone">Phone</Label>
                      <Input id="onb-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="onb-address">Address</Label>
                    <Input id="onb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City" />
                  </div>
                  <div>
                    <Label>Skill Level</Label>
                    <Select value={skillLevel} onValueChange={setSkillLevel}>
                      <SelectTrigger><SelectValue placeholder="Select skill level" /></SelectTrigger>
                      <SelectContent>
                        {SKILL_LEVELS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── MEMBERSHIP ─── */}
            {step === 2 && (
              <motion.div key="membership" {...slideVariants} className="flex-1 space-y-4 pt-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Membership</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Your membership category and number.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Member Number</Label>
                    <div className="flex items-center gap-2">
                      <Input value={memberNumber} readOnly className="bg-muted font-mono" />
                      <Badge variant="outline" className="whitespace-nowrap text-xs">Auto-assigned</Badge>
                    </div>
                  </div>

                  <div>
                    <Label>Membership Category <span className="text-destructive">*</span></Label>
                    <Select value={feeCategoryId} onValueChange={setFeeCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {feeCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name} — R{cat.annual_fee.toFixed(2)}/year
                            {cat.id === suggestedCategory && " ⭐ Suggested"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {suggestedCategory && feeCategoryId === suggestedCategory && (
                      <p className="text-[10px] text-primary mt-0.5">
                        ⭐ Auto-suggested based on your ID number. You may change this.
                      </p>
                    )}
                    {selectedCategory?.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{selectedCategory.description}</p>
                    )}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">League Player</Label>
                      <p className="text-[10px] text-muted-foreground">Register for competitive league play</p>
                    </div>
                    <Switch checked={playsLeague} onCheckedChange={setPlaysLeague} />
                  </div>

                  {playsLeague && (
                    <p className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2">
                      <Trophy className="w-3 h-3 inline mr-1" />
                      Association registration numbers will be assigned by your club admin after registration. League and national body fees will be added to your account.
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* ─── FEES ─── */}
            {step === 3 && (
              <motion.div key="fees" {...slideVariants} className="flex-1 space-y-4 pt-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Fees Summary</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Review your applicable fees. These will be added to your account for payment.
                  </DialogDescription>
                </DialogHeader>

                {feeBreakdown.length > 0 ? (
                  <Card className="p-4 space-y-3">
                    {feeBreakdown.map((fee, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {fee.type === "club" ? "Club" : fee.type === "association" ? "League" : "National"}
                          </Badge>
                          <span>{fee.label}</span>
                        </div>
                        <span className="font-mono font-medium">R{fee.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center justify-between font-semibold">
                      <span>Total Due</span>
                      <span className="font-mono text-primary">R{totalFees.toFixed(2)}</span>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4 text-center text-sm text-muted-foreground">
                    No fees configured for this club yet.
                  </Card>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Fees will be added to your member account. You can pay via EFT or card from your dashboard.
                </p>
              </motion.div>
            )}

            {/* ─── DONE ─── */}
            {step === 4 && (
              <motion.div key="done" {...slideVariants}
                className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <DialogHeader className="items-center">
                  <DialogTitle className="text-xl font-heading">Registration Complete!</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground max-w-[320px]">
                    {memberNumber && <span className="block font-mono text-primary mb-1">Member #{memberNumber}</span>}
                    Your membership is set up. You can manage your fees and profile from the dashboard.
                  </DialogDescription>
                </DialogHeader>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-auto pt-4">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={back}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" onClick={next} disabled={!canProceed() || saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {step === STEPS.length - 1 ? "Complete Registration" : "Next"}
              {step < STEPS.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
