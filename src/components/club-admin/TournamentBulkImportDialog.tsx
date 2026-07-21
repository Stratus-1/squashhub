import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, MessageCircle, Copy, ArrowDown, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  champ: { id: string; name: string; match_type?: string | null } | null;
}

interface NsaCandidate {
  club_member_id: string;
  club_id: string;
  club_name: string;
  club_subdomain: string | null;
  nsa_number: string;
  full_name: string;
  gender: string | null;
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
  // NSA candidates from dry-run
  nsa_candidates?: NsaCandidate[];
  // Admin-confirmed NSA identity
  nsa_home_club_id?: string | null;
  nsa_number?: string | null;
  nsa_home_club_name?: string | null;
  nsa_ignored?: boolean;
  // result after import
  status?: "already_member" | "linked_visitor" | "created" | "error" | "skipped";
  magic_link?: string;
  email_queued?: boolean;
  message?: string;
}

const RESULT_FIELDS: Array<keyof Row> = [
  "hint",
  "nsa_candidates",
  "nsa_home_club_id",
  "nsa_number",
  "nsa_home_club_name",
  "nsa_ignored",
  "status",
  "magic_link",
  "email_queued",
  "message",
];

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
    if (/first[_\s]?name/i.test(parts[0]) || /^email$/i.test(parts[0])) continue;

    // Auto-detect: if the SECOND column looks like an email, the first column
    // is a full name that must be split into first + last.
    if (parts.length >= 2 && parts[1].includes("@")) {
      const full = parts[0].trim().split(/\s+/);
      const first = full.shift() || "";
      const last = full.join(" ");
      parts = [first, last, ...parts.slice(1)];
    }

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
  created: { label: "New — Ready to import", className: "bg-emerald-100 text-emerald-800" },
  unknown: { label: "—", className: "bg-slate-100 text-slate-500" },
};

const STATUS_LABELS: Record<NonNullable<Row["status"]>, { label: string; className: string }> = {
  already_member: { label: "Skipped (already member)", className: "bg-slate-200 text-slate-700" },
  linked_visitor: { label: "Linked as visitor", className: "bg-amber-100 text-amber-800" },
  created: { label: "Created & emailed", className: "bg-emerald-100 text-emerald-800" },
  error: { label: "Error", className: "bg-red-100 text-red-800" },
  skipped: { label: "Skipped", className: "bg-slate-200 text-slate-700" },
};

const STORAGE_PREFIX = "sh.tournament.bulk-import.v1.";

function storageKey(champId: string | undefined | null): string | null {
  return champId ? `${STORAGE_PREFIX}${champId}` : null;
}

function loadPersisted(champId: string | undefined | null): Row[] | null {
  const key = storageKey(champId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Row[];
  } catch {
    return null;
  }
}

function persistRows(champId: string | undefined | null, rows: Row[]) {
  const key = storageKey(champId);
  if (!key || typeof window === "undefined") return;
  // Only persist completed imports — preview-only skipped/error rows must stay editable in memory.
  const toSave = rows.filter((r) => r.status === "created" || r.status === "linked_visitor" || r.status === "already_member");
  try {
    if (toSave.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(toSave));
  } catch {
    // ignore quota errors
  }
}

