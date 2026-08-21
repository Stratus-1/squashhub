import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  tournamentName?: string
  invitationBody?: string
  invitationUrl?: string
  previewForName?: string
  recipientName?: string
}

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'caption'; text: string }

/**
 * Split a plain-text invitation body into blocks so bullets render as a real
 * list. Email clients such as Outlook ignore `white-space: pre-line`, which
 * previously collapsed the whole invitation into one paragraph.
 */
function parseBody(body: string): Block[] {
  const lines = String(body || '').replace(/\r\n|\r/g, '\n').split('\n')
  const blocks: Block[] = []
  let bullets: string[] = []
  let paragraph: string[] = []

  const flushBullets = () => {
    if (bullets.length) blocks.push({ kind: 'bullets', items: bullets })
    bullets = []
  }
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph })
    paragraph = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushBullets()
      flushParagraph()
      continue
    }
    const bullet = line.match(/^[•\-*]\s+(.*)$/)
    const caption = line.match(/^—\s*(.+?)\s*—$/)
    if (bullet) {
      flushParagraph()
      bullets.push(bullet[1])
      continue
    }
    if (caption) {
      flushBullets()
      flushParagraph()
      blocks.push({ kind: 'caption', text: caption[1] })
      continue
    }
    flushBullets()
    paragraph.push(line)
  }
  flushBullets()
  flushParagraph()
  return blocks
}

const TournamentInvitePreview = ({
  tournamentName = 'Tournament',
  invitationBody = 'You have been invited to a tournament.',
  invitationUrl,
  previewForName,
  recipientName,
}: Props) => {
  const blocks = parseBody(invitationBody)
  const greeting = (recipientName || previewForName || '').trim()
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>TEST invite preview — {tournamentName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={testLabel}>TEST INVITE — PREVIEW ONLY</Text>
          <Heading style={heading}>{tournamentName}</Heading>
          {previewForName ? <Text style={context}>Previewing the invitation as {previewForName} would receive it.</Text> : null}
          {greeting ? <Text style={bodyText}>Dear {greeting},</Text> : null}
          {blocks.map((block, i) => {
            if (block.kind === 'caption') {
              return <Text key={i} style={caption}>{block.text}</Text>
            }
            if (block.kind === 'bullets') {
              return (
                <ul key={i} style={list}>
                  {block.items.map((item, j) => (
                    <li key={j} style={listItem}>{item}</li>
                  ))}
                </ul>
              )
            }
            return (
              <Text key={i} style={bodyText}>
                {block.lines.map((line, j) => (
                  <React.Fragment key={j}>
                    {j > 0 ? <br /> : null}
                    {line}
                  </React.Fragment>
                ))}
              </Text>
            )
          })}
          {invitationUrl ? <Button href={invitationUrl} style={button}>View tournament</Button> : null}
          <Text style={footer}>No tournament entry or invitation status was changed by this test.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TournamentInvitePreview,
  subject: (data) => `TEST — Tournament invitation${data?.tournamentName ? `: ${data.tournamentName}` : ''}`,
  displayName: 'Tournament invitation test',
  previewData: {
    tournamentName: 'Club Championship 2026',
    invitationBody: 'You have been invited to the Club Championship 2026.\n\n— Tournament details —\n• Category: Mixed Singles\n• Dates: 27 Aug 2026 → 30 Sept 2026\n— End details —',
    invitationUrl: 'https://squashhub.co.za/tournaments',
    previewForName: 'Example Player',
    recipientName: 'Example Player',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '580px', margin: '0 auto', padding: '28px', border: '1px solid #d9dee5', borderRadius: '6px' }
const testLabel = { color: '#9a6700', fontSize: '12px', fontWeight: '700' as const }
const heading = { color: '#1e3a5f', fontSize: '26px', margin: '12px 0 18px' }
const context = { color: '#566273', fontSize: '14px' }
const bodyText = { color: '#1d2733', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const caption = { color: '#64748b', fontSize: '12px', fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 8px' }
const list = { margin: '0 0 14px', paddingLeft: '20px', color: '#1d2733', fontSize: '15px', lineHeight: '24px' }
const listItem = { margin: '0 0 6px' }
const button = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 18px', borderRadius: '4px', textDecoration: 'none' }
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '24px' }
