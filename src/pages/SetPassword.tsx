import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import { useClubContext } from "@/contexts/ClubContext";

/**
 * Mandatory first-time password setup for users who entered via a magic link
 * (e.g. tournament visitors bulk-registered by an admin). They cannot proceed
 * to the app until a password is set — this gives them a way back in later.
 */
export default function SetPassword() {
  const navigate = useNavigate();
  const { club, subdomain } = useClubContext();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const clubName = club?.name || "SquashHub";

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      setEmail(session.user.email ?? null);
      setReady(true);
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { needs_password_setup: false },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    toast.success("Password set — welcome!");
    // Send them to the club landing page so the install prompt can appear.
    const target = subdomain ? `/?club=${encodeURIComponent(subdomain)}` : "/";
    navigate(target, { replace: true });
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <SEO
        title={`Set Your Password | ${clubName}`}
        description={`Set a password for your ${clubName} account.`}
        path="/set-password"
        noIndex
      />
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-center mb-6">
          {club?.logo_url ? (
            <img
              src={club.logo_url}
              alt={`${clubName} logo`}
              className="w-16 h-16 object-contain mx-auto rounded-md mb-3"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-7 h-7 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-2xl font-bold font-heading">Welcome to {clubName}</h1>
          {subdomain && (
            <p className="text-xs text-primary font-mono mt-0.5">
              {subdomain}.squashhub.co.za
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-3">
            Set a password so you can sign back in any time
            {email ? ` as ${email}` : ""}.
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Set password & continue"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Required — you'll use this next time you sign in.
            </p>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
