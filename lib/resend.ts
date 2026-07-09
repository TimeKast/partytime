import { Resend } from 'resend'

let client: Resend | null = null

function getResend(): Resend {
    if (!client) {
        const key = process.env.RESEND_API_KEY
        if (!key) {
            console.warn('⚠️  RESEND_API_KEY no configurado. Los emails no se enviarán.')
        }
        // Resend's constructor throws on a falsy key. Use a placeholder when the
        // key is absent so importing this module during `next build` / CI (which
        // has no secret) never crashes at module load. A send with the
        // placeholder key simply fails at request time, mirroring lib/db.ts,
        // which degrades to a null client instead of throwing.
        client = new Resend(key || 're_placeholder_no_key')
    }
    return client
}

// Lazy proxy: the Resend client is not constructed until the first property
// access (i.e. the first real email send), so merely importing this module is
// side-effect free.
export const resend = new Proxy({} as Resend, {
    get(_target, prop) {
        const instance = getResend()
        const value = instance[prop as keyof Resend]
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value
    },
})

export const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'
