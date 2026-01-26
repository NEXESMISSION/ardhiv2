# Naming Conventions

## 📋 Standard Naming Rules

This document defines the standardized naming conventions for the entire codebase.

## 🎯 Core Principles

1. **Consistency**: Same concept = same name everywhere
2. **Clarity**: Names should be self-documenting
3. **TypeScript**: Follow TypeScript/JavaScript conventions
4. **Database**: Match database column names where possible

## 📝 Financial Terms

### Standardized Terms

| Concept | Standard Name | Database Column | TypeScript Variable | Notes |
|---------|--------------|-----------------|---------------------|-------|
| Company Fee | `companyFee` | `company_fee_amount` | `companyFee` or `companyFeeAmount` | Never use "commission" |
| Company Fee Percentage | `companyFeePercentage` | `company_fee_percentage` | `companyFeePercentage` | Always percentage (0-100) |
| Advance Payment | `advance` | `big_advance_amount` | `advance` or `advanceAmount` | The big advance (التسبقة) |
| Reservation | `reservation` | `small_advance_amount` | `reservation` or `reservationAmount` | The small advance (العربون) |
| Monthly Payment | `monthlyPayment` | `monthly_installment_amount` | `monthlyPayment` | Per month amount |
| Number of Months | `numberOfMonths` | `number_of_installments` | `numberOfMonths` | Total installments |
| Installment Amount | `installmentAmount` | `amount_due` | `installmentAmount` | Single installment |
| Total Price | `totalPrice` | `total_selling_price` | `totalPrice` | Full selling price |
| Remaining Amount | `remainingAmount` | - | `remainingAmount` | After advance/reservation |

### Naming Patterns

#### Variables
```typescript
// ✅ Good
const companyFee = calculateCompanyFee(price, percentage)
const advanceAmount = calculateAdvance(price, offer)
const reservationAmount = sale.small_advance_amount

// ❌ Bad
const commission = calculateCompanyFee(price, percentage)
const bigAdvance = calculateAdvance(price, offer)
const smallAdvance = sale.small_advance_amount
```

#### Function Names
```typescript
// ✅ Good
function calculateCompanyFee(price: number, percentage: number): number
function calculateAdvanceAmount(price: number, offer: PaymentOffer): number
function calculateRemainingAmount(price: number, advance: number, reservation: number): number

// ❌ Bad
function calcCommission(price: number, percentage: number): number
function getBigAdvance(price: number, offer: PaymentOffer): number
function remaining(price: number, advance: number, reservation: number): number
```

#### Type Names
```typescript
// ✅ Good
interface SaleCalculation {
  totalPrice: number
  companyFee: number
  advance: number
  reservation: number
  remainingAmount: number
  monthlyPayment: number
  numberOfMonths: number
}

// ❌ Bad
interface SaleCalc {
  price: number
  commission: number
  bigAdvance: number
  smallAdvance: number
  remaining: number
  monthly: number
  months: number
}
```

## 🏗️ Code Structure Naming

### Files and Folders

```
lib/
├── calculations/
│   ├── index.ts                    # Public API
│   ├── saleCalculations.ts         # Sale calculations
│   ├── financialCalculations.ts    # Financial aggregations
│   ├── installmentCalculations.ts  # Installment calculations
│   ├── validation.ts               # Input validation
│   └── types.ts                    # Calculation types

services/
├── saleService.ts                  # Sale business logic
├── financialService.ts             # Financial services
└── landService.ts                  # Land services

components/
└── features/
    ├── financial/
    │   ├── FinancialSummary.tsx
    │   └── PaymentBreakdown.tsx
    └── sales/
        ├── SaleForm.tsx
        └── SaleCalculationDisplay.tsx
```

### Function Naming Patterns

#### Calculation Functions
```typescript
// Pattern: calculate + Noun
calculateCompanyFee()
calculateAdvanceAmount()
calculateRemainingAmount()
calculateMonthlyPayment()
calculateNumberOfMonths()
```

#### Service Functions
```typescript
// Pattern: verb + Noun
getSaleTotals()
createSale()
updateSale()
validateSaleData()
```

#### Hook Functions
```typescript
// Pattern: use + Noun
useSaleCalculations()
useFinancialCalculations()
useInstallmentCalculations()
```

## 🔤 Variable Naming

### camelCase for Variables
```typescript
// ✅ Good
const companyFee = 100
const advanceAmount = 5000
const monthlyPayment = 1000
const numberOfMonths = 12

// ❌ Bad
const company_fee = 100
const advance_amount = 5000
const monthly_payment = 1000
const number_of_months = 12
```

### PascalCase for Types/Interfaces
```typescript
// ✅ Good
interface SaleCalculation { }
type PaymentType = 'Full' | 'Installment'
class SaleService { }

// ❌ Bad
interface saleCalculation { }
type paymentType = 'Full' | 'Installment'
class saleService { }
```

