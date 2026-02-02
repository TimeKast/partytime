/**
 * H-008 FIX: Admin components barrel export
 * These components were extracted from the monolithic admin page
 * to improve maintainability and testability
 */

export { default as LoginForm } from './LoginForm'
export { default as StatsCards } from './StatsCards'
export { default as UserManagement } from './UserManagement'
export { default as ReminderStatusSection } from './ReminderStatusSection'

// Types for admin components
export interface RSVP {
    id: string
    name: string
    email: string
    phone: string
    plusOne: boolean
    plusOneName?: string | null
    createdAt: string
    status: 'confirmed' | 'cancelled'
    emailSent?: string
}

export interface AdminStats {
    total: number
    confirmed: number
    cancelled: number
    plusOne: number
    totalGuests: number
    emailsSent: number
}
