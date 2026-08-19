import {
    invalidCheckinSemantics,
    invalidHistoricalSemantics,
    invalidPasswordLifecycleSemantics,
    invalidPendingStatesSemantics,
    type CheckinSemanticState,
    type HistoricalSemanticState,
    type PasswordLifecycleSemanticState,
    type PendingStatesSemanticState,
} from '@/lib/migration-semantic-contract'
import {
    invalidRsvpInvitationSemantics,
    type RsvpInvitationSemanticState,
} from '@/lib/rsvp-invitation-migration-contract'
import {
    invalidPaymentsSemantics,
    type PaymentsSemanticState,
} from '@/lib/rsvp-payments-migration-contract'
import {
    invalidLedgerSemantics,
    type LedgerSemanticState,
} from '@/lib/event-ledger-migration-contract'

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
    imagePositionColumns: string[]
    imagePositionConstraints: string[]
    passwordLifecycleTables: string[]
    passwordLifecycleColumns: string[]
    passwordLifecycleConstraints: string[]
    passwordLifecycleIndexes: string[]
    passwordLifecycleSemantics: PasswordLifecycleSemanticState
    rsvpInvitationTables: string[]
    rsvpInvitationColumns: string[]
    rsvpInvitationConstraints: string[]
    rsvpInvitationIndexes: string[]
    rsvpInvitationSemantics: RsvpInvitationSemanticState
    pendingStatesColumns: string[]
    pendingStatesSemantics: PendingStatesSemanticState
    paymentsTables: string[]
    paymentsColumns: string[]
    paymentsConstraints: string[]
    paymentsIndexes: string[]
    paymentsSemantics: PaymentsSemanticState
    checkinColumns: string[]
    checkinSemantics: CheckinSemanticState
    ledgerTables: string[]
    ledgerColumns: string[]
    ledgerConstraints: string[]
    ledgerIndexes: string[]
    ledgerSemantics: LedgerSemanticState
}

export interface MigrationPreflightInput {
    drizzleRegistry: MigrationRegistryRow[] | null
    publicRegistry: MigrationRegistryRow[] | null
    expectedFoundationRegistry: MigrationRegistryRow[]
    expectedPresentationRegistry: MigrationRegistryRow[]
    expectedImagePositionRegistry: MigrationRegistryRow[]
    expectedPasswordLifecycleRegistry?: MigrationRegistryRow[]
    expectedRsvpInvitationRegistry?: MigrationRegistryRow[]
    // ISSUE-010: registry snapshot through 0009 (pending states applied,
    // payments not yet applied) — gates canApply0010, same role
    // expectedRsvpInvitationRegistry plays for canApply0009.
    expectedPendingStatesRegistry?: MigrationRegistryRow[]
    // ISSUE-015: registry snapshot through 0010 (payments applied, check-in
    // not yet applied) — gates canApply0011, same role expectedPendingStatesRegistry
    // plays for canApply0010.
    expectedPaymentsRegistry?: MigrationRegistryRow[]
    // ISSUE-021: registry snapshot through 0011 (check-in applied, ledger not
    // yet applied) — gates canApply0012, same role expectedPaymentsRegistry
    // plays for canApply0011.
    expectedCheckinRegistry?: MigrationRegistryRow[]
    expectedCurrentRegistry: MigrationRegistryRow[]
    objects: MigrationObjectState
}

export type MigrationPreflightClassification =
    | 'fresh-empty-database'
    | 'unregistered-historical-schema'
    | 'unregistered-presentation-schema'
    | 'unregistered-image-position-schema'
    | 'unregistered-password-lifecycle-schema'
    | 'unregistered-rsvp-invitation-schema'
    // ISSUE-010: was 'unregistered-current-schema' before migration 0010
    // existed (pendingStatesComplete, nothing beyond) — renamed the same way
    // 'unregistered-rsvp-invitation-schema' was carved out of the old
    // 'unregistered-current-schema' when 0009 shipped.
    | 'unregistered-pending-states-schema'
    // ISSUE-015: was 'unregistered-current-schema' before migration 0011
    // existed (paymentsComplete, nothing beyond) — same rename pattern as
    // 'unregistered-pending-states-schema' above when 0010 shipped.
    | 'unregistered-payments-schema'
    // ISSUE-021: was 'unregistered-current-schema' before migration 0012
    // existed (checkinComplete, nothing beyond) — same rename pattern as
    // 'unregistered-payments-schema' above when 0011 shipped.
    | 'unregistered-checkin-schema'
    | 'unregistered-current-schema'
    | 'unregistered-inconsistent-schema'
    | 'registered-foundation-ready'
    | 'registered-presentation-ready'
    | 'registered-image-position-ready'
    | 'registered-password-lifecycle-ready'
    | 'registered-rsvp-invitation-ready'
    // ISSUE-010: was 'registered-current-schema' before migration 0010
    // existed (pendingStatesComplete, registry through 0009, nothing beyond)
    // — same rename as above, now the "ready to apply 0010" gate.
    | 'registered-pending-states-ready'
    // ISSUE-015: was 'registered-current-schema' before migration 0011
    // existed (paymentsComplete, registry through 0010, nothing beyond) —
    // same rename as 'registered-pending-states-ready' above when 0010
    // shipped. Now the "ready to apply 0011" gate.
    | 'registered-payments-ready'
    // ISSUE-021: was 'registered-current-schema' before migration 0012
    // existed (checkinComplete, registry through 0011, nothing beyond) —
    // same rename as 'registered-payments-ready' above when 0011 shipped.
    // Now the "ready to apply 0012" gate.
    | 'registered-checkin-ready'
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

export const REQUIRED_IMAGE_POSITION_OBJECTS = {
    columns: ['background_image_position'],
    constraints: ['events_background_image_position_check'],
} as const

export const REQUIRED_PASSWORD_LIFECYCLE_OBJECTS = {
    tables: ['password_reset_tokens'],
    columns: [
        'users.must_change_password',
        'password_reset_tokens.id',
        'password_reset_tokens.user_id',
        'password_reset_tokens.token_hash',
        'password_reset_tokens.expires_at',
        'password_reset_tokens.consumed_at',
        'password_reset_tokens.created_at',
        'password_reset_tokens.request_ip',
        'password_reset_tokens.issuance_slot',
    ],
    constraints: [
        'password_reset_tokens_pkey',
        'password_reset_tokens_user_id_users_id_fk',
    ],
    indexes: [
        'password_reset_tokens_token_hash_unique',
        'password_reset_tokens_user_id_idx',
        'password_reset_tokens_expires_at_idx',
        'password_reset_tokens_active_slot_unique',
    ],
} as const

export const REQUIRED_RSVP_INVITATION_OBJECTS = {
    tables: ['rsvp_invitation_links'],
    columns: [
        'rsvp_invitation_links.id',
        'rsvp_invitation_links.event_id',
        'rsvp_invitation_links.token_hash',
        'rsvp_invitation_links.expires_at',
        'rsvp_invitation_links.used_at',
        'rsvp_invitation_links.used_rsvp_id',
        'rsvp_invitation_links.revoked_at',
        'rsvp_invitation_links.revoked_by',
        'rsvp_invitation_links.created_by',
        'rsvp_invitation_links.created_at',
    ],
    constraints: [
        'rsvp_invitation_links_pkey',
        'rsvp_invitation_links_event_id_events_slug_fk',
        'rsvp_invitation_links_used_rsvp_id_rsvps_id_fk',
    ],
    indexes: [
        'rsvp_invitation_links_event_id_idx',
        'rsvp_invitation_links_token_hash_unique',
    ],
} as const

// ISSUE-005 (EPIC-002/migration 0009): pure column additions, same flat
// 'table.column' format as the price_enabled/price_amount/price_currency
// entries above — no new table, no named constraints. The capacity trigger
// change that ships in the same migration is verified separately by
// HISTORICAL_SEMANTICS_QUERY's function.enforce_event_capacity check.
export const REQUIRED_PENDING_STATES_OBJECTS = {
    columns: [
        'events.email_verification_enabled',
        'rsvps.pending_expires_at',
        'rsvps.verified_at',
        'rsvps.verification_token_hash',
        'rsvps.verification_expires_at',
        'rsvp_invitation_links.is_courtesy',
        'rsvp_invitation_links.skip_verification',
    ],
} as const

