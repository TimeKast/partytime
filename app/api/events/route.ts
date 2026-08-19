import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { getUserEventAssignments } from '@/lib/user-queries'
import type { Event } from '@/lib/schema'
import { parseCreateEventRequest } from '@/lib/event-api-contract'

export const dynamic = 'force-dynamic'

// Mock storage for demo mode
const mockEvents: Event[] = []

type EventAccessRole = 'manager' | 'viewer'
type EventWithAccessRole = Event & { accessRole?: EventAccessRole }

function eventAccessRole(value: string): EventAccessRole | undefined {
    return value === 'manager' || value === 'viewer' ? value : undefined
}

/**
 * Explicit allowlist for the authenticated event picker/list. Database Event
 * rows contain server-only fields (most importantly checkinPasswordHash), so
 * returning a spread of the Drizzle row would make every new schema column
 * public to the browser by default. Keep this DTO intentionally small: these
 * are the fields the current admin UI consumes plus a hash-free check-in
 * readiness summary.
 */
function toAdminEventDto(event: EventWithAccessRole) {
    return {
        id: event.id,
        slug: event.slug,
        title: event.title,
        subtitle: event.subtitle ?? '',
        date: event.date ?? '',
        time: event.time ?? '',
        location: event.location ?? '',
        isActive: event.isActive ?? false,
        ...(event.accessRole ? { accessRole: event.accessRole } : {}),
        checkin: {
            enabled: event.checkinEnabled,
            hasPassword: !!event.checkinPasswordHash,
            updatedAt: event.checkinPasswordUpdatedAt,
        },
    }
}

/**
 * GET /api/events
 * List all events (optionally filter by active status)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const activeOnly = searchParams.get('active') === 'true'

        // Check authentication
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const currentUser = await validateSession(token)
        if (!currentUser) {
            return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
        }

        if (isDatabaseConfigured()) {
            const { getAllEvents } = await import('@/lib/queries')
            let events: EventWithAccessRole[] = await getAllEvents(activeOnly)

            // Filter for non-super-admins
            if (currentUser.role !== 'super_admin') {
                const assignments = await getUserEventAssignments(currentUser.id)
                const roleByEventId = new Map<string, EventAccessRole>(
                    assignments.flatMap(assignment => {
                        const role = eventAccessRole(assignment.assignment.role)
                        return role ? [[assignment.event.id, role]] : []
                    }),
                )
                events = events
                    .filter(e => roleByEventId.has(e.id))
                    .map(e => ({ ...e, accessRole: roleByEventId.get(e.id) }))
            } else {
                // For UI gating convenience, treat super_admin as manager everywhere
                events = events.map(e => ({ ...e, accessRole: 'manager' }))
            }

            const eventDtos = events.map(toAdminEventDto)

            return NextResponse.json({
                success: true,
                count: eventDtos.length,
                events: eventDtos
            })
        } else {
            // Demo mode logic (omitted or kept simple)
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 })
        }
    } catch (error) {
        console.error('Error listing events:', error)
        return NextResponse.json({
            success: false,
            error: 'Error al obtener eventos'
        }, { status: 500 })
    }
}

/**
 * POST /api/events
 * Create a new event (requires admin auth)
 */
export async function POST(request: NextRequest) {
    try {
        // Verify session
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const currentUser = await validateSession(token)
        if (!currentUser) {
            return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
        }

        // Only super_admin can create events
        if (currentUser.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Acceso denegado. Se requiere ser Super Admin.' }, { status: 403 })
        }

        const body = await request.json()
        const parsedEvent = parseCreateEventRequest(body)
        if (!parsedEvent.success) {
            return NextResponse.json({ success: false, error: parsedEvent.error }, { status: 400 })
        }
        const eventInput = parsedEvent.value

        if (isDatabaseConfigured()) {
            const { createEvent } = await import('@/lib/queries')
            const event = await createEvent(eventInput)

            return NextResponse.json({
                success: true,
                // POST is super-admin-only. Apply the same allowlist as GET so
                // a future create path can never echo a server-only column.
                event: toAdminEventDto({ ...event, accessRole: 'manager' })
            }, { status: 201 })
        } else {
            // Demo mode - save to mock array
            console.log('⚠️  Modo DEMO - Creando evento:', eventInput.slug)
            const mockEvent = {
                id: `demo-${Date.now()}`,
                ...eventInput,
                createdAt: new Date(),
                updatedAt: new Date()
            } as Event
            mockEvents.push(mockEvent)

            return NextResponse.json({
                success: true,
                event: toAdminEventDto({ ...mockEvent, accessRole: 'manager' }),
                note: 'Modo Demo: Datos en memoria temporal'
            }, { status: 201 })
        }
    } catch (error) {
        console.error('Error creating event:', error)

        const message = error instanceof Error ? error.message : ''
        if (message.includes('Ya existe')) {
            return NextResponse.json({
                success: false,
                error: message
            }, { status: 409 })
        }

        return NextResponse.json({
            success: false,
            error: 'Error al crear evento'
        }, { status: 500 })
    }
}
