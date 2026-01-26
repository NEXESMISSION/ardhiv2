# Land Management Feature

## 🎯 What This Does

Manage land batches (groups of land) and land pieces (individual plots).

## 📋 Features

### Land Batches
- Create a batch (group of land pieces)
- Edit batch details
- View all batches
- Delete batch (Owner only)

### Land Pieces
- Create pieces in a batch
- Edit piece details
- View all pieces
- Change status (Available, Reserved, Sold, Cancelled)
- Delete piece (Owner only)

### Payment Offers
- Create payment offers for batches or pieces
- Set prices, company fees, advance amounts
- Set monthly payments or number of months
- Mark as default offer

## 💻 How to Build

### Step 1: Create Land Batch Form
1. Create `pages/LandManagement.tsx`
2. Add form to create batch
3. Save to database

### Step 2: Create Land Piece Form
1. Add form to create pieces
2. Link to batch
3. Save to database

### Step 3: Create Payment Offer Form
1. Add form to create offers
2. Link to batch or piece
3. Save to database

### Step 4: Display Lists
1. Show batches list
2. Show pieces list
3. Show offers list

## 📝 Database Tables

- `land_batches` - Stores batches
- `land_pieces` - Stores pieces
- `payment_offers` - Stores offers

## ✅ Test Checklist

- [ ] Can create batch
- [ ] Can create pieces
- [ ] Can create offers
- [ ] Can view lists
- [ ] Can edit items
- [ ] Owner can delete

## 📚 Reference

- See `REFERENCE/DATABASE_SCHEMA.md` for table structure
- See `REFERENCE/CALCULATIONS.md` for price calculations
- See `REFERENCE/UI_COMPONENTS.md` for UI components

