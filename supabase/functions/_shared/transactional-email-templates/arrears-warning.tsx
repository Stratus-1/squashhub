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
  memberName?: string
  clubName?: string
  outstanding?: number | string
  daysRemaining?: number
  isSuspended?: boolean
  graceMessage?: string
  payUrl?: string
}

const fmt = (a: number | string | undefined) => {
  const n = typeof a === 'number' ? a : parseFloat(a || '0')
  return `R ${(isFinite(n) ? n : 0).toFixed(2)}`
}

const Email = ({
  memberName = 'Member',
  clubName = 'Your Club',
  outstanding = 0,
  daysRemaining = 7,
  isSuspended = false,
  graceMessage,
  payUrl = '#',
}: Props) => {
  const headline = isSuspended
    ? 'Your account has been suspended'
    : daysRemaining <= 1
      ? 'Final notice — account will be suspended tomorrow'
      : `Reminder — account in arrears (${daysRemaining} days until suspension)`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {isSuspended
          ? `${clubName}: settle ${fmt(outstanding)} to restore access.`
          : `${clubName}: ${fmt(outstanding)} outstanding — ${daysRemaining} days until suspension.`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>{clubName}</Heading>
          </Section>
          <Section style={content}>
            <Heading style={h2}>{headline}</Heading>
            <Text style={p}>Hi {memberName},</Text>
            <Text style={p}>
              {isSuspended
                ? `Your club account is currently suspended for arrears. You can still sign in and pay, but you cannot book courts, open doors, or use other club features until your account is settled.`
                : `Your club account is in arrears. If it is not settled within ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}, your access to bookings, doors, and other club features will be suspended automatically.`}
            </Text>
            <Section style={amountBox}>
              <Text style={amountLabel}>Outstanding balance</Text>
              <Text style={amountValue}>{fmt(outstanding)}</Text>
            </Section>
            {graceMessage && <Text style={pMuted}>{graceMessage}</Text>}
            <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
              <Button href={payUrl} style={cta}>Pay now</Button>
            </Section>
            <Hr style={hr} />
            <Text style={pMuted}>
              If you have already paid, please ignore this message — allow up to 24 hours for the payment to reflect.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data.isSuspended
      ? `${data.clubName || 'Your club'}: account suspended — settle ${fmt(data.outstanding)}`
      : `${data.clubName || 'Your club'}: ${data.daysRemaining ?? 7} day${(data.daysRemaining ?? 7) === 1 ? '' : 's'} until suspension`,
  displayName: 'Arrears Warning',
  previewData: {
    memberName: 'Jane',
    clubName: 'CSIR Squash',
    outstanding: 750,
    daysRemaining: 3,
    isSuspended: false,
    graceMessage: 'Please settle outstanding fees to avoid suspension.',
    payUrl: 'https://squashhub.co.za/account#fees',
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
const amountBox = { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', textAlign: 'center' as const, margin: '16px 0' }
const amountLabel = { fontSize: '12px', color: '#7f1d1d', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const amountValue = { fontSize: '28px', color: '#991b1b', fontWeight: 700, margin: '4px 0 0' }
const cta = { backgroundColor: '#1E3A5F', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }
const hr = { border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }
