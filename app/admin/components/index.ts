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
export { default as CheckinSettings } from './CheckinSettings'
// ISSUE-025 (EPIC-006): shell mounts only this container — every other
// finance component lives under ./finance/ and is never imported directly
// from app/admin/page.tsx (PLAN-EPIC-006.md §3.4/gotcha #5).
export { default as LedgerTab } from './finance/LedgerTab'

// Types for admin components
// ISSUE-006: status widened to the five canonical rsvps.status values (see
// lib/rsvp-list.ts RsvpStatus — kept in sync there, not imported from
// lib/queries.ts to avoid pulling the server-only DB client into the client
// bundle).
import type { RsvpPaymentStatus, RsvpStatus } from '@/lib/rsvp-list'

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
    // ISSUE-013: only ever present when GET /api/rsvp joined rsvp_payments —
    // i.e. only for a payment_required event (see lib/queries.ts
    // getRSVPsByEvent's includePayments).
    paymentStatus?: RsvpPaymentStatus | null
    paidAt?: string | null
    amountCents?: number | null
    currency?: string | null
    // ISSUE-018: present on every row regardless of the event's
    // checkin_enabled flag (see lib/rsvp-list.ts RsvpListItem's doc
    // comment) — checkin_enabled only gates whether the UI/exports show
    // them.
    checkedInAt?: string | null
    plusOneCheckedInAt?: string | null
    checkedInBy?: string | null
    checkinNote?: string | null
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
