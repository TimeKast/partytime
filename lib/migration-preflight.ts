import {
    invalidHistoricalSemantics,
    type HistoricalSemanticState,
} from '@/lib/migration-semantic-contract'

export interface MigrationRegistryRow {
    hash: string
    createdAt: number
}

export interface MigrationObjectState {
    tables: string[]
    columns: string[]
    constraints: string[]
    indexes: string[]
    triggers: string[]
    functions: string[]
    historicalSemantics: HistoricalSemanticState
    duplicateEventEmailGroups: number
    orphanRsvps: number
    presentationColumns: string[]
    presentationConstraints: string[]
}

export interface MigrationPreflightInput {
    drizzleRegistry: MigrationRegistryRow[] | null
    publicRegistry: MigrationRegistryRow[] | null
    expectedFoundationRegistry: MigrationRegistryRow[]
    expectedCurrentRegistry: MigrationRegistryRow[]
    objects: MigrationObjectState
}

export type MigrationPreflightClassification =
    | 'fresh-empty-database'
    | 'unregistered-historical-schema'
    | 'unregistered-current-schema'
    | 'unregistered-inconsistent-schema'
    | 'registered-foundation-ready'
    | 'registered-current-schema'
    | 'registered-inconsistent-schema'

export const REQUIRED_HISTORICAL_OBJECTS = {
    tables: [
        'app_settings',
        'events',
        'rsvps',
        'user_event_assignments',
        'user_sessions',
        'users',
    ],
    columns: [
        'app_settings.id', 'app_settings.value', 'app_settings.updated_at',
        'events.id', 'events.slug', 'events.title', 'events.display_title', 'events.subtitle',
        'events.date', 'events.time', 'events.location', 'events.details',
        'events.price_enabled', 'events.price_amount', 'events.price_currency',
        'events.capacity_enabled', 'events.capacity_limit', 'events.background_image_url',
        'events.og_image_url', 'events.theme', 'events.host_name', 'events.host_email',
        'events.host_phone', 'events.is_active', 'events.rsvp_closed',
        'events.rsvp_closed_message', 'events.require_plus_one_name',
        'events.email_confirmation_enabled', 'events.reminder_enabled',
        'events.reminder_scheduled_at', 'events.reminder_sent_at',
        'events.created_at', 'events.updated_at',
        'rsvps.id', 'rsvps.event_id', 'rsvps.name', 'rsvps.email', 'rsvps.phone',
        'rsvps.plus_one', 'rsvps.plus_one_name', 'rsvps.status', 'rsvps.email_sent',
        'rsvps.email_history', 'rsvps.cancel_token', 'rsvps.created_at',
        'user_event_assignments.id', 'user_event_assignments.user_id',
        'user_event_assignments.event_id', 'user_event_assignments.role',
        'user_event_assignments.assigned_by', 'user_event_assignments.assigned_at',
        'user_sessions.id', 'user_sessions.user_id', 'user_sessions.token',
        'user_sessions.expires_at', 'user_sessions.created_at', 'user_sessions.user_agent',
        'user_sessions.ip_address', 'users.id', 'users.email', 'users.password_hash',
        'users.name', 'users.role', 'users.is_active', 'users.invited_by',
        'users.created_at', 'users.last_login_at',
    ],
    constraints: [
        'app_settings_pkey',
        'events_pkey',
        'events_slug_unique',
        'rsvps_pkey',
        'rsvps_event_id_events_slug_fk',
        'user_event_assignments_pkey',
        'user_sessions_pkey',
        'user_sessions_token_unique',
        'users_pkey',
        'users_email_unique',
    ],
    indexes: ['rsvps_event_email_unique'],
    triggers: ['rsvps_capacity_check'],
    functions: ['enforce_event_capacity'],
} as const

export const REQUIRED_PRESENTATION_OBJECTS = {
    columns: [
        'presentation_mode',
        'rsvp_title',
        'rsvp_button_label',
        'background_overlay_strength',
        'background_image_fit',
    ],
    constraints: [
        'events_presentation_mode_check',
        'events_background_image_fit_check',
        'events_background_overlay_strength_check',
        'events_rsvp_button_label_check',
    ],
} as const