// ISSUE-010 (EPIC-004/migration 0010): a new full table (rsvp_payments), same
// depth of verification as REQUIRED_RSVP_INVITATION_OBJECTS (0008) — plus the
// one flat column addition on events, same shape as REQUIRED_PENDING_STATES_OBJECTS
// (0009). See lib/rsvp-payments-migration-contract.ts for the semantic body.
export const REQUIRED_PAYMENTS_OBJECTS = {
    tables: ['rsvp_payments'],
    columns: [
        'events.payment_required',
        'rsvp_payments.id',
        'rsvp_payments.rsvp_id',
        'rsvp_payments.event_id',
        'rsvp_payments.stripe_session_id',
        'rsvp_payments.stripe_payment_intent_id',
        'rsvp_payments.amount_cents',
        'rsvp_payments.currency',
        'rsvp_payments.status',
        'rsvp_payments.created_at',
        'rsvp_payments.paid_at',
        'rsvp_payments.refunded_at',
    ],
    constraints: [
        'rsvp_payments_pkey',
        'rsvp_payments_rsvp_id_rsvps_id_fk',
        'rsvp_payments_event_id_events_slug_fk',
        'rsvp_payments_stripe_session_id_unique',
        'rsvp_payments_amount_cents_check',
    ],
    indexes: [
        'rsvp_payments_rsvp_id_idx',
        'rsvp_payments_event_id_status_idx',
    ],
} as const

// ISSUE-015 (EPIC-005/migration 0011): pure column additions across events
// and rsvps for the check-in portal — no new table, same flat 'table.column'
// shape as REQUIRED_PENDING_STATES_OBJECTS (0009), not the full-table depth
// of REQUIRED_PAYMENTS_OBJECTS (0010) that immediately precedes it in the
// tier sequence. See lib/migration-semantic-contract.ts's CHECKIN_SEMANTICS_QUERY
// for the semantic body.
export const REQUIRED_CHECKIN_OBJECTS = {
    columns: [
        'events.checkin_enabled',
        'events.checkin_password_hash',
        'events.checkin_password_updated_at',
        'rsvps.checked_in_at',
        'rsvps.plus_one_checked_in_at',
        'rsvps.checked_in_by',
        'rsvps.checkin_note',
    ],
} as const

// ISSUE-021 (EPIC-006/migration 0012): four new tables (the ledger) plus one
// flat column addition on events (the Stripe-mode toggle) — same combined
// shape REQUIRED_PAYMENTS_OBJECTS (0010) has, but across four tables instead
// of one; the composite (id, event_id) FKs and the Stripe node's partial
// unique index are verified by LEDGER_SEMANTICS_QUERY in
// lib/event-ledger-migration-contract.ts, not by object-name presence alone.
export const REQUIRED_LEDGER_OBJECTS = {
    tables: [
        'event_participants',
        'event_transactions',
        'event_transaction_shares',
        'event_settlements',
    ],
    columns: [
        'events.ledger_stripe_is_participant',
        'event_participants.id',
        'event_participants.event_id',
        'event_participants.kind',
        'event_participants.name',
        'event_participants.email',
        'event_participants.user_id',
        'event_participants.is_active',
        'event_participants.created_by',
        'event_participants.created_at',
        'event_transactions.id',
        'event_transactions.event_id',
        'event_transactions.type',
        'event_transactions.participant_id',
        'event_transactions.description',
        'event_transactions.amount_cents',
        'event_transactions.currency',
        'event_transactions.occurred_on',
        'event_transactions.note',
        'event_transactions.created_by',
        'event_transactions.created_at',
        'event_transactions.updated_at',
        'event_transactions.deleted_at',
        'event_transactions.deleted_by',
        'event_transaction_shares.id',
        'event_transaction_shares.transaction_id',
        'event_transaction_shares.event_id',
        'event_transaction_shares.participant_id',
        'event_transaction_shares.share_cents',
        'event_settlements.id',
        'event_settlements.event_id',
        'event_settlements.from_participant_id',
        'event_settlements.to_participant_id',
        'event_settlements.amount_cents',
        'event_settlements.currency',
        'event_settlements.settled_on',
        'event_settlements.note',
        'event_settlements.created_by',
        'event_settlements.created_at',
        'event_settlements.updated_at',
        'event_settlements.deleted_at',
        'event_settlements.deleted_by',
    ],
    constraints: [
        'event_participants_pkey',
        'event_participants_event_id_events_slug_fk',
        'event_participants_user_id_users_id_fk',
        'event_participants_kind_check',
        'event_participants_name_check',
        'event_transactions_pkey',
        'event_transactions_event_id_events_slug_fk',
        'event_transactions_participant_id_event_id_fk',
        'event_transactions_type_check',
        'event_transactions_description_check',
        'event_transactions_amount_cents_check',
        'event_transaction_shares_pkey',
        'event_transaction_shares_transaction_id_event_id_fk',
        'event_transaction_shares_participant_id_event_id_fk',
        'event_transaction_shares_share_cents_check',
        'event_settlements_pkey',
        'event_settlements_event_id_events_slug_fk',
        'event_settlements_from_participant_id_event_id_fk',
        'event_settlements_to_participant_id_event_id_fk',
        'event_settlements_from_to_check',
        'event_settlements_amount_cents_check',
    ],
    indexes: [
        'event_participants_stripe_kind_unique',
        'event_participants_event_name_unique',
        'event_participants_id_event_unique',
        'event_participants_event_id_idx',
        'event_transactions_id_event_unique',
        'event_transactions_event_id_idx',
        'event_transactions_event_id_type_idx',
        'event_transaction_shares_transaction_participant_unique',
        'event_transaction_shares_transaction_id_idx',
        'event_transaction_shares_participant_id_idx',
        'event_settlements_event_id_idx',
    ],
} as const

