import crypto from 'crypto'

/**
 * Constant-time string comparison. Both inputs are hashed to a fixed-length
 * digest first, so unequal lengths do not leak via early exit and
 * `crypto.timingSafeEqual`'s equal-length requirement is always satisfied.
 */
export function timingSafeEqualStr(a: string | null | undefined, b: string | null | undefined): boolean {
    const ha = crypto.createHash('sha256').update(a ?? '').digest()
    const hb = crypto.createHash('sha256').update(b ?? '').digest()
    return crypto.timingSafeEqual(ha, hb)
}
