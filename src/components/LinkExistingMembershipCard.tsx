import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Suggestion {
  member_id: string;
  club_id: string;
  club_name: string | null;
  club_slug: string | null;
  member_name: string | null;
  club_member_number: string | null;
  league_numbers: string | null;
  match_reason: string | null;
}

const DISMISS_KEY = "sh.dismissed_membership_links";

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function LinkExistingMembershipCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await (supabase.rpc as any)("find_unclaimed_memberships");
    if (error) {
      console.warn("[LinkExistingMembership] failed", error);
      return;
    }
    const dismissed = getDismissed();
    setItems(((data || []) as Suggestion[]).filter((s) => !dismissed.includes(s.member_id)));
  };

  useEffect(() => {
    if (!user?.id) {
      setItems([]);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const dismiss = (id: string) => {
    const next = Array.from(new Set([...getDismissed(), id]));
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    setItems((prev) => prev.filter((s) => s.member_id !== id));
  };

  const claim = async (s: Suggestion) => {
    setBusy(s.member_id);
    try {
      const { error } = await (supabase.rpc as any)("claim_unclaimed_membership", {
        _member_id: s.member_id,
      });
      if (error) throw error;
      toast.success(`Linked to ${s.club_name || "your club"}`);
      setItems((prev) => prev.filter((x) => x.member_id !== s.member_id));
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error(e?.message || "Could not link this membership");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <Card className="p-3 border-primary/40 bg-primary/5">
      <div className="flex items-start gap-2">
        <Link2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight">Is this you?</p>
          <p className="text-[12px] text-muted-foreground leading-snug">
            We found existing club records that match your details. Link them so you keep your
            league number, history and ladder position instead of starting a new profile.
          </p>
          <div className="mt-2 space-y-2">
            {items.map((s) => (
              <div
                key={s.member_id}
                className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">
                    {s.member_name || "Member"} · {s.club_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {s.league_numbers && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s.league_numbers}
                      </Badge>
                    )}
                    {s.club_member_number && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {s.club_member_number}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      matched on {s.match_reason === "id_number" ? "ID number" : s.match_reason}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-[12px]"
                  disabled={busy === s.member_id}
                  onClick={() => claim(s)}
                >
                  {busy === s.member_id ? "Linking…" : "That's me"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => dismiss(s.member_id)}
                  aria-label="Not me"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default LinkExistingMembershipCard;
