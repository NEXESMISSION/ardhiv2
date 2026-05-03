// Safely parse a money/quantity string typed by the user.
// Tolerates locale variations: thousands separators (',', ' ', ' '), Arabic-Indic digits,
// and ',' as a decimal separator (fr-FR/ar-* locales).
//
// Returns NaN for empty/invalid input (matches parseFloat conventions).
//
// Examples:
//   parseAmount("5,000.00")     → 5000
//   parseAmount("5 000,50")     → 5000.5
//   parseAmount("١٢٣٤")          → 1234   (Arabic-Indic digits)
//   parseAmount("")             → NaN
//   parseAmount("abc")          → NaN
export function parseAmount(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN
  if (input == null) return NaN
  const trimmed = input.trim()
  if (!trimmed) return NaN

  // Normalize Arabic-Indic and Persian-Indic digits to ASCII.
  const ascii = trimmed.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                       .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))

  // Remove anything that isn't a digit, '.', ',', '-' or '+'.
  const cleaned = ascii.replace(/[^\d.,+\-]/g, '')

  // Decide which separator is the decimal one. Whichever appears LAST in the
  // string is the decimal — the other is a thousands separator.
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')

  let normalized: string
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned
  } else if (lastDot > lastComma) {
    // '.' is decimal, ',' is thousands → strip all commas
    normalized = cleaned.replace(/,/g, '')
  } else {
    // ',' is decimal, '.' is thousands → strip all dots, then convert ',' to '.'
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}
