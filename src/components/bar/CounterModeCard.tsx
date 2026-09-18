/**
 * Counter mode setup — lets a club admin / bar-permission user manage the short
 * staff PINs that unlock a bar tablet from the menu QR code (no login needed).
 * Each person behind the bar gets their own named PIN (up to 10), so the club
 * can see who served which tab.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Store, Loader2, Plus, Trash2, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

const MAX_OPERATORS = 10;

interface Operator {
  id: string;
  label: string;
  updated_at: string;
  unlocked: number;
}

export function CounterModeCard({ clubId }: { clubId?: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPin, setEditPin] = useState("");

  const { data: operators = [], refetch } = useQuery({
    queryKey: ["bar-counter-operators", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_counter_operators", { _club_id: clubId } as any);
      if (error) throw error;
      return (data ?? []) as unknown as Operator[];
    },
  });

  const unlockedTotal = operators.reduce((s, o) => s + Number(o.unlocked || 0), 0);

  async function addOperator() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("bar_counter_set_pin", {
        _club_id: clubId, _pin: newPin, _label: newName.trim(), _device_id: null,
      } as any);
      if (error) throw error;
      setNewName("");
      setNewPin("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["bar-counter-status"] });
      toast.success("Counter PIN added");
    } catch (e: any) {
      toast.error(e.message ?? "Could not add that counter PIN");
    } finally {
      setSaving(false);
    }
  }

  async function changePin(op: Operator) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("bar_counter_set_pin", {
        _club_id: clubId, _pin: editPin, _label: op.label, _device_id: op.id,
      } as any);
      if (error) throw error;
      setEditing(null);
      setEditPin("");
      await refetch();
      toast.success(`${op.label}'s PIN changed — their devices were signed out`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not change that PIN");
    } finally {
      setSaving(false);
    }
  }

  async function removeOperator(op: Operator) {
    try {
      const { error } = await supabase.rpc("bar_counter_remove_operator", {
        _club_id: clubId, _device_id: op.id,
      } as any);
      if (error) throw error;
      await refetch();
      toast.success(`${op.label} removed`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not remove that person");
    }
  }

  async function revokeAll() {
    try {
      const { error } = await supabase.rpc("bar_counter_revoke_devices", { _club_id: clubId } as any);
      if (error) throw error;
      await refetch();
      toast.success("All counter devices signed out");
    } catch (e: any) {
      toast.error(e.message ?? "Could not sign devices out");
    }
  }

  if (!clubId) return null;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Store className="w-4 h-4" /> Counter mode (no login)
        </div>
        <Badge variant="secondary" className="text-[11px]">
          {unlockedTotal} device{unlockedTotal === 1 ? "" : "s"} unlocked
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Give each person who works the bar their own PIN (up to {MAX_OPERATORS}). They scan the club menu QR code,
        open “Counter mode” and enter their PIN — no SquashHub login needed — and every tab they open is recorded
        against their name. Charging a member's account still needs that member's own Bar PIN.
      </p>

      {operators.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No counter PINs yet.</p>
      ) : (
        <div className="space-y-1.5">
          {operators.map((op) => (
            <div key={op.id} className="border rounded-md p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{op.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    PIN set {new Date(op.updated_at).toLocaleDateString()}
                    {op.unlocked > 0 ? ` · ${op.unlocked} device${op.unlocked === 1 ? "" : "s"} unlocked` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="ghost" className="h-8 gap-1 text-[11px]"
                    onClick={() => { setEditing(editing === op.id ? null : op.id); setEditPin(""); }}
                  >
                    <KeyRound className="w-3.5 h-3.5" /> New PIN
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeOperator(op)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {editing === op.id && (
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric" value={editPin} maxLength={8} autoFocus
                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                    className="h-9 tracking-widest" placeholder="New PIN (4–8 digits)"
                  />
                  <Button size="sm" className="h-9" disabled={editPin.length < 4 || saving} onClick={() => changePin(op)}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {operators.length < MAX_OPERATORS && (
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Name</Label>
              <Input
                value={newName} maxLength={40}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10" placeholder="e.g. Pete"
              />
            </div>
            <div>
              <Label className="text-[11px]">PIN (4–8 digits)</Label>
              <Input
                inputMode="numeric" value={newPin} maxLength={8}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                className="h-10 tracking-widest" placeholder="••••"
              />
            </div>
          </div>
          <Button className="h-10 gap-1" disabled={!newName.trim() || newPin.length < 4 || saving} onClick={addOperator}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add</>}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => navigate("/bar/counter")}>
          Open counter mode
        </Button>
        {unlockedTotal > 0 && (
          <Button variant="outline" size="sm" onClick={revokeAll}>
            Sign out all counter devices
          </Button>
        )}
      </div>
    </Card>
  );
}
