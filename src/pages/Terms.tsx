import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";

const LAST_UPDATED = "16 March 2026";

export default function Terms() {
  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Terms of Use"
        description="Terms of use for SquashHub."
        path="/terms"
      />

      <PageHeader title="Terms of Use" subtitle={`Last updated: ${LAST_UPDATED}`} showNotifications={false} />

      <div className="px-4 sm:px-6 lg:px-[5%] pb-20">
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-6">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                These Terms of Use (&quot;Terms&quot;) govern your use of SquashHub (the
                &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms.
              </p>

              <h2>1. Who we are</h2>
              <p>
                The Service is provided by SquashHub to help squash clubs with court bookings,
                ladder play, events, and club communications.
              </p>

              <h2>2. Eligibility and accounts</h2>
              <ul>
                <li>You must provide accurate information when creating an account.</li>
                <li>You are responsible for keeping your login details secure.</li>
                <li>We may suspend or disable accounts that misuse the Service or violate club rules.</li>
              </ul>

              <h2>3. Bookings, challenges, and events</h2>
              <ul>
                <li>Bookings are subject to availability and club rules.</li>
                <li>Challenge and ladder features are intended for fair play and good sportsmanship.</li>
                <li>
                  Event details and RSVPs may be visible to other members depending on the event visibility
                  settings.
                </li>
              </ul>

              <h2>4. Acceptable use</h2>
              <ul>
                <li>Do not harass, impersonate, or abuse other members.</li>
                <li>Do not attempt to access data you are not authorized to access.</li>
                <li>Do not upload malicious content or try to disrupt the Service.</li>
              </ul>

              <h2>5. Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy. Please read it carefully.
              </p>

              <h2>6. Service availability</h2>
              <p>
                We aim to keep the Service available, but it may be unavailable from time to time (maintenance,
                outages, updates). Features may change or be removed.
              </p>

              <h2>7. Disclaimers</h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum
                extent permitted by law, we disclaim warranties of any kind.
              </p>

              <h2>8. Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, we are not liable for indirect, incidental, special,
                consequential, or punitive damages arising from your use of the Service.
              </p>

              <h2>9. Termination</h2>
              <p>
                You may stop using the Service at any time. We may suspend or terminate access if needed to
                protect members, the club, or the Service.
              </p>

              <h2>10. Intellectual property</h2>
              <p>
                All content, branding, and technology of SquashHub remain the property of SquashHub.
                You may not copy, modify, or reverse-engineer any part of the Service without written
                permission. Content you submit (posts, results, avatars) remains yours, but you grant
                SquashHub a licence to display it within the Service.
              </p>

              <h2>11. Fees and payments</h2>
              <p>
                Clubs may charge membership fees, light fees, or event fees through the Service.
                Payment terms are set by each club. SquashHub facilitates the collection but is not
                responsible for disputes between members and clubs regarding fees.
              </p>

              <h2>12. Governing law</h2>
              <p>
                These Terms are governed by the laws of the Republic of South Africa. Any disputes
                arising from these Terms or the Service will be subject to the jurisdiction of the
                South African courts.
              </p>

              <h2>13. Changes to these Terms</h2>
              <p>
                We may update these Terms from time to time. If changes are material, we will take reasonable
                steps to notify users in-app.
              </p>

              <h2>14. Contact</h2>
              <p>
                Questions about these Terms can be sent via the in-app Support page.
              </p>

              <p className="text-xs text-muted-foreground">
                Note: This document is a starter template and should be reviewed by the club committee and/or
                legal counsel to confirm suitability.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

