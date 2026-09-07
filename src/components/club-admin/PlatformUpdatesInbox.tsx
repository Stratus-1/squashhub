import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";

/**
 * "Updates from SquashHub" — the durable inbox for platform announcements.
 * Read-only for club administrators: they can never edit or resend a
 * platform campaign, only read what was addressed to them.
 */
export function usePlatformUpdates(clubId?: string) {
  return useQuery({
    queryKey: ["platform-updates-inbox", clubId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let q = supabase
        .from("platform_update_recipients")
        .select("*")
        .eq("channel", "in_app")
        .order("created_at", { ascending: false })
        .limit(100);
      if (user?.id) q = q.eq("user_id", user.id);
      else if (clubId) q = q.eq("club_id", clubId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function PlatformUpdatesInbox({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: updates = [], isLoading } = usePlatformUpdates(clubId);
  const [openId, setOpenId] = useState<string | null>(null);

  const unread = useMemo(() => updates.filter((u: any) => !u.read_at).length, [updates]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platform_update_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-updates-inbox"] }),
  });

  const open = (u: any) => {
    setOpenId(openId === u.id ? null : u.id);
    if (!u.read_at) markRead.mutate(u.id);
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20 flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">
          Product releases, action-required notices and training material sent to you by SquashHub.
        </span>
        {unread > 0 && <Badge className="text-[10px]">{unread} new</Badge>}
      </Card>

      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && !updates.length && (
        <p className="text-xs text-muted-foreground py-6 text-center">No updates from SquashHub yet.</p>
      )}

      <div className="space-y-2">
        {updates.map((u: any) => (
          <Card key={u.id} className={`p-3 ${u.read_at ? "" : "border-primary/40 bg-primary/[0.03]"}`}>
            <button className="w-full text-left" onClick={() => open(u)}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold flex-1 truncate">{u.subject}</p>
                {!u.read_at && <Badge className="text-[10px]">New</Badge>}
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </div>
              {openId !== u.id && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.body}</p>
              )}
            </button>

            {openId === u.id && (
              <div className="mt-2 space-y-2">
                <p className="text-sm whitespace-pre-wrap">{u.body}</p>
                {u.action_url && (
                  <Button size="sm" asChild>
                    <a href={u.action_url} target="_blank" rel="noreferrer">{u.action_label || "Open"}</a>
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
