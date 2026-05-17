/// <reference types="npm:@types/react@18.3.1" />

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
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import type { TenantBrand } from './branding.ts'
import { PLATFORM_BRAND } from './branding.ts'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  recipient?: string
  brand?: TenantBrand
}

export const RecoveryEmail = ({
  confirmationUrl,
  recipient,
  brand = PLATFORM_BRAND,
}: RecoveryEmailProps) => {
  const isClubReset = !brand.isPlatform
  const contextLabel = isClubReset
    ? `your ${brand.displayName} account`
    : 'your SquashHub account'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Reset the password for {contextLabel}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={brand.logoUrl}
              alt={brand.displayName}
              width="72"
              height="72"
              style={logo}
            />
            <Heading style={brandName}>{brand.displayName}</Heading>
            {isClubReset ? (
              <Text style={tagline}>
                Powered by <strong>SquashHub</strong>
              </Text>
            ) : (
              <Text style={tagline}>The home of South African squash</Text>
            )}
          </Section>

          <Section style={card}>
            <Heading style={h1}>Reset your password</Heading>
            <Text style={text}>
              We received a request to reset the password for{' '}
              {recipient ? (
                <>
                  <strong>{recipient}</strong> on{' '}
                </>
              ) : null}
              {contextLabel}. Click the button below to choose a new password.
              This link will expire in 60 minutes.
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={button} href={confirmationUrl}>
                Reset my password
              </Button>
            </Section>

            <Text style={smallText}>
              If the button doesn't work, copy and paste this link into your
              browser:
            </Text>
            <Text style={urlText}>
              <Link href={confirmationUrl} style={link}>
                {confirmationUrl}
              </Link>
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            If you didn't request a password reset, you can safely ignore this
            email — your password will not be changed.
          </Text>
          <Text style={footerSmall}>
            {isClubReset
              ? `${brand.displayName} runs on SquashHub · `
              : 'SquashHub · '}
            Powered by Stratus Software Solutions (Pty) Ltd
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default RecoveryEmail

const navy = '#1E3A5F'
const amber = '#D4A24C'

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = { padding: '24px 20px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '8px 0 24px' }
const logo = {
  display: 'block',
  margin: '0 auto 12px',
  borderRadius: '12px',
  objectFit: 'contain' as const,
}
const brandName = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: navy,
  letterSpacing: '-0.3px',
  margin: '0',
}
const tagline = {
  fontSize: '12px',
  color: '#7a8290',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '6px 0 0',
}
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e5e9f0',
  borderRadius: '12px',
  padding: '32px 28px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: navy,
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#3d4756',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const smallText = {
  fontSize: '12px',
  color: '#7a8290',
  lineHeight: '1.5',
  margin: '24px 0 6px',
}
const urlText = {
  fontSize: '12px',
  color: navy,
  wordBreak: 'break-all' as const,
  margin: '0',
}
const link = { color: navy, textDecoration: 'underline' }
const button = {
  backgroundColor: navy,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  borderBottom: `3px solid ${amber}`,
}
const hr = { borderColor: '#e5e9f0', margin: '28px 0 16px' }
const footer = {
  fontSize: '13px',
  color: '#7a8290',
  lineHeight: '1.5',
  margin: '0 0 8px',
  textAlign: 'center' as const,
}
const footerSmall = {
  fontSize: '11px',
  color: '#a0a8b4',
  textAlign: 'center' as const,
  margin: '0',
}
