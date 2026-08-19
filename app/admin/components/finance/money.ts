/**
 * ISSUE-025 (EPIC-006) — the ONLY pesos<->centavos conversion point in the
 * finance admin UI (PLAN-EPIC-006.md §3.4). Every amount typed by an admin
 * must go through `parseAmountToCents` before it reaches the API; every
 * amount coming back from the API must go through `formatCents` before it
 * reaches the screen. No other file under `components/finance/` should do
 * its own `* 100` / `/ 100` arithmetic.
 *
 * The server is always the source of truth for money math (PLAN gotcha #2/#3
 * — CTE-validated shares, integer cents only): these helpers only convert
 * between the pesos string an admin types and the integer cents the API
 * contract expects. They never round in a way that could silently change an
 * amount — invalid input returns `null` instead of guessing.
 */

const ES_MX_CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>()

function currencyFormatter(currency: string): Intl.NumberFormat {
  const cached = ES_MX_CURRENCY_FORMATTERS.get(currency)
  if (cached) return cached
  const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency })
  ES_MX_CURRENCY_FORMATTERS.set(currency, formatter)
  return formatter
}

/**
 * Formats an integer cents amount as a localized currency string, e.g.
 * `formatCents(150000, 'MXN')` -> "$1,500.00". Falls back to MXN formatting
 * (still showing the raw currency code is not worth the crash) if `currency`
 * is not a valid ISO 4217 code the runtime recognizes.
 */
export function formatCents(cents: number, currency: string = 'MXN'): string {
  if (!Number.isFinite(cents)) return ''
  const amount = cents / 100
  try {
    return currencyFormatter(currency).format(amount)
  } catch {
    return currencyFormatter('MXN').format(amount)
  }
}

// Accepts either grouped thousands ("1,234.50", "1,234", "12,345,678.9") or
// a plain number ("1234.50", "0.5", "12"). At most 2 decimal digits either
// way — this is what rejects ">2 decimales" per ISSUE-025's acceptance
// criteria. No leading '+'/'-' is accepted by the pattern itself; negatives
// are also rejected explicitly below for a clearer null-vs-why story.
const GROUPED_AMOUNT_PATTERN = /^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/
const PLAIN_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/

/**
 * Parses a pesos amount typed by an admin (e.g. "1,500.00") into integer
 * cents (150000). Returns `null` for anything that is not an unambiguous
 * non-negative amount with at most 2 decimal places — callers must treat
 * `null` as "show a validation error", never coerce/guess.
 */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) return null

  if (!GROUPED_AMOUNT_PATTERN.test(trimmed) && !PLAIN_AMOUNT_PATTERN.test(trimmed)) {
    return null
  }

  const withoutSeparators = trimmed.replace(/,/g, '')
  const [integerPart, decimalPart = ''] = withoutSeparators.split('.')
  if (decimalPart.length > 2) return null

  const cents = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents < 0) return null
  return cents
}
