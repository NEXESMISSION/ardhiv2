# 🧪 Complete Testing Roadmap - Land Management System

## 📋 Table of Contents

1. [Overview](#overview)
2. [Testing Strategy](#testing-strategy)
3. [Page-by-Page Testing](#page-by-page-testing)
4. [Calculation Testing](#calculation-testing)
5. [User Flow Testing](#user-flow-testing)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)
7. [Data Integrity Testing](#data-integrity-testing)
8. [UI/UX Testing](#uiux-testing)
9. [Performance Testing](#performance-testing)
10. [Security Testing](#security-testing)
11. [Known Issues & Improvements](#known-issues--improvements)

---

## Overview

This document provides a comprehensive testing roadmap for the Land Management System. Use this to systematically test all functionalities, calculations, and edge cases before implementing new features.

### Testing Checklist Status
- [ ] All tests completed
- [ ] All bugs fixed
- [ ] All improvements documented
- [ ] Ready for new features

---

## Testing Strategy

### Test Categories
1. **Functional Testing**: Verify all features work as expected
2. **Calculation Testing**: Verify all mathematical operations are correct
3. **Data Integrity**: Ensure data consistency across operations
4. **UI/UX Testing**: Verify user experience and interface responsiveness
5. **Edge Cases**: Test boundary conditions and error scenarios
6. **Integration Testing**: Test workflows across multiple pages
7. **Performance Testing**: Test with large datasets
8. **Security Testing**: Verify data validation and access control

---

## Page-by-Page Testing

### 1. 🏞️ Land Page (`/land`)

#### 1.1 Batch Management

**Test Cases:**

- [ ] **Create Batch**
  - [ ] Create batch with all fields (name, location, title reference)
  - [ ] Create batch with only required fields (name)
  - [ ] Try to create batch with empty name (should show error)
  - [ ] Create batch with special characters in name
  - [ ] Create batch with very long name (100+ characters)
  - [ ] Verify batch appears in list after creation
  - [ ] Verify batch is sorted by creation date (newest first)

- [ ] **Edit Batch**
  - [ ] Edit batch name
  - [ ] Edit batch location
  - [ ] Edit batch title reference
  - [ ] Edit batch with empty name (should show error)
  - [ ] Cancel edit dialog
  - [ ] Verify changes are saved correctly
  - [ ] Verify batch list updates after edit

- [ ] **Delete Batch**
  - [ ] Delete batch with no pieces (should succeed)
  - [ ] Delete batch with pieces (should show warning with pieces list)
  - [ ] Delete batch with sales (should show warning)
  - [ ] Cancel delete operation
  - [ ] Verify batch is removed from list after deletion
  - [ ] Verify related pieces are deleted (if applicable)
  - [ ] Verify related offers are deleted (if applicable)

#### 1.2 Pricing Configuration

**Test Cases:**

- [ ] **Full Payment Pricing**
  - [ ] Set price per m² (positive number)
  - [ ] Set price per m² to 0
  - [ ] Set price per m² with decimals (e.g., 250.50)
  - [ ] Set price per m² with very large number (1,000,000+)
  - [ ] Verify price is saved correctly
  - [ ] Verify price is displayed correctly in batch card

- [ ] **Installment Offers**
  - [ ] Add installment offer with all fields
  - [ ] Add offer with name
  - [ ] Add offer without name (should work)
  - [ ] Add offer with price per m² = 0 (should show error or warning)
  - [ ] Add offer with advance mode: fixed amount
  - [ ] Add offer with advance mode: percentage
  - [ ] Add offer with calculation mode: monthly amount
  - [ ] Add offer with calculation mode: number of months
  - [ ] Add multiple offers to same batch
  - [ ] Delete installment offer
  - [ ] Edit installment offer (if feature exists)
  - [ ] Verify offers are saved correctly
  - [ ] Verify offers appear in list

#### 1.3 Piece Management

**Test Cases:**

- [ ] **View Pieces**
  - [ ] Open pieces dialog for batch with pieces
  - [ ] Open pieces dialog for batch without pieces
  - [ ] Verify all pieces are displayed
  - [ ] Verify piece status is shown correctly (Available/Reserved/Sold)
  - [ ] Verify piece numbers are displayed
  - [ ] Verify surface area is displayed correctly
  - [ ] Verify reserved pieces are shown in orange
  - [ ] Verify sold pieces are shown with appropriate styling

- [ ] **Add Piece**
  - [ ] Add piece with all fields (piece number, surface, notes, direct price)
  - [ ] Add piece with only required fields
  - [ ] Add piece with duplicate piece number (should show error or allow)
  - [ ] Add piece with surface = 0 (should show error)
  - [ ] Add piece with negative surface (should show error)
  - [ ] Add piece with very large surface (10,000+ m²)
  - [ ] Add piece with special characters in piece number
  - [ ] Add multiple pieces quickly
  - [ ] Verify piece appears in list after addition
  - [ ] Verify piece status is "Available" by default

- [ ] **Delete Piece**
  - [ ] Delete available piece
  - [ ] Delete reserved piece (should show warning or prevent)
  - [ ] Delete sold piece (should show warning or prevent)
  - [ ] Cancel delete operation
  - [ ] Verify piece is removed from list

#### 1.4 Multi-Piece Sale Workflow

**Test Cases:**

- [ ] **Select Pieces for Sale**
  - [ ] Select single piece
  - [ ] Select multiple pieces
  - [ ] Select all available pieces
  - [ ] Try to select reserved piece (should be disabled)
  - [ ] Try to select sold piece (should be disabled)
  - [ ] Deselect piece
  - [ ] Verify selected pieces are highlighted
  - [ ] Verify "Sell" button appears when pieces are selected
  - [ ] Verify "Sell" button is red and at bottom

- [ ] **Client Selection**
  - [ ] Enter existing client CIN (should auto-search)
  - [ ] Enter non-existing client CIN (should show "not found")
  - [ ] Enter CIN with less than 4 characters (should not search)
  - [ ] Enter CIN with special characters
  - [ ] Verify search status messages appear correctly
  - [ ] Verify found client information is displayed
  - [ ] Create new client from sale dialog
  - [ ] Create client with all fields
  - [ ] Create client with only required fields
  - [ ] Try to create client with duplicate CIN (should show error)
  - [ ] Change client after selection
  - [ ] Verify client information persists after selection

- [ ] **Sale Details Entry**
  - [ ] Enter deposit amount
  - [ ] Enter deposit = 0 (should show error)
  - [ ] Enter deposit > total price (should show error)
  - [ ] Enter deposit with decimals
  - [ ] Enter deposit with very large number
  - [ ] Select sale type: Full Payment
  - [ ] Select sale type: Installment
  - [ ] Select sale type: Promise of Sale
  - [ ] Select installment offer when type is "Installment"
  - [ ] Try to confirm without selecting offer (should show error)
  - [ ] Enter deadline date
  - [ ] Enter deadline date in the past (should show warning or prevent)
  - [ ] Enter notes
  - [ ] Verify calculations update in real-time
  - [ ] Verify all fields are validated before submission

- [ ] **Sale Confirmation**
  - [ ] Confirm sale with all valid data
  - [ ] Cancel sale confirmation
  - [ ] Verify sale is created in database
  - [ ] Verify pieces are reserved after sale creation
  - [ ] Verify pieces status changes to "Reserved"
  - [ ] Verify success message appears
  - [ ] Verify dialog closes after successful sale
  - [ ] Verify batch list refreshes
  - [ ] Verify pieces dialog refreshes (if open)

#### 1.5 Calculation Testing (Land Page)

**Test Cases:**

- [ ] **Full Payment Calculation**
  - [ ] Calculate price for piece with batch price only
  - [ ] Calculate price for piece with direct price (should use direct price)
  - [ ] Calculate total for multiple pieces
  - [ ] Verify deposit is subtracted correctly
  - [ ] Verify remaining amount is calculated correctly

- [ ] **Installment Calculation**
  - [ ] Calculate with advance mode: fixed amount
  - [ ] Calculate with advance mode: percentage
  - [ ] Calculate with calculation mode: monthly amount
  - [ ] Calculate with calculation mode: number of months
  - [ ] Verify base price uses installment price per m²
  - [ ] Verify advance amount is calculated correctly
  - [ ] Verify remaining amount after advance
  - [ ] Verify monthly payment is calculated correctly
  - [ ] Verify number of months is correct
  - [ ] Verify total installments = monthly payment × months
  - [ ] Test with deposit > advance (edge case)
  - [ ] Test with deposit = advance
  - [ ] Test with deposit < advance
  - [ ] Verify calculations update when offer changes
  - [ ] Verify calculations for multiple pieces with same offer

- [ ] **Promise of Sale Calculation**
  - [ ] Calculate with deposit only
  - [ ] Verify remaining amount = total - deposit
  - [ ] Verify calculations are correct

---

### 2. 👥 Clients Page (`/clients`)

#### 2.1 Client List

**Test Cases:**

- [ ] **Display Clients**
  - [ ] View clients list (first page)
  - [ ] Navigate to next page
  - [ ] Navigate to previous page
  - [ ] Navigate to last page
  - [ ] Verify pagination shows correct page numbers
  - [ ] Verify 20 clients per page
  - [ ] Verify total count is displayed correctly
  - [ ] Verify client information is displayed correctly
  - [ ] Verify client type badge is shown (Individual/Company)

- [ ] **Client Statistics**
  - [ ] Verify total clients count
  - [ ] Verify clients with sales count
  - [ ] Verify individual clients count
  - [ ] Verify company clients count
  - [ ] Verify statistics update after creating client
  - [ ] Verify statistics update after deleting client

#### 2.2 Client Management

**Test Cases:**

- [ ] **Create Client**
  - [ ] Create individual client with all fields
  - [ ] Create company client with all fields
  - [ ] Create client with only required fields (name, phone, CIN)
  - [ ] Try to create client with empty name (should show error)
  - [ ] Try to create client with empty phone (should show error)
  - [ ] Try to create client with empty CIN (should show error)
  - [ ] Try to create client with duplicate CIN (should show error)
  - [ ] Create client with invalid email format (should show error or allow)
  - [ ] Create client with CIN length != 8 (if validation exists)
  - [ ] Create client with special characters in name
  - [ ] Verify client appears in list after creation
  - [ ] Verify client is sorted correctly

- [ ] **Edit Client**
  - [ ] Edit client name
  - [ ] Edit client phone
  - [ ] Edit client email
  - [ ] Edit client address
  - [ ] Edit client type
  - [ ] Edit client notes
  - [ ] Try to edit CIN (should be disabled or show warning)
  - [ ] Cancel edit operation
  - [ ] Verify changes are saved correctly

- [ ] **Delete Client**
  - [ ] Delete client with no sales (should succeed)
  - [ ] Delete client with sales (should show warning or prevent)
  - [ ] Cancel delete operation
  - [ ] Verify client is removed from list
  - [ ] Verify statistics update after deletion

---

### 3. ✅ Confirmation Page (`/confirmation`)

#### 3.1 Pending Sales Display

**Test Cases:**

- [ ] **View Pending Sales**
  - [ ] View all pending sales
  - [ ] Verify sales are grouped correctly (by client, payment method, offer)
  - [ ] Verify individual sales are shown
  - [ ] Verify grouped sales show correct count
  - [ ] Verify sale information is displayed correctly
  - [ ] Verify client information is shown
  - [ ] Verify piece information is shown
  - [ ] Verify batch information is shown
  - [ ] Verify deposit amount is shown
  - [ ] Verify deadline date is shown
  - [ ] Verify deadline countdown for promise sales
  - [ ] Verify overdue indicator for expired deadlines

#### 3.2 Sale Actions

**Test Cases:**

- [ ] **Edit Sale**
  - [ ] Click "تعديل" button
  - [ ] Edit deposit amount
  - [ ] Edit deadline date
  - [ ] Edit notes
  - [ ] Cancel edit
  - [ ] Save edit
  - [ ] Verify changes are saved
  - [ ] Verify sale updates in list

- [ ] **Set Appointment**
  - [ ] Click "موعد" button
  - [ ] Select appointment date
  - [ ] Cancel appointment dialog
  - [ ] Save appointment
  - [ ] Verify appointment is saved
  - [ ] Verify appointment date is displayed

- [ ] **Cancel Sale**
  - [ ] Click "إلغاء" button
  - [ ] Confirm cancellation
  - [ ] Cancel cancellation dialog
  - [ ] Verify sale status changes to "cancelled"
  - [ ] Verify piece status changes to "Available"
  - [ ] Verify sale is removed from pending list
  - [ ] Verify deposit is removed from finance (if applicable)

#### 3.3 Sale Confirmation

**Test Cases:**

- [ ] **Confirm Full Payment Sale**
  - [ ] Click confirm button for full payment sale
  - [ ] Verify confirmation dialog shows correct calculations
  - [ ] Enter company fee
  - [ ] Select contract writer
  - [ ] Select payment method (cash/check/bank transfer)
  - [ ] Enter notes
  - [ ] Confirm sale
  - [ ] Verify sale status changes to "completed"
  - [ ] Verify piece status changes to "Sold"
  - [ ] Verify deposit is registered in finance
  - [ ] Verify company fee is registered in finance
  - [ ] Verify sale appears in Sales Records
  - [ ] Verify sale is removed from Confirmation page

- [ ] **Confirm Installment Sale**
  - [ ] Click confirm button for installment sale
  - [ ] Verify confirmation dialog shows installment details
  - [ ] Verify advance amount is shown
  - [ ] Verify monthly payment is shown
  - [ ] Verify number of months is shown
  - [ ] Enter installment start date
  - [ ] Enter company fee
  - [ ] Select contract writer
  - [ ] Confirm sale
  - [ ] Verify sale status changes to "completed"
  - [ ] Verify piece status changes to "Sold"
  - [ ] Verify installment payments are created
  - [ ] Verify deposit is registered in finance
  - [ ] Verify advance is registered in finance
  - [ ] Verify sale appears in Installments page
  - [ ] Verify sale appears in Sales Records

- [ ] **Confirm Promise of Sale (Initial)**
  - [ ] Click confirm button for promise sale (no previous payment)
  - [ ] Verify confirmation dialog shows "المبلغ المستلم الآن" field
  - [ ] Enter payment amount
  - [ ] Verify remaining amount is calculated correctly
  - [ ] Enter company fee
  - [ ] Confirm sale
  - [ ] Verify sale status remains "pending" (if partial payment)
  - [ ] Verify sale status changes to "completed" (if full payment)
  - [ ] Verify partial payment is registered
  - [ ] Verify remaining amount is updated

- [ ] **Confirm Promise of Sale (Partial Payment)**
  - [ ] Click confirm button for promise sale with existing partial payment
  - [ ] Verify "المبلغ المستلم الآن" is auto-filled with remaining amount
  - [ ] Enter payment amount
  - [ ] Verify remaining amount updates correctly
  - [ ] Confirm sale
  - [ ] Verify partial payment is updated
  - [ ] Verify remaining amount is updated
  - [ ] Verify sale status changes to "completed" if fully paid

- [ ] **Confirm Grouped Sales**
  - [ ] Confirm all sales in a group
  - [ ] Confirm individual sale from group
  - [ ] Verify grouped sales are confirmed together
  - [ ] Verify calculations are correct for grouped sales
  - [ ] Verify all pieces are updated correctly

#### 3.4 Calculation Testing (Confirmation Page)

**Test Cases:**

- [ ] **Full Payment Calculations**
  - [ ] Verify total price is correct
  - [ ] Verify deposit is shown correctly
  - [ ] Verify remaining amount = total - deposit
  - [ ] Verify company fee is added correctly
  - [ ] Verify amount to receive is calculated correctly

- [ ] **Installment Calculations**
  - [ ] Verify base price is correct
  - [ ] Verify advance amount is correct
  - [ ] Verify deposit is shown correctly
  - [ ] Verify remaining for installments is correct
  - [ ] Verify monthly payment is correct
  - [ ] Verify number of months is correct
  - [ ] Verify total installments = monthly × months
  - [ ] Verify confirmation amount = deposit + advance

- [ ] **Promise of Sale Calculations**
  - [ ] Verify total price is correct
  - [ ] Verify previous partial payment is shown (if exists)
  - [ ] Verify remaining amount is correct
  - [ ] Verify new payment amount is added correctly
  - [ ] Verify new remaining amount is calculated correctly

---

### 4. 💰 Finance Page (`/finance`)

#### 4.1 Statistics Cards

**Test Cases:**

- [ ] **Unpaid Amount Card**
  - [ ] Verify unpaid amount is calculated correctly
  - [ ] Click on card (should open details dialog)
  - [ ] Verify only installment-related unpaid amounts are shown
  - [ ] Verify deposits, advances, full payments are excluded

- [ ] **Paid Amount Card**
  - [ ] Verify paid amount is calculated correctly
  - [ ] Click on card (should open details dialog)
  - [ ] Verify only installment payments are included
  - [ ] Verify deposits, advances, full payments are excluded

- [ ] **Expected This Month Card**
  - [ ] Verify expected amount is calculated correctly
  - [ ] Click on card (should open details dialog)
  - [ ] Verify only current month installments are shown
  - [ ] Verify overdue installments are included

#### 4.2 Time Filters

**Test Cases:**

- [ ] **Filter by Time Period**
  - [ ] Select "Today" filter
  - [ ] Select "This Week" filter
  - [ ] Select "This Month" filter
  - [ ] Select "All" filter
  - [ ] Verify statistics update correctly
  - [ ] Verify payment types table updates
  - [ ] Verify batch totals table updates

- [ ] **Filter by Specific Date**
  - [ ] Select specific date
  - [ ] Verify statistics update for that date
  - [ ] Clear date filter
  - [ ] Verify statistics reset

#### 4.3 Payment Types

**Test Cases:**

- [ ] **Payment Type Boxes**
  - [ ] Click on "الأقساط" box (should open details)
  - [ ] Click on "العربون" box (should open details)
  - [ ] Click on "بالحاضر" box (should open details)
  - [ ] Click on "التسبقة" box (should open details)
  - [ ] Click on "وعد بالبيع" box (should open details)
  - [ ] Click on "العمولة" box (should open details)
  - [ ] Verify each box shows correct amount
  - [ ] Verify each box shows correct count
  - [ ] Verify boxes are disabled when count = 0

- [ ] **Payment Type Details Dialog**
  - [ ] Verify details are grouped by batch
  - [ ] Verify details are sorted by date (descending)
  - [ ] Verify summary cards show correct counts
  - [ ] Verify table shows all transactions
  - [ ] Verify totals are calculated correctly
  - [ ] Close dialog
  - [ ] Verify dialog closes correctly

#### 4.4 Batch Totals

**Test Cases:**

- [ ] **Batch Totals Table**
  - [ ] Verify all batches are shown
  - [ ] Verify totals for each payment type per batch
  - [ ] Verify grand total row is correct
  - [ ] Verify table is scrollable if many batches
  - [ ] Verify formatting is correct (numbers in English)

#### 4.5 Calculation Testing (Finance Page)

**Test Cases:**

- [ ] **Unpaid Amount Calculation**
  - [ ] Verify only unpaid installment payments are included
  - [ ] Verify deposits are excluded
  - [ ] Verify advances are excluded
  - [ ] Verify full payments are excluded
  - [ ] Verify promise payments are excluded
  - [ ] Verify calculation is sum of unpaid installments only

- [ ] **Paid Amount Calculation**
  - [ ] Verify only paid installment payments are included
  - [ ] Verify status = 'paid' is required
  - [ ] Verify deposits are excluded
  - [ ] Verify advances are excluded
  - [ ] Verify full payments are excluded
  - [ ] Verify promise payments are excluded

- [ ] **Expected This Month Calculation**
  - [ ] Verify only current month installments are included
  - [ ] Verify overdue installments are included
  - [ ] Verify future installments are excluded
  - [ ] Verify calculation is correct for current month

- [ ] **Payment Type Totals**
  - [ ] Verify installments total = sum of all installment payments
  - [ ] Verify deposits total = sum of all deposits
  - [ ] Verify full payment total = sum of all full payments
  - [ ] Verify advance total = sum of all advances
  - [ ] Verify promise total = sum of all promise payments
  - [ ] Verify commission total = sum of all company fees

---

### 5. 📅 Installments Page (`/installments`)

#### 5.1 Installment Sales Display

**Test Cases:**

- [ ] **View Installment Sales**
  - [ ] View all completed installment sales
  - [ ] Verify sales are grouped by client and offer
  - [ ] Verify individual sales are shown
  - [ ] Verify grouped sales show correct information
  - [ ] Verify client information is displayed
  - [ ] Verify sale date is displayed
  - [ ] Verify pieces are listed
  - [ ] Verify paid/total installments are shown
  - [ ] Verify paid amount is shown
  - [ ] Verify remaining amount is shown
  - [ ] Verify overdue amount is shown
  - [ ] Verify next due date is shown
  - [ ] Verify status badge is shown (متأخر/قريب الاستحقاق/على المسار)

#### 5.2 Installment Details

**Test Cases:**

- [ ] **View Installment Details**
  - [ ] Click "عرض التفاصيل" button
  - [ ] Verify dialog opens with all information
  - [ ] Verify client details are shown
  - [ ] Verify sale date is shown
  - [ ] Verify pieces are listed
  - [ ] Verify total amount is shown
  - [ ] Verify paid amount is shown
  - [ ] Verify remaining amount is shown
  - [ ] Verify progress bar is shown and correct
  - [ ] Verify contract writer is shown
  - [ ] Verify sold by / confirmed by are shown
  - [ ] Verify installment schedule table is shown
  - [ ] Verify all installments are listed
  - [ ] Verify installment status is shown (Paid/Due/Overdue)
  - [ ] Verify due date countdown is shown
  - [ ] Close dialog

#### 5.3 Pay Installment

**Test Cases:**

- [ ] **Pay Single Installment**
  - [ ] Click "Pay" button on installment
  - [ ] Verify payment dialog opens
  - [ ] Enter payment amount
  - [ ] Enter payment date
  - [ ] Select payment method
  - [ ] Enter notes
  - [ ] Confirm payment
  - [ ] Verify installment status changes to "paid"
  - [ ] Verify paid amount is updated
  - [ ] Verify remaining amount is updated
  - [ ] Verify payment is registered in finance
  - [ ] Verify details dialog updates

- [ ] **Pay Multiple Installments**
  - [ ] Pay installments in order
  - [ ] Pay installments out of order
  - [ ] Pay all installments at once
  - [ ] Verify all payments are registered correctly

---

### 6. 📋 Sales Records Page (`/sales-records`)

#### 6.1 Sales Display

**Test Cases:**

- [ ] **View All Sales**
  - [ ] View all sales (pending, completed, cancelled)
  - [ ] Verify sales are displayed correctly
  - [ ] Verify sale status is shown
  - [ ] Verify client information is shown
  - [ ] Verify piece information is shown
  - [ ] Verify batch information is shown
  - [ ] Verify sale date is shown
  - [ ] Verify total paid amount is shown
  - [ ] Verify sale type is shown

#### 6.2 Sale Actions

**Test Cases:**

- [ ] **Revert to Confirmation**
  - [ ] Click "إرجاع للتأكيد" button
  - [ ] Verify confirmation dialog explains action
  - [ ] Confirm revert
  - [ ] Verify sale status changes to "pending"
  - [ ] Verify sale appears in Confirmation page
  - [ ] Verify piece status changes to "Reserved"
  - [ ] Verify installments are removed (if applicable)
  - [ ] Verify only deposit remains in finance

- [ ] **Revert from Installments**
  - [ ] Click "إرجاع من الأقساط" button
  - [ ] Verify confirmation dialog explains action
  - [ ] Confirm revert
  - [ ] Verify sale status changes to "pending"
  - [ ] Verify sale appears in Confirmation page
  - [ ] Verify all installments are removed
  - [ ] Verify all advances are removed
  - [ ] Verify only deposit remains in finance

- [ ] **Cancel Sale**
  - [ ] Click "إلغاء البيع" button
  - [ ] Verify confirmation dialog explains action
  - [ ] Confirm cancellation
  - [ ] Verify sale status changes to "cancelled"
  - [ ] Verify piece status changes to "Available"
  - [ ] Verify all financial records are removed
  - [ ] Verify sale is removed from active lists

- [ ] **Remove Completely**
  - [ ] Click "إزالة كاملة" button
  - [ ] Verify confirmation dialog shows strong warning
  - [ ] Confirm removal
  - [ ] Verify sale is deleted from database
  - [ ] Verify all installments are deleted
  - [ ] Verify piece status changes to "Available"
  - [ ] Verify all financial records are removed

---

### 7. 📝 Contract Writers Page (`/contract-writers`)

**Test Cases:**

- [ ] **View Contract Writers** (if implemented)
  - [ ] View list of contract writers
  - [ ] Create contract writer
  - [ ] Edit contract writer
  - [ ] Delete contract writer
  - [ ] Verify contract writers appear in selection dropdowns

---

## Calculation Testing

### Price Calculation Formulas

#### Full Payment
```
Total Price = max(piece.direct_full_payment_price, surface_m2 × batch.price_per_m2_cash)
Remaining = Total Price - Deposit
```

**Test Cases:**
- [ ] Piece with direct price < batch price (should use direct price)
- [ ] Piece with direct price > batch price (should use direct price)
- [ ] Piece with no direct price (should use batch price)
- [ ] Multiple pieces with different direct prices
- [ ] Deposit = 0
- [ ] Deposit = total price
- [ ] Deposit > total price (should show error)

#### Installment Calculation

**Base Price:**
```
Base Price = surface_m2 × offer.price_per_m2_installment
```

**Advance:**
```
If advance_mode = 'fixed':
  Advance = offer.advance_value
Else if advance_mode = 'percent':
  Advance = Base Price × (offer.advance_value / 100)
```

**Remaining After Advance:**
```
Remaining = Base Price - Advance
```

**Monthly Payment:**
```
If calc_mode = 'monthlyAmount':
  Monthly Payment = offer.monthly_amount
  Number of Months = ceil(Remaining / Monthly Payment)
Else if calc_mode = 'months':
  Number of Months = offer.months
  Monthly Payment = Remaining / Number of Months
```

**After Deposit:**
```
If Deposit >= Advance:
  Advance After Deposit = 0
  Remaining for Installments = Base Price - Deposit
Else:
  Advance After Deposit = Advance - Deposit
  Remaining for Installments = Base Price - Advance
```

**Test Cases:**
- [ ] Advance mode: fixed amount
- [ ] Advance mode: percentage
- [ ] Calculation mode: monthly amount
- [ ] Calculation mode: number of months
- [ ] Deposit = 0
- [ ] Deposit < advance
- [ ] Deposit = advance
- [ ] Deposit > advance
- [ ] Multiple pieces with same offer
- [ ] Verify total installments = monthly payment × months
- [ ] Verify base price + advance + installments = total (approximately)

#### Promise of Sale
```
Total Price = max(piece.direct_full_payment_price, surface_m2 × batch.price_per_m2_cash)
Remaining = Total Price - (Previous Partial Payment + Current Payment)
```

**Test Cases:**
- [ ] Initial promise (no previous payment)
- [ ] Promise with previous partial payment
- [ ] Promise with full payment (completes sale)
- [ ] Verify remaining amount is calculated correctly

### Financial Calculations

#### Finance Page Statistics

**Unpaid Amount:**
```
Sum of amount_due from installment_payments where status != 'paid'
```

**Paid Amount:**
```
Sum of amount_paid from installment_payments where status = 'paid'
```

**Expected This Month:**
```
Sum of amount_due from installment_payments where due_date is in current month
```

**Test Cases:**
- [ ] Verify unpaid excludes deposits, advances, full payments
- [ ] Verify paid excludes deposits, advances, full payments
- [ ] Verify expected includes overdue installments
- [ ] Verify calculations are correct with multiple sales
- [ ] Verify calculations update after payment

---

## User Flow Testing

### Complete Sale Workflow

**Test Flow:**
1. [ ] Create batch with pricing
2. [ ] Add pieces to batch
3. [ ] Select pieces for sale
4. [ ] Search/create client
5. [ ] Enter sale details
6. [ ] Confirm sale
7. [ ] Verify sale appears in Confirmation page
8. [ ] Confirm sale in Confirmation page
9. [ ] Verify sale appears in Sales Records
10. [ ] Verify financial records are created

### Installment Sale Workflow

**Test Flow:**
1. [ ] Create batch with installment offer
2. [ ] Add pieces to batch
3. [ ] Select pieces for sale
4. [ ] Select "Installment" sale type
5. [ ] Select installment offer
6. [ ] Enter deposit
7. [ ] Confirm sale
8. [ ] Verify sale appears in Confirmation page
9. [ ] Confirm sale in Confirmation page
10. [ ] Verify sale appears in Installments page
11. [ ] Verify installment schedule is created
12. [ ] Pay installments
13. [ ] Verify payments are registered

### Promise of Sale Workflow

**Test Flow:**
1. [ ] Create sale with "Promise of Sale" type
2. [ ] Enter deposit
3. [ ] Confirm sale
4. [ ] Verify sale appears in Confirmation page
5. [ ] Make partial payment
6. [ ] Verify remaining amount updates
7. [ ] Make final payment
8. [ ] Verify sale is completed

---

## Edge Cases & Error Handling

### Data Validation

**Test Cases:**
- [ ] Empty required fields
- [ ] Invalid data types (text in number fields)
- [ ] Negative numbers where not allowed
- [ ] Zero values where not allowed
- [ ] Very large numbers (1,000,000+)
- [ ] Special characters in text fields
- [ ] SQL injection attempts (should be handled by Supabase)
- [ ] XSS attempts (should be sanitized)

### Boundary Conditions

**Test Cases:**
- [ ] Maximum number of pieces in batch
- [ ] Maximum number of offers per batch
- [ ] Maximum number of clients
- [ ] Maximum number of sales
- [ ] Very large surface areas (10,000+ m²)
- [ ] Very small surface areas (0.01 m²)
- [ ] Very large prices (1,000,000+ DT)
- [ ] Very small prices (0.01 DT)

### Concurrent Operations

**Test Cases:**
- [ ] Multiple users selling same piece (should be prevented)
- [ ] Editing batch while pieces are being sold
- [ ] Deleting batch while pieces are being sold
- [ ] Confirming sale while it's being edited
- [ ] Paying installment while sale is being reverted

### Network Errors

**Test Cases:**
- [ ] Network timeout during save
- [ ] Network error during load
- [ ] Offline mode (should show error)
- [ ] Slow network (should show loading state)

### Database Errors

**Test Cases:**
- [ ] Foreign key constraint violations
- [ ] Unique constraint violations
- [ ] Database connection errors
- [ ] Transaction rollback scenarios

---

## Data Integrity Testing

### Referential Integrity

**Test Cases:**
- [ ] Delete batch with pieces (should prevent or cascade)
- [ ] Delete client with sales (should prevent or handle)
- [ ] Delete piece with sales (should prevent or handle)
- [ ] Delete offer with sales (should prevent or handle)
- [ ] Delete sale with installments (should cascade)

### Data Consistency

**Test Cases:**
- [ ] Verify piece status matches sale status
- [ ] Verify financial totals match individual records
- [ ] Verify installment totals match sale price
- [ ] Verify deposit + remaining = total price
- [ ] Verify paid installments sum = total paid
- [ ] Verify remaining installments sum = total remaining

### Transaction Integrity

**Test Cases:**
- [ ] Sale creation with piece reservation (atomic)
- [ ] Sale confirmation with financial records (atomic)
- [ ] Installment payment with financial records (atomic)
- [ ] Sale cancellation with cleanup (atomic)
- [ ] Rollback on errors

---

## UI/UX Testing

### Responsive Design

**Test Cases:**
- [ ] Mobile view (320px - 768px)
- [ ] Tablet view (768px - 1024px)
- [ ] Desktop view (1024px+)
- [ ] Verify all dialogs are responsive
- [ ] Verify tables are scrollable on mobile
- [ ] Verify forms are usable on mobile
- [ ] Verify buttons are tappable on mobile

### Accessibility

**Test Cases:**
- [ ] Keyboard navigation works
- [ ] Focus indicators are visible
- [ ] Screen reader compatibility (if applicable)
- [ ] Color contrast meets WCAG standards
- [ ] Text is readable (English numbers in Arabic context)

### User Experience

**Test Cases:**
- [ ] Loading states are shown
- [ ] Error messages are clear and helpful
- [ ] Success messages are shown
- [ ] Confirmations prevent accidental actions
- [ ] Forms validate before submission
- [ ] Auto-save or clear warnings for unsaved changes
- [ ] Breadcrumbs or navigation hints
- [ ] Search/filter functionality (if exists)

### Visual Consistency

**Test Cases:**
- [ ] Consistent button styles
- [ ] Consistent color scheme
- [ ] Consistent spacing
- [ ] Consistent typography
- [ ] Consistent icon usage
- [ ] Consistent badge colors for status

---

## Performance Testing

### Load Testing

**Test Cases:**
- [ ] Load page with 100+ batches
- [ ] Load page with 1000+ pieces
- [ ] Load page with 1000+ clients
- [ ] Load page with 1000+ sales
- [ ] Verify pagination works correctly
- [ ] Verify filtering works correctly
- [ ] Verify sorting works correctly

### Calculation Performance

**Test Cases:**
- [ ] Calculate prices for 100+ pieces
- [ ] Calculate installments for complex offers
- [ ] Verify calculations are fast (< 100ms)
- [ ] Verify UI doesn't freeze during calculations

### Database Performance

**Test Cases:**
- [ ] Query performance with large datasets
- [ ] Index usage (verify indexes exist)
- [ ] N+1 query problems (should be avoided)
- [ ] Connection pooling (handled by Supabase)

---

## Security Testing

### Input Validation

**Test Cases:**
- [ ] SQL injection attempts
- [ ] XSS attempts
- [ ] CSRF protection (if applicable)
- [ ] File upload validation (if applicable)

### Access Control

**Test Cases:**
- [ ] Unauthorized access attempts
- [ ] Role-based access (if implemented)
- [ ] Data isolation (if multi-tenant)

### Data Protection

**Test Cases:**
- [ ] Sensitive data encryption
- [ ] Password security (if applicable)
- [ ] Session management (if applicable)

---

## Known Issues & Improvements

### Critical Issues

- [ ] **Issue 1**: [Description]
  - **Severity**: Critical
  - **Steps to Reproduce**: 
  - **Expected Behavior**: 
  - **Actual Behavior**: 
  - **Fix**: 

### High Priority Issues

- [ ] **Issue 2**: [Description]
  - **Severity**: High
  - **Steps to Reproduce**: 
  - **Expected Behavior**: 
  - **Actual Behavior**: 
  - **Fix**: 

### Medium Priority Issues

- [ ] **Issue 3**: [Description]
  - **Severity**: Medium
  - **Steps to Reproduce**: 
  - **Expected Behavior**: 
  - **Actual Behavior**: 
  - **Fix**: 

### Low Priority Issues / Improvements

- [ ] **Improvement 1**: [Description]
  - **Benefit**: 
  - **Effort**: 

### Feature Requests

- [ ] **Feature 1**: [Description]
  - **Priority**: 
  - **Effort**: 

---

## Testing Checklist Summary

### Pre-Release Checklist

- [ ] All functional tests passed
- [ ] All calculation tests passed
- [ ] All edge cases tested
- [ ] All data integrity tests passed
- [ ] All UI/UX tests passed
- [ ] All performance tests passed
- [ ] All security tests passed
- [ ] All known issues documented
- [ ] All improvements documented
- [ ] Code review completed
- [ ] Documentation updated

### Post-Release Checklist

- [ ] Monitor error logs
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Document new issues
- [ ] Plan next iteration

---

## Notes

### Test Data Setup

Before testing, ensure you have:
- [ ] Test batches with different configurations
- [ ] Test pieces with different statuses
- [ ] Test clients (individual and company)
- [ ] Test sales (pending, completed, cancelled)
- [ ] Test installments (paid, unpaid, overdue)
- [ ] Test financial records

### Test Environment

- [ ] Development database is set up
- [ ] Test data is loaded
- [ ] Browser dev tools are ready
- [ ] Network throttling tools (for performance testing)

### Reporting

After testing, document:
- [ ] Test results (pass/fail)
- [ ] Screenshots of issues
- [ ] Steps to reproduce bugs
- [ ] Suggested improvements
- [ ] Performance metrics

---

**Last Updated**: [Date]
**Tested By**: [Name]
**Version**: [Version Number]

