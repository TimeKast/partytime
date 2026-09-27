/**
 * Migration 0013 — per-event Stripe mode, UI half: the admin selector
 * (app/admin/components/StripeModeSettings.tsx), the "(prueba)" payment
 * badge + totals exclusion (lib/rsvp-list.ts, RsvpTable), the export
 * helpers (lib/event-export.ts), the dashboard MODO PRUEBA indicator and the
 * public RSVP modal notice.
 *
 * Same constraint as tests/ledger-stripe-mode-ui.test.ts: vitest runs
 * `environment: 'node'` (no jsdom), so components are exercised with
 * `renderToStaticMarkup` (initial markup only) and interaction wiring is
 * verified via source-string assertions.
 */
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  StripeModeSelector,
  StripeTestModeBanner,
  describeMissingStripeKey,
  describeStripeModeTransition,
} from '@/app/admin/components/StripeModeSettings'
import { RsvpTable } from '@/app/admin/components/table/RsvpTable'
import { BackstageStatusStrip } from '@/app/admin/components/config/BackstageStatusStrip'
import type { RSVP } from '@/app/admin/components'
import RSVPModal from '@/app/components/RSVPModal'
import {
  buildRsvpListView,
  describePaymentsCollected,
  isTestPayment,
  rsvpPaymentLabel,
  type RsvpListOptions,
} from '@/lib/rsvp-list'
import { describeExportPaymentsFragment, exportPaymentModeSuffix } from '@/lib/event-export'

// Same shim as tests/admin-contain-background-ui.test.ts: the tsconfig's
// `jsx: preserve` leaves classic-runtime JSX that expects a global React.
vi.stubGlobal('React', React)

const read = (path: string) => readFileSync(path, 'utf8')
const render = (element: React.ReactElement) => renderToStaticMarkup(element)
const noop = () => {}

const selectorProps = {
  value: 'live' as const,
  savedValue: 'live' as const,
  canEdit: true,
  liveConfigured: true,
  testConfigured: true,
  onChange: noop,
}

function rsvp(overrides: Partial<RSVP>): RSVP {
  return {
    id: 'r1',
    name: 'Ana',
    email: 'ana@example.com',
    phone: '5550000000',
    plusOne: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    status: 'confirmed',
    ...overrides,
  }
}

const listOptions: RsvpListOptions = {
  searchTerm: '',
  status: 'all',
  plusOne: 'all',
  email: 'all',
  sort: 'name-asc',
  page: 1,
  pageSize: 25,
}

describe('StripeModeSelector', () => {
  it('shows both options to everyone, editable for a super_admin', () => {
    const html = render(React.createElement(StripeModeSelector, selectorProps))

    expect(html).toContain('Modo de cobro')
    expect(html).toContain('Cobro real')
    expect(html).toContain('Modo prueba')
    expect(html).not.toMatch(/<fieldset[^>]*disabled/)
    expect(html).toContain('El cambio se aplica al guardar')
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*checked=""[^>]*value="live"/)
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="test"/)
  })

  it('is visible but disabled for a manager, with the reason spelled out', () => {
    const html = render(React.createElement(StripeModeSelector, { ...selectorProps, value: 'test', savedValue: 'test', canEdit: false }))

    expect(html).toMatch(/<fieldset[^>]*disabled/)
    expect(html).toContain('Solo un Super Admin puede cambiar el modo de cobro.')
    expect(html).toContain('Cobro real')
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="test"/)
  })

  it('warns clearly when switching test -> live (real money; open test payments stop confirming)', () => {
    const html = render(React.createElement(StripeModeSelector, { ...selectorProps, value: 'live', savedValue: 'test' }))

    expect(html).toContain('Pasarás a cobro real.')
    expect(html).toContain('A partir de ahora se cobra dinero real. Los pagos de prueba abiertos ya no confirmarán lugares.')
  })

  it('warns when switching live -> test, and says nothing when the mode is unchanged', () => {
    const toTest = render(React.createElement(StripeModeSelector, { ...selectorProps, value: 'test', savedValue: 'live' }))
    const unchanged = render(React.createElement(StripeModeSelector, selectorProps))

    expect(toTest).toContain('Pasarás a modo prueba.')
    expect(toTest).toContain('no se cobra dinero real')
    expect(unchanged).not.toContain('Pasarás a')
    expect(describeStripeModeTransition('live', 'live')).toBeNull()
    expect(describeStripeModeTransition('test', 'test')).toBeNull()
  })

  it('flags a missing key for the CHOSEN mode only', () => {
    const testMissing = render(React.createElement(StripeModeSelector, { ...selectorProps, value: 'test', savedValue: 'test', testConfigured: false }))
    const liveChosenTestMissing = render(React.createElement(StripeModeSelector, { ...selectorProps, testConfigured: false }))
    const liveMissing = render(React.createElement(StripeModeSelector, { ...selectorProps, liveConfigured: false }))

    expect(testMissing).toContain('STRIPE_TEST_SECRET_KEY')
    expect(testMissing).toContain('role="alert"')
    expect(liveChosenTestMissing).not.toContain('STRIPE_TEST_SECRET_KEY')
    expect(liveMissing).toContain('STRIPE_SECRET_KEY')
    expect(describeMissingStripeKey('live', true)).toBeNull()
  })
})

describe('admin page wiring (source contracts)', () => {
  const page = read('app/admin/page.tsx')

  it('renders the selector next to "Requerir pago", editable only by super_admin', () => {
    const paymentStart = page.indexOf('title="Cuota y cobro"')
    const capacityStart = page.indexOf('title="Capacidad"', paymentStart)
    const paymentSection = page.slice(paymentStart, capacityStart)

    expect(paymentSection).toContain('<StripeModeSelector')
    expect(paymentSection).toContain('canEdit={isSuperAdmin}')
    expect(paymentSection).toContain('savedValue={savedStripeMode}')
    expect(paymentSection).toContain('testConfigured={stripeTestConfigured}')
    expect(page).toContain("const isSuperAdmin = currentUser?.role === 'super_admin'")
  })

  it('only a super_admin save carries stripeMode, and a mode change asks for confirmation', () => {
    expect(page).toContain('...(isSuperAdmin && { stripeMode: configForm.stripeMode })')
    expect(page).toContain('describeStripeModeTransition(savedStripeMode, configForm.stripeMode)')
    expect(page).toContain('window.confirm(`¿Cambiar el cobro de este evento a ${target}?')
  })

  it('reads mode + both key flags from GET /api/event-settings', () => {
    expect(page).toContain("data.settings.stripeMode === 'test' ? 'test' : 'live'")
    expect(page).toContain('setStripeTestConfigured(data.settings.stripeTestConfigured !== false)')
    expect(page).toContain('setSavedStripeMode(loadedStripeMode)')
  })

  it('shows the MODO PRUEBA indicator on the dashboard for a paid event in test mode', () => {
    const dashboardStart = page.indexOf("{activeTab === 'dashboard' && (")
    const configStart = page.indexOf('{/* Contenido de Configuración */}', dashboardStart)
    const dashboard = page.slice(dashboardStart, configStart)

    expect(dashboard).toContain("{savedStripeMode === 'test' && configForm.paymentRequired && (")
    expect(dashboard).toContain('<StripeTestModeBanner')
    expect(dashboard).toContain('rsvpListView.testPaidPaymentsCount')
  })

  it('exports mark test payments and exclude them from "Pagados"', () => {
    expect((page.match(/exportPaymentModeSuffix\(rsvp\)/g) ?? []).length).toBe(4)
    expect((page.match(/describeExportPaymentsFragment\(rsvpListView\)/g) ?? []).length).toBe(2)
  })
})

describe('StripeTestModeBanner + BackstageStatusStrip', () => {
  it('renders a MODO PRUEBA status, with the shortcut only for managers', () => {
    const withAction = render(React.createElement(StripeTestModeBanner, { onConfigure: noop }))
    const readOnly = render(React.createElement(StripeTestModeBanner, {}))

    expect(withAction).toContain('Modo prueba')
    expect(withAction).toContain('role="status"')
    expect(withAction).toContain('no entra dinero real')
    expect(withAction).toContain('Revisar cobro')
    expect(readOnly).not.toContain('Revisar cobro')
  })

  it('tags the Cobro chip with "prueba" only in test mode', () => {
    const base = { rsvpClosed: false, paymentRequired: true, priceAmount: 250, checkinStatus: null }
    expect(render(React.createElement(BackstageStatusStrip, { ...base, paymentTestMode: true }))).toContain('$250 por persona · prueba')
    expect(render(React.createElement(BackstageStatusStrip, base))).not.toContain('prueba')
  })
})

describe('test payments in the guest list', () => {
  const livePaid = rsvp({ id: 'live', name: 'Ana', paymentStatus: 'paid', amountCents: 25000, currency: 'MXN', paymentLivemode: true })
  const testPaid = rsvp({ id: 'test', name: 'Beto', paymentStatus: 'paid', amountCents: 25000, currency: 'MXN', paymentLivemode: false })
  const legacyPaid = rsvp({ id: 'legacy', name: 'Caro', paymentStatus: 'paid', amountCents: 10000, currency: 'MXN' })
  const testPending = rsvp({ id: 'pend', name: 'Dani', status: 'pending_payment', paymentStatus: 'created', amountCents: 25000, currency: 'MXN', paymentLivemode: false })

  it('labels a test payment "(prueba)"; null/absent livemode counts as live', () => {
    expect(rsvpPaymentLabel(testPaid)).toBe('Pagado (prueba)')
    expect(rsvpPaymentLabel(testPending)).toBe('Pendiente de pago (prueba)')
    expect(rsvpPaymentLabel(livePaid)).toBe('Pagado')
    expect(rsvpPaymentLabel(legacyPaid)).toBe('Pagado')
    expect(isTestPayment({ paymentStatus: 'paid', paymentLivemode: null })).toBe(false)
    expect(isTestPayment({ paymentStatus: null, paymentLivemode: false })).toBe(false)
  })

  it('buildRsvpListView excludes test payments from paidPaymentsCount / amountCollectedByCurrency', () => {
    const view = buildRsvpListView([livePaid, testPaid, legacyPaid, testPending], listOptions)

    expect(view.paidPaymentsCount).toBe(2)
    expect(view.amountCollectedByCurrency).toEqual({ MXN: 35000 })
    expect(view.testPaidPaymentsCount).toBe(1)
  })

  it('an event with only test payments reports $0 collected', () => {
    const view = buildRsvpListView([testPaid], listOptions)
    expect(view.paidPaymentsCount).toBe(0)
    expect(view.amountCollectedByCurrency).toEqual({})
    expect(describePaymentsCollected(view.paidPaymentsCount, view.amountCollectedByCurrency, view.testPaidPaymentsCount))
      .toBe('0 pagados · $0.00 MXN recaudados · 1 pago de prueba (no suman)')
  })

  it('describePaymentsCollected is byte-for-byte unchanged without test payments', () => {
    expect(describePaymentsCollected(3, { MXN: 40000 })).toBe('3 pagados · $400.00 MXN recaudados')
    expect(describePaymentsCollected(3, { MXN: 40000 }, 0)).toBe('3 pagados · $400.00 MXN recaudados')
    expect(describePaymentsCollected(3, { MXN: 40000 }, 2)).toBe('3 pagados · $400.00 MXN recaudados · 2 pagos de prueba (no suman)')
  })

  it('RsvpTable renders "Pagado (prueba)" with the test marker, and never the refund warning for a test payment', () => {
    const cancelledTestPaid = rsvp({ ...testPaid, id: 'ct', status: 'cancelled' })
    const html = render(React.createElement(RsvpTable, {
      variant: 'confirmed',
      rsvps: [livePaid, testPaid],
      totalCount: 2,
      isReadOnly: true,
      loading: false,
      isEventPast: false,
      highlightedRsvpId: null,
      onSendEmail: noop,
      onEdit: noop,
      onToggleStatus: noop,
      showPayment: true,
      showCheckin: false,
    }))
    const cancelledHtml = render(React.createElement(RsvpTable, {
      variant: 'cancelled',
      rsvps: [cancelledTestPaid],
      totalCount: 1,
      isReadOnly: true,
      loading: false,
      isEventPast: false,
      highlightedRsvpId: null,
      onSendEmail: noop,
      onEdit: noop,
      onToggleStatus: noop,
      showPayment: true,
      showCheckin: false,
    }))

    expect(html).toContain('Pagado (prueba)')
    expect(html).toContain('data-payment-mode="test"')
    expect(html).toContain('sin cobro real')
    expect((html.match(/data-payment-mode="test"/g) ?? []).length).toBe(2)
    expect(cancelledHtml).toContain('Pagado (prueba)')
    expect(cancelledHtml).not.toContain('requiere reembolso manual')
    expect(cancelledHtml).not.toContain('data-payment-without-seat')
  })

  it('export helpers mark test payments and keep the live-only sentence otherwise', () => {
    expect(exportPaymentModeSuffix(testPaid)).toBe(' (prueba)')
    expect(exportPaymentModeSuffix(livePaid)).toBe('')
    expect(exportPaymentModeSuffix(legacyPaid)).toBe('')

    const mixed = buildRsvpListView([livePaid, testPaid], listOptions)
    const liveOnly = buildRsvpListView([livePaid], listOptions)
    expect(describeExportPaymentsFragment(mixed)).toBe(' - Pagados: 1 ($250.00 MXN) - Pagos de prueba: 1 (no suman)')
    expect(describeExportPaymentsFragment(liveOnly)).toBe(' - Pagados: 1 ($250.00 MXN)')
  })
})

describe('public RSVP modal — test-mode notice', () => {
  const modalProps = {
    isOpen: true,
    onClose: noop,
    variant: 'modern' as const,
    eventSlug: 'fiesta',
    paymentPricing: { unitAmount: 250, currency: 'MXN' },
  }

  it('shows the 4242 notice only when the event charges in test mode', () => {
    const testHtml = render(React.createElement(RSVPModal, { ...modalProps, paymentTestMode: true }))
    const liveHtml = render(React.createElement(RSVPModal, modalProps))

    expect(testHtml).toContain('Modo prueba:')
    expect(testHtml).toContain('no se cobra dinero real. Usa la tarjeta')
    expect(testHtml).toContain('4242 4242 4242 4242')
    expect(testHtml).toContain('cualquier fecha futura y cualquier CVC.')
    expect(liveHtml).not.toContain('4242')
  })

  it('never shows it without a payment summary (free event or courtesy link)', () => {
    const html = render(React.createElement(RSVPModal, { ...modalProps, paymentPricing: undefined, paymentTestMode: true }))
    expect(html).not.toContain('4242')
  })

  it('both public entry points pass the DTO boolean through', () => {
    expect(read('app/[slug]/components/EventPageClient.tsx')).toContain('paymentTestMode={event.paymentTestMode === true}')
    expect(read('app/invite/InvitationRegistrationClient.tsx')).toContain('paymentTestMode={state.event.paymentTestMode === true}')
  })
})
