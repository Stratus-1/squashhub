import { useEffect, useState } from "react";
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
import { ShieldAlert, Loader2 } from "lucide-react";

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club?.id) { toast.error("Club not found"); return; }
    if (firstName.trim().length < 2) { toast.error("Please enter your first name"); return; }
    if (lastName.trim().length < 2) { toast.error("Please enter your last name"); return; }
    if (homeClub.trim().length < 2) { toast.error("Please enter your home club"); return; }

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
        toast.error((data as any)?.error || error?.message || "Failed to register as visitor");
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
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-600">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Register as a visitor at {clubName}</h1>
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
    </div>
  );
}
