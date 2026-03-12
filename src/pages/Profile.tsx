import { useEffect, useRef, useState } from "react";

import { SEO } from "@/components/SEO";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, Camera, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { useMyClubMember, useMyClub, useFeeCategories, useLeagueAssociations, useMyLeagueRegistration, useLeagues, SKILL_LEVELS } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { toast } from "sonner";

function initialsFor(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "??";
}

function validatePhone(phone: string) {
  const raw = phone.trim();
  if (!raw || raw === "+27") return null;
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length < 9 || digitsOnly.length > 15) return "Please enter a valid phone number";
  return null;
}

function getAgeFromSaId(id: string): number | null {
  if (!/^\d{13}$/.test(id)) return null;
  const yy = parseInt(id.substring(0, 2), 10);
  const mm = parseInt(id.substring(2, 4), 10) - 1;
  const dd = parseInt(id.substring(4, 6), 10);
  const century = yy >= 0 && yy <= 30 ? 2000 : 1900;
  const birthDate = new Date(century + yy, mm, dd);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const mDiff = today.getMonth() - birthDate.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: clubMember, isLoading: memberLoading } = useMyClubMember();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const { data: leagueRegistration } = useMyLeagueRegistration(clubMember?.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"view" | "edit">("view");
  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  // Club member fields
  const [gender, setGender] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [playsLeague, setPlaysLeague] = useState(false);
  const [associationId, setAssociationId] = useState("");
  const [associationNumber, setAssociationNumber] = useState("");

  const [didInitFromUrl, setDidInitFromUrl] = useState(false);

  const close = () => {
    const backgroundLocation = (location.state as any)?.backgroundLocation;
    if (backgroundLocation) { navigate(-1); return; }
    navigate("/dashboard");
  };

  const resetDraft = () => {
    if (!profile) return;
    setName(String((profile as any).name || ""));
    setPhone(String((profile as any).phone || ""));
    setAvatarUrl(String((profile as any).avatar_url || ""));
    setPreviewFile(null);
    // Club member fields
    if (clubMember) {
      setGender(clubMember.gender || "");
      setIdNumber(clubMember.id_number || "");
      setAddress(clubMember.address || "");
      setSkillLevel(clubMember.skill_level || "");
      setMemberNumber(clubMember.club_member_number || "");
      setFeeCategoryId(clubMember.fee_category_id || "");
      setPlaysLeague(clubMember.plays_league || false);
    }
    // League registration fields
    if (leagueRegistration) {
      // Derive associationId from the league's association_id
      const league = leagues.find((l: any) => l.id === leagueRegistration.league_id);
      setAssociationId(league?.association_id || "");
      setAssociationNumber(leagueRegistration.league_association_number || "");
    } else {
      setAssociationId("");
      setAssociationNumber("");
    }
  };

  useEffect(() => { resetDraft(); }, [profile, clubMember, leagueRegistration, leagues]);

  useEffect(() => {
    if (didInitFromUrl) return;
    const edit = searchParams.get("edit") === "1" || searchParams.get("mode") === "edit";
    if (edit) { setMode("edit"); setDidInitFromUrl(true); }
  }, [didInitFromUrl, searchParams]);

  const age = idNumber ? getAgeFromSaId(idNumber) : null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }

    const localUrl = URL.createObjectURL(file);
    setPreviewFile(localUrl);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);
      setAvatarUrl(`${urlData.publicUrl}?t=${Date.now()}`);
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
      setPreviewFile(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = () => { setAvatarUrl(""); setPreviewFile(null); };
  const displayAvatar = previewFile || avatarUrl.trim() || null;

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Name is required");
      if (cleanName.length > 100) throw new Error("Name must be less than 100 characters");
      const phoneErr = validatePhone(phone);
      if (phoneErr) throw new Error(phoneErr);

      // Update profile
      const { error } = await supabase.from("profiles").update({
        name: cleanName,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      }).eq("id", user.id);
      if (error) throw error;

      // Update club member record if exists
      if (clubMember?.id) {
        const memberPatch: any = {
          name: cleanName,
          phone: phone.trim() || null,
          gender: gender || null,
          id_number: idNumber.trim() || null,
          address: address.trim() || null,
          skill_level: skillLevel || null,
          club_member_number: memberNumber.trim() || null,
          fee_category_id: feeCategoryId || null,
          plays_league: playsLeague,
        };
        const { error: memErr } = await fromExt("club_members")
          .update(memberPatch)
          .eq("id", clubMember.id);
        if (memErr) throw memErr;

        // Save league registration if plays league
        if (playsLeague && associationId) {
          // Find a league belonging to this association
          const targetLeague = leagues.find((l: any) => l.association_id === associationId);
          if (targetLeague) {
            if (leagueRegistration?.id) {
              // Update existing
              const { error: regErr } = await fromExt("member_league_registrations")
                .update({
                  league_id: targetLeague.id,
                  league_association_number: associationNumber.trim() || null,
                })
                .eq("id", leagueRegistration.id);
              if (regErr) throw regErr;
            } else {
              // Insert new
              const { error: regErr } = await fromExt("member_league_registrations")
                .insert({
                  club_member_id: clubMember.id,
                  league_id: targetLeague.id,
                  league_association_number: associationNumber.trim() || null,
                });
              if (regErr) throw regErr;
            }
          }
        } else if (!playsLeague && leagueRegistration?.id) {
          // Remove registration if no longer plays league
          await fromExt("member_league_registrations").delete().eq("id", leagueRegistration.id);
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-club-member"] }),
        queryClient.invalidateQueries({ queryKey: ["club-members"] }),
        queryClient.invalidateQueries({ queryKey: ["my-league-registration"] }),
      ]);
      toast.success("Profile updated");
      setMode("view");
      setPreviewFile(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update profile"),
  });

  const selectClasses = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : null)}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
        <SEO title="Profile" description="Your profile details." path="/profile" noIndex />
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit profile" : "Profile details"}</DialogTitle>
        </DialogHeader>

        {isLoading || memberLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !profile ? (
          <Card className="p-4 text-sm text-muted-foreground">Could not load your profile.</Card>
        ) : mode === "view" ? (
          <ViewMode
            profile={profile}
            clubMember={clubMember}
            feeCategories={feeCategories}
            close={close}
            setMode={setMode}
          />
        ) : (
          <div className="space-y-3">
            {/* Photo upload */}
            <div id="avatar-picker" className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold font-heading text-muted-foreground">{initialsFor(name)}</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Change profile picture"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Camera className="w-3 h-3 mr-1" />{displayAvatar ? "Change photo" : "Upload photo"}
                </Button>
                {displayAvatar && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleRemovePhoto} disabled={uploading}>
                    <Trash2 className="w-3 h-3 mr-1" />Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Personal info */}
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <select className={selectClasses} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">— Select —</option>
                <option value="Men">Men</option>
                <option value="Ladies">Ladies</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>ID Number</Label>
              <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="SA ID number (13 digits)" />
              {age !== null && <p className="text-xs text-muted-foreground">Age: {age} years old</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
              <p className="text-[10px] text-muted-foreground">International format, e.g. +27821234567</p>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
            </div>

            {/* Club-specific fields (only if member of a club) */}
            {clubMember && (
              <>
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Club Details</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Club Member Number</Label>
                  <Input value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Skill Level</Label>
                  <select className={selectClasses} value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                    <option value="">— Select —</option>
                    {SKILL_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {feeCategories.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Fee Category</Label>
                    <select className={selectClasses} value={feeCategoryId} onChange={(e) => setFeeCategoryId(e.target.value)}>
                      <option value="">— Select category —</option>
                      {feeCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name} (R{cat.annual_fee}/yr)</option>
                      ))}
                    </select>
                    {age !== null && !feeCategoryId && (
                      <p className="text-xs text-amber-600">
                        💡 Suggestion: {age < 25 ? "Student" : age >= 60 ? "Pensioner" : "Normal member"} based on age
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="plays-league" checked={playsLeague} onChange={(e) => setPlaysLeague(e.target.checked)} />
                  <Label htmlFor="plays-league">Plays League</Label>
                </div>
                {playsLeague && associations.length > 0 && (
                  <>
                    <div className="space-y-1.5">
                      <Label>League Association</Label>
                      <select className={selectClasses} value={associationId} onChange={(e) => setAssociationId(e.target.value)}>
                        <option value="">— Select Association —</option>
                        {associations.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}{a.abbreviation ? ` (${a.abbreviation})` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Association Number</Label>
                      <Input value={associationNumber} onChange={(e) => setAssociationNumber(e.target.value)} placeholder="e.g. NSF12345" />
                    </div>
                  </>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { resetDraft(); setMode("view"); }} disabled={save.isPending}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- View mode extracted for readability ---------- */
function ViewMode({
  profile,
  clubMember,
  feeCategories,
  close,
  setMode,
}: {
  profile: any;
  clubMember: any;
  feeCategories: any[];
  close: () => void;
  setMode: (m: "edit") => void;
}) {
  const email = profile.email as string | null;
  const rank = typeof profile.rank === "number" ? profile.rank : null;
  const skillLabel = clubMember?.skill_level
    ? SKILL_LEVELS.find((s) => s.value === clubMember.skill_level)?.label || clubMember.skill_level
    : null;
  const feeCategory = feeCategories.find((c: any) => c.id === clubMember?.fee_category_id);

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardContent className="p-4 flex items-start gap-4">
          <div className="shrink-0">
            <PlayerAvatar initials={initialsFor(profile.name)} rank={rank} avatarUrl={profile.avatar_url || null} size="lg" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-base font-semibold font-heading truncate">{profile.name || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
            {profile.phone && <p className="text-xs text-muted-foreground truncate">📱 {profile.phone}</p>}
            {clubMember?.gender && <p className="text-xs text-muted-foreground">{clubMember.gender}</p>}
          </div>
        </CardContent>
      </Card>

      {clubMember && (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Club Details</p>
            {clubMember.club_member_number && (
              <p className="text-xs text-muted-foreground">Member #: {clubMember.club_member_number}</p>
            )}
            {skillLabel && <p className="text-xs text-muted-foreground">Skill: {skillLabel}</p>}
            {feeCategory && <p className="text-xs text-muted-foreground">Fee: {feeCategory.name} (R{feeCategory.annual_fee}/yr)</p>}
            {clubMember.address && <p className="text-xs text-muted-foreground">Address: {clubMember.address}</p>}
            {clubMember.id_number && <p className="text-xs text-muted-foreground">ID: •••••{clubMember.id_number.slice(-4)}</p>}
            <p className="text-xs text-muted-foreground">Plays league: {clubMember.plays_league ? "Yes" : "No"}</p>
          </CardContent>
        </Card>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={close}>Done</Button>
        <Button className="gap-1.5" onClick={() => setMode("edit")}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
      </DialogFooter>
    </div>
  );
}
