# Owner Action System

## 🎯 Overview

A comprehensive action system that provides Owner role with special administrative actions across all pages, including cancel, remove, restore, and other critical operations.

## 🔐 Owner-Only Actions

### Core Principles

1. **Owner Exclusive**: Only users with `role === 'Owner'` can see/use these actions
2. **Consistent UI**: Same action button style across all pages
3. **Reversible**: Most actions can be undone (restore)
4. **Audit Trail**: All actions logged for security
5. **Confirmation Required**: Destructive actions require confirmation

## 📋 Action Types

### 1. Cancel Actions
- **Cancel Sale**: Cancel a sale and free up land pieces
- **Cancel Reservation**: Cancel a reservation
- **Cancel Installment**: Cancel an installment payment
- **Cancel Payment**: Cancel a recorded payment

### 2. Remove Actions
- **Remove Sale**: Permanently remove a sale (soft delete)
- **Remove Client**: Remove a client record
- **Remove Payment**: Remove a payment record
- **Remove Installment**: Remove an installment

### 3. Restore Actions
- **Restore Sale**: Restore a cancelled/removed sale
- **Restore Client**: Restore a removed client
- **Restore Payment**: Restore a removed payment
- **Restore Installment**: Restore a removed installment

### 4. Administrative Actions
- **Force Update**: Force update calculations
- **Recalculate**: Recalculate all related values
- **Reset**: Reset to default state
- **Bulk Operations**: Bulk cancel/remove/restore

## 🏗️ Architecture

### Component Structure

```
components/
├── owner-actions/
│   ├── OwnerActionButton.tsx        # Main action button component
│   ├── OwnerActionMenu.tsx          # Dropdown menu for multiple actions
│   ├── CancelAction.tsx             # Cancel action component
│   ├── RemoveAction.tsx             # Remove action component
│   ├── RestoreAction.tsx            # Restore action component
│   └── types.ts                     # Action types
```

### Service Structure

```
services/
├── ownerActionService.ts            # Owner action business logic
│   ├── cancelSale()
│   ├── removeSale()
│   ├── restoreSale()
│   ├── cancelReservation()
│   └── ...
```

## 💻 Implementation

### 1. Owner Action Button Component

```typescript
// components/owner-actions/OwnerActionButton.tsx
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { MoreVertical, Trash2, RotateCcw, X } from 'lucide-react'

interface OwnerActionButtonProps {
  itemId: string
  itemType: 'sale' | 'client' | 'payment' | 'installment' | 'reservation'
  onCancel?: () => void
  onRemove?: () => void
  onRestore?: () => void
  canCancel?: boolean
  canRemove?: boolean
  canRestore?: boolean
  className?: string
}

export function OwnerActionButton({
  itemId,
  itemType,
  onCancel,
  onRemove,
  onRestore,
  canCancel = true,
  canRemove = true,
  canRestore = false,
  className
}: OwnerActionButtonProps) {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'Owner'
  
  if (!isOwner) return null
  
  const [menuOpen, setMenuOpen] = useState(false)
  
  return (
    <div className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMenuOpen(!menuOpen)}
        className="h-8 w-8 p-0"
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      
      {menuOpen && (
        <div className="absolute right-0 top-10 z-50 bg-white border rounded-lg shadow-lg min-w-[150px]">
          {canCancel && onCancel && (
            <button
              onClick={() => {
                onCancel()
                setMenuOpen(false)
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              إلغاء
            </button>
          )}
          
          {canRemove && onRemove && (
            <button
              onClick={() => {
                onRemove()
                setMenuOpen(false)
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </button>
          )}
          
          {canRestore && onRestore && (
            <button
              onClick={() => {
                onRestore()
                setMenuOpen(false)
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-green-600 flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              استعادة
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

### 2. Owner Action Service

```typescript
// services/ownerActionService.ts
import { supabase } from '@/lib/supabase'
import { logAction } from '@/services/auditService'

export class OwnerActionService {
  /**
   * Cancel a sale
   */
  static async cancelSale(saleId: string, reason?: string): Promise<void> {
    // Update sale status
    const { error } = await supabase
      .from('sales')
      .update({
        status: 'Cancelled',
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled by owner'
      })
      .eq('id', saleId)
    
    if (error) throw error
    
    // Free up land pieces
    const { data: sale } = await supabase
      .from('sales')
      .select('land_piece_ids')
      .eq('id', saleId)
      .single()
    
    if (sale?.land_piece_ids) {
      await supabase
        .from('land_pieces')
        .update({ status: 'Available' })
        .in('id', sale.land_piece_ids)
    }
    
    // Log action
    await logAction('cancel_sale', { saleId, reason })
  }
  
