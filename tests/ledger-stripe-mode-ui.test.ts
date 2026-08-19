/**
 * ISSUE-027 (EPIC-006) — app/admin/components/finance/StripePanel.tsx +
 * retoques a SettlementsPanel.tsx (lockedFrom), TransactionForm.tsx
 * ("cubierto por el evento"), LedgerSummary.tsx (enlace) y LedgerTab.tsx
 * (montaje).
 *
 * Same constraint as tests/ledger-balances-ui.test.ts and
 * tests/ledger-admin-registro-ui.test.ts: this project's vitest config runs
 * `environment: 'node'` (no jsdom — vitest.config.ts), so components are
 * exercised with `renderToStaticMarkup` (initial-state markup only, no
 * event simulation) and interaction-driven wiring (onClick handlers,
 * fetch calls, confirm dialogs) is verified via source-string assertions —
 * the established pattern for client components in this repo.
 */
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StripePanel from '@/app/admin/components/finance/StripePanel'
import SettlementsPanel, { SettlementForm } from '@/app/admin/components/finance/SettlementsPanel'
import TransactionForm from '@/app/admin/components/finance/TransactionForm'
import LedgerSummary from '@/app/admin/components/finance/LedgerSummary'
import type { LedgerParticipant, LedgerSummaryData } from '@/app/admin/components/finance/LedgerTab'

const read = (path: string) => readFileSync(path, 'utf8')

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const A: LedgerParticipant = { id: 'a', kind: 'person', name: 'Ana', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }
const B: LedgerParticipant = { id: 'b', kind: 'person', name: 'Beto', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }
const stripeNode: LedgerParticipant = { id: 'stripe1', kind: 'stripe', name: 'Stripe', email: null, userId: null, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' }

const activeParticipants: LedgerParticipant[] = [A, B, stripeNode]

// Mirrors the fund-mode gherkin of ISSUE-024.md verbatim: expense 5000 paid
// by Stripe, covered by the event (neutral for everyone), and a 600
// withdrawal Stripe->A settled -> A=0, remainder down 600, no pendingCents.
const fundSummary: LedgerSummaryData = {
  currency: 'MXN',
  stripeMode: 'fund',
  totals: { expensesCents: 500000, manualIncomeCents: 0, stripePaidCents: 125000, netCents: -375000 },
  stripe: {
    participantId: 'stripe1',
    collectedCents: 125000,
    stripePaidExpensesCents: 500000,
    withdrawnCents: 60000,
    contributionsCents: 0,
    remainderCents: -435000,
    pendingCents: 0,
  },
  balances: [
    { participantId: 'a', name: 'Ana', kind: 'person', balanceCents: 0, isActive: true },
    { participantId: 'b', name: 'Beto', kind: 'person', balanceCents: 0, isActive: true },
  ],
  suggestedTransfers: [],
  settled: true,
}

const fundSummaryWithPendingWithdrawal: LedgerSummaryData = {
  ...fundSummary,
  stripe: { ...fundSummary.stripe, pendingCents: -20000 },
}

const fundSummaryWithPendingContribution: LedgerSummaryData = {
  ...fundSummary,
  stripe: { ...fundSummary.stripe, pendingCents: 20000 },
}

const participantSummary: LedgerSummaryData = {
  currency: 'MXN',
  stripeMode: 'participant',
  totals: { expensesCents: 90000, manualIncomeCents: 0, stripePaidCents: 125000, netCents: 35000 },
  stripe: { participantId: 'stripe1', unregisteredPaidCents: 30000 },
  balances: [
    { participantId: 'a', name: 'Ana', kind: 'person', balanceCents: -10000, isActive: true },
    { participantId: 'b', name: 'Beto', kind: 'person', balanceCents: -20000, isActive: true },
    { participantId: 'stripe1', name: 'Stripe', kind: 'stripe', balanceCents: 30000, isActive: true },
  ],
  suggestedTransfers: [
    { fromParticipantId: 'a', toParticipantId: 'stripe1', amountCents: 10000, involvesStripe: null },
    { fromParticipantId: 'b', toParticipantId: 'stripe1', amountCents: 20000, involvesStripe: null },
  ],
  settled: false,
}

const participantSummaryRegistered: LedgerSummaryData = {
  ...participantSummary,
  stripe: { participantId: 'stripe1', unregisteredPaidCents: 0 },
}

const baseProps = {
  eventId: 'evt-1',
  summaryLoading: false,
  summaryError: '',
  summaryErrorCode: null as string | null,
  activeParticipants,
  onModeChanged: () => undefined,
  onTransactionSaved: () => undefined,
  onSettlementSaved: () => undefined,
}

// ============================================================
// Modo fondo — mini-estado de cuenta
// ============================================================

describe('StripePanel — modo fondo', () => {
  it('muestra cobrado, aportes, gastos pagados por Stripe, retiros y remanente tal cual del summary (cero cálculo local)', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummary }))

    expect(html).toContain('Cobrado por Stripe')
    expect(html).toContain('1,250.00') // collectedCents
    expect(html).toContain('Gastos pagados por Stripe')
    expect(html).toContain('5,000.00') // stripePaidExpensesCents
    expect(html).toContain('Retiros')
    expect(html).toContain('600.00') // withdrawnCents
    expect(html).toContain('Remanente (utilidad)')
    expect(html).toMatch(/-\$?4,350\.00/) // remainderCents -435000, negativo
    expect(html).toContain('data-tone="negative"')
  })

  it('remanente en verde/positivo cuando no es negativo', () => {
    const positive: LedgerSummaryData = { ...fundSummary, stripe: { ...fundSummary.stripe, remainderCents: 10000 } }
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: positive }))
    expect(html).toContain('data-tone="positive"')
  })

  it('pendingCents negativo -> "retiros pendientes"; positivo -> "aportes pendientes"; cero -> sin línea', () => {
    const withdrawalPending = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummaryWithPendingWithdrawal }))
    expect(withdrawalPending).toMatch(/retiros pendientes por \$?200\.00/i)

    const contributionPending = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummaryWithPendingContribution }))
    expect(contributionPending).toMatch(/aportes pendientes por \$?200\.00/i)

    const none = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummary }))
    expect(none).not.toMatch(/pendientes por/i)
  })

  it('copy de modo fondo explica que Stripe cubre gastos y el sobrante es utilidad', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummary }))
    expect(html).toMatch(/cubre gastos del evento/i)
    expect(html).toMatch(/utilidad/i)
  })
})

