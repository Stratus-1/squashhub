import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Column,
  Row,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  findClubUrl?: string
}

const Email = ({
  recipientName = 'there',
  findClubUrl = 'https://squashhub.co.za/find-club',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Pick your squash club and your SquashHub account is ready to use.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Row>
            <Column style={{ verticalAlign: 'middle' as const }}>
              <Img
                src="https://squashhub.co.za/pwa-192x192.png"
                width="40"
                height="40"
                alt="SquashHub"
                style={logoImg}
              />
            </Column>
            <Column style={{ verticalAlign: 'middle' as const, paddingLeft: '10px' }}>
              <Heading style={h1}>SquashHub</Heading>
            </Column>
          </Row>
        </Section>

        <Section style={content}>
          <Heading style={h2}>One step left — choose your club</Heading>
          <Text style={p}>Hi {recipientName},</Text>
          <Text style={p}>
            Thanks for signing up to SquashHub. Your account is active, but it isn't linked to a
            squash club yet — so there is nothing to see when you sign in.
          </Text>
          <Text style={p}>
            Tap the button below, search for the club you play at, and tap <strong>This is my club</strong>.
            If you are already on that club's member list we will connect you straight away.
            Then you can see the ladder, book courts, enter tournaments and capture your results.
          </Text>

          <Section style={box}>
            <Text style={boxLine}>
              <strong>First one in from your club?</strong> You will be given full club admin rights
              automatically, so you can set the club up and try everything out.
            </Text>
          </Section>

          <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
            <Button href={findClubUrl} style={cta}>Choose my club</Button>
          </Section>

          <Hr style={hr} />
          <Text style={pMuted}>
            Can't find your club on the list? Simply reply to this email and we will add it for you.
          </Text>
          <Text style={pMuted}>SquashHub — Stratus Software Solutions (Pty) Ltd</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your SquashHub account is ready — just choose your club',
  displayName: 'Choose Your Club (unaffiliated sign-up)',
  previewData: {
    recipientName: 'Riaan',
    findClubUrl: 'https://squashhub.co.za/find-club',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '20px 0' }
const header = { padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }
const logoImg = { display: 'block', borderRadius: '8px' }
const h1 = { margin: 0, fontSize: '18px', color: '#1E3A5F' }
const content = { padding: '24px' }
const h2 = { fontSize: '20px', color: '#0f172a', margin: '0 0 12px' }
const p = { fontSize: '14px', color: '#334155', lineHeight: '22px', margin: '0 0 12px' }
const pMuted = { fontSize: '12px', color: '#64748b', lineHeight: '18px', margin: '0 0 8px' }
const box = {
  backgroundColor: '#f6f8fb',
  border: '1px solid #e3e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '16px 0',
}
const boxLine = { fontSize: '13px', color: '#334155', margin: '4px 0' }
const cta = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
}
const hr = { border: 0, borderTop: '1px solid #e5e7eb', margin: '20px 0' }
