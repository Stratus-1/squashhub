import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { listPublicClubs, type PublicClub } from "@/lib/public-clubs";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FindClub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["public-clubs-find"],
    queryFn: listPublicClubs,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (clubs as PublicClub[]).filter((c) => c.tenant_type !== "association");
    if (!q) return list.slice(0, 40);
    const words = q.split(/\s+/);
    return list.filter((c) => {
      const v = `${c.name || ""} ${c.subdomain || ""} ${c.address || ""}`.toLowerCase();
      return words.every((w) => v.includes(w));
    });
  }, [clubs, search]);

  const join = async (club: PublicClub) => {
    setBusyId(club.id);
    try {
      const { data, error } = await (supabase.rpc as any)("join_club_request", { p_club_id: club.id });
      if (error) throw error;
      if (data === "linked_admin" || data === "joined_admin") {
        toast.success(`Welcome to ${club.name} — you're the first one in, so you have full club admin rights.`);
      } else if (data === "linked" || data === "already_member") {
        toast.success(`You're in — welcome to ${club.name}`);
      } else {
        toast.success(`Request sent to ${club.name}. An admin will confirm you shortly.`);
      }
      setTimeout(() => window.location.assign("/"), 800);
    } catch (e: any) {
      toast.error(e?.message || "Could not send your request");
    } finally {
      setBusyId(null);
    }
  };

  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Find your club</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't linked to a club yet. Search for the club you play at and we'll connect you.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search club name or town..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              {isLoading ? "Loading clubs..." : `${filtered.length} club${filtered.length === 1 ? "" : "s"}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto overscroll-contain">
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No club matches that search. Try part of the name.
              </p>
            )}
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-border p-2.5"
              >
                {c.logo_url ? (
                  <img src={c.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.address && (
                    <p className="text-xs text-muted-foreground truncate">{c.address}</p>
                  )}
                </div>
                <Button size="sm" disabled={busyId === c.id} onClick={() => join(c)}>
                  {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "This is my club"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Can't see your club? Email support@squashhub.co.za and we'll add it.
        </p>
      </div>
    </div>
  );
}
