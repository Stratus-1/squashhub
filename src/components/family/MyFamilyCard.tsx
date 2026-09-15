import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Users, UserPlus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  FAMILY_PRIMARY_LABEL,
  FAMILY_ADDITIONAL_LABEL,
  FAMILY_RELATIONSHIPS,
  isFamilyFull,
  remainingSlots,
  relationshipAllowed,
  combinedFamilyTotal,
  type FamilyCategory,
} from "@/lib/family/family-package";

interface Props {
  clubMemberId: string | null;
  clubId: string | null;
}

export function MyFamilyCard({ clubMemberId, clubId }: Props) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [memberNo, setMemberNo] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState<string>("child");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-family", clubMemberId],
    enabled: !!clubMemberId && !!clubId,
    queryFn: async () => {
      const { data: me } = await fromExt("club_members")
        .select("id, club_id, fee_category_id")
        .eq("id", clubMemberId)
        .maybeSingle();
      if (!me) return null;
      const { data: cats } = await fromExt("member_fee_categories").select("*").eq("club_id", (me as any).club_id);
      const categories = (cats || []) as unknown as FamilyCategory[];
      const myCat = categories.find((c) => c.id === (me as any).fee_category_id) || null;
      const { data: group } = await fromExt("club_family_groups")
        .select("id, season_year")
        .eq("primary_member_id", clubMemberId)
        .eq("status", "active")
        .maybeSingle();
      let members: any[] = [];
      if (group) {
        const { data: rows } = await fromExt("club_family_members")
          .select("id, club_member_id, relationship, status")
          .eq("family_group_id", (group as any).id)
          .neq("status", "removed");
        const ids = (rows || []).map((r: any) => r.club_member_id);
        const { data: people } = ids.length
          ? await fromExt("club_members").select("id, name, club_member_number").in("id", ids)
          : { data: [] as any[] };
        const { data: fees } = ids.length
          ? await fromExt("club_member_fee_payments").select("club_member_id, amount, paid").in("club_member_id", ids)
          : { data: [] as any[] };
        members = (rows || []).map((r: any) => ({
          ...r,
          name: (people || []).find((p: any) => p.id === r.club_member_id)?.name || "Member",
          outstanding: (fees || [])
            .filter((f: any) => f.club_member_id === r.club_member_id && !f.paid)
            .reduce((s: number, f: any) => s + Number(f.amount || 0), 0),
        }));
      }
      return { myCat, categories, group, members };
    },
  });

  const myCat = data?.myCat ?? null;
  const additionalCat = useMemo(
    () => (data?.categories || []).find((c) => c.id === myCat?.family_additional_category_id) || null,
    [data, myCat],
  );
  const members = data?.members || [];
  const activeCount = members.length;

  if (!clubMemberId || !clubId) return null;
  if (isLoading) return null;
  if (!myCat || myCat.family_role !== "primary") return null;

  const full = isFamilyFull(myCat, activeCount);
  const left = remainingSlots(myCat, activeCount);
  const allowedRels = (myCat.family_allowed_relationships ?? []).length
    ? FAMILY_RELATIONSHIPS.filter((r) => myCat.family_allowed_relationships!.includes(r.value))
    : FAMILY_RELATIONSHIPS;

  const add = async () => {
    if (!relationshipAllowed(myCat, relationship)) {
      toast.error("Your club does not include that relationship in the family package");
      return;
    }
    setBusy(true);
    try {
      let existingId: string | null = null;
      if (mode === "existing") {
        const { data: found } = await fromExt("club_members")
          .select("id")
          .eq("club_id", clubId)
          .eq("club_member_number", memberNo.trim())
          .maybeSingle();
        if (!found) { toast.error("No member with that number at your club"); setBusy(false); return; }
        existingId = (found as any).id;
      }
      const fullName = mode === "new" ? `${name.trim()} ${surname.trim()}`.trim() : null;
      const { data: rowId, error } = await (supabase as any).rpc("family_add_member", {
        _primary_member_id: clubMemberId,
        _existing_member_id: existingId,
        _name: fullName,
        _email: mode === "new" ? email.trim() : null,
        _phone: mode === "new" ? phone.trim() : null,
        _relationship: relationship,
      });
      if (error) throw error;

      // A brand-new person gets a personal sign-in link so they can claim their
      // own account. Sending is server-side; a failure never undoes the add.
      let invited = false;
      if (mode === "new" && email.trim() && rowId) {
        try {
          const { data: res, error: sendErr } = await supabase.functions.invoke("family-invite", {
            body: { family_member_id: rowId },
          });
          invited = !sendErr && (res as any)?.sent === true;
        } catch {
          invited = false;
        }
      }

      toast.success(
        mode === "new"
          ? invited
            ? "Added — we've emailed them a personal link to set up their login"
            : "Added — they can now sign up with that email to claim their own account"
          : "Request sent — they need to accept before they're linked",
      );
      setOpen(false);
      setName(""); setSurname(""); setEmail(""); setPhone(""); setMemberNo("");
      qc.invalidateQueries({ queryKey: ["my-family", clubMemberId] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    } catch (e: any) {
      toast.error(e.message || "Could not add that person");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this person from your family package? Their membership stays — the club will confirm their new category.")) return;
    const standard = (data?.categories || []).find((c) => !c.family_role);
    const { error } = await (supabase as any).rpc("family_remove_member", {
      _family_member_id: id,
      _standard_category_id: standard?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Removed — the club admin will confirm their membership category");
    qc.invalidateQueries({ queryKey: ["my-family", clubMemberId] });
  };

  const total = combinedFamilyTotal(myCat.annual_fee, additionalCat?.annual_fee ?? 0, activeCount);

  return (
    <motion.div className="px-4 mt-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold font-heading">My family</h2>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={full} onClick={() => setOpen(true)}>
            <UserPlus className="w-3 h-3" /> Add family member
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground mb-3">
          You are on the {FAMILY_PRIMARY_LABEL} ({money(myCat.annual_fee)}). Each {FAMILY_ADDITIONAL_LABEL} costs{" "}
          {money(additionalCat?.annual_fee ?? 0)}.{" "}
          {left === null ? "There is no limit on how many you may add." : full ? "Your package is full — ask your club if you need another slot." : `You can still add ${left}.`}
        </p>

        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-1">Nobody linked yet. Add them one at a time whenever you're ready.</p>
        ) : (
          <div className="space-y-1.5">
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.relationship || "family"} · {m.status === "invited" ? "waiting for them to accept" : "linked"}
                    {m.outstanding > 0 ? ` · ${money(m.outstanding)} outstanding` : " · nothing outstanding"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-[9px] h-4 px-1.5">
                    {m.status === "active" ? "Linked" : "Pending"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(m.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Family total for the season: <strong>{money(total)}</strong>. Everyone's fee stays on their own account with
              you recorded as the payer, so you can settle them together.
            </p>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a family member</DialogTitle>
            <DialogDescription>They stay their own member with their own login — you just pay for them.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "new" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setMode("new")}>
                New person
              </Button>
              <Button size="sm" variant={mode === "existing" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setMode("existing")}>
                Existing member
              </Button>
            </div>

            {mode === "existing" ? (
              <div className="space-y-1">
                <Label className="text-xs">Member number</Label>
                <Input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} className="h-9" placeholder="e.g. 1234" />
                <p className="text-[10px] text-muted-foreground">They'll be asked to accept before they're linked.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Surname</Label>
                  <Input value={surname} onChange={(e) => setSurname(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" inputMode="email" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Cell phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" inputMode="tel" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedRels.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {myCat.family_dependent_max_age != null && relationship === "child" && (
                <p className="text-[10px] text-muted-foreground">
                  Your club includes children up to {myCat.family_dependent_max_age} years old.
                </p>
              )}
            </div>

            <Button className="w-full" disabled={busy || (mode === "existing" ? !memberNo.trim() : !name.trim())} onClick={add}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add {additionalCat ? `(${money(additionalCat.annual_fee)})` : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
