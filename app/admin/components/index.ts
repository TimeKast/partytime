/**
 * H-008 FIX: Admin components barrel export
 * These components were extracted from the monolithic admin page
 * to improve maintainability and testability
 */

export { default as LoginForm } from './LoginForm'
export { default as StatsCards } from './StatsCards'
export { default as UserManagement } from './UserManagement'
export { default as ReminderStatusSection } from './ReminderStatusSection'
export { default as EventPresentationSettings } from './EventPresentationSettings'
export { default as InvitationLinkManager } from './InvitationLinkManager'
export { default as ChangePasswordForm, ForcedPasswordChangeDialog } from './ChangePasswordForm'

// Types for admin components
// ISSUE-006: status widened to the five canonical rsvps.status values (see
// lib/rsvp-list.ts RsvpStatus — kept in sync there, not imported from
// lib/queries.ts to avoid pulling the server-only DB client into the client
// bundle).
import type { RsvpStatus } from '@/lib/rsvp-list'

export interface RSVP {
    id: string
    name: string
    email: string
    phone: string
    plusOne: boolean
    plusOneName?: string | null
    createdAt: string
    status: RsvpStatus
    emailSent?: string
}

export interface AdminStats {
    total: number
    confirmed: number
    cancelled: number
    plusOne: number
    totalGuests: number
    emailsSent: number
    // ISSUE-006: separate pending counters (never folded into confirmed).
    pendingPayment: number
    pendingVerification: number
    expired: number
}
