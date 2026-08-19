/**
 * ISSUE-026 (EPIC-006) — app/admin/components/finance/LedgerSummary.tsx +
 * SettlementsPanel.tsx.
 *
 * Same constraints as tests/ledger-admin-registro-ui.test.ts and
 * tests/checkin-portal-ui.test.ts: this project's vitest config runs
 * `environment: 'node'` (no jsdom — vitest.config.ts), so components are
 * exercised with `renderToStaticMarkup` (no event simulation) and
 * fetch/refresh WIRING (as opposed to markup) is verified via source-string
 * assertions — the established pattern for client components in this repo
 * when there's no DOM to dispatch real events against.
 */
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LedgerSummary from '@/app/admin/components/finance/LedgerSummary'
import SettlementsPanel, { SettlementForm } from '@/app/admin/components/finance/SettlementsPanel'
import type {
  LedgerParticipant,
  LedgerSettlement,
  LedgerSummaryData,
} from '@/app/admin/components/finance/LedgerTab'

const read = (path: string) => readFileSync(path, 'utf8')

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

// ---------------------------------------------------------------------------
// Fixtures — mirror the ISSUE-024.md / gherkin scenario verbatim: B=-500,
// C=-200, A=+700 (in pesos) -> -50000/-20000/+70000 cents.
// ---------------------------------------------------------------------------

const A: LedgerParticipant = { id: 'a', kind: 'person', name: 'Ana', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }
const B: LedgerParticipant = { id: 'b', kind: 'person', name: 'Beto', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }
const C: LedgerParticipant = { id: 'c', kind: 'person', name: 'Caro', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }
const inactiveWithDebt: LedgerParticipant = { id: 'd', kind: 'person', name: 'Dario', email: null, userId: null, isActive: false, createdAt: '2026-08-01T00:00:00.000Z' }
const stripeNode: LedgerParticipant = { id: 'stripe1', kind: 'stripe', name: 'Stripe', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }

const participants: LedgerParticipant[] = [A, B, C, inactiveWithDebt, stripeNode]
const activeParticipants: LedgerParticipant[] = [A, B, C, stripeNode]

const summaryOpen: LedgerSummaryData = {
  currency: 'MXN',
  stripeMode: 'fund',
  totals: { expensesCents: 90000, manualIncomeCents: 30000, stripePaidCents: 0, netCents: -60000 },
  stripe: {},
  balances: [
    { participantId: 'a', name: 'Ana', kind: 'person', balanceCents: 70000, isActive: true },
    { participantId: 'c', name: 'Caro', kind: 'person', balanceCents: -20000, isActive: true },
    { participantId: 'b', name: 'Beto', kind: 'person', balanceCents: -50000, isActive: true },
    { participantId: 'e', name: 'Eva', kind: 'person', balanceCents: 0, isActive: true },
    { participantId: 'd', name: 'Dario', kind: 'person', balanceCents: -1000, isActive: false },
  ],
  suggestedTransfers: [
    { fromParticipantId: 'b', toParticipantId: 'a', amountCents: 50000, involvesStripe: null },
    { fromParticipantId: 'c', toParticipantId: 'a', amountCents: 20000, involvesStripe: null },
  ],
  settled: false,
}

const summarySettled: LedgerSummaryData = {
  ...summaryOpen,
  balances: [
    { participantId: 'a', name: 'Ana', kind: 'person', balanceCents: 0, isActive: true },
    { participantId: 'b', name: 'Beto', kind: 'person', balanceCents: 0, isActive: true },
    { participantId: 'c', name: 'Caro', kind: 'person', balanceCents: 0, isActive: true },
  ],
  suggestedTransfers: [],
  settled: true,
}

const settlementFixture: LedgerSettlement = {
  id: 'settle-1',
  fromParticipantId: 'b',
  toParticipantId: 'a',
  amountCents: 50000,
  currency: 'MXN',
  settledOn: '2026-08-10',
  note: 'Pago parcial',
  createdBy: 'user-1',
  createdAt: '2026-08-10T00:00:00.000Z',
}

// ============================================================
// LedgerSummary
// ============================================================

describe('LedgerSummary', () => {
  it('muestra "Cargando saldos…" mientras loading=true', () => {
    const html = render(React.createElement(LedgerSummary, { summary: null, loading: true, error: '', errorCode: null }))
    expect(html).toContain('Cargando saldos')
  })

  it('renderiza los saldos con dirección clara por signo: positivo "le deben" (verde), negativo "debe" (rojo), cero "saldado"', () => {
    const html = render(React.createElement(LedgerSummary, { summary: summaryOpen, loading: false, error: '', errorCode: null }))

    // A = +700 -> "le deben"
    expect(html).toMatch(/Ana[\s\S]*?Le deben[\s\S]*?700\.00/)
    expect(html).toContain('data-tone="positive"')
    // B = -500, C = -200 -> "debe"
    expect(html).toMatch(/Beto[\s\S]*?Debe[\s\S]*?500\.00/)
    expect(html).toMatch(/Caro[\s\S]*?Debe[\s\S]*?200\.00/)
    expect(html).toContain('data-tone="negative"')
    // Eva = 0 -> "saldado"
    expect(html).toMatch(/Eva[\s\S]*?Saldado/)
    expect(html).toContain('data-tone="zero"')
  })

  it('marca participantes desactivados con saldo≠0 como inactivos', () => {
    const html = render(React.createElement(LedgerSummary, { summary: summaryOpen, loading: false, error: '', errorCode: null }))
    expect(html).toMatch(/Dario[\s\S]*?Inactivo/)
    expect(html).toContain('data-inactive="true"')
  })

  it('cards de totales se leen tal cual de `totals` (Gastos, Ingresos manuales, Ingresos Stripe, Neto) — nunca recalculadas', () => {
    const html = render(React.createElement(LedgerSummary, { summary: summaryOpen, loading: false, error: '', errorCode: null }))
    expect(html).toContain('Gastos')
    expect(html).toContain('900.00') // expensesCents 90000
    expect(html).toContain('Ingresos manuales')
    expect(html).toContain('300.00') // manualIncomeCents 30000
    expect(html).toContain('Ingresos Stripe')
    expect(html).toContain('Neto')
    expect(html).toContain('600.00') // netCents -60000
    expect(html).toMatch(/-\$?600\.00/) // negativo: signo antes del monto
  })

  it('muestra el banner "Todo saldado ✓" cuando settled=true, y lo omite cuando settled=false', () => {
    const settled = render(React.createElement(LedgerSummary, { summary: summarySettled, loading: false, error: '', errorCode: null }))
    expect(settled).toContain('Todo saldado')

    const open = render(React.createElement(LedgerSummary, { summary: summaryOpen, loading: false, error: '', errorCode: null }))
    expect(open).not.toContain('Todo saldado')
  })

  it('estado dedicado LEDGER_INVARIANT: mensaje "los datos no cuadran…" y NUNCA pinta saldos parciales', () => {
    const html = render(React.createElement(LedgerSummary, {
      summary: null,
      loading: false,
      error: 'Los saldos del ledger no cuadran — contacta soporte',
      errorCode: 'LEDGER_INVARIANT',
    }))
    expect(html).toMatch(/no cuadran/i)
    expect(html).not.toContain('Le deben')
    expect(html).not.toContain('>Debe<')
    expect(html).not.toContain('Saldado')
    expect(html).not.toContain('data-tone="positive"')
    expect(html).not.toContain('data-tone="negative"')
  })

  it('estado de error genérico (no LEDGER_INVARIANT) también evita pintar saldos', () => {
    const html = render(React.createElement(LedgerSummary, {
      summary: null,
      loading: false,
      error: 'Error de red',
      errorCode: null,
    }))
    expect(html).toContain('Error de red')
    expect(html).not.toContain('Le deben')
    expect(html).not.toContain('data-tone="positive"')
  })
})

// ============================================================
// SettlementsPanel — "Para saldar" + historial
// ============================================================

describe('SettlementsPanel — sugerencias y gating por rol', () => {
  it('manager ve las transferencias sugeridas con dirección clara y el botón "Registrar pago"', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary: summaryOpen,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toMatch(/Beto le paga[\s\S]*?500\.00[\s\S]*?a Ana/)
    expect(html).toMatch(/Caro le paga[\s\S]*?200\.00[\s\S]*?a Ana/)
    expect(html.match(/>Registrar pago</g)?.length).toBe(2)
  })

  it('involvesStripe="from" se etiqueta "Retiro de Stripe sugerido" con CTA "Registrar retiro" (ISSUE-027, PLAN §2.6b)', () => {
    const withStripe: LedgerSummaryData = {
      ...summaryOpen,
      suggestedTransfers: [
        { fromParticipantId: 'stripe1', toParticipantId: 'a', amountCents: 10000, involvesStripe: 'from' },
      ],
    }
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary: withStripe,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toContain('Retiro de Stripe sugerido')
    expect(html).toContain('>Registrar retiro<')
    expect(html).not.toMatch(/aporte al fondo/i)
  })

  it('involvesStripe="to" se etiqueta "Aporte al fondo" (ISSUE-027, PLAN §2.6b resolución 2026-08-19) — NUNCA "retiro sugerido"', () => {
    const withStripe: LedgerSummaryData = {
      ...summaryOpen,
      suggestedTransfers: [
        { fromParticipantId: 'a', toParticipantId: 'stripe1', amountCents: 10000, involvesStripe: 'to' },
      ],
    }
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary: withStripe,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toContain('Aporte al fondo')
    expect(html).not.toMatch(/retiro de stripe sugerido/i)
  })

  it('viewer (readOnly) ve saldos/sugerencias/historial sin ningún botón de registro/edición', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [settlementFixture],
      settlementsLoading: false,
      settlementsError: '',
      summary: summaryOpen,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: true,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toMatch(/Beto le paga/)
    expect(html).not.toContain('Registrar pago')
    expect(html).not.toContain('Registrar settlement')
    expect(html).not.toContain('>Editar<')
    expect(html).not.toContain('>Eliminar<')
    // El historial se sigue mostrando en lectura.
    expect(html).toContain('500.00')
  })

  it('manager ve el botón de alta manual "Registrar settlement" y editar/eliminar en el historial', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [settlementFixture],
      settlementsLoading: false,
      settlementsError: '',
      summary: summaryOpen,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toContain('Registrar settlement')
    expect(html).toContain('>Editar<')
    expect(html).toContain('>Eliminar<')
  })

  it('settled=true deja "Para saldar" vacío sin botones de registro', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary: summarySettled,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toContain('No hay transferencias pendientes')
    expect(html).not.toContain('Registrar pago')
  })

  it('estado LEDGER_INVARIANT: no inventa sugerencias — mensaje dedicado en "Para saldar"', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: 'Los saldos del ledger no cuadran — contacta soporte',
      summary: null,
      summaryError: 'Los saldos del ledger no cuadran — contacta soporte',
      summaryErrorCode: 'LEDGER_INVARIANT',
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toMatch(/no se pudieron calcular las sugerencias/i)
    expect(html).not.toMatch(/le paga/)
  })

  it('el historial en modo manager formatea monto, contrapartes y nota', () => {
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants,
      settlements: [settlementFixture],
      settlementsLoading: false,
      settlementsError: '',
      summary: summaryOpen,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))

    expect(html).toContain('500.00')
    expect(html).toMatch(/Beto[\s\S]*?→[\s\S]*?Ana/)
    expect(html).toContain('Pago parcial')
  })
})

// ============================================================
// SettlementForm — prellenado desde sugerencia, edición, validación
// ============================================================

