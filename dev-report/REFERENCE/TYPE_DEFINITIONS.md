# Complete TypeScript Type Definitions

## 🎯 Overview

Complete TypeScript type definitions for the entire application. Create this file as `frontend/src/types/database.ts`.

## 📋 Complete Types

```typescript
// ============================================
// ENUMS
// ============================================

export type UserRole = 'Owner' | 'Worker'
export type UserStatus = 'Active' | 'Inactive'
export type LandStatus = 'Available' | 'Reserved' | 'Sold' | 'Cancelled'
export type PaymentType = 'Full' | 'Installment' | 'PromiseOfSale'
export type SaleStatus = 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed' | 'Cancelled'
export type PaymentRecordType = 'BigAdvance' | 'SmallAdvance' | 'Installment' | 'Full' | 'Partial' | 'Field' | 'Refund' | 'InitialPayment'
export type InstallmentStatus = 'Unpaid' | 'Paid' | 'Late' | 'Partial'
export type PaymentMethod = 'Cash' | 'BankTransfer' | 'Check' | 'CreditCard' | 'Other'
export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'
export type ExpenseCategory = 'Office' | 'Marketing' | 'Legal' | 'Maintenance' | 'Other'
export type RecurrenceType = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'

// ============================================
// CORE INTERFACES
// ============================================

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  title: string | null  // Worker title (only for workers)
  permissions: Record<string, boolean>
  allowed_pages: string[] | null
  allowed_features: string[] | null
  sidebar_order: string[] | null
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface LandBatch {
  id: string
  name: string
  location: string | null
  total_surface: number
  total_cost: number
  date_acquired: string
  real_estate_tax_number: string | null
  price_per_m2_full: number | null
  price_per_m2_installment: number | null
  company_fee_percentage_full: number | null
  image_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LandPiece {
  id: string
  land_batch_id: string
  piece_number: string
  surface_area: number
  purchase_cost: number
  selling_price_full: number
  selling_price_installment: number
  status: LandStatus
  reserved_until: string | null
  reservation_client_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  land_batch?: LandBatch
  payment_offers?: PaymentOffer[]
}

export interface PaymentOffer {
  id: string
  land_batch_id: string | null
  land_piece_id: string | null
  price_per_m2_installment: number | null
  company_fee_percentage: number
  advance_amount: number
  advance_is_percentage: boolean
  monthly_payment: number | null
  number_of_months: number | null
  offer_name: string | null
  notes: string | null
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  cin: string
  phone: string | null
  email: string | null
  address: string | null
  client_type: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  client_id: string
  land_piece_ids: string[]
  reservation_id: string | null
  payment_type: PaymentType
  total_purchase_cost: number
  total_selling_price: number
  profit_margin: number
  small_advance_amount: number
  big_advance_amount: number
  company_fee_percentage: number | null
  company_fee_amount: number | null
  installment_start_date: string | null
  installment_end_date: string | null
  number_of_installments: number | null
  monthly_installment_amount: number | null
  selected_offer_id: string | null
  contract_editor_id: string | null
  promise_initial_payment: number | null
  promise_completion_date: string | null
  promise_completed: boolean | null
  status: SaleStatus
  sale_date: string
  deadline_date: string | null
  notes: string | null
  created_by: string | null
  confirmed_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  client?: Client
  land_pieces?: LandPiece[]
  installments?: Installment[]
}

export interface Installment {
  id: string
  sale_id: string
  installment_number: number
  amount_due: number
  amount_paid: number
  stacked_amount: number
  due_date: string
  paid_date: string | null
  status: InstallmentStatus
  notes: string | null
  created_at: string
  updated_at: string
  sale?: Sale
}

export interface Payment {
  id: string
  sale_id: string | null
  client_id: string
  land_piece_ids: string[] | null
  payment_type: PaymentRecordType
  amount_paid: number
  payment_date: string
  payment_method: PaymentMethod | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Client
  sale?: Sale
}

export interface Debt {
  id: string
  client_id: string
  amount_owed: number
  daily_payment_amount: number | null
  start_date: string
  end_date: string | null
  status: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Client
  payments?: DebtPayment[]
}

export interface DebtPayment {
  id: string
  debt_id: string
  amount_paid: number
  payment_date: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  debt?: Debt
}

export interface Expense {
  id: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  description: string | null
  receipt_url: string | null
  status: ExpenseStatus
  approved_by: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RecurringExpense {
  id: string
  category: ExpenseCategory
  amount: number
  recurrence_type: RecurrenceType
  recurrence_value: number
  start_date: string
  end_date: string | null
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================
// CALCULATION TYPES
// ============================================

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

// ============================================
// UTILITY TYPES
// ============================================

export type DateFilter = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'all' | 'custom'

export interface PaginationParams {
  page: number
  limit: number
}

export interface SortParams {
  field: string
  direction: 'asc' | 'desc'
}

export interface FilterParams {
  [key: string]: any
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  data: T | null
  error: Error | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ============================================
// FORM TYPES
// ============================================

export interface CreateWorkerForm {
  name: string
  email: string
  title: string
  password?: string
  sendEmail: boolean
}

export interface CreateSaleForm {
  clientId: string
  landPieceIds: string[]
  paymentType: PaymentType
  offerId: string | null
  reservationAmount: number
}

export interface CreateClientForm {
  name: string
  cin: string
  phone?: string
  email?: string
  address?: string
  clientType?: string
  notes?: string
}

// ============================================
// EXPORT ALL
// ============================================

export type {
  User,
  LandBatch,
  LandPiece,
  PaymentOffer,
  Client,
  Sale,
  Installment,
  Payment,
  Debt,
  DebtPayment,
  Expense,
  RecurringExpense,
  SaleCalculation,
  MultiPieceSaleCalculation,
}
```

## 📝 Usage

Create this file as `frontend/src/types/database.ts` and import types throughout the application:

```typescript
import type { User, Sale, LandPiece } from '@/types/database'
```

## ✅ Benefits

- Full type safety
- IntelliSense support
- Compile-time error checking
- Self-documenting code

