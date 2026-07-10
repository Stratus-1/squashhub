import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface FileLink { label: string; url: string; filename: string }

interface StitchOnboardingProps {
  clubName?: string
  clubUrl?: string
  contactName?: string
  contactEmail?: string
  contactCell?: string
  boardMembers?: string[]
  files?: FileLink[]
  stitchContactName?: string
  copiedTo?: string[]
}

const StitchOnboardingEmail = ({
  clubName = 'Club',
  clubUrl = '',
  contactName = '',
  contactEmail = '',
  contactCell = '',
  boardMembers = [],
  files = [],
  stitchContactName = 'Beon Pienaar',
  copiedTo = [],
}: StitchOnboardingProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Stitch account application — {clubName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Stitch account application</Heading>
        <Text style={text}>Hi {stitchContactName},</Text>
        <Text style={text}>
          <strong>{clubName}</strong> would like to open a Stitch Express bank account.
          Please find the required onboarding information and documents below.
        </Text>

        <Section style={card}>
          <Row label="Club name" value={clubName} />
          {clubUrl && <RowLink label="SquashHub URL" href={clubUrl} value={clubUrl} />}
          {contactName && <Row label="Main contact" value={contactName} />}
          {contactEmail && <Row label="Contact email" value={contactEmail} />}
          {contactCell && <Row label="Contact cell" value={contactCell} />}
        </Section>

        {boardMembers.length > 0 && (
          <>
            <Heading as="h3" style={h3}>Board members</Heading>
            <Section style={card}>
              {boardMembers.map((m, i) => (
                <Text key={i} style={listItem}>• {m}</Text>
              ))}
            </Section>
          </>
        )}

        <Heading as="h3" style={h3}>Documents (signed links, valid 7 days)</Heading>
        <Section style={card}>
          {files.map((f, i) => (
            <Text key={i} style={listItem}>
              <strong>{f.label}:</strong>{' '}
              <Link href={f.url} style={link}>{f.filename}</Link>
            </Text>
          ))}
        </Section>

        <Text style={text}>
          Please reply-all to this email to progress the application.
          {copiedTo.length > 0 && <> The following addresses are CC'd: {copiedTo.join(', ')}.</>}
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          Submitted via SquashHub on behalf of {clubName}.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={row}>
    <span style={rowLabel}>{label}</span>
    <span style={rowValue}>{value}</span>
  </div>
)
const RowLink = ({ label, value, href }: { label: string; value: string; href: string }) => (
  <div style={row}>
    <span style={rowLabel}>{label}</span>
    <span style={rowValue}><Link href={href} style={link}>{value}</Link></span>
  </div>
)

export const template = {
  component: StitchOnboardingEmail,
  subject: (d: Record<string, any>) =>
    `Stitch account application — ${d?.clubName ?? 'Club'}`,
  displayName: 'Stitch onboarding application',
  previewData: {
    clubName: 'Sample Squash Club',
    clubUrl: 'https://sample.squashhub.co.za',
    contactName: 'Jane Doe',
    contactEmail: 'jane@example.com',
    contactCell: '+27 82 000 0000',
    boardMembers: ['Jane Doe — Chair', 'John Smith — Treasurer'],
    files: [{ label: 'Constitution', filename: 'constitution.pdf', url: 'https://example.com/1' }],
    copiedTo: ['admin@stratsol.co.za', 'jane@example.com'],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '620px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#1E3A5F', margin: '0 0 16px' }
const h3 = { fontSize: '14px', fontWeight: 700, color: '#1E3A5F', margin: '20px 0 6px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 12px' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', margin: '4px 0 8px' }
const row = { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid #eef2f7' }
const rowLabel = { color: '#64748b', fontWeight: 500 }
const rowValue = { color: '#0f172a', fontWeight: 600, textAlign: 'right' as const }
const listItem = { fontSize: '13px', color: '#0f172a', margin: '4px 0' }
const link = { color: '#1E3A5F', textDecoration: 'underline' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }
