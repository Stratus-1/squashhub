import { useEffect, useMemo, useRef, useState } from "react";
import { toTitleCase, formatPhoneNumber, validatePhoneNumber } from "@/lib/input-formatting";

import { SEO } from "@/components/SEO";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, Camera, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useProfile } from "@/hooks/use-data";
import { useMyClubMember, useMyClub, useFeeCategories, SKILL_LEVELS } from "@/hooks/use-club";
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
  const { activeMember } = useMemberContext();
  const { data: profile, isLoading } = useProfile();
  const { data: defaultClubMember, isLoading: memberLoading } = useMyClubMember();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;

  // If a different member is active (family account switching), fetch their club_member record
  const activeMemberId = activeMember?.id;
  const { data: switchedClubMember } = useQuery({
    queryKey: ["club-member-by-id", activeMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("*, fee_category:fee_category_id(id, name, annual_fee)")
        .eq("id", activeMemberId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeMemberId && activeMemberId !== defaultClubMember?.id,
  });

  // Use switched member's record if active, otherwise default
  const clubMember = (activeMemberId && activeMemberId !== defaultClubMember?.id && switchedClubMember)
    ? switchedClubMember
    : defaultClubMember;

  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // League associations available at this member's home club, with the
  // member's current registration status + assigned number per association.
  const homeClubId = clubMember?.club_id as string | undefined;
  const homeClubMemberId = clubMember?.id as string | undefined;
  const homeClubEnabledAssocId = (clubMember as any)?.enable_league_association_id as string | null | undefined;

  const { data: leagueAssocs = [] } = useQuery({
    queryKey: ["profile-league-associations", homeClubId, homeClubMemberId],
    enabled: !!homeClubId && !!homeClubMemberId,
    queryFn: async () => {
      const [assocRes, regsRes] = await Promise.all([
        fromExt("league_associations")
          .select("id, name, abbreviation")
          .eq("club_id", homeClubId!)
          .eq("active", true)
          .order("name", { ascending: true }),
        fromExt("member_league_registrations")
          .select("id, league_association_number, league:leagues(id, association_id)")
          .eq("club_member_id", homeClubMemberId!),
      ]);
      if (assocRes.error) throw assocRes.error;
      const regs = (regsRes.data || []) as any[];

      // Group regs by association_id, prefer rows with a number set.
      const numberByAssoc: Record<string, string> = {};
      const regIdsByAssoc: Record<string, string[]> = {};
      for (const r of regs) {
        const aid = r.league?.association_id as string | undefined;
        if (!aid) continue;
        regIdsByAssoc[aid] ||= [];
        regIdsByAssoc[aid].push(r.id);
        const num = (r.league_association_number || "").trim();
        if (num && !numberByAssoc[aid]) numberByAssoc[aid] = num;
      }

      return ((assocRes.data || []) as any[]).map((a) => ({
        associationId: a.id as string,
        associationName: a.name as string,
        abbreviation: (a.abbreviation || null) as string | null,
        number: numberByAssoc[a.id] || "",
        registrationIds: regIdsByAssoc[a.id] || [],
        // "Registered" means: this assoc is the member's enable_league_association_id,
        // OR they have at least one league-team registration tied to it.
        isRegistered:
          homeClubEnabledAssocId === a.id || (regIdsByAssoc[a.id]?.length || 0) > 0,
      }));
    },
  });

  const [mode, setMode] = useState<"view" | "edit">("view");
  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const phoneError = useMemo(() => validatePhoneNumber(phone), [phone]);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  // Club member fields
  const [gender, setGender] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [tickedAssociations, setTickedAssociations] = useState<Record<string, boolean>>({});
  const [leagueNumberDrafts, setLeagueNumberDrafts] = useState<Record<string, string>>({});

  const [didInitFromUrl, setDidInitFromUrl] = useState(false);
  const nextAfterSave = searchParams.get("next"); // "account" → go to /my-account on save

  const close = () => {
    const backgroundLocation = (location.state as any)?.backgroundLocation;
    if (backgroundLocation) { navigate(-1); return; }
    navigate("/dashboard");
  };

  const isViewingSwitchedMember = !!activeMemberId && activeMemberId !== defaultClubMember?.id;

  const resetDraft = () => {
    if (!profile && !clubMember) return;

    const sourceName = clubMember?.name || String((profile as any)?.name || "");
    const sourcePhone = clubMember?.phone || String((profile as any)?.phone || "");
    const sourceAvatar = clubMember ? (clubMember.avatar_url || "") : String((profile as any)?.avatar_url || "");

    setName(sourceName);
    setPhone(sourcePhone);
    setAvatarUrl(sourceAvatar);
    setPreviewFile(null);

    if (clubMember) {
      setGender(clubMember.gender || "");
      setIdNumber(clubMember.id_number || "");
      setAddress(clubMember.address || "");
      setSkillLevel(clubMember.skill_level || "");
      setMemberNumber(clubMember.club_member_number || "");
      setFeeCategoryId(clubMember.fee_category_id || "");
      // plays_league + per-association ticks are seeded from the leagueAssocs query.
    }

  };

  useEffect(() => { resetDraft(); }, [profile, clubMember]);

  // Seed league number drafts + ticked state whenever the associations load.
  useEffect(() => {
    if (!leagueAssocs.length) return;
    setLeagueNumberDrafts((prev) => {
      const next = { ...prev };
      for (const a of leagueAssocs) {
        if (next[a.associationId] === undefined) next[a.associationId] = a.number || "";
      }
      return next;
    });
    setTickedAssociations((prev) => {
      const next = { ...prev };
      for (const a of leagueAssocs) {
        if (next[a.associationId] === undefined) next[a.associationId] = a.isRegistered;
      }
      return next;
    });
  }, [leagueAssocs]);

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
      const filePath = clubMember?.id ? `${user.id}/${clubMember.id}/profile.${ext}` : `${user.id}/profile.${ext}`;
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

      // Derive plays_league + enable_league_association_id from the ticked associations.
      const tickedIds = leagueAssocs
        .map((a) => a.associationId)
        .filter((id) => tickedAssociations[id]);
      const derivedPlaysLeague = tickedIds.length > 0;
      // If exactly one association is ticked, set it as the home-club enable flag.
      // If multiple, keep the existing one if it's still ticked, else pick the first ticked.
      let derivedEnableAssocId: string | null = null;
      if (tickedIds.length === 1) {
        derivedEnableAssocId = tickedIds[0];
      } else if (tickedIds.length > 1) {
        derivedEnableAssocId =
          (homeClubEnabledAssocId && tickedIds.includes(homeClubEnabledAssocId)
            ? homeClubEnabledAssocId
            : tickedIds[0]) || null;
      }

      if (clubMember?.id) {
        const memberPatch: any = {
          name: cleanName,
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          gender: gender || null,
          id_number: idNumber.trim() || null,
          address: address.trim() || null,
          skill_level: skillLevel || null,
          club_member_number: memberNumber.trim() || null,
          fee_category_id: feeCategoryId || null,
          plays_league: derivedPlaysLeague,
          enable_league_association_id: derivedEnableAssocId,
        };

        const { error: memErr } = await fromExt("club_members")
          .update(memberPatch)
          .eq("id", clubMember.id);
        if (memErr) throw memErr;

      } else {
        const { error } = await supabase.from("profiles").update({
          name: cleanName,
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }).eq("id", user.id);
        if (error) throw error;
      }

      // Persist editable league association numbers — only fill rows where the
      // current number is blank (locked once saved). Applies to ticked associations
      // that already have member_league_registrations rows.
      for (const a of leagueAssocs) {
        if (!tickedAssociations[a.associationId]) continue;
        if (a.number) continue; // already locked
        const draft = (leagueNumberDrafts[a.associationId] ?? "").trim();
        if (!draft) continue;
        if (a.registrationIds.length === 0) continue; // nothing to attach the number to yet
        const { error: regErr } = await fromExt("member_league_registrations")
          .update({ league_association_number: draft })
          .in("id", a.registrationIds);
        if (regErr) throw regErr;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-club-member"] }),
        queryClient.invalidateQueries({ queryKey: ["club-members"] }),
        queryClient.invalidateQueries({ queryKey: ["my-league-registration"] }),
        queryClient.invalidateQueries({ queryKey: ["my-league-registrations-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["club-member-by-id", activeMemberId] }),
      ]);
      toast.success("Profile updated");
      setPreviewFile(null);
      if (nextAfterSave === "account") {
        navigate("/my-account");
      } else {
        setMode("view");
      }
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update profile"),
  });

  const selectClasses = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const profileViewData = clubMember ? {
    name: clubMember.name || String((profile as any)?.name || ""),
    email: clubMember.email || String((profile as any)?.email || ""),
    phone: clubMember.phone || String((profile as any)?.phone || ""),
    avatar_url: clubMember.avatar_url || (!isViewingSwitchedMember ? (profile as any)?.avatar_url || null : null),
  } : profile;

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : null)}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
        <SEO title="Profile" description="Your profile details." path="/profile" noIndex />
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? `Edit profile${isViewingSwitchedMember ? ` — ${activeMember?.name || ""}` : ""}` : `Profile details${isViewingSwitchedMember ? ` — ${activeMember?.name || ""}` : ""}`}</DialogTitle>
        </DialogHeader>

        {isLoading || memberLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !profile && !clubMember ? (
          <Card className="p-4 text-sm text-muted-foreground">Could not load your profile.</Card>
        ) : mode === "view" ? (
          <ViewMode
            profile={profileViewData}
            clubMember={clubMember}
            feeCategories={feeCategories}
            close={close}
            setMode={setMode}
          />
        ) : (
          <div className="space-y-3">
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

            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={name} onChange={(e) => setName(toTitleCase(e.target.value))} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender Group</Label>
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
              <Input value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} placeholder="+27 82 123 4567" />
              {phoneError && <p className="text-[10px] text-destructive">{phoneError}</p>}
              <p className="text-[10px] text-muted-foreground">International format, e.g. +27821234567</p>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(toTitleCase(e.target.value))} placeholder="Optional" />
            </div>

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
                {leagueAssocs.length > 0 && (
                  <div className="border-t border-border pt-3 mt-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">League Participation</p>
                    <p className="text-[10px] text-muted-foreground -mt-2">Tick the leagues you play. Enter your league number once — it locks after saving.</p>
                    {leagueAssocs.map((a) => {
                      const ticked = !!tickedAssociations[a.associationId];
                      const locked = !!a.number;
                      const draft = leagueNumberDrafts[a.associationId] ?? "";
                      const cannotUntick = ticked && a.registrationIds.length > 0;
                      return (
                        <div key={a.associationId} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`assoc-${a.associationId}`}
                              checked={ticked}
                              disabled={cannotUntick && ticked}
                              onChange={(e) =>
                                setTickedAssociations((prev) => ({
                                  ...prev,
                                  [a.associationId]: e.target.checked,
                                }))
                              }
                            />
                            <Label htmlFor={`assoc-${a.associationId}`} className="text-sm font-medium">
                              {a.associationName}
                              {a.abbreviation ? ` (${a.abbreviation})` : ""}
                            </Label>
                          </div>
                          {ticked && (
                            <div className="pl-6 space-y-1">
                              <Input
                                value={draft}
                                disabled={locked}
                                onChange={(e) =>
                                  setLeagueNumberDrafts((prev) => ({
                                    ...prev,
                                    [a.associationId]: e.target.value,
                                  }))
                                }
                                placeholder={`${a.abbreviation || a.associationName} number (e.g. NSF7570)`}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                {locked
                                  ? "Number on file — contact a club admin to change."
                                  : a.registrationIds.length === 0
                                    ? "Number will be saved once an admin assigns you to a league team."
                                    : "You can enter your number once. After saving it's locked."}
                              </p>
                            </div>
                          )}
                          {cannotUntick && (
                            <p className="pl-6 text-[10px] text-muted-foreground">
                              You're in a league team — ask a club admin to remove you to untick this.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
  const rank = typeof clubMember?.ladder_position === "number" ? clubMember.ladder_position : null;
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
