/// <reference types="npm:@types/react@18.3.1" />
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

interface Entry {
  name: string
  email: string
  phone?: string
  status: string
  division?: string
  partner?: string
  emailed?: boolean
  message?: string
}

interface Props {
  clubName?: string
  tournamentName?: string
  importedBy?: string
  summary?: {
    total?: number
    created?: number
    linked?: number
    already?: number
    errors?: number
    emails_queued?: number
  }
  entries?: Entry[]
}

const STATUS_LABEL: Record<string, string> = {
  created: 'New — account created',
  linked_visitor: 'Linked as visitor',
  already_member: 'Already a member',
  error: 'Error',
  skipped: 'Skipped',
}

const Email = ({
  clubName = 'the club',
  tournamentName = 'the tournament',
  importedBy,
  summary = {},
  entries = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Bulk import summary — {String(entries.length)} entrant{entries.length === 1 ? '' : 's'} processed
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tournament import summary</Heading>
        <Text style={sub}>
          {clubName} · {tournamentName}
          {importedBy ? ` · imported by ${importedBy}` : ''}
        </Text>

        <Section style={statsBox}>
          <Text style={statLine}><b>Total processed:</b> {summary.total ?? entries.length}</Text>
          <Text style={statLine}><b>New accounts created:</b> {summary.created ?? 0}</Text>
          <Text style={statLine}><b>Existing accounts linked as visitors:</b> {summary.linked ?? 0}</Text>
          <Text style={statLine}><b>Already club members (skipped):</b> {summary.already ?? 0}</Text>
          <Text style={statLine}><b>Magic-link emails queued:</b> {summary.emails_queued ?? 0}</Text>
          {(summary.errors ?? 0) > 0 && (
            <Text style={{ ...statLine, color: '#b91c1c' }}><b>Errors:</b> {summary.errors}</Text>
          )}
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Entrants</Heading>
        <table style={table as any} cellPadding={0} cellSpacing={0}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Phone</th>
              <th style={th}>Division</th>
              <th style={th}>Partner</th>
              <th style={th}>Status</th>
              <th style={th}>Emailed</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={i % 2 === 0 ? trEven : trOdd}>
                <td style={td}>{e.name || '—'}</td>
                <td style={td}>{e.email || '—'}</td>
                <td style={td}>{e.phone || '—'}</td>
                <td style={td}>{e.division || '—'}</td>
                <td style={td}>{e.partner || '—'}</td>
                <td style={{ ...td, color: e.status === 'error' ? '#b91c1c' : '#1E3A5F' }}>
                  {STATUS_LABEL[e.status] || e.status}
                  {e.message ? ` — ${e.message}` : ''}
                </td>
                <td style={td}>{e.emailed ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Hr style={hr} />
        <Text style={foot}>
          This is an admin copy so the club can see which entrants received the tournament sign-in
          email. Recipients received their own magic-link email individually.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Tournament import summary — ${data?.tournamentName || 'tournament'} (${(data?.entries || []).length} entrants)`,
  displayName: 'Tournament import summary (admin copy)',
  previewData: {
    clubName: 'Nelspruit Squash Club',
    tournamentName: 'Nelspruit Doubles 2026',
    importedBy: 'admin@example.com',
    summary: { total: 3, created: 2, linked: 1, already: 0, errors: 0, emails_queued: 3 },
    entries: [
      { name: 'John Smith', email: 'john@example.com', phone: '0821234567', status: 'created', division: 'A', partner: 'Alex Brown', emailed: true },
      { name: 'Jane Doe', email: 'jane@example.com', phone: '0837654321', status: 'linked_visitor', division: 'A', partner: 'Sam Lee', emailed: true },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '760px', margin: '0 auto' }
const h1 = { color: '#1E3A5F', fontSize: '22px', margin: '0 0 4px' }
const h2 = { color: '#1E3A5F', fontSize: '16px', margin: '16px 0 8px' }
const sub = { color: '#55575d', fontSize: '13px', margin: '0 0 16px' }
const statsBox = { backgroundColor: '#f7f8fa', border: '1px solid #e6e8ec', borderRadius: '8px', padding: '12px 16px' }
const statLine = { fontSize: '13px', color: '#1E3A5F', margin: '2px 0' }
const hr = { borderColor: '#e6e8ec', margin: '16px 0' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' }
const th = { textAlign: 'left' as const, padding: '6px 8px', borderBottom: '2px solid #1E3A5F', color: '#1E3A5F', fontWeight: 700 }
const td = { padding: '6px 8px', borderBottom: '1px solid #eef0f3', color: '#1E3A5F', verticalAlign: 'top' as const }
const trEven = { backgroundColor: '#ffffff' }
const trOdd = { backgroundColor: '#fafbfc' }
const foot = { fontSize: '11px', color: '#7a7d84', margin: '8px 0 0' }
