# Calculation Utilities Design

## 🎯 Purpose

Create a unified, reusable calculation system that:
- Eliminates duplication
- Ensures consistency
- Provides type safety
- Is easy to test
- Handles edge cases

## 📁 Structure

```
lib/calculations/
├── index.ts                    # Public API exports
├── types.ts                    # Calculation types
├── validation.ts               # Input validation
├── saleCalculations.ts         # Sale-related calculations
├── financialCalculations.ts    # Financial aggregations
├── installmentCalculations.ts  # Installment calculations
└── constants.ts                # Calculation constants
```

## 🔧 Core Calculations

### 1. Sale Calculations (`saleCalculations.ts`)

#### Price Calculations
```typescript
/**
 * Calculate price per piece based on offer or stored price
 */
export function calculatePiecePrice(
  piece: LandPiece,
  offer: PaymentOffer | null,
  paymentType: PaymentType
): number {
  validatePiece(piece)
  
  if (paymentType === 'Installment' && offer?.price_per_m2_installment) {
    return piece.surface_area * offer.price_per_m2_installment
  }
  
  if (paymentType === 'Installment') {
    return piece.selling_price_installment || piece.selling_price_full || 0
  }
  
  return piece.selling_price_full || 0
}
```

#### Company Fee Calculations
```typescript
/**
 * Calculate company fee amount from price and percentage
 */
export function calculateCompanyFee(
  price: number,
  percentage: number
): number {
  validatePositiveNumber(price, 'price')
  validatePercentage(percentage, 'percentage')
  
  return (price * percentage) / 100
}

/**
 * Get company fee percentage from sale, offer, or batch
 */
export function getCompanyFeePercentage(
  sale: Sale | null,
  offer: PaymentOffer | null,
  batch: LandBatch | null,
  paymentType: PaymentType
): number {
  // Priority: sale > offer > batch > default
  if (sale?.company_fee_percentage !== null && sale?.company_fee_percentage !== undefined) {
    return sale.company_fee_percentage
  }
  
  if (offer?.company_fee_percentage !== null && offer?.company_fee_percentage !== undefined) {
    return offer.company_fee_percentage
  }
  
  if (paymentType === 'Full' && batch?.company_fee_percentage_full) {
    return batch.company_fee_percentage_full
  }
  
  return DEFAULT_COMPANY_FEE_PERCENTAGE
}
```

#### Advance Calculations
```typescript
/**
 * Calculate advance amount (can be percentage or fixed)
 */
export function calculateAdvanceAmount(
  price: number,
  advance: number,
  isPercentage: boolean
): number {
  validatePositiveNumber(price, 'price')
  validatePositiveNumber(advance, 'advance')
  
  if (isPercentage) {
    validatePercentage(advance, 'advance')
    return (price * advance) / 100
  }
  
  return advance
}

/**
 * Calculate advance after reservation deduction
 * التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
 */
export function calculateAdvanceAfterReservation(
  advance: number,
  reservation: number
): number {
  validatePositiveNumber(advance, 'advance')
  validatePositiveNumber(reservation, 'reservation')
  
  return Math.max(0, advance - reservation)
}
```

#### Remaining Amount Calculations
```typescript
/**
 * Calculate remaining amount for installments
 * Remaining = Price - Advance (after reservation) - Company Fee
 */
export function calculateRemainingAmount(
  price: number,
  advance: number,
  reservation: number,
  companyFee: number
): number {
  validatePositiveNumber(price, 'price')
  validatePositiveNumber(advance, 'advance')
  validatePositiveNumber(reservation, 'reservation')
  validatePositiveNumber(companyFee, 'companyFee')
  
  const advanceAfterReservation = calculateAdvanceAfterReservation(advance, reservation)
  const remaining = price - advanceAfterReservation - companyFee
  
  return Math.max(0, remaining)
}
```

#### Installment Calculations
```typescript
/**
 * Calculate monthly payment from remaining amount and number of months
 */
export function calculateMonthlyPayment(
  remainingAmount: number,
  numberOfMonths: number
): number {
  validatePositiveNumber(remainingAmount, 'remainingAmount')
  validatePositiveInteger(numberOfMonths, 'numberOfMonths')
  
  if (numberOfMonths === 0) return 0
  
  return remainingAmount / numberOfMonths
}

/**
 * Calculate number of months from remaining amount and monthly payment
 */
export function calculateNumberOfMonths(
  remainingAmount: number,
  monthlyPayment: number
): number {
  validatePositiveNumber(remainingAmount, 'remainingAmount')
  validatePositiveNumber(monthlyPayment, 'monthlyPayment')
  
  if (monthlyPayment === 0) return 0
  
  return Math.ceil(remainingAmount / monthlyPayment)
}
```

### 2. Complete Sale Calculation

```typescript
/**
 * Calculate all values for a sale
 */
export function calculateSaleValues(
  piece: LandPiece,
  offer: PaymentOffer | null,
  batch: LandBatch | null,
  sale: Sale | null,
  paymentType: PaymentType,
  reservationAmount: number
): SaleCalculation {
  // Calculate base price
  const price = calculatePiecePrice(piece, offer, paymentType)
  
  // Get company fee percentage
  const companyFeePercentage = getCompanyFeePercentage(sale, offer, batch, paymentType)
  
  // Calculate company fee
  const companyFee = calculateCompanyFee(price, companyFeePercentage)
  
  // Calculate advance
  const advance = offer
    ? calculateAdvanceAmount(price, offer.advance_amount, offer.advance_is_percentage)
    : 0
  
  // Calculate advance after reservation
  const advanceAfterReservation = calculateAdvanceAfterReservation(advance, reservationAmount)
  
  // Calculate remaining amount
  const remainingAmount = calculateRemainingAmount(price, advance, reservationAmount, companyFee)
  
  // Calculate installments
  let monthlyPayment = 0
  let numberOfMonths = 0
  
  if (paymentType === 'Installment' && offer) {
    // Priority: number_of_months > monthly_payment
    if (offer.number_of_months && offer.number_of_months > 0) {
      numberOfMonths = offer.number_of_months
      monthlyPayment = calculateMonthlyPayment(remainingAmount, numberOfMonths)
    } else if (offer.monthly_payment && offer.monthly_payment > 0) {
      monthlyPayment = offer.monthly_payment
      numberOfMonths = calculateNumberOfMonths(remainingAmount, monthlyPayment)
    }
  }
  
  return {
    price,
    companyFeePercentage,
    companyFee,
    advance,
    reservation: reservationAmount,
    advanceAfterReservation,
    remainingAmount,
    monthlyPayment,
    numberOfMonths,
  }
}
```

### 3. Financial Calculations (`financialCalculations.ts`)

#### Payment Aggregations
```typescript
/**
 * Calculate total payments by type
 */
export function calculatePaymentTotal(
  payments: Payment[],
  type: PaymentRecordType,
  dateFilter?: DateFilter
): number {
  validatePayments(payments)
  
  let filtered = payments.filter(p => p.payment_type === type)
  
  if (dateFilter) {
    const { start, end } = getDateRange(dateFilter)
    filtered = filtered.filter(p => {
      const date = new Date(p.payment_date)
      return date >= start && date <= end
    })
  }
  
  return filtered.reduce((sum, p) => sum + p.amount_paid, 0)
}

/**
 * Calculate company fees total from sales
 */
export function calculateCompanyFeesTotal(
  sales: Sale[],
  dateFilter?: DateFilter
): number {
  validateSales(sales)
  
  let filtered = sales.filter(s => {
    // Always include Completed sales
    if (s.status === 'Completed') return true
    if (s.status === 'Cancelled') return false
    
    // Exclude reset sales
    if (s.status === 'Pending' && 
        s.big_advance_amount === 0 && 
        !s.company_fee_amount) {
      return false
    }
    
    return s.company_fee_amount && s.company_fee_amount > 0
  })
  
  if (dateFilter) {
    const { start, end } = getDateRange(dateFilter)
    filtered = filtered.filter(s => {
      const date = new Date(s.sale_date)
      return date >= start && date <= end
    })
  }
  
  return filtered.reduce((sum, s) => sum + (s.company_fee_amount || 0), 0)
}
```