// ============================================================
// Modo participante — saldo del nodo + cobros sin registrar
// ============================================================

describe('StripePanel — modo participante', () => {
  it('muestra el saldo del nodo Stripe leído de `balances` (nunca recalculado) y la nota de "es del grupo"', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: participantSummary }))
    expect(html).toMatch(/Saldo del nodo Stripe:[\s\S]*?Le deben[\s\S]*?300\.00/)
    expect(html).toMatch(/saldado cuando llegue a 0/i)
  })

  it('unregisteredPaidCents > 0 muestra el aviso con el monto exacto y el botón "Registrar cobros Stripe"', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: participantSummary }))
    expect(html).toMatch(/Tienes \$?300\.00 cobrados por Stripe sin registrar/)
    expect(html).toContain('Registrar cobros Stripe')
  })

  it('unregisteredPaidCents === 0 no muestra el aviso ni el botón', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: participantSummaryRegistered }))
    expect(html).not.toMatch(/cobrados por Stripe sin registrar/)
    expect(html).not.toContain('Registrar cobros Stripe')
  })

  it('copy de modo participante explica que la cuenta es de alguien y se reparte', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: participantSummary }))
    expect(html).toMatch(/la cuenta es de alguien/i)
  })
})

// ============================================================
// Gating por rol (viewer vs manager)
// ============================================================

