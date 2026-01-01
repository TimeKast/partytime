import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { getUserEventAssignments, assignEventToUser, removeEventAssignment } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users/[id]/events
 * Get events assigned to a user (super_admin only)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'No autorizado' },
                { status: 401 }
            )
        }

        const currentUser = await validateSession(token)
        if (!currentUser || currentUser.role !== 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Acceso denegado' },
                { status: 403 }
            )
        }

        const assignments = await getUserEventAssignments(userId)

        return NextResponse.json({
            success: true,
            assignments: assignments.map(a => ({
                eventId: a.event.id,
                eventSlug: a.event.slug,
                eventTitle: a.event.title,
                role: a.assignment.role,
                assignedAt: a.assignment.assignedAt,
            })),
        })

    } catch (error) {
        console.error('Error fetching user events:', error)
        return NextResponse.json(
            { success: false, error: 'Error al obtener eventos del usuario' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/users/[id]/events
 * Assign an event to a user (super_admin only)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'No autorizado' },
                { status: 401 }
            )
        }

        const currentUser = await validateSession(token)
        if (!currentUser || currentUser.role !== 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Acceso denegado' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const { eventId, role } = body

        if (!eventId || !role) {
            return NextResponse.json(
                { success: false, error: 'eventId y role son requeridos' },
                { status: 400 }
            )
        }

        if (!['manager', 'viewer'].includes(role)) {
            return NextResponse.json(
                { success: false, error: 'Rol inválido. Usa "manager" o "viewer"' },
                { status: 400 }
            )
        }

        const assignment = await assignEventToUser(userId, eventId, role, currentUser.id)

        return NextResponse.json({
            success: true,
            assignment: {
                id: assignment.id,
                eventId: assignment.eventId,
                role: assignment.role,
            },
        })

    } catch (error) {
        console.error('Error assigning event:', error)
        return NextResponse.json(
            { success: false, error: 'Error al asignar evento' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/admin/users/[id]/events
 * Remove event assignment from user (super_admin only)
 * Requires eventId in query string: ?eventId=xxx
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'No autorizado' },
                { status: 401 }
            )
        }

        const currentUser = await validateSession(token)
        if (!currentUser || currentUser.role !== 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Acceso denegado' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const eventId = searchParams.get('eventId')

        if (!eventId) {
            return NextResponse.json(
                { success: false, error: 'eventId es requerido' },
                { status: 400 }
            )
        }

        await removeEventAssignment(userId, eventId)

        return NextResponse.json({
            success: true,
            message: 'Asignación eliminada',
        })

    } catch (error) {
        console.error('Error removing assignment:', error)
        return NextResponse.json(
            { success: false, error: 'Error al eliminar asignación' },
            { status: 500 }
        )
    }
}
