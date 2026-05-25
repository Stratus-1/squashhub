/**
 * SquashHub Service Level Agreement — canonical content.
 * Update SLA_VERSION whenever the terms change materially so existing
 * acceptances can be flagged as needing re-acceptance.
 */
export const SLA_VERSION = "1.0";
export const SLA_EFFECTIVE_DATE = "25 May 2026";

export function SquashHubSlaContent() {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <p className="text-xs text-muted-foreground">Version {SLA_VERSION} · Effective {SLA_EFFECTIVE_DATE}</p>

      <p>
        This Service Level Agreement (the &quot;<strong>SLA</strong>&quot;) is entered into
        between <strong>Stratus Software Solutions (Pty) Ltd</strong> (Reg. No. 2026/386351/07),
        the operator of the SquashHub platform (the &quot;<strong>Provider</strong>&quot;), and
        the squash club identified on the activation record (the &quot;<strong>Club</strong>&quot;).
        It governs the Club&apos;s use of the SquashHub membership, ladder, booking, league and
        financial management platform (the &quot;<strong>Service</strong>&quot;).
      </p>

      <h2>1. Subscription &amp; Fees</h2>
      <ul>
        <li>
          <strong>Billing commencement:</strong> Subscription fees are first invoiced from
          <strong> 1 September 2025</strong>, covering the remainder of the 2025/2026 financial year,
          and annually (or monthly, depending on the chosen billing option) thereafter.
        </li>
        <li>
          <strong>Monthly billing:</strong> R6.00 per active member per month, billed monthly in arrears.
        </li>
        <li>
          <strong>Annual upfront billing:</strong> R5.00 per active member per month
          (R60.00 per member per year), payable annually in advance — a saving of R12 per member per year.
        </li>
        <li>
          An &quot;active member&quot; is any member with an active status on the platform at the
          time of invoicing. Visitors, archived members and pending sign-ups are not billable.
        </li>
        <li>
          Fees are exclusive of VAT where applicable and are quoted in South African Rand (ZAR).
        </li>
        <li>
          Fee adjustments require at least <strong>60 days&apos; written notice</strong> to the Club.
        </li>
      </ul>


      <h2>2. Service Availability</h2>
      <p>
        The Provider will use commercially reasonable efforts to maintain monthly uptime of
        <strong> 99.5%</strong>, measured outside of scheduled maintenance windows. Scheduled
        maintenance will, where reasonably possible, be performed outside South African business
        hours (08:00–17:00 SAST, Monday to Friday) and announced at least 48 hours in advance.
      </p>

      <h2>3. Maintenance &amp; Updates</h2>
      <ul>
        <li>Routine security patches and platform updates are included at no additional cost.</li>
        <li>New features released on the SquashHub platform are made available to the Club automatically.</li>
        <li>
          Emergency maintenance may be performed without prior notice where required to
          protect platform integrity, security or customer data.
        </li>
      </ul>

      <h2>4. Support</h2>
      <ul>
        <li>Email and in-app support: response within <strong>1 business day</strong>.</li>
        <li>Critical incidents (platform unavailable): acknowledged within <strong>4 business hours</strong>.</li>
        <li>Self-service knowledge base and in-app help available 24/7.</li>
      </ul>

      <h2>5. Data Protection &amp; Security</h2>
      <ul>
        <li>Customer data is encrypted in transit (TLS 1.2+) and at rest using industry-standard AES-256 encryption.</li>
        <li>
          The Provider acts as <strong>Operator</strong> as defined in the Protection of Personal
          Information Act, 2013 (POPIA) and will process Club data solely for the purpose of providing the Service.
        </li>
        <li>Automated daily backups are retained for a minimum of 30 days.</li>
        <li>
          Role-based access controls and audit logging are enforced; Provider staff access to Club
          data is restricted to authorised personnel on a strict need-to-know basis.
        </li>
        <li>
          Security incidents that materially affect Club data will be reported to the Club within
          72 hours of confirmation.
        </li>
      </ul>

      <h2>6. Data Ownership</h2>
      <p>
        All Club data — including member records, match results, ladder positions, financial
        transactions and uploaded documents — remains the sole property of the Club. The Provider
        claims no ownership over, and will not sell, license or use Club data for marketing purposes.
      </p>

      <h2>7. Term, Renewal &amp; Termination</h2>
      <ul>
        <li>This SLA commences on the date of acceptance and remains in force for the chosen billing cycle.</li>
        <li>
          Subscriptions renew automatically at the end of each billing cycle unless cancelled by
          either party with at least <strong>30 days&apos; written notice</strong> prior to renewal.
        </li>
        <li>Either party may terminate immediately for material breach not remedied within 14 days of written notice.</li>
        <li>Paid subscription fees are non-refundable except where required by law.</li>
      </ul>

      <h2>8. Data Export &amp; Deletion on Termination</h2>
      <ul>
        <li>
          Upon termination, the Club may, within <strong>30 days</strong>, export all member,
          financial and document data in standard formats (CSV, PDF) through the in-app export
          tools or by written request to support.
        </li>
        <li>
          After the 30-day export window, all Club data will be <strong>permanently deleted</strong>{" "}
          from production systems within a further 30 days, and from encrypted backups within 90 days,
          save where retention is required by law.
        </li>
        <li>A written confirmation of deletion will be provided on request.</li>
      </ul>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, the Provider&apos;s total liability arising out of
        or in connection with the Service is limited to the fees paid by the Club in the 12 months
        preceding the event giving rise to the claim. The Provider is not liable for indirect,
        incidental, special or consequential damages.
      </p>

      <h2>10. Acceptable Use</h2>
      <p>
        The Club agrees not to use the Service to store or transmit unlawful content, to interfere
        with platform security, or to misrepresent member numbers in order to reduce billable fees.
      </p>

      <h2>11. Changes to this SLA</h2>
      <p>
        Material changes to this SLA will be communicated at least 30 days in advance. Continued use
        of the Service after the effective date constitutes acceptance of the revised SLA.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        This SLA is governed by the laws of the Republic of South Africa. Disputes will be resolved
        in the courts of competent jurisdiction in South Africa.
      </p>

      <p className="text-sm">
        <strong>Provider:</strong> Stratus Software Solutions (Pty) Ltd · <strong>Platform:</strong> SquashHub
      </p>
    </div>
  );
}
