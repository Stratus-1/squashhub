import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Column,
  Row,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clubName?: string
  recipientName?: string
  trialEndDate?: string
  billingStartDate?: string
  daysRemaining?: number
  memberCount?: number
  estimatedMonthly?: string
  subscriptionUrl?: string
  clubLogoUrl?: string
}

const Email = ({
  clubName = 'Your Club',
  recipientName = 'there',
  trialEndDate = '',
  billingStartDate = '',
  daysRemaining = 10,
  memberCount,
  estimatedMonthly,
  subscriptionUrl = 'https://squashhub.co.za',
  clubLogoUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clubName}: your SquashHub subscription starts ${billingStartDate} — trial ends in ${daysRemaining} days.`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Row>
            <Column style={{ verticalAlign: 'middle' as const }}>
              <Img
                src="https://squashhub.co.za/pwa-192x192.png"
                width="40"
                height="40"
                alt="SquashHub"
                style={logoImg}
              />
            </Column>
            <Column style={{ verticalAlign: 'middle' as const, paddingLeft: '10px' }}>
              <Heading style={h1}>SquashHub</Heading>
            </Column>
            {clubLogoUrl && (
              <Column style={{ verticalAlign: 'middle' as const, textAlign: 'right' as const }}>
                <Img
                  src={clubLogoUrl}
                  height="40"
                  alt={clubName}
                  style={clubLogoImg}
                />
              </Column>
            )}
          </Row>
        </Section>

        <Section style={content}>
          <Heading style={h2}>Your free trial ends in {daysRemaining} days</Heading>
          <Text style={p}>Dear {clubName} management,</Text>
          <Text style={p}>
            Thank you for using {clubName} on SquashHub. Your free trial period ends
            on <strong>{trialEndDate}</strong>, and your subscription will start on{' '}
            <strong>{billingStartDate}</strong>.
          </Text>

          <Section style={box}>
            <Text style={boxLine}>Trial ends: <strong>{trialEndDate}</strong></Text>
            <Text style={boxLine}>Subscription starts: <strong>{billingStartDate}</strong></Text>
            {typeof memberCount === 'number' && (
              <Text style={boxLine}>Active members: <strong>{memberCount}</strong></Text>
            )}
            {estimatedMonthly && (
              <Text style={boxLine}>Estimated monthly fee: <strong>{estimatedMonthly}</strong> (excl. VAT)</Text>
            )}
          </Section>

          <Text style={p}>
            Before your first invoice is issued, please complete three short steps in the app under{' '}
            <strong>Club Admin → Subscription</strong>:
          </Text>
          <Text style={p}>
            <strong>1. Club Participation — accept the SLA</strong> — the chairman, captain or an
            authorised office bearer must accept the SquashHub Service Level Agreement on the
            Subscription tab. Until this is done your club shows as{' '}
            <em>participation not active</em>.
            <br />
            <strong>2. Billing Information</strong> — confirm your billing contact, company details,
            billing email addresses and VAT number so your invoices are correct.
            <br />
            <strong>3. Subscription</strong> — choose how often you want to be invoiced (monthly,
            six-monthly upfront at 5% off, or annually upfront at 10% off) and whether you prefer to
            pay by <strong>EFT</strong> or by <strong>card</strong>.
          </Text>
          <Text style={pMuted}>
            Your club stays fully active throughout the trial and afterwards — access is only
            suspended if an invoice goes unpaid. You can still pay any individual invoice by either
            method; this simply tells us your default so we can bill you the way that suits your
            club.
          </Text>


          <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
            <Button href={subscriptionUrl} style={cta}>Accept SLA & complete billing setup</Button>
          </Section>

          <Hr style={hr} />
          <Text style={pMuted}>
            Sliding-scale pricing means the more members you have, the lower your average cost per
            member. Full terms are in the SquashHub SLA available in the app.
          </Text>
          <Text style={pMuted}>
            Questions? Simply reply to this email and the SquashHub team will assist.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.clubName || 'Your club'} — SquashHub subscription starts ${d.billingStartDate || 'soon'}`,
  displayName: 'Trial Ending — Subscription Starting',
  previewData: {
    clubName: 'Riverside Squash Club',
    recipientName: 'Johan',
    trialEndDate: '28 August 2026',
    billingStartDate: '1 September 2026',
    daysRemaining: 10,
    memberCount: 84,
    estimatedMonthly: 'R 462.00',
    subscriptionUrl: 'https://riverside.squashhub.co.za/club-admin?tab=subscription',
    clubLogoUrl: '',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '20px 0' }
const header = { padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }
const logoImg = { display: 'block', borderRadius: '8px' }
const clubLogoImg = { display: 'inline-block', maxHeight: '40px', maxWidth: '120px' }
const h1 = { margin: 0, fontSize: '18px', color: '#1E3A5F' }
const content = { padding: '24px' }
const h2 = { fontSize: '20px', color: '#0f172a', margin: '0 0 12px' }
const p = { fontSize: '14px', color: '#334155', lineHeight: '22px', margin: '0 0 12px' }
const pMuted = { fontSize: '12px', color: '#64748b', lineHeight: '18px', margin: '0 0 8px' }
const box = {
  backgroundColor: '#f6f8fb',
  border: '1px solid #e3e8f0',
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
