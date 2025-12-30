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

/**
 * Event settings (for backwards compatibility with existing config)
 * 
 * H-006 DEPRECATION NOTICE:
 * This table duplicates fields from the `events` table and should be consolidated.
 * Plan: Migrate all event_settings data to events table, then remove this table.
 * 
 * MIGRATION STEPS:
 * 1. Update saveEventSettings() to write to events table instead
 * 2. Update getEventSettings() to read from events table
 * 3. Run data migration script to copy eventSettings → events
 * 4. Remove this table and related queries
 * 
 * @deprecated Use `events` table directly for new features
 */
export const eventSettings = pgTable('event_settings', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventId: text('event_id').notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle').default(''),
    date: text('date').default(''),
    time: text('time').default(''),
    location: text('location').default(''),
    details: text('details').default(''),

    priceEnabled: boolean('price_enabled').default(false),
    priceAmount: integer('price_amount').default(0),
    priceCurrency: varchar('price_currency', { length: 10 }).default('MXN'),

    capacityEnabled: boolean('capacity_enabled').default(false),
    capacityLimit: integer('capacity_limit').default(0),

    backgroundImageUrl: text('background_image_url').default('/background.png'),

    // Theme colors
    primaryColor: varchar('primary_color', { length: 10 }).default('#FF1493'),
    secondaryColor: varchar('secondary_color', { length: 10 }).default('#00FFFF'),
    accentColor: varchar('accent_color', { length: 10 }).default('#FFD700'),

    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Application settings for global configuration
export const appSettings = pgTable('app_settings', {
    id: text('id').primaryKey(), // 'home_event_id', etc.
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})


// Type exports for use in application
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type RSVP = typeof rsvps.$inferSelect
export type NewRSVP = typeof rsvps.$inferInsert
export type EventSettings = typeof eventSettings.$inferSelect
