import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth-utils'
import { getUserById, updateUser, deactivateUser } from '@/lib/user-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users/[id]
 * Get a specific user's details (super_admin only)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
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

        const user = await getUserById(id)
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Usuario no encontrado' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            },
        })

    } catch (error) {
        console.error('Error fetching user:', error)
        return NextResponse.json(
            { success: false, error: 'Error al obtener usuario' },
            { status: 500 }
        )
    }
}

/**
 * PUT /api/admin/users/[id]
 * Update a user (super_admin only)
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
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
        const { name, role, isActive } = body

        // Build updates object
        const updates: { name?: string; role?: string; isActive?: boolean } = {}
        if (name !== undefined) updates.name = name
        if (role !== undefined) {
            if (!['super_admin', 'manager', 'viewer'].includes(role)) {
                return NextResponse.json(
                    { success: false, error: 'Rol inválido' },
                    { status: 400 }
                )
            }
            updates.role = role
        }
        if (isActive !== undefined) updates.isActive = isActive

        const updatedUser = await updateUser(id, updates)

        return NextResponse.json({
            success: true,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                isActive: updatedUser.isActive,
            },
        })

    } catch (error: any) {
        console.error('Error updating user:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Error al actualizar usuario' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/admin/users/[id]
 * Deactivate a user (soft delete, super_admin only)
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
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

        // Can't deactivate yourself
        if (currentUser.id === id) {
            return NextResponse.json(
                { success: false, error: 'No puedes desactivar tu propia cuenta' },
                { status: 400 }
            )
        }

        await deactivateUser(id)

        return NextResponse.json({
            success: true,
            message: 'Usuario desactivado',
        })

    } catch (error) {
        console.error('Error deactivating user:', error)
        return NextResponse.json(
            { success: false, error: 'Error al desactivar usuario' },
            { status: 500 }
        )
    }
}
