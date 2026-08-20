import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  tournamentName?: string
  invitationBody?: string
  invitationUrl?: string
  previewForName?: string
}

const TournamentInvitePreview = ({
  tournamentName = 'Tournament',
  invitationBody = 'You have been invited to a tournament.',
  invitationUrl,
  previewForName,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>TEST invite preview — {tournamentName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={testLabel}>TEST INVITE — PREVIEW ONLY</Text>
        <Heading style={heading}>{tournamentName}</Heading>
        {previewForName ? <Text style={context}>Previewing the invitation as {previewForName} would receive it.</Text> : null}
        <Text style={bodyText}>{invitationBody}</Text>
        {invitationUrl ? <Button href={invitationUrl} style={button}>View tournament</Button> : null}
        <Text style={footer}>No tournament entry or invitation status was changed by this test.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TournamentInvitePreview,
  subject: (data) => `TEST — Tournament invitation${data?.tournamentName ? `: ${data.tournamentName}` : ''}`,
  displayName: 'Tournament invitation test',
  previewData: {
    tournamentName: 'Club Championship 2026',
    invitationBody: 'You have been invited to the Club Championship 2026.',
    invitationUrl: 'https://squashhub.co.za/tournaments',
    previewForName: 'Example Player',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '580px', margin: '0 auto', padding: '28px', border: '1px solid #d9dee5', borderRadius: '6px' }
const testLabel = { color: '#9a6700', fontSize: '12px', fontWeight: '700' as const }
const heading = { color: '#1e3a5f', fontSize: '26px', margin: '12px 0 18px' }
const context = { color: '#566273', fontSize: '14px' }
const bodyText = { color: '#1d2733', fontSize: '15px', lineHeight: '24px', whiteSpace: 'pre-line' as const }
const button = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 18px', borderRadius: '4px', textDecoration: 'none' }
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '24px' }