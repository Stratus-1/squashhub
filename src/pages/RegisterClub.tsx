import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Search } from "lucide-react";

interface ClubSearchResult {
  id: string;
  name: string;
  subdomain: string | null;
  tenant_type: string;
  region: string | null;
  parent_association: string | null;
  is_claimable: boolean;
  claim_pending: boolean;
}

export default function RegisterClub() {
  useAuth();
  const navigate = useNavigate();
  const { data: existing, isLoading } = useMyClub();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("search_registerable_clubs", { _q: q });
        if (error) throw error;
        setResults((data || []) as ClubSearchResult[]);
      } catch (err) {
        console.warn("Club search failed:", err);
        setResults([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Members who already belong to a club go straight to their dashboard.
  useEffect(() => {
    if (existing?.club) navigate("/dashboard", { replace: true });
  }, [existing?.club, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (existing?.club) return null;

  const goToClub = (club: ClubSearchResult) => {
    if (!club.subdomain) {
      toast.error("This club isn't set up on SquashHub yet — please contact your club.");
      return;
    }
    if (window.location.hostname === "localhost") {
      navigate(`/c/${club.subdomain}/auth`);
      return;
    }
    const parts = window.location.hostname.split(".");
    const baseHost = parts.slice(-3).join(".") === "squashhub.co.za" ? "squashhub.co.za" : parts.slice(-2).join(".");
    window.location.href = `${window.location.protocol}//${club.subdomain}.${baseHost}/auth`;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-heading">Join Your Club</h1>
            <p className="text-sm text-muted-foreground">
              Search for your club below, then sign up as a member on your club's page.
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="club-search">Find your club</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="club-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Club name or town, e.g. Alberton"
                className="pl-9"
                autoFocus
              />
            </div>
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-[13px]">{c.name}</span>
                    {(c.parent_association || c.region) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.parent_association, c.region].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => goToClub(c)}>Register here</Button>
                </div>
              ))}
            </div>
          )}

          {searched && !searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No clubs matched “{query}”. Please check the spelling or ask your club for their SquashHub link.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
