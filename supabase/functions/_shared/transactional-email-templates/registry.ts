/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as newClubRegistered } from './new-club-registered.tsx'
import { template as supportNewMessage } from './support-new-message.tsx'
import { template as supportAdminReply } from './support-admin-reply.tsx'
import { template as membershipRenewalInvoice } from './membership-renewal-invoice.tsx'
import { template as subscriptionInvoice } from './subscription-invoice.tsx'
import { template as arrearsWarning } from './arrears-warning.tsx'
import { template as stitchOnboardingApplication } from './stitch-onboarding-application.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-club-registered': newClubRegistered,
  'stitch-onboarding-application': stitchOnboardingApplication,
  'support-new-message': supportNewMessage,
  'support-admin-reply': supportAdminReply,
  'membership-renewal-invoice': membershipRenewalInvoice,
  'subscription-invoice': subscriptionInvoice,
  'arrears-warning': arrearsWarning,
}
