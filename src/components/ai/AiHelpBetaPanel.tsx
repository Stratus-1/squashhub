import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ImagePlus, Loader2, LifeBuoy, Send, X, CheckCircle2, ShieldAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { VoiceInputButton } from "@/components/smart-builder/VoiceInputButton";
import { buildAskPayload, callAiHelp, pageIds, uploadAiScreenshot, type AiHelpPreview } from "@/hooks/use-ai-help";

type Att = { path: string; name: string; mime: string; size: number; preview: string };
type Turn = {
  role: "user" | "assistant";
  content: string;
  attachments?: Att[];
  preview?: AiHelpPreview;
  interactionId?: string;
  state?: "pending" | "done" | "cancelled" | "busy";
  ticketId?: string;
  error?: boolean;
  /** Failed send that can be retried with the same request id. */
  retry?: { question: string; atts: Att[]; voice: boolean; requestId: string; history: { role: "user" | "assistant"; content: string }[] };
};

/**
 * AI Help Assistant (beta). Type, speak (reviewed transcript) or attach a
 * screenshot. Data changes only happen after the user confirms a preview the
 * server generated and stored — the button sends only the preview's id.
 */
export function AiHelpBetaPanel({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const voiceBase = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const context = { clubId, route: location.pathname, ids: pageIds(location.pathname, location.search), today: new Date().toISOString().slice(0, 10) };
  const lastUserText = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";

  const push = (t: Turn) => setTurns((v) => [...v, t]);
  const patch = (i: number, p: Partial<Turn>) => setTurns((v) => v.map((t, j) => (j === i ? { ...t, ...p } : t)));

  const onFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 3 - atts.length)) {
        if (!f.type.startsWith("image/")) continue;
        if (f.size > 8 * 1024 * 1024) { setVoiceMsg("Screenshots must be under 8 MB."); continue; }
        const up = await uploadAiScreenshot(user.id, f);
        setAtts((a) => [...a, { ...up, preview: URL.createObjectURL(f) }]);
      }
    } catch (e) {
      setVoiceMsg(`Couldn't attach the screenshot: ${(e as Error).message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runAsk = async (retry: NonNullable<Turn["retry"]>) => {
    setBusy(true);
    const r = await callAiHelp(buildAskPayload({ ...retry, context }));
    setBusy(false);
    if (r.error) return push({ role: "assistant", content: r.error, error: true, retry: r.retryable ? retry : undefined });
    push({ role: "assistant", content: r.answer ?? "", preview: r.preview, interactionId: r.interactionId, state: r.preview ? "pending" : undefined, ticketId: r.ticketId });
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    const sentAtts = atts;
    push({ role: "user", content: q, attachments: sentAtts });
    setInput(""); setAtts([]); setVoiceMsg(null);
    const history = turns.filter((t) => !t.error).slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }));
    const voice = usedVoice;
    setUsedVoice(false);
    await runAsk({ question: q, atts: sentAtts, voice, requestId: crypto.randomUUID(), history });
  };

  const retryTurn = async (i: number, t: Turn) => {
    if (!t.retry || busy) return;
    setTurns((v) => v.filter((_, j) => j !== i));
    await runAsk(t.retry);
  };

  const decide = async (i: number, t: Turn, confirm: boolean) => {
    patch(i, { state: "busy" });
    const r = await callAiHelp({ mode: confirm ? "confirm" : "cancel", interactionId: t.interactionId, context });
    patch(i, { state: confirm && !r.error ? "done" : confirm ? "pending" : "cancelled" });
    push({ role: "assistant", content: r.error ?? r.answer ?? "", error: !!r.error || r.failed, ticketId: r.ticketId });
  };

  const escalate = async () => {
    setBusy(true);
    const r = await callAiHelp({ mode: "escalate", question: lastUserText || input, reason: "User asked for a person", context });
    setBusy(false);
    push({ role: "assistant", content: r.error ?? r.answer ?? "", ticketId: r.ticketId, error: !!r.error });
  };

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">Beta</Badge>
        I only change things you're already allowed to change, and always ask you to confirm first.
      </div>

      <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto pr-1">
        {turns.length === 0 && (
          <p className="text-muted-foreground">Ask a question, describe a problem (add a screenshot), or ask me to do something like "cancel my booking on Friday at 18:00".</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "self-end max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3 py-2" : "max-w-full"}>
            <p className={t.error ? "text-destructive" : "whitespace-pre-wrap"}>{t.content}</p>
            {t.retry && (
              <Button size="sm" variant="outline" className="mt-1" disabled={busy} onClick={() => retryTurn(i, t)}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
              </Button>
            )}
            {t.attachments?.length ? (
              <div className="flex gap-1 mt-1">{t.attachments.map((a) => <img key={a.path} src={a.preview} alt={a.name} className="h-12 w-12 rounded object-cover" />)}</div>
            ) : null}
            {t.preview && (
              <div className="mt-2 rounded-lg border bg-card p-3 space-y-2">
                <div className="font-semibold flex items-center gap-1"><ShieldAlert className="w-4 h-4 text-primary" /> Please check before I change anything</div>
                <Section title="What you asked" items={[t.preview.request]} />
                <Section title="What I'm going to change" items={t.preview.changes} />
                <Section title="Records affected" items={t.preview.affected} />
                {t.preview.consequences.length > 0 && <Section title="Important" items={t.preview.consequences} />}
                <Section title="What will NOT change" items={t.preview.unchanged} />
                {t.state === "pending" || t.state === "busy" ? (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" disabled={t.state === "busy"} onClick={() => decide(i, t, true)}>
                      {t.state === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={t.state === "busy"} onClick={() => decide(i, t, false)}>Cancel</Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {t.state === "done" ? <><CheckCircle2 className="w-3 h-3" /> Confirmed</> : "Cancelled — nothing changed"}
                  </p>
                )}
              </div>
            )}
            {t.ticketId && (
              <Link to="/support" className="mt-1 inline-flex items-center gap-1 text-[12px] text-primary underline"><LifeBuoy className="w-3 h-3" /> View your support ticket</Link>
            )}
          </div>
        ))}
        {busy && <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</p>}
      </div>

      {atts.length > 0 && (
        <div className="flex gap-2">
          {atts.map((a) => (
            <div key={a.path} className="relative">
              <img src={a.preview} alt={a.name} className="h-14 w-14 rounded object-cover border" />
              <button aria-label="Remove screenshot" className="absolute -top-1 -right-1 rounded-full bg-background border p-0.5" onClick={() => setAtts((v) => v.filter((x) => x.path !== a.path))}><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        placeholder="Type, or tap the mic and speak…"
        rows={3}
        className="text-[13px]"
      />
      {voiceMsg && <p className="text-[12px] text-muted-foreground">{voiceMsg}</p>}
      <div className="flex items-center gap-2">
        <VoiceInputButton
          clubId={clubId}
          purpose="ai_help"
          className="bg-background"
          disabled={busy}
          onError={(m) => setVoiceMsg(m)}
          onTranscript={(text, final) => {
            if (voiceBase.current === null) voiceBase.current = input.trim();
            const base = voiceBase.current;
            setInput(base ? `${base} ${text}` : text);
            if (final) { voiceBase.current = null; setUsedVoice(true); setVoiceMsg("Check the transcript, fix anything, then press Send."); }
          }}
        />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Attach screenshot" disabled={uploading || atts.length >= 3} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-[12px]" disabled={busy || (!lastUserText && !input.trim())} onClick={escalate}>
          <LifeBuoy className="w-4 h-4 mr-1" /> Ask a person
        </Button>
        <Button type="button" size="icon" className="ml-auto h-9 w-9" aria-label="Send" disabled={busy || !input.trim()} onClick={send}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="list-disc pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
