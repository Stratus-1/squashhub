import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Bug, Lightbulb, LifeBuoy, Mic, MicOff, Search, Send, Sparkles, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useCapabilities } from "@/hooks/use-club-capabilities";
import { useCreateSupportThread, useSendSupportMessage } from "@/hooks/use-support";
import { useDictation } from "@/hooks/use-dictation";
import { dictationLabel } from "@/lib/help/dictation";
import { quickPrompts, searchHelp, type HelpFilter } from "@/lib/help/search";

type Mode = "issue" | "proposal";

function buildMeta(locationPath: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const lang = typeof navigator !== "undefined" ? navigator.language : "unknown";
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  return ["---", `Page: ${locationPath}`, `Online: ${online ? "yes" : "no"}`, `Language: ${lang}`, `User-Agent: ${ua}`].join("\n");
}

export function HelpAssistantPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin } = useMemberContext();
  const { enabled } = useCapabilities();
  const createThread = useCreateSupportThread();
  const send = useSendSupportMessage();

  const [tab, setTab] = useState<"ask" | "feedback">("ask");
  const [question, setQuestion] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const [mode, setMode] = useState<Mode>("issue");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  const dictation = useDictation((merge) => setQuestion((q) => merge(q)));

  const filter: HelpFilter = useMemo(() => ({ enabled, isAdmin: !!isAdmin }), [enabled, isAdmin]);
  const prompts = useMemo(() => quickPrompts(location.pathname, filter), [location.pathname, filter]);
  const matches = useMemo(
    () => (submittedQuery ? searchHelp(submittedQuery, filter) : []),
    [submittedQuery, filter]
  );

  const submitting = createThread.isPending || send.isPending;

  const go = (route: string) => {
    onClose();
    navigate(route);
  };

  const ask = (q?: string) => {
    const value = (q ?? question).trim();
    if (!value) return;
    setQuestion(value);
    setSubmittedQuery(value);
  };

  const sendFeedback = async () => {
    const cleanTitle = title.trim();
    const cleanDetails = details.trim();
    if (!cleanTitle) return toast.error("Add a short title");
    if (!cleanDetails) return toast.error("Add some details");

    const subject = `${mode === "issue" ? "Issue" : "Proposal"}: ${cleanTitle}`;
    const body = `${cleanDetails}\n\n${buildMeta(location.pathname)}`;
    try {
      const thread = await createThread.mutateAsync({ subject });
      await send.mutateAsync({ threadId: thread.id, body });
      toast.success("Sent — thank you!");
      setTitle("");
      setDetails("");
      onClose();
      navigate(`/support?threadId=${thread.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not send");
    }
  };

  const micDisabled = !dictation.supported || dictation.state === "denied";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex flex-col min-h-0">
      <TabsList className="w-full">
        <TabsTrigger value="ask" className="flex-1 text-[13px]">
          <Sparkles className="w-4 h-4 mr-1.5" />
          Ask
        </TabsTrigger>
        <TabsTrigger value="feedback" className="flex-1 text-[13px]">
          <Bug className="w-4 h-4 mr-1.5" />
          Feedback
        </TabsTrigger>
      </TabsList>

      {/* ---------------- Ask ---------------- */}
      <TabsContent value="ask" className="mt-3 space-y-3 min-h-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask a question"
              autoFocus
              className="pl-8 h-10 text-[13px]"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant={dictation.state === "listening" ? "default" : "outline"}
            className={cn("h-10 w-10 shrink-0", dictation.state === "listening" && "animate-pulse")}
            onClick={dictation.toggle}
            disabled={micDisabled}
            aria-pressed={dictation.state === "listening"}
            aria-label={dictationLabel(dictation.state)}
            title={dictationLabel(dictation.state)}
          >
            {micDisabled ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" aria-label="Search help">
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {dictation.message ||
            (dictation.state === "listening"
              ? "Listening… your words appear in the box for you to check before searching."
              : dictationLabel(dictation.state))}
        </p>

        {matches.length === 0 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {submittedQuery ? "No match — try one of these" : "Suggested for this page"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {prompts.map((p) => (
                <Button
                  key={p.query}
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px]"
                  onClick={() => ask(p.query)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {submittedQuery && (
              <p className="text-[12px] text-muted-foreground">
                Still stuck? Switch to <button className="underline" onClick={() => setTab("feedback")}>Feedback</button> to report it.
              </p>
            )}
          </div>
        )}

        {matches.length > 0 && (
          <div className="space-y-2 overflow-y-auto max-h-[45vh] pr-0.5">
            {matches.map(({ topic }) => (
              <div key={topic.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13px] font-semibold leading-snug">{topic.title}</h3>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {topic.category}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">{topic.summary}</p>
                {topic.steps && (
                  <ol className="text-[12px] text-muted-foreground list-decimal pl-4 space-y-0.5">
                    {topic.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
                {topic.route && (
                  <Button size="sm" variant="secondary" className="h-8 text-[12px]" onClick={() => go(topic.route!)}>
                    {topic.routeLabel || "Open"}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" className="h-9 justify-start text-[12px]" onClick={() => go("/help")}>
            <BookOpen className="w-4 h-4 mr-2" />
            Help & Tutorials
          </Button>
          <Button variant="outline" className="h-9 justify-start text-[12px]" onClick={() => go("/support")}>
            <LifeBuoy className="w-4 h-4 mr-2" />
            Support chat
          </Button>
        </div>
      </TabsContent>

      {/* ---------------- Feedback ---------------- */}
      <TabsContent value="feedback" className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === "issue" ? "default" : "outline"}
            className="h-9 justify-start text-[12px]"
            onClick={() => setMode("issue")}
          >
            <Bug className="w-4 h-4 mr-2" />
            Report an issue
          </Button>
          <Button
            variant={mode === "proposal" ? "default" : "outline"}
            className="h-9 justify-start text-[12px]"
            onClick={() => setMode("proposal")}
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Make a proposal
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="help-fb-title" className="text-[12px]">Title</Label>
          <Input
            id="help-fb-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 text-[13px]"
            placeholder={mode === "issue" ? "e.g. Booking not saving" : "e.g. Add a waiting list for courts"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="help-fb-details" className="text-[12px]">Details</Label>
          <Textarea
            id="help-fb-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="min-h-[120px] text-[13px]"
            placeholder={
              mode === "issue"
                ? "What happened?\n\nSteps to reproduce:\n1) …\n2) …\n\nWhat did you expect?"
                : "What should we change/add?\n\nWhy it helps:\n- …"
            }
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <Button variant="outline" className="h-9 text-[12px]" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-9 text-[12px]" onClick={sendFeedback} disabled={submitting || !user?.id}>
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Sending…" : "Send"}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