export interface MigrationPreflightResult {
    classification: MigrationPreflightClassification
    canBaseline0000Through0004: boolean
    canApply0005: boolean
    canApply0006: boolean
    canApply0007: boolean
    canApply0008: boolean
    canApply0009: boolean
    canApply0010: boolean
    canApply0011: boolean
    canApply0012: boolean
    missingHistoricalObjects: string[]
    missingPresentationObjects: string[]
    missingImagePositionObjects: string[]
    missingPasswordLifecycleObjects: string[]
    missingRsvpInvitationObjects: string[]
    missingPendingStatesObjects: string[]
    missingPaymentsObjects: string[]
    missingCheckinObjects: string[]
    missingLedgerObjects: string[]
    invalidHistoricalSemantics: string[]
    invalidPasswordLifecycleSemantics: string[]
    invalidRsvpInvitationSemantics: string[]
    invalidPendingStatesSemantics: string[]
    invalidPaymentsSemantics: string[]
    invalidCheckinSemantics: string[]
    invalidLedgerSemantics: string[]
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
    const missingImagePositionObjects = [
        ...missing(REQUIRED_IMAGE_POSITION_OBJECTS.columns, input.objects.imagePositionColumns),
        ...missing(REQUIRED_IMAGE_POSITION_OBJECTS.constraints, input.objects.imagePositionConstraints),
    ]
    const missingPasswordLifecycleObjects = [
        ...missing(REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.tables, input.objects.passwordLifecycleTables),
        ...missing(REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.columns, input.objects.passwordLifecycleColumns),
        ...missing(REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.constraints, input.objects.passwordLifecycleConstraints),
        ...missing(REQUIRED_PASSWORD_LIFECYCLE_OBJECTS.indexes, input.objects.passwordLifecycleIndexes),
    ]
    const missingRsvpInvitationObjects = [
        ...missing(REQUIRED_RSVP_INVITATION_OBJECTS.tables, input.objects.rsvpInvitationTables),
        ...missing(REQUIRED_RSVP_INVITATION_OBJECTS.columns, input.objects.rsvpInvitationColumns),
        ...missing(REQUIRED_RSVP_INVITATION_OBJECTS.constraints, input.objects.rsvpInvitationConstraints),
        ...missing(REQUIRED_RSVP_INVITATION_OBJECTS.indexes, input.objects.rsvpInvitationIndexes),
    ]
    const missingPendingStatesObjects = [
        ...missing(REQUIRED_PENDING_STATES_OBJECTS.columns, input.objects.pendingStatesColumns),
    ]
    const invalidSemanticObjects = invalidHistoricalSemantics(input.objects.historicalSemantics)
    const observedInvalidPasswordLifecycleObjects = invalidPasswordLifecycleSemantics(
        input.objects.passwordLifecycleSemantics,
    )
    const historicalComplete = missingHistoricalObjects.length === 0
        && invalidSemanticObjects.length === 0
        && input.objects.duplicateEventEmailGroups === 0
        && input.objects.orphanRsvps === 0
    const presentationAbsent = input.objects.presentationColumns.length === 0
        && input.objects.presentationConstraints.length === 0
    const presentationComplete = missingPresentationObjects.length === 0
    const imagePositionAbsent = input.objects.imagePositionColumns.length === 0
        && input.objects.imagePositionConstraints.length === 0
    const imagePositionComplete = missingImagePositionObjects.length === 0
    const passwordLifecycleAbsent = input.objects.passwordLifecycleTables.length === 0
        && input.objects.passwordLifecycleColumns.length === 0
        && input.objects.passwordLifecycleConstraints.length === 0
        && input.objects.passwordLifecycleIndexes.length === 0
    const invalidPasswordLifecycleObjects = passwordLifecycleAbsent
        ? []
        : observedInvalidPasswordLifecycleObjects
    const passwordLifecycleComplete = missingPasswordLifecycleObjects.length === 0
        && invalidPasswordLifecycleObjects.length === 0
    const rsvpInvitationAbsent = input.objects.rsvpInvitationTables.length === 0
        && input.objects.rsvpInvitationColumns.length === 0
        && input.objects.rsvpInvitationConstraints.length === 0
        && input.objects.rsvpInvitationIndexes.length === 0
    const observedInvalidRsvpInvitationObjects = invalidRsvpInvitationSemantics(
        input.objects.rsvpInvitationSemantics,
    )
    const invalidRsvpInvitationObjects = rsvpInvitationAbsent
        ? []
        : observedInvalidRsvpInvitationObjects
    const rsvpInvitationComplete = missingRsvpInvitationObjects.length === 0
        && invalidRsvpInvitationObjects.length === 0
    const pendingStatesAbsent = input.objects.pendingStatesColumns.length === 0
    const invalidPendingStatesObjects = pendingStatesAbsent
        ? []
        : invalidPendingStatesSemantics(input.objects.pendingStatesSemantics)
    const pendingStatesComplete = missingPendingStatesObjects.length === 0
        && invalidPendingStatesObjects.length === 0
    const missingPaymentsObjects = [
        ...missing(REQUIRED_PAYMENTS_OBJECTS.tables, input.objects.paymentsTables),
        ...missing(REQUIRED_PAYMENTS_OBJECTS.columns, input.objects.paymentsColumns),
        ...missing(REQUIRED_PAYMENTS_OBJECTS.constraints, input.objects.paymentsConstraints),
        ...missing(REQUIRED_PAYMENTS_OBJECTS.indexes, input.objects.paymentsIndexes),
    ]
    const paymentsAbsent = input.objects.paymentsTables.length === 0
        && input.objects.paymentsColumns.length === 0
        && input.objects.paymentsConstraints.length === 0
        && input.objects.paymentsIndexes.length === 0
    const invalidPaymentsObjects = paymentsAbsent
        ? []
        : invalidPaymentsSemantics(input.objects.paymentsSemantics)
    const paymentsComplete = missingPaymentsObjects.length === 0
        && invalidPaymentsObjects.length === 0
    const missingCheckinObjects = [
        ...missing(REQUIRED_CHECKIN_OBJECTS.columns, input.objects.checkinColumns),
    ]
    const checkinAbsent = input.objects.checkinColumns.length === 0
    const invalidCheckinObjects = checkinAbsent
        ? []
        : invalidCheckinSemantics(input.objects.checkinSemantics)
    const checkinComplete = missingCheckinObjects.length === 0
        && invalidCheckinObjects.length === 0
    const missingLedgerObjects = [
        ...missing(REQUIRED_LEDGER_OBJECTS.tables, input.objects.ledgerTables),
        ...missing(REQUIRED_LEDGER_OBJECTS.columns, input.objects.ledgerColumns),
        ...missing(REQUIRED_LEDGER_OBJECTS.constraints, input.objects.ledgerConstraints),
        ...missing(REQUIRED_LEDGER_OBJECTS.indexes, input.objects.ledgerIndexes),
    ]
    const ledgerAbsent = input.objects.ledgerTables.length === 0
        && input.objects.ledgerColumns.length === 0
        && input.objects.ledgerConstraints.length === 0
        && input.objects.ledgerIndexes.length === 0
    const invalidLedgerObjects = ledgerAbsent
        ? []
        : invalidLedgerSemantics(input.objects.ledgerSemantics)
    const ledgerComplete = missingLedgerObjects.length === 0
        && invalidLedgerObjects.length === 0
    const noRegistry = input.drizzleRegistry === null && input.publicRegistry === null
    const onlyDrizzleRegistry = input.drizzleRegistry !== null && input.publicRegistry === null
    const schemaIsEmpty = input.objects.tables.length === 0

