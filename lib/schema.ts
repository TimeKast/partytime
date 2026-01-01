import { pgTable, text, boolean, timestamp, integer, jsonb, varchar } from 'drizzle-orm/pg-core'

// Events table for multi-party support
export const events = pgTable('events', {
    id: text('id').primaryKey().notNull().$defaultFn(() => crypto.randomUUID()),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle').default(''),
    date: text('date').default(''),
    time: text('time').default(''),
    location: text('location').default(''),
    details: text('details').default(''),

    // Price configuration
    priceEnabled: boolean('price_enabled').default(false),
    priceAmount: integer('price_amount').default(0),
    priceCurrency: varchar('price_currency', { length: 10 }).default('MXN'),

    // Capacity configuration
    capacityEnabled: boolean('capacity_enabled').default(false),
    capacityLimit: integer('capacity_limit').default(0),

    // Background image
    backgroundImageUrl: text('background_image_url').default('/background.png'),

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

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// RSVPs table
export const rsvps = pgTable('rsvps', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // Reference to event (by slug for compatibility)
    eventId: text('event_id').notNull(),

    // Guest info
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    plusOne: boolean('plus_one').default(false),

    // Status
    status: varchar('status', { length: 20 }).default('confirmed').notNull(),

    // Email tracking
    emailSent: timestamp('email_sent'),
    emailHistory: jsonb('email_history').$type<Array<{
        sentAt: string
        type: 'confirmation' | 'reminder' | 're-invitation'
    }>>().default([]),

    // Cancel token
    cancelToken: text('cancel_token'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
})

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
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    // Role: 'super_admin' (full access), 'manager' (manage assigned events), 'viewer' (read-only)
    role: varchar('role', { length: 20 }).notNull().default('viewer'),
    isActive: boolean('is_active').default(true),
    invitedBy: text('invited_by'), // ID of user who invited this user
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at'),
})

// User sessions for persistent login (up to 30 days)
export const userSessions = pgTable('user_sessions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
})

// Assignment of events to users (for manager/viewer roles)
export const userEventAssignments = pgTable('user_event_assignments', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
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

