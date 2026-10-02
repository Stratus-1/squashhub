import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Send, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
export function StepInformPanel({ h, lifecycle, onLifecycle, onAddGroup }: {
  h: Handover; lifecycle: BetaLifecycle; onLifecycle: (l: BetaLifecycle) => Promise<void>; onAddGroup?: () => void;
}) {
  const saved = (h.channels.filter((c) => (ALL as string[]).includes(c)) as InformChannel[]);
  const [picked, setChannels] = useState<InformChannel[]>(saved.length ? saved : ["in_app"]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [group, setGroup] = useState<string | null | undefined>(undefined);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // What each channel can actually reach (club setup + recipients' contact details).
  const [avail, setAvail] = useState<{ club: Record<InformChannel, boolean>; reach: Record<InformChannel, number> } | null>(null);
  useEffect(() => {
    const channels = picked.filter((c) => usable(c));
  const ids = h.entrantMessages.map((m) => m.memberId);
    Promise.all([
      supabase.from("clubs").select("whatsapp_enabled, sms_enabled").eq("id", h.clubId).maybeSingle(),
      supabase.from("club_secrets").select("smtp_host, sender_email").eq("club_id", h.clubId).maybeSingle(),
      supabase.from("club_members").select("id, user_id, email, phone").in("id", ids),
      (supabase as any).from("tournament_whatsapp_groups").select("invite_url, status").eq("champ_id", h.tournamentId).maybeSingle(),
    ]).then(([c, sec, mem, wg]: any[]) => {
      const g = wg?.data; setGroup(g?.status === "active" && g?.invite_url ? g.invite_url : null);
      const ms = (mem.data ?? []) as any[];
      setAvail({
        club: { in_app: true, email: !!((sec.data as any)?.smtp_host && (sec.data as any)?.sender_email), whatsapp: !!(c.data as any)?.whatsapp_enabled, sms: !!(c.data as any)?.sms_enabled },
        reach: { in_app: ms.filter((m) => m.user_id).length, email: ms.filter((m) => String(m.email ?? "").includes("@")).length, whatsapp: ms.filter((m) => m.phone).length, sms: ms.filter((m) => m.phone).length },
      });
    });
  }, [h.clubId, h.entrantMessages]);
  const usable = (c: InformChannel) => !avail || avail.club[c];
  const campaignId = lifecycle.inform?.method === "sent" ? lifecycle.inform.campaign_id ?? null : null;
  useEffect(() => { if (campaignId) loadDeliveries(campaignId).then(setRows); }, [campaignId]);

  const channels = picked.filter((c) => usable(c));
  const ids = h.entrantMessages.map((m) => m.memberId);
  const status = recipientStatus(ids, rows);
  const reached = status.filter((s) => s.state === "sent").length;
  const notReached = status.filter((s) => s.state !== "sent");
  const first = h.entrantMessages.find((m) => m.memberId === previewId) ?? h.entrantMessages[0];

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
        <div className="rounded border border-border p-2 text-xs"><div className="font-semibold">{ids.length} selected player{ids.length === 1 ? "" : "s"} {sentAlready ? "" : "ready to be informed"}</div><div className="text-muted-foreground">Each gets their own message{h.feeDue ? ". Entry fee is due: each message shows the amount and a link to pay" : ""}.</div></div>
        <div className="rounded border border-border p-2 text-xs">
          <div className="mb-1 font-semibold">Send by</div>
          <div className="flex flex-wrap gap-1">{ALL.map((c) => {
            const ok = usable(c); const on = ok && picked.includes(c);
            return <button key={c} type="button" disabled={sentAlready || !ok} aria-pressed={on}
              onClick={() => setChannels((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])}
              className={cn("rounded-full border px-2.5 py-0.5", on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground", !ok && "line-through opacity-60")}>{CH_LABEL[c]}</button>;
          })}</div>
          {avail && <ul className="mt-1 space-y-0.5 text-muted-foreground">{ALL.map((c) => <li key={c}>{CH_LABEL[c]}: {avail.club[c] ? `reaches ${avail.reach[c]} of ${ids.length}${c === "in_app" ? " (players with a SquashHub app account)" : c === "email" ? " (with an email address)" : " (with a mobile number)"}` : c === "email" ? "not connected — club email settings not set up" : "not connected — not switched on for this club"}</li>)}</ul>}
        </div>
      </div>

      {first && <div>
        <div className="mb-1 text-xs text-muted-foreground">Preview — exactly what {first.name} will receive{h.entrantMessages.length > 1 ? " (pick another name under View recipients)" : ""}</div>
        <pre className="whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-sans text-xs">{finaliseMessage(first.text)}</pre>
        <div className="mt-1 text-[11px] text-muted-foreground">{group ? (lifecycle?.wa_include ?? h.waGroup?.include ? "Includes \"Join the tournament WhatsApp group\". " : "WhatsApp group set up, but its link isn't included in messages. ") : group === null ? <>No WhatsApp group configured · {onAddGroup ? <button type="button" className="text-primary underline" onClick={onAddGroup}>Add one</button> : null}. </> : null}Includes a "{h.feeDue ? "View my entry & pay" : "View my tournament entry"}" link to the player's tournament page{h.feeDue ? ", where the existing Pay buttons for your accepted methods are" : ""}.</div>
      </div>}

      <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
        {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}View recipients
      </button>
      {showAll && <ul className="divide-y divide-border rounded border border-border text-xs">{h.entrantMessages.map((m) => {
        const st = status.find((x) => x.memberId === m.memberId)!;
        return <li key={m.memberId} className={cn("flex flex-wrap items-center justify-between gap-2 px-2 py-1.5", first?.memberId === m.memberId && "bg-muted/40")}>
          <span className="font-medium">{m.name}{h.feeDue ? <span className="ml-1 font-normal text-muted-foreground">· {m.status}</span> : null}</span>
          <span className="flex items-center gap-2">
            <span className={st.state === "sent" ? "text-primary" : st.state === "failed" || sentAlready ? "text-destructive" : "text-muted-foreground"} title={st.problems.join(" · ")}>
              {st.state === "sent" ? `Sent · ${st.reached.map((c) => CH_LABEL[c as InformChannel] ?? c).join(", ")}` : sentAlready ? `Not reached${st.problems[0] ? ` — ${st.problems[0]}` : ""}` : "Not sent yet"}
            </span>
            <button type="button" className="text-primary underline" onClick={() => setPreviewId(m.memberId)}>Preview</button>
          </span>
        </li>;
      })}</ul>}

      {err && <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{err}</div>}

      {sentAlready && <div className={cn("rounded border p-2 text-xs", notReached.length ? "border-destructive/50 bg-destructive/10" : "border-primary/50 bg-primary/10")}>
        {reached} of {ids.length} reached.{notReached.length ? ` Not reached: ${notReached.map((s) => h.entrantMessages.find((m) => m.memberId === s.memberId)?.name).join(", ")} — open "View recipients" for the reason.` : " Everyone has been informed."}
      </div>}

      <div className="flex flex-wrap gap-2">
        {!sentAlready && <Button disabled={busy || !channels.length || !ids.length} onClick={() => setConfirmOpen(true)}><Send className="mr-1 h-4 w-4" />{busy ? "Sending…" : "Inform selected players"}</Button>}
        {sentAlready && notReached.length > 0 && <Button variant="outline" disabled={busy} onClick={send}><RotateCcw className="mr-1 h-4 w-4" />{busy ? "Retrying…" : "Retry not reached"}</Button>}
        {sentAlready && notReached.length === 0 && <Button onClick={() => proceed(false)}>Continue to Registrations & payments<ChevronRight className="ml-1 h-4 w-4" /></Button>}
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(sentAlready && notReached.length ? "Confirm you informed the remaining players yourself (outside SquashHub)?" : "Confirm you informed the players yourself, outside SquashHub? Nothing will be sent.")) proceed(true); }}>
          {sentAlready && notReached.length ? "I informed the rest myself — continue" : "Mark as informed manually"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Nothing is sent until you confirm. There's no "send a test to myself" in SquashHub messaging yet.</p>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {ids.length} real player{ids.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends each selected player their personal message now by {channels.map((c) => CH_LABEL[c]).join(", ")}
              {avail ? ` (${channels.map((c) => `${CH_LABEL[c]} reaches ${avail.reach[c]}`).join(", ")})` : ""}. It can't be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); send(); }}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
