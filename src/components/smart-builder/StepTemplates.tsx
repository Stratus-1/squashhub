import { useEffect, useState } from "react";
import { draftKey, migrateLegacy } from "@/lib/smart-builder/step-storage";
import { toast } from "sonner";
import { BookmarkPlus, Gem, Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import type { StepAnswers } from "./StepByStepBuilder";
import {
  PREBUILT_TEMPLATES, REVIEW_FIELDS, STEP_TEMPLATE_KEY, fromStepTemplate, hasPlanInProgress, toStepTemplate, type StepTemplate,
} from "@/lib/smart-builder/step-templates";

type Row = { id: string; name: string; updated_at: string; definition: StepTemplate };
export const reviewKey = (clubId: string) => `sh.stepbuilder.review.${clubId}`;

/** Save the current Step-by-Step setup's structure as a club template. */
export function SaveAsTemplateButton({ clubId, answers, size = "sm" }: { clubId: string; answers: StepAnswers | null; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!answers || !name.trim()) return;
    setBusy(true);
    const { error } = await fromExt("tournament_templates").insert({
      club_id: clubId, template_key: STEP_TEMPLATE_KEY, name: name.trim(), definition: toStepTemplate(answers),
    });
    setBusy(false);
    if (error) { toast.error(`Template not saved: ${error.message}`); return; }
    toast.success(`Saved "${name.trim()}" to My templates.`);
    setOpen(false);
  };
  return (
    <>
      <Button size={size} variant="outline" disabled={!answers} title={answers ? undefined : "This tournament's setup isn't on this device"}
        onClick={() => { setName(answers?.name ? `${answers.name} (template)` : ""); setOpen(true); }}>
        <BookmarkPlus className="mr-1 h-4 w-4" />Save as template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dark bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Saves the format and rules for this club. Players, pairs, payments, results, dates, courts and fee amounts are not saved — you set those for each new event.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="e.g. Club Championships" value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Banner inside the builder after starting from a template. */
export function TemplateReviewBanner({ clubId }: { clubId: string }) {
  const [from, setFrom] = useState<string | null>(() => localStorage.getItem(reviewKey(clubId)));
  if (!from) return null;
  return (
    <div className="mb-3 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-xs" data-testid="template-review">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Started from template "{from}" — review for this event:</span>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { localStorage.removeItem(reviewKey(clubId)); setFrom(null); }}>Done</Button>
      </div>
      <div className="mt-1 text-muted-foreground">{REVIEW_FIELDS.join(" · ")}</div>
    </div>
  );
}

/** My templates / Pre-built templates lists. */
export function TemplatePicker({ clubId, mode, onStartStep, onOpenDraft, onStartDiamond, onClose }: {
  clubId: string; mode: "mine" | "prebuilt";
  onStartStep: () => void; onOpenDraft: (draftId: string) => void; onStartDiamond?: () => void; onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const planKey = draftKey(clubId);
  useEffect(() => {
    if (mode !== "mine") return;
    fromExt("tournament_templates").select("id,name,updated_at,definition").eq("club_id", clubId).eq("template_key", STEP_TEMPLATE_KEY)
      .order("updated_at", { ascending: false })
      .then(({ data, error }: { data: Row[] | null; error: { message: string } | null }) => { if (error) toast.error(error.message); setRows(data ?? []); });
  }, [clubId, mode]);

  const startFrom = (r: Row) => {
    migrateLegacy(clubId);
    if (hasPlanInProgress(localStorage.getItem(planKey))
      && !confirm("An unfinished new tournament draft exists on this device. Replace it with a new tournament from this template? (Tournaments you already created are not affected — they stay under Continue managing.)")) return;
    localStorage.setItem(planKey, JSON.stringify(fromStepTemplate(r.definition)));
    localStorage.setItem(reviewKey(clubId), r.name);
    onStartStep();
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete template "${r.name}"? Tournaments created from it are not affected.`)) return;
    const { error } = await fromExt("tournament_templates").delete().eq("id", r.id);
    if (error) toast.error(error.message); else setRows((x) => (x ?? []).filter((y) => y.id !== r.id));
  };
  const startPrebuilt = (key: string) => {
    // Diamond League always opens the proven Diamond League setup — never a Beta stage model.
    if (key === "diamond_league") onStartDiamond?.();
  };

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>← Tournament Beta</Button>
        <h3 className="font-semibold">{mode === "mine" ? "My templates" : "Pre-built templates"}</h3>
      </div>
      {mode === "mine" ? (
        <>
          <p className="text-xs text-muted-foreground">Templates saved by this club's admins. Starting from one creates a new tournament setup from a copy — the template itself never changes.</p>
          {rows === null ? <div className="text-xs text-muted-foreground">Loading…</div>
            : rows.length === 0 ? <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">No templates yet. Use "Save as template" on the Summary step of a setup, or from Tournament Management.</div>
            : rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Layers className="h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">Saved {new Date(r.updated_at).toLocaleDateString()}</div>
                </div>
                <Button size="sm" onClick={() => startFrom(r)}>Use template</Button>
                <button aria-label={`Delete ${r.name}`} className="p-2 text-muted-foreground hover:text-destructive" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Standard SquashHub formats. Each one starts a new tournament; the master format is never changed.</p>
          {PREBUILT_TEMPLATES.map((t) => (
            <div key={t.key} className="flex items-center gap-2 rounded-lg border border-border p-3">
              <Gem className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{t.description}</div>
              </div>
              <Button size="sm" disabled={busy} onClick={() => startPrebuilt(t.key)}>{busy ? "Opening…" : "Use template"}</Button>
            </div>
          ))}
          <div className="text-[11px] text-muted-foreground">More standard formats will be added here.</div>
        </>
      )}
    </div>
  );
}
