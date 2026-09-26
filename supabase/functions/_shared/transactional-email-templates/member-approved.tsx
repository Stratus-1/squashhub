import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  memberName?: string
  clubName?: string
  contactEmail?: string
}

const Email = ({ memberName = 'Member', clubName = 'Your Club', contactEmail }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clubName}: your membership has been approved`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>{clubName}</Heading>
        </Section>
        <Section style={content}>
          <Heading style={h2}>Welcome to {clubName}</Heading>
          <Text style={p}>Dear {memberName},</Text>
          <Text style={p}>
            Good news — your membership application at {clubName} has been approved. Your membership is now active.
          </Text>
          <Text style={p}>
            You can sign in to the club app to book courts, view the ladder, enter competitions and manage your
            account.
          </Text>
          <Text style={p}>
            If you have any questions, please contact the club committee{contactEmail ? ` at ${contactEmail}` : ''}.
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
  subject: (d: Record<string, any>) => `${d.clubName || 'Your club'}: membership approved`,
  displayName: 'Member Approval Confirmation',
  previewData: {
    memberName: 'John',
    clubName: 'Nelspruit Squash',
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
const hr = { border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }
