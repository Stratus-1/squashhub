import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // PKCE flow (some auth links redirect with ?code=...)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Implicit flow (hash tokens) is handled by the client automatically; read session.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/auth", { replace: true });
        }
      } catch (e: any) {
        toast.error(e.message || "Auth callback failed");
        navigate("/auth", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [navigate]);

  if (!loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

