import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Send, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  finaliseMessage, loadDeliveries, recipientStatus, sendInform,
  type BetaLifecycle, type DeliveryRow, type Handover, type InformChannel,
} from "@/lib/smart-builder/step-handover";

const CH_LABEL: Record<InformChannel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
const ALL: InformChannel[] = ["in_app", "email", "whatsapp", "sms"];

/**
 * "Inform selected players" — sends each entered player their personal message through the
 * Communications engine (comms_campaigns → send-comms-campaign → notifications / email / WhatsApp,
 * logged per recipient in comms_deliveries). Progression only after delivery, or an explicit manual mark.
 */
export function StepInformPanel({ h, lifecycle, onLifecycle }: {
  h: Handover; lifecycle: BetaLifecycle; onLifecycle: (l: BetaLifecycle) => Promise<void>;
}) {
  const saved = (h.channels.filter((c) => (ALL as string[]).includes(c)) as InformChannel[]);
  const [channels, setChannels] = useState<InformChannel[]>(saved.length ? saved : ["in_app"]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const campaignId = lifecycle.inform?.method === "sent" ? lifecycle.inform.campaign_id ?? null : null;
  useEffect(() => { if (campaignId) loadDeliveries(campaignId).then(setRows); }, [campaignId]);

  const ids = h.entrantMessages.map((m) => m.memberId);
  const status = recipientStatus(ids, rows);
  const reached = status.filter((s) => s.state === "sent").length;
  const notReached = status.filter((s) => s.state !== "sent");
  const first = h.entrantMessages[0];

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const { campaignId: cid } = await sendInform({
        clubId: h.clubId, tournamentId: h.tournamentId, name: h.name, channels, feeDue: h.feeDue,
        messages: h.entrantMessages, existingCampaignId: campaignId,
      });
      await onLifecycle({ ...lifecycle, inform: { method: "sent", campaign_id: cid, at: new Date().toISOString() } });
      setRows(await loadDeliveries(cid));
    } catch (e: any) {
      setErr(e?.message || "Sending failed — nobody was marked informed.");
      // A campaign row may exist with failures; reload if we have one.
    } finally { setBusy(false); }
  };
  const proceed = (manual: boolean) => onLifecycle({
    ...lifecycle, stage: "registrations", completed: [...new Set([...lifecycle.completed, "invite" as const])],
    inform: manual
      ? { ...(lifecycle.inform ?? {}), method: lifecycle.inform?.method ?? "manual", at: lifecycle.inform?.at ?? new Date().toISOString(), note: notReached.length && lifecycle.inform?.method === "sent" ? `${notReached.length} informed outside SquashHub` : "Informed outside SquashHub" }
      : lifecycle.inform!,
  });

  const sentAlready = !!campaignId;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-border p-2 text-xs"><div className="font-semibold">{ids.length} entered player{ids.length === 1 ? "" : "s"}</div><div className="text-muted-foreground">Each gets their own message{h.feeDue ? " with their amount due" : ""}.</div></div>
        <div className="rounded border border-border p-2 text-xs">
          <div className="mb-1 font-semibold">Send by</div>
          <div className="flex flex-wrap gap-1">{ALL.map((c) => (
            <button key={c} type="button" disabled={sentAlready} aria-pressed={channels.includes(c)}
              onClick={() => setChannels((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])}
              className={cn("rounded-full border px-2.5 py-0.5", channels.includes(c) ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground")}>{CH_LABEL[c]}</button>
          ))}</div>
          {channels.includes("email") && !sentAlready && <div className="mt-1 text-muted-foreground">Email needs the club's email settings to be set up.</div>}
        </div>
      </div>

      {first && <div>
        <div className="mb-1 text-xs text-muted-foreground">Example — {first.name}'s message</div>
        <pre className="whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-sans text-xs">{finaliseMessage(first.text)}</pre>
        <div className="mt-1 text-[11px] text-muted-foreground">Includes a "{h.feeDue ? "View my entry & pay" : "View my tournament entry"}" link to the player's tournament page{h.feeDue ? ", where the existing Pay buttons for your accepted methods are" : ""}.</div>
      </div>}

      <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
        {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}View recipients & individual messages
      </button>
      {showAll && <ul className="space-y-2">{h.entrantMessages.map((m) => {
        const st = status.find((s) => s.memberId === m.memberId)!;
        return <li key={m.memberId} className="rounded border border-border p-2 text-xs">
          <div className="mb-1 flex justify-between font-semibold"><span>{m.name}</span>
            <span className={st.state === "sent" ? "text-primary" : st.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
              {st.state === "sent" ? `Sent · ${st.reached.map((c) => CH_LABEL[c as InformChannel] ?? c).join(", ")}` : st.state === "failed" ? "Not reached" : sentAlready ? "Not reached" : "Not sent yet"}
            </span></div>
          {st.problems.length > 0 && <div className="mb-1 text-destructive">{st.problems.join(" · ")}</div>}
          <pre className="whitespace-pre-wrap font-sans">{finaliseMessage(m.text)}</pre>
        </li>;
      })}</ul>}

      {err && <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{err}</div>}

      {sentAlready && <div className={cn("rounded border p-2 text-xs", notReached.length ? "border-destructive/50 bg-destructive/10" : "border-primary/50 bg-primary/10")}>
        {reached} of {ids.length} reached.{notReached.length ? ` Not reached: ${notReached.map((s) => h.entrantMessages.find((m) => m.memberId === s.memberId)?.name).join(", ")} — open "View recipients" for the reason.` : " Everyone has been informed."}
      </div>}

      <div className="flex flex-wrap gap-2">
        {!sentAlready && <Button disabled={busy || !channels.length || !ids.length} onClick={send}><Send className="mr-1 h-4 w-4" />{busy ? "Sending…" : `Send to ${ids.length} player${ids.length === 1 ? "" : "s"}`}</Button>}
        {sentAlready && notReached.length > 0 && <Button variant="outline" disabled={busy} onClick={send}><RotateCcw className="mr-1 h-4 w-4" />{busy ? "Retrying…" : "Retry not reached"}</Button>}
        {sentAlready && notReached.length === 0 && <Button onClick={() => proceed(false)}>Continue to Registrations & payments<ChevronRight className="ml-1 h-4 w-4" /></Button>}
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(sentAlready && notReached.length ? "Confirm you informed the remaining players yourself (outside SquashHub)?" : "Confirm you informed the players yourself, outside SquashHub? Nothing will be sent.")) proceed(true); }}>
          {sentAlready && notReached.length ? "I informed the rest myself — continue" : "Mark as informed manually"}
        </Button>
      </div>
    </div>
  );
}