describe('SettlementForm — prellenado y edición', () => {
  it('al abrir desde una sugerencia el form llega prellenado con from/to/monto y la fecha de hoy, editable', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants: activeParticipants,
      existingCurrency: 'MXN',
      formState: { mode: 'create', prefill: { fromParticipantId: 'b', toParticipantId: 'a', amountCents: 50000 } },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('Registrar pago')
    expect(html).toMatch(/<option value="b"[^>]*selected=""[^>]*>Beto<\/option>/)
    expect(html).toMatch(/<option value="a"[^>]*selected=""[^>]*>Ana<\/option>/)
    expect(html).toContain('value="500.00"')
    // Fecha por defecto: hoy, campo editable (no disabled/readOnly).
    const todayIso = new Date().toISOString().slice(0, 10)
    expect(html).toContain(`value="${todayIso}"`)
    expect(html).not.toMatch(/id="settlement-date"[^>]*disabled/)
  })

  it('alta manual sin sugerencia arranca vacía', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants: activeParticipants,
      existingCurrency: 'MXN',
      formState: { mode: 'create' },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).not.toMatch(/<option value="[^"]+"[^>]*selected=""/)
    const amountMatch = html.match(/id="settlement-amount"[^>]*value="([^"]*)"/)
    expect(amountMatch?.[1] ?? '').toBe('')
  })

  it('en edición precarga from/to/monto/fecha/nota del settlement existente', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants: activeParticipants,
      existingCurrency: 'MXN',
      formState: { mode: 'edit', settlement: settlementFixture },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('Editar pago')
    expect(html).toMatch(/<option value="b"[^>]*selected=""[^>]*>Beto<\/option>/)
    expect(html).toMatch(/<option value="a"[^>]*selected=""[^>]*>Ana<\/option>/)
    expect(html).toContain('value="500.00"')
    expect(html).toContain('value="2026-08-10"')
    expect(html).toContain('Pago parcial')
  })

  it('bloquea la edición de moneda cuando el ledger ya tiene una moneda fijada', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants: activeParticipants,
      existingCurrency: 'MXN',
      formState: { mode: 'create' },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('MXN (moneda fijada del evento)')
    expect(html).not.toContain('<select id="settlement-currency"')
  })

  it('el payload de creación/edición manda exactamente las keys del contrato de la API (POST/PATCH)', () => {
    const source = read('app/admin/components/finance/SettlementsPanel.tsx')
    expect(source).toContain('fromParticipantId,\n      toParticipantId,\n      amountCents,\n      currency,\n      settledOn,')
    expect(source).toContain("method: editing ? 'PATCH' : 'POST'")
    expect(source).toContain('{ ...basePayload, settlementId: editing.id }')
  })

  it('bloquea el submit si origen y destino son el mismo participante, con mensaje inline', () => {
    const source = read('app/admin/components/finance/SettlementsPanel.tsx')
    expect(source).toContain('const sameParticipant = fromParticipantId.length > 0 && fromParticipantId === toParticipantId')
    expect(source).toContain('&& !sameParticipant')
    expect(source).toContain('no pueden ser el mismo participante')
  })

  it('muestra errores 400/409 del API inline sin romper el formulario', () => {
    const source = read('app/admin/components/finance/SettlementsPanel.tsx')
    expect(source).toContain("throw new Error(errorMessage(data, 'No se pudo guardar el pago.'))")
    expect(source).toContain('{error && <p className={styles.errorText} role="alert">{error}</p>}')
  })

  it('el DELETE de un settlement pide confirmación y filtra la lista localmente vía onSettlementDeleted (sin recargar la página)', () => {
    const source = read('app/admin/components/finance/SettlementsPanel.tsx')
    expect(source).toContain('window.confirm(')
    expect(source).toContain("throw new Error(errorMessage(data, 'No se pudo eliminar el pago.'))")
    expect(source).toContain('onSettlementDeleted(settlement.id)')
  })
})

// ============================================================
// Refresh post-mutación — los saldos SIEMPRE vienen del servidor (PLAN §2.4)
// ============================================================

describe('LedgerTab — refresco del summary tras mutaciones (server-driven, nunca calculado localmente)', () => {
  it('carga el summary desde el servidor en paralelo a participantes/movimientos', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain('/api/admin/ledger/summary?eventId=')
    expect(source).toContain('/api/admin/ledger/settlements?eventId=')
    expect(source).toContain('void load()')
    expect(source).toContain('void loadSummary()')
    expect(source).toContain('void loadSettlements()')
  })

  it('guardar o eliminar un movimiento vuelve a pedir el summary al servidor', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    const savedBlock = source.slice(
      source.indexOf('const handleTransactionSaved'),
      source.indexOf('const handleTransactionDeleted'),
    )
    const deletedBlock = source.slice(
      source.indexOf('const handleTransactionDeleted'),
      source.indexOf('const handleSettlementSaved'),
    )
    expect(savedBlock).toContain('void loadSummary()')
    expect(deletedBlock).toContain('void loadSummary()')
  })

  it('guardar o eliminar un settlement vuelve a pedir el summary al servidor', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    const savedBlock = source.slice(
      source.indexOf('const handleSettlementSaved'),
      source.indexOf('const handleSettlementDeleted'),
    )
    const deletedBlock = source.slice(
      source.indexOf('const handleSettlementDeleted'),
      source.indexOf('const activeParticipants ='),
    )
    expect(savedBlock).toContain('void loadSummary()')
    expect(deletedBlock).toContain('void loadSummary()')
  })

  it('monta LedgerSummary y SettlementsPanel cableados al estado compartido de summary/settlements', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain('<LedgerSummary\n            summary={summary}\n            loading={summaryLoading}\n            error={summaryError}\n            errorCode={summaryErrorCode}\n            onOpenStripePanel={() => setStripePanelRevealKey(key => key + 1)}\n          />')
    expect(source).toContain('onSettlementSaved={handleSettlementSaved}')
    expect(source).toContain('onSettlementDeleted={handleSettlementDeleted}')
  })
})

// ============================================================
// Write-set guard — app/admin/page.tsx no se toca en este issue
// ============================================================

describe('shell (app/admin/page.tsx) — write-set respetado (ISSUE-026 no lo toca)', () => {
  it('sigue montando solo LedgerTab; nada de la lógica interna de saldos/settlements se filtra a page.tsx', () => {
    const page = read('app/admin/page.tsx')

    expect(page).toContain("import {\n  ChangePasswordForm,\n  CheckinSettings,\n  EventPresentationSettings,\n  ForcedPasswordChangeDialog,\n  InvitationLinkManager,\n  LedgerTab,")
    expect(page).toContain('<LedgerTab eventId={selectedEventId} readOnly={isReadOnly} />')

    expect(page).not.toContain('LedgerSummary')
    expect(page).not.toContain('SettlementsPanel')
    expect(page).not.toContain('suggestedTransfers')
  })
})

// ============================================================
// ISSUE-027 — la UX dedicada de Stripe ya vive en StripePanel; el resto de
// tests requeridos por este issue vive en tests/ledger-stripe-mode-ui.test.ts
// ============================================================

describe('ISSUE-027 — SettlementsPanel/LedgerSummary quedan enlazados a StripePanel', () => {
  it('la card de Ingresos Stripe de LedgerSummary abre el panel dedicado (StripePanel), no lo reimplementa', () => {
    const summarySource = read('app/admin/components/finance/LedgerSummary.tsx')
    const settlementsSource = read('app/admin/components/finance/SettlementsPanel.tsx')

    expect(summarySource).toContain('onOpenStripePanel')
    // El estado de cuenta del fondo (remanente/cobrado/retirado) vive en StripePanel, no en estos dos.
    expect(summarySource).not.toMatch(/remanente/i)
    expect(settlementsSource).not.toMatch(/remanente/i)
    // Pero SettlementsPanel SÍ etiqueta las sugerencias por dirección (PLAN §2.6b).
    expect(settlementsSource).toMatch(/retiro de stripe sugerido/i)
    expect(settlementsSource).toMatch(/aporte al fondo/i)
  })
})
