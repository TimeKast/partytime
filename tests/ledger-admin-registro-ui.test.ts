import { readFileSync } from 'node:fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('React', React)
import ParticipantsManager from '@/app/admin/components/finance/ParticipantsManager'
import TransactionList from '@/app/admin/components/finance/TransactionList'
import TransactionForm from '@/app/admin/components/finance/TransactionForm'
import LedgerTab, {
  type LedgerParticipant,
  type LedgerTransaction,
} from '@/app/admin/components/finance/LedgerTab'
import { formatCents, parseAmountToCents } from '@/app/admin/components/finance/money'

const read = (path: string) => readFileSync(path, 'utf8')

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

const person: LedgerParticipant = {
  id: 'p1',
  kind: 'person',
  name: 'Ana Torres',
  email: 'ana@example.com',
  userId: null,
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
}

const inactivePerson: LedgerParticipant = {
  id: 'p2',
  kind: 'person',
  name: 'Beto Ruiz',
  email: null,
  userId: null,
  isActive: false,
  createdAt: '2026-08-01T00:00:00.000Z',
}

const stripeNode: LedgerParticipant = {
  id: 'stripe1',
  kind: 'stripe',
  name: 'Stripe',
  email: null,
  userId: null,
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
}

const participants: LedgerParticipant[] = [person, inactivePerson, stripeNode]

const expenseTransaction: LedgerTransaction = {
  id: 'tx1',
  type: 'expense',
  participantId: 'p1',
  description: 'Renta de salón',
  amountCents: 150000,
  currency: 'MXN',
  occurredOn: '2026-08-01',
  note: null,
  createdBy: 'user1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  shares: [
    { participantId: 'p1', shareCents: 75000 },
    { participantId: 'p2', shareCents: 75000 },
  ],
}

describe('lib de dinero (money.ts) — único punto de conversión pesos<->centavos', () => {
  it('parsea montos simples y con separador de miles a centavos exactos', () => {
    expect(parseAmountToCents('1,500.00')).toBe(150000)
    expect(parseAmountToCents('1500')).toBe(150000)
    expect(parseAmountToCents('1500.5')).toBe(150050)
    expect(parseAmountToCents('0.01')).toBe(1)
    expect(parseAmountToCents('  250.75  ')).toBe(25075)
    expect(parseAmountToCents('12,345,678.90')).toBe(1234567890)
  })

  it('rechaza más de 2 decimales', () => {
    expect(parseAmountToCents('1500.123')).toBeNull()
    expect(parseAmountToCents('0.999')).toBeNull()
  })

  it('rechaza montos negativos y con signo', () => {
    expect(parseAmountToCents('-100')).toBeNull()
    expect(parseAmountToCents('-1,500.00')).toBeNull()
    expect(parseAmountToCents('+100')).toBeNull()
  })

  it('rechaza entradas no numéricas o vacías', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('12,34.50')).toBeNull() // agrupación de miles inválida
    expect(parseAmountToCents('1..00')).toBeNull()
  })

  it('formatea centavos como moneda localizada es-MX', () => {
    expect(formatCents(150000, 'MXN')).toContain('1,500.00')
    expect(formatCents(1, 'MXN')).toContain('0.01')
    expect(formatCents(0, 'USD')).toContain('0.00')
  })
})

describe('ParticipantsManager', () => {
  it('en modo readOnly no expone altas, edición ni desactivación', () => {
    const html = render(React.createElement(ParticipantsManager, {
      eventId: 'evt-1',
      participants,
      readOnly: true,
      onParticipantSaved: () => undefined,
    }))

    expect(html).toContain('Ana Torres')
    expect(html).not.toContain('Agregar participante')
    expect(html).not.toContain('Editar a Ana Torres')
    expect(html).not.toContain('>Desactivar<')
  })

  it('en modo manager permite alta y expone edición/desactivación solo para participantes persona', () => {
    const html = render(React.createElement(ParticipantsManager, {
      eventId: 'evt-1',
      participants,
      readOnly: false,
      onParticipantSaved: () => undefined,
    }))

    expect(html).toContain('Agregar participante')
    expect(html).toContain('Editar a Ana Torres')
    expect(html).toContain('>Desactivar<')
    expect(html).toContain('>Reactivar<') // Beto está inactivo
  })

  it('renderiza el nodo Stripe con badge y sin acciones de edición/desactivación', () => {
    const html = render(React.createElement(ParticipantsManager, {
      eventId: 'evt-1',
      participants,
      readOnly: false,
      onParticipantSaved: () => undefined,
    }))

    expect(html).toMatch(/Stripe<span class="[^"]*">Stripe<\/span>/)
    expect(html).not.toContain('Editar a Stripe')
  })

  it('surfacea el 409 de nombre duplicado inline en el formulario de alta', () => {
    const source = read('app/admin/components/finance/ParticipantsManager.tsx')
    expect(source).toContain("throw new Error(errorMessage(data, 'No se pudo crear el participante.'))")
    expect(source).toContain('setCreateError(error instanceof Error ? error.message : ')
    expect(source).toContain('{createError && <p className={styles.errorText} role="alert">{createError}</p>}')
  })
})

