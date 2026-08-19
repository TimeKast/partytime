import { pgTable, text, boolean, timestamp, integer, jsonb, varchar, uuid, uniqueIndex, index, check, date, foreignKey } from 'drizzle-orm/pg-core'
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

    // ISSUE-021/EPIC-006 (migration 0012): toggle for how the virtual Stripe
    // participant node (event_participants.kind='stripe', PLAN-EPIC-006.md
    // §2.6a) is presented in the ledger summary. `true` = "the account
    // belongs to someone" — the Stripe node enters the debt graph like any
    // other participant. `false` (default) = Stripe is the event's fund:
    // its figures live in a separate summary section and can leave a
    // remainder of profit. The mode never changes what is persisted or how
    // the calculation engine works (PLAN §2.6b/§3.2) — only presentation.
    // Deliberately NOT exposed by /api/events' DTO allowlist (PLAN gotcha
    // #6): it only travels through the ledger config/summary APIs.
    ledgerStripeIsParticipant: boolean('ledger_stripe_is_participant').notNull().default(false),

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
    // Exact Checkout total in cents: the server derives the per-person unit
    // from price_amount * 100, then multiplies by the persisted RSVP party
    // size (owner + optional companion). Never accepts a client-provided total.
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

// ============================================
// EPIC-006: Event financial ledger (migration 0012)
// ============================================
// Internal (admin-only) Splitwise-style ledger of manual income/expenses per
// event — see docs/backlog/PLAN-EPIC-006.md for the full design. No public
// surface; queries and APIs land in later issues (ISSUE-023+). Cross-event
// integrity is enforced entirely at the DB layer: event_participants and
// event_transactions each carry a unique(id, event_id) anchor, and every
// table that references them carries its own event_id with a composite FK
// (participant_id, event_id) / (transaction_id, event_id) — a participant or
// transaction from event A can never be attached to a row of event B, even by
// application bug (PLAN §3.1/gotcha #1).

// Ledger participants: free registration per event (PLAN §2.1), not a users
// account. Identity must stay stable to aggregate balances correctly, so this
// is a table with a case-insensitive unique name per event, not a text field
// re-typed on every transaction (alta once, movements select from a list).
export const eventParticipants = pgTable('event_participants', {
    id: text('id').primaryKey().notNull().$defaultFn(generateId),
    // Same slug convention as rsvps.eventId (PLAN gotcha #1: stores
    // events.slug, not events.id).
    eventId: text('event_id').notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' }),
    // 'person' | 'stripe'. 'stripe' is the virtual participant representing
    // money collected by the app (PLAN §2.6a) — auto-provisioned lazily by
    // ensureStripeParticipant (ISSUE-023) via an idempotent
    // INSERT ... ON CONFLICT targeting the partial unique index below.
    kind: varchar('kind', { length: 10 }).notNull().default('person'),
    name: varchar('name', { length: 120 }).notNull(),
    // Contact-only in the MVP: no email flow is triggered from the ledger.
    email: varchar('email', { length: 255 }),
    // Optional link to a user with an account; always NULL for kind='stripe'.
    userId: text('user_id')
        .references(() => users.id, { onDelete: 'set null' }),
    // Deactivate instead of delete — participants referenced by movements
    // cannot be removed (ON DELETE RESTRICT below/on children). The Stripe
    // node is never deactivated; that is enforced by the API (ISSUE-023),
    // not the DB.
    isActive: boolean('is_active').notNull().default(true),
    // Same no-FK-to-users reasoning as rsvpInvitationLinks.createdBy above:
    // the environment-backed super admin is a valid actor without a row.
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
    kindCheck: check('event_participants_kind_check', sql`${table.kind} in ('person', 'stripe')`),
    nameCheck: check(
        'event_participants_name_check',
        sql`char_length(btrim(${table.name})) between 2 and 120`,
    ),
    // PLAN §2.6a: at most one Stripe node per event; other events may each
    // have their own. This is the ON CONFLICT anchor for the idempotent
    // Stripe-node insert.
    stripeNodeUnique: uniqueIndex('event_participants_stripe_kind_unique')
        .on(table.eventId)
        .where(sql`${table.kind} = 'stripe'`),
    // PLAN §2.1: case-insensitive identity per event — no typo/accent
    // duplicates silently splitting one person's balance in two.
    eventNameUnique: uniqueIndex('event_participants_event_name_unique')
        .on(table.eventId, sql`lower(${table.name})`),
    // Anchor for the composite FKs carried by event_transactions,
    // event_transaction_shares and event_settlements below (gotcha #1).
    idEventUnique: uniqueIndex('event_participants_id_event_unique').on(table.id, table.eventId),
    eventIdIndex: index('event_participants_event_id_idx').on(table.eventId),
}))