  /**
   * Remove a sale (soft delete)
   */
  static async removeSale(saleId: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ 
        status: 'Cancelled',
        deleted_at: new Date().toISOString()
      })
      .eq('id', saleId)
    
    if (error) throw error
    
    await logAction('remove_sale', { saleId })
  }
  
  /**
   * Restore a cancelled/removed sale
   */
  static async restoreSale(saleId: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({
        status: 'Pending',
        deleted_at: null
      })
      .eq('id', saleId)
    
    if (error) throw error
    
    await logAction('restore_sale', { saleId })
  }
  
  // Similar methods for other item types...
}
```

### 3. Usage in Pages

```typescript
// pages/Sales.tsx
import { OwnerActionButton } from '@/components/owner-actions/OwnerActionButton'
import { OwnerActionService } from '@/services/ownerActionService'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

function Sales() {
  const confirmDialog = useConfirmDialog()
  
  const handleCancelSale = async (saleId: string) => {
    const confirmed = await confirmDialog.show({
      title: 'إلغاء البيع',
      description: 'هل أنت متأكد من إلغاء هذا البيع؟',
      confirmText: 'إلغاء البيع',
      variant: 'destructive'
    })
    
    if (confirmed) {
      try {
        await OwnerActionService.cancelSale(saleId)
        // Show success message
      } catch (error) {
        // Show error message
      }
    }
  }
  
  const handleRemoveSale = async (saleId: string) => {
    const confirmed = await confirmDialog.show({
      title: 'حذف البيع',
      description: 'هل أنت متأكد من حذف هذا البيع؟ لا يمكن التراجع عن هذا الإجراء.',
      confirmText: 'حذف',
      variant: 'destructive'
    })
    
    if (confirmed) {
      try {
        await OwnerActionService.removeSale(saleId)
        // Show success message
      } catch (error) {
        // Show error message
      }
    }
  }
  
  return (
    <div>
      {sales.map(sale => (
        <div key={sale.id} className="flex items-center justify-between">
          {/* Sale info */}
          
          <OwnerActionButton
            itemId={sale.id}
            itemType="sale"
            onCancel={() => handleCancelSale(sale.id)}
            onRemove={() => handleRemoveSale(sale.id)}
            canRestore={sale.status === 'Cancelled'}
            onRestore={() => handleRestoreSale(sale.id)}
          />
        </div>
      ))}
    </div>
  )
}
```

## 🎨 UI Design

### Button Placement
- **Location**: Top-right corner of each item card/row
- **Icon**: Three dots (MoreVertical) or specific action icon
- **Style**: Ghost button, subtle, doesn't distract

### Action Menu
- **Style**: Dropdown menu with icons
- **Colors**: 
  - Cancel: Gray/Orange
  - Remove: Red
  - Restore: Green
- **Confirmation**: Required for destructive actions

## 🔒 Security

### Permission Checks
- Server-side validation required
- RLS policies enforce Owner-only access
- Audit logging for all actions

### Database Updates
```sql
-- Add deleted_at column for soft deletes
ALTER TABLE sales ADD COLUMN deleted_at TIMESTAMPTZ;

-- Add restore functionality
CREATE OR REPLACE FUNCTION restore_sale(sale_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE sales
  SET status = 'Pending',
      deleted_at = NULL
  WHERE id = sale_id
    AND deleted_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 📊 Audit Trail

All owner actions are logged:
- Action type (cancel, remove, restore)
- Item type (sale, client, etc.)
- Item ID
- User ID
- Timestamp
- Reason (if provided)

## ✅ Implementation Checklist

- [ ] Create OwnerActionButton component
- [ ] Create OwnerActionService
- [ ] Add to Sales page
- [ ] Add to Clients page
- [ ] Add to Payments page
- [ ] Add to Installments page
- [ ] Add to Reservations page
- [ ] Add confirmation dialogs
- [ ] Add audit logging
- [ ] Add database columns (deleted_at, etc.)
- [ ] Add RLS policies
- [ ] Test all actions
- [ ] Document in user guide

## 🎯 Next Steps

1. Implement OwnerActionButton component
2. Create OwnerActionService
3. Add to all relevant pages
4. Add confirmation dialogs
5. Add audit logging
6. Test thoroughly