describe('TransactionList', () => {
  it('en modo readOnly no expone editar/eliminar', () => {
    const html = render(React.createElement(TransactionList, {
      eventId: 'evt-1',
      transactions: [expenseTransaction],
      participants,
      readOnly: true,
      onEdit: () => undefined,
      onDeleted: () => undefined,
    }))

    expect(html).toContain('Renta de salón')
    expect(html).not.toContain('>Editar<')
    expect(html).not.toContain('>Eliminar<')
  })

  it('en modo manager expone editar/eliminar y muestra tipo, monto formateado y quién pagó', () => {
    const html = render(React.createElement(TransactionList, {
      eventId: 'evt-1',
      transactions: [expenseTransaction],
      participants,
      readOnly: false,
      onEdit: () => undefined,
      onDeleted: () => undefined,
    }))

    expect(html).toContain('>Editar<')
    expect(html).toContain('>Eliminar<')
    expect(html).toContain('Gasto')
    expect(html).toContain('1,500.00')
    expect(html).toContain('Pagó: Ana Torres')
    expect(html).toContain('Ver reparto (2)')
  })

  it('elimina la eliminación de la lista sin recargar la página (contrato: onDeleted filtra localmente)', () => {
    const source = read('app/admin/components/finance/TransactionList.tsx')
    expect(source).toContain("throw new Error(errorMessage(data, 'No se pudo eliminar el movimiento.'))")
    expect(source).toContain('onDeleted(transaction.id)')
    const ledgerTabSource = read('app/admin/components/finance/LedgerTab.tsx')
    expect(ledgerTabSource).toContain('setTransactions(current => current.filter(item => item.id !== transactionId))')
  })
})

describe('TransactionForm', () => {
  it('el nodo Stripe es seleccionable como pagó/recibió con la etiqueta reservada', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: null,
      transaction: null,
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('<option value="stripe1">Stripe (cuenta del evento)</option>')
  })

  it('bloquea el submit hasta que los campos requeridos son válidos', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: null,
      transaction: null,
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Guardar movimiento/)
  })

  it('bloquea envío de reparto personalizado cuya suma no cuadra y expone el faltante/sobrante', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain('const splitValid = splitMode === \'equal\'')
    expect(source).toContain('customShareEntries.length > 0 && customShareDiff === 0')
    expect(source).toContain('Falta repartir')
    expect(source).toContain('Sobran')
  })

  it('el payload de "partes iguales" manda amountCents y splitMode equal (el server reparte)', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain("{ splitMode: 'equal' as const, participantIds: Array.from(selectedParticipantIds) }")
    expect(source).toContain('amountCents,')
    // El monto siempre pasa por parseAmountToCents antes de construir el payload.
    expect(source).toContain('const amountCents = useMemo(() => parseAmountToCents(amountInput), [amountInput])')
  })

  it('el payload de "montos personalizados" manda shares exactos calculados client-side', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain('{ shares: customShareEntries }')
    expect(source).toContain('.filter((entry): entry is { participantId: string; shareCents: number } => entry.shareCents !== null && entry.shareCents > 0)')
  })

  it('muestra errores 400/409 del API inline sin romper el formulario', () => {
    const source = read('app/admin/components/finance/TransactionForm.tsx')
    expect(source).toContain("throw new Error(errorMessage(data, 'No se pudo guardar el movimiento.'))")
    expect(source).toContain('{error && <p className={styles.errorText} role="alert"')
  })

  it('bloquea la edición de moneda cuando el ledger ya tiene una moneda fijada', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      transaction: null,
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('MXN (moneda fijada del evento)')
    expect(html).not.toContain('<select id="tx-currency"')
  })

  it('en edición precarga el reparto existente en modo montos personalizados', () => {
    const html = render(React.createElement(TransactionForm, {
      eventId: 'evt-1',
      participants,
      existingCurrency: 'MXN',
      transaction: expenseTransaction,
      onCancel: () => undefined,
      onSaved: () => undefined,
    }))

    expect(html).toContain('Editar movimiento')
    expect(html).toContain('value="Renta de salón"')
    expect(html).toContain('value="1500.00"')
  })
})

