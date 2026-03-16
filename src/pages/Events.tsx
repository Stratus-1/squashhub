import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { CreateClubEvent } from "@/components/CreateClubEvent";
import { absoluteUrl } from "@/lib/site";

export default function Events() {
  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Events"
        description="Upcoming squash events, socials, and tournaments."
        path="/events"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Events — SquashHub",
          description: "Upcoming squash events, socials, and tournaments.",
          url: absoluteUrl("/events"),
          isPartOf: { "@type": "WebSite", name: "SquashHub", url: absoluteUrl("/") },
        }}
      />
      <PageHeader title="Events" subtitle="Upcoming club events" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 mb-20">
        <CreateClubEvent />
      </div>
    </div>
  );
}
  const { user } = useAuth();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const club = contextClub || clubData?.club || null;
  const hasClub = !!club;
  const [showCreate, setShowCreate] = useState(false);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["club-events-list", club?.id],
    queryFn: async () => {
      if (!club?.id) return [];
      const { data, error } = await fromExt("club_events")
        .select("*")
        .eq("club_id", club.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!club?.id,
  });

  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Events"
        description="Upcoming squash events, socials, and tournaments."
        path="/events"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Events — SquashHub",
          description: "Upcoming squash events, socials, and tournaments.",
          url: absoluteUrl("/events"),
          isPartOf: { "@type": "WebSite", name: "SquashHub", url: absoluteUrl("/") },
        }}
      />
      <PageHeader title="Events" subtitle="Upcoming club events" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-3 mb-20">
        {hasClub && !showCreate && (
          <Button className="w-full gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Create Event
          </Button>
        )}

        {showCreate && <CreateClubEvent onClose={() => setShowCreate(false)} />}

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
          events.map((e: any) => {
            const recLabel = e.recurrence && e.recurrence !== "once"
              ? e.recurrence.charAt(0).toUpperCase() + e.recurrence.slice(1)
              : null;
            const startDateFormatted = e.start_date
              ? format(new Date(e.start_date + "T00:00:00"), "EEE d MMM")
              : null;

            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-heading truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {recLabel
                        ? `${recLabel} · ${DAYS[e.day_of_week]}`
                        : startDateFormatted || DAYS[e.day_of_week]
                      } · {e.start_time?.slice(0, 5)} – {e.end_time?.slice(0, 5)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      {e.event_type}
                    </Badge>
                    {recLabel && (
                      <Badge variant="outline" className="text-[10px]">
                        {recLabel}
                      </Badge>
                    )}
                  </div>
                </div>

                {e.description && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line line-clamp-2">
                    {e.description}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    {e.is_club_booking ? "Club booking" : "Member booking"}
                    {" · "}
                    Scope: {e.invite_scope === "all" ? "All members" : e.invite_scope === "selected" ? "Selected members" : e.invite_scope}
                    {e.light_fee_split === "attendees" && " · Lights shared"}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
