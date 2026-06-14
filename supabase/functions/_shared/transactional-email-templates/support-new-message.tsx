/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  subject?: string
  message?: string
  fromName?: string
  fromEmail?: string
  threadUrl?: string
  isNewThread?: boolean
}

const Email = ({ subject, message, fromName, fromEmail, threadUrl, isNewThread }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{isNewThread ? 'New support ticket' : 'New support reply'}: {subject || 'Support'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{isNewThread ? 'New support ticket' : 'New support reply'}</Heading>
        <Text style={meta}>
          <strong>From:</strong> {fromName || 'Member'} {fromEmail ? `<${fromEmail}>` : ''}
        </Text>
        <Text style={meta}><strong>Subject:</strong> {subject || '(no subject)'}</Text>
        <Hr style={hr} />
        <Section>
          <Text style={body}>{message || '(no message)'}</Text>
        </Section>
        {threadUrl ? (
          <>
            <Hr style={hr} />
            <Text style={meta}>
              <Link href={threadUrl} style={link}>Open ticket in admin →</Link>
            </Text>
          </>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `[Support] ${d.subject || 'New ticket'}`,
  displayName: 'Support — new message to admin',
  previewData: {
    subject: 'Cannot log in',
    message: 'I am unable to access my account…',
    fromName: 'Jane Smith',
    fromEmail: 'jane@example.com',
    threadUrl: 'https://squashhub.co.za/admin/support?threadId=abc',
    isNewThread: true,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1E3A5F', fontSize: '20px', margin: '0 0 16px' }
const meta = { color: '#374151', fontSize: '14px', margin: '4px 0' }
const body = { color: '#111827', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const link = { color: '#1E3A5F', fontWeight: 600 }
