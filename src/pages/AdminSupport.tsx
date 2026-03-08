import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { LifeBuoy, Mail, MessageCircle, Phone, Send, XCircle } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSupportThreads, useSupportMessages, useSendSupportMessage, useUpdateSupportThread } from "@/hooks/use-support";
import { openExternalUrl } from "@/lib/google-calendar";
import { useQuery } from "@tanstack/react-query";

const fromAny = (table: string) => (supabase as any).from(table);

function cleanPhoneToE164Digits(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return "";
  // Basic normalization:
  // - 00CC... -> CC...
  // - 0XXXXXXXXX (common ZA local format) -> 27XXXXXXXXX
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return `27${digits.slice(1)}`;
  return digits;
}

export default function AdminSupport() {
  const { user } = useAuth();
  const { data: threads, isLoading } = useAdminSupportThreads(true);
  const send = useSendSupportMessage();
  const updateThread = useUpdateSupportThread();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const selectedThread = useMemo(() => {
    const list = threads || [];
    if (selectedId) return list.find((t) => t.id === selectedId) || null;
    return list.find((t) => t.status !== "closed") || list[0] || null;
  }, [selectedId, threads]);

  const { data: messages } = useSupportMessages(selectedThread?.id || null, !!selectedThread?.id);

  const { data: profile } = useQuery({
    queryKey: ["support", "admin", "profile", selectedThread?.user_id],
    queryFn: async () => {
      if (!selectedThread?.user_id) return null;
      const { data, error } = await fromAny("profiles")
        .select("id,name,email,phone,avatar_url,rank")
        .eq("id", selectedThread.user_id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!selectedThread?.user_id,
  });

  const sendReply = async () => {
    if (!selectedThread?.id) return;
    try {
      await send.mutateAsync({ threadId: selectedThread.id, body: reply });
      setReply("");
    } catch (e: any) {
      toast.error(e?.message || "Could not send reply");
    }
  };

  const closeThread = async () => {
    if (!selectedThread?.id) return;
    try {
      await updateThread.mutateAsync({ threadId: selectedThread.id, patch: { status: "closed" } });
      toast.success("Thread closed");
    } catch (e: any) {
      toast.error(e?.message || "Could not close thread");
    }
  };

  const openWhatsApp = async () => {
    const phone = String(profile?.phone || "").trim();
    if (!phone) {
      toast.error("No phone number on this profile");
      return;
    }
    const digits = cleanPhoneToE164Digits(phone);
    if (!digits) {
      toast.error("Phone number looks invalid");
      return;
    }
    const subject = selectedThread?.subject ? `Support: ${selectedThread.subject}` : "Support";
    await openExternalUrl(`https://wa.me/${digits}?text=${encodeURIComponent(subject)}`);
  };

  const openEmail = () => {
    const email = String(profile?.email || "").trim();
    if (!email) {
      toast.error("No email address on this profile");
      return;
    }
    const subject = selectedThread?.subject ? `Support: ${selectedThread.subject}` : "Support";
    const body = `Hi ${profile?.name || ""},\n\n`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Admin Support" description="Support inbox." path="/admin/support" noIndex />

      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-heading tracking-tight truncate flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" /> Support inbox
          </h1>
          <p className="text-sm text-muted-foreground truncate">Reply in-app or jump to WhatsApp/email.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/admin">← Back</Link>
        </Button>
      </div>

      <div className="px-4 sm:px-6 lg:px-[5%] mb-24 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3">
        <Card className="border-border/60">
          <CardContent className="p-2">
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : (threads || []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No support threads yet.</p>
            ) : (
              <div className="space-y-1">
                {(threads || []).map((t) => {
                  const selected = t.id === selectedThread?.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-3 py-2 border transition-colors",
                        selected ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{t.subject || "Support"}</p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] capitalize",
                            t.status === "closed"
                              ? "bg-muted text-muted-foreground"
                              : t.status === "pending"
                              ? "bg-accent/20 text-accent-foreground"
                              : "bg-primary/15 text-primary border-0"
                          )}
                        >
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {t.last_message_preview || "No messages yet"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-3 space-y-3">
            {!selectedThread ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageCircle className="w-6 h-6 mx-auto mb-2 opacity-60" />
                <p className="text-sm">Select a thread to view messages.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{selectedThread.subject || "Support"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Thread {selectedThread.id.slice(0, 8)}… · {selectedThread.status}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeThread} disabled={updateThread.isPending || selectedThread.status === "closed"}>
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Close
                  </Button>
                </div>

                <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{profile?.name || "User"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {profile?.email || "—"}{profile?.phone ? ` · ${profile.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={openEmail} aria-label="Email user">
                      <Mail className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={openWhatsApp} aria-label="WhatsApp user">
                      <Phone className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="min-h-[280px] max-h-[55vh] overflow-auto rounded-lg border border-border p-3 bg-card/60">
                  {(messages || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(messages || []).map((m) => {
                        const mine = m.sender_id === user?.id;
                        const when = m.created_at ? format(new Date(m.created_at), "MMM d, HH:mm") : "";
                        return (
                          <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                              mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                            )}>
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              <p className={cn("text-[10px] mt-1 opacity-80", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                {when}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your reply…"
                    className="min-h-[44px] max-h-[140px]"
                  />
                  <Button onClick={sendReply} disabled={send.isPending || !reply.trim() || selectedThread.status === "closed"} className="h-11 px-4">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>

                <div className="rounded-xl border border-border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Tip: replying here always saves to the in-app chat. Use the Email/WhatsApp buttons if the user is not active in the app.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
