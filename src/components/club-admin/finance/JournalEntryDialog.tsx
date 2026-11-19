import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { compareLabel } from "@/lib/finance/sort-label";
import { SearchableAccountPicker, type AccountOptionGroup } from "./SearchableAccountPicker";
import { MemberSearchPicker, type PickedMember } from "@/components/finance/MemberSearchPicker";
import {
  applyTemplateAmount, blankLine, journalPayload, journalProblems, journalTotals, memberWorkTemplate, needsMember,
  type CustomAccountLike, type JournalDraftLine,
} from "@/lib/finance/manual-journal";

type AccountMeta = { label: string; category: string };
type CustomAccount = CustomAccountLike & { name: string; is_active: boolean };

const CATEGORY_ORDER = ["Asset", "Liability", "Income", "Expense"] as const;
const CATEGORY_HEADING: Record<string, string> = { Asset: "Assets", Liability: "Liabilities & equity", Income: "Income", Expense: "Expenses" };
// Legacy enum values without their own place in the chart are not offered.
const HIDDEN = new Set(["bank"]);

/**
 * Finance > Journal entry: a balanced debit/credit journal across any accounts, with a member on
 * Accounts Receivable / Member Credits lines. Posting goes only through `admin_post_journal`.
 */
export function JournalEntryDialog({ clubId, open, onOpenChange, accounts, customAccounts, money }: {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Record<string, AccountMeta>;
  customAccounts: CustomAccount[];
  money: (n: number) => string;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"work" | "journal">("work");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<JournalDraftLine[]>(() => [blankLine(), blankLine()]);
  const [members, setMembers] = useState<Record<string, PickedMember | null>>({});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  // "Member did work" quick form
  const [workMember, setWorkMember] = useState<PickedMember | null>(null);
  const [workAccount, setWorkAccount] = useState("maintenance");
  const [workAmount, setWorkAmount] = useState("");

  const active = useMemo(() => customAccounts.filter((a) => a.is_active), [customAccounts]);

  const reset = () => {
    setMode("work"); setDate(format(new Date(), "yyyy-MM-dd")); setReference(""); setReason("");
    setLines([blankLine(), blankLine()]); setMembers({}); setRequestId(crypto.randomUUID());
    setWorkMember(null); setWorkAccount("maintenance"); setWorkAmount("");
  };
  useEffect(() => { if (open) reset(); /* fresh form each time */ }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The quick form always produces the two template lines.
  const workLines = useMemo(() => {
    const [exp, ar] = applyTemplateAmount(memberWorkTemplate(workAccount), workAmount.trim());
    return [{ ...exp, key: "w1" }, { ...ar, key: "w2", memberId: workMember?.id ?? "" }];
  }, [workAccount, workAmount, workMember]);
  const effective = mode === "work" ? workLines : lines;

  const groups: AccountOptionGroup[] = useMemo(() => {
    const out: AccountOptionGroup[] = CATEGORY_ORDER.map((cat) => ({
      heading: CATEGORY_HEADING[cat],
      options: Object.entries(accounts)
        .filter(([k, m]) => m.category === cat && !HIDDEN.has(k))
        .map(([k, m]) => ({ value: k, label: m.label }))
        .sort((a, b) => compareLabel(a.label, b.label)),
    }));
    if (active.length) {
      out.push({
        heading: "Club accounts",
        options: active.map((a) => ({ value: `custom:${a.id}`, label: `${a.name} (${a.category})` })).sort((a, b) => compareLabel(a.label, b.label)),
      });
    }
    return out;
  }, [accounts, active]);
  const expenseGroups = useMemo(() => groups.filter((g) => g.heading === "Expenses" || g.heading === "Club accounts")
    .map((g) => g.heading === "Club accounts" ? { ...g, options: g.options.filter((o) => o.label.endsWith("(Expense)")) } : g), [groups]);

  const totals = journalTotals(effective);
  const problems = journalProblems(effective, active, reason);
  const update = (key: string, patch: Partial<JournalDraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const switchToLines = () => {
    // Carry the quick form into editable lines.
    setLines(workLines.map((l) => blankLine({ account: l.account, debit: l.debit, credit: l.credit, memberId: l.memberId })));
    if (workMember) setMembers({ [workMember.id]: workMember });
    setMode("journal");
  };

  const save = async () => {
    if (problems.length) { toast.error(problems[0]); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("admin_post_journal", {
        _club_id: clubId, _date: date, _reference: reference.trim() || null, _reason: reason.trim(),
        _lines: journalPayload(effective, active), _request_id: requestId,
      });
      if (error) throw error;
      toast.success("Journal posted");
      ["club-journal-entries", "club-member-fee-payments", "member-journal-entries", "member-account-balance"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not post the journal");
    } finally {
      setSaving(false);
    }
  };

  const label = (v: string) => groups.flatMap((g) => g.options).find((o) => o.value === v)?.label ?? v;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Journal entry</DialogTitle>
          <DialogDescription className="text-xs">
            A balanced debit/credit entry between ledger accounts. No bank or cash moves unless you choose a bank or cash account on a line.
            Mistakes are fixed with Reverse, never by editing.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => (v === "journal" && mode === "work" ? switchToLines() : setMode(v as any))}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="work" className="text-xs">Member did work for the club</TabsTrigger>
            <TabsTrigger value="journal" className="text-xs">General journal</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. invoice or job number" className="h-9 text-xs" maxLength={100} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="text-xs"
            placeholder={mode === "work" ? "e.g. Repaired court 2 door — labour and materials" : "Why this journal is needed"} />
        </div>

        {mode === "work" ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground">
              The work is recorded as a club expense and the amount is credited to the member's account — they owe less, or go into credit.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Member</Label>
                <MemberSearchPicker clubId={clubId} value={workMember} onChange={setWorkMember} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input inputMode="decimal" value={workAmount} onChange={(e) => setWorkAmount(e.target.value)} placeholder="0.00" className="h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expense account</Label>
              <SearchableAccountPicker value={workAccount} onChange={setWorkAccount} groups={expenseGroups} />
            </div>
            <div className="rounded-md bg-muted/40 p-2 text-[11px] space-y-0.5">
              <div className="flex justify-between"><span>Debit {label(workAccount)}</span><span className="tabular-nums">{workAmount || "0.00"}</span></div>
              <div className="flex justify-between"><span>Credit Accounts Receivable{workMember ? ` — ${workMember.name}` : ""}</span><span className="tabular-nums">{workAmount || "0.00"}</span></div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l, i) => {
              const memberLine = !!l.account && needsMember(l.account, active);
              return (
                <div key={l.key} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">Line {i + 1}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={lines.length <= 2}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px]">
                    <SearchableAccountPicker value={l.account} onChange={(v) => update(l.key, { account: v })} groups={groups} />
                    <Input inputMode="decimal" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                      placeholder="Debit" className="h-9 text-xs" aria-label={`Line ${i + 1} debit`} />
                    <Input inputMode="decimal" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                      placeholder="Credit" className="h-9 text-xs" aria-label={`Line ${i + 1} credit`} />
                  </div>
                  {memberLine && (
                    <MemberSearchPicker clubId={clubId} value={members[l.memberId] ?? null}
                      onChange={(m) => { update(l.key, { memberId: m?.id ?? "" }); if (m) setMembers((s) => ({ ...s, [m.id]: m })); }}
                      placeholder="Member for this line — search name or number…" />
                  )}
                  <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })}
                    placeholder="Line description (optional — shows on the member's statement)" className="h-8 text-xs" />
                </div>
              );
            })}
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add line
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
          <span>Debits <b className="tabular-nums">{money(totals.debit)}</b></span>
          <span>Credits <b className="tabular-nums">{money(totals.credit)}</b></span>
          <span className={cn("font-semibold", totals.balanced ? "text-primary" : "text-destructive")}>
            {totals.balanced ? "Balanced" : `Difference ${money(Math.abs(totals.difference))}`}
          </span>
        </div>
        {problems.length > 0 && totals.debit + totals.credit > 0 && (
          <p className="text-[11px] text-muted-foreground">{problems[0]}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || problems.length > 0}>{saving ? "Posting…" : "Post journal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