describe('StripePanel — gating por rol', () => {
  it('viewer ve el panel completo (modo, remanente, saldos) pero el toggle está deshabilitado y no hay botones de registro', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: true, summary: fundSummary }))

    expect(html).toContain('Remanente (utilidad)')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Stripe cuenta como participante/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Stripe es fondo del evento/)
    expect(html).not.toContain('Registrar retiro de Stripe')
  })

  it('viewer en modo participante tampoco ve "Registrar cobros Stripe" aunque haya cobros sin registrar', () => {
    const html = render(React.createElement(StripePanel, { ...baseProps, readOnly: true, summary: participantSummary }))
    expect(html).toMatch(/cobrados por Stripe sin registrar/)
    expect(html).not.toContain('Registrar cobros Stripe')
  })

  it('manager ve el toggle habilitado y el botón "Registrar retiro de Stripe" en ambos modos', () => {
    const fund = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: fundSummary }))
    expect(fund).toContain('Registrar retiro de Stripe')
    expect(fund).not.toMatch(/<button[^>]*disabled=""[^>]*>\s*Stripe cuenta como participante/)

    const participant = render(React.createElement(StripePanel, { ...baseProps, readOnly: false, summary: participantSummary }))
    expect(participant).toContain('Registrar retiro de Stripe')
  })
})

// ============================================================
// Toggle de modo — confirm de doble conteo (gotcha #9) y refetch (wiring)
// ============================================================

describe('StripePanel — toggle de modo (source-string: no hay DOM real de eventos en este entorno)', () => {
  it('el PATCH nunca bloquea por sí mismo: el confirm de doble conteo es responsabilidad de la UI, gated a stripeIncomeRegisteredCents > 0 y solo al entrar a modo fondo', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    expect(source).toContain('if (!nextIsParticipant && config && config.stripeIncomeRegisteredCents > 0)')
    expect(source).toContain('window.confirm(DOUBLE_COUNT_WARNING)')
    expect(source).toMatch(/doble conteo/i)
    expect(source).toMatch(/cuenta dos veces/i)
  })

  it('el PATCH manda exactamente { eventId, stripeIsParticipant } al contrato de ISSUE-024', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    expect(source).toContain("fetch('/api/admin/ledger/config', {\n        method: 'PATCH',")
    expect(source).toContain('body: JSON.stringify({ eventId, stripeIsParticipant: nextIsParticipant })')
  })

  it('tras un cambio de modo exitoso se llama onModeChanged (re-consulta el summary) sin recargar la página', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    const applyBlock = source.slice(source.indexOf('const applyModeChange'), source.indexOf('const handleModeSelect'))
    expect(applyBlock).toContain('onModeChanged()')
    expect(source).not.toContain('window.location.reload')
    expect(source).not.toContain('location.reload')
  })

  it('LedgerTab conecta onModeChanged al mismo loadSummary que usan movimientos y settlements', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain('onModeChanged={loadSummary}')
    expect(source).toContain('onTransactionSaved={handleTransactionSaved}')
    expect(source).toContain('onSettlementSaved={handleSettlementSaved}')
  })

  it('un cambio de modo a "no-op" (seleccionar el modo ya activo) no dispara el PATCH', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    expect(source).toContain('if (currentMode === nextMode) return')
  })
})

// ============================================================
// SettlementsPanel — etiquetas de sugerencias involvesStripe (PLAN §2.6b)
// ============================================================

