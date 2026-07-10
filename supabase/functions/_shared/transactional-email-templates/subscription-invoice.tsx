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
  invoiceNumber?: string
  planName?: string
  billingCycle?: string
  periodStart?: string
  periodEnd?: string
  memberCount?: number | string
  pricePerMember?: number | string
  minimumCharge?: number | string
  subtotal?: number | string
  vatAmount?: number | string
  total?: number | string
  currency?: string
  dueDate?: string
  companyName?: string
  tradingAs?: string
  vatNumber?: string
  registrationNumber?: string
  billingEmail?: string
  billingPhone?: string
  address?: string
  bankName?: string
  bankAccountName?: string
  bankAccountNumber?: string
  bankBranchCode?: string
  bankSwift?: string
  logoUrl?: string
  invoiceFooter?: string
  payLink?: string
  manageUrl?: string
}

const money = (v: number | string | undefined, ccy = 'ZAR') => {
  const n = typeof v === 'number' ? v : parseFloat(v || '0')
  const sym = ccy === 'ZAR' ? 'R' : ccy + ' '
  return `${sym} ${(isFinite(n) ? n : 0).toFixed(2)}`
}

const Email = (p: Props) => {
  const {
    clubName = 'Club',
    invoiceNumber = '',
    planName = '',
    billingCycle = 'monthly',
    periodStart = '',
    periodEnd = '',
    memberCount = 0,
    pricePerMember = 0,
    minimumCharge = 0,
    subtotal = 0,
    vatAmount = 0,
    total = 0,
    currency = 'ZAR',
    dueDate = '',
    companyName = 'SquashHub',
    tradingAs,
    vatNumber,
    registrationNumber,
    billingEmail,
    billingPhone,
    address,
    bankName,
    bankAccountName,
    bankAccountNumber,
    bankBranchCode,
    bankSwift,
    logoUrl,
    invoiceFooter,
    payLink,
    manageUrl,
  } = p

  const senderName = tradingAs || companyName

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${senderName} — Invoice ${invoiceNumber} for ${clubName}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl && (
            <Section style={{ textAlign: 'center', marginBottom: '12px' }}>
              <Img
                src={logoUrl}
                alt={senderName}
                width="140"
                style={{ height: 'auto', maxHeight: '48px', maxWidth: '140px', margin: '0 auto', display: 'block' }}
              />
            </Section>
          )}
          <Heading style={h1}>Tax Invoice</Heading>

          <Section style={metaRow}>
            <div style={{ flex: 1 }}>
              <Text style={muted}>From</Text>
              <Text style={strong}>{companyName}</Text>
              {tradingAs && <Text style={text}>t/a {tradingAs}</Text>}
              {address && <Text style={text}>{address}</Text>}
              {vatNumber && <Text style={muted}>VAT: {vatNumber}</Text>}
              {registrationNumber && <Text style={muted}>Reg: {registrationNumber}</Text>}
              {billingEmail && <Text style={muted}>{billingEmail}</Text>}
              {billingPhone && <Text style={muted}>{billingPhone}</Text>}
            </div>
            <div style={{ flex: 1, textAlign: 'right' as const }}>
              <Text style={muted}>Invoice #</Text>
              <Text style={strong}>{invoiceNumber}</Text>
              <Text style={muted}>Billed To</Text>
              <Text style={strong}>{clubName}</Text>
              {dueDate && (
                <>
                  <Text style={muted}>Due Date</Text>
                  <Text style={text}>{dueDate}</Text>
                </>
              )}
            </div>
          </Section>

          <Section style={card}>
            <Row label="Plan" value={planName} />
            <Row label="Billing Cycle" value={billingCycle} />
            <Row label="Billing Period" value={`${periodStart} → ${periodEnd}`} />
            <Row label="Members" value={String(memberCount)} />
            <Row label="Price / Member" value={money(pricePerMember, currency)} />
            {Number(minimumCharge) > 0 && (
              <Row label="Minimum Charge" value={money(minimumCharge, currency)} />
            )}
            <Hr style={hr} />
            <Row label="Subtotal" value={money(subtotal, currency)} />
            {Number(vatAmount) > 0 && (
              <Row label="VAT" value={money(vatAmount, currency)} />
            )}
            <Row label="Total Due" value={money(total, currency)} bold />
          </Section>

          {(payLink || manageUrl) && (
            <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
              {payLink && (
                <Button href={payLink} style={payBtn}>
                  Pay with Card via Stitch
                </Button>
              )}
              {manageUrl && (
                <Text style={{ ...muted, marginTop: '10px' }}>
                  Or view/manage this invoice in your club admin:{' '}
                  <a href={manageUrl} style={{ color: '#1E3A5F' }}>{manageUrl}</a>
                </Text>
              )}
            </Section>
          )}

          {bankAccountNumber && (
            <>
              <Heading as="h2" style={h2}>Or Pay by EFT</Heading>
              <Section style={card}>
                {bankName && <Row label="Bank" value={bankName} />}
                {bankAccountName && <Row label="Account Name" value={bankAccountName} />}
                <Row label="Account #" value={bankAccountNumber} />
                {bankBranchCode && <Row label="Branch Code" value={bankBranchCode} />}
                {bankSwift && <Row label="SWIFT" value={bankSwift} />}
                <Row label="Reference" value={invoiceNumber} />
              </Section>
            </>
          )}

          {invoiceFooter && (
            <>
              <Hr style={hr} />
              <Text style={muted}>{invoiceFooter}</Text>
            </>
          )}

          <Hr style={hr} />
          <Text style={muted}>Thank you for using {senderName}.</Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
    <Text style={{ ...muted, margin: 0 }}>{label}</Text>
    <Text style={{ ...text, margin: 0, fontWeight: bold ? 700 : 600, fontSize: bold ? '15px' : '14px' }}>{value}</Text>
  </div>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.tradingAs || d.companyName || 'SquashHub'} — Invoice ${d.invoiceNumber || ''} (${d.clubName || ''})`.trim(),
  displayName: 'Platform Subscription Invoice',
  previewData: {
    clubName: 'Nelspruit Squash Club',
    invoiceNumber: 'INV-2026-00042',
    planName: 'Standard Monthly',
    billingCycle: 'monthly',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    memberCount: 48,
    pricePerMember: 6,
    minimumCharge: 0,
    subtotal: 288,
    vatAmount: 43.2,
    total: 331.2,
    currency: 'ZAR',
    dueDate: '2026-08-15',
    companyName: 'Straight to Software Solutions (Pty) Ltd',
    tradingAs: 'SquashHub',
    vatNumber: '4123456789',
    billingEmail: 'billing@squashhub.co.za',
    bankName: 'FNB',
    bankAccountName: 'Straight to Software Solutions',
    bankAccountNumber: '1234567890',
    bankBranchCode: '250655',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1E3A5F', fontSize: '22px', margin: '0 0 16px' }
const h2 = { color: '#1E3A5F', fontSize: '16px', margin: '24px 0 8px' }
const text = { color: '#111', fontSize: '14px', lineHeight: '20px', margin: '4px 0' }
const strong = { color: '#111', fontSize: '14px', fontWeight: 700, margin: '4px 0' }
const muted = { color: '#666', fontSize: '12px', margin: '4px 0' }
const metaRow = { display: 'flex', gap: '24px', marginBottom: '16px' }
const card = {
  backgroundColor: '#f6f8fb',
  border: '1px solid #e3e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
}
const hr = { borderColor: '#e3e8f0', margin: '16px 0' }
const payBtn = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
