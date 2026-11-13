import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { goBookSearchTerms, rankCandidates, type GoBookCandidate } from "@/lib/gobook/client-search";

type Member = {
  id: string;
  name: string;
  email: string | null;
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
        .select("id, name, email, gobook_client_id, gobook_client_name")
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

type Ranked = ReturnType<typeof rankCandidates>[number];

function MemberRow({ clubId, member }: { clubId: string; member: Member }) {
  const qc = useQueryClient();
  const [candidates, setCandidates] = useState<Ranked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const search = async (terms: string[]) => {
    setBusy(true);
    try {
      const found: GoBookCandidate[] = [];
      for (const term of terms) {
        const { data, error } = await supabase.functions.invoke("gobook-api", {
          body: { action: "find_client", club_id: clubId, query: term },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        const isEmail = term.includes("@");
        for (const c of (data as any).clients ?? []) {
          found.push({
            clientId: Number(c.clientId),
            firstName: String(c.firstName ?? ""),
            lastName: String(c.lastName ?? ""),
            isActive: c.isActive,
            emailMatch: isEmail && member.email?.trim().toLowerCase() === term.trim().toLowerCase(),
          });
        }
      }
      setCandidates(rankCandidates(member.name, found));
    } catch (e: any) {
      toast.error(e?.message || "GoBook lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const lookup = () => search(goBookSearchTerms(member.name, member.email));
  const searchTyped = () => {
    const q = query.trim();
    if (q.length >= 2) search([q]);
  };

  const link = async (c: Ranked) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("gobook-api", {
        body: {
          action: "link_member",
          club_id: clubId,
          club_member_id: member.id,
          gobook_client_id: c.clientId,
          gobook_client_name: name,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${member.name} linked to ${name}`);
      qc.invalidateQueries({ queryKey: ["gobook-link-members", clubId] });
    } catch (e: any) {
      toast.error(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  };

  const sameEmailAndName = (candidates ?? []).filter((c) => c.emailMatch && c.firstNameMatch);

  return (
    <div className="p-2 text-[11px] space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{member.name}</span>
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={lookup} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Find in GoBook"}
        </Button>
      </div>
      {candidates && (
        <>
          <div className="flex flex-wrap gap-1">
            {candidates.length ? (
              candidates.slice(0, 12).map((c) => (
                <Button
                  key={c.clientId}
                  size="sm"
                  variant={c.emailMatch || c.firstNameMatch ? "secondary" : "outline"}
                  className="h-auto min-h-6 py-0.5 text-[10px] flex-col items-start gap-0"
                  disabled={busy}
                  onClick={() => link(c)}
                >
                  <span>
                    {`${c.firstName} ${c.lastName}`.trim()} (#{c.clientId})
                  </span>
                  {(c.emailMatch || c.firstNameMatch || c.isActive === false) && (
                    <span className="text-[9px] text-muted-foreground font-normal">
                      {[
                        c.emailMatch && "Same email",
                        c.firstNameMatch && "Same first name",
                        c.isActive === false && "Inactive on GoBook",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </Button>
              ))
            ) : (
              <span className="text-muted-foreground">No GoBook client found</span>
            )}
          </div>
          {sameEmailAndName.length > 1 && (
            <p className="text-[10px] text-muted-foreground">
              GoBook has {sameEmailAndName.length} accounts with this member's name and email. Ask the member or GoBook
              which one holds their Lights balance and bookings.
            </p>
          )}
          <div className="flex gap-1">
            <Input
              className="h-6 text-[11px]"
              placeholder="Search GoBook by surname or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchTyped()}
            />
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={searchTyped} disabled={busy || query.trim().length < 2}>
              Search
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
