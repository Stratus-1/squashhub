import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultOrganiser, suggestedOrganiser, type OrganiserMember, type OrganiserPermission, type TournamentOrganiser } from "@/lib/smart-builder/tournament-organiser";

export function TournamentOrganiserField({ clubId, value, existing, onChange }: {
  clubId: string; value: TournamentOrganiser | null | undefined; existing: boolean;
  onChange: (value: TournamentOrganiser | null) => void;
}) {
  const [loaded, setLoaded] = useState<{ clubId: string; members: OrganiserMember[]; suggestion?: TournamentOrganiser } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    (async () => {
      const members: OrganiserMember[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from("club_members").select("id,name,club_id").eq("club_id", clubId).eq("status", "active").neq("role", "visitor").order("name").order("id").range(start, start + 999);
        if (error) throw error;
        members.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const permissions: OrganiserPermission[] = [];
      // A failed permission read only suppresses suggestions; selection remains available.
      for (let start = 0; start < members.length; start += 200) {
        const { data, error } = await supabase.from("club_member_permissions")
          .select("club_member_id,custom_permissions,club_permission_roles(club_id,role_name,permissions)")
          .in("club_member_id", members.slice(start, start + 200).map((m) => m.id));
        if (error) { permissions.length = 0; break; }
        permissions.push(...(data ?? []));
      }
      if (live) setLoaded({ clubId, members, suggestion: suggestedOrganiser(clubId, members, permissions) });
    })().catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [clubId]);
  const ready = loaded?.clubId === clubId ? loaded : null;
  useEffect(() => {
    const next = defaultOrganiser(value, ready?.suggestion, existing);
    if (next !== value && next) onChange(next);
  }, [value, ready, existing, onChange]);
  return <div className="max-w-md space-y-1">
    <Label htmlFor="tournament-organiser">Tournament organiser (optional)</Label>
    <Select value={value?.memberId ?? "none"} onValueChange={(id) => {
      if (id === "none") { onChange(null); return; }
      const member = ready?.members.find((m) => m.id === id);
      if (member) onChange({ memberId: member.id, name: member.name });
    }}>
      <SelectTrigger id="tournament-organiser"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No organiser selected</SelectItem>
        {value && !ready?.members.some((m) => m.id === value.memberId) && <SelectItem value={value.memberId}>{value.name}</SelectItem>}
        {ready?.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
    {failed && <p className="text-xs text-destructive">Couldn't load organisers. Your saved choice is unchanged.</p>}
  </div>;
}