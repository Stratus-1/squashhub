import { useState } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function CourtsTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();

  const [lightsForm, setLightsForm] = useState({
    light_fee_per_hour: club.light_fee_per_hour ?? 0,
    shelly_auth_key: club.shelly_auth_key || "",
  });

  const handleSaveLights = async () => {
    try {
      await updateClub.mutateAsync({
        id: club.id,
        light_fee_per_hour: lightsForm.light_fee_per_hour,
        shelly_auth_key: lightsForm.shelly_auth_key || null,
      });
      toast.success("Court light settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <CourtsSection clubId={clubId} />

      {/* Court Lights */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Court Lights</h3>
        <p className="text-sm text-muted-foreground">Configure automatic court light control via Shelly smart relays.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Light Fee per Hour (R)</Label>
            <Input
              type="number" min={0} step={0.01}
              value={lightsForm.light_fee_per_hour}
              onChange={e => setLightsForm(p => ({ ...p, light_fee_per_hour: parseInt(e.target.value) || 0 }))}
              placeholder="e.g. 50"
            />
          </div>
          <div className="flex items-end">
            <p className="text-sm text-muted-foreground pb-2">
              {lightsForm.light_fee_per_hour > 0
                ? <>Members will be charged <span className="font-semibold text-foreground">R{lightsForm.light_fee_per_hour}</span>/hour when lights are enabled.</>
                : "No light fee configured — lights are free."}
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Shelly Cloud Auth Key</Label>
            <Input
              type="password"
              value={lightsForm.shelly_auth_key}
              onChange={e => setLightsForm(p => ({ ...p, shelly_auth_key: e.target.value }))}
              placeholder="Paste your Shelly Cloud auth key"
            />
            <p className="text-xs text-muted-foreground">
              Find this in <a href="https://control.shelly.cloud" target="_blank" rel="noopener noreferrer" className="underline text-primary">Shelly Cloud</a> → Settings → Authorization Cloud Key.
            </p>
          </div>
        </div>
        <Button onClick={handleSaveLights} disabled={updateClub.isPending} className="w-full md:w-auto">
          {updateClub.isPending ? "Saving..." : "Save Light Settings"}
        </Button>
      </Card>
    </div>
  );
}

function CourtsSection({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [newCourt, setNewCourt] = useState("");
  const [editingRelay, setEditingRelay] = useState<Record<number, string>>({});

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string; relay_device_id: string | null; relay_server: string | null }[];
    },
  });

  const handleAdd = async () => {
    if (!newCourt.trim()) return;
    const { error } = await fromExt("courts").insert({ name: newCourt.trim(), club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Court added"); setNewCourt(""); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this court?")) return;
    const { error } = await fromExt("courts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Court removed"); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleSaveRelay = async (courtId: number) => {
    const deviceId = editingRelay[courtId] ?? "";
    const { error } = await fromExt("courts").update({ relay_device_id: deviceId || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success("Relay device saved");
      setEditingRelay(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Courts ({courts.length})</h3>
      <p className="text-xs text-muted-foreground">
        💡 To enable automatic court lights, add the Shelly device ID for each court.
      </p>
      <div className="space-y-3">
        {courts.map(c => {
          const courtId = c.id;
          const relayValue = editingRelay[courtId] ?? c.relay_device_id ?? "";
          return (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  value={relayValue}
                  onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                  placeholder="Shelly Device ID (e.g. 98cdac123456)"
                  className="flex-1 text-xs h-8"
                />
                {editingRelay[courtId] !== undefined && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleSaveRelay(courtId)}>
                    Save
                  </Button>
                )}
              </div>
              {c.relay_device_id && editingRelay[courtId] === undefined && (
                <p className="text-[10px] text-muted-foreground">✅ Relay configured — lights will auto-switch</p>
              )}
            </div>
          );
        })}
        {courts.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No courts added yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
    </Card>
  );
}
