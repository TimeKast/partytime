import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { validateAdminAuth, getUnauthorizedResponse } from '@/lib/auth'
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

        if (isDatabaseConfigured()) {
            const { getAllEvents } = await import('@/lib/queries')
            const events = await getAllEvents(activeOnly)

            return NextResponse.json({
                success: true,
                count: events.length,
                events
            })
        } else {
            // Demo mode - return mock events
            console.log('⚠️  Modo DEMO - /api/events')
            const filtered = activeOnly ? mockEvents.filter(e => e.isActive) : mockEvents
            return NextResponse.json({
                success: true,
                count: filtered.length,
                events: filtered,
                note: 'Modo Demo: Configura DATABASE_URL para persistencia'
            })
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
        // Verify admin authentication
        if (!validateAdminAuth(request)) {
            return getUnauthorizedResponse()
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


