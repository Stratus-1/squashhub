import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  memberName?: string
  clubName?: string
  rule?: string
  reason?: string
  effectiveDate?: string
  contactEmail?: string
}

const Email = ({ memberName = 'Member', clubName = 'Your Club', rule, reason, effectiveDate, contactEmail }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clubName}: notice of temporary suspension of membership`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>{clubName}</Heading>
        </Section>
        <Section style={content}>
          <Heading style={h2}>Notice of temporary suspension of membership</Heading>
          <Text style={p}>Dear {memberName},</Text>
          <Text style={p}>
            {rule
              ? `In accordance with ${rule} of the ${clubName} constitution and club rules, your membership is hereby temporarily suspended`
              : `In accordance with the ${clubName} constitution and club rules, your membership is hereby temporarily suspended`}
            {effectiveDate ? ` with effect from ${effectiveDate}.` : ' with immediate effect.'}
          </Text>
          {reason && (
            <Section style={box}>
              <Text style={boxLabel}>Reason</Text>
              <Text style={boxText}>{reason}</Text>
            </Section>
          )}
          <Text style={p}>
            During the suspension you can still sign in to the club app, but you cannot book courts and your door access
            has been switched off.
          </Text>
          <Text style={p}>
            Please contact the club committee{contactEmail ? ` at ${contactEmail}` : ''} to discuss the matter and
            the reinstatement of your membership.
          </Text>
          <Hr style={hr} />
          <Text style={pMuted}>Issued on behalf of the {clubName} committee.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `${d.clubName || 'Your club'}: temporary suspension of membership`,
  displayName: 'Member Suspension Notice',
  previewData: {
    memberName: 'John',
    clubName: 'Nelspruit Squash',
    rule: 'Rule 7.3',
    reason: 'Bringing visitors onto the courts without declaring or paying the visitor fee.',
    effectiveDate: '26 September 2026',
    contactEmail: 'committee@example.com',
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
const box = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', margin: '12px 0 16px' }
const boxLabel = { fontSize: '11px', color: '#92400e', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const boxText = { fontSize: '14px', color: '#451a03', margin: '4px 0 0', lineHeight: '20px' }
const hr = { border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }
