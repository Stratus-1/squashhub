/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  /** The person who has just been added to the family. */
  memberName?: string
  /** The family's primary member, who added them. */
  primaryName?: string
  clubName?: string
  relationship?: string
  /** One-tap personal sign-in link. */
  inviteUrl?: string
  /** Fallback: the email address the club captured for them. */
  loginEmail?: string
}

const Email = ({ memberName, primaryName, clubName, relationship, inviteUrl, loginEmail }: Props) => {
  const first = (memberName || '').split(/\s+/)[0] || 'there'
  const club = clubName || 'your club'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{primaryName || 'A family member'} added you to their family membership at {club}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You're on the family membership 🎾</Heading>
          <Text style={intro}>
            Hi {first}, {primaryName || 'a family member'} has added you
            {relationship ? ` as their ${relationship}` : ''} on the family membership at <strong>{club}</strong>.
          </Text>
          <Text style={intro}>
            You have your own membership and your own login — bookings, results and fees stay separate from everyone
            else's.
          </Text>
          <Hr style={hr} />
          <Section>
            {inviteUrl ? (
              <Text style={{ margin: '16px 0' }}>
                <Link href={inviteUrl} style={btn}>Set up my login →</Link>
              </Text>
            ) : null}
            {loginEmail ? (
              <Text style={row}>
                Your account uses <strong>{loginEmail}</strong>. If the button above has expired, sign in with that
                address and use "Forgot password" to set a new one.
              </Text>
            ) : null}
          </Section>
          <Hr style={hr} />
          <Text style={foot}>
            You're receiving this because you were added to a family membership at {club}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.primaryName || 'Your family'} added you to the family membership at ${d.clubName || 'your club'}`,
  displayName: 'Family — member added invite',
  previewData: {
    memberName: 'Jana Pretorius',
    primaryName: 'Willem Pretorius',
    clubName: 'Pretoria Country Club',
    relationship: 'child',
    inviteUrl: 'https://www.squashhub.co.za/auth/callback',
    loginEmail: 'jana@example.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, Segoe UI, Roboto, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '620px', color: '#0f172a' }
const h1 = { color: '#1E3A5F', fontSize: '22px', margin: '0 0 12px' }
const intro = { fontSize: '15px', lineHeight: '1.55', margin: '0 0 10px' }
const row = { fontSize: '14px', lineHeight: '1.55', margin: '6px 0' }
const hr = { borderColor: '#e2e8f0', margin: '18px 0' }
const btn = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '12px 20px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 600,
  display: 'inline-block',
}
const foot = { fontSize: '12px', color: '#64748b', margin: 0 }
