import { useState } from "react";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Beer, Wine, Coffee, Package } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClubMembers, useUpdateClub, Club } from "@/hooks/use-club";

interface BarItem {
  id: string;
  club_id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  sort_order: number;
  image_url?: string | null;
}

interface BarTabEntry {
  id: string;
  club_id: string;
  club_member_id: string;
  bar_item_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  settled: boolean;
  created_at: string;
  bar_items?: { name: string; category: string };
  club_members?: { name: string };
}

const CATEGORIES = [
  { value: "drinks", label: "Drinks", icon: Beer },
  { value: "alcohol", label: "Alcohol", icon: Wine },
  { value: "snacks", label: "Snacks", icon: Coffee },
  { value: "other", label: "Other", icon: Package },
];

export function HonestyBarTab({ club, clubId }: { club: Club; clubId: string }) {
  const qc = useQueryClient();
  const updateClub = useUpdateClub();
  const { data: members = [] } = useClubMembers(clubId);

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["bar-items", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_items")
        .select("*")
        .eq("club_id", clubId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as BarItem[];
    },
  });

  const { data: unsettledEntries = [] } = useQuery({
    queryKey: ["bar-tab-unsettled", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_tab_entries")
        .select("*, bar_items:bar_item_id(name, category), club_members:club_member_id(name)")
        .eq("club_id", clubId)
        .eq("settled", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BarTabEntry[];
    },
  });

  // Group unsettled entries by member
  const memberTabs = unsettledEntries.reduce((acc, entry) => {
    const memberId = entry.club_member_id;
    if (!acc[memberId]) {
      acc[memberId] = {
        name: (entry.club_members as any)?.name || "Unknown",
        entries: [],
        total: 0,
      };
    }
    acc[memberId].entries.push(entry);
    acc[memberId].total += entry.total;
    return acc;
  }, {} as Record<string, { name: string; entries: BarTabEntry[]; total: number }>);

  const toggleBarEnabled = async () => {
    try {
      await updateClub.mutateAsync({ id: club.id, honesty_bar_enabled: !club.honesty_bar_enabled });
      toast.success(club.honesty_bar_enabled ? "Honesty bar disabled" : "Honesty bar enabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Enable/Disable */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Honesty Bar</h3>
            <p className="text-sm text-muted-foreground">
              Enable self-service bar tab for members. Items consumed are added to their account.
            </p>
          </div>
          <Switch
            checked={!!club.honesty_bar_enabled}
            onCheckedChange={toggleBarEnabled}
          />
        </div>
      </Card>

      {club.honesty_bar_enabled && (
        <>
          {/* Item Management */}
          <ItemManager clubId={clubId} items={items} loading={itemsLoading} />

          {/* Outstanding Tabs */}
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">Outstanding Tabs ({Object.keys(memberTabs).length} members)</h3>
            <p className="text-sm text-muted-foreground">Members with unsettled bar items.</p>

            {Object.keys(memberTabs).length === 0 ? (
              <p className="text-sm text-muted-foreground">No outstanding tabs 🎉</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(memberTabs)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([memberId, tab]) => (
                    <div key={memberId} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{tab.name}</span>
                        <Badge variant="destructive" className="text-xs">
                          R{tab.total.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {tab.entries.map(e => (
                          <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
                            <span>{e.quantity}× {(e.bar_items as any)?.name}</span>
                            <span>R{e.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-7"
                        onClick={async () => {
                          const entryIds = tab.entries.map(e => e.id);
                          for (const id of entryIds) {
                            await fromExt("bar_tab_entries")
                              .update({ settled: true, settled_at: new Date().toISOString() })
                              .eq("id", id);
                          }
                          toast.success(`Settled R${tab.total.toFixed(2)} for ${tab.name}`);
                          qc.invalidateQueries({ queryKey: ["bar-tab-unsettled"] });
                        }}
                      >
                        Mark as Settled
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          {/* Admin: Add charge for a member */}
          <AdminAddCharge clubId={clubId} items={items} members={members} />
        </>
      )}
    </div>
  );
}

function ItemManager({ clubId, items, loading }: { clubId: string; items: BarItem[]; loading: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", category: "drinks", image_url: "" });

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) return;
    const { error } = await fromExt("bar_items").insert({
      club_id: clubId,
      name: form.name.trim(),
      price: parseFloat(form.price),
      category: form.category,
      sort_order: items.length,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item added");
      setForm({ name: "", price: "", category: "drinks" });
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["bar-items"] });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this bar item?")) return;
    const { error } = await fromExt("bar_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Item removed"); qc.invalidateQueries({ queryKey: ["bar-items"] }); }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await fromExt("bar_items").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bar-items"] });
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Bar Items ({items.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
          <Plus className="w-3.5 h-3.5 mr-1" />{adding ? "Cancel" : "Add Item"}
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Item name (e.g. Castle Lager)"
            />
            <Input
              type="number"
              min={0}
              step={0.5}
              value={form.price}
              onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              placeholder="Price (R)"
            />
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd}>Add Item</Button>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => {
          const cat = CATEGORIES.find(c => c.value === item.category);
          const Icon = cat?.icon || Package;
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${!item.active ? "line-through text-muted-foreground" : ""}`}>
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground ml-2">R{item.price.toFixed(2)}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{cat?.label}</Badge>
              <Switch
                checked={item.active}
                onCheckedChange={() => handleToggleActive(item.id, item.active)}
                className="scale-75"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
        {items.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No items yet — add your first bar item above.</p>
        )}
      </div>
    </Card>
  );
}

function AdminAddCharge({ clubId, items, members }: { clubId: string; items: BarItem[]; members: any[] }) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const activeItems = items.filter(i => i.active);
  const selectedItem = activeItems.find(i => i.id === itemId);

  const handleAdd = async () => {
    if (!memberId || !itemId || !selectedItem) return;
    const total = selectedItem.price * quantity;
    const { error } = await fromExt("bar_tab_entries").insert({
      club_id: clubId,
      club_member_id: memberId,
      bar_item_id: itemId,
      quantity,
      unit_price: selectedItem.price,
      total,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Charge added");
      setMemberId("");
      setItemId("");
      setQuantity(1);
      qc.invalidateQueries({ queryKey: ["bar-tab-unsettled"] });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Add Charge for Member</h3>
      <p className="text-sm text-muted-foreground">Manually log a bar item on behalf of a member.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
          <SelectContent>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.profiles?.name || m.email || "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
          <SelectContent>
            {activeItems.map(i => (
              <SelectItem key={i.id} value={i.id}>
                {i.name} — R{i.price.toFixed(2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={e => setQuantity(parseInt(e.target.value) || 1)}
          placeholder="Qty"
        />
        <Button onClick={handleAdd} disabled={!memberId || !itemId}>
          Add Charge{selectedItem ? ` (R${(selectedItem.price * quantity).toFixed(2)})` : ""}
        </Button>
      </div>
    </Card>
  );
}
