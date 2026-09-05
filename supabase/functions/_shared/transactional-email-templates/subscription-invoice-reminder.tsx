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
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clubName?: string
  recipientName?: string
  invoiceNumber?: string
  amount?: string
  dueDate?: string
  payUrl?: string
  clubLogoUrl?: string
}

const Email = ({
  clubName = 'Your club',
  recipientName = 'there',
  invoiceNumber = '',
  amount = '',
  dueDate = '',
  payUrl,
  clubLogoUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Invoice ${invoiceNumber} is due tomorrow, ${dueDate}.`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          {clubLogoUrl && (
            <Img src={clubLogoUrl} alt={clubName} width="48" height="48" style={{ marginBottom: 8 }} />
          )}
          <Heading style={h1}>SquashHub</Heading>
        </Section>
        <Section style={content}>
          <Heading style={h2}>Payment reminder</Heading>
          <Text style={p}>Hi {recipientName},</Text>
          <Text style={p}>
            This is a friendly reminder that invoice {invoiceNumber} for {clubName}, {amount}, is due
            tomorrow, {dueDate}.
          </Text>
          <Section style={amountBox}>
            <Text style={amountLabel}>Amount due</Text>
            <Text style={amountValue}>{amount}</Text>
            <Text style={amountLabel}>{`Due ${dueDate}`}</Text>
          </Section>
          <Text style={p}>
            Please settle by the due date to keep your subscription active — if payment is not
            received, the subscription may be suspended shortly after the due date.
          </Text>
          {payUrl && (
            <Section style={{ textAlign: 'center' as const, marginTop: 20 }}>
              <Button href={payUrl} style={cta}>Pay now</Button>
            </Section>
          )}
          <Hr style={hr} />
          <Text style={pMuted}>
            If you have already paid, please ignore this message; payments can take up to 24 hours to
            reflect.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Payment reminder — invoice ${data.invoiceNumber || ''} is due tomorrow`,
  displayName: 'Subscription Invoice Reminder',
  previewData: {
    clubName: 'Gordons Bay Squash Club',
    recipientName: 'Willem',
    invoiceNumber: 'INSH-2026-00003',
    amount: 'R 198.00',
    dueDate: '7 September 2026',
    payUrl: 'https://squashhub.co.za/club-admin?tab=subscription',
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
const amountBox = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '16px 0',
}
const amountLabel = {
  fontSize: '12px',
  color: '#64748b',
  margin: 0,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
const amountValue = { fontSize: '28px', color: '#1E3A5F', fontWeight: 700, margin: '4px 0' }
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
