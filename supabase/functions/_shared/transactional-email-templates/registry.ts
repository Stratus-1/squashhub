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
import { template as pendingTopupApproval } from './pending-topup-approval.tsx'
import { template as tournamentEntryConfirmation } from './tournament-entry-confirmation.tsx'
import { template as tournamentEntryImportSummary } from './tournament-entry-import-summary.tsx'
import { template as trialEnding } from './trial-ending.tsx'
import { template as slaOutstanding } from './sla-outstanding.tsx'
import { template as tournamentInvitePreview } from './tournament-invite-preview.tsx'
import { template as clubNotification } from './club-notification.tsx'
import { template as associationInvoice } from './association-invoice.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-club-registered': newClubRegistered,
  'stitch-onboarding-application': stitchOnboardingApplication,
  'support-new-message': supportNewMessage,
  'support-admin-reply': supportAdminReply,
  'membership-renewal-invoice': membershipRenewalInvoice,
  'subscription-invoice': subscriptionInvoice,
  'arrears-warning': arrearsWarning,
  'pending-topup-approval': pendingTopupApproval,
  'tournament-entry-confirmation': tournamentEntryConfirmation,
  'tournament-entry-import-summary': tournamentEntryImportSummary,
  'trial-ending': trialEnding,
  'sla-outstanding': slaOutstanding,
  'tournament-invite-preview': tournamentInvitePreview,
  'club-notification': clubNotification,
  'association-invoice': associationInvoice,
}
