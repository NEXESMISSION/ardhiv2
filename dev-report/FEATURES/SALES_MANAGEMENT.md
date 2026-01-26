# Sales Management Feature

## 🎯 What This Does

Create and manage sales of land pieces to clients.

## 📋 Features

### Client Management
- Create clients
- Edit client details
- View client list
- Search clients

### Sale Creation
- Select client
- Select land pieces
- Choose payment type (Full, Installment, PromiseOfSale)
- Select payment offer
- Set reservation amount
- Calculate totals automatically
- Create sale

### Sale Confirmation
- Confirm pending sale
- Set advance amount
- Set company fee
- Calculate installments
- Set dates
- Finalize sale

### Sale Management
- View all sales
- Filter by status, date, client
- Edit sale (Owner/Workers with permission)
- Cancel sale (Owner only)
- Remove sale (Owner only)
- Restore sale (Owner only)

## 💻 How to Build

### Step 1: Client Management
1. Create `pages/Clients.tsx`
2. Add client creation form
3. Add client list
4. Add search/filter

### Step 2: Sale Creation
1. Create `pages/Sales.tsx`
2. Add sale creation form
3. Use calculation utilities
4. Save to database

### Step 3: Sale Confirmation
1. Create `pages/SaleConfirmation.tsx`
2. Add confirmation form
3. Calculate installments
4. Update sale status

### Step 4: Sale List
1. Add sales list
2. Add filters
3. Add owner actions

## 📝 Database Tables

- `clients` - Stores clients
- `sales` - Stores sales
- `installments` - Stores installment schedule

## ✅ Test Checklist

- [ ] Can create client
- [ ] Can create sale
- [ ] Can confirm sale
- [ ] Can view sales
- [ ] Calculations are correct
- [ ] Owner actions work

## 📚 Reference

- See `REFERENCE/CALCULATIONS.md` for calculations
- See `FEATURES/OWNER_ACTIONS.md` for owner actions
- See `REFERENCE/UI_COMPONENTS.md` for UI components

