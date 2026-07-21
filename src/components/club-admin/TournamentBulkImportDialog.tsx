import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, MessageCircle, Copy, Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  champ: { id: string; name: string; match_type?: string | null } | null;
}

interface Row {
  key: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  gender: "Men" | "Ladies";
  home_club_name: string;
  division: string;
  partner_name: string;
  // match hint from server dry-run
  hint?: "already_member" | "linked_visitor" | "created" | "unknown";
  // result after import
  status?: "already_member" | "linked_visitor" | "created" | "error" | "skipped";
  magic_link?: string;
  email_queued?: boolean;
  message?: string;
}

function newRow(): Row {
  return {
    key: crypto.randomUUID(),
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gender: "Men",
    home_club_name: "",
    division: "",
    partner_name: "",
  };
}

// Parse a pasted TSV/CSV/whitespace block. Expected columns (flexible):
// first_name, last_name, email, phone, gender, home_club, division, partner
function parsePaste(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Row[] = [];
  for (const line of lines) {
    // Split by tab first, fall back to comma, then multiple spaces
    let parts: string[] = [];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(",")) parts = line.split(",");
    else parts = line.split(/\s{2,}/);
    parts = parts.map((p) => p.trim());
    if (parts.length < 2) continue;
    // Skip a header row
    if (/first[_\s]?name/i.test(parts[0]) || /email/i.test(parts[0])) continue;

    const [first = "", last = "", email = "", phone = "", gender = "", homeClub = "", division = "", partner = ""] = parts;
    if (!email.includes("@")) continue;
    rows.push({
      key: crypto.randomUUID(),
      first_name: first,
      last_name: last,
      email: email.toLowerCase(),
      phone,
      gender: /lad/i.test(gender) ? "Ladies" : "Men",
      home_club_name: homeClub,
      division,
      partner_name: partner,
    });
  }
  return rows;
}

const HINT_LABELS: Record<NonNullable<Row["hint"]>, { label: string; className: string }> = {
  already_member: { label: "Already a member", className: "bg-slate-200 text-slate-700" },
  linked_visitor: { label: "Existing account → link as visitor", className: "bg-amber-100 text-amber-800" },
  created: { label: "New — will be created", className: "bg-emerald-100 text-emerald-800" },
  unknown: { label: "—", className: "bg-slate-100 text-slate-500" },
};

const STATUS_LABELS: Record<NonNullable<Row["status"]>, { label: string; className: string }> = {
  already_member: { label: "Skipped (already member)", className: "bg-slate-200 text-slate-700" },
  linked_visitor: { label: "Linked as visitor", className: "bg-amber-100 text-amber-800" },
  created: { label: "Created & emailed", className: "bg-emerald-100 text-emerald-800" },
  error: { label: "Error", className: "bg-red-100 text-red-800" },
  skipped: { label: "Skipped", className: "bg-slate-200 text-slate-700" },
};

