/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  memberName?: string
  amount?: string
  currency?: string
  clubName?: string
  method?: string
  description?: string
  reviewUrl?: string
  submittedAt?: string
}

const Email = ({ memberName, amount, currency, clubName, method, description, reviewUrl, submittedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Pending {method || 'EFT'} top-up from {memberName || 'a member'} awaiting approval</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>💰 Top-up awaiting approval</Heading>
        <Text style={intro}>
          A member has submitted a {method || 'EFT'} top-up{clubName ? ` at ${clubName}` : ''}. As a member of the
          finance team, please review and confirm receipt in the club admin dashboard.
        </Text>
        <Hr style={hr} />
        <Section>
          <Text style={row}><strong>Member:</strong> {memberName || '—'}</Text>
          <Text style={row}><strong>Amount:</strong> {currency || 'R'} {amount || '0.00'}</Text>
          <Text style={row}><strong>Method:</strong> {(method || 'EFT').toUpperCase()}</Text>
          {description ? <Text style={row}><strong>Description:</strong> {description}</Text> : null}
          {submittedAt ? <Text style={row}><strong>Submitted:</strong> {submittedAt}</Text> : null}
        </Section>
        {reviewUrl ? (
          <>
            <Hr style={hr} />
            <Text style={{ margin: '16px 0' }}>
              <Link href={reviewUrl} style={btn}>Review & confirm →</Link>
            </Text>
          </>
        ) : null}
        <Hr style={hr} />
        <Text style={foot}>
          You’re receiving this because you have Finance / Treasurer permissions on {clubName || 'this club'}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `[${d.clubName || 'SquashHub'}] Top-up pending approval — ${d.currency || 'R'}${d.amount || ''} from ${d.memberName || 'member'}`,
  displayName: 'Finance — EFT top-up pending approval',
  previewData: {
    memberName: 'John Doe',
    amount: '500.00',
    currency: 'R',
    clubName: 'Riverside Squash',
    method: 'EFT',
    description: 'Wallet top-up of R500.00',
    reviewUrl: 'https://squashhub.co.za/club-admin?tab=finance',
    submittedAt: '2026-07-20 14:15',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1E3A5F', fontSize: '20px', margin: '0 0 12px' }
const intro = { color: '#374151', fontSize: '14px', lineHeight: '1.6', margin: '0 0 8px' }
const row = { color: '#111827', fontSize: '14px', margin: '4px 0' }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const btn = {
  display: 'inline-block',
  background: '#1E3A5F',
  color: '#ffffff',
  padding: '10px 16px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 600,
}
const foot = { color: '#6b7280', fontSize: '12px', margin: '8px 0 0' }
