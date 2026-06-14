/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  subject?: string
  message?: string
  threadUrl?: string
  recipientName?: string
}

const Email = ({ subject, message, threadUrl, recipientName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>SquashHub support replied to: {subject || 'your ticket'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>SquashHub support replied</Heading>
        <Text style={meta}>Hi {recipientName || 'there'},</Text>
        <Text style={meta}>You have a new reply on your support ticket:</Text>
        <Text style={meta}><strong>{subject || 'Support ticket'}</strong></Text>
        <Hr style={hr} />
        <Section>
          <Text style={body}>{message || ''}</Text>
        </Section>
        {threadUrl ? (
          <>
            <Hr style={hr} />
            <Text style={meta}>
              <Link href={threadUrl} style={link}>Open the conversation →</Link>
            </Text>
          </>
        ) : null}
        <Text style={footer}>You can reply directly in the app and we'll get back to you.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Re: ${d.subject || 'Your support ticket'}`,
  displayName: 'Support — admin reply to user',
  previewData: {
    subject: 'Cannot log in',
    message: 'Hi Jane, please try resetting your password…',
    threadUrl: 'https://squashhub.co.za/support?threadId=abc',
    recipientName: 'Jane',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1E3A5F', fontSize: '20px', margin: '0 0 16px' }
const meta = { color: '#374151', fontSize: '14px', margin: '4px 0' }
const body = { color: '#111827', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const link = { color: '#1E3A5F', fontWeight: 600 }
const footer = { color: '#6b7280', fontSize: '12px', marginTop: '20px' }
