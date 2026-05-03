import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { CreateClubEvent } from "@/components/CreateClubEvent";
import { absoluteUrl } from "@/lib/site";

export default function Events() {
  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Events"
        description="Upcoming squash club events and socials."
        path="/events"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Events — SquashHub",
          description: "Upcoming squash club events and socials.",
          url: absoluteUrl("/events"),
          isPartOf: { "@type": "WebSite", name: "SquashHub", url: absoluteUrl("/") },
        }}
      />
      <PageHeader title="Events" subtitle="Upcoming club events & socials" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 mb-20">
        <CreateClubEvent />
      </div>
      <BackToDashboard />
    </div>
  );
}
