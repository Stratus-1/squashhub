import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Check, X } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  FAMILY_PRIMARY_LABEL,
  FAMILY_ADDITIONAL_LABEL,
  FAMILY_RELATIONSHIPS,
  suggestFamilyRole,
  type FamilyCategory,
} from "@/lib/family/family-package";

const NONE = "__none__";

export function FamilyPackageCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [saving, setSaving] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["family-fee-categories", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await fromExt("member_fee_categories")
        .select("*")
        .eq("club_id", clubId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as FamilyCategory[];
    },
  });

  const current = useMemo(() => categories.find((c) => c.family_role === "primary") || null, [categories]);
  const currentAdditional = useMemo(
    () => categories.find((c) => c.family_role === "additional") || null,
    [categories],
  );

  const [primaryId, setPrimaryId] = useState<string>("");
  const [additionalId, setAdditionalId] = useState<string>("");
  const [maxAdditional, setMaxAdditional] = useState<string>("");
  const [relationships, setRelationships] = useState<string[]>([]);
  const [maxAge, setMaxAge] = useState<string>("");
  const [touched, setTouched] = useState(false);

  const effPrimary = touched ? primaryId : current?.id ?? "";
  const effAdditional = touched ? additionalId : currentAdditional?.id ?? "";
  const effMax = touched ? maxAdditional : current?.family_max_additional?.toString() ?? "";
  const effRels = touched ? relationships : current?.family_allowed_relationships ?? [];
  const effAge = touched ? maxAge : current?.family_dependent_max_age?.toString() ?? "";

  const startEdit = () => {
    if (touched) return;
    setPrimaryId(current?.id ?? "");
    setAdditionalId(currentAdditional?.id ?? "");
    setMaxAdditional(current?.family_max_additional?.toString() ?? "");
    setRelationships(current?.family_allowed_relationships ?? []);
    setMaxAge(current?.family_dependent_max_age?.toString() ?? "");
    setTouched(true);
  };

  const save = async () => {
    if (!effPrimary || effPrimary === NONE) { toast.error("Choose which fee is the Family Package"); return; }
    if (!effAdditional || effAdditional === NONE) { toast.error("Choose which fee is the Additional Family Member"); return; }
    if (effPrimary === effAdditional) { toast.error("The two fees must be different"); return; }
    setSaving(true);
    try {
      // clear previous roles for this club (amounts are never touched)
      const stale = categories.filter((c) => c.family_role && c.id !== effPrimary && c.id !== effAdditional);
      for (const c of stale) {
        await fromExt("member_fee_categories")
          .update({ family_role: null, family_additional_category_id: null } as any)
          .eq("id", c.id);
      }
      const { error: e1 } = await fromExt("member_fee_categories")
        .update({
          family_role: "primary",
          family_additional_category_id: effAdditional,
          family_max_additional: effMax === "" ? null : Number(effMax),
          family_allowed_relationships: effRels,
          family_dependent_max_age: effAge === "" ? null : Number(effAge),
        } as any)
        .eq("id", effPrimary);
      if (e1) throw e1;
      const { error: e2 } = await fromExt("member_fee_categories")
        .update({ family_role: "additional", family_additional_category_id: null } as any)
        .eq("id", effAdditional);
      if (e2) throw e2;
      toast.success("Family package settings saved");
      setTouched(false);
      qc.invalidateQueries({ queryKey: ["family-fee-categories", clubId] });
      qc.invalidateQueries({ queryKey: ["fee-categories"] });
    } catch (err: any) {
      toast.error(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const suggestions = useMemo(
    () =>
      categories
        .filter((c) => !c.family_role)
        .map((c) => ({ cat: c, role: suggestFamilyRole(c.name, c.description) }))
        .filter((s) => s.role),
    [categories],
  );

  /* ─── families roster + pending category changes ─── */
  const { data: families = [] } = useQuery({
    queryKey: ["club-families", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data: groups } = await fromExt("club_family_groups")
        .select("id, primary_member_id, season_year, status")
        .eq("club_id", clubId);
      const groupIds = (groups || []).map((g: any) => g.id);
      if (groupIds.length === 0) return [] as any[];
      const { data: rows } = await fromExt("club_family_members")
        .select("id, family_group_id, club_member_id, relationship, status, pending_change_status, pending_standard_category_id")
        .in("family_group_id", groupIds);
      const memberIds = Array.from(
        new Set([...(groups || []).map((g: any) => g.primary_member_id), ...(rows || []).map((r: any) => r.club_member_id)]),
      );
      const { data: members } = await fromExt("club_members").select("id, name, club_member_number").in("id", memberIds);
      const nameOf = (id: string) => (members || []).find((m: any) => m.id === id)?.name || "Member";
      return (groups || []).map((g: any) => ({
        ...g,
        primaryName: nameOf(g.primary_member_id),
        members: (rows || [])
          .filter((r: any) => r.family_group_id === g.id)
          .map((r: any) => ({ ...r, name: nameOf(r.club_member_id) })),
      }));
    },
  });

  const resolveChange = async (id: string, approve: boolean) => {
    const { error } = await (supabase as any).rpc("family_resolve_category_change", {
      _family_member_id: id,
      _approve: approve,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Membership category changed" : "Change rejected");
    qc.invalidateQueries({ queryKey: ["club-families", clubId] });
    qc.invalidateQueries({ queryKey: ["club-members"] });
  };

  const options = categories.map((c) => ({ id: c.id, label: `${c.name} — ${money(c.annual_fee)}` }));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <div>
          <h3 className="font-semibold text-sm">Family package</h3>
          <p className="text-xs text-muted-foreground">
            Pick which of your fees is the {FAMILY_PRIMARY_LABEL} and which is the {FAMILY_ADDITIONAL_LABEL}. The names
            are the same at every club — your amounts stay exactly as they are.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{FAMILY_PRIMARY_LABEL} fee</Label>
          <Select value={effPrimary || NONE} onValueChange={(v) => { startEdit(); setPrimaryId(v === NONE ? "" : v); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{FAMILY_ADDITIONAL_LABEL} fee</Label>
          <Select value={effAdditional || NONE} onValueChange={(v) => { startEdit(); setAdditionalId(v === NONE ? "" : v); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Additional members included (blank = no limit)</Label>
          <Input type="number" min={0} className="h-9" value={effMax}
            onChange={(e) => { startEdit(); setMaxAdditional(e.target.value); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Child / dependent age limit (optional)</Label>
          <Input type="number" min={1} className="h-9" value={effAge}
            onChange={(e) => { startEdit(); setMaxAge(e.target.value); }} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Who qualifies (leave all unticked to allow anyone)</Label>
        <div className="flex flex-wrap gap-4 pt-1">
          {FAMILY_RELATIONSHIPS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={effRels.includes(r.value)}
                onCheckedChange={(v) => {
                  startEdit();
                  const base = touched ? relationships : current?.family_allowed_relationships ?? [];
                  setRelationships(v ? [...base, r.value] : base.filter((x) => x !== r.value));
                }}
              />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-md border p-2 bg-muted/30 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Needs your review</p>
          {suggestions.map((s) => (
            <p key={s.cat.id} className="text-xs">
              “{s.cat.name}” looks like a{" "}
              <Badge variant="outline" className="text-[10px]">
                {s.role === "primary" ? FAMILY_PRIMARY_LABEL : FAMILY_ADDITIONAL_LABEL}
              </Badge>{" "}
              — select it above if that's right. Nothing changes until you save.
            </p>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || !touched}>Save family settings</Button>
      </div>

      {families.length > 0 && (
        <div className="border-t pt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Families</p>
          {families.map((f: any) => (
            <div key={f.id} className="rounded-md border p-2">
              <p className="text-xs font-medium">{f.primaryName}</p>
              <div className="mt-1 space-y-1">
                {f.members.length === 0 && <p className="text-[11px] text-muted-foreground">No family members linked yet.</p>}
                {f.members.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px]">
                      {m.name} <span className="text-muted-foreground">· {m.relationship || "family"} · {m.status}</span>
                    </span>
                    {m.pending_change_status === "pending" && (
                      <span className="flex items-center gap-1">
                        <span className="text-[10px] text-amber-600">Category change waiting</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => resolveChange(m.id, true)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => resolveChange(m.id, false)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
