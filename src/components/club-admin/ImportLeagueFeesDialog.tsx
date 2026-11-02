import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { matchFeeRows, type FeeRow, type MemberRef } from "@/lib/finance/leagueFeeImport";

interface Props { clubId: string; open: boolean; onClose: () => void; onDone: () => void }

export function ImportLeagueFeesDialog({ clubId, open, onClose, onDone }: Props) {
  const [assocId, setAssocId] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [due, setDue] = useState(`${new Date().getFullYear()}-12-01`);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: assocs = [] } = useQuery({
    queryKey: ["import-league-assocs", clubId],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any).from("league_associations")
        .select("id, name, abbreviation").eq("club_id", clubId).eq("scope", "region").order("name");
      return (data || []) as any[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["import-league-members", clubId, assocId],
    enabled: open && !!assocId,
    queryFn: async () => {
      const { data: cms } = await supabase.from("club_members").select("id, name, club_member_number").eq("club_id", clubId).limit(5000);
      const { data: aff } = await (supabase as any).from("member_association_affiliations")
        .select("club_member_id, league_association_number").eq("association_id", assocId);
      const nums = new Map<string, string>();
      (aff || []).forEach((a: any) => a.league_association_number && nums.set(a.club_member_id, String(a.league_association_number)));
      return (cms || []).map((m: any) => ({ id: m.id, name: m.name || "", memberNumber: m.club_member_number, leagueNumber: nums.get(m.id) ?? null })) as MemberRef[];
    },
  });

  const onFile = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    setRows(matchFeeRows(raw, members));
  };

  const matched = rows.filter(r => r.memberId && r.amount > 0);

  const submit = async () => {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("import_league_fee_invoices", {
        p_club_id: clubId, p_association_id: assocId, p_season: Number(season), p_due: due,
        p_rows: matched.map(r => ({ member_id: r.memberId, amount: r.amount })),
      });
      if (error) throw error;
      const d = data as any;
      toast.success(`${d.created} created, ${d.updated} updated, ${d.already_sent} already sent/paid`);
      setRows([]); onDone(); onClose();
    } catch (e: any) { toast.error(e.message || "Import failed"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import league fees</DialogTitle>
          <DialogDescription>Upload a spreadsheet with a member name or league number and an amount. Invoices are created unsent for review.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">League</Label>
            <Select value={assocId} onValueChange={(v) => { setAssocId(v); setRows([]); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{assocs.map(a => <SelectItem key={a.id} value={a.id}>{a.abbreviation || a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Season</Label><Input className="h-8 text-xs" value={season} onChange={e => setSeason(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Due date</Label><Input type="date" className="h-8 text-xs" value={due} onChange={e => setDue(e.target.value)} /></div>
        </div>
        <Input type="file" accept=".xlsx,.xls,.csv" disabled={!assocId} className="h-8 text-xs"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto border rounded text-xs">
            <p className="p-2 text-muted-foreground">{matched.length} of {rows.length} rows matched · R {matched.reduce((s, r) => s + r.amount, 0).toFixed(2)}</p>
            {rows.filter(r => !r.memberId || r.amount <= 0).map((r, i) => (
              <div key={i} className="px-2 py-1 border-t text-destructive">Not matched: {r.label || "(blank)"} {r.amount ? `R ${r.amount}` : ""}</div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!matched.length || busy} onClick={submit}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Create {matched.length} invoices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
