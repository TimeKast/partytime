import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    validateSession: vi.fn(),
    createUser: vi.fn(),
}))

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: () => ({ value: 'admin-session' }),
    })),
}))

vi.mock('@/lib/auth-utils', () => ({ validateSession: mocks.validateSession }))
vi.mock('@/lib/user-queries', () => ({
    getAllUsers: vi.fn(),
    createUser: mocks.createUser,
}))

function request(password: string) {
    return new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            email: 'new.user@example.com',
            name: 'New User',
            password,
        }),
    })
}

describe('POST /api/admin/users password policy', () => {
    beforeEach(() => {
        mocks.validateSession.mockReset().mockResolvedValue({ id: 'admin-1', role: 'super_admin' })
        mocks.createUser.mockReset().mockResolvedValue({
            id: 'user-1',
            email: 'new.user@example.com',
            name: 'New User',
            role: 'viewer',
        })
    })

    it('accepts an 8-character uppercase/lowercase/number password without a symbol', async () => {
        const { POST } = await import('@/app/api/admin/users/route')
        const response = await POST(request('Valid123'))

        expect(response.status).toBe(200)
        expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ password: 'Valid123' }))
    })

    it('rejects a password missing a required class before creating the user', async () => {
        const { POST } = await import('@/app/api/admin/users/route')
        const response = await POST(request('valid123'))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.policyErrors).toContain('missing_uppercase')
        expect(mocks.createUser).not.toHaveBeenCalled()
    })
})
