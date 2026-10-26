import * as React from 'npm:react@18.3.1';
import { Body, Container, Head, Heading, Html, Preview, Text, Link, Section } from 'npm:@react-email/components@0.0.22';
import type { TemplateEntry } from './registry.ts';

interface Props {
  title?: string;
  memberName?: string;
  meeting?: string;
  venue?: string;
  details?: string;
  deadline?: string;
  documents?: { name: string; url: string }[];
}

const AgmInviteTest = ({ title = 'AGM invitation', memberName = 'Member', meeting = 'Meeting date not saved yet', venue, details, deadline, documents = [] }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>TEST — {title} — invitation and ballot preview</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={notice}>TEST EMAIL — PREVIEW ONLY</Text>
        <Heading style={heading}>{title}</Heading>
        {details && /\{\s*member[ _]name\s*\}/i.test(details) ? null : <Text>Dear {memberName},</Text>}
        {details ? <Text>{details.replace(/\{\s*member[ _]name\s*\}/gi, memberName).split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 ? <br /> : null}{line}</React.Fragment>)}</Text> : null}
        <Text>You are invited to the Annual General Meeting.</Text>
        <Text><strong>{meeting}</strong>{venue ? <><br />{venue}</> : null}</Text>
        <Section><Text style={action}>View invitation &amp; confirm attendance</Text></Section>
        <Text>Attendance choices: I confirm attendance / Apologies — not attending.</Text>
        {documents.map((doc, i) => <Text key={i}><Link href={doc.url}>{doc.name}</Link></Text>)}
        <Text>Your personal voting link will be included in the live email if you are selected as an eligible voter.</Text>
        <Section><Text style={action}>Vote now</Text></Section>
        {deadline ? <Text>Voting closes <strong>{deadline}</strong>. Your choices are confidential.</Text> : null}
        <Text style={notice}>This preview has no active voting or attendance buttons. No voting links were issued, no attendance replies were changed and voting was not opened.</Text>
        <Text style={footer}>SquashHub</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: AgmInviteTest,
  subject: (data) => `TEST — ${data.title || 'AGM invitation'} — for ${data.memberName || 'Member'}`,
  displayName: 'AGM invitation test',
  previewData: { title: 'Club AGM 2026', memberName: 'Example Member', meeting: '29 October 2026, 18:00', venue: 'Clubhouse', deadline: '28 October 2026, 22:00' },
} satisfies TemplateEntry;

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' };
const container = { maxWidth: '580px', padding: '28px', margin: '0 auto' };
const heading = { color: '#1e3a5f', fontSize: '24px' };
const action = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 18px', borderRadius: '4px', display: 'inline-block' };
const notice = { color: '#9a6700', fontSize: '12px', lineHeight: '20px' };
const footer = { color: '#566273', fontSize: '12px' };