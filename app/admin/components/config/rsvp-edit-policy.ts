import type { RsvpPaymentStatus } from '@/lib/rsvp-list'

/**
 * An open Checkout or completed charge fixes the number of paid seats.
 * Expired/refunded attempts may be repriced by a later Checkout.
 */
export function isPlusOneLockedForPayment(
  paymentStatus: RsvpPaymentStatus | null | undefined,
): boolean {
  return paymentStatus === 'created' || paymentStatus === 'paid'
}

export function plusOnePaymentLockMessage(
  paymentStatus: RsvpPaymentStatus | null | undefined,
): string | null {
  if (paymentStatus === 'created') {
    return 'No puedes cambiar el +1 mientras haya un Checkout abierto. Espera a que expire o cancela el intento de pago antes de cambiar el número de personas.'
  }

  if (paymentStatus === 'paid') {
    return 'No puedes cambiar el +1 porque el pago ya fijó el número de cuotas. Aún puedes corregir el nombre del acompañante.'
  }

  return null
}
