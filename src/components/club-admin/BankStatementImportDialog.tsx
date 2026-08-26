import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, AlertTriangle, FileText, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseDelimitedStatement,
  parseOfx,
  parseTextStatement,
  buildRows,
  detectDuplicate,
  suggestAccount,
  suggestMember,
  summarise,
  type ParsedBankRow,
  type ColumnMapping,
  type ParsedStatement,
  type DuplicateFlag,
} from "@/lib/finance/bank-statement";
import { extractPdfText, isPdfFile } from "@/lib/finance/pdf-statement";

interface AccountMeta {
  label: string;
  type: "BS" | "IS";
  category: "Asset" | "Liability" | "Income" | "Expense";
  normal: "Dr" | "Cr";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  accounts: Record<string, AccountMeta>;
}

type Draft = ParsedBankRow & {
  include: boolean;
  duplicate: DuplicateFlag;
  account: string;
  memberId: string | null;
};

const BANK_ACCOUNT = "bank_current";

export function BankStatementImportDialog({ open, onOpenChange, clubId, accounts }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [format_, setFormat] = useState<"csv" | "ofx" | "pdf">("csv");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openingBalance, setOpeningBalance] = useState("");
  const [postToLedger, setPostToLedger] = useState(true);
  const [busy, setBusy] = useState(false);

  /* existing imported transactions — duplicate detection */
  const { data: existing = [] } = useQuery({
    queryKey: ["club-bank-txns-existing", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bank_transactions")
        .select("fingerprint, txn_date, amount, description")
        .eq("club_id", clubId)
        .order("txn_date", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data || []) as Array<{ fingerprint: string; txn_date: string; amount: number; description: string }>;
    },
    enabled: open && !!clubId,
  });

  const { data: statements = [] } = useQuery({
    queryKey: ["club-bank-statements", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bank_statements")
        .select("id, file_name, period_start, period_end, row_count, created_at")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open && !!clubId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["club-members-lite", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, club_member_number")
        .eq("club_id", clubId)
        .limit(2000);
      if (error) throw error;
      return (data || []).map((m: any) => ({ id: m.id, name: m.name || "", member_number: m.club_member_number }));
    },
    enabled: open && !!clubId,
  });

  const isFirstStatement = statements.length === 0;

  const rebuild = (p: ParsedStatement, map: ColumnMapping) => {
    const rows = buildRows(p, map);
    setDrafts(hydrate(rows));
  };

  const hydrate = (rows: ParsedBankRow[]): Draft[] =>
    rows.map((r) => {
      const dup = detectDuplicate(r, existing);
      return {
        ...r,
        duplicate: dup,
        include: dup !== "exact",
        account: suggestAccount(r).account,
        memberId: suggestMember(r, members),
      };
    });

  const handleFile = async (file: File) => {
    setFileName(file.name);

    // ---- PDF: text layer first, OCR fallback for scanned statements ----
    if (isPdfFile(file)) {
      setParsed(null);
      setMapping(null);
      setFormat("pdf");
      setPdfBusy("Reading PDF…");
      try {
        const res = await extractPdfText(file, (pct, stage) =>
          setPdfBusy(stage === "ocr"
            ? `Scanned PDF — running OCR… ${Math.round(pct * 100)}%`
            : `Reading PDF… ${Math.round(pct * 100)}%`),
        );
        const rows = parseTextStatement(res.text);
        if (!rows.length) {
          return toast.error(
            res.source === "ocr"
              ? "Could not read any transactions from that scanned PDF. Try a clearer scan or a CSV export."
              : "No transactions found in that PDF.",
          );
        }
        setDrafts(hydrate(rows));
        toast.success(
          `${rows.length} transactions read from PDF${res.source === "ocr" ? " (OCR)" : ""} — please review before posting`,
        );
      } catch (e: any) {
        toast.error(e?.message || "Failed to read that PDF");
      } finally {
        setPdfBusy(null);
      }
      return;
    }

    const text = await file.text();
    const isOfx = /\.(ofx|qfx|qif)$/i.test(file.name) || /<STMTTRN>/i.test(text);
    if (isOfx) {
      setFormat("ofx");
      setParsed(null);
      setMapping(null);
      const rows = parseOfx(text);
      if (!rows.length) return toast.error("No transactions found in that file");
      setDrafts(hydrate(rows));
    } else {
      setFormat("csv");
      const p = parseDelimitedStatement(text);
      if (!p.rows.length) return toast.error("No data rows found in that file");
      setParsed(p);
      setMapping(p.mapping);
      rebuild(p, p.mapping);
    }
  };


  const stats = useMemo(() => summarise(drafts.filter((d) => d.include)), [drafts]);
  const dupCount = drafts.filter((d) => d.duplicate !== "none").length;

  const setMap = (key: keyof ColumnMapping, value: string) => {
    if (!parsed || !mapping) return;
    const next = { ...mapping, [key]: value === "none" ? null : Number(value) } as ColumnMapping;
    setMapping(next);
    rebuild(parsed, next);
  };

  const reset = () => {
    setParsed(null);
    setMapping(null);
    setDrafts([]);
    setFileName("");
    setOpeningBalance("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const money = (n: number) => `R ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleImport = async () => {
    const selected = drafts.filter((d) => d.include);
    if (!selected.length) return toast.error("Nothing selected to import");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const summary = summarise(selected);
      const opening = openingBalance.trim() !== "" ? Number(openingBalance) : summary.opening_balance;

      const { data: stmt, error: stmtErr } = await fromExt("club_bank_statements")
        .insert({
          club_id: clubId,
          file_name: fileName || "statement",
          source_format: format_,
          account: BANK_ACCOUNT,
          period_start: summary.period_start,
          period_end: summary.period_end,
          opening_balance: opening ?? null,
          closing_balance: summary.closing_balance,
          is_first_statement: isFirstStatement,
          row_count: selected.length,
          imported_by: auth?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (stmtErr) throw stmtErr;

      const journalRows: any[] = [];
      const txnRows = selected.map((d) => {
        const journal_ref = postToLedger ? crypto.randomUUID() : null;
        if (journal_ref) {
          const created_at = new Date(`${d.txn_date}T12:00:00`).toISOString();
          const amt = Math.abs(d.amount);
          const desc = d.description || "Bank transaction";
          const bankLine = {
            club_id: clubId,
            journal_ref,
            created_at,
            account: BANK_ACCOUNT,
            debit: d.amount > 0 ? amt : 0,
            credit: d.amount < 0 ? amt : 0,
            description: desc,
            club_member_id: d.memberId,
          };
          const contraLine = {
            club_id: clubId,
            journal_ref,
            created_at,
            account: d.account,
            debit: d.amount < 0 ? amt : 0,
            credit: d.amount > 0 ? amt : 0,
            description: desc,
            club_member_id: d.memberId,
          };
          journalRows.push(bankLine, contraLine);
        }
        return {
          club_id: clubId,
          statement_id: stmt.id,
          txn_date: d.txn_date,
          description: d.description,
          reference: d.reference,
          amount: d.amount,
          balance: d.balance,
          fingerprint: d.fingerprint,
          status: postToLedger ? "posted" : "unmatched",
          matched_account: d.account,
          matched_member_id: d.memberId,
          journal_ref,
        };
      });

      const { error: txErr } = await fromExt("club_bank_transactions").insert(txnRows);
      if (txErr) throw txErr;

      if (journalRows.length) {
        const { error: jErr } = await fromExt("club_journal_entries").insert(journalRows);
        if (jErr) throw jErr;
      }

      // First statement → seed the bank opening balance against Opening Balance Equity
      if (isFirstStatement && opening != null && Number(opening) !== 0 && summary.period_start) {
        const ref = crypto.randomUUID();
        const created_at = new Date(`${summary.period_start}T00:00:00`).toISOString();
        const v = Number(opening);
        const { error: obErr } = await fromExt("club_journal_entries").insert([
          {
            club_id: clubId, journal_ref: ref, created_at, account: BANK_ACCOUNT,
            debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0,
            description: "Opening balance: Current Account (bank statement import)",
          },
          {
            club_id: clubId, journal_ref: ref, created_at, account: "opening_balance_equity",
            debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0,
            description: "Opening balances – balancing entry",
          },
        ]);
        if (obErr) throw obErr;
      }

      toast.success(
        `Imported ${txnRows.length} transaction${txnRows.length === 1 ? "" : "s"}${postToLedger ? " and posted to the ledger" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
      qc.invalidateQueries({ queryKey: ["club-bank-txns-existing", clubId] });
      qc.invalidateQueries({ queryKey: ["club-bank-statements", clubId] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const accountOptions = useMemo(
    () =>
      Object.entries(accounts)
        .filter(([code]) => code !== BANK_ACCOUNT)
        .map(([code, meta]) => ({ code, label: meta.label, category: meta.category })),
    [accounts],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" /> Import Bank Statement
          </DialogTitle>
          <DialogDescription>
            Upload a PDF, CSV, OFX or QIF statement. PDFs are read directly, and scanned/image-only PDFs are
            processed with OCR. Duplicate lines already imported are detected automatically (same amount and
            narrative within 7 days), and each transaction can be allocated to an account and member before
            posting to the ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv,.txt,.tsv,.ofx,.qfx,.qif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button size="sm" variant="outline" className="gap-1.5 h-8" disabled={!!pdfBusy} onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Choose statement file
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> {fileName}
              </span>
            )}
            {pdfBusy && (
              <span className="text-xs text-primary flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                {pdfBusy}
              </span>
            )}
            {format_ === "pdf" && !pdfBusy && drafts.length > 0 && (
              <Badge variant="outline" className="text-[10px]">Read from PDF — check dates and amounts</Badge>
            )}
            {isFirstStatement && (
              <Badge variant="outline" className="text-[10px]">First statement — opening balance will be seeded</Badge>
            )}
          </div>

          {parsed && mapping && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded border p-2 bg-muted/30">
              {([
                ["date", "Date"],
                ["description", "Description"],
                ["reference", "Reference"],
                ["amount", "Amount"],
                ["debit", "Debit"],
                ["credit", "Credit"],
                ["balance", "Balance"],
              ] as Array<[keyof ColumnMapping, string]>).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
                  <Select
                    value={mapping[key] === null || mapping[key] === undefined ? "none" : String(mapping[key])}
                    onValueChange={(v) => setMap(key, v)}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {parsed.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-muted/50 px-3 py-2 rounded">
                <div className="flex gap-4 flex-wrap">
                  <span>{stats.count} selected of {drafts.length}</span>
                  <span>In: <strong className="tabular-nums text-emerald-600">{money(stats.money_in)}</strong></span>
                  <span>Out: <strong className="tabular-nums text-destructive">{money(Math.abs(stats.money_out))}</strong></span>
                  {stats.period_start && <span>{stats.period_start} → {stats.period_end}</span>}
                  {dupCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" /> {dupCount} possible duplicate{dupCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isFirstStatement && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] whitespace-nowrap">Opening balance</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={stats.opening_balance != null ? stats.opening_balance.toFixed(2) : "0.00"}
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        className="h-7 w-28 text-xs text-right tabular-nums"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={postToLedger} onCheckedChange={(v) => setPostToLedger(!!v)} />
                    <span>Post to ledger</span>
                  </label>
                </div>
              </div>

              <ScrollArea className="h-[380px] rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr className="text-left text-[10px] uppercase text-muted-foreground">
                      <th className="p-2 w-8"></th>
                      <th className="p-2 w-24">Date</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 w-28 text-right">Amount</th>
                      <th className="p-2 w-44">Allocate to</th>
                      <th className="p-2 w-44">Member</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {drafts.map((d, i) => (
                      <tr key={`${d.fingerprint}-${i}`} className={cn(d.duplicate !== "none" && "bg-amber-500/5", !d.include && "opacity-50")}>
                        <td className="p-2 align-middle">
                          <Checkbox
                            checked={d.include}
                            onCheckedChange={(v) => setDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, include: !!v } : p)))}
                          />
                        </td>
                        <td className="p-2 tabular-nums whitespace-nowrap">{d.txn_date}</td>
                        <td className="p-2">
                          <span className="line-clamp-1">{d.description}</span>
                          {d.duplicate !== "none" && (
                            <Badge variant="outline" className="text-[9px] mt-0.5 border-amber-500/50 text-amber-600">
                              {d.duplicate === "exact" ? "Already imported" : "Possible duplicate"}
                            </Badge>
                          )}
                        </td>
                        <td className={cn("p-2 text-right tabular-nums whitespace-nowrap", d.amount < 0 ? "text-destructive" : "text-emerald-600")}>
                          {money(d.amount)}
                        </td>
                        <td className="p-2">
                          <Select
                            value={d.account}
                            onValueChange={(v) => setDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, account: v } : p)))}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {accountOptions.map((a) => (
                                <SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select
                            value={d.memberId ?? "none"}
                            onValueChange={(v) =>
                              setDrafts((prev) => prev.map((p, idx) => (idx === i ? { ...p, memberId: v === "none" ? null : v } : p)))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value="none">—</SelectItem>
                              {members.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
          <Button onClick={handleImport} disabled={busy || !drafts.some((d) => d.include)}>
            {busy ? "Importing…" : `Import ${drafts.filter((d) => d.include).length || ""} transactions`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
