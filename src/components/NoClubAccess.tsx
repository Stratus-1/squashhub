import { useEffect, useState } from "react";
import { useDuplicateGuard } from "@/components/auth/DuplicateAccountGuard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Loader2, UserPlus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Shown when a signed-in user lands on a club subdomain where they have no
 * `club_members` row. They keep their existing session (Google or otherwise)
 * and can register as a visitor at this club in one step — we pre-fill name /
 * phone from their profile or any other club_members row they already have.
 */
export function NoClubAccess() {
  const { user, signOut } = useAuth();
  const { club } = useClubContext();
  const queryClient = useQueryClient();
  const clubName = club?.name || "this club";

  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeClub, setHomeClub] = useState("");
  const [category, setCategory] = useState<"Men" | "Ladies">("Men");
  const [existingElsewhere, setExistingElsewhere] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);

  // Existing SquashHub member at another club → genuine NEW application here.
  // Nothing is created until they confirm the warning dialog.
  const handleApply = async () => {
    if (!club?.id) { toast.error("Club not found"); return; }
    setApplying(true);
    const { error } = await (supabase.rpc as any)("apply_to_club_as_existing_person", { p_club_id: club.id });
    if (error) {
      toast.error(String(error.message || "Could not start your application").replace(/^[A-Z_]+:\s*/, ""));
      setApplying(false);
      return;
    }
    toast.success(`Application to ${clubName} started — complete the steps to finish.`);
    await queryClient.invalidateQueries({ queryKey: ["my-club"] });
    await queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
    window.location.reload();
  };

  // Pre-fill from profile + any existing club_members row (user at another club).
  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      if (!user?.id) { setPrefillLoading(false); return; }
      try {
        const [profileRes, memberRes] = await Promise.all([
          supabase.from("profiles").select("name, phone").eq("id", user.id).maybeSingle(),
          supabase
            .from("club_members")
            .select("name, phone, gender, home_club_name, club:club_id(name)")
            .eq("user_id", user.id)
            .order("joined_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        const m: any = memberRes.data;
        const p: any = profileRes.data;
        const fullName = (m?.name || p?.name || user.user_metadata?.name || "").trim();
        const [fn, ...rest] = fullName.split(/\s+/);
        setFirstName(fn || "");
        setLastName(rest.join(" ") || "");
        setPhone((m?.phone || p?.phone || "").trim());
        const g = (m?.gender || "").toString().toLowerCase();
        if (g === "ladies" || g === "female") setCategory("Ladies");
        setHomeClub((m?.club?.name || m?.home_club_name || "").trim());
        setExistingElsewhere(!!m);
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }
    prefill();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Same platform-wide duplicate safeguard as every other registration path.
  const dup = useDuplicateGuard({ onUseEmail: () => supabase.auth.signOut() });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club?.id) { toast.error("Club not found"); return; }
    if (firstName.trim().length < 2) { toast.error("Please enter your first name"); return; }
    if (lastName.trim().length < 2) { toast.error("Please enter your last name"); return; }
    if (homeClub.trim().length < 2) { toast.error("Please enter your home club"); return; }

    if (!(await dup.guard({ name: `${firstName.trim()} ${lastName.trim()}`, phone, claimedOnly: true }))) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-visitor-user", {
        body: {
          club_id: club.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: user?.email || "",
          password: "", // googleMode — edge fn uses the bearer token
          phone: phone.trim() || null,
          home_club_name: homeClub.trim(),
          category,
        },
      });
      if (error || (data as any)?.error) {
        let body: any = data;
        if (!body?.error && (error as any)?.context?.json) {
          try { body = await (error as any).context.json(); } catch { /* ignore */ }
        }
        toast.error(body?.error || error?.message || "Failed to register as visitor");
        // Existing member registering as a visitor by accident: send them home.
        if (body?.code === "already_member_elsewhere" && body?.home_club && /^[a-z0-9-]+$/i.test(body.home_club)) {
          setTimeout(() => { window.location.href = `https://${body.home_club}.squashhub.co.za/`; }, 1500);
        }
        setLoading(false);
        return;
      }
      toast.success(`Welcome to ${clubName}! You're registered as a visitor.`);
      await queryClient.invalidateQueries({ queryKey: ["my-club"] });
      await queryClient.invalidateQueries({ queryKey: ["my-club-member"] });
      // Fall through — the gate will re-render Dashboard once the query refreshes.
    } catch (err: any) {
      toast.error(err.message || "Failed to register as visitor");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {dup.dialog}
      <Card className="max-w-md w-full p-6 space-y-4">
        {existingElsewhere && !prefillLoading && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Apply for membership at {clubName}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Join {clubName} as a full member. You keep your {homeClub || "current club"} membership.
            </p>
            <Button className="w-full" onClick={() => setConfirmApply(true)} disabled={applying || loading}>
              Apply for membership
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2 text-amber-600">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">{existingElsewhere ? "Or r" : "R"}egister as a visitor at {clubName}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          You're signed in as <span className="font-medium">{user?.email}</span>, but you're not
          yet a member or visitor at <span className="font-medium">{clubName}</span>.
          {existingElsewhere
            ? " We've pre-filled your details from your existing account — just confirm and continue."
            : " Fill in a few details to visit this club."}
        </p>

        {prefillLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="fn">First name *</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ln">Last name *</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat">Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as "Men" | "Ladies")}>
                <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Men">Men</SelectItem>
                  <SelectItem value="Ladies">Ladies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ph">Phone number</Label>
              <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hc">Home club *</Label>
              <Input id="hc" value={homeClub} onChange={(e) => setHomeClub(e.target.value)} required />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registering…</> : `Register as visitor`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={async () => {
                  await signOut();
                  window.location.assign("/");
                }}
              >
                Sign out
              </Button>
            </div>
          </form>
        )}
      </Card>
      <AlertDialog open={confirmApply} onOpenChange={(o) => !applying && setConfirmApply(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to {clubName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You're already a member of {homeClub || "another club"}. Applying to {clubName} creates a separate{" "}
              {clubName} membership. {clubName}'s joining fee and membership fee will be added to your {clubName}{" "}
              account, and the club must approve you. Your {homeClub || "existing"} membership, fees and history stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={applying} onClick={(e) => { e.preventDefault(); handleApply(); }}>
              {applying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</> : `Yes, apply to ${clubName}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
