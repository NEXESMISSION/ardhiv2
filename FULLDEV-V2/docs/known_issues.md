## Known Issues & Solutions

### ✅ 1) Orphaned Reservations (FIXED with robust auto-cleanup + transaction-level fix)
**Problem**: Pieces can stay in `Reserved` status without a pending sale (e.g., failed/rolled-back transactions).

**Solution Implemented**:
- ✅ Created `dataIntegrity.ts` utility with `cleanupOrphanedReservations()` function
- ✅ Automatic cleanup runs in background when loading pieces
- ✅ `ensurePieceAvailable()` function with auto-fix before critical operations
- ✅ Periodic cleanup every 30 seconds in Confirmation page
- ✅ Retry logic with exponential backoff for availability checks
- ✅ **NEW**: Transaction-level fix in `reserve_piece` operation - detects and fixes orphaned reservations inside the transaction
- ✅ **NEW**: Retry mechanism inside `reserve_piece` (up to 2 attempts) with status re-check and auto-fix

**Files Modified**:
- `src/utils/dataIntegrity.ts` (new utility file)
- `src/pages/Land.tsx` - uses `ensurePieceAvailable()` with retry
- `src/components/PieceDialog.tsx` - background cleanup
- `src/pages/Confirmation.tsx` - periodic cleanup

---

### ✅ 2) Sale Confirmation Race Conditions (REDUCED with atomic operations)
**Problem**: Sale status can change between check and update, causing "حالة البيع الحالية هي 'مكتمل' وليست 'معلق'" errors.

**Solution Implemented**:
- ✅ Atomic database updates using `.eq('status', 'pending')` optimistic locking
- ✅ Fresh data fetch right before confirmation
- ✅ Removed redundant status checks (rely on atomic DB operations)
- ✅ Added "تحديث القائمة" button in Confirmation page
- ✅ Better error messages with Arabic status translations

**Files Modified**:
- `src/pages/Confirmation.tsx` - atomic updates, fresh data fetch

---

### ✅ 3) Sale Creation Insert Result (FIXED with fallback)
**Problem**: Supabase `.insert().select()` can occasionally return no rows.

**Solution Implemented**:
- ✅ Fallback query to fetch inserted sale by matching criteria
- ✅ Improved validation and error messaging
- ✅ Type conversion for numeric fields
- ✅ Better error logging

**Files Modified**:
- `src/pages/Land.tsx` - fallback fetch logic

---

### ✅ 4) Piece Availability Drift (FIXED with data integrity layer)
**Problem**: UI could show piece as "Available" while DB shows "Reserved".

**Solution Implemented**:
- ✅ `verifyPieceStatusConsistency()` - checks piece status vs sales
- ✅ `fixPieceStatus()` - auto-fixes inconsistencies
- ✅ `ensurePieceAvailable()` - ensures availability with auto-fix
- ✅ Fresh data fetch before critical operations
- ✅ Background cleanup on piece load

**Files Modified**:
- `src/utils/dataIntegrity.ts` - integrity checking functions
- `src/pages/Land.tsx` - uses integrity checks
- `src/components/PieceDialog.tsx` - background cleanup

---

### 🔧 5) Transaction Error Recovery (ENHANCED)
**Problem**: Failed transactions may leave partial state.

**Solution Implemented**:
- ✅ Rollback logic in `executeTransaction()`
- ✅ Retry mechanism with exponential backoff
- ✅ Better error recovery in transaction utils

**Files Modified**:
- `src/utils/transactionUtils.ts` - enhanced rollback
- `src/utils/dataIntegrity.ts` - retry operations

---

## New Robust Features Added

### Data Integrity Utilities (`src/utils/dataIntegrity.ts`)
1. **`cleanupOrphanedReservations()`** - Cleans all orphaned reservations system-wide
2. **`verifyPieceStatusConsistency()`** - Verifies piece status matches its sales
3. **`fixPieceStatus()`** - Auto-fixes piece status inconsistencies
4. **`retryOperation()`** - Retry logic with exponential backoff
5. **`ensurePieceAvailable()`** - Ensures piece is available with auto-fix

### Periodic Maintenance
- Automatic cleanup runs every 30 seconds in Confirmation page
- Background cleanup when loading pieces (non-blocking)
- Auto-fix before critical operations (sale creation, confirmation)

### Error Recovery
- Retry mechanism for transient failures
- Automatic fix of orphaned reservations
- Better error messages with actionable guidance

---

## Testing Recommendations

1. **Test orphaned reservation cleanup**: Create a Reserved piece without sale, verify auto-cleanup
2. **Test race conditions**: Try confirming same sale from multiple tabs
3. **Test retry logic**: Simulate network failures during operations
4. **Test data consistency**: Verify piece status matches sales after operations

---

## Future Enhancements

1. Database-level constraints for piece status consistency
2. Real-time sync using Supabase subscriptions
3. Admin dashboard for data integrity monitoring
4. Automated daily cleanup job