describe('SettlementsPanel — etiquetas de sugerencias involvesStripe (dirección exacta, PLAN §2.6b resolución 2026-08-19)', () => {
  const participants: LedgerParticipant[] = [A, B, stripeNode]

  it('involvesStripe="from" (nodo deudor) -> "Retiro de Stripe sugerido" + CTA "Registrar retiro"', () => {
    const summary: LedgerSummaryData = {
      currency: 'MXN',
      stripeMode: 'fund',
      totals: { expensesCents: 0, manualIncomeCents: 0, stripePaidCents: 0, netCents: 0 },
      stripe: {},
      balances: [{ participantId: 'a', name: 'Ana', kind: 'person', balanceCents: 60000, isActive: true }],
      suggestedTransfers: [{ fromParticipantId: 'stripe1', toParticipantId: 'a', amountCents: 60000, involvesStripe: 'from' }],
      settled: false,
    }
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants: participants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary,
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

  it('involvesStripe="to" (nodo acreedor) -> "Aporte al fondo" — NUNCA "retiro sugerido" (adjudicación ISSUE-024 2026-08-19)', () => {
    const summary: LedgerSummaryData = {
      currency: 'MXN',
      stripeMode: 'fund',
      totals: { expensesCents: 0, manualIncomeCents: 0, stripePaidCents: 0, netCents: 0 },
      stripe: {},
      balances: [{ participantId: 'a', name: 'Ana', kind: 'person', balanceCents: -60000, isActive: true }],
      suggestedTransfers: [{ fromParticipantId: 'a', toParticipantId: 'stripe1', amountCents: 60000, involvesStripe: 'to' }],
      settled: false,
    }
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants: participants,
      settlements: [],
      settlementsLoading: false,
      settlementsError: '',
      summary,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: false,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))
    expect(html).toContain('Aporte al fondo')
    expect(html).not.toMatch(/retiro de stripe sugerido/i)
    expect(html).toContain('>Registrar pago<')
  })

  it('el historial marca con badge Stripe los settlements que involucran al nodo', () => {
    const summary: LedgerSummaryData = {
      currency: 'MXN',
      stripeMode: 'fund',
      totals: { expensesCents: 0, manualIncomeCents: 0, stripePaidCents: 0, netCents: 0 },
      stripe: {},
      balances: [],
      suggestedTransfers: [],
      settled: true,
    }
    const html = render(React.createElement(SettlementsPanel, {
      eventId: 'evt-1',
      participants,
      activeParticipants: participants,
      settlements: [{
        id: 's1',
        fromParticipantId: 'stripe1',
        toParticipantId: 'a',
        amountCents: 60000,
        currency: 'MXN',
        settledOn: '2026-08-15',
        note: null,
        createdBy: 'user-1',
        createdAt: '2026-08-15T00:00:00.000Z',
      }],
      settlementsLoading: false,
      settlementsError: '',
      summary,
      summaryError: '',
      summaryErrorCode: null,
      readOnly: true,
      onSettlementSaved: () => undefined,
      onSettlementDeleted: () => undefined,
    }))
    expect(html).toMatch(/Stripe \(cuenta del evento\)[\s\S]*?→[\s\S]*?Ana/)
    expect(html).toContain('>Stripe<')
  })
})

// ============================================================
// SettlementForm — lockedFrom (retiro de Stripe: from fijo, no editable)
// ============================================================

describe('SettlementForm — lockedFrom (ISSUE-027)', () => {
  const participants: LedgerParticipant[] = [A, B, stripeNode]

  it('cuando lockedFrom está presente, "quién paga" se muestra como texto fijo (no select) con la etiqueta reservada del nodo Stripe', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      formState: { mode: 'create', prefill: { fromParticipantId: 'stripe1' }, lockedFrom: 'stripe1' },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('Stripe (cuenta del evento) (fijo)')
    expect(html).not.toContain('<select id="settlement-from"')
    // "Quién recibe" SÍ sigue siendo un select editable.
    expect(html).toContain('<select id="settlement-to"')
    expect(html).toContain('Registrar retiro de Stripe')
  })

  it('la sugerencia involvesStripe="from" prellena el settlement con from=nodo Stripe (fijo) y to=el acreedor (gherkin ISSUE-027)', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      formState: {
        mode: 'create',
        prefill: { fromParticipantId: 'stripe1', toParticipantId: 'a', amountCents: 60000 },
        lockedFrom: 'stripe1',
      },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('Stripe (cuenta del evento) (fijo)')
    expect(html).toMatch(/<option value="a"[^>]*selected=""[^>]*>Ana<\/option>/)
    expect(html).toContain('value="600.00"')
    const todayIso = new Date().toISOString().slice(0, 10)
    expect(html).toContain(`value="${todayIso}"`)
  })

  it('sin lockedFrom, "quién paga" sigue siendo un select editable (comportamiento previo intacto)', () => {
    const html = render(React.createElement(SettlementForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      formState: { mode: 'create' },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))
    expect(html).toContain('<select id="settlement-from"')
    expect(html).not.toContain('(fijo)')
  })
})

