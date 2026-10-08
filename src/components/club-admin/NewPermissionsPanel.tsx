import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;

/** Whether the club runs on the new detailed permissions (server decides). */
export function useNewPermissionsOn(clubId?: string) {
  return useQuery({
    queryKey: ["new-perms-on", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await rpc("club_new_perms_on", { _club_id: clubId });
      if (error) return false;
      return !!data;
    },
    staleTime: 60_000,
  });
}

interface Row { club_member_id: string; name: string; offices: string[]; roles: string[]; caps: string[]; grants: string[]; denies: string[] }
interface Cap { key: string; area: string; description: string | null }

const OFFICE_LABEL: Record<string, string> = {
  chairman: "Chairman", vice_chair: "Vice-Chair", secretary: "Secretary", treasurer: "Treasurer", club_captain: "Club Captain",
};

export function NewPermissionsPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const matrix = useQuery({
    queryKey: ["perm-matrix", clubId],
    queryFn: async () => {
      const { data, error } = await rpc("perm_club_matrix", { _club_id: clubId });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });
  const catalogue = useQuery({
    queryKey: ["cap-catalogue"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("capability_catalogue").select("key, area, description").order("key");
      if (error) throw error;
      return (data || []) as Cap[];
    },
  });
  const history = useQuery({
    queryKey: ["perm-events", clubId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("permission_events")
        .select("id, event_type, capability_key, target_member_id, created_at, detail")
        .eq("club_id", clubId).order("created_at", { ascending: false }).limit(30);
      return (data || []) as any[];
    },
  });

  const byArea = useMemo(() => {
    const m = new Map<string, Cap[]>();
    (catalogue.data || []).forEach((c) => m.set(c.area, [...(m.get(c.area) || []), c]));
    return [...m.entries()];
  }, [catalogue.data]);

  const names = useMemo(() => new Map((matrix.data || []).map((r) => [r.club_member_id, r.name])), [matrix.data]);

  async function change(row: Row, key: string, effect: "grant" | "deny" | "remove") {
    setBusy(key);
    const { error } = await rpc("perm_set_override", {
      _club_id: clubId, _member_id: row.club_member_id, _capability: key, _effect: effect, _reason: reason || null,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved and recorded in history");
    await qc.invalidateQueries({ queryKey: ["perm-matrix", clubId] });
    qc.invalidateQueries({ queryKey: ["perm-events", clubId] });
    const fresh = (qc.getQueryData(["perm-matrix", clubId]) as Row[] | undefined)?.find((r) => r.club_member_id === row.club_member_id);
    if (fresh) setOpen(fresh);
  }

  if (matrix.error) return <Card className="p-4 text-sm">Only the Chairman can view and change club permissions.</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4" /><h3 className="font-semibold">Offices &amp; detailed permissions</h3></div>
        <p className="text-sm text-muted-foreground mb-3">
          Each person's rights come from their office, their templates and personal changes. A personal deny always wins. Every change is recorded.
        </p>
        <div className="divide-y">
          {(matrix.data || []).map((r) => (
            <button key={r.club_member_id} onClick={() => { setReason(""); setOpen(r); }}
              className="w-full text-left py-2 flex flex-wrap items-center gap-2 hover:bg-muted/50 px-1 rounded">
              <span className="font-medium">{r.name}</span>
              {r.offices.map((o) => <Badge key={o}>{OFFICE_LABEL[o] || o}</Badge>)}
              {r.roles.map((o) => <Badge key={o} variant="secondary">{o}</Badge>)}
              <span className="ml-auto text-xs text-muted-foreground">{r.caps.length} permissions{r.denies.length ? ` · ${r.denies.length} denied` : ""}</span>
            </button>
          ))}
          {matrix.isLoading && <p className="text-sm py-2">Loading…</p>}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Permission history</h3>
        <ul className="text-sm space-y-1">
          {(history.data || []).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums">{new Date(e.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>{e.event_type.replace(/_/g, " ")}{e.capability_key ? ` · ${e.capability_key}` : ""}{e.target_member_id ? ` · ${names.get(e.target_member_id) || "member"}` : ""}</span>
            </li>
          ))}
          {!history.data?.length && <li className="text-muted-foreground">No changes yet.</li>}
        </ul>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>
          <Input placeholder="Reason for change (optional, recorded)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {open && byArea.map(([area, caps]) => (
            <div key={area} className="mt-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{area}</p>
              {caps.map((c) => {
                const has = open.caps.includes(c.key);
                const granted = open.grants.includes(c.key);
                const denied = open.denies.includes(c.key);
                return (
                  <div key={c.key} className="flex items-center gap-2 py-1 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{c.description || c.key}</p>
                      <p className="text-xs text-muted-foreground">{c.key}{granted ? " · personal grant" : ""}{denied ? " · denied" : ""}</p>
                    </div>
                    <Badge variant={has ? "default" : "outline"}>{has ? "Allowed" : "No"}</Badge>
                    {granted || denied ? (
                      <Button size="sm" variant="ghost" disabled={busy === c.key} onClick={() => change(open, c.key, "remove")}>Undo</Button>
                    ) : has ? (
                      <Button size="sm" variant="outline" disabled={busy === c.key} onClick={() => change(open, c.key, "deny")}>Deny</Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy === c.key} onClick={() => change(open, c.key, "grant")}>Grant</Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
