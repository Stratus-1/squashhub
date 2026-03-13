import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";

const LAST_UPDATED = "9 March 2026";

function getPrivacyContactEmail() {
  return (import.meta.env.VITE_PRIVACY_CONTACT_EMAIL as string | undefined)?.trim() || "admin@gbsquash.co.za";
}

export default function Privacy() {
  const contactEmail = getPrivacyContactEmail();

  return (
    <div className="bottom-nav-safe">
      <SEO
        title="Privacy Policy"
        description="Privacy policy for SquashHub (POPIA aligned)."
        path="/privacy"
      />

      <PageHeader title="Privacy Policy" subtitle={`Last updated: ${LAST_UPDATED}`} showNotifications={false} />

      <div className="px-4 sm:px-6 lg:px-[5%] pb-20">
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-6">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p>
                This Privacy Policy explains how we collect, use, share, and protect personal information when you
                use SquashHub (the &quot;Service&quot;). We aim to follow the principles of the
                Protection of Personal Information Act 4 of 2013 (&quot;POPIA&quot;).
              </p>

              <h2>1. Responsible party</h2>
              <p>
                SquashHub and the respective club administrators are the responsible parties for
                processing personal information in the Service.
              </p>

              <h2>2. What we collect</h2>
              <ul>
                <li>
                  <strong>Account details:</strong> email address, name, and optional phone number.
                </li>
                <li>
                  <strong>Profile details:</strong> avatar, availability, and privacy settings you choose.
                </li>
                <li>
                  <strong>Bookings and matches:</strong> court bookings, opponents, match stats, ladder rankings.
                </li>
                <li>
                  <strong>Events:</strong> event RSVPs and related participation information.
                </li>
                <li>
                  <strong>Notifications:</strong> in-app notifications and (if you enable it) push notification
                  tokens.
                </li>
                <li>
                  <strong>Device/app data:</strong> basic diagnostics needed to run and secure the Service.
                </li>
                <li>
                  <strong>Optional location:</strong> if you enable court check-ins, we may use your device location
                  to detect whether you are at the courts to improve booking reminders.
                </li>
                <li>
                  <strong>Integrations (optional):</strong> if you connect Strava, we process the data needed to show
                  your training stats inside the Service.
                </li>
              </ul>

              <h2>3. Why we process personal information</h2>
              <ul>
                <li>Provide and operate club booking, ladder, and event features.</li>
                <li>Help members find opponents and schedule matches.</li>
                <li>Send service-related messages (bookings, challenges, events, support).</li>
                <li>Maintain security, prevent abuse, and troubleshoot issues.</li>
                <li>Improve the Service and club operations (aggregated reporting where possible).</li>
              </ul>

              <h2>4. Lawful basis</h2>
              <p>
                We process personal information based on necessity to provide the Service (contract/legitimate club
                purpose) and, where required, your consent (for example: optional marketing emails, optional push
                notifications, optional integrations).
              </p>

              <h2>5. Sharing and operators</h2>
              <p>
                We use trusted operators (service providers) to host and run the Service. This may include hosting,
                database, and notification delivery providers. We only share the minimum information needed and
                require appropriate safeguards.
              </p>

              <h2>6. International transfers</h2>
              <p>
                Some operators may process data outside South Africa. Where applicable, we take steps to ensure that
                cross-border processing is protected in a manner consistent with POPIA.
              </p>

              <h2>7. Retention</h2>
              <p>
                We keep personal information for as long as needed to provide the Service, meet club record-keeping
                needs (for example, season results), and comply with legal obligations. When no longer required, we
                delete or de-identify it where reasonably possible.
              </p>

              <h2>8. Security</h2>
              <p>
                We implement reasonable technical and organizational measures to protect personal information
                against loss, misuse, and unauthorized access.
              </p>

              <h2>9. Your rights</h2>
              <p>
                Subject to POPIA and applicable exceptions, you may request access to, correction of, or deletion of
                your personal information, and you may object to certain processing. You may also withdraw consent
                where processing is based on consent.
              </p>
              <p>
                To make a request, contact us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or via the
                in-app Support page.
              </p>

              <h2>10. Cookies / local storage</h2>
              <p>
                The Service uses local storage and similar technologies to remember preferences (for example: theme)
                and to support offline behavior. If we add analytics or marketing cookies in future, we will update
                this policy and provide consent controls where required.
              </p>

              <h2>11. Changes to this policy</h2>
              <p>
                We may update this Privacy Policy from time to time. If changes are material, we will take
                reasonable steps to notify users in-app.
              </p>

              <p className="text-xs text-muted-foreground">
                Note: This document is a starter template and should be reviewed by the club committee and/or legal
                counsel to confirm POPIA compliance for your specific operations.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

