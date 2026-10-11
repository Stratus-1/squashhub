import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_ACTIVATION_INTRO, loadActivationStates, loadMatchDetailsContext, loadDrawFeeContext, composeDrawNoticeVars, sendDrawNoticeTest, type DrawScope, readDrawNoticeSettings, sameDrawNoticeSettings, saveDrawNoticeSettings,
  type ActivationState, type DrawNoticeSettings,
} from "@/lib/smart-builder/draw-notice";

/** Loads/saves the draw wording for one notice key on the tournament (server-side). Saving never sends. */
export function useDrawNoticeSettings(tournamentId: string | null | undefined, key: string, fallback: string) {
  const [value, setValue] = useState<DrawNoticeSettings>({ message: fallback, includeActivation: false, activationIntro: DEFAULT_ACTIVATION_INTRO });
  const [saved, setSaved] = useState<DrawNoticeSettings | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!tournamentId) return;
    let live = true;
    (supabase as any).from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle().then(({ data }: any) => {
      if (!live) return;
      const s = readDrawNoticeSettings(data?.beta_lifecycle, key, fallback);
      const v = { message: s.message, includeActivation: s.includeActivation, activationIntro: s.activationIntro };
      setValue(v); setSaved(v); setSavedAt(s.savedAt);
    });
    return () => { live = false; };
  }, [tournamentId, key, fallback]);
  const save = async () => {
    if (!tournamentId) return;
    setSaving(true);
    try { const r = await saveDrawNoticeSettings(tournamentId, key, value); setSaved(value); setSavedAt(r.at); toast.success("Message saved. Nothing was sent."); }
    catch (e: any) { toast.error(e?.message ?? "Could not save the message"); }
    finally { setSaving(false); }
  };
  const dirty = !saved || !sameDrawNoticeSettings(value, saved);
  return { value, setValue, save, saving, dirty, savedAt, loaded: !!saved };
}

const STATE_LABEL: Record<ActivationState, string> = {
  registered: "have a login (normal tournament link)",
  family_login: "use a shared family login (normal link)",
  needs_activation: "need activation (personal link)",
  no_email: "have no usable email (no activation link — add an email first)",
  guest: "are guests without a national player record (no activation link; needs the separate guest identity process)",
};

