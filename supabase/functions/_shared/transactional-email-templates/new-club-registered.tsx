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

interface NewClubRegisteredProps {
  clubName?: string
  subdomain?: string
  tenantType?: string
  founderName?: string
  founderEmail?: string
  founderPhone?: string
  registeredAt?: string
  adminUrl?: string
}

const NewClubRegisteredEmail = ({
  clubName = 'New Club',
  subdomain = '',
  tenantType = 'club',
  founderName = '',
  founderEmail = '',
  founderPhone = '',
  registeredAt = '',
  adminUrl = 'https://squashhub.co.za/super-admin/clubs',
}: NewClubRegisteredProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New {tenantType} registered: {clubName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New {tenantType} registered 🎉</Heading>
        <Text style={text}>
          A new {tenantType} just signed up on SquashHub.
        </Text>

        <Section style={card}>
          <Row label="Name" value={clubName} />
          {subdomain && <Row label="Subdomain" value={`${subdomain}.squashhub.co.za`} />}
          <Row label="Type" value={tenantType} />
          {founderName && <Row label="Founder" value={founderName} />}
          {founderEmail && <Row label="Email" value={founderEmail} />}
          {founderPhone && <Row label="Phone" value={founderPhone} />}
          {registeredAt && <Row label="Registered" value={registeredAt} />}
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
          <Button href={adminUrl} style={button}>
            View in Super Admin
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          You're receiving this because you're a SquashHub platform admin.
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

export const template = {
  component: NewClubRegisteredEmail,
  subject: (d: Record<string, any>) =>
    `New ${d?.tenantType ?? 'club'} registered: ${d?.clubName ?? 'Unknown'}`,
  displayName: 'New club registered (Super Admin)',
  previewData: {
    clubName: 'Sample Squash Club',
    subdomain: 'sample',
    tenantType: 'club',
    founderName: 'Jane Doe',
    founderEmail: 'jane@example.com',
    registeredAt: new Date().toISOString(),
    adminUrl: 'https://squashhub.co.za/super-admin/clubs',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#1E3A5F', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 20px' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '8px 0 8px',
}
const row = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '6px 0',
  fontSize: '13px',
  borderBottom: '1px solid #eef2f7',
}
const rowLabel = { color: '#64748b', fontWeight: 500 }
const rowValue = { color: '#0f172a', fontWeight: 600, textAlign: 'right' as const }
const button = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }
