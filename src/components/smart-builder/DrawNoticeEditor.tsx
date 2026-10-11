import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_ACTIVATION_INTRO, loadActivationStates, readDrawNoticeSettings, sameDrawNoticeSettings, saveDrawNoticeSettings,
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

export function DrawNoticeEditor({ notice, disabled, clubId, recipientIds }: {
  notice: ReturnType<typeof useDrawNoticeSettings>; disabled?: boolean; clubId?: string; recipientIds?: string[];
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
    {preview && (
      <div className="space-y-2 rounded border border-border bg-muted/40 p-3 text-xs" data-testid="draw-notice-preview">
        <p>Dear Player name,</p>
        <p className="whitespace-pre-line">{value.message}</p>
        <p className="text-muted-foreground">[Fee line and Pay my fee button when a fee is outstanding]</p>
        <p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">View tournament & score match</span></p>
        {preview === "activation"
          ? <><p>{value.activationIntro || DEFAULT_ACTIVATION_INTRO}</p><p><span className="rounded bg-primary px-2 py-1 text-primary-foreground">Activate my SquashHub account</span></p><p className="text-muted-foreground">Personal link to the player's own club account, works once, expires in 14 days. Created only when the email is sent; never joins them to the host club.</p></>
          : <p><span className="rounded border px-2 py-1">Log in to SquashHub</span></p>}
        <p className="text-muted-foreground">Preview only — nothing is sent.</p>
      </div>
    )}
  </div>;
}