export function TournamentBulkImportDialog({ open, onOpenChange, clubId, champ }: Props) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [pasteText, setPasteText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      const persisted = loadPersisted(champ?.id);
      if (persisted && persisted.length > 0) {
        // Show previously imported entrants + one empty row for new additions.
        setRows([...persisted, newRow()]);
        setDone(true);
      } else {
        setRows([newRow()]);
        setDone(false);
      }
      setPasteText("");
    }
  }, [open, champ?.id]);

  useEffect(() => {
    if (!open || !clubId) return;
    const importedEmails = Array.from(
      new Set(
        rows
          .filter((r) => (r.status === "created" || r.status === "linked_visitor" || r.status === "already_member") && r.email.includes("@"))
          .map((r) => r.email.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (importedEmails.length === 0) return;

    let cancelled = false;
    async function reconcileSavedRows() {
      const { data, error } = await supabase
        .from("club_members")
        .select("email")
        .eq("club_id", clubId)
        .in("email", importedEmails);
      if (cancelled || error) return;
      const liveEmails = new Set((data || []).map((m: any) => String(m.email || "").toLowerCase()));
      setRows((current) => {
        const filtered = current.filter(
          (r) =>
            !(r.status === "created" || r.status === "linked_visitor" || r.status === "already_member") ||
            liveEmails.has(r.email.trim().toLowerCase())
        );
        const hasEmptyRow = filtered.some((r) => !r.first_name && !r.last_name && !r.email);
        if (filtered.length === current.length && hasEmptyRow) return current;
        return hasEmptyRow ? filtered : [...filtered, newRow()];
      });
    }

    reconcileSavedRows();
    return () => {
      cancelled = true;
    };
  }, [open, clubId, champ?.id, rows]);

  // Persist imported rows whenever they change.
  useEffect(() => {
    if (open) persistRows(champ?.id, rows);
  }, [rows, open, champ?.id]);



  const isDoubles = champ?.match_type === "doubles";
  const validRows = useMemo(
    () => rows.filter((r) => r.first_name.trim() && r.last_name.trim() && r.email.includes("@")),
    [rows]
  );
  const pendingRows = useMemo(
    () => validRows.filter((r) => !r.status || r.status === "error" || r.status === "skipped"),
    [validRows]
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateEditableRow(key: string, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next: Row = { ...r, ...patch };
        const changedIdentity = Object.entries(patch).some(([field, value]) => {
          const current = r[field as keyof Row];
          return String(current ?? "") !== String(value ?? "");
        });
        if (changedIdentity) {
          const cleared = next as Partial<Row>;
          for (const field of RESULT_FIELDS) delete cleared[field];
        }
        return next;
      })
    );
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
      const results = (data as any)?.results as Array<{ index: number; status: Row["status"] | Row["hint"]; message?: string; nsa_candidates?: NsaCandidate[] }>;
      if (Array.isArray(results)) {
        setRows((rs) => {
          const validKeys = validRows.map((v) => v.key);
          return rs.map((r) => {
            const idx = validKeys.indexOf(r.key);
            if (idx < 0) return r;
            const res = results.find((x) => x.index === idx);
            if (res?.status === "skipped") {
              return { ...r, status: "skipped", message: res.message, hint: undefined, nsa_candidates: res.nsa_candidates || [] };
            }
            const hint = (res?.status as Row["hint"]) || "unknown";
            return { ...r, status: undefined, message: undefined, hint, nsa_candidates: res?.nsa_candidates || [] };
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
    if (pendingRows.length === 0) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-register-visitors", {
        body: {
          club_id: clubId,
          tournament_id: champ?.id || null,
          entrants: pendingRows.map((r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone || null,
            gender: r.gender,
            home_club_name: r.home_club_name || null,
            division: r.division || null,
            partner_name: r.partner_name || null,
            nsa_home_club_id: r.nsa_home_club_id || null,
            nsa_number: r.nsa_number || null,
            nsa_ignored: !!r.nsa_ignored,
          })),
        },
      });
      if (error) throw error;
      const results = (data as any)?.results as any[];
      const summary = (data as any)?.summary;
      if (Array.isArray(results)) {
        setRows((rs) => {
          const pendingKeys = pendingRows.map((v) => v.key);
          return rs.map((r) => {
            const idx = pendingKeys.indexOf(r.key);
            if (idx < 0) return r;
            const res = results.find((x) => x.index === idx);
            if (!res) return r;
            return {
              ...r,
              status: res.status,
              magic_link: res.magic_link,
              email_queued: res.email_queued,
              message: res.message,
              nsa_candidates: res.nsa_candidates ?? r.nsa_candidates,
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
            <Button
              size="sm"
              variant="secondary"
              onClick={applyPaste}
              disabled={!pasteText.trim()}
              title="Paste rows above (tab, comma, or 2+ spaces separated) or enter information directly in the table below"
            >
              <ArrowDown className="w-3 h-3 mr-1" /> Add pasted rows
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
                    <td className="p-1"><Input value={r.first_name} onChange={(e) => updateEditableRow(r.key, { first_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.last_name} onChange={(e) => updateEditableRow(r.key, { last_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.email} onChange={(e) => updateEditableRow(r.key, { email: e.target.value.toLowerCase() })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.phone} onChange={(e) => updateEditableRow(r.key, { phone: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1">
                      <Select value={r.gender} onValueChange={(v) => updateEditableRow(r.key, { gender: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Men">Men</SelectItem>
                          <SelectItem value="Ladies">Ladies</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1"><Input value={r.home_club_name} onChange={(e) => updateEditableRow(r.key, { home_club_name: e.target.value })} className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={r.division} onChange={(e) => updateEditableRow(r.key, { division: e.target.value })} className="h-8 text-xs" /></td>
                    {isDoubles && (
                      <td className="p-1"><Input value={r.partner_name} onChange={(e) => updateEditableRow(r.key, { partner_name: e.target.value })} className="h-8 text-xs" /></td>
                    )}
                    <td className="p-1">
                      {r.status && r.status !== "skipped" ? (
                        <div className="space-y-0.5">
                          <Badge variant="secondary" className={STATUS_LABELS[r.status].className}>{STATUS_LABELS[r.status].label}</Badge>
                          {r.nsa_home_club_name && r.nsa_number && (
                            <div className="text-[10px] text-emerald-700">
                              Registered at {r.nsa_home_club_name} · {r.nsa_number}
                            </div>
                          )}
                          {r.message && <div className="text-[10px] text-red-700">{r.message}</div>}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {r.status === "skipped" ? (
                            <Badge variant="secondary" className={STATUS_LABELS.skipped.className}>Awaiting NSA decision</Badge>
                          ) : r.hint ? (
                            <Badge variant="secondary" className={HINT_LABELS[r.hint].className}>{HINT_LABELS[r.hint].label}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {!r.nsa_home_club_id && !r.nsa_ignored && r.nsa_candidates && r.nsa_candidates.length > 0 && (
                            <div className="rounded border border-sky-200 bg-sky-50 p-1.5 space-y-1">
                              <div className="text-[10px] font-medium text-sky-900">
                                Possible NSA match{r.nsa_candidates.length > 1 ? "es" : ""}:
                              </div>
                              {r.nsa_candidates.map((c) => (
                                <div key={c.club_member_id} className="flex items-center justify-between gap-1">
                                  <div className="text-[10px] text-sky-900">
                                    <span className="font-medium">{c.full_name}</span> · {c.nsa_number} · {c.club_name}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-5 px-1.5 text-[10px]"
                                    onClick={() =>
                                      updateRow(r.key, {
                                        nsa_home_club_id: c.club_id,
                                        nsa_number: c.nsa_number,
                                        nsa_home_club_name: c.club_name,
                                        home_club_name: r.home_club_name || c.club_name,
                                      })
                                    }
                                  >
                                    Confirm
                                  </Button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="text-[10px] text-sky-700 underline"
                                onClick={() => updateRow(r.key, { nsa_ignored: true })}
                              >
                                Not the same person — just add as visitor
                              </button>
                            </div>
                          )}
                          {r.nsa_home_club_id && r.nsa_home_club_name && (
                            <div className="flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-1">
                              <div className="text-[10px] text-emerald-900 flex-1">
                                Will register at <span className="font-medium">{r.nsa_home_club_name}</span> · {r.nsa_number}
                              </div>
                              <button
                                type="button"
                                className="text-[10px] text-emerald-700 underline"
                                onClick={() =>
                                  updateRow(r.key, { nsa_home_club_id: null, nsa_number: null, nsa_home_club_name: null })
                                }
                              >
                                Undo
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-1">
                      <div className="flex gap-0.5 justify-end">
                        {(r.status === "created" || r.status === "linked_visitor") && whatsappUrl(r) ? (
                          <a href={whatsappUrl(r)!} target="_blank" rel="noopener noreferrer" title="Send WhatsApp with magic-link">
                            <Button size="icon" variant="ghost" className="h-7 w-7"><MessageCircle className="w-3.5 h-3.5 text-emerald-600" /></Button>
                          </a>
                        ) : null}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(r.key)} title="Remove row from this list (will not delete the visitor)">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 items-center">
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}>
              <Plus className="w-3 h-3 mr-1" /> Add row
            </Button>
            {done && (
              <Button size="sm" variant="outline" onClick={copyCsv}>
                <Copy className="w-3 h-3 mr-1" /> Copy results CSV
              </Button>
            )}
            {pendingRows.length > 0 && (
              <Button
                size="sm"
                onClick={runPreview}
                disabled={previewing || pendingRows.length === 0}
                className="ml-auto bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 hover:from-fuchsia-600 hover:via-purple-600 hover:to-indigo-600 text-white shadow-md shadow-purple-500/30 border-0"
              >
                {previewing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Check matches ({pendingRows.length})
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{done && pendingRows.length === 0 ? "Close" : "Cancel"}</Button>
          {pendingRows.length > 0 && (
            <Button onClick={runImport} disabled={importing || pendingRows.length === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import & email ({pendingRows.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
