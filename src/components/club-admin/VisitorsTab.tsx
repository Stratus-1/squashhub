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
      return data as Visitor[];
    },
  });

  const filtered = visitors.filter((v) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      v.first_name.toLowerCase().includes(term) ||
      v.last_name.toLowerCase().includes(term) ||
      v.home_club_name.toLowerCase().includes(term) ||
      (v.email || "").toLowerCase().includes(term)
    );
  });

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await fromExt("club_visitors").delete().eq("id", id);
      if (error) throw error;
      toast.success("Visitor removed");
      queryClient.invalidateQueries({ queryKey: ["club-visitors", clubId] });
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
