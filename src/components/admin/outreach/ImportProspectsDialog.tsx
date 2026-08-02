import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { parseProspectPaste, IMPORT_TEMPLATE_HEADER, type ParsedRow } from "@/lib/outreach-import";
import { AlertTriangle, Check, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

export function ImportProspectsDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const [raw, setRaw] = useState("");
  const [defaultTags, setDefaultTags] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRaw(""); setRows(null); setUnmapped([]); setExistingEmails(new Set());
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setRaw(await file.text());
  };

  const doParse = async () => {
    const tags = defaultTags.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    const res = parseProspectPaste(raw, { tags, source: defaultSource });
    if (!res.rows.length) {
      toast({ title: "Nothing to import", description: "No rows found in the pasted text.", variant: "destructive" });
      return;
    }
    const emails = res.rows.map((r) => r.email).filter(Boolean);
    const { data } = await supabase
      .from("outreach_contacts").select("email").in("email", emails);
    const existing = new Set((data ?? []).map((c) => String(c.email).toLowerCase()));
    setExistingEmails(existing);
    setRows(
      res.rows.map((r) =>
        existing.has(r.email)
          ? { ...r, problems: [...r.problems, "Already in your list"], include: false }
          : r,
      ),
    );
    setUnmapped(res.unmappedHeaders);
  };

  const includedCount = useMemo(() => (rows ?? []).filter((r) => r.include).length, [rows]);

  const toggle = (i: number) =>
    setRows((prev) => (prev ?? []).map((r) => (r.index === i ? { ...r, include: !r.include } : r)));

  const commit = async () => {
    const picked = (rows ?? []).filter((r) => r.include);
    if (!picked.length) return;
    setBusy(true);
    try {
      // Group by club so several contacts at one club share a prospect.
      const byClub = new Map<string, ParsedRow[]>();
      for (const r of picked) {
        const key = r.club_name.toLowerCase().trim();
        byClub.set(key, [...(byClub.get(key) ?? []), r]);
      }

      const clubNames = [...byClub.values()].map((g) => g[0].club_name);
      const { data: existingClubs } = await supabase
        .from("outreach_prospects").select("id,club_name").in("club_name", clubNames);
      const clubMap = new Map(
        (existingClubs ?? []).map((c) => [String(c.club_name).toLowerCase().trim(), c.id]),
      );

      const toCreate = [...byClub.entries()].filter(([k]) => !clubMap.has(k));
      if (toCreate.length) {
        const { data: created, error } = await supabase
          .from("outreach_prospects")
          .insert(
            toCreate.map(([, g]) => ({
              club_name: g[0].club_name,
              association: g[0].association || null,
              city: g[0].city || null,
              country: g[0].country,
              courts: g[0].courts,
              website: g[0].website || null,
              is_nsa: g[0].is_nsa,
              source: g[0].source || null,
              tags: g[0].tags,
              notes: g[0].notes || null,
            })),
          )
          .select("id,club_name");
        if (error) throw error;
        for (const c of created ?? []) clubMap.set(String(c.club_name).toLowerCase().trim(), c.id);
      }

      const contactRows = picked.map((r) => ({
        prospect_id: clubMap.get(r.club_name.toLowerCase().trim())!,
        name: r.contact_name || null,
        role: r.role || null,
        email: r.email,
        phone: r.phone || null,
        is_primary: /chair/i.test(r.role),
      })).filter((c) => c.prospect_id);

      const { error: cErr } = await supabase.from("outreach_contacts").insert(contactRows);
      if (cErr) throw cErr;

      toast({
        title: "Import complete",
        description: `${toCreate.length} new club(s), ${contactRows.length} contact(s) added.`,
      });
      reset();
      onOpenChange(false);
      onImported();
    } catch (err) {
      toast({
        title: "Import failed",
        description: (err as Error)?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import clubs & contacts</DialogTitle>
          <DialogDescription>
            Paste a tab- or comma-separated block (straight from a spreadsheet works), or upload a CSV.
            A header row is detected automatically.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-2 text-[11px] font-mono overflow-x-auto">
              {IMPORT_TEMPLATE_HEADER.replace(/\t/g, " | ")}
            </div>
            <Textarea
              rows={10}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste your rows here…"
              className="font-mono text-xs"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Tag every row (optional)</Label>
                <Input value={defaultTags} onChange={(e) => setDefaultTags(e.target.value)} placeholder="nsa-pretoria" />
              </div>
              <div>
                <Label className="text-xs">Source (optional)</Label>
                <Input value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} placeholder="NSA club directory" />
              </div>
              <div>
                <Label className="text-xs">Or upload a CSV</Label>
                <Input type="file" accept=".csv,.tsv,.txt" onChange={(e) => handleFile(e.target.files?.[0])} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={doParse} disabled={!raw.trim()}>
                <Upload className="h-4 w-4 mr-1" /> Preview rows
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{rows.length} rows parsed</Badge>
              <Badge className="bg-emerald-600">{includedCount} will be imported</Badge>
              {rows.length - includedCount > 0 && (
                <Badge variant="destructive">{rows.length - includedCount} skipped</Badge>
              )}
              {existingEmails.size > 0 && (
                <span className="text-muted-foreground">{existingEmails.size} already in your list</span>
              )}
            </div>
            {unmapped.length > 0 && (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Ignored columns: {unmapped.join(", ")}
              </p>
            )}
            <ScrollArea className="h-[320px] rounded-md border">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Club</th>
                    <th className="p-2">Contact</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.index} className="border-t">
                      <td className="p-2">
                        <Checkbox checked={r.include} onCheckedChange={() => toggle(r.index)} />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{r.club_name || "—"}</div>
                        <div className="text-muted-foreground">
                          {[r.city, r.association].filter(Boolean).join(" · ")}
                          {r.is_nsa && <Badge className="ml-1 h-4 px-1 text-[9px]">NSA</Badge>}
                        </div>
                      </td>
                      <td className="p-2">
                        {r.contact_name || "—"}
                        {r.role && <div className="text-muted-foreground">{r.role}</div>}
                      </td>
                      <td className="p-2 break-all">{r.email || "—"}</td>
                      <td className="p-2 text-amber-500">{r.problems.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRows(null)}>Back</Button>
              <Button onClick={commit} disabled={busy || !includedCount}>
                <Check className="h-4 w-4 mr-1" />
                {busy ? "Importing…" : `Import ${includedCount} contact(s)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
