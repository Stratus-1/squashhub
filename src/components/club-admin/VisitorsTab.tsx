import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface Visitor {
  id: string;
  source?: "visitor_registration" | "member_record";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  home_club_name: string;
  member_number: string | null;
  category: string;
  created_at: string;
}

export function VisitorsTab({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: visitors = [], isLoading } = useQuery({
    queryKey: ["club-visitors", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_visitors")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: memberVisitors, error: memberError } = await fromExt("club_members")
        .select("id, name, email, phone, club_member_number, gender, joined_at")
        .eq("club_id", clubId)
        .eq("role", "visitor")
        .order("joined_at", { ascending: false });
      if (memberError) throw memberError;

      const registeredVisitors = (data || []).map((v: Visitor) => ({ ...v, source: "visitor_registration" as const }));
      const visitorMembers = (memberVisitors || []).map((m: any) => {
        const parts = String(m.name || "Visitor").trim().split(/\s+/);
        return {
          id: m.id,
          source: "member_record" as const,
          first_name: parts[0] || "Visitor",
          last_name: parts.slice(1).join(" "),
          email: m.email || null,
          phone: m.phone || null,
          home_club_name: "Club visitor",
          member_number: m.club_member_number || null,
          category: m.gender || "Men",
          created_at: m.joined_at,
        };
      });
      return [...registeredVisitors, ...visitorMembers] as Visitor[];
    },
  });

  const filtered = visitors.filter((v) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      v.first_name.toLowerCase().includes(term) ||
      v.last_name.toLowerCase().includes(term) ||
      v.home_club_name.toLowerCase().includes(term) ||
      (v.email || "").toLowerCase().includes(term) ||
      (v.phone || "").toLowerCase().includes(term) ||
      (v.member_number || "").toLowerCase().includes(term)
    );
  });

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const visitor = visitors.find((v) => v.id === id);
      if (visitor?.source === "member_record") {
        toast.info("This visitor is linked to an account — edit or remove them from Members.");
        return;
      }
      const { error } = await fromExt("club_visitors").delete().eq("id", id);
      if (error) throw error;
      toast.success("Visitor removed");
      queryClient.invalidateQueries({ queryKey: ["club-visitors", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete visitor");
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        Visitors registered for tournaments and competitions.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search visitors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {visitors.length === 0 ? "No visitors registered yet." : "No visitors match your search."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card key={v.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">
                    {v.first_name} {v.last_name}
                  </p>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {v.category || "Men"}
                  </Badge>
                  {v.source === "member_record" && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Member record</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {v.home_club_name}
                  {v.member_number ? ` · #${v.member_number}` : ""}
                </p>
                {(v.email || v.phone) && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[v.email, v.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={deleting === v.id}
                onClick={() => handleDelete(v.id)}
              >
                {deleting === v.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
