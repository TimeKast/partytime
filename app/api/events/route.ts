import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { getUserAccessibleEventIds } from '@/lib/user-queries'
import type { Event } from '@/lib/schema'

export const dynamic = 'force-dynamic'

// Mock storage for demo mode
const mockEvents: Event[] = []

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
            let events = await getAllEvents(activeOnly)

            // Filter for non-super-admins
            if (currentUser.role !== 'super_admin') {
                const accessibleIds = await getUserAccessibleEventIds(currentUser.id)
                events = events.filter(e => accessibleIds.includes(e.id))
            }

            return NextResponse.json({
                success: true,
                count: events.length,
                events
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

        // Validate required fields
        if (!body.slug || !body.title) {
            return NextResponse.json({
                success: false,
                error: 'slug y title son requeridos'
            }, { status: 400 })
        }

        // Validate slug format (URL-friendly)
        if (!/^[a-z0-9-]+$/.test(body.slug)) {
            return NextResponse.json({
                success: false,
                error: 'El slug solo puede contener letras minúsculas, números y guiones'
            }, { status: 400 })
        }

        // Build event input with defaults
        const eventInput = {
            slug: body.slug,
            title: body.title,
            subtitle: body.subtitle || '',
            date: body.date || '',
            time: body.time || '',
            location: body.location || '',
            details: body.details || '',
            priceEnabled: body.price?.enabled || false,
            priceAmount: body.price?.amount || 0,
            priceCurrency: body.price?.currency || 'MXN',
            capacityEnabled: body.capacity?.enabled || false,
            capacityLimit: body.capacity?.limit || 0,
            backgroundImageUrl: body.backgroundImage?.url || '/background.png',
            theme: body.theme || {
                primaryColor: '#FF1493',
                secondaryColor: '#00FFFF',
                accentColor: '#FFD700',
                backgroundColor: '#1a0033',
                textColor: '#ffffff'
            },
            hostName: body.contact?.hostName || '',
            hostEmail: body.contact?.hostEmail || '',
            hostPhone: body.contact?.hostPhone || '',
            isActive: body.isActive !== undefined ? body.isActive : true
        }

        if (isDatabaseConfigured()) {
            const { createEvent } = await import('@/lib/queries')
            const event = await createEvent(eventInput)

            return NextResponse.json({
                success: true,
                event
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
                event: mockEvent,
                note: 'Modo Demo: Datos en memoria temporal'
            }, { status: 201 })
        }
    } catch (error: any) {
        console.error('Error creating event:', error)

        if (error.message?.includes('Ya existe')) {
            return NextResponse.json({
                success: false,
                error: error.message
            }, { status: 409 })
        }

        return NextResponse.json({
            success: false,
            error: 'Error al crear evento'
        }, { status: 500 })
    }
}


