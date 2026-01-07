# Database Cleanup Script - Instructions

## 📋 What This SQL Script Will Do

### ✅ **KEEP (Preserved Data)**

1. **`land_batches`** - **COMPLETELY PRESERVED** (but offers deleted)
   - All batches kept with all their data:
     - id, name, total_surface, total_cost, date_acquired, notes, etc.
     - All fields remain unchanged

2. **`land_pieces`** - **PARTIALLY PRESERVED**
   - **KEPT Fields:**
     - `id` - Unique identifier
     - `land_batch_id` - Link to batch
     - `piece_number` - Piece number
     - `surface_area` - Surface area in m²
     - `purchase_cost` - Purchase cost
     - `selling_price_full` - Full payment price
     - `selling_price_installment` - Installment price
   
   - **RESET Fields:**
     - `status` → Set to `'Available'`
     - `reserved_until` → Set to `NULL`
     - `reservation_client_id` → Set to `NULL`
     - `notes` → Set to `NULL`
     - `updated_at` → Updated to current timestamp

3. **`users`** - **COMPLETELY PRESERVED**
   - All user accounts remain unchanged

4. **`audit_logs`** - **PRESERVED** (optional deletion available)

---

### ❌ **DELETE (Removed Data)**

1. **Sales & Related Data:**
   - ❌ `sale_rendezvous_history` - All rendezvous history deleted
   - ❌ `sales_history` - All sales history deleted
   - ❌ `sale_rendezvous` - All sale appointments deleted
   - ❌ `installments` - All installment schedules deleted
   - ❌ `payments` - All payment records deleted
   - ❌ `sales` - All sales transactions deleted
   - ❌ `reservations` - All reservations deleted

2. **Clients:**
   - ❌ `clients` - **ALL clients deleted**

3. **Phone Calls:**
   - ❌ `phone_calls` - All phone call appointments deleted

4. **Real Estate Projects:**
   - ❌ `box_expenses` - All box expenses deleted
   - ❌ `project_boxes` - All project boxes deleted
   - ❌ `projects` - All projects deleted

5. **Financial Data:**
   - ❌ `expenses` - All expenses deleted
   - ❌ `debt_payments` - All debt payments deleted (if exists)
   - ❌ `debts` - All debts deleted

---

## 🔄 Execution Order

The script executes in this order to respect foreign key constraints:

1. **History tables** (no dependencies)
2. **Rendezvous** (depends on sales)
3. **Installments** (depends on sales)
4. **Payments** (depends on sales, installments, reservations)
5. **Sales** (depends on clients, reservations)
6. **Reservations** (depends on clients, land_pieces)
7. **Clients** (no dependencies after sales/reservations deleted)
8. **Phone calls** (independent)
9. **Project expenses** → **Project boxes** → **Projects**
10. **Expenses** (independent)
11. **Debt payments** → **Debts**
12. **Clean land_pieces** (reset status and reservation fields)

---

## ⚠️ **IMPORTANT WARNINGS**

1. **This action is IRREVERSIBLE** - Make sure you have a backup!
2. **All sales history will be lost** - No way to recover sales data
3. **All client data will be deleted** - Client information will be permanently removed
4. **All financial records will be deleted** - Payments, installments, expenses, debts
5. **All projects and expenses will be deleted** - Real estate project data will be lost

---

## ✅ **After Execution**

After running the script, you will have:

- ✅ Clean land inventory (all pieces set to "Available")
- ✅ All land batches preserved
- ✅ All land pieces with their numbers, surfaces, and prices
- ✅ No sales, clients, or financial records
- ✅ Fresh start for new sales and clients

---

## 🔍 Verification Queries

The script includes verification queries at the end. Run them to confirm:

1. **Count remaining records** in each table
2. **Check land_pieces status** - Should all be "Available"
3. **Check for any remaining reservations** - Should be 0

---

## 📝 **Usage**

1. **BACKUP YOUR DATABASE FIRST!**
2. Review the script carefully
3. Run in Supabase SQL Editor
4. Check verification queries
5. Verify in your application

---

## 🚨 **Before Running**

Make sure you:
- ✅ Have a database backup
- ✅ Understand all data will be deleted except lands
- ✅ Are ready to start fresh with sales and clients
- ✅ Have reviewed the script

---

**Ready to proceed? Run `clear_database_keep_lands.sql` in Supabase SQL Editor.**

