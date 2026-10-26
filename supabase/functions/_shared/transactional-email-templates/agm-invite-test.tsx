import * as React from 'npm:react@18.3.1';
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Text, Link, Section } from 'npm:@react-email/components@0.0.22';
import type { TemplateEntry } from './registry.ts';

interface Props {
  title?: string;
  memberName?: string;
  meeting?: string;
  venue?: string;
  details?: string;
  deadline?: string;
  documents?: { name: string; url: string }[];
  signature?: { logo?: string; lines: string[] };
  disclaimer?: string;
  inviteUrl?: string;
  voteUrl?: string;
}

const AgmInviteTest = ({ title = 'AGM invitation', memberName = 'Member', meeting = 'Meeting date not saved yet', venue, details, deadline, documents = [], signature, disclaimer, inviteUrl, voteUrl }: Props) => {
  const body = (details ?? '').replace(/^\s*dear[^\n]*\n/i, '').trim().replace(/\{\s*member[ _]name\s*\}/gi, memberName);
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>TEST — {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={notice}>TEST EMAIL — PREVIEW ONLY</Text>
        <Heading style={heading}>{title}</Heading>
        <Text>Dear {memberName},</Text>
        <Text>You are invited to the {title}: <strong>{meeting}</strong>{venue ? ` at ${venue}` : ''}.</Text>
        {body ? <Text>{body.split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 ? <br /> : null}{line}</React.Fragment>)}</Text> : null}
        {documents.map((doc, i) => <Text key={i}><Link href={doc.url}>{doc.name}</Link></Text>)}
        <Section>{inviteUrl ? <Button href={inviteUrl} style={action}>View invitation &amp; confirm attendance</Button> : <Text style={action}>View invitation &amp; confirm attendance</Text>}</Section>
        <Text>Your personal voting link works once and only for you.</Text>
        <Section>{voteUrl ? <Button href={voteUrl} style={action}>Vote now</Button> : <Text style={action}>Vote now</Text>}</Section>
        {!body && deadline ? <Text>Voting closes <strong>{deadline}</strong>.</Text> : null}
        <Text>Your choices are confidential — nobody, including the committee, can see how you voted.</Text>
        {signature && (signature.logo || signature.lines.length) ? (
          <Section style={sig}>
            {signature.logo ? <Img src={signature.logo} width="120" alt="" style={{ marginBottom: '8px' }} /> : null}
            {signature.lines.map((l, i) => <Text key={i} style={sigLine}>{l}</Text>)}
          </Section>
        ) : null}
        {disclaimer ? <Text style={footer}>{disclaimer}</Text> : null}
        <Text style={notice}>Test links open preview pages only: attendance replies and votes cannot be submitted, and voting was not opened.</Text>
      </Container>
    </Body>
  </Html>
  );
};

export const template = {
  component: AgmInviteTest,
  subject: (data) => `TEST — ${data.title || 'AGM invitation'} — for ${data.memberName || 'Member'}`,
  displayName: 'AGM invitation test',
  previewData: { title: 'Club 2026 AGM', memberName: 'Example Member', meeting: '29 Oct 2026, 18:00', venue: 'Clubhouse', deadline: '28 Oct 2026, 22:00' },
} satisfies TemplateEntry;
const sig = { borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '24px' };
const sigLine = { margin: '0', fontSize: '13px', color: '#1f2937', lineHeight: '20px' };

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { maxWidth: '580px', padding: '28px', margin: '0 auto' };
const heading = { color: '#1e3a5f', fontSize: '24px' };
const action = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 18px', borderRadius: '4px', display: 'inline-block' };
const notice = { color: '#9a6700', fontSize: '12px', lineHeight: '20px' };
const footer = { color: '#566273', fontSize: '12px' };