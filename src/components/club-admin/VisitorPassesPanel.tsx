import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Ticket, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useClubCurrency } from "@/hooks/use-currency";
import { useClubVisitorPasses, useDecideVisitorPass, useVisitorPassOptions } from "@/hooks/use-visitor-pass";
import { VISITOR_PASS_LABEL, isFreePass, visitorPassStatusLabel, type VisitorPassKind } from "@/lib/visitor-pass";

/**
 * Club admin view of independent visitor passes: what each pass costs (read
 * only — prices are owned by Fee Structure), the approval rule, and the list
 * of active / pending / expired passes with approve and reject actions.
 */
export function VisitorPassesPanel({ clubId, requiresApproval }: { clubId: string; requiresApproval: boolean }) {
  const { format: money } = useClubCurrency();
  const qc = useQueryClient();
  const { data: options = [] } = useVisitorPassOptions(clubId);
  const { data: passes = [], isLoading } = useClubVisitorPasses(clubId);
  const decide = useDecideVisitorPass();
  const [savingRule, setSavingRule] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setApprovalRule = async (v: boolean) => {
    setSavingRule(true);
    try {
      const { error } = await (supabase.from("clubs") as any)
        .update({ visitor_pass_requires_approval: v })
        .eq("id", clubId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["my-club"] });
      toast.success(v ? "Visitor passes now need your approval" : "Visitor passes activate automatically once paid");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingRule(false);
    }
  };

  const act = async (passId: string, approve: boolean) => {
    setBusyId(passId);
    try {
      await decide.mutateAsync({ passId, approve });
      toast.success(approve ? "Pass approved" : "Pass rejected — the charge was reversed on the ledger");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-3 md:p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-primary" />
          Visitor passes
        </h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          A visitor in town buys a pass to book courts themselves. Prices are set with your other fees under Fees &rarr;
          Fee Structure — switch a pass on there to offer it (a switched-on pass at 0 is a free pass).
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {(["day", "three_day", "month"] as VisitorPassKind[]).map((k) => {
          const o = options.find((x) => x.kind === k);
          return (
            <div key={k} className="rounded-md border p-2.5">
              <div className="text-xs font-semibold">{VISITOR_PASS_LABEL[k]}</div>
              <div className="text-sm font-bold">
                {!o || !o.active ? "Not offered" : isFreePass(o) ? "Free" : money(o.amount)}
              </div>
              <div className="text-[10px] text-muted-foreground">Set under Fees &rarr; Fee Structure</div>
            </div>
          );
        })}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md border bg-card p-2.5 cursor-pointer">
        <div className="min-w-0">
          <div className="text-xs font-semibold">Require admin approval for visitor passes</div>
          <div className="text-[10px] text-muted-foreground">
            Off: a paid (or free) pass starts immediately. On: you approve each one before the visitor can book.
          </div>
        </div>
        <Switch checked={requiresApproval} disabled={savingRule} onCheckedChange={setApprovalRule} />
      </label>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : passes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No visitor passes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Visitor</TableHead>
                <TableHead className="text-xs">Pass</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Valid until</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passes.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{p.club_members?.name || "Visitor"}</TableCell>
                  <TableCell className="text-xs">{VISITOR_PASS_LABEL[p.pass_kind as VisitorPassKind]}</TableCell>
                  <TableCell className="text-xs">{Number(p.amount || 0) > 0 ? money(Number(p.amount)) : "Free"}</TableCell>
                  <TableCell className="text-xs">
                    {p.valid_until ? new Date(p.valid_until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {visitorPassStatusLabel(p)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === "pending_approval" && (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" className="h-7 text-[11px]" disabled={busyId === p.id} onClick={() => act(p.id, true)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busyId === p.id} onClick={() => act(p.id, false)}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
