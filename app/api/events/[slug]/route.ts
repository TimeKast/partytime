import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { existsSync, renameSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

/**
 * Rename OG images in /public when slug changes
 * Looks for og-[oldSlug].png and og-[oldSlug].jpg
 */
function renameOgImages(oldSlug: string, newSlug: string): { renamed: string[], errors: string[] } {
    const publicDir = join(process.cwd(), 'public')
    const extensions = ['.png', '.jpg', '.jpeg', '.webp']
    const renamed: string[] = []
    const errors: string[] = []

    for (const ext of extensions) {
        const oldPath = join(publicDir, `og-${oldSlug}${ext}`)
        const newPath = join(publicDir, `og-${newSlug}${ext}`)

        if (existsSync(oldPath)) {
            try {
                // Check if destination already exists
                if (existsSync(newPath)) {
                    errors.push(`og-${newSlug}${ext} already exists, skipping rename`)
                    continue
                }
                renameSync(oldPath, newPath)
                renamed.push(`og-${oldSlug}${ext} → og-${newSlug}${ext}`)
                console.log(`[Slug Change] Renamed OG image: og-${oldSlug}${ext} → og-${newSlug}${ext}`)
            } catch (err) {
                const errorMsg = `Failed to rename og-${oldSlug}${ext}: ${err}`
                errors.push(errorMsg)
                console.error(`[Slug Change] ${errorMsg}`)
            }
        }
    }

    return { renamed, errors }
}

// Default theme colors (used when event has no theme set)
const DEFAULT_THEME = {
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700',
    backgroundColor: '#1a0033',
    textColor: '#ffffff'
}

interface RouteParams {
    params: Promise<{ slug: string }>
}

/**
 * GET /api/events/[slug]
 * Get a specific event by its URL slug
 * All events must exist in the database
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { slug } = await params

        if (isDatabaseConfigured()) {
            const { getEventBySlug } = await import('@/lib/queries')
            const event = await getEventBySlug(slug)

            if (event) {
                // Extract theme from jsonb or use defaults
                const theme = (event.theme as any) || DEFAULT_THEME

                const formattedEvent = {
                    ...event,
                    backgroundImage: {
                        url: event.backgroundImageUrl || '/background.png'
                    },
                    price: {
                        enabled: event.priceEnabled ?? false,
                        amount: event.priceAmount ?? 0,
                        currency: event.priceCurrency || 'MXN'
                    },
                    capacity: {
                        enabled: event.capacityEnabled ?? false,
                        limit: event.capacityLimit ?? 0
                    },
                    theme: {
                        primaryColor: theme.primaryColor || DEFAULT_THEME.primaryColor,
                        secondaryColor: theme.secondaryColor || DEFAULT_THEME.secondaryColor,
                        accentColor: theme.accentColor || DEFAULT_THEME.accentColor,
                        backgroundColor: theme.backgroundColor || DEFAULT_THEME.backgroundColor,
                        textColor: theme.textColor || DEFAULT_THEME.textColor
                    }
                }

                return NextResponse.json({
                    success: true,
                    event: formattedEvent
                })
            }

            // Event not found in database
            return NextResponse.json({
                success: false,
                error: 'Evento no encontrado'
            }, { status: 404 })
        } else {
            // Database not configured
            return NextResponse.json({
                success: false,
                error: 'Base de datos no configurada'
            }, { status: 503 })
        }
    } catch (error) {
        console.error('Error getting event:', error)
        return NextResponse.json({
            success: false,
            error: 'Error al obtener evento'
        }, { status: 500 })
    }
}

/**
 * PUT /api/events/[slug]
 * Update an existing event (requires admin auth)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        // Check auth
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const currentUser = await validateSession(token)
        if (!currentUser) {
            return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
        }

        const { slug } = await params

        if (!isDatabaseConfigured()) {
            return NextResponse.json({
                success: false,
                error: 'Base de datos no configurada'
            }, { status: 503 })
        }

        const { getEventBySlug, updateEvent, updateEventSlug } = await import('@/lib/queries')
        const existingEvent = await getEventBySlug(slug)

        if (!existingEvent) {
            return NextResponse.json({
                success: false,
                error: 'Evento no encontrado'
            }, { status: 404 })
        }

        // Check permissions
        if (currentUser.role !== 'super_admin') {
            const { hasAccess } = await userHasEventAccess(currentUser.id, existingEvent.id, 'manager')
            if (!hasAccess) {
                return NextResponse.json({ success: false, error: 'No tienes permiso para modificar este evento' }, { status: 403 })
            }
        }

        const body = await request.json()

        // Handle slug change separately (requires updating RSVPs too)
        let updatedRsvpsCount = 0
        let finalEvent = existingEvent
        let ogImagesRenamed: string[] = []
        let ogImagesErrors: string[] = []
        
        if (body.newSlug !== undefined && body.newSlug !== slug) {
            // Only super_admin can change slugs (it's a more sensitive operation)
            if (currentUser.role !== 'super_admin') {
                return NextResponse.json({
                    success: false,
                    error: 'Solo un Super Admin puede cambiar el slug de un evento'
                }, { status: 403 })
            }

            try {
                const result = await updateEventSlug(existingEvent.id, body.newSlug)
                finalEvent = result.event
                updatedRsvpsCount = result.updatedRsvps

                // Rename OG images in /public if they exist
                const ogResult = renameOgImages(slug, body.newSlug)
                ogImagesRenamed = ogResult.renamed
                ogImagesErrors = ogResult.errors
            } catch (error: any) {
                return NextResponse.json({
                    success: false,
                    error: error.message || 'Error al cambiar el slug'
                }, { status: 400 })
            }
        }

        // Build update object (only include provided fields, excluding slug)
        const updates: any = {}

        if (body.title !== undefined) updates.title = body.title
        if (body.subtitle !== undefined) updates.subtitle = body.subtitle
        if (body.date !== undefined) updates.date = body.date
        if (body.time !== undefined) updates.time = body.time
        if (body.location !== undefined) updates.location = body.location
        if (body.details !== undefined) updates.details = body.details
        if (body.price?.enabled !== undefined) updates.priceEnabled = body.price.enabled
        if (body.price?.amount !== undefined) updates.priceAmount = body.price.amount
        if (body.capacity?.enabled !== undefined) updates.capacityEnabled = body.capacity.enabled
        if (body.capacity?.limit !== undefined) updates.capacityLimit = body.capacity.limit
        if (body.backgroundImage?.url !== undefined) updates.backgroundImageUrl = body.backgroundImage.url
        if (body.theme !== undefined) updates.theme = body.theme
        if (body.contact?.hostName !== undefined) updates.hostName = body.contact.hostName
        if (body.contact?.hostEmail !== undefined) updates.hostEmail = body.contact.hostEmail
        if (body.isActive !== undefined) updates.isActive = body.isActive

        // Only call updateEvent if there are updates beyond slug
        if (Object.keys(updates).length > 0) {
            finalEvent = await updateEvent(finalEvent.id, updates)
        }

        return NextResponse.json({
            success: true,
            event: finalEvent,
            ...(body.newSlug && body.newSlug !== slug && { 
                slugChanged: true,
                updatedRsvps: updatedRsvpsCount,
                newSlug: body.newSlug,
                ogImages: {
                    renamed: ogImagesRenamed,
                    errors: ogImagesErrors
                }
            })
        })
    } catch (error) {
        console.error('Error updating event:', error)
        return NextResponse.json({
            success: false,
            error: 'Error al actualizar evento'
        }, { status: 500 })
    }
}

/**
 * DELETE /api/events/[slug]
 * Delete an event (soft delete by default, requires admin auth)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        // Check auth
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
        }

        const currentUser = await validateSession(token)
        if (!currentUser) {
            return NextResponse.json({ success: false, error: 'Sesión inválida' }, { status: 401 })
        }

        // Only super_admin can delete events
        if (currentUser.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Acceso denegado. Se requiere ser Super Admin para eliminar eventos.' }, { status: 403 })
        }

        const { slug } = await params
        const { searchParams } = new URL(request.url)
        const hardDelete = searchParams.get('hard') === 'true'

        if (!isDatabaseConfigured()) {
            return NextResponse.json({
                success: false,
                error: 'Base de datos no configurada'
            }, { status: 503 })
        }

        const { getEventBySlug, deleteEvent } = await import('@/lib/queries')
        const existingEvent = await getEventBySlug(slug)

        if (!existingEvent) {
            return NextResponse.json({
                success: false,
                error: 'Evento no encontrado'
            }, { status: 404 })
        }

        await deleteEvent(existingEvent.id, hardDelete)

        return NextResponse.json({
            success: true,
            message: hardDelete ? 'Evento eliminado permanentemente' : 'Evento desactivado'
        })
    } catch (error) {
        console.error('Error deleting event:', error)
        return NextResponse.json({
            success: false,
            error: 'Error al eliminar evento'
        }, { status: 500 })
    }
}

