import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type PickedMember = { id: string; name: string; club_member_number?: string | null };

/** Small search-as-you-type member picker for one club (active, non-visitor members). */
export function MemberSearchPicker({ clubId, value, onChange, excludeId, placeholder = "Search member name or number…" }: {
  clubId: string; value: PickedMember | null; onChange: (m: PickedMember | null) => void; excludeId?: string | null; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim();
  const { data = [], isFetching } = useQuery({
    queryKey: ["member-search-picker", clubId, term],
    enabled: !!clubId && term.length >= 2 && !value,
    queryFn: async () => {
      const safe = term.replace(/[%,()]/g, " ");
      const { data, error } = await (supabase as any).from("club_members")
        .select("id, name, club_member_number")
        .eq("club_id", clubId).eq("status", "active").neq("role", "visitor")
        .or(`name.ilike.%${safe}%,club_member_number.ilike.%${safe}%`)
        .order("name").limit(20);
      if (error) throw error;
      return (data || []) as PickedMember[];
    },
  });

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border bg-muted/40 px-3 text-xs">
        <span className="truncate">{value.name}{value.club_member_number ? ` · #${value.club_member_number}` : ""}</span>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onChange(null); setQ(""); }} aria-label="Change member">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
  const rows = data.filter((m) => m.id !== excludeId);
  return (
    <div className="space-y-1">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 text-xs" />
      {term.length >= 2 && (
        <div className="max-h-44 overflow-y-auto rounded-md border">
          {rows.map((m) => (
            <button key={m.id} type="button" onClick={() => onChange(m)} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted">
              {m.name}{m.club_member_number ? <span className="text-muted-foreground"> · #{m.club_member_number}</span> : null}
            </button>
          ))}
          {!isFetching && rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No members found.</p>}
        </div>
      )}
    </div>
  );
}
