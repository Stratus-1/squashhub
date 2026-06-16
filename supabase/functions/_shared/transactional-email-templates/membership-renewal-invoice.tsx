import * as React from 'npm:react@18.3.1'
import {
  Body,
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
  invoiceNumber?: string
  feeLabel?: string
  amount?: number | string
  dueDate?: string
  bankName?: string
  bankAccountName?: string
  bankAccountNumber?: string
  bankBranchCode?: string
  bankReference?: string
  paymentUrl?: string
}

const fmtAmount = (a: number | string | undefined) => {
  const n = typeof a === 'number' ? a : parseFloat(a || '0')
  return `R ${(isFinite(n) ? n : 0).toFixed(2)}`
}

const Email = ({
  memberName = 'Member',
  clubName = 'Your Club',
  invoiceNumber = '',
  feeLabel = 'Annual Membership Renewal',
  amount = 0,
  dueDate = '',
  bankName,
  bankAccountName,
  bankAccountNumber,
  bankBranchCode,
  bankReference,
  paymentUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clubName} — ${feeLabel} (${invoiceNumber})`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clubName}</Heading>
        <Text style={text}>Hi {memberName},</Text>
        <Text style={text}>
          Your annual membership renewal is coming up. Please find your invoice
          details below.
        </Text>

        <Section style={card}>
          <Row label="Invoice #" value={invoiceNumber} />
          <Row label="Item" value={feeLabel} />
          <Row label="Amount" value={fmtAmount(amount)} />
          <Row label="Due Date" value={dueDate} />
        </Section>

        {bankAccountNumber && (
          <>
            <Heading as="h2" style={h2}>Payment Details</Heading>
            <Section style={card}>
              {bankName && <Row label="Bank" value={bankName} />}
              {bankAccountName && <Row label="Account Name" value={bankAccountName} />}
              <Row label="Account #" value={bankAccountNumber} />
              {bankBranchCode && <Row label="Branch Code" value={bankBranchCode} />}
              {bankReference && <Row label="Reference" value={bankReference} />}
            </Section>
          </>
        )}

        {paymentUrl && (
          <Text style={text}>
            Or pay online:{' '}
            <a href={paymentUrl} style={{ color: '#1E3A5F' }}>
              {paymentUrl}
            </a>
          </Text>
        )}

        <Hr style={hr} />
        <Text style={muted}>
          Thank you for your continued membership at {clubName}.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <Text style={{ ...muted, margin: 0 }}>{label}</Text>
    <Text style={{ ...text, margin: 0, fontWeight: 600 }}>{value}</Text>
  </div>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.clubName || 'Club'} — ${d.feeLabel || 'Membership Renewal Invoice'} (${d.invoiceNumber || ''})`.trim(),
  displayName: 'Membership Renewal Invoice',
  previewData: {
    memberName: 'Jane Smith',
    clubName: 'Nelspruit Squash Club',
    invoiceNumber: 'NSC-2027-00042',
    feeLabel: 'Renewal Fees 2027 — Pensioners',
    amount: 850,
    dueDate: '1 March 2027',
    bankName: 'FNB',
    bankAccountName: 'Nelspruit Squash Club',
    bankAccountNumber: '1234567890',
    bankBranchCode: '250655',
    bankReference: 'NSC-00042',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const h1 = { color: '#1E3A5F', fontSize: '22px', margin: '0 0 16px' }
const h2 = { color: '#1E3A5F', fontSize: '16px', margin: '24px 0 8px' }
const text = { color: '#111', fontSize: '14px', lineHeight: '20px', margin: '8px 0' }
const muted = { color: '#666', fontSize: '13px', margin: '8px 0' }
const card = {
  backgroundColor: '#f6f8fb',
  border: '1px solid #e3e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
}
const hr = { borderColor: '#e3e8f0', margin: '24px 0' }
