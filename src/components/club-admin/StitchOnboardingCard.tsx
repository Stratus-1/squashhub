import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Landmark, Upload, FileText, X, Loader2, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Slot = {
  key: string;
  label: string;
  multi?: boolean;
};

const SLOTS: Slot[] = [
  { key: "constitution", label: "Grondwet van Klub/Club Constitution (signed)" },
  { key: "board_ids", label: "ID of all Board Members", multi: true },
  { key: "bank_proof", label: "Proof of Bank Account" },
  { key: "address_proof", label: "Proof of Address of Main Member" },
];

type Uploaded = { path: string; filename: string; label: string };

export default function StitchOnboardingCard({
  clubId,
  clubName,
  clubSubdomain,
  defaultEmail,
  defaultCell,
  defaultContactName,
}: {
  clubId: string;
  clubName: string;
  clubSubdomain: string | null;
  defaultEmail?: string | null;
  defaultCell?: string | null;
  defaultContactName?: string | null;
}) {
  const [uploads, setUploads] = useState<Record<string, Uploaded[]>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [contactName, setContactName] = useState(defaultContactName || "");
  const [contactEmail, setContactEmail] = useState(defaultEmail || "");
  const [contactCell, setContactCell] = useState(defaultCell || "");
  const [boardMembers, setBoardMembers] = useState<string>("");
  const clubUrl = useMemo(() => {
    if (clubSubdomain) return `https://${clubSubdomain}.squashhub.co.za`;
    return `https://squashhub.co.za/c/${clubId}`;
  }, [clubSubdomain, clubId]);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ cc: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const allRequiredUploaded = SLOTS.every((s) => (uploads[s.key]?.length || 0) > 0);
  const canSubmit = allRequiredUploaded && contactEmail.includes("@") && contactCell.trim().length >= 6;

  const handleUpload = async (slot: Slot, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingKey(slot.key);
    try {
      const results: Uploaded[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${clubId}/${slot.key}/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage
          .from("stitch-onboarding")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }
        results.push({ path, filename: file.name, label: slot.label });
      }
      setUploads((prev) => ({
        ...prev,
        [slot.key]: slot.multi ? [...(prev[slot.key] || []), ...results] : results,
      }));
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemove = async (slotKey: string, path: string) => {
    await supabase.storage.from("stitch-onboarding").remove([path]);
    setUploads((prev) => ({
      ...prev,
      [slotKey]: (prev[slotKey] || []).filter((f) => f.path !== path),
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const files = SLOTS.flatMap((s) => uploads[s.key] || []);
      const board = boardMembers
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { data, error } = await supabase.functions.invoke("stitch-onboarding-submit", {
        body: {
          club_id: clubId,
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim(),
          contact_cell: contactCell.trim(),
          club_url: clubUrl,
          board_members: board,
          files,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setSent({ cc: contactEmail.trim() });
      toast.success("Application sent to Stitch. Check your inbox for a CC.");
    } catch (err: any) {
      toast.error(err.message || "Failed to send application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-sky-500/30">
      <div className="flex items-start gap-2">
        <Landmark className="h-4 w-4 mt-0.5 text-sky-600" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Open a Stitch bank account for {clubName}
            <Badge variant="secondary" className="text-[10px] h-5">Partner offer</Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            SquashHub is partnered with <strong>Stitch Express</strong> to help clubs get a
            dedicated bank account for member fees and online payments. Upload the documents
            below and submit — we'll email everything to Stitch and CC your club contact.
          </p>
        </div>
      </div>

      {sent ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold text-emerald-700 dark:text-emerald-400">Application sent</div>
            <div className="text-muted-foreground mt-0.5">
              Your application was emailed to Beon Pienaar at Stitch Express and CC'd to{" "}
              <span className="font-mono">{sent.cc}</span>. Stitch will reach out directly to
              progress the account opening.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px] text-muted-foreground">
            <div className="font-medium text-sky-700 dark:text-sky-400 mb-1">Stitch contact person</div>
            <div>
              Beon Pienaar · Stitch Express ·{" "}
              <a href="tel:+27689214245" className="text-primary underline">+27 68 921 4245</a> ·{" "}
              <a href="mailto:beon.pienaar@stitch.money" className="text-primary underline">beon.pienaar@stitch.money</a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Main contact name</Label>
              <Input className="h-8 text-xs" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full name of main member" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact email <span className="text-destructive">*</span></Label>
              <Input className="h-8 text-xs" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="account@club.co.za" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact cell <span className="text-destructive">*</span></Label>
              <Input className="h-8 text-xs" type="tel" value={contactCell} onChange={(e) => setContactCell(e.target.value)} placeholder="+27 ..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SquashHub club URL</Label>
              <Input className="h-8 text-xs font-mono" value={clubUrl} readOnly />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Board members (one per line)</Label>
              <Textarea
                className="text-xs min-h-[70px]"
                value={boardMembers}
                onChange={(e) => setBoardMembers(e.target.value)}
                placeholder={"Jane Smith - Chairperson\nJohn Doe - Treasurer"}
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Required documents
            </div>
            {SLOTS.map((slot) => {
              const list = uploads[slot.key] || [];
              const done = list.length > 0;
              return (
                <div key={slot.key} className="rounded-md border p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {slot.label}
                      {slot.multi && <Badge variant="outline" className="text-[10px] h-4">multiple allowed</Badge>}
                    </div>
                    <label className="inline-flex">
                      <input
                        type="file"
                        className="hidden"
                        multiple={slot.multi}
                        accept="image/*,application/pdf"
                        disabled={uploadingKey === slot.key}
                        onChange={(e) => {
                          handleUpload(slot, e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border cursor-pointer hover:bg-muted">
                        {uploadingKey === slot.key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : slot.multi && done ? (
                          <Plus className="h-3 w-3" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {slot.multi && done ? "Add more" : done ? "Replace" : "Upload"}
                      </span>
                    </label>
                  </div>
                  {list.length > 0 && (
                    <ul className="space-y-1">
                      {list.map((f) => (
                        <li key={f.path} className="flex items-center justify-between gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
                          <span className="truncate">{f.filename}</span>
                          <button
                            type="button"
                            onClick={() => handleRemove(slot.key, f.path)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="text-xs" onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending to Stitch…</>
              ) : (
                "Submit application to Stitch"
              )}
            </Button>
            {!allRequiredUploaded && (
              <span className="text-[10px] text-muted-foreground">Upload all required documents to enable submit.</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
