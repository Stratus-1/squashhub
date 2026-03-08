import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
const fromExt = (table: string) => (supabase as any).from(table);
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  court_id: number | null;
  capacity: number | null;
  rsvp_deadline: string | null;
  visibility: "public" | "members";
  status: "draft" | "published" | "cancelled";
};

export default function Events() {
  const { user } = useAuth();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["events", user?.id ? "authed" : "anon"],
    queryFn: async () => {
      const { data, error } = await fromExt("events")
        .select("*")
        .eq("status", "published")
        .order("starts_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as EventRow[];
    },
  });

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Events" subtitle="Upcoming club events" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-3 mb-20">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Could not load events. {String((error as any)?.message || "")}
          </Card>
        ) : !events || events.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No upcoming events yet.</Card>
        ) : (
          events.map((e) => {
            const starts = new Date(e.starts_at);
            const ends = e.ends_at ? new Date(e.ends_at) : null;
            const deadline = e.rsvp_deadline ? new Date(e.rsvp_deadline) : null;
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(starts, "EEE, d MMM yyyy · HH:mm")}
                      {ends ? ` – ${format(ends, "HH:mm")}` : ""}
                      {e.court_id ? ` · Court ${e.court_id}` : ""}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {e.visibility === "public" ? (
                      <Badge variant="secondary">Public</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Members
                      </Badge>
                    )}
                  </div>
                </div>

                {e.description ? (
                  <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">
                    {e.description}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    {deadline ? `RSVP by ${format(deadline, "d MMM yyyy HH:mm")}` : "RSVP open"}
                    {e.capacity ? ` · Capacity ${e.capacity}` : ""}
                  </div>
                  <Button asChild size="sm" className="h-8 text-xs">
                    <Link to={`/events/${e.id}`}>View & RSVP</Link>
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