// ============================================================
// StripePanel — abre SettlementForm con lockedFrom (retiro) y TransactionForm
// prellenado (cobros) — verificado por wiring de código (sin DOM real)
// ============================================================

describe('StripePanel — abre los forms prellenados correctos (wiring)', () => {
  it('"Registrar retiro de Stripe" abre SettlementForm con lockedFrom = nodo Stripe y fecha de hoy (vía el form por defecto)', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    expect(source).toContain("formState={{ mode: 'create', prefill: { fromParticipantId: stripeParticipantId }, lockedFrom: stripeParticipantId }}")
  })

  it('"Registrar cobros Stripe" abre TransactionForm con income, participantId=nodo Stripe, amountCents=unregisteredPaidCents y split entre personas activas', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    const prefillBlock = source.slice(source.indexOf('prefill={{', source.indexOf('incomeFormOpen && stripeParticipantId')), source.indexOf('}}', source.indexOf('prefill={{', source.indexOf('incomeFormOpen && stripeParticipantId'))))
    expect(prefillBlock).toContain("type: 'income'")
    expect(prefillBlock).toContain('participantId: stripeParticipantId')
    expect(prefillBlock).toContain('amountCents: unregisteredPaidCents')
    expect(prefillBlock).toContain('splitParticipantIds: activePersons.map(participant => participant.id)')
  })

  it('activePersons excluye al propio nodo Stripe del reparto de "Registrar cobros Stripe"', () => {
    const source = read('app/admin/components/finance/StripePanel.tsx')
    expect(source).toContain("const activePersons = activeParticipants.filter(participant => participant.kind === 'person')")
  })
})

// ============================================================
// TransactionForm — "Cubierto por el evento" en modo fondo (PLAN §2.6b)
// ============================================================

describe('TransactionForm — "Cubierto por el evento" (ISSUE-027, PLAN §2.6b)', () => {
  const participants: LedgerParticipant[] = [A, B, stripeNode]

  it('el botón "Cubierto por el evento" solo aparece en modo fondo con un nodo Stripe resuelto', () => {
    const participantMode = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: null,
      transaction: null,
      stripeMode: 'participant',
      stripeParticipantId: 'stripe1',
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))
    expect(participantMode).not.toContain('Cubierto por el evento')

    const fundMode = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: null,
      transaction: null,
      stripeMode: 'fund',
      stripeParticipantId: 'stripe1',
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))
    expect(fundMode).toContain('Cubierto por el evento')
  })

  it('sin stripeMode/stripeParticipantId (props opcionales) el form se comporta como antes de ISSUE-027 — sin el botón', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: null,
      transaction: null,
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))
    expect(html).not.toContain('Cubierto por el evento')
  })

  it('default reactivo: elegir a Stripe como pagador en modo fondo preselecciona "cubierto por el evento" (source-string: onChange no simulable sin jsdom)', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain('const handleParticipantChange = (nextParticipantId: string) => {')
    expect(source).toContain('if (stripeParticipantId && nextParticipantId === stripeParticipantId) {')
    expect(source).toContain('setSelectedParticipantIds(new Set([stripeParticipantId]))')
    expect(source).toContain("onChange={(event) => handleParticipantChange(event.target.value)}")
  })

  it('default reactivo: elegir a una persona como pagador en modo fondo preselecciona el reparto entre personas', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain("setSelectedParticipantIds(new Set(participants.filter(p => p.kind === 'person').map(p => p.id)))")
  })

  it('el default reactivo nunca sobreescribe una edición existente (transaction !== null)', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain('if (transaction || stripeMode !== \'fund\' || !nextParticipantId) return')
  })

  it('un prefill de "Registrar cobros Stripe" precarga tipo income, pagó/recibió=Stripe, monto y reparto exactos', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      transaction: null,
      stripeMode: 'participant',
      stripeParticipantId: 'stripe1',
      prefill: {
        type: 'income',
        participantId: 'stripe1',
        amountCents: 30000,
        splitParticipantIds: ['a', 'b'],
        description: 'Cobros de Stripe',
      },
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toMatch(/<button type="button"[^>]*data-active="true"[^>]*>\s*Ingreso\s*<\/button>/)
    expect(html).toContain('value="300.00"')
    expect(html).toContain('value="Cobros de Stripe"')
    expect(html).toMatch(/<option value="stripe1"[^>]*selected=""[^>]*>Stripe \(cuenta del evento\)<\/option>/)
    // Reparto: ambas personas vienen pre-marcadas (partes iguales, editable).
    expect(html.match(/type="checkbox" checked=""/g)?.length).toBe(2)
  })

  it('el prefill nunca aplica en modo edición (transaction tiene prioridad absoluta)', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain('const [type, setType] = useState<\'expense\' | \'income\'>(transaction?.type ?? prefill?.type ?? \'expense\')')
    expect(source).toContain('const [participantId, setParticipantIdState] = useState(transaction?.participantId ?? prefill?.participantId ?? \'\')')
  })
})

