import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, UserPlus } from "lucide-react";
import {
  FAMILY_ADDITIONAL_LABEL,
  FAMILY_RELATIONSHIPS,
  remainingSlots,
  type FamilyCategory,
} from "@/lib/family/family-package";
import { emptyFamilyDraft, familyDraftError, type FamilyDraft } from "@/lib/family/family-draft";

interface Props {
  primary: FamilyCategory;
  additional: FamilyCategory | null;
  drafts: FamilyDraft[];
  onChange: (next: FamilyDraft[]) => void;
  money: (n: number) => string;
}

/**
 * "Who else is on your family membership?" — used inside the joining wizard.
 * Everyone captured here keeps their own membership and their own login; the
 * charge for each of them is raised on their own account with the primary
 * member recorded as the payer.
 */
export function FamilyMembersStep({ primary, additional, drafts, onChange, money }: Props) {
  const allowed = (primary.family_allowed_relationships ?? []).length
    ? FAMILY_RELATIONSHIPS.filter((r) => primary.family_allowed_relationships!.includes(r.value))
    : FAMILY_RELATIONSHIPS;
  const left = remainingSlots(primary, drafts.length);
  const error = familyDraftError(primary, drafts);

  const update = (key: string, patch: Partial<FamilyDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20 space-y-1">
        <p className="text-xs font-semibold">
          {additional
            ? `${FAMILY_ADDITIONAL_LABEL}: ${money(additional.annual_fee)} each`
            : "Your club has not set an additional family member fee yet."}
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Add the people on your family membership now, or skip this and add them later from My Account.
          Each person keeps their own membership and their own sign-in.
          {left !== null && ` Your club's package includes ${left} more ${left === 1 ? "person" : "people"}.`}
        </p>
      </Card>

      {drafts.map((d, i) => (
        <Card key={d.key} className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px]">Family member {i + 1}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">They are</Label>
              <Select value={d.mode} onValueChange={(v) => update(d.key, { mode: v as FamilyDraft["mode"] })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New to the club</SelectItem>
                  <SelectItem value="existing">Already a member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Relationship</Label>
              <Select value={d.relationship} onValueChange={(v) => update(d.key, { relationship: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowed.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {d.mode === "existing" ? (
            <div className="space-y-1">
              <Label className="text-[11px]">Their membership number</Label>
              <Input
                className="h-9 text-sm"
                value={d.memberNo}
                onChange={(e) => update(d.key, { memberNo: e.target.value })}
                placeholder="e.g. NSC112"
              />
              <p className="text-[11px] text-muted-foreground">They will be asked to accept before they are linked.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Name</Label>
                <Input className="h-9 text-sm" value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Surname</Label>
                <Input className="h-9 text-sm" value={d.surname} onChange={(e) => update(d.key, { surname: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Email</Label>
                <Input className="h-9 text-sm" type="email" value={d.email} onChange={(e) => update(d.key, { email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Cell number</Label>
                <Input className="h-9 text-sm" value={d.phone} onChange={(e) => update(d.key, { phone: e.target.value })} />
              </div>
            </div>
          )}
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={left !== null && left <= 0}
        onClick={() => onChange([...drafts, emptyFamilyDraft(allowed[0]?.value || "child")])}
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Add family member
      </Button>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
