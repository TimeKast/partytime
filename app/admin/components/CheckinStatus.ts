export interface CheckinStatus {
  readonly enabled: boolean
  readonly hasPassword: boolean
  readonly updatedAt: string | null
}

export type CheckinReadinessTone = 'success' | 'warning' | 'danger' | 'neutral'

export interface CheckinReadiness {
  label: string
  detail: string
  tone: CheckinReadinessTone
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Freezes the only check-in fields the admin client may consume. Password
 * material is intentionally not part of this DTO or parser.
 */
export function parseCheckinStatusPayload(payload: unknown): CheckinStatus | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.checkin)) return null
  const { enabled, hasPassword, updatedAt } = payload.checkin
  if (typeof enabled !== 'boolean' || typeof hasPassword !== 'boolean') return null
  if (updatedAt !== null && typeof updatedAt !== 'string') return null
  if (typeof updatedAt === 'string' && Number.isNaN(Date.parse(updatedAt))) return null

  return Object.freeze({ enabled, hasPassword, updatedAt })
}

export function checkinReadiness(status: CheckinStatus | null, loading = false): CheckinReadiness {
  if (loading) return { label: 'Consultando', detail: 'Cargando estado del portal…', tone: 'neutral' }
  if (!status) return { label: 'Sin estado', detail: 'No pudimos confirmar el estado del portal.', tone: 'danger' }
  if (!status.enabled) return { label: 'Desactivado', detail: 'El staff no puede iniciar sesión.', tone: 'neutral' }
  if (!status.hasPassword) return { label: 'Falta contraseña', detail: 'Activa una contraseña antes de entregar el portal al staff.', tone: 'warning' }
  return { label: 'Listo', detail: 'El portal está habilitado y protegido.', tone: 'success' }
}

export function checkinPortalUrl(eventSlug: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const runtimeBase = typeof window === 'undefined' ? '' : window.location.origin
  return `${configuredBase || runtimeBase}/checkin/${eventSlug}`
}
