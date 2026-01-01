import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/auth-utils'
import { getUserEventAssignments } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/me
 * Returns the current authenticated user's information
 */
export async function GET() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

        if (!token) {
            return NextResponse.json(
                { success: false, authenticated: false },
                { status: 401 }
            )
        }

        // Validate session and get user
        const user = await validateSession(token)

        if (!user) {
            // Special case: super admin via env vars
            // Check if it's the special super_admin_env session
            // (In a real implementation, we'd store this differently)
            return NextResponse.json(
                { success: false, authenticated: false },
                { status: 401 }
            )
        }

        // Get user's event assignments
        const eventAssignments = await getUserEventAssignments(user.id)

        return NextResponse.json({
            success: true,
            authenticated: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            },
            eventAssignments: eventAssignments.map(ea => ({
                eventId: ea.event.id,
                eventSlug: ea.event.slug,
                eventTitle: ea.event.title,
                role: ea.assignment.role,
            })),
        })

    } catch (error) {
        console.error('Auth check error:', error)
        return NextResponse.json(
            { success: false, error: 'Error al verificar sesión' },
            { status: 500 }
        )
    }
}
