# Financial Management Feature

## 🎯 What This Does

Track all money: payments received, company fees, installments, and financial reports.

## 📋 Features

### Payment Recording
- Record different payment types:
  - Installment payments
  - Advance payments (big advance)
  - Reservation payments (small advance)
  - Full payments
  - Promise of sale payments
- Link payments to sales/clients
- View payment history

### Installment Management
- View installment schedule
- Record installment payments
- Track payment status
- View overdue installments

### Financial Dashboard
- Total cash received
- Total company fees
- Payment breakdown by type
- Date filters (today, week, month, year, custom)

### Financial Reports
- Daily reports
- Weekly reports
- Monthly reports
- Yearly reports
- Custom date range

## 💻 How to Build

### Step 1: Payment Recording
1. Create payment form
2. Select payment type
3. Link to sale/client
4. Save to database

### Step 2: Installment Schedule
1. Create installments when sale confirmed
2. Display schedule
3. Record payments
4. Update status

### Step 3: Financial Dashboard
1. Create `pages/Financial.tsx`
2. Use calculation utilities
3. Display totals
4. Add date filters

### Step 4: Reports
1. Add report generation
2. Add export functionality
3. Display charts/graphs

## 📝 Database Tables

- `payments` - Stores all payments
- `installments` - Stores installment schedule
- `sales` - Used for financial calculations

## ✅ Test Checklist

- [ ] Can record payments
- [ ] Can view installments
- [ ] Financial totals are correct
- [ ] Date filters work
- [ ] Reports are accurate

## 📚 Reference

- See `REFERENCE/CALCULATIONS.md` for calculations
- See `REFERENCE/UI_COMPONENTS.md` for UI components

