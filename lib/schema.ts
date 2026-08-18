import { pgTable, text, boolean, timestamp, integer, jsonb, varchar, uuid, uniqueIndex, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Helper to generate IDs safely across environments
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

// Events table for multi-party support
export const events = pgTable('events', {
    id: text('id').primaryKey().notNull().$defaultFn(generateId),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    title: text('title').notNull(),
    displayTitle: text('display_title').default(''), // Empty means no visible title on the invitation page
    subtitle: text('subtitle').default(''),
    date: text('date').default(''),
    time: text('time').default(''),
    location: text('location').default(''),
    details: text('details').default(''),

    // Price configuration
    priceEnabled: boolean('price_enabled').default(false),
    priceAmount: integer('price_amount').default(0),
    priceCurrency: varchar('price_currency', { length: 10 }).default('MXN'),
    // ISSUE-010/EPIC-004: gates whether Stripe Checkout is required to confirm
    // an RSVP. Only ever true alongside priceEnabled/priceAmount>0/a whitelisted
    // priceCurrency — enforced at the API layer (lib/event-api-contract.ts +
    // app/api/admin/event-settings/update/route.ts), not by a DB constraint,
    // since it cross-references three columns. Private courtesy links bypass
    // it (PLAN-EPICS-002-005.md §2.1).
    paymentRequired: boolean('payment_required').notNull().default(false),

    // Capacity configuration
    capacityEnabled: boolean('capacity_enabled').default(false),
    capacityLimit: integer('capacity_limit').default(0),

    // Background image (for the event page)
    backgroundImageUrl: text('background_image_url').default('/background.png'),

    // Public invitation presentation. Database defaults preserve existing events.
    presentationMode: varchar('presentation_mode', { length: 24 }).notNull().default('classic'),
    rsvpTitle: text('rsvp_title').notNull().default('RSVP INDISPENSABLE'),
    rsvpButtonLabel: varchar('rsvp_button_label', { length: 80 }).notNull().default('CONFIRMAR ASISTENCIA'),
    backgroundOverlayStrength: integer('background_overlay_strength').notNull().default(20),
    backgroundImageFit: varchar('background_image_fit', { length: 12 }).notNull().default('cover'),
    backgroundImagePosition: varchar('background_image_position', { length: 12 }).notNull().default('center'),

    // OG image (for social previews - WhatsApp, Facebook, Twitter)
    // Recommended: 1200x630 (1.9:1 aspect ratio)
    ogImageUrl: text('og_image_url'),

    // Theme colors (stored as JSON)
    theme: jsonb('theme').$type<{
        primaryColor: string
        secondaryColor: string
        accentColor: string
        backgroundColor: string
        textColor: string
    }>().default({
        primaryColor: '#FF1493',
        secondaryColor: '#00FFFF',
        accentColor: '#FFD700',
        backgroundColor: '#1a0033',
        textColor: '#ffffff'
    }),

    // Contact info
    hostName: text('host_name').default(''),
    hostEmail: text('host_email').default(''),
    hostPhone: text('host_phone').default(''),

    // Status
    isActive: boolean('is_active').default(true),

    // RSVP Closed configuration
    rsvpClosed: boolean('rsvp_closed').default(false),
    rsvpClosedMessage: text('rsvp_closed_message').default('¡Nos vemos en el próximo evento!'),
    requirePlusOneName: boolean('require_plus_one_name').default(false),

    // Email configuration
    emailConfirmationEnabled: boolean('email_confirmation_enabled').default(false),
    // ISSUE-005/EPIC-003: per-event toggle for the pending_verification flow.
    // Superseded by payment_required once EPIC-004 lands (the pay ES the
    // verification — see PLAN-EPICS-002-005.md §2).
    emailVerificationEnabled: boolean('email_verification_enabled').notNull().default(false),
    reminderEnabled: boolean('reminder_enabled').default(false),
    reminderScheduledAt: timestamp('reminder_scheduled_at'),
    reminderSentAt: timestamp('reminder_sent_at'),

    // ISSUE-015/EPIC-005 (migration 0011): check-in portal. Staff authenticate
    // with a single password shared per event (bcrypt, same 12-round cost as
    // lib/auth-utils.ts) instead of individual accounts. checkinPasswordUpdatedAt
    // is the `pwv` (password version) every issued cookie embeds — rotating the
    // password invalidates every outstanding session cookie without touching
    // the DB (lib/checkin-session.ts, PLAN-EPICS-002-005.md §3.4). The plaintext
    // password is never persisted; only its bcrypt hash is.
    checkinEnabled: boolean('checkin_enabled').notNull().default(false),
    checkinPasswordHash: text('checkin_password_hash'),
    checkinPasswordUpdatedAt: timestamp('checkin_password_updated_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    presentationModeCheck: check(
        'events_presentation_mode_check',
        sql`${table.presentationMode} in ('classic', 'modern_details', 'artwork_only')`,
    ),
    backgroundImageFitCheck: check(
        'events_background_image_fit_check',
        sql`${table.backgroundImageFit} in ('cover', 'contain')`,
    ),
    backgroundImagePositionCheck: check(
        'events_background_image_position_check',
        sql`${table.backgroundImagePosition} in ('center', 'top')`,
    ),
    backgroundOverlayStrengthCheck: check(
        'events_background_overlay_strength_check',
        sql`${table.backgroundOverlayStrength} between 0 and 80`,
    ),
    rsvpButtonLabelCheck: check(
        'events_rsvp_button_label_check',
        sql`char_length(btrim(${table.rsvpButtonLabel})) between 1 and 80`,
    ),
}))