export function TournamentBulkImportDialog({ open, onOpenChange, clubId, champ }: Props) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [pasteText, setPasteText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([newRow()]);
      setPasteText("");
      setDone(false);
    }
  }, [open]);

  const isDoubles = champ?.match_type === "doubles";
  const validRows = useMemo(
    () => rows.filter((r) => r.first_name.trim() && r.last_name.trim() && r.email.includes("@")),
    [rows]
  );
  const pendingRows = useMemo(
    () => validRows.filter((r) => !r.status || r.status === "error"),
    [validRows]
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function applyPaste() {
    const parsed = parsePaste(pasteText);
    if (parsed.length === 0) {
      toast.error("No valid rows found. Expect: first, last, email, phone, gender, home club, division, partner");
      return;
    }
    setRows((rs) => {
      const existing = rs.filter((r) => r.first_name || r.email);
      return [...existing, ...parsed];
    });
    setPasteText("");
    toast.success(`Added ${parsed.length} row${parsed.length === 1 ? "" : "s"} from paste`);
  }

  async function runPreview() {
    if (validRows.length === 0) return;
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-register-visitors", {
        body: {
          club_id: clubId,
          tournament_id: champ?.id || null,
          entrants: validRows.map((r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone || null,
            gender: r.gender,
            home_club_name: r.home_club_name || null,
            division: r.division || null,
            partner_name: r.partner_name || null,
          })),
          dry_run: true,
        },
      });
      if (error) throw error;
      const results = (data as any)?.results as Array<{ index: number; status: Row["hint"] }>;
      if (Array.isArray(results)) {
        setRows((rs) => {
          const validKeys = validRows.map((v) => v.key);
          return rs.map((r) => {
            const idx = validKeys.indexOf(r.key);
            if (idx < 0) return r;
            const hint = results.find((x) => x.index === idx)?.status || "unknown";
            return { ...r, hint };
          });
        });
        toast.success("Match check complete");
      }
    } catch (err: any) {
      toast.error(err?.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function runImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-register-visitors", {
        body: {
          club_id: clubId,
          tournament_id: champ?.id || null,
          entrants: validRows.map((r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone || null,
            gender: r.gender,
            home_club_name: r.home_club_name || null,
            division: r.division || null,
            partner_name: r.partner_name || null,
          })),
        },
      });
      if (error) throw error;
      const results = (data as any)?.results as any[];
      const summary = (data as any)?.summary;
      if (Array.isArray(results)) {
        setRows((rs) => {
          const validKeys = validRows.map((v) => v.key);
          return rs.map((r) => {
            const idx = validKeys.indexOf(r.key);
            if (idx < 0) return r;
            const res = results.find((x) => x.index === idx);
            if (!res) return r;
            return {
              ...r,
              status: res.status,
              magic_link: res.magic_link,
              email_queued: res.email_queued,
              message: res.message,
            };
          });
        });
      }
      setDone(true);
      toast.success(
        `Imported: ${summary?.created ?? 0} new · ${summary?.linked ?? 0} linked · ${summary?.already ?? 0} already · ${summary?.emails_queued ?? 0} emails queued`
      );
    } catch (err: any) {
      toast.error(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function whatsappUrl(r: Row): string | null {
    const digits = (r.phone || "").replace(/\D/g, "");
    if (!digits) return null;
    const clean = digits.startsWith("0") ? "27" + digits.slice(1) : digits;
    const msg = [
      `Hi ${r.first_name},`,
      `You're entered for ${champ?.name || "the tournament"}.`,
      r.magic_link ? `Tap this link to sign in (no password): ${r.magic_link}` : "",
    ].filter(Boolean).join(" ");
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  }

  function copyCsv() {
    const header = ["name", "email", "phone", "status", "magic_link", "email_queued", "message"];
    const lines = [header.join(",")];
    for (const r of rows) {
      if (!r.status) continue;
      const name = `${r.first_name} ${r.last_name}`.trim();
      lines.push([
        name,
        r.email,
        r.phone,
        r.status,
        r.magic_link || "",
        r.email_queued ? "yes" : "no",
        (r.message || "").replace(/,/g, ";"),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied results to clipboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Bulk import entrants{champ ? ` — ${champ.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Adds each entrant as a visitor at your club and emails them a one-click magic-link
            to sign in — no password. {isDoubles ? "Doubles: fill Partner column." : ""}
          </div>

          {/* Paste box */}
          <div className="rounded-md border p-3 bg-muted/30 space-y-2">
            <Label className="text-xs">Paste rows (tab, comma, or 2+ spaces separated)</Label>
            <div className="text-[11px] text-muted-foreground">
              Columns: first_name, last_name, email, phone, gender (Men/Ladies), home_club, division, partner
            </div>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="John	Smith	john@example.com	0821234567	Men	Glenwood	A	Alex Brown"
              className="h-24 font-mono text-xs"
            />
            <Button size="sm" variant="secondary" onClick={applyPaste} disabled={!pasteText.trim()}>
              <Upload className="w-3 h-3 mr-1" /> Add pasted rows
            </Button>
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left w-[140px]">First</th>
                  <th className="p-2 text-left w-[140px]">Last</th>
                  <th className="p-2 text-left w-[200px]">Email</th>
                  <th className="p-2 text-left w-[130px]">Phone</th>
                  <th className="p-2 text-left w-[90px]">Gender</th>
                  <th className="p-2 text-left w-[150px]">Home club</th>
                  <th className="p-2 text-left w-[80px]">Div</th>
                  {isDoubles && <th className="p-2 text-left w-[150px]">Partner</th>}
                  <th className="p-2 text-left w-[180px]">Status</th>
                  <th className="p-2 w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-1"><Input value={r.first_name} onChange={(e) => updateRow(r.key, { first_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.last_name} onChange={(e) => updateRow(r.key, { last_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.email} onChange={(e) => updateRow(r.key, { email: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.phone} onChange={(e) => updateRow(r.key, { phone: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1">
                      <Select value={r.gender} onValueChange={(v) => updateRow(r.key, { gender: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Men">Men</SelectItem>
                          <SelectItem value="Ladies">Ladies</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1"><Input value={r.home_club_name} onChange={(e) => updateRow(r.key, { home_club_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.division} onChange={(e) => updateRow(r.key, { division: e.target.value })} className="h-8 text-xs" /></td>
                    {isDoubles && (
                      <td className="p-1"><Input value={r.partner_name} onChange={(e) => updateRow(r.key, { partner_name: e.target.value })} className="h-8 text-xs" /></td>
                    )}
                    <td className="p-1">
                      {r.status ? (
                        <div className="space-y-0.5">
                          <Badge variant="secondary" className={STATUS_LABELS[r.status].className}>{STATUS_LABELS[r.status].label}</Badge>
                          {r.message && <div className="text-[10px] text-red-700">{r.message}</div>}
                        </div>
                      ) : r.hint ? (
                        <Badge variant="secondary" className={HINT_LABELS[r.hint].className}>{HINT_LABELS[r.hint].label}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-1">
                      <div className="flex gap-0.5">
                        {r.status === "created" || r.status === "linked_visitor" ? (
                          whatsappUrl(r) ? (
                            <a href={whatsappUrl(r)!} target="_blank" rel="noopener noreferrer" title="Send WhatsApp with magic-link">
                              <Button size="icon" variant="ghost" className="h-7 w-7"><MessageCircle className="w-3.5 h-3.5 text-emerald-600" /></Button>
                            </a>
                          ) : null
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(r.key)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}>
              <Plus className="w-3 h-3 mr-1" /> Add row
            </Button>
            {!done && (
              <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing || validRows.length === 0}>
                {previewing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Check matches ({validRows.length})
              </Button>
            )}
            {done && (
              <Button size="sm" variant="outline" onClick={copyCsv}>
                <Copy className="w-3 h-3 mr-1" /> Copy results CSV
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{done ? "Close" : "Cancel"}</Button>
          {!done && (
            <Button onClick={runImport} disabled={importing || validRows.length === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import & email ({validRows.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
