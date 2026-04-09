import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { User, ChevronRight, ChevronLeft, Check, Loader2, CreditCard, Users, FileText, Trophy, Camera, ScanFace } from "lucide-react";

interface StepDef {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
}

const BASE_STEPS: StepDef[] = [
  { id: "welcome", label: "Welcome", icon: User },
  { id: "personal", label: "Personal Details", icon: FileText },
  { id: "membership", label: "Membership", icon: Users },
  { id: "fees", label: "Fees & Payment", icon: CreditCard },
];

const FACE_STEP: StepDef = { id: "face", label: "Face Enrolment", icon: ScanFace };
const DONE_STEP: StepDef = { id: "done", label: "Complete", icon: Check };

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
  return genderDigit >= 5 ? "Men" : "Ladies";
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
  // Check face_enrolment_required from useMyClub data OR fetch directly from ClubContext
  const faceRequired = !!(club as any)?.face_enrolment_required || !!(ctxClub as any)?.face_enrolment_required;

  const STEPS = useMemo(() => {
    const steps = [...BASE_STEPS];
    if (faceRequired) steps.push(FACE_STEP);
    steps.push(DONE_STEP);
    return steps;
  }, [faceRequired]);

  // Face enrolment state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const currentStepId = STEPS[step]?.id;

  // Start camera when entering face step
  useEffect(() => {
    if (currentStepId === "face" && !capturedPhoto) {
      startCamera();
    }
    return () => {
      if (currentStepId !== "face") stopCamera();
    };
  }, [currentStepId, capturedPhoto]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError("Could not access your camera. Please grant camera permissions and try again.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: leagueAssocs = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);

  // Personal details
  const [name, setName] = useState(user?.user_metadata?.name || "");
  const [phone, setPhone] = useState(user?.user_metadata?.phone || "");
  const [idNumber, setIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [skillLevel, setSkillLevel] = useState("");

  // Membership
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [playsLeague, setPlaysLeague] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [suggestedCategory, setSuggestedCategory] = useState<string>("");
  const [detectedAge, setDetectedAge] = useState<number | null>(null);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);

  /** Calculate age from a date of birth string (YYYY-MM-DD) */
  function getAgeFromDob(dob: string): number | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  }

  /** Find the best fee category for a given age */
  function suggestCategoryForAge(age: number, cats: MemberFeeCategory[]): string | null {
    if (cats.length === 0) return null;
    const lower = (s: string) => s.toLowerCase();
    const studentCat = cats.find(c => /student|school|junior|youth|child|scholar/i.test(c.name));
    const pensionerCat = cats.find(c => /pension|senior|retired|oap/i.test(c.name));
    const normalCat = cats.find(c => /^(normal|standard|adult|full|regular)$/i.test(c.name)) || cats.find(c => !/student|school|junior|youth|child|scholar|pension|senior|retired|oap|spouse|family/i.test(c.name));

    if (age < 18 && studentCat) return studentCat.id;
    if (age >= 18 && age < 25 && studentCat) return studentCat.id;
    if (age >= 60 && pensionerCat) return pensionerCat.id;
    if (normalCat) return normalCat.id;
    return cats[0].id;
  }

  // Auto-detect gender and suggest category from ID
  useEffect(() => {
    if (idNumber.length >= 7) {
      const detectedGender = getGenderFromSAId(idNumber);
      if (detectedGender && !gender) setGender(detectedGender);
    }
    // Try age from ID first, then from DOB
    let age: number | null = null;
    if (idNumber.length >= 6) {
      age = getAgeFromSAId(idNumber);
    }
    if (age === null && dateOfBirth) {
      age = getAgeFromDob(dateOfBirth);
    }
    setDetectedAge(age);

    if (age !== null && feeCategories.length > 0) {
      const suggested = suggestCategoryForAge(age, feeCategories);
      if (suggested) {
        setSuggestedCategory(suggested);
        if (!categoryAutoSet) {
          setFeeCategoryId(suggested);
          setCategoryAutoSet(true);
        }
      }
    }
  }, [idNumber, dateOfBirth, feeCategories, gender, categoryAutoSet]);

  // Auto-generate member number when reaching membership step (uses DB function to bypass RLS)
  useEffect(() => {
    if (step === 2 && clubId && !memberNumber) {
      (async () => {
        const { data, error } = await supabase.rpc("get_next_member_number", { _club_id: clubId });
        if (!error && data) {
          setMemberNumber(data as string);
        } else {
          console.warn("Failed to get next member number:", error);
        }
      })();
    }
  }, [step, clubId, memberNumber]);

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

    // Registration fees (once-off for new members) — always included
    for (const nbf of nationalFees) {
      if ((nbf as any).fee_type === "registration" && (nbf as any).active !== false && nbf.fee_annual && (nbf.fee_annual as number) > 0) {
        items.push({
          label: nbf.body_name + (nbf.abbreviation ? ` (${nbf.abbreviation})` : ""),
          amount: nbf.fee_annual as number,
          type: "registration",
        });
      }
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
      // National body fees (e.g. SSA) — exclude registration type
      for (const nbf of nationalFees) {
        if ((nbf as any).fee_type === "registration") continue;
        if ((nbf as any).active === false) continue;
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

    // ── Duplicate validations ──
    if (memberNumber) {
      const { data: dupNum } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("club_member_number", memberNumber)
        .maybeSingle();
      if (dupNum) {
        toast.error("This membership number is already in use");
        return;
      }
    }
    if (idNumber.trim()) {
      const { data: dupId } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("id_number", idNumber.trim())
        .maybeSingle();
      if (dupId) {
        toast.error("This ID number is already registered in the club");
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Update profile
      const { error: profileErr } = await (supabase as any)
        .from("profiles")
        .update({
          name: name.trim() || "New Player",
          phone: phone.trim() || null,
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

      // 2b. Upload face photo if captured
      if (capturedPhoto && faceRequired) {
        try {
          const blob = await (await fetch(capturedPhoto)).blob();
          const filePath = `${clubId}/${user.id}.jpg`;
          const { error: uploadErr } = await supabase.storage
            .from("member-faces")
            .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
          if (uploadErr) {
            console.warn("[MemberOnboardingWizard] Face upload error:", uploadErr);
          } else {
            // Also store as avatar_url on the member record
            const { data: urlData } = supabase.storage.from("member-faces").getPublicUrl(filePath);
            if (urlData?.publicUrl) {
              await fromExt("club_members")
                .update({ avatar_url: urlData.publicUrl })
                .eq("club_id", clubId)
                .eq("user_id", user.id);
            }
          }
        } catch (faceErr) {
          console.warn("[MemberOnboardingWizard] Face photo processing error:", faceErr);
        }
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

          // 4. Create member_credit_transactions (credit = fee charged to member) so fees appear on My Statement
          const txRecords = feeBreakdown.map(fee => ({
            club_id: clubId,
            club_member_id: cmData.id,
            amount: -Math.abs(fee.amount),
            type: "credit" as const,
            description: fee.label,
            status: "confirmed",
            method: "system",
            confirmed_at: new Date().toISOString(),
          }));

          const { error: txErr } = await fromExt("member_credit_transactions")
            .insert(txRecords);
          if (txErr) {
            console.warn("[MemberOnboardingWizard] Failed to create statement entries:", txErr);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-club"] });
      queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      toast.success("Registration complete! Welcome to the club 🎉");
      onComplete();
    } catch (err: any) {
      console.error("[MemberOnboardingWizard] Save error:", err);
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
    if (currentStepId === "face") return !!capturedPhoto;
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
                    <Input id="onb-id" value={idNumber} onChange={(e) => { setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 13)); setCategoryAutoSet(false); }} placeholder="e.g. 8501015800082" maxLength={13} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Used to auto-detect age, gender & fee category</p>
                    {detectedAge !== null && idNumber.length >= 6 && (
                      <p className="text-[10px] text-primary mt-0.5">Age detected: {detectedAge} years</p>
                    )}
                  </div>
                  {/* Date of birth fallback when no valid age from ID */}
                  {(idNumber.length < 6 || getAgeFromSAId(idNumber) === null) && (
                    <div>
                      <Label htmlFor="onb-dob">Date of Birth {!idNumber ? <span className="text-destructive">*</span> : ""}</Label>
                      <Input
                        id="onb-dob"
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => { setDateOfBirth(e.target.value); setCategoryAutoSet(false); }}
                        max={new Date().toISOString().split("T")[0]}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {idNumber ? "Could not determine age from ID — please enter your date of birth" : "Enter your date of birth to determine your fee category"}
                      </p>
                      {detectedAge !== null && dateOfBirth && (
                        <p className="text-[10px] text-primary mt-0.5">Age: {detectedAge} years</p>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Gender Group</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Men">Men</SelectItem>
                          <SelectItem value="Ladies">Ladies</SelectItem>
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
                    {suggestedCategory && feeCategoryId === suggestedCategory && detectedAge !== null && (
                      <p className="text-[10px] text-primary mt-0.5">
                        ⭐ Auto-suggested based on your age ({detectedAge} years). You may change this if needed.
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

            {/* ─── FACE ENROLMENT ─── */}
            {currentStepId === "face" && (
              <motion.div key="face" {...slideVariants} className="flex-1 space-y-4 pt-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Face Enrolment</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Your club requires face recognition for court access. Please take a clear photo of your face.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center gap-3">
                  {cameraError ? (
                    <Card className="p-4 text-center space-y-2">
                      <ScanFace className="w-10 h-10 text-muted-foreground mx-auto" />
                      <p className="text-sm text-destructive">{cameraError}</p>
                      <Button size="sm" variant="outline" onClick={startCamera}>
                        <Camera className="w-4 h-4 mr-1" /> Try Again
                      </Button>
                    </Card>
                  ) : capturedPhoto ? (
                    <div className="space-y-2 text-center">
                      <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20">
                        <img src={capturedPhoto} alt="Your face" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-xs text-muted-foreground">Looking good! ✓</p>
                      <Button size="sm" variant="outline" onClick={retakePhoto}>
                        <Camera className="w-4 h-4 mr-1" /> Retake Photo
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <div className="w-48 h-48 rounded-full overflow-hidden mx-auto border-4 border-primary/20 bg-muted">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <Button size="sm" onClick={capturePhoto} disabled={!cameraStream}>
                        <Camera className="w-4 h-4 mr-1" /> Capture Photo
                      </Button>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <p className="text-[10px] text-muted-foreground text-center">
                  Your photo is stored securely and used only for court access verification.
                </p>
              </motion.div>
            )}

            {/* ─── DONE ─── */}
            {currentStepId === "done" && (
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