    let classification: MigrationPreflightClassification
    if (noRegistry && schemaIsEmpty) {
        classification = 'fresh-empty-database'
    } else if (noRegistry && historicalComplete && presentationAbsent && imagePositionAbsent && passwordLifecycleAbsent) {
        classification = 'unregistered-historical-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionAbsent && passwordLifecycleAbsent) {
        classification = 'unregistered-presentation-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleAbsent) {
        classification = 'unregistered-image-position-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationAbsent) {
        classification = 'unregistered-password-lifecycle-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationComplete && pendingStatesAbsent) {
        classification = 'unregistered-rsvp-invitation-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationComplete && pendingStatesComplete && paymentsAbsent) {
        classification = 'unregistered-pending-states-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationComplete && pendingStatesComplete && paymentsComplete && checkinAbsent) {
        classification = 'unregistered-payments-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationComplete && pendingStatesComplete && paymentsComplete && checkinComplete && ledgerAbsent) {
        classification = 'unregistered-checkin-schema'
    } else if (noRegistry && historicalComplete && presentationComplete && imagePositionComplete && passwordLifecycleComplete && rsvpInvitationComplete && pendingStatesComplete && paymentsComplete && checkinComplete && ledgerComplete) {
        classification = 'unregistered-current-schema'
    } else if (noRegistry) {
        classification = 'unregistered-inconsistent-schema'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationAbsent
        && imagePositionAbsent
        && passwordLifecycleAbsent
        && registryMatches(input.drizzleRegistry!, input.expectedFoundationRegistry)
    ) {
        classification = 'registered-foundation-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionAbsent
        && passwordLifecycleAbsent
        && registryMatches(input.drizzleRegistry!, input.expectedPresentationRegistry)
    ) {
        classification = 'registered-presentation-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleAbsent
        && registryMatches(input.drizzleRegistry!, input.expectedImagePositionRegistry)
    ) {
        classification = 'registered-image-position-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationAbsent
        && pendingStatesAbsent
        && registryMatches(
            input.drizzleRegistry!,
            input.expectedPasswordLifecycleRegistry ?? input.expectedCurrentRegistry.slice(0, -1),
        )
    ) {
        classification = 'registered-password-lifecycle-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationComplete
        && pendingStatesAbsent
        // Callers written before 0009 existed only supply expectedCurrentRegistry
        // and expect it to mean "through 0008" (rsvp-invitation-complete); this
        // matches that shape unchanged. Callers that know about 0009 (the real
        // scripts/migration-preflight.ts) always pass expectedRsvpInvitationRegistry
        // explicitly, so this fallback never runs for them.
        && registryMatches(
            input.drizzleRegistry!,
            input.expectedRsvpInvitationRegistry ?? input.expectedCurrentRegistry,
        )
    ) {
        classification = 'registered-rsvp-invitation-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationComplete
        && pendingStatesComplete
        && paymentsAbsent
        // Same fallback shape as registered-rsvp-invitation-ready above:
        // scripts/migration-preflight.ts (the real caller) always passes
        // expectedPendingStatesRegistry explicitly now that 0010 exists.
        && registryMatches(
            input.drizzleRegistry!,
            input.expectedPendingStatesRegistry ?? input.expectedCurrentRegistry,
        )
    ) {
        classification = 'registered-pending-states-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationComplete
        && pendingStatesComplete
        && paymentsComplete
        && checkinAbsent
        // Same fallback shape as registered-pending-states-ready above:
        // scripts/migration-preflight.ts (the real caller) always passes
        // expectedPaymentsRegistry explicitly now that 0011 exists.
        && registryMatches(
            input.drizzleRegistry!,
            input.expectedPaymentsRegistry ?? input.expectedCurrentRegistry,
        )
    ) {
        classification = 'registered-payments-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationComplete
        && pendingStatesComplete
        && paymentsComplete
        && checkinComplete
        && ledgerAbsent
        // Same fallback shape as registered-payments-ready above:
        // scripts/migration-preflight.ts (the real caller) always passes
        // expectedCheckinRegistry explicitly now that 0012 exists.
        && registryMatches(
            input.drizzleRegistry!,
            input.expectedCheckinRegistry ?? input.expectedCurrentRegistry,
        )
    ) {
        classification = 'registered-checkin-ready'
    } else if (
        onlyDrizzleRegistry
        && historicalComplete
        && presentationComplete
        && imagePositionComplete
        && passwordLifecycleComplete
        && rsvpInvitationComplete
        && pendingStatesComplete
        && paymentsComplete
        && checkinComplete
        && ledgerComplete
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
    if (!passwordLifecycleAbsent && !passwordLifecycleComplete) {
        if (missingPasswordLifecycleObjects.length > 0) {
            reasons.push(`missing password lifecycle objects: ${missingPasswordLifecycleObjects.join(', ')}`)
        }
        if (invalidPasswordLifecycleObjects.length > 0) {
            reasons.push(`invalid password lifecycle semantics: ${invalidPasswordLifecycleObjects.join(', ')}`)
        }
    }
    if (!rsvpInvitationAbsent && !rsvpInvitationComplete) {
        if (missingRsvpInvitationObjects.length > 0) {
            reasons.push(`missing RSVP invitation objects: ${missingRsvpInvitationObjects.join(', ')}`)
        }
        if (invalidRsvpInvitationObjects.length > 0) {
            reasons.push(`invalid RSVP invitation semantics: ${invalidRsvpInvitationObjects.join(', ')}`)
        }
    }
    if (!pendingStatesAbsent && !pendingStatesComplete) {
        if (missingPendingStatesObjects.length > 0) {
            reasons.push(`missing pending states objects: ${missingPendingStatesObjects.join(', ')}`)
        }
        if (invalidPendingStatesObjects.length > 0) {
            reasons.push(`invalid pending states semantics: ${invalidPendingStatesObjects.join(', ')}`)
        }
    }
    if (!paymentsAbsent && !paymentsComplete) {
        if (missingPaymentsObjects.length > 0) {
            reasons.push(`missing payments objects: ${missingPaymentsObjects.join(', ')}`)
        }
        if (invalidPaymentsObjects.length > 0) {
            reasons.push(`invalid payments semantics: ${invalidPaymentsObjects.join(', ')}`)
        }
    }
    if (!checkinAbsent && !checkinComplete) {
        if (missingCheckinObjects.length > 0) {
            reasons.push(`missing check-in objects: ${missingCheckinObjects.join(', ')}`)
        }
        if (invalidCheckinObjects.length > 0) {
            reasons.push(`invalid check-in semantics: ${invalidCheckinObjects.join(', ')}`)
        }
    }
    if (!ledgerAbsent && !ledgerComplete) {
        if (missingLedgerObjects.length > 0) {
            reasons.push(`missing ledger objects: ${missingLedgerObjects.join(', ')}`)
        }
        if (invalidLedgerObjects.length > 0) {
            reasons.push(`invalid ledger semantics: ${invalidLedgerObjects.join(', ')}`)
        }
    }
    if (input.publicRegistry !== null) reasons.push('unexpected public.__drizzle_migrations registry')
    if (classification.startsWith('unregistered-')) reasons.push('migration registry is absent')

    return {
        classification,
        canBaseline0000Through0004: classification === 'unregistered-historical-schema',
        canApply0005: classification === 'registered-foundation-ready',
        canApply0006: classification === 'registered-presentation-ready',
        canApply0007: classification === 'registered-image-position-ready',
        canApply0008: classification === 'registered-password-lifecycle-ready',
        canApply0009: classification === 'registered-rsvp-invitation-ready',
        canApply0010: classification === 'registered-pending-states-ready',
        canApply0011: classification === 'registered-payments-ready',
        canApply0012: classification === 'registered-checkin-ready',
        missingHistoricalObjects,
        missingPresentationObjects,
        missingImagePositionObjects,
        missingPasswordLifecycleObjects,
        missingRsvpInvitationObjects,
        missingPendingStatesObjects,
        missingPaymentsObjects,
        missingCheckinObjects,
        missingLedgerObjects,
        invalidHistoricalSemantics: invalidSemanticObjects,
        invalidPasswordLifecycleSemantics: invalidPasswordLifecycleObjects,
        invalidRsvpInvitationSemantics: invalidRsvpInvitationObjects,
        invalidPendingStatesSemantics: invalidPendingStatesObjects,
        invalidPaymentsSemantics: invalidPaymentsObjects,
        invalidCheckinSemantics: invalidCheckinObjects,
        invalidLedgerSemantics: invalidLedgerObjects,
        reasons,
    }
}
