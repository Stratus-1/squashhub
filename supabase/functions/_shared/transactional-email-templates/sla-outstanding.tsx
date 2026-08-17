import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clubName?: string
  recipientName?: string
  trialEndDate?: string
  daysSinceTrialEnd?: number
  invoicesPaid?: boolean
  subscriptionUrl?: string
}

const Email = ({
  clubName = 'Your Club',
  recipientName = 'there',
  trialEndDate = '',
  daysSinceTrialEnd = 10,
  invoicesPaid = false,
  subscriptionUrl = 'https://squashhub.co.za',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clubName}: your SquashHub Service Level Agreement is still outstanding.`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>SquashHub</Heading>
        </Section>
        <Section style={content}>
          <Heading style={h2}>Please complete your SLA</Heading>
          <Text style={p}>Hi {recipientName},</Text>
          <Text style={p}>
            Your SquashHub trial for <strong>{clubName}</strong> ended
            {trialEndDate ? <> on <strong>{trialEndDate}</strong></> : null}
            {daysSinceTrialEnd ? <> ({daysSinceTrialEnd} days ago)</> : null}, but we have not yet
            received your signed <strong>Service Level Agreement</strong>.
          </Text>

          <Section style={box}>
            <Text style={boxLine}>
              Service Level Agreement: <strong>not yet accepted</strong>
            </Text>
            <Text style={boxLine}>
              Invoices: <strong>{invoicesPaid ? 'up to date — thank you' : 'payment outstanding'}</strong>
            </Text>
          </Section>

          <Text style={p}>
            A club is only marked <strong>fully active</strong> once both the SLA has been accepted
            and the first invoice has been paid. Accepting takes under a minute: open{' '}
            <strong>Club Admin → Subscription → Club Participation</strong>, enter the name and role
            of the authorised office bearer, and tick the acceptance box.
          </Text>

          <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
            <Button href={subscriptionUrl} style={cta}>Accept the SLA now</Button>
          </Section>

          <Hr style={hr} />
          <Text style={pMuted}>
            You will keep receiving this reminder every {daysSinceTrialEnd ? '10' : '10'} days until
            the agreement is accepted. Questions? Simply reply to this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.clubName || 'Your club'} — SquashHub SLA still outstanding`,
  displayName: 'SLA Outstanding Reminder',
  previewData: {
    clubName: 'Riverside Squash Club',
    recipientName: 'Johan',
    trialEndDate: '28 August 2026',
    daysSinceTrialEnd: 10,
    invoicesPaid: true,
    subscriptionUrl: 'https://riverside.squashhub.co.za/club-admin?tab=subscription',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '20px 0' }
const header = { padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }
const h1 = { margin: 0, fontSize: '18px', color: '#1E3A5F' }
const content = { padding: '24px' }
const h2 = { fontSize: '20px', color: '#0f172a', margin: '0 0 12px' }
const p = { fontSize: '14px', color: '#334155', lineHeight: '22px', margin: '0 0 12px' }
const pMuted = { fontSize: '12px', color: '#64748b', lineHeight: '18px', margin: '0 0 8px' }
const box = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '16px 0',
}
const boxLine = { fontSize: '13px', color: '#334155', margin: '4px 0' }
const cta = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
}
const hr = { border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }
