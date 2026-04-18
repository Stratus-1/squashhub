import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";

const LAST_UPDATED = "17 March 2026";

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
                &quot;Service&quot;), a platform operated by <strong>HKFT Services (Pty) Ltd</strong>{" "}
                (Registration No. 2025/624300/07), a company registered in the Republic of South Africa
                (&quot;HKFT&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
                By creating an account or using the Service, you agree to these Terms
                and enter into a binding agreement with HKFT.
              </p>

              <h2>1. Who we are</h2>
              <p>
                SquashHub is owned and operated by <strong>HKFT Services (Pty) Ltd</strong>{" "}
                (Reg. No. 2025/624300/07). The Service helps squash clubs with court bookings,
                ladder play, match tracking, events, financial management, and club communications.
                All references to &quot;SquashHub&quot; in these Terms refer to the platform
                operated by HKFT.
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
                <li>Do not attempt to access data you are not authorised to access.</li>
                <li>Do not upload malicious content or try to disrupt the Service.</li>
                <li>Do not copy, reproduce, redistribute, or reverse-engineer any part of the Service.</li>
              </ul>

              <h2>5. Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy. Please read it carefully.
              </p>

              <h2>6. Service availability</h2>
              <p>
                We aim to keep the Service available, but it may be unavailable from time to time (maintenance,
                outages, updates). Features may change or be removed at our discretion.
              </p>

              <h2>7. Disclaimers</h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum
                extent permitted by South African law, HKFT disclaims warranties of any kind, whether express or implied.
              </p>

              <h2>8. Limitation of liability</h2>
              <p>
                To the maximum extent permitted by South African law, HKFT is not liable for indirect, incidental,
                special, consequential, or punitive damages arising from your use of the Service, including
                loss of data, profits, or business opportunities.
              </p>

              <h2>9. Termination</h2>
              <p>
                You may stop using the Service at any time. HKFT may suspend or terminate access if needed to
                protect members, the club, or the Service. Upon termination, your licence to use the Service
                ceases immediately.
              </p>

              <h2>10. Intellectual property</h2>
              <p>
                All intellectual property in and relating to the Service — including but not limited to
                the SquashHub name, logo, branding, software, source code, algorithms, user interface designs,
                documentation, and all related technology — is and remains the exclusive property of{" "}
                <strong>HKFT Services (Pty) Ltd</strong>. No right, title, or interest in any intellectual
                property is transferred to you by these Terms or by your use of the Service.
              </p>
              <p>
                You may not copy, modify, distribute, sell, lease, sublicence, reverse-engineer, decompile,
                or create derivative works based on any part of the Service without the prior written consent
                of HKFT. Unauthorised use of HKFT&apos;s intellectual property may result in civil and/or criminal
                liability under South African law.
              </p>
              <p>
                Content you submit (posts, match results, avatars, and similar user-generated content) remains
                yours, but you grant HKFT a non-exclusive, royalty-free, worldwide licence to use, display,
                and distribute such content within the Service for the purpose of operating and improving the
                platform.
              </p>

              <h2>11. Fees and payments</h2>
              <p>
                HKFT may charge clubs a subscription fee for use of the Service, calculated on a per-member
                basis or as otherwise agreed. Payment terms, billing cycles, and pricing are as communicated
                to the club administrator upon subscription. HKFT reserves the right to adjust pricing with
                reasonable notice.
              </p>
              <p>
                Clubs may in turn charge their members fees (membership fees, light fees, event fees, etc.)
                through the Service. HKFT facilitates the collection and tracking of such fees but is not a
                party to the financial arrangement between clubs and their members. HKFT is not responsible
                for disputes between members and clubs regarding fees.
              </p>

              <h2>12. Governing law and jurisdiction</h2>
              <p>
                These Terms are governed by and construed in accordance with the laws of the Republic of
                South Africa. Any disputes arising from these Terms or the Service will be subject to the
                exclusive jurisdiction of the South African courts. The parties agree to submit to mediation
                before initiating litigation, where practicable.
              </p>

              <h2>13. Changes to these Terms</h2>
              <p>
                We may update these Terms from time to time. If changes are material, we will take reasonable
                steps to notify users in-app.
              </p>

              <h2>14. Entire agreement</h2>
              <p>
                These Terms, together with the Privacy Policy, constitute the entire agreement between
                you and HKFT regarding your use of the Service and supersede all prior agreements,
                representations, and understandings.
              </p>

              <h2>15. Contact</h2>
              <p>
                Questions about these Terms can be sent via the in-app Support page or by writing to:
              </p>
              <p>
                <strong>HKFT Services (Pty) Ltd</strong><br />
                Reg. No. 2025/624300/07<br />
                Republic of South Africa<br />
                <a href="mailto:support@squashhub.co.za">support@squashhub.co.za</a>
              </p>

              <p className="text-xs text-muted-foreground mt-6">
                © {new Date().getFullYear()} HKFT Services (Pty) Ltd. All rights reserved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

