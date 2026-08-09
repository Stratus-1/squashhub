import { useEffect, useState } from "react";
import { GoogleSignInButton, GoogleAuthDivider } from "@/components/GoogleSignInButton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub, useCreateClub } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, AlertTriangle } from "lucide-react";

interface SeededMatch {
  id: string;
  name: string;
  subdomain: string | null;
  nsa_club_id: string | null;
}

const STOP_WORDS = new Set(["squash", "club", "sports", "centre", "center", "the", "and", "of"]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export default function RegisterClub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: existing, isLoading } = useMyClub();
  const createClub = useCreateClub();

  const [form, setForm] = useState({
    name: "",
    subdomain: "",
    address: "",
    email: "",
    phone: "",
  });

  const [seededMatches, setSeededMatches] = useState<SeededMatch[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  const generateSubdomain = (name: string) => {
    const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 0);
    return words.map(w => w.slice(0, 3)).join("").slice(0, 5) || name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  };

  const normaliseSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);

  // Live availability check for the club abbreviation / subdomain.
  useEffect(() => {
    const slug = form.subdomain.trim();
    if (!slug) { setSlugStatus("idle"); return; }
    if (!/^[a-z0-9]{2,5}$/.test(slug)) { setSlugStatus("invalid"); return; }
    setSlugStatus("checking");
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id")
        .eq("subdomain", slug)
        .maybeSingle();
      if (error) { setSlugStatus("idle"); return; }
      setSlugStatus(data ? "taken" : "available");
    }, 350);
    return () => clearTimeout(handle);
  }, [form.subdomain]);


  // Debounced lookup of NSA-seeded clubs whose name overlaps the user's input.
  useEffect(() => {
    const tokens = tokenize(form.name);
    if (tokens.length === 0) {
      setSeededMatches([]);
      return;
    }
    const handle = setTimeout(async () => {
      const orFilter = tokens
        .slice(0, 4)
        .map((t) => `name.ilike.%${t}%`)
        .join(",");
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, nsa_club_id, tenant_type")
        .eq("tenant_type", "nsa_seeded")
        .or(orFilter)
        .limit(5);
      if (error) {
        console.warn("Seeded club lookup failed:", error);
        return;
      }
      setSeededMatches((data || []) as SeededMatch[]);
    }, 350);
    return () => clearTimeout(handle);
  }, [form.name]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (existing?.club) {
    navigate("/club-admin", { replace: true });
    return null;
  }

  const doCreate = async () => {
    try {
      const newClub = await createClub.mutateAsync(form);
      toast.success("Club registered! You are now the club captain.");
      if (newClub.subdomain) {
        const isLocalhost = window.location.hostname === "localhost";
        if (isLocalhost) {
          navigate(`/c/${newClub.subdomain}/club-admin`);
        } else {
          const baseHost = window.location.hostname.split(".").slice(-2).join(".");
          window.location.href = `${window.location.protocol}//${newClub.subdomain}.${baseHost}/club-admin`;
        }
      } else {
        navigate("/club-admin");
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (/duplicate key|clubs_subdomain_key|unique/i.test(msg)) {
        setSlugStatus("taken");
        toast.error(`The abbreviation "${form.subdomain}" is already taken — please choose another.`);
      } else {
        toast.error(msg || "Failed to register club");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Club name is required"); return; }
    const slug = normaliseSlug(form.subdomain);
    if (slug.length < 2) { toast.error("Abbreviation must be 2-5 letters or numbers"); return; }
    if (slug !== form.subdomain) setForm(p => ({ ...p, subdomain: slug }));

    // Final server-side availability check before creating.
    const { data: clash } = await supabase.from("clubs").select("id").eq("subdomain", slug).maybeSingle();
    if (clash) {
      setSlugStatus("taken");
      toast.error(`The abbreviation "${slug}" is already in use — please choose another.`);
      return;
    }

    if (seededMatches.length > 0) {
      setConfirmOpen(true);
      return;
    }
    doCreate();
  };


  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-heading">Register Your Club</h1>
            <p className="text-sm text-muted-foreground">Set up your squash club as a tenant. You'll become the club captain with full admin rights.</p>
            <p className="text-sm font-medium text-primary">Includes a 3-month free trial — no credit card required. Billing only starts the day after your trial ends.</p>
          </div>
        </div>

        {seededMatches.length > 0 && (
          <Card className="p-4 border-amber-500/40 bg-amber-500/5">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-semibold">A club with a similar name is already on SquashHub</p>
                <p className="text-muted-foreground text-xs">
                  These NSA-affiliated tenants were pre-provisioned. If yours is one of them, please contact support to claim it instead of creating a duplicate.
                </p>
                <ul className="space-y-1">
                  {seededMatches.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{c.name}</span>
                      {c.subdomain && (
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{c.subdomain}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6">
          <div className="space-y-4 mb-4">
            <GoogleSignInButton label="Continue with Google to register" preserveClub={false} />
            <GoogleAuthDivider />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Club Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => {
                const name = e.target.value;
                setForm(p => ({ ...p, name, subdomain: generateSubdomain(name) }));
              }} placeholder="e.g. CSIR Squash Club" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">Abbreviation <span className="text-xs text-muted-foreground">(you can edit)</span></Label>
              <div className="flex items-center gap-2">
                <Input
                  id="subdomain"
                  value={form.subdomain}
                  onChange={(e) => setForm(p => ({ ...p, subdomain: normaliseSlug(e.target.value) }))}
                  placeholder="e.g. gbsq"
                  maxLength={5}
                  className={`max-w-[120px] ${slugStatus === "taken" || slugStatus === "invalid" ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <span className="text-sm text-muted-foreground">.squashhub.app</span>
              </div>
              {slugStatus === "checking" && <p className="text-xs text-muted-foreground">Checking availability…</p>}
              {slugStatus === "available" && <p className="text-xs text-emerald-600 dark:text-emerald-400">"{form.subdomain}" is available</p>}
              {slugStatus === "taken" && <p className="text-xs text-destructive">"{form.subdomain}" is already taken — please choose another.</p>}
              {slugStatus === "invalid" && <p className="text-xs text-destructive">Use 2–5 letters or numbers, no spaces or symbols.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={set("address")} placeholder="Club address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Club Email</Label>
              <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="club@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Club Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+27..." />
            </div>
            <Button type="submit" className="w-full" disabled={createClub.isPending || slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}>
              {createClub.isPending ? "Registering..." : "Register Club"}
            </Button>
          </form>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Possible duplicate club
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  We found {seededMatches.length} existing NSA-affiliated tenant{seededMatches.length === 1 ? "" : "s"} with a similar name:
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {seededMatches.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>{c.subdomain ? ` (${c.subdomain})` : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  If your club is one of these, please cancel and contact support to claim the existing tenant. Continuing will create a new, separate tenant.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); doCreate(); }}>
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
