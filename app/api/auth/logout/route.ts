import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { destroySession, SESSION_COOKIE_NAME, getLogoutCookieOptions } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/logout
 * Destroys the current session and clears the cookie
 */
export async function POST() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

        if (token) {
            // Destroy session in database
            await destroySession(token)
        }

        // Clear cookie
        cookieStore.set(SESSION_COOKIE_NAME, '', getLogoutCookieOptions())

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Logout error:', error)
        // Even if there's an error, clear the cookie
        const cookieStore = await cookies()
        cookieStore.set(SESSION_COOKIE_NAME, '', getLogoutCookieOptions())

        return NextResponse.json({ success: true })
    }
}
