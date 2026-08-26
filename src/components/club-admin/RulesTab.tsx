import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Eye, FileText, History, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLUB_DOCUMENTS_BUCKET,
  ClubRuleDocument,
  DEFAULT_ACCEPTANCE_STATEMENT,
  DEFAULT_RULES_TEMPLATE,
} from "@/lib/club-rules";
import {
  useClubRules,
  useClubRuleVersions,
  useClubRuleAcceptances,
  useSaveClubRules,
  signRuleDocument,
} from "@/hooks/use-club-rules";
import { ClubRulesContent } from "@/components/ClubRulesContent";

export function RulesTab({ clubId, club }: { clubId: string; club: any }) {
  const { data: rules, isLoading } = useClubRules(clubId);
  const { data: versions = [] } = useClubRuleVersions(clubId);
  const { data: acceptances = [] } = useClubRuleAcceptances(clubId);
  const save = useSaveClubRules(clubId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [documents, setDocuments] = useState<ClubRuleDocument[]>([]);
  const [showOnLanding, setShowOnLanding] = useState(false);
  const [requireAcceptance, setRequireAcceptance] = useState(true);
  const [statement, setStatement] = useState(DEFAULT_ACCEPTANCE_STATEMENT);
  const [uploading, setUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!rules) return;
    setText(rules.rules_text || "");
    setDocuments(rules.documents || []);
    setShowOnLanding(!!rules.show_on_landing);
    setRequireAcceptance(rules.require_acceptance !== false);
    setStatement(rules.acceptance_statement || DEFAULT_ACCEPTANCE_STATEMENT);
  }, [rules?.id, rules?.current_version]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Document must be under 10MB");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${clubId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(CLUB_DOCUMENTS_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/pdf" });
      if (error) throw error;
      setDocuments((d) => [...d, { name: file.name, path, uploaded_at: new Date().toISOString() }]);
      toast.success("Document uploaded — remember to save");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: ClubRuleDocument) => {
    setDocuments((d) => d.filter((x) => x.path !== doc.path));
    await supabase.storage.from(CLUB_DOCUMENTS_BUCKET).remove([doc.path]).catch(() => null);
  };

  const openDoc = async (doc: ClubRuleDocument) => {
    const url = await signRuleDocument(doc.path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Could not open document");
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        rules_text: text,
        documents,
        show_on_landing: showOnLanding,
        require_acceptance: requireAcceptance,
        acceptance_statement: statement.trim() || DEFAULT_ACCEPTANCE_STATEMENT,
      });
      toast.success("Membership rules saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save rules");
    }
  };

  // ?preview=1 lets a signed-in admin view the public page (ClubLanding
  // otherwise redirects signed-in users to their dashboard).
  const previewLandingUrl = club?.subdomain ? `/c/${club.subdomain}?preview=1` : null;

  if (isLoading) {
    return (
      <div className="mt-4 flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">Membership Rules &amp; Constitution</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              The rules every member must read and accept. The same content is shown on your public
              club page (when switched on) and during member registration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5 text-[10px]">
              Version {rules?.current_version || 0}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setPreview((p) => !p)}>
              <Eye className="w-3.5 h-3.5 mr-1" /> {preview ? "Hide preview" : "Preview"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              <Save className="w-3.5 h-3.5 mr-1" /> {save.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Rules text</Label>
            {!text.trim() && (
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setText(DEFAULT_RULES_TEMPLATE)}>
                Load starter template
              </Button>
            )}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="text-[13px] font-mono"
            placeholder={"Club rules for members\n1. ...\n\nRules for Juniors/Scholars\n1. ..."}
          />
          <p className="text-[10px] text-muted-foreground">
            Lines without a number become headings; numbered lines become the rule list.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs">Documents (constitution, house rules — PDF)</Label>
          {documents.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">No documents uploaded yet.</p>
          )}
          <ul className="space-y-1.5">
            {documents.map((doc) => (
              <li key={doc.path} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <button type="button" className="flex-1 truncate text-left text-[13px] hover:underline" onClick={() => openDoc(doc)}>
                  {doc.name}
                </button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeDoc(doc)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={handleUpload} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="w-3.5 h-3.5 mr-1" /> {uploading ? "Uploading..." : "Upload document"}
          </Button>
          <p className="text-[10px] text-muted-foreground">Max 10MB per file.</p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch id="rules-landing" checked={showOnLanding} onCheckedChange={setShowOnLanding} />
            <Label htmlFor="rules-landing" className="text-xs font-normal cursor-pointer">
              Display on landing page
            </Label>
            {previewLandingUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => window.open(previewLandingUrl, "_blank", "noopener,noreferrer")}
              >
                <Eye className="w-3 h-3 mr-1" /> Preview landing page
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rules-require" checked={requireAcceptance} onCheckedChange={setRequireAcceptance} />
            <Label htmlFor="rules-require" className="text-xs font-normal cursor-pointer">
              Require members to accept during registration
            </Label>
          </div>
          <div className="space-y-1 max-w-3xl">
            <Label className="text-xs">Acceptance wording</Label>
            <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={2} className="text-[13px]" />
          </div>
        </div>
      </Card>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview — what members and visitors see</DialogTitle>
            <DialogDescription className="text-xs">
              Shows the unsaved text currently in the editor.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border p-4">
            <ClubRulesContent rulesText={text} documents={documents} />
            {requireAcceptance && (
              <p className="mt-4 text-[12px] text-muted-foreground border-t border-border pt-3">
                ☐ {statement || DEFAULT_ACCEPTANCE_STATEMENT}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <History className="w-4 h-4" /> Version history
          </h3>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? <X className="w-3.5 h-3.5" /> : `${versions.length} version${versions.length === 1 ? "" : "s"}`}
          </Button>
        </div>
        {showHistory && (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border border-border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="h-5 text-[10px]">Version {v.version}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("en-ZA")}
                  </span>
                </div>
                <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
                  {v.rules_text || "(no text)"}
                </pre>
              </li>
            ))}
            {versions.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">No versions saved yet.</p>
            )}
          </ul>
        )}
      </Card>

      <Card className="p-4 md:p-5 space-y-3">
        <h3 className="font-semibold text-sm">Acceptance records ({acceptances.length})</h3>
        {acceptances.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">No members have accepted yet.</p>
        ) : (
          <ul className="divide-y divide-border text-[12px]">
            {acceptances.slice(0, 50).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5">
                <span className="truncate">Version {a.version}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(a.accepted_at).toLocaleString("en-ZA")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
