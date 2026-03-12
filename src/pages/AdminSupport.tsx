import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Bug, Clipboard, LifeBuoy, Lightbulb, Mail, MessageCircle, Phone, Search, Send, TriangleAlert, XCircle } from "lucide-react";

import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSupportThreads, useSupportMessages, useSendSupportMessage, useUpdateSupportThread } from "@/hooks/use-support";
import { openExternalUrl } from "@/lib/google-calendar";
import { useQuery } from "@tanstack/react-query";
import { PlayerAvatar } from "@/components/PlayerAvatar";

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

type ThreadKind = "bug" | "issue" | "problem" | "proposal" | "other";

function parseThreadKind(subject: string | null | undefined): ThreadKind {
  const s = String(subject || "").trim().toLowerCase();
  if (s.startsWith("bug:")) return "bug";
  if (s.startsWith("issue:")) return "issue";
  if (s.startsWith("problem:")) return "problem";
  if (s.startsWith("proposal:")) return "proposal";
  if (s.startsWith("feature:")) return "proposal";
  return "other";
}

function stripKindPrefix(subject: string | null | undefined) {
  const raw = String(subject || "").trim();
  return raw.replace(/^(Bug|Issue|Problem|Proposal|Feature)\s*:\s*/i, "").trim() || "Support";
}

function withKindPrefix(kind: ThreadKind, baseSubject: string) {
  const clean = baseSubject.trim() || "Support";
  if (kind === "other") return clean;
  const prefix =
    kind === "bug" ? "Bug" :
    kind === "issue" ? "Issue" :
    kind === "problem" ? "Problem" :
    kind === "proposal" ? "Proposal" :
    "Issue";
  return `${prefix}: ${clean}`;
}