export function DrawNoticeEditor({ notice, disabled, clubId, recipientIds, tournamentId, tournamentName, scope }: {
  notice: ReturnType<typeof useDrawNoticeSettings>; disabled?: boolean; clubId?: string; recipientIds?: string[];
  tournamentId?: string; tournamentName?: string; scope?: DrawScope | null;
}) {
  const { value, setValue, save, saving, dirty, savedAt, loaded } = notice;
  const [states, setStates] = useState<Record<string, ActivationState> | null>(null);
  const [preview, setPreview] = useState<"registered" | "activation" | null>(null);
  const idsKey = (recipientIds ?? []).join(",");
  useEffect(() => {
    if ( !clubId || !recipientIds?.length) { setStates(null); return; }
    loadActivationStates(clubId, recipientIds).then(setStates).catch(() => setStates(null));
  }, [value.includeActivation, clubId, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = states ? Object.values(states).reduce((c, s) => ({ ...c, [s]: (c[s] ?? 0) + 1 }), {} as Record<string, number>) : null;

  return <div className="space-y-2">
    <label className="block space-y-1"><span className="font-medium">Draw notification wording</span>
      <Textarea aria-label="Draw notification wording" value={value.message} onChange={(e) => setValue({ ...value, message: e.target.value })} maxLength={2000} rows={4} disabled={disabled || saving} />
    </label>
    <p className="text-xs text-muted-foreground">Players without a SquashHub login automatically get their own activation button in the email, which opens their own club's page. It works once and expires in 14 days. Players with a login get the normal tournament button.</p>
    {true && (
      <label className="block space-y-1 text-xs"><span className="text-muted-foreground">Activation introduction</span>
        <Input aria-label="Activation introduction" value={value.activationIntro} maxLength={300} disabled={disabled || saving} onChange={(e) => setValue({ ...value, activationIntro: e.target.value })} />
      </label>
    )}
    {true && counts && (
      <ul className="rounded border border-border p-2 text-xs" data-testid="activation-counts">
        {(Object.keys(STATE_LABEL) as ActivationState[]).filter((k) => counts[k]).map((k) => <li key={k}><b>{counts[k]}</b> {STATE_LABEL[k]}</li>)}
      </ul>
    )}
    <label className="block space-y-1"><span className="text-muted-foreground">Tournament button</span><Input readOnly value="View tournament & score match" /></label>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button type="button" size="sm" variant={dirty ? "default" : "outline"} onClick={save} disabled={disabled || saving || !dirty || !value.message.trim()}>
        {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save message
      </Button>
      <span data-testid="draw-notice-save-state" className={dirty ? "font-medium text-destructive" : "text-muted-foreground"}>
        {!loaded ? "Loading…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "Default wording (not yet saved)"}
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(preview === "registered" ? null : "registered")}>Preview: has login</Button>
      {<Button type="button" size="sm" variant="ghost" onClick={() => setPreview(preview === "activation" ? null : "activation")}>Preview: needs activation</Button>}
    </div>
    {clubId && tournamentId && scope && !!recipientIds?.length && (
      <PlayerEmailPreview clubId={clubId} tournamentId={tournamentId} tournamentName={tournamentName ?? "Tournament"} scope={scope} recipientIds={recipientIds} message={value.message} activationIntro={value.activationIntro} states={states} />
    )}
    {preview && (
      <div className="space-y-2 rounded border border-border bg-muted/40 p-3 text-xs" data-testid="draw-notice-preview">
        <p>Dear Player name,</p>
        <p className="whitespace-pre-line">{value.message}</p>
        <div className="rounded border border-dashed border-border p-2" data-testid="draw-notice-tbc">
          <p className="font-semibold">Your match details</p>
          <p>Category · Round: as drawn</p><p>Opponent: To be confirmed</p><p>Date: To be confirmed · Time: To be confirmed</p><p>Court: To be confirmed · Venue: To be confirmed</p>
          <p className="text-muted-foreground">Filled per player from the saved fixtures when sent ("scheduled" for a planned slot, "Court booking confirmed" only for a real booking). Phone numbers are never included.</p>
        </div>
        <p className="text-muted-foreground">[Fee line and Pay my fee button only when that player's fee is outstanding]</p>
        <p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">View tournament & score match</span></p>
        {preview === "activation"
          ? <><p>{value.activationIntro || DEFAULT_ACTIVATION_INTRO}</p><p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">Activate my SquashHub account</span></p><p className="text-muted-foreground">Personal link to the player's own club account, works once, expires in 14 days. Created only when the email is sent; never joins them to the host club.</p></>
          : <p><span className="rounded border px-2 py-1">Log in to SquashHub</span></p>}
        <p className="text-muted-foreground">Preview only — nothing is sent.</p>
      </div>
    )}
  </div>;
}

/**
 * Full email preview for ONE chosen player, built by the same composer the send uses
 * (saved wording, fee line only when owed, "Your match details", buttons). Admin-only screen;
 * shows no phone numbers. "Send test to me" emails the admin, never the player.
 */
function PlayerEmailPreview({ clubId, tournamentId, tournamentName, scope, recipientIds, message, activationIntro, states }: {
  clubId: string; tournamentId: string; tournamentName: string; scope: DrawScope; recipientIds: string[]; message: string; activationIntro: string;
  states: Record<string, ActivationState> | null;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ ctx: Awaited<ReturnType<typeof loadMatchDetailsContext>>; fee: Awaited<ReturnType<typeof loadDrawFeeContext>> } | null>(null);
  const [who, setWho] = useState<string>("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([loadMatchDetailsContext(clubId, tournamentId, tournamentName, scope), loadDrawFeeContext(clubId, tournamentId, false)])
      .then(([ctx, fee]) => { if (live) { setData({ ctx, fee }); setWho((w) => w || [...recipientIds].sort((a, b) => (ctx.names[a] ?? "").localeCompare(ctx.names[b] ?? ""))[0] || ""); } })
      .catch((e) => toast.error(e?.message ?? "Could not load the preview"));
    return () => { live = false; };
  }, [open, clubId, tournamentId, scope.round, scope.groupNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const composed = data && who ? composeDrawNoticeVars(who, message, data.ctx, data.fee, tournamentId) : null;
  const owes = !!(data && who && data.fee.fee > 0 && data.fee.status[who]?.owes);
  const needsActivation = states?.[who] === "needs_activation";
  const test = async () => {
    setTesting(true);
    try { await sendDrawNoticeTest(clubId, tournamentId, tournamentName, message, scope, who); toast.success("Test email sent to you. No player was emailed."); }
    catch (e: any) { toast.error(e?.message ?? "Could not send the test"); }
    finally { setTesting(false); }
  };
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="draw-preview-player-open">Preview full email for a player</Button>;
  return (
    <div className="space-y-2 rounded border border-border p-3 text-xs" data-testid="draw-preview-player">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Preview as
          <select aria-label="Preview as player" className="h-8 rounded border border-input bg-background px-2" value={who} onChange={(e) => setWho(e.target.value)}>
            {[...recipientIds].sort((a, b) => (data?.ctx.names[a] ?? "").localeCompare(data?.ctx.names[b] ?? "")).map((id) => <option key={id} value={id}>{data?.ctx.names[id] ?? "Loading…"}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" onClick={test} disabled={!who || testing || !message.trim()}>{testing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Send test to me</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {!composed ? <p className="text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading saved games…</p> : (
        <div className="space-y-2 rounded bg-background p-3 text-sm text-foreground ring-1 ring-border">
          <p>Dear {data!.ctx.names[who] ?? "Player"},</p>
          <p className="whitespace-pre-line">{composed.vars.personal_message_html.replace(/<br>/g, "\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")}</p>
          {composed.items.length
            /* Built by matchDetailsHtml from escaped values only — the exact markup the email carries. */
            ? <div data-testid="draw-preview-match" dangerouslySetInnerHTML={{ __html: composed.vars.match_details_html }} />
            : <p className="text-muted-foreground">No game for this player in this round.</p>}
          {owes && <p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">Pay my fee</span></p>}
          <p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">View tournament & score match</span></p>
          {needsActivation && <><p>{activationIntro || DEFAULT_ACTIVATION_INTRO}</p><p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">Activate my SquashHub account</span></p></>}
        </div>
      )}
      <p className="text-muted-foreground">Preview only — nothing is sent to players. Built from the saved games and court bookings; phone numbers are never included.</p>
    </div>
  );
}