// RSVPs table
export const rsvps = pgTable('rsvps', {
    id: text('id').primaryKey().$defaultFn(generateId),

    // Reference to event (by slug for compatibility — the A6-14 contract:
    // this column stores events.slug, NOT events.id).
    // A3-02/A6-09: FK so a deleted/renamed event can never leave orphan RSVPs
    // that a recycled slug would inherit. ON UPDATE CASCADE makes slug renames
    // atomic; ON DELETE RESTRICT forces deleters to remove RSVPs explicitly.
    eventId: text('event_id').notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' }),

    // Guest info
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    plusOne: boolean('plus_one').default(false),
    plusOneName: text('plus_one_name'),

    // Status
    status: varchar('status', { length: 20 }).default('confirmed').notNull(),

    // Email tracking
    emailSent: timestamp('email_sent'),
    emailHistory: jsonb('email_history').$type<Array<{
        sentAt: string
        // ISSUE-007/EPIC-003: 'verification' records the pending_verification
        // link send, distinct from the post-verify 'confirmation' send.
        type: 'confirmation' | 'reminder' | 're-invitation' | 'verification'
    }>>().default([]),

    // Cancel token
    cancelToken: text('cancel_token'),

    // ISSUE-005 (migration 0009): pending-state TTL and email verification.
    // pendingExpiresAt drives the lazy expiration sweep (expireStalePendingRsvps)
    // for pending_payment/pending_verification rows; verificationTokenHash
    // follows the password_reset_tokens pattern (SHA-256 hash-only, reissue =
    // overwrite) — see PLAN-EPICS-002-005.md §3.2.
    pendingExpiresAt: timestamp('pending_expires_at'),
    verifiedAt: timestamp('verified_at'),
    verificationTokenHash: varchar('verification_token_hash', { length: 64 }),
    verificationExpiresAt: timestamp('verification_expires_at'),

    // ISSUE-015/EPIC-005 (migration 0011): check-in portal marks. checkedInBy
    // is the staff member's free-typed name captured at cookie issuance
    // (lib/checkin-session.ts) — there is no per-staff users row, same
    // no-FK-to-users reasoning documented on rsvpInvitationLinks.createdBy
    // above for the environment-backed super admin.
    checkedInAt: timestamp('checked_in_at'),
    plusOneCheckedInAt: timestamp('plus_one_checked_in_at'),
    checkedInBy: varchar('checked_in_by', { length: 120 }),
    checkinNote: varchar('checkin_note', { length: 500 }),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    // A2-H05/A2-H06: one RSVP per (event, email) case-insensitively. Enforced at
    // the DB so concurrent duplicate inserts fail instead of racing past the
    // application-level check. Applied to prod as `rsvps_event_email_unique`.
    eventEmailUnique: uniqueIndex('rsvps_event_email_unique').on(table.eventId, sql`lower(${table.email})`),
    // A2-H02: capacity is enforced by the DB trigger `rsvps_capacity_check`
    // (drizzle doesn't model triggers — see drizzle/0002_enforce_event_capacity.sql).
    // Any seat-adding INSERT/UPDATE on a full event raises CAPACITY_FULL.
}))