### 4. Validation (`validation.ts`)

```typescript
/**
 * Validate positive number
 */
export function validatePositiveNumber(
  value: number,
  name: string
): void {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${name} must be a valid number`)
  }
  if (value < 0) {
    throw new Error(`${name} must be positive`)
  }
}

/**
 * Validate percentage (0-100)
 */
export function validatePercentage(
  value: number,
  name: string
): void {
  validatePositiveNumber(value, name)
  if (value > 100) {
    throw new Error(`${name} must be between 0 and 100`)
  }
}

/**
 * Validate positive integer
 */
export function validatePositiveInteger(
  value: number,
  name: string
): void {
  validatePositiveNumber(value, name)
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`)
  }
}
```

## 📊 Types

```typescript
// types.ts
export interface SaleCalculation {
  price: number
  companyFeePercentage: number
  companyFee: number
  advance: number
  reservation: number
  advanceAfterReservation: number
  remainingAmount: number
  monthlyPayment: number
  numberOfMonths: number
}

export interface MultiPieceSaleCalculation extends SaleCalculation {
  pieceCount: number
  totalPrice: number
  totalCompanyFee: number
  totalAdvance: number
  totalReservation: number
  totalRemainingAmount: number
  maxMonthlyPayment: number
  maxNumberOfMonths: number
}

export type DateFilter = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'all' | 'custom'
```

## 🧪 Testing

```typescript
// __tests__/saleCalculations.test.ts
import { calculateCompanyFee, calculateAdvanceAmount } from '@/lib/calculations'

describe('calculateCompanyFee', () => {
  it('should calculate company fee correctly', () => {
    expect(calculateCompanyFee(1000, 2)).toBe(20)
    expect(calculateCompanyFee(5000, 5)).toBe(250)
  })
  
  it('should throw error for invalid inputs', () => {
    expect(() => calculateCompanyFee(-100, 2)).toThrow()
    expect(() => calculateCompanyFee(100, -5)).toThrow()
    expect(() => calculateCompanyFee(100, 150)).toThrow()
  })
})
```

## 🎯 Usage Examples

### In Components
```typescript
import { calculateSaleValues } from '@/lib/calculations'

function SaleForm({ piece, offer, sale }) {
  const calculation = useMemo(() => {
    return calculateSaleValues(
      piece,
      offer,
      batch,
      sale,
      paymentType,
      reservationAmount
    )
  }, [piece, offer, sale, paymentType, reservationAmount])
  
  return (
    <div>
      <p>Price: {calculation.price}</p>
      <p>Company Fee: {calculation.companyFee}</p>
      <p>Advance: {calculation.advance}</p>
      <p>Monthly Payment: {calculation.monthlyPayment}</p>
    </div>
  )
}
```

### In Services
```typescript
import { calculateSaleValues } from '@/lib/calculations'

export class SaleService {
  static createSale(data: CreateSaleData): Sale {
    const calculations = data.pieces.map(piece =>
      calculateSaleValues(
        piece,
        data.offer,
        data.batch,
        null,
        data.paymentType,
        data.reservationAmount
      )
    )
    
    // Use calculations to create sale
    // ...
  }
}
```

## ✅ Benefits

1. **Single Source of Truth**: All calculations in one place
2. **Type Safety**: Full TypeScript support
3. **Testability**: Easy to unit test
4. **Consistency**: Same inputs = same outputs
5. **Maintainability**: Change once, works everywhere
6. **Documentation**: Clear function names and types

## 🚀 Next Steps

1. Create calculation utilities
2. Write tests
3. Update components to use utilities
4. Remove old calculation code

See `06_Refactoring_Plan.md` for implementation steps.