function kindBadge(kind: ThreadKind) {
  if (kind === "bug") return { label: "Bug", className: "bg-destructive/12 text-destructive border border-destructive/20", Icon: Bug };
  if (kind === "issue") return { label: "Issue", className: "bg-primary/10 text-primary border border-primary/20", Icon: TriangleAlert };
  if (kind === "problem") return { label: "Problem", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25", Icon: TriangleAlert };
  if (kind === "proposal") return { label: "Proposal", className: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/20", Icon: Lightbulb };
  return { label: "General", className: "bg-muted text-muted-foreground border border-border/50", Icon: MessageCircle };
}

function statusBadge(status: string) {
  if (status === "closed") return "bg-muted text-muted-foreground border border-border/50";
  if (status === "pending") return "bg-accent/15 text-accent-foreground border border-accent/20";
  return "bg-primary/10 text-primary border border-primary/20";
}

export default function AdminSupport() {
  const { user } = useAuth();
  const { data: threads, isLoading } = useAdminSupportThreads(true);
  const send = useSendSupportMessage();
  const updateThread = useUpdateSupportThread();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [kindFilter, setKindFilter] = useState<ThreadKind | "all">("all");

  const selectedThread = useMemo(() => {
    const list = threads || [];
    if (selectedId) return list.find((t) => t.id === selectedId) || null;
    return list.find((t) => t.status !== "closed") || list[0] || null;
  }, [selectedId, threads]);

  const { data: messages } = useSupportMessages(selectedThread?.id || null, !!selectedThread?.id);

  const userIds = useMemo(() => {
    const ids = [...new Set((threads || []).map((t) => t.user_id).filter(Boolean))] as string[];
    return ids;
  }, [threads]);

  const { data: profilesById } = useQuery({
    queryKey: ["support", "admin", "profiles", userIds.join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return new Map<string, any>();
      const { data, error } = await fromAny("profiles")
        .select("id,name,email,phone,avatar_url,rank")
        .in("id", userIds);
      if (error) throw error;
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: userIds.length > 0,
  });

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

  const stats = useMemo(() => {
    const list = threads || [];
    const open = list.filter((t) => t.status === "open").length;
    const pending = list.filter((t) => t.status === "pending").length;
    const closed = list.filter((t) => t.status === "closed").length;
    const bugs = list.filter((t) => parseThreadKind(t.subject) === "bug").length;
    const issues = list.filter((t) => parseThreadKind(t.subject) === "issue").length;
    const problems = list.filter((t) => parseThreadKind(t.subject) === "problem").length;
    const proposals = list.filter((t) => parseThreadKind(t.subject) === "proposal").length;
    return { open, pending, closed, bugs, issues, problems, proposals, total: list.length };
  }, [threads]);

  const filtered = useMemo(() => {
    const list = threads || [];
    const q = query.trim().toLowerCase();
    return list.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      const k = parseThreadKind(t.subject);
      if (kindFilter !== "all" && k !== kindFilter) return false;
      if (!q) return true;
      const base = stripKindPrefix(t.subject).toLowerCase();
      const p = profilesById?.get(t.user_id);
      const name = String(p?.name || "").toLowerCase();
      const email = String(p?.email || "").toLowerCase();
      const preview = String(t.last_message_preview || "").toLowerCase();
      return base.includes(q) || name.includes(q) || email.includes(q) || preview.includes(q);
    });
  }, [kindFilter, profilesById, query, statusFilter, threads]);

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

  const setAssignedToMe = async () => {
    if (!selectedThread?.id || !user?.id) return;
    try {
      const next = selectedThread.assigned_to === user.id ? null : user.id;
      await updateThread.mutateAsync({ threadId: selectedThread.id, patch: { assigned_to: next } as any });
      toast.success(next ? "Assigned to you" : "Unassigned");
    } catch (e: any) {
      toast.error(e?.message || "Could not update assignment");
    }
  };

  const updateKind = async (nextKind: ThreadKind) => {
    if (!selectedThread?.id) return;
    try {
      const base = stripKindPrefix(selectedThread.subject);
      const nextSubject = withKindPrefix(nextKind, base);
      await updateThread.mutateAsync({ threadId: selectedThread.id, patch: { subject: nextSubject } });
      toast.success("Updated type");
    } catch (e: any) {
      toast.error(e?.message || "Could not update type");
    }
  };

  const updateStatus = async (nextStatus: "open" | "pending" | "closed") => {
    if (!selectedThread?.id) return;
    try {
      await updateThread.mutateAsync({ threadId: selectedThread.id, patch: { status: nextStatus } });
      toast.success("Updated status");
    } catch (e: any) {
      toast.error(e?.message || "Could not update status");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Admin Support" description="Support inbox." path="/admin/support" noIndex />

      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-heading tracking-tight truncate flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" /> Support inbox
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            Triage bugs, issues, proposals and problems — then reply in-app or via WhatsApp/email.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/admin">← Back</Link>
        </Button>
      </div>

      <div className="px-4 sm:px-6 lg:px-[5%] mt-1">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-[10px] tabular-nums">Open {stats.open}</Badge>
          <Badge variant="secondary" className="text-[10px] tabular-nums">Pending {stats.pending}</Badge>
          <Badge variant="secondary" className="text-[10px] tabular-nums">Closed {stats.closed}</Badge>
          <span className="w-px h-5 bg-border mx-1" />
          <Badge variant="secondary" className="text-[10px] tabular-nums">Bugs {stats.bugs}</Badge>
          <Badge variant="secondary" className="text-[10px] tabular-nums">Issues {stats.issues}</Badge>
          <Badge variant="secondary" className="text-[10px] tabular-nums">Problems {stats.problems}</Badge>
          <Badge variant="secondary" className="text-[10px] tabular-nums">Proposals {stats.proposals}</Badge>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-[5%] mb-24 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3">
        <Card className="border-border/60">
          <CardContent className="p-2">
            <div className="p-2 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search subject, user, email…"
                  className="pl-9 h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="problem">Problem</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="other">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : (threads || []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No support threads yet.</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No threads match your filters.</p>
            ) : (
              <div className="space-y-1 max-h-[70vh] overflow-auto pr-1">
                {filtered.map((t) => {
                  const selected = t.id === selectedThread?.id;
                  const kind = parseThreadKind(t.subject);
                  const kindCfg = kindBadge(kind);
                  const p = profilesById?.get(t.user_id);
                  const displayName = p?.name || "User";
                  const initials = String(displayName).split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  const when = t.last_message_at ? format(new Date(t.last_message_at), "MMM d") : format(new Date(t.created_at), "MMM d");
                  const assignedToMe = !!user?.id && t.assigned_to === user.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "w-full text-left rounded-xl px-3 py-2.5 border transition-colors",
                        selected ? "border-primary/40 bg-primary/5" : "border-border/50 hover:border-border hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2">
                          <PlayerAvatar initials={initials} rank={p?.rank ?? null} size="sm" avatarUrl={p?.avatar_url || null} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{stripKindPrefix(t.subject)}</p>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {displayName}{p?.email ? ` · ${p.email}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <Badge variant="secondary" className={cn("text-[10px] capitalize", statusBadge(String(t.status)))}>
                            {t.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{when}</span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="secondary" className={cn("text-[10px] shrink-0", kindCfg.className)}>
                            <kindCfg.Icon className="w-3.5 h-3.5 mr-1" />
                            {kindCfg.label}
                          </Badge>
                          {assignedToMe ? (
                            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                              Assigned to you
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[55%]">
                          {t.last_message_preview || "No messages yet"}
                        </p>
                      </div>
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
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{stripKindPrefix(selectedThread.subject)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {(() => {
                        const kind = parseThreadKind(selectedThread.subject);
                        const k = kindBadge(kind);
                        return (
                          <Badge variant="secondary" className={cn("text-[10px]", k.className)}>
                            <k.Icon className="w-3.5 h-3.5 mr-1" />
                            {k.label}
                          </Badge>
                        );
                      })()}
                      <Badge variant="secondary" className={cn("text-[10px] capitalize", statusBadge(String(selectedThread.status)))}>
                        {selectedThread.status}
                      </Badge>
                      {selectedThread.assigned_to ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Assigned
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                          Unassigned
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {selectedThread.id.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={parseThreadKind(selectedThread.subject)} onValueChange={(v) => updateKind(v as ThreadKind)}>
                      <SelectTrigger className="h-8 text-xs w-[130px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="issue">Issue</SelectItem>
                        <SelectItem value="problem">Problem</SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="other">General</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={String(selectedThread.status)} onValueChange={(v) => updateStatus(v as any)}>
                      <SelectTrigger className="h-8 text-xs w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant={selectedThread.assigned_to === user?.id ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={setAssignedToMe}
                      disabled={updateThread.isPending || !user?.id}
                    >
                      {selectedThread.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={closeThread}
                      disabled={updateThread.isPending || selectedThread.status === "closed"}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Close
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{profile?.name || "User"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {profile?.email || "—"}{profile?.phone ? ` · ${profile.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="h-9 text-xs">
                      <Link to={`/players/${selectedThread.user_id}`}>
                        View profile
                      </Link>
                    </Button>
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

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setReply("Thanks — can you share steps to reproduce and what device/browser you’re using?")}
                  >
                    Request details
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setReply("Thanks — we’re looking into this now. We’ll update you soon.")}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setReply("This should be fixed now. Please reload the app and try again.")}
                  >
                    Fixed template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={async () => {
                      if (!selectedThread?.id) return;
                      try {
                        await navigator.clipboard.writeText(selectedThread.id);
                        toast.success("Thread id copied");
                      } catch {
                        toast.error("Could not copy");
                      }
                    }}
                  >
                    <Clipboard className="w-4 h-4 mr-2" />
                    Copy id
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
