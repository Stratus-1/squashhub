import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Mic,
  MicOff,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDictation } from "@/hooks/use-dictation";
import { dictationLabel } from "@/lib/help/dictation";
import { useAiAssistant, useAskAssistant, useAiFeedback } from "@/hooks/use-ai-assistant";
import { actionCatalogue, resolveAiAction } from "@/lib/ai/registry";
import { availableWorkflows, WORKFLOW_MAP, matchWorkflow, type WorkflowDef } from "@/lib/ai/workflows";
import { speak, stopSpeaking } from "@/lib/ai/voice";
import { AiVoiceSettings } from "@/components/ai/AiVoiceSettings";

type Turn = {
  role: "user" | "assistant";
  content: string;
  action?: { key: string; params?: Record<string, string | undefined> } | null;
  workflowKey?: string | null;
};

/**
 * Platform-wide AI assistant: voice in, voice out, text chat, guided
 * workflows and confirmed deep-link actions. Every destination comes from the
 * shared action registry — no hard-coded URLs live here.
 */
export function AiAssistantPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ai = useAiAssistant();
  const ask = useAskAssistant();
  const feedback = useAiFeedback();

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<{ def: WorkflowDef; step: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [muted, setMuted] = useState(!ai.speakReplies);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation((merge) => setInput((v) => merge(v)));
  const listening = dictation.state === "listening";

  const roleCtx = useMemo(
    () => ({ isAdmin: ai.isAdmin, isCaptain: ai.isAdmin, capabilities: ai.capabilities }),
    [ai.isAdmin, ai.capabilities],
  );
  const actionCtx = useMemo(
    () => ({ isAdmin: ai.isAdmin, capabilities: ai.capabilities, clubSubdomain: ai.clubSubdomain }),
    [ai.isAdmin, ai.capabilities, ai.clubSubdomain],
  );
  const workflows = useMemo(() => availableWorkflows(roleCtx), [roleCtx]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, workflow]);
  useEffect(() => () => stopSpeaking(), []);

  const say = (text: string) => {
    if (muted || !ai.settings?.voice_output_enabled) return;
    speak(text, { voice: ai.voice, rate: ai.rate });
  };

  const go = (path: string) => {
    stopSpeaking();
    onClose();
    navigate(path);
  };

  const startWorkflow = (def: WorkflowDef) => {
    setWorkflow({ def, step: 0 });
    setTurns((t) => [...t, { role: "assistant", content: `Let's do it — ${def.title.toLowerCase()}.` }]);
    say(`${def.title}. ${def.steps[0].title}. ${def.steps[0].detail}`);
  };

  const submit = async (raw?: string) => {
    const question = (raw ?? input).trim();
    if (!question || ask.isPending) return;
    if (listening) dictation.stop();
    stopSpeaking();
    setInput("");
    setTurns((t) => [...t, { role: "user", content: question }]);

    // A clear workflow request is handled locally — instant, no model round trip.
    const local = matchWorkflow(question, roleCtx);
    if (local) {
      startWorkflow(local);
      return;
    }

    try {
      const res = await ask.mutateAsync({
        question,
        conversationId,
        history: turns.slice(-8).map((t) => ({ role: t.role, content: t.content })),
        context: {
          clubId: ai.clubId,
          clubName: ai.clubName,
          role: ai.isAdmin ? "admin" : "member",
          route: location.pathname,
          style: ai.style,
          capabilities: Array.from(ai.capabilities),
          actions: ai.settings?.actions_enabled === false ? [] : actionCatalogue(actionCtx),
          workflows: workflows.map((w) => ({ key: w.key, title: w.title, summary: w.summary })),
        },
      });
      setConversationId(res.conversationId ?? conversationId);
      setTurns((t) => [
        ...t,
        { role: "assistant", content: res.answer, action: res.action, workflowKey: res.workflow_key },
      ]);
      if (res.workflow_key && WORKFLOW_MAP[res.workflow_key]) {
        const def = WORKFLOW_MAP[res.workflow_key];
        if (workflows.some((w) => w.key === def.key)) setWorkflow({ def, step: 0 });
      }
      say(res.answer);
    } catch (e: any) {
      const message = e?.message || "The assistant could not answer just now.";
      setTurns((t) => [...t, { role: "assistant", content: message }]);
      toast.error(message);
    }
  };

  const rate = (turn: Turn, rating: "up" | "down") => {
    const question = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
    feedback.mutate(
      { question, answer: turn.content, rating, conversationId, route: location.pathname },
      {
        onSuccess: () =>
          toast.success(rating === "up" ? "Thanks — glad that helped." : "Thanks — we'll improve this answer."),
        onError: () => toast.error("Could not send that feedback."),
      },
    );
  };

  if (!ai.allowed) {
    return (
      <div className="py-6 text-center text-[13px] text-muted-foreground">
        The AI assistant isn't switched on for this club yet.
      </div>
    );
  }

  const current = workflow ? workflow.def.steps[workflow.step] : null;
  const stepAction = current?.action ? resolveAiAction(current.action, actionCtx) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Conversation */}
      <div ref={scrollRef} className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
        {turns.length === 0 && !workflow && (
          <div className="rounded-lg border bg-muted/40 p-3 text-[13px]">
            <p className="font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Ask me anything, or say what you want to do.
            </p>
            <p className="text-muted-foreground mt-1">
              Try “Help me set up tonight's team” or “How do I book a court?”
            </p>
          </div>
        )}

        {turns.map((turn, i) => {
          const action = turn.action ? resolveAiAction(turn.action, actionCtx) : null;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                turn.role === "user" ? "bg-primary/10 ml-6" : "bg-muted/60 mr-6",
              )}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {action?.hasAction && (
                <Button size="sm" variant="secondary" className="mt-2 h-7 text-[12px]" onClick={() => go(action.appPath)}>
                  {action.label} <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
              {turn.role === "assistant" && (
                <div className="mt-1.5 flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Helpful" onClick={() => rate(turn, "up")}>
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Not helpful" onClick={() => rate(turn, "down")}>
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {ask.isPending && <p className="text-[12px] text-muted-foreground px-1">Thinking…</p>}

        {/* Guided workflow */}
        {workflow && current && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold">{workflow.def.title}</p>
              <Badge variant="outline" className="text-[10px]">
                Step {workflow.step + 1} of {workflow.def.steps.length}
              </Badge>
            </div>
            <p className="mt-1.5 text-[13px] font-medium">{current.title}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{current.detail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {stepAction?.hasAction && (
                <Button size="sm" className="h-7 text-[12px]" onClick={() => go(stepAction.appPath)}>
                  {stepAction.label} <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
              {workflow.step + 1 < workflow.def.steps.length ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[12px]"
                  onClick={() => {
                    const next = workflow.step + 1;
                    setWorkflow({ ...workflow, step: next });
                    const s = workflow.def.steps[next];
                    say(`${s.title}. ${s.detail}`);
                  }}
                >
                  Next step <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="h-7 text-[12px]" onClick={() => setWorkflow(null)}>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Done
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setWorkflow(null)}>
                Stop
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Workflow suggestions */}
      {!workflow && (
        <div className="flex flex-wrap gap-1.5">
          {workflows.slice(0, 4).map((w) => (
            <Button
              key={w.key}
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => startWorkflow(w)}
            >
              <Wand2 className="mr-1 h-3 w-3" /> {w.title}
            </Button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="space-y-2">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask a question or say what you'd like to do…"
          className="min-h-[64px] text-[13px]"
        />
        <div className="flex items-center gap-2">
          {ai.voiceInput && dictation.supported && (
            <Button
              type="button"
              size="sm"
              variant={listening ? "destructive" : "outline"}
              className="h-8 text-[12px]"
              onClick={() => (listening ? dictation.stop() : dictation.start())}
            >
              {listening ? <MicOff className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
              {dictationLabel(listening)}
            </Button>
          )}
          {ai.settings?.voice_output_enabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={muted ? "Turn voice replies on" : "Turn voice replies off"}
              onClick={() => {
                stopSpeaking();
                setMuted((m) => !m);
              }}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-[12px]"
            onClick={() => setShowSettings((s) => !s)}
          >
            Voice settings
          </Button>
          <Button
            size="sm"
            className="h-8 ml-auto text-[12px]"
            disabled={!input.trim() || ask.isPending}
            onClick={() => void submit()}
          >
            <Send className="mr-1 h-3.5 w-3.5" /> Send
          </Button>
        </div>
        {showSettings && <AiVoiceSettings />}
      </div>
    </div>
  );
}
