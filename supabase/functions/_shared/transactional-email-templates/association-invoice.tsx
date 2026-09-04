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

interface Line {
  label: string
  units: number
  unit_amount: number
  amount: number
}

interface Props {
  clubName?: string
  associationName?: string
  invoiceNumber?: string
  seasonYear?: number | string
  issuedAt?: string
  currency?: string
  total?: number
  lines?: Line[]
}

const money = (currency: string, v: number) =>
  `${currency} ${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const Email = ({
  clubName = 'Your club',
  associationName = 'Your association',
  invoiceNumber = 'INV',
  seasonYear = '',
  issuedAt = '',
  currency = 'R',
  total = 0,
  lines = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${associationName} invoice ${invoiceNumber} for ${clubName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Affiliation invoice {invoiceNumber}</Heading>
        <Text style={text}>
          {associationName} has issued an invoice to {clubName} for the {String(seasonYear)} season,
          based on the teams and players your club submitted.
        </Text>
        {issuedAt ? <Text style={muted}>Issued: {issuedAt}</Text> : null}

        <Hr style={hr} />

        <Section>
          {lines.map((l, i) => (
            <Text key={i} style={lineText}>
              <strong>{l.label}</strong>
              {' — '}
              {l.units} × {money(currency, l.unit_amount)} ={' '}
              {money(currency, l.amount)}
            </Text>
          ))}
        </Section>

        <Hr style={hr} />

        <Text style={totalText}>Total due: {money(currency, total)}</Text>

        <Text style={muted}>
          Record your payment and upload proof of payment in SquashHub under Club Admin → Fees →
          Affiliation billing. The association is notified automatically.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Affiliation invoice ${d?.invoiceNumber ?? ''} — ${d?.associationName ?? 'Association'} ${d?.seasonYear ?? ''}`.trim(),
  displayName: 'Association affiliation invoice',
  previewData: {
    clubName: 'Riverside Squash Club',
    associationName: 'Northern Squash Association',
    invoiceNumber: 'INV-2027-0001',
    seasonYear: 2027,
    issuedAt: '4 September 2026',
    currency: 'R',
    total: 22480,
    lines: [
      { label: 'Club affiliation fee', units: 1, unit_amount: 2000, amount: 2000 },
      { label: 'Team fee', units: 9, unit_amount: 1600, amount: 14400 },
      { label: 'Member fee', units: 38, unit_amount: 160, amount: 6080 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '20px', color: '#1E3A5F', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#1f2937', lineHeight: '22px' }
const muted = { fontSize: '12px', color: '#6b7280', lineHeight: '20px' }
const lineText = { fontSize: '14px', color: '#1f2937', margin: '4px 0' }
const totalText = { fontSize: '16px', color: '#1E3A5F', fontWeight: 700 as const }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
