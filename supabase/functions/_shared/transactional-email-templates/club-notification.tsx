import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clubName?: string
  title?: string
  messageBody?: string
  url?: string
  ctaLabel?: string
  signupUrl?: string
  signupCtaLabel?: string
  signupHint?: string
  recipientName?: string
}

const ClubNotification = ({
  clubName,
  title = 'Notification',
  messageBody = '',
  url,
  ctaLabel = 'Open in SquashHub',
  signupUrl,
  signupCtaLabel = 'Register on SquashHub',
  signupHint = "Haven't registered on SquashHub yet? Use the link below to create your account — we'll link it to this invitation automatically.",
  recipientName,
}: Props) => {
  const lines = String(messageBody || '')
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          {clubName ? <Text style={caption}>{clubName}</Text> : null}
          <Heading style={heading}>{title}</Heading>
          {recipientName ? <Text style={bodyText}>Dear {recipientName},</Text> : null}
          <Text style={bodyText}>
            {lines.map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </React.Fragment>
            ))}
          </Text>
          {url ? <Button href={url} style={button}>{ctaLabel}</Button> : null}
          {signupUrl ? (
            <>
              <Hr style={divider} />
              <Text style={hintText}>{signupHint}</Text>
              <Button href={signupUrl} style={secondaryButton}>{signupCtaLabel}</Button>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ClubNotification,
  subject: (data) => String(data?.title || 'Notification'),
  displayName: 'Club notification',
  previewData: {
    clubName: 'Nelspruit Squash Club',
    title: 'Tournament invitation: Club Champs 2026',
    messageBody: 'You have been invited to enter the Club Championships.',
    url: 'https://squashhub.co.za/tournaments',
    ctaLabel: 'Accept / Register',
    recipientName: 'Example Player',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '580px', margin: '0 auto', padding: '28px', border: '1px solid #d9dee5', borderRadius: '6px' }
const caption = { color: '#64748b', fontSize: '12px', fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 8px' }
const heading = { color: '#1e3a5f', fontSize: '24px', margin: '4px 0 18px' }
const bodyText = { color: '#1d2733', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const button = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 18px', borderRadius: '4px', textDecoration: 'none' }