// Application settings for global configuration
export const appSettings = pgTable('app_settings', {
    id: text('id').primaryKey(), // 'home_event_id', etc.
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================
// User Management Tables
// ============================================

// Users table for authentication and authorization
export const users = pgTable('users', {
    id: text('id').primaryKey().$defaultFn(generateId),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    // Role: 'super_admin' (full access), 'manager' (manage assigned events), 'viewer' (read-only)
    role: varchar('role', { length: 20 }).notNull().default('viewer'),
    isActive: boolean('is_active').default(true),
    invitedBy: text('invited_by'), // ID of user who invited this user
    // Forced-change flag: set after an admin/forgot-password reset issues a
    // temporary/new password, cleared once the user changes it themselves.
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at'),
})

// Single-use password reset tokens (forgot-password flow). Only the SHA-256
// hash of the raw token is ever stored (A4/A5); the raw value is emailed once
// and never persisted or logged.
export const passwordResetTokens = pgTable('password_reset_tokens', {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('user_id').notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    requestIp: varchar('request_ip', { length: 45 }),
    // Internal 1..3 slot used by a partial unique index to make the
    // serverless issuance cap race-safe across concurrent instances.
    issuanceSlot: integer('issuance_slot'),
}, table => ({
    userIdIndex: index('password_reset_tokens_user_id_idx').on(table.userId),
    expiresAtIndex: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
    activeSlotUnique: uniqueIndex('password_reset_tokens_active_slot_unique')
        .on(table.userId, table.issuanceSlot)
        .where(sql`${table.consumedAt} IS NULL AND ${table.issuanceSlot} IS NOT NULL`),
}))

// One-time RSVP invitation capabilities. Only the SHA-256 digest is stored;
// the bearer token is returned once by the admin API and never persisted.
// `createdBy` deliberately has no users FK because the environment-backed
// super admin (`super_admin_env`) is a valid actor without a users row.
export const rsvpInvitationLinks = pgTable('rsvp_invitation_links', {
    id: text('id').primaryKey().$defaultFn(generateId),
    eventId: text('event_id').notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // ISSUE-005/PLAN §2.1: per-link flags the organizer chooses at creation.
    // is_courtesy=false in a paid event routes the guest through Stripe like
    // the public flow; skip_verification=false routes through
    // pending_verification when the event has email verification enabled.
    // Both DEFAULT true preserve today's "confirmed directly" behavior for
    // every existing/unflagged link.
    isCourtesy: boolean('is_courtesy').notNull().default(true),
    skipVerification: boolean('skip_verification').notNull().default(true),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedRsvpId: text('used_rsvp_id')
        .references(() => rsvps.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: text('revoked_by'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    eventIdIndex: index('rsvp_invitation_links_event_id_idx').on(table.eventId),
    tokenHashIndex: uniqueIndex('rsvp_invitation_links_token_hash_unique').on(table.tokenHash),
}))

// ISSUE-010/EPIC-004: one row per Stripe Checkout session created for a paid
// RSVP. stripeSessionId is the idempotency key the webhook (ISSUE-012) will
// use to make `checkout.session.completed` safe to receive more than once.
// No DB CHECK constrains `status`/`currency` to a fixed set (same choice as
// rsvps.status): the small enum is enforced in the application layer.
export const rsvpPayments = pgTable('rsvp_payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    // ISSUE-010 deviation from the issue text ("rsvp_id int"): rsvps.id is
    // TEXT ($defaultFn(generateId) — see the rsvps table above), never an
    // integer, so an integer column could never satisfy this FK. Typed to
    // match the actual PK it references.
    rsvpId: text('rsvp_id').notNull()
        .references(() => rsvps.id, { onDelete: 'restrict' }),
    // Same slug convention as rsvps.eventId/rsvpInvitationLinks.eventId (PLAN
    // gotcha #1: this column stores events.slug, NOT events.id). Typed
    // varchar(100) per the issue spec (events.slug's own width); Postgres FKs
    // text<->varchar(n) cleanly either way, as rsvps.eventId already proves.
    eventId: varchar('event_id', { length: 100 }).notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' }),
    // Idempotency key for the webhook: exactly one payment row per Checkout
    // session, ever.
    stripeSessionId: varchar('stripe_session_id', { length: 255 }).notNull().unique(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
    // Always derived as price_amount * 100 (lib/payment-config.ts) — never a
    // second, independently-editable amount that could diverge from display.
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    // 'created' | 'paid' | 'expired' | 'refunded'
    status: varchar('status', { length: 20 }).notNull().default('created'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    paidAt: timestamp('paid_at'),
    refundedAt: timestamp('refunded_at'),
}, table => ({
    rsvpIdIndex: index('rsvp_payments_rsvp_id_idx').on(table.rsvpId),
    eventIdStatusIndex: index('rsvp_payments_event_id_status_idx').on(table.eventId, table.status),
    amountCentsCheck: check('rsvp_payments_amount_cents_check', sql`${table.amountCents} > 0`),
}))

// User sessions for persistent login (up to 30 days)
export const userSessions = pgTable('user_sessions', {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('user_id').notNull(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
})

// Assignment of events to users (for manager/viewer roles)
export const userEventAssignments = pgTable('user_event_assignments', {
    id: text('id').primaryKey().$defaultFn(generateId),
    userId: text('user_id').notNull(),
    eventId: text('event_id').notNull(),
    // Role for this specific event: 'manager' or 'viewer'
    role: varchar('role', { length: 20 }).notNull().default('viewer'),
    assignedBy: text('assigned_by'),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
})

// Type exports for use in application
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type RSVP = typeof rsvps.$inferSelect
export type NewRSVP = typeof rsvps.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserSession = typeof userSessions.$inferSelect
export type NewUserSession = typeof userSessions.$inferInsert
export type UserEventAssignment = typeof userEventAssignments.$inferSelect
export type NewUserEventAssignment = typeof userEventAssignments.$inferInsert
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert
export type RsvpInvitationLink = typeof rsvpInvitationLinks.$inferSelect
export type NewRsvpInvitationLink = typeof rsvpInvitationLinks.$inferInsert
export type RsvpPayment = typeof rsvpPayments.$inferSelect
export type NewRsvpPayment = typeof rsvpPayments.$inferInsert