export interface MigrationPreflightResult {
    classification: MigrationPreflightClassification
    canBaseline0000Through0004: boolean
    canApply0005: boolean
    missingHistoricalObjects: string[]
    missingPresentationObjects: string[]
    invalidHistoricalSemantics: string[]
    reasons: string[]
}

function missing(expected: readonly string[], actual: string[]): string[] {
    const present = new Set(actual)
    return expected.filter(item => !present.has(item))
}

function registryMatches(actual: MigrationRegistryRow[], expected: MigrationRegistryRow[]): boolean {
    if (actual.length !== expected.length) return false
    return actual.every((row, index) => (
        row.hash === expected[index].hash && row.createdAt === expected[index].createdAt
    ))
}

export function classifyMigrationPreflight(input: MigrationPreflightInput): MigrationPreflightResult {
    const missingHistoricalObjects = [
        ...missing(REQUIRED_HISTORICAL_OBJECTS.tables, input.objects.tables),
        ...missing(REQUIRED_HISTORICAL_OBJECTS.columns, input.objects.columns),
        ...missing(REQUIRED_HISTORICAL_OBJECTS.constraints, input.objects.constraints),
        ...missing(REQUIRED_HISTORICAL_OBJECTS.indexes, input.objects.indexes),
        ...missing(REQUIRED_HISTORICAL_OBJECTS.triggers, input.objects.triggers),
        ...missing(REQUIRED_HISTORICAL_OBJECTS.functions, input.objects.functions),
    ]
    const missingPresentationObjects = [
        ...missing(REQUIRED_PRESENTATION_OBJECTS.columns, input.objects.presentationColumns),
        ...missing(REQUIRED_PRESENTATION_OBJECTS.constraints, input.objects.presentationConstraints),
    ]
    const invalidSemanticObjects = invalidHistoricalSemantics(input.objects.historicalSemantics)
    const historicalComplete = missingHistoricalObjects.length === 0
        && invalidSemanticObjects.length === 0
        && input.objects.duplicateEventEmailGroups === 0
        && input.objects.orphanRsvps === 0
    const presentationAbsent = input.objects.presentationColumns.length === 0
        && input.objects.presentationConstraints.length === 0
    const presentationComplete = missingPresentationObjects.length === 0
    const noRegistry = input.drizzleRegistry === null && input.publicRegistry === null
    const onlyDrizzleRegistry = input.drizzleRegistry !== null && input.publicRegistry === null
    const schemaIsEmpty = input.objects.tables.length === 0

    let classification: MigrationPreflightClassification
    if (noRegistry && schemaIsEmpty) {
        classification = 'fresh-empty-database'
    } else if (noRegistry && historicalComplete && presentationAbsent) {
        classification = 'unregistered-historical-schema'
    } else if (noRegistry && historicalComplete && presentationComplete) {
        classification = 'unregistered-current-schema'
    } else if (noRegistry) {
        classification = 'unregistered-inconsistent-schema'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationAbsent
        && registryMatches(input.drizzleRegistry!, input.expectedFoundationRegistry)
    ) {
        classification = 'registered-foundation-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && registryMatches(input.drizzleRegistry!, input.expectedCurrentRegistry)
    ) {
        classification = 'registered-current-schema'
    } else {
        classification = 'registered-inconsistent-schema'
    }

    const reasons: string[] = []
    if (!historicalComplete) {
        if (missingHistoricalObjects.length > 0) reasons.push(`missing: ${missingHistoricalObjects.join(', ')}`)
        if (input.objects.duplicateEventEmailGroups !== 0) {
            reasons.push(`duplicate event/email groups: ${input.objects.duplicateEventEmailGroups}`)
        }
        if (input.objects.orphanRsvps !== 0) reasons.push(`orphan RSVPs: ${input.objects.orphanRsvps}`)
        if (invalidSemanticObjects.length > 0) {
            reasons.push(`invalid historical semantics: ${invalidSemanticObjects.join(', ')}`)
        }
    }
    if (input.publicRegistry !== null) reasons.push('unexpected public.__drizzle_migrations registry')
    if (classification.startsWith('unregistered-')) reasons.push('migration registry is absent')

    return {
        classification,
        canBaseline0000Through0004: classification === 'unregistered-historical-schema',
        canApply0005: classification === 'registered-foundation-ready',
        missingHistoricalObjects,
        missingPresentationObjects,
        invalidHistoricalSemantics: invalidSemanticObjects,
        reasons,
    }
}
