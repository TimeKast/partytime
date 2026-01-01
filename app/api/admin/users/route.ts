import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { getAllUsers, createUser } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users
 * Returns list of all users (super_admin only)
 */
export async function GET() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('rp_session')?.value

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'No autorizado' },
                { status: 401 }
            )
        }

        const user = await validateSession(token)
        if (!user || user.role !== 'super_admin') {
            return NextResponse.json(
                { success: false, error: 'Acceso denegado' },
                { status: 403 }
            )
        }

        const users = await getAllUsers()

        // Remove password hashes from response
        const safeUsers = users.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            isActive: u.isActive,
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
        }))

        return NextResponse.json({
            success: true,
            users: safeUsers,
        })

    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json(
            { success: false, error: 'Error al obtener usuarios' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/users
 * Create a new user (super_admin only)
 */
export async function POST(request: NextRequest) {
    try {
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
        const { email, password, name, role } = body

        // Validate input
        if (!email || !password || !name) {
            return NextResponse.json(
                { success: false, error: 'Email, contraseña y nombre son requeridos' },
                { status: 400 }
            )
        }

        // Validate role
        if (role && !['manager', 'viewer'].includes(role)) {
            return NextResponse.json(
                { success: false, error: 'Rol inválido. Usa "manager" o "viewer"' },
                { status: 400 }
            )
        }

        // Create user
        const newUser = await createUser({
            email,
            password,
            name,
            role: role || 'viewer',
            invitedBy: currentUser.id,
        })

        return NextResponse.json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
            },
        })

    } catch (error: any) {
        console.error('Error creating user:', error)

        if (error.message?.includes('Ya existe')) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 409 }
            )
        }

        return NextResponse.json(
            { success: false, error: 'Error al crear usuario' },
            { status: 500 }
        )
    }
}