// A single expense or income movement. `participantId` is who paid (expense)
// or who received (income) — never a free-typed name (PLAN §2.1/§2.3).
export const eventTransactions = pgTable('event_transactions', {
    id: text('id').primaryKey().notNull().$defaultFn(generateId),
    eventId: text('event_id').notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' }),
    // 'expense' | 'income'
    type: varchar('type', { length: 10 }).notNull(),
    participantId: text('participant_id').notNull(),
    description: varchar('description', { length: 200 }).notNull(),
    // Always centavos, never a float (PLAN gotcha #3). The API-level sanity
    // cap (<= 99,999,999, PLAN gotcha #7) is not expressed here — the DB
    // CHECK only guards the mathematical invariant amount_cents > 0.
    amountCents: integer('amount_cents').notNull(),
    // Single currency per ledger; cross-transaction consistency is validated
    // at the API layer (PLAN §2.8), not by a DB constraint.
    currency: varchar('currency', { length: 10 }).notNull(),
    occurredOn: date('occurred_on').notNull(),
    note: varchar('note', { length: 500 }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    // Soft-delete (PLAN §2.9): balances recalculate on demand, so editing or
    // deleting a movement never leaves stale derived state. Never a physical
    // DELETE of a money record.
    deletedAt: timestamp('deleted_at'),
    deletedBy: text('deleted_by'),
}, table => ({
    typeCheck: check('event_transactions_type_check', sql`${table.type} in ('expense', 'income')`),
    descriptionCheck: check(
        'event_transactions_description_check',
        sql`char_length(btrim(${table.description})) between 1 and 200`,
    ),
    amountCentsCheck: check('event_transactions_amount_cents_check', sql`${table.amountCents} > 0`),
    // Composite FK (gotcha #1): a participant from another event can never
    // be attached to this movement, enforced at the DB even against an
    // application bug.
    participantEventFk: foreignKey({
        columns: [table.participantId, table.eventId],
        foreignColumns: [eventParticipants.id, eventParticipants.eventId],
        name: 'event_transactions_participant_id_event_id_fk',
    }).onDelete('restrict'),
    // Anchor for event_transaction_shares' composite FK below.
    idEventUnique: uniqueIndex('event_transactions_id_event_unique').on(table.id, table.eventId),
    eventIdIndex: index('event_transactions_event_id_idx').on(table.eventId),
    eventIdTypeIndex: index('event_transactions_event_id_type_idx').on(table.eventId, table.type),
}))

// Exact per-participant split of a movement's amount. Sum(share_cents) must
// equal the parent transaction's amount_cents — not expressible as a
// single-row CHECK (same reasoning as rsvp_payments.status's application-level
// enum), so it is enforced inside the write CTE (PLAN gotcha #2) plus tests,
// not here.
export const eventTransactionShares = pgTable('event_transaction_shares', {
    id: text('id').primaryKey().notNull().$defaultFn(generateId),
    transactionId: text('transaction_id').notNull(),
    eventId: text('event_id').notNull(),
    participantId: text('participant_id').notNull(),
    shareCents: integer('share_cents').notNull(),
}, table => ({
    shareCentsCheck: check('event_transaction_shares_share_cents_check', sql`${table.shareCents} > 0`),
    // Shares die with their movement: a hard delete of the parent (test-only
    // — production code only soft-deletes) cascades here so no orphan share
    // ever outlives its transaction.
    transactionEventFk: foreignKey({
        columns: [table.transactionId, table.eventId],
        foreignColumns: [eventTransactions.id, eventTransactions.eventId],
        name: 'event_transaction_shares_transaction_id_event_id_fk',
    }).onDelete('cascade'),
    // Composite FK (gotcha #1), symmetric with event_transactions above.
    participantEventFk: foreignKey({
        columns: [table.participantId, table.eventId],
        foreignColumns: [eventParticipants.id, eventParticipants.eventId],
        name: 'event_transaction_shares_participant_id_event_id_fk',
    }).onDelete('restrict'),
    transactionParticipantUnique: uniqueIndex('event_transaction_shares_transaction_participant_unique')
        .on(table.transactionId, table.participantId),
    transactionIdIndex: index('event_transaction_shares_transaction_id_idx').on(table.transactionId),
    participantIdIndex: index('event_transaction_shares_participant_id_idx').on(table.participantId),
}))

// A payment between participants that reduces balances toward zero
// (Splitwise-style settle-up, PLAN §1/§2.9). A Stripe payout/withdrawal is
// modeled the same way, with `fromParticipantId` set to the Stripe node
// (PLAN §2.6a) — no schema difference.
export const eventSettlements = pgTable('event_settlements', {
    id: text('id').primaryKey().notNull().$defaultFn(generateId),
    eventId: text('event_id').notNull()
        .references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' }),
    fromParticipantId: text('from_participant_id').notNull(),
    toParticipantId: text('to_participant_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    settledOn: date('settled_on').notNull(),
    note: varchar('note', { length: 500 }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    // Soft-delete, same reasoning as event_transactions above.
    deletedAt: timestamp('deleted_at'),
    deletedBy: text('deleted_by'),
}, table => ({
    fromNotToCheck: check(
        'event_settlements_from_to_check',
        sql`${table.fromParticipantId} <> ${table.toParticipantId}`,
    ),
    amountCentsCheck: check('event_settlements_amount_cents_check', sql`${table.amountCents} > 0`),
    fromParticipantEventFk: foreignKey({
        columns: [table.fromParticipantId, table.eventId],
        foreignColumns: [eventParticipants.id, eventParticipants.eventId],
        name: 'event_settlements_from_participant_id_event_id_fk',
    }).onDelete('restrict'),
    toParticipantEventFk: foreignKey({
        columns: [table.toParticipantId, table.eventId],
        foreignColumns: [eventParticipants.id, eventParticipants.eventId],
        name: 'event_settlements_to_participant_id_event_id_fk',
    }).onDelete('restrict'),
    eventIdIndex: index('event_settlements_event_id_idx').on(table.eventId),
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
export type EventParticipant = typeof eventParticipants.$inferSelect
export type NewEventParticipant = typeof eventParticipants.$inferInsert
export type EventTransaction = typeof eventTransactions.$inferSelect
export type NewEventTransaction = typeof eventTransactions.$inferInsert
export type EventTransactionShare = typeof eventTransactionShares.$inferSelect
export type NewEventTransactionShare = typeof eventTransactionShares.$inferInsert
export type EventSettlement = typeof eventSettlements.$inferSelect
export type NewEventSettlement = typeof eventSettlements.$inferInsert
