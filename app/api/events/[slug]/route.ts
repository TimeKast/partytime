import { NextRequest, NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/db'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { userHasEventAccess } from '@/lib/user-queries'
import { existsSync, renameSync } from 'fs'
import { join } from 'path'
import { validateAndApplyEventUpdate } from '@/lib/event-api-contract'
import { buildPublicEventDto } from '@/lib/public-event'

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
                return NextResponse.json({
                    success: true,
                    event: buildPublicEventDto(event)
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
        const result = await validateAndApplyEventUpdate(
            body,
            slug,
            existingEvent,
            currentUser.role === 'super_admin',
            { updateSlug: updateEventSlug, updateEvent },
        )
        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: result.status })
        }

        const ogResult = result.newSlug
            ? renameOgImages(slug, result.newSlug)
            : { renamed: [], errors: [] }

        return NextResponse.json({
            success: true,
            event: result.event,
            ...(result.newSlug && {
                slugChanged: true,
                updatedRsvps: result.updatedRsvps,
                newSlug: result.newSlug,
                ogImages: {
                    renamed: ogResult.renamed,
                    errors: ogResult.errors
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
