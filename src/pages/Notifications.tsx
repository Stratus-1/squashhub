import { Card } from "@/components/ui/card";
import { Bell, Swords, Calendar, Trophy, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getNotificationNavigation } from "@/lib/notification-navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { TournamentInviteActions, isTournamentInviteNotification } from "@/components/TournamentInviteActions";
import { EventInviteActions, isEventInviteNotification } from "@/components/EventInviteActions";

const iconMap: Record<string, typeof Bell> = {
  challenge: Swords,
  booking: Calendar,
  ladder: Trophy,
  match: CheckCircle,
  marketing: Bell,
  tournament_invite: Trophy,
  tournament_partner_invite: Trophy,
  event: Calendar,
  general: Bell,
};

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

function stripScripts(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

export default function Notifications() {
  const { user } = useAuth();
  const { activeMember, linkedMembers } = useMemberContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<any | null>(null);
  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };
  const linkedMemberIds = useMemo(
    () => Array.from(new Set(linkedMembers.map((member) => member.id).filter(Boolean))),
    [linkedMembers]
  );

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", user?.id, activeMember?.id, linkedMemberIds.join(",")],
    queryFn: async () => {
      if (!user?.id) return [];

      const [memberResult, legacyResult] = await Promise.all([
        linkedMemberIds.length > 0
          ? supabase
              .from("notifications")
              .select("*")
              .in("club_member_id", linkedMemberIds)
              .or("data->>app_silent.is.null,data->>app_silent.eq.false")
              .order("created_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .is("club_member_id", null)
          .or("data->>app_silent.is.null,data->>app_silent.eq.false")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (memberResult.error) throw memberResult.error;
      if (legacyResult.error) throw legacyResult.error;

      return [...(memberResult.data || []), ...(legacyResult.data || [])]
        .filter((notification, index, all) => all.findIndex((item) => item.id === notification.id) === index)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    },
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
    },
  });

  const removeNotification = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").delete().eq("id", id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["unread-notifications-modal"] });
    },
  });

  /** Club name + event title context so users always know which club an invite belongs to. */
  const notifList = (notifications || []) as any[];
  const contextKeys = useMemo(() => {
    const memberIds = new Set<string>();
    const eventIds = new Set<string>();
    for (const n of notifList) {
      if (n?.club_member_id) memberIds.add(String(n.club_member_id));
      const eid = n?.data?.event_id;
      if (eid) eventIds.add(String(eid));
    }
    return { memberIds: Array.from(memberIds).sort(), eventIds: Array.from(eventIds).sort() };
  }, [notifList]);

  const { data: notifContext } = useQuery({
    queryKey: ["notification-context", contextKeys.memberIds.join(","), contextKeys.eventIds.join(",")],
    queryFn: async () => {
      const clubByMember: Record<string, string> = {};
      const clubByEvent: Record<string, string> = {};
      const titleByEvent: Record<string, string> = {};
      const clubIds = new Set<string>();
      const memberClub: Record<string, string> = {};
      const eventClub: Record<string, string> = {};

      if (contextKeys.memberIds.length > 0) {
        const { data } = await supabase
          .from("club_members")
          .select("id, club_id")
          .in("id", contextKeys.memberIds);
        for (const m of data || []) {
          if (!m.club_id) continue;
          memberClub[m.id] = m.club_id;
          clubIds.add(m.club_id);
        }
      }
      if (contextKeys.eventIds.length > 0) {
        const { data } = await supabase
          .from("club_events")
          .select("id, title, club_id")
          .in("id", contextKeys.eventIds);
        for (const e of data || []) {
          titleByEvent[e.id] = e.title || "";
          if (e.club_id) {
            eventClub[e.id] = e.club_id;
            clubIds.add(e.club_id);
          }
        }
      }
      if (clubIds.size > 0) {
        const { data } = await supabase.from("clubs").select("id, name").in("id", Array.from(clubIds));
        const nameById: Record<string, string> = {};
        for (const c of data || []) nameById[c.id] = c.name || "";
        for (const [mid, cid] of Object.entries(memberClub)) clubByMember[mid] = nameById[cid] || "";
        for (const [eid, cid] of Object.entries(eventClub)) clubByEvent[eid] = nameById[cid] || "";
      }
      return { clubByMember, clubByEvent, titleByEvent };
    },
    enabled: contextKeys.memberIds.length > 0 || contextKeys.eventIds.length > 0,
  });

  /** "Club name · Event title" line for a notification (either part may be missing). */
  const contextLine = (notif: any) => {
    const eventId = notif?.data?.event_id ? String(notif.data.event_id) : "";
    const club =
      (eventId ? notifContext?.clubByEvent?.[eventId] : "") ||
      (notif?.club_member_id ? notifContext?.clubByMember?.[String(notif.club_member_id)] : "") ||
      "";
    const eventTitle = eventId ? notifContext?.titleByEvent?.[eventId] || "" : "";
    return [club, eventTitle].filter(Boolean).join(" · ");
  };

  const notificationIdToOpen = useMemo(() => (searchParams.get("notificationId") || "").trim(), [searchParams]);
  useEffect(() => {
    if (!notificationIdToOpen) return;
    if (!notifications || notifications.length === 0) return;
    const target = (notifications as any[]).find((n) => String(n.id) === notificationIdToOpen) || null;
    if (!target) return;
    setSelected(target);
    if (!target.read && !isTournamentInviteNotification(target)) markRead.mutate(String(target.id));
  }, [notificationIdToOpen, notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearNotificationIdParam = () => {
    if (!notificationIdToOpen) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("notificationId");
      return next;
    }, { replace: true });
  };

  const onBackToList = () => {
    setSelected(null);
    clearNotificationIdParam();
  };

  const selectedVars = useMemo(() => {
    if (!selected) return null;
    const merge = (selected as any)?.data?.merge && typeof (selected as any).data.merge === "object" ? (selected as any).data.merge : {};
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = String((selected as any)?.url || "/notifications");
    const toAbsolute = (pathOrUrl: string) => {
      try {
        return new URL(pathOrUrl).toString();
      } catch {
        const base = origin.replace(/\/+$/, "");
        const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
        return `${base}${path}`;
      }
    };
    return {
      ...(merge || {}),
      site_url: origin,
      url,
      link_url: toAbsolute(url),
      unsubscribe_url: toAbsolute("/"),
    } as Record<string, string>;
  }, [selected]);

  return (
    <div className="bottom-nav-safe">
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between gap-3">
            <DialogHeader>
              <DialogTitle className="font-heading">{selected ? "Notification" : "Notifications"}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              {selected ? (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onBackToList}>
                  Back
                </Button>
              ) : null}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={close}>
                Close
              </Button>
            </div>
          </div>

          <div className="p-4 pt-3 max-h-[70vh] overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : selected ? (
              (() => {
                const notif = selected as any;
                const Icon = iconMap[notif.type] || Bell;
                const navigation = getNotificationNavigation(notif);
                const isTournamentInvite = isTournamentInviteNotification(notif);
                const isEventInvite = !isTournamentInvite && isEventInviteNotification(notif);
                const email = notif?.data?.email && typeof notif.data.email === "object" ? notif.data.email : null;
                const htmlRaw = email && typeof email.html === "string" ? String(email.html) : "";
                const textRaw = email && typeof email.text === "string" ? String(email.text) : "";
                const html = selectedVars && htmlRaw ? stripScripts(renderTemplate(htmlRaw, selectedVars)) : "";
                const subject =
                  selectedVars && email && typeof email.subject === "string"
                    ? renderTemplate(String(email.subject), selectedVars)
                    : String(notif.title || "Message");
                const text = selectedVars && textRaw ? renderTemplate(textRaw, selectedVars) : String(notif.message || "");

                const srcDoc = html
                  ? `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:14px;background:#fff;">${html}</body></html>`
                  : "";

                return (
                  <div className="space-y-3">
                    <Card className="p-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                            "bg-secondary text-muted-foreground"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{subject}</p>
                          {contextLine(notif) ? (
                            <p className="text-[11px] font-medium text-primary mt-0.5 break-words">{contextLine(notif)}</p>
                          ) : null}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {isTournamentInvite ? (
                      <TournamentInviteActions notification={notif} onResolved={onBackToList} />
                    ) : (
                      <>
                        {isEventInvite ? (
                          <EventInviteActions notification={notif} onResolved={onBackToList} />
                        ) : null}
                        {srcDoc ? (
                          <Card className="overflow-hidden">
                            <iframe
                              title="Message"
                              sandbox="allow-popups allow-popups-to-escape-sandbox"
                              className="w-full h-[55vh] bg-white"
                              srcDoc={srcDoc}
                            />
                          </Card>
                        ) : (
                          <Card className="p-3">
                            <p className="text-sm whitespace-pre-wrap">{text}</p>
                          </Card>
                        )}
                      </>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      {navigation.canNavigate ? (
                        <Button
                          onClick={() => {
                            close();
                            navigate(navigation.targetUrl);
                          }}
                        >
                          Open
                        </Button>
                      ) : null}
                      <Button variant="outline" onClick={onBackToList}>
                        Back to list
                      </Button>
                    </div>
                  </div>
                );
              })()
            ) : notifications && notifications.length > 0 ? (
              notifications.map((notif, i) => {
                const Icon = iconMap[notif.type] || Bell;
                const navigation = getNotificationNavigation(notif as any);
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => {
                      if (!notif.read && !isTournamentInviteNotification(notif as any)) markRead.mutate(notif.id);
                      if (navigation.shouldOpenDetail) {
                        setSelected(notif);
                        return;
                      }
                      close();
                      navigate(navigation.targetUrl);
                    }}
                  >
                    <Card
                      className={cn(
                        "p-3 flex items-start gap-3 cursor-pointer",
                        !notif.read && "border-primary/30 bg-primary/5"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          !notif.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{notif.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-1">
                        {!notif.read && <div className="w-2 h-2 rounded-full bg-accent" />}
                        <button
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove notification"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification.mutate(notif.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            ) : (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