// ============================================================
// LedgerSummary — la card de Ingresos Stripe enlaza a StripePanel
// ============================================================

describe('LedgerSummary — card de Ingresos Stripe (ISSUE-027)', () => {
  it('el subtítulo refleja el modo: "Fondo del evento" en fund, "Entra a las cuentas" en participant', () => {
    const fund = render(React.createElement(LedgerSummary, {
      summary: fundSummary,
      loading: false,
      error: '',
      errorCode: null,
      onOpenStripePanel: () => undefined,
    }))
    expect(fund).toContain('Fondo del evento')

    const participant = render(React.createElement(LedgerSummary, {
      summary: participantSummary,
      loading: false,
      error: '',
      errorCode: null,
      onOpenStripePanel: () => undefined,
    }))
    expect(participant).toContain('Entra a las cuentas')
  })

  it('la card es un botón que invoca onOpenStripePanel (no un <div> estático)', () => {
    const source = read('app/admin/components/finance/LedgerSummary.tsx')
    expect(source).toContain('onClick={() => onOpenStripePanel?.()}')
  })
})

// ============================================================
// LedgerTab — monta StripePanel; el card de Stripe fuerza abierto su disclosure
// ============================================================

describe('LedgerTab — monta StripePanel (ISSUE-027)', () => {
  it('renderiza <StripePanel> dentro de un SettingsDisclosure con revealKey controlado por la card de LedgerSummary', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain('<StripePanel')
    expect(source).toContain('revealKey={stripePanelRevealKey}')
    expect(source).toContain('setStripePanelRevealKey(key => key + 1)')
  })

  it('StripePanel se monta después de LedgerSummary y antes de Participantes/Movimientos', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    const loadedBranch = source.slice(source.indexOf('{!loading && !error && ('))
    expect(loadedBranch.indexOf('<LedgerSummary')).toBeLessThan(loadedBranch.indexOf('<StripePanel'))
    expect(loadedBranch.indexOf('<StripePanel')).toBeLessThan(loadedBranch.indexOf('title="Participantes"'))
  })

  it('el "Registrar movimiento" general también recibe stripeMode/stripeParticipantId (defaults de "cubierto por el evento" aplican en cualquier alta, no solo desde StripePanel)', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    const formBlock = source.slice(source.indexOf('{formState && ('), source.indexOf('{formState && (') + 500)
    expect(formBlock).toContain('stripeMode={stripeMode}')
    expect(formBlock).toContain('stripeParticipantId={stripeParticipantId}')
  })
})

// ============================================================
// Write-set guard — app/admin/page.tsx no se toca en este issue
// ============================================================

describe('shell (app/admin/page.tsx) — write-set respetado (ISSUE-027 no lo toca)', () => {
  it('sigue montando solo LedgerTab; StripePanel/la lógica de modo Stripe no se filtran a page.tsx', () => {
    const page = read('app/admin/page.tsx')

    expect(page).toContain('<LedgerTab eventId={selectedEventId} readOnly={isReadOnly} />')
    expect(page).not.toContain('StripePanel')
    expect(page).not.toContain('stripeIsParticipant')
    expect(page).not.toContain('ledger_stripe_is_participant')
    expect(page).not.toContain('DOUBLE_COUNT_WARNING')
  })
})
