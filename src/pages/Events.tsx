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
