import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageCircle, Plus, Send, Paperclip, X, Image as ImageIcon, FileText } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateSupportThread, useMySupportThreads, useSendSupportMessage, useSupportMessages, getSupportAttachmentUrl, type SupportAttachment } from "@/hooks/use-support";

export default function Support() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: threads, isLoading: threadsLoading } = useMySupportThreads();
  const createThread = useCreateSupportThread();
  const send = useSendSupportMessage();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);

  const addFiles = (files: FileList | File[] | null, target: "new" | "existing") => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 10).filter(f => f.size <= 20 * 1024 * 1024);
    if (arr.length === 0) return;
    if (target === "new") setNewFiles(p => [...p, ...arr].slice(0, 10));
    else setPendingFiles(p => [...p, ...arr].slice(0, 10));
  };

  const handlePaste = (e: React.ClipboardEvent, target: "new" | "existing") => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files, target);
    }
  };

  const effectiveThreadId = useMemo(() => {
    if (selectedThreadId) return selectedThreadId;
    return threads && threads.length > 0 ? threads[0].id : null;
  }, [selectedThreadId, threads]);

  const threadIdParam = (searchParams.get("threadId") || "").trim();
  useEffect(() => {
    if (!threadIdParam) return;
    setSelectedThreadId(threadIdParam);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("threadId");
      return next;
    }, { replace: true });
  }, [setSearchParams, threadIdParam]);

  const selectedThread = useMemo(() => {
    if (!effectiveThreadId) return null;
    return (threads || []).find((t) => t.id === effectiveThreadId) || null;
  }, [effectiveThreadId, threads]);

  const { data: messages, isLoading: messagesLoading } = useSupportMessages(effectiveThreadId, !!effectiveThreadId);

  const startChat = async () => {
    try {
      const thread = await createThread.mutateAsync({ subject: newSubject });
      setSelectedThreadId(thread.id);
      setNewSubject("");
      if (newFirstMessage.trim() || newFiles.length > 0) {
        await send.mutateAsync({ threadId: thread.id, body: newFirstMessage, files: newFiles });
        setNewFirstMessage("");
        setNewFiles([]);
      }
      toast.success("Support chat started");
    } catch (e: any) {
      toast.error(e?.message || "Could not start support chat");
    }
  };

  const sendMessage = async () => {
    if (!effectiveThreadId) return;
    try {
      await send.mutateAsync({ threadId: effectiveThreadId, body: messageBody, files: pendingFiles });
      setMessageBody("");
      setPendingFiles([]);
    } catch (e: any) {
      toast.error(e?.message || "Could not send message");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Support" description="Chat to support." path="/support" noIndex />

      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-heading tracking-tight truncate">Support</h1>
          <p className="text-sm text-muted-foreground truncate">We’ll get back to you as soon as we can.</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-[5%] space-y-3 mb-24">
        {threadsLoading ? (
          <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
        ) : (threads || []).length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold font-heading">Start a support chat</p>
                  <p className="text-xs text-muted-foreground">Describe your issue and we’ll reply in-app.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Booking issue / Ladder question" />
              </div>
              <div
                className={cn(
                  "space-y-1.5 rounded-md transition-colors",
                  dropping && "ring-2 ring-primary/40 bg-primary/5"
                )}
                onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => { e.preventDefault(); setDropping(false); addFiles(e.dataTransfer.files, "new"); }}
              >
                <p className="text-xs font-medium text-muted-foreground">Message</p>
                <Textarea
                  value={newFirstMessage}
                  onChange={(e) => setNewFirstMessage(e.target.value)}
                  onPaste={(e) => handlePaste(e, "new")}
                  className="min-h-[120px]"
                  placeholder="Tell us what happened… (paste or drop screenshots here)"
                />
              </div>

              <FilePreviewList files={newFiles} onRemove={(i) => setNewFiles(p => p.filter((_, idx) => idx !== i))} />

              <input ref={newFileInputRef} type="file" className="hidden" multiple accept="image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { addFiles(e.target.files, "new"); e.target.value = ""; }} />

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => newFileInputRef.current?.click()}>
                  <Paperclip className="w-4 h-4 mr-1" /> Attach files
                </Button>
                <Button className="flex-1" onClick={startChat} disabled={createThread.isPending || !user?.id}>
                  <Plus className="w-4 h-4 mr-2" />
                  {createThread.isPending ? "Starting…" : "Start chat"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border/60">
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your chats</p>
                  <p className="text-sm font-semibold truncate">{selectedThread?.subject || (threads || [])[0]?.subject || "Support"}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={async () => {
                    const t = await createThread.mutateAsync({ subject: "Support" });
                    setSelectedThreadId(t.id);
                  }}
                  disabled={createThread.isPending}
                >
                  New
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
              <Card className="border-border/60">
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {(threads || []).map((t) => {
                      const selected = t.id === effectiveThreadId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedThreadId(t.id)}
                          className={cn(
                            "w-full text-left rounded-lg px-3 py-2 border transition-colors",
                            selected ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{t.subject || "Support"}</p>
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full capitalize",
                              t.status === "closed" ? "bg-muted text-muted-foreground" : t.status === "pending" ? "bg-accent/20 text-accent-foreground" : "bg-primary/15 text-primary"
                            )}>
                              {t.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {t.last_message_preview || "No messages yet"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-3 flex flex-col gap-3">
                  <div className="flex-1 min-h-[280px] max-h-[55vh] overflow-auto rounded-lg border border-border p-3 bg-card/60">
                    {messagesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading messages…</p>
                    ) : (messages || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Send a message to get started.</p>
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
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Type your message…"
                      className="min-h-[44px] max-h-[120px]"
                    />
                    <Button onClick={sendMessage} disabled={send.isPending || !messageBody.trim() || !effectiveThreadId} className="h-11 px-4">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
