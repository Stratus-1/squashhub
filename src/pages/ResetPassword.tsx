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

export default function ResetPassword() {
  const navigate = useNavigate();
  const { club, subdomain } = useClubContext();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const clubName = club?.name || "SquashHub";

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else navigate("/auth");
      });
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate("/");
    }
    setLoading(false);
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <SEO
        title={`Set New Password | ${clubName}`}
        description={`Set a new password for your ${clubName} account.`}
        path="/reset-password"
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
          <h1 className="text-2xl font-bold font-heading">{clubName}</h1>
          {subdomain && (
            <p className="text-xs text-primary font-mono mt-0.5">
              {subdomain}.squashhub.co.za
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-3">
            Set a new password for your account
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
