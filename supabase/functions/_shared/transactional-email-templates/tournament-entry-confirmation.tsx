/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  playerName?: string
  clubName?: string
  tournamentName?: string
  division?: string
  partnerName?: string
  startInfo?: string
  venue?: string
  magicLink?: string
  clubUrl?: string
  contactEmail?: string
}

const Email = ({
  playerName,
  clubName,
  tournamentName,
  division,
  partnerName,
  startInfo,
  venue,
  magicLink,
  clubUrl,
  contactEmail,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're entered — {tournamentName || 'the tournament'} at {clubName || 'the club'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're in! 🏆</Heading>
        <Text style={intro}>
          {playerName ? `Hi ${playerName},` : 'Hi there,'}
        </Text>
        <Text style={intro}>
          You're confirmed for <strong>{tournamentName || 'the tournament'}</strong>
          {clubName ? <> at <strong>{clubName}</strong></> : null}. Here are your entry details:
        </Text>

        <Section style={detailBox}>
          {tournamentName ? <Text style={row}><strong>Tournament:</strong> {tournamentName}</Text> : null}
          {division ? <Text style={row}><strong>Division:</strong> {division}</Text> : null}
          {partnerName ? <Text style={row}><strong>Partner:</strong> {partnerName}</Text> : null}
          {startInfo ? <Text style={row}><strong>Starts:</strong> {startInfo}</Text> : null}
          {venue ? <Text style={row}><strong>Venue:</strong> {venue}</Text> : null}
        </Section>

        <Hr style={hr} />

        <Text style={intro}>
          Tap the button below to sign in. If it's your first time, you'll be
          prompted to create a password. Once signed in, select <strong>Club
          Tournaments</strong> to view all the tournament information —
          fixtures, your partner, standings and schedule.
        </Text>

        {magicLink ? (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Link href={magicLink} style={btn}>Sign in to {clubName || 'the club'} →</Link>
          </Section>
        ) : null}

        <Text style={smallNote}>
          This link signs you in on any device. If it expires, request a new one
          from the login page{clubUrl ? <> at <Link href={clubUrl} style={link}>{clubUrl.replace(/^https?:\/\//, '')}</Link></> : null}.
        </Text>

        <Hr style={hr} />
        <Text style={foot}>
          Questions? Reply to this email{contactEmail ? <> or contact <Link href={`mailto:${contactEmail}`} style={link}>{contactEmail}</Link></> : null}.
        </Text>
        <Text style={foot}>See you on court!</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `You're entered — ${d.tournamentName || 'Tournament'}${d.clubName ? ` at ${d.clubName}` : ''}`,
  displayName: 'Tournament — entry confirmation with magic-link',
  previewData: {
    playerName: 'Alex Smith',
    clubName: 'Nelspruit Squash Club',
    tournamentName: 'Nelspruit Doubles Open 2026',
    division: 'A Division',
    partnerName: 'Chris Jones',
    startInfo: 'Friday, 24 July 2026 at 18:00',
    venue: 'Nelspruit Squash Club',
    magicLink: 'https://nelspruit.squashhub.co.za/#/auth/callback?token=example',
    clubUrl: 'https://nelspruit.squashhub.co.za',
    contactEmail: 'admin@nelspruitsquash.co.za',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1E3A5F', fontSize: '22px', margin: '0 0 16px' }
const intro = { color: '#374151', fontSize: '14px', lineHeight: '1.6', margin: '8px 0' }
const detailBox = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '16px 0',
}
const row = { color: '#111827', fontSize: '14px', margin: '4px 0' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const btn = {
  display: 'inline-block',
  background: '#1E3A5F',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: '15px',
}
const link = { color: '#1E3A5F', fontWeight: 600 }
const smallNote = { color: '#6b7280', fontSize: '12px', lineHeight: '1.6', margin: '8px 0' }
const foot = { color: '#6b7280', fontSize: '12px', margin: '6px 0' }
