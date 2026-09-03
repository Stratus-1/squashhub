import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Member = {
  id: string;
  name: string;
  gobook_client_id: number | null;
  gobook_client_name: string | null;
};

/**
 * Maps SquashHub members to GoBook client ids. Bookings through the official
 * GoBook API always need a clientId, so every booking member needs one link.
 */
export function GoBookMemberLinkPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [matching, setMatching] = useState(false);
  const [search, setSearch] = useState("");

  const membersQ = useQuery({
    queryKey: ["gobook-link-members", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, gobook_client_id, gobook_client_name")
        .eq("club_id", clubId)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });

  const members = membersQ.data ?? [];
  const linked = members.filter((m) => m.gobook_client_id);
  const unlinked = members.filter((m) => !m.gobook_client_id);
  const shown = unlinked.filter((m) =>
    search ? m.name?.toLowerCase().includes(search.toLowerCase()) : true,
  );

  const autoMatch = async () => {
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: { action: "match_clients", club_id: clubId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      toast.success(
        `Linked ${d.linked.length} member(s). ${d.ambiguous.length} need a manual choice, ${d.unmatched.length} have no GoBook account.`,
      );
      qc.invalidateQueries({ queryKey: ["gobook-link-members", clubId] });
    } catch (e: any) {
      toast.error(e?.message || "Auto-match failed");
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-primary" />
          GoBook member links
          <Badge variant="outline" className="text-[10px]">
            {linked.length}/{members.length} linked
          </Badge>
        </p>
        <Button size="sm" variant="outline" onClick={autoMatch} disabled={matching}>
          {matching && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Auto-match members
        </Button>
      </div>

      {!!unlinked.length && (
        <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
            <Input
              className="h-8 text-xs pl-7"
              placeholder="Search unlinked members"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y rounded-lg border">
            {shown.slice(0, 100).map((m) => (
              <MemberRow key={m.id} clubId={clubId} member={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberRow({ clubId, member }: { clubId: string; member: Member }) {
  const qc = useQueryClient();
  const [candidates, setCandidates] = useState<Array<{ clientId: number; name: string }> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setBusy(true);
    try {
      const surname = String(member.name ?? "").trim().split(/\s+/).slice(-1)[0] ?? "";
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: { action: "find_client", club_id: clubId, query: surname },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCandidates(
        ((data as any).clients ?? []).map((c: any) => ({
          clientId: c.clientId,
          name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        })),
      );
    } catch (e: any) {
      toast.error(e?.message || "GoBook lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const link = async (c: { clientId: number; name: string }) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: {
          action: "link_member",
          club_id: clubId,
          club_member_id: member.id,
          gobook_client_id: c.clientId,
          gobook_client_name: c.name,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${member.name} linked to ${c.name}`);
      qc.invalidateQueries({ queryKey: ["gobook-link-members", clubId] });
    } catch (e: any) {
      toast.error(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-2 text-[11px] space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{member.name}</span>
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={lookup} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Find in GoBook"}
        </Button>
      </div>
      {candidates && (
        <div className="flex flex-wrap gap-1">
          {candidates.length ? (
            candidates.map((c) => (
              <Button
                key={c.clientId}
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                disabled={busy}
                onClick={() => link(c)}
              >
                {c.name} (#{c.clientId})
              </Button>
            ))
          ) : (
            <span className="text-muted-foreground">No GoBook client found</span>
          )}
        </div>
      )}
    </div>
  );
}