describe('LedgerTab', () => {
  it('arranca en estado de carga y luego monta LedgerSummary + SettlementsPanel donde antes vivía el slot vacío (ISSUE-026)', () => {
    const html = render(React.createElement(LedgerTab, { eventId: 'evt-1', readOnly: true }))
    expect(html).toContain('Cargando información financiera')

    const source = read('app/admin/components/finance/LedgerTab.tsx')
    const loadedBranch = source.slice(source.indexOf('{!loading && !error && ('))
    expect(loadedBranch.indexOf('<LedgerSummary'))
      .toBeLessThan(loadedBranch.indexOf('<SettingsDisclosure'))
    expect(source).not.toContain('data-testid="ledger-balances-slot"')
    expect(source).toContain('<LedgerSummary')
    expect(source).toContain('<SettlementsPanel')
  })

  it('usa disclosures mobile-first para Participantes y Movimientos (patrón Check-in)', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain("import { SettingsDisclosure } from '../config/SettingsDisclosure'")
    expect(source).toContain('title="Participantes"')
    expect(source).toContain('title="Movimientos"')
  })

  it('carga participantes y movimientos desde las rutas de ISSUE-023', () => {
    const source = read('app/admin/components/finance/LedgerTab.tsx')
    expect(source).toContain('/api/admin/ledger/participants?eventId=')
    expect(source).toContain('/api/admin/ledger/transactions?eventId=')
  })
})

describe('responsive 375px', () => {
  it('TransactionList colapsa a cards legibles en viewport angosto', () => {
    const css = read('app/admin/components/finance/TransactionList.module.css')
    expect(css).toMatch(/@media \(max-width: 375px\)/)
  })

  it('los formularios de finanzas apilan sus campos en móvil sin overflow horizontal', () => {
    const participantsCss = read('app/admin/components/finance/ParticipantsManager.module.css')
    const formCss = read('app/admin/components/finance/TransactionForm.module.css')
    const listCss = read('app/admin/components/finance/TransactionList.module.css')
    expect(participantsCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/)
    expect(formCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/)
    expect([participantsCss, formCss, listCss].join('\n')).not.toMatch(/overflow-x:\s*(?:auto|scroll)/)
  })
})

describe('shell (app/admin/page.tsx) — único issue autorizado a tocarlo en esta wave', () => {
  it('la pestaña Finanzas solo monta LedgerTab; el resto del árbol de finanzas vive fuera de page.tsx', () => {
    const page = read('app/admin/page.tsx')

    expect(page).toContain("import {\n  ChangePasswordForm,\n  CheckinSettings,\n  EventPresentationSettings,\n  ForcedPasswordChangeDialog,\n  InvitationLinkManager,\n  LedgerTab,")
    expect(page).toContain("activeTab === 'finanzas' && selectedEventId")
    expect(page).toContain('<LedgerTab eventId={selectedEventId} readOnly={isReadOnly} />')

    // Nada de la lógica interna de finanzas se filtra a page.tsx.
    expect(page).not.toContain('ParticipantsManager')
    expect(page).not.toContain('TransactionList')
    expect(page).not.toContain('TransactionForm')
    expect(page).not.toContain('splitMode')
    expect(page).not.toContain('parseAmountToCents')
  })

  it('la pestaña Finanzas es visible para viewer y manager (sin gate de canManageSelectedEvent)', () => {
    const page = read('app/admin/page.tsx')
    const finanzasStart = page.indexOf("activeTab === 'finanzas'")
    const finanzasLine = page.slice(finanzasStart - 40, finanzasStart + 80)
    expect(finanzasLine).not.toContain('canManageSelectedEvent')
  })
})

describe('navegación del shell — tab Finanzas registrado en los tres puntos de entrada', () => {
  it('NavList expone Finanzas sin requiresEventManagement/requiresSuperAdmin', () => {
    const navList = read('app/admin/components/shell/NavList.tsx')
    expect(navList).toContain("'dashboard' | 'config' | 'finanzas' | 'eventos' | 'usuarios' | 'cuenta'")
    expect(navList).toMatch(/\{ tab: 'finanzas', label: 'Finanzas', icon: Wallet \}/)
  })

  it('BottomNav y Topbar también registran Finanzas', () => {
    const bottomNav = read('app/admin/components/shell/BottomNav.tsx')
    const topbar = read('app/admin/components/shell/Topbar.tsx')
    expect(bottomNav).toMatch(/\{ tab: 'finanzas', label: 'Finanzas', icon: Wallet \}/)
    expect(topbar).toContain("finanzas: 'Finanzas',")
  })
})