### UPPER_CASE for Constants
```typescript
// ✅ Good
const DEFAULT_COMPANY_FEE_PERCENTAGE = 2
const MAX_INSTALLMENT_MONTHS = 120
const MIN_ADVANCE_PERCENTAGE = 10

// ❌ Bad
const defaultCompanyFeePercentage = 2
const maxInstallmentMonths = 120
const minAdvancePercentage = 10
```

## 📊 Database Mapping

### Database → TypeScript

| Database Column | TypeScript Variable | Notes |
|----------------|---------------------|-------|
| `company_fee_amount` | `companyFeeAmount` | When reading from DB |
| `company_fee_percentage` | `companyFeePercentage` | When reading from DB |
| `big_advance_amount` | `advanceAmount` | Map to `advance` in calculations |
| `small_advance_amount` | `reservationAmount` | Map to `reservation` in calculations |
| `monthly_installment_amount` | `monthlyPayment` | Map to `monthlyPayment` |
| `number_of_installments` | `numberOfMonths` | Map to `numberOfMonths` |
| `total_selling_price` | `totalPrice` | Map to `totalPrice` |

### Mapping Functions
```typescript
// lib/utils/databaseMapping.ts
export function mapSaleFromDatabase(dbSale: DatabaseSale): Sale {
  return {
    ...dbSale,
    companyFee: dbSale.company_fee_amount,
    companyFeePercentage: dbSale.company_fee_percentage,
    advance: dbSale.big_advance_amount,
    reservation: dbSale.small_advance_amount,
    monthlyPayment: dbSale.monthly_installment_amount,
    numberOfMonths: dbSale.number_of_installments,
    totalPrice: dbSale.total_selling_price,
  }
}
```

## 🎨 Component Naming

### Page Components
```typescript
// ✅ Good
Financial.tsx
Sales.tsx
LandManagement.tsx
SaleConfirmation.tsx

// ❌ Bad
FinancialNew.tsx
SalesNew.tsx
Land.tsx
ConfirmSale.tsx
```

### Feature Components
```typescript
// ✅ Good
FinancialSummary.tsx
PaymentBreakdown.tsx
SaleCalculationDisplay.tsx
OfferSelector.tsx

// ❌ Bad
Summary.tsx
Breakdown.tsx
Calculation.tsx
Selector.tsx
```

## 🔍 Search & Replace Guide

### Common Replacements

```typescript
// Replace all instances:
commission → companyFee
big_advance → advance
small_advance → reservation
monthly_payment → monthlyPayment
number_of_months → numberOfMonths
number_of_installments → numberOfMonths
monthly_installment_amount → monthlyPayment
```

### Migration Script

```typescript
// scripts/rename-variables.ts
const replacements = {
  'commission': 'companyFee',
  'big_advance': 'advance',
  'small_advance': 'reservation',
  // ... more
}

// Run this script to help with renaming
```

## ✅ Checklist

When adding new code, ensure:

- [ ] Uses standardized financial terms
- [ ] Follows camelCase for variables
- [ ] Follows PascalCase for types
- [ ] Uses descriptive function names
- [ ] Matches database column names (when applicable)
- [ ] Consistent with existing codebase
- [ ] No abbreviations (unless standard)
- [ ] Self-documenting names

## 📚 Examples

### Good Example
```typescript
import { calculateCompanyFee, calculateAdvanceAmount } from '@/lib/calculations'

function calculateSaleTotals(
  price: number,
  offer: PaymentOffer,
  reservation: number
): SaleCalculation {
  const companyFee = calculateCompanyFee(price, offer.companyFeePercentage)
  const advance = calculateAdvanceAmount(price, offer.advanceAmount, offer.advanceIsPercentage)
  const remainingAmount = price - advance - reservation - companyFee
  
  return {
    totalPrice: price,
    companyFee,
    advance,
    reservation,
    remainingAmount,
    monthlyPayment: offer.monthlyPayment,
    numberOfMonths: offer.numberOfMonths,
  }
}
```

### Bad Example
```typescript
// ❌ Inconsistent naming, unclear purpose
function calc(p: number, o: PaymentOffer, r: number) {
  const comm = (p * o.commission) / 100
  const bigAdv = o.isPct ? (p * o.adv) / 100 : o.adv
  const rem = p - bigAdv - r - comm
  
  return {
    price: p,
    commission: comm,
    bigAdvance: bigAdv,
    smallAdvance: r,
    remaining: rem,
    monthly: o.monthly,
    months: o.months,
  }
}
```

## 🎯 Next Steps

1. Review and approve these conventions
2. Create migration script
3. Update existing code gradually
4. Add ESLint rules to enforce conventions

See `07_Migration_Guide.md` for step-by-step migration.

