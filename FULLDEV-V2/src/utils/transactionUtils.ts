// ============================================================================
// TRANSACTIONAL UTILITIES
// ============================================================================

import { supabase } from '@/lib/supabase'

/**
 * Execute multiple database operations in a transaction-like manner
 * Note: Supabase doesn't support true transactions, so we use a best-effort approach
 * with rollback logic on failure
 */
export async function executeTransaction<T>(
  operations: Array<{
    name: string
    execute: () => Promise<any>
    rollback?: () => Promise<void>
  }>
): Promise<{ success: boolean; data?: T; error?: string; failedOperation?: string }> {
  const executedOperations: Array<{ name: string; rollback?: () => Promise<void> }> = []

  try {
    const results: any[] = []

    for (const operation of operations) {
      try {
        const result = await operation.execute()
        results.push(result)
        executedOperations.push({
          name: operation.name,
          rollback: operation.rollback,
        })
      } catch (error: any) {
        // Rollback executed operations
        console.error(`Operation "${operation.name}" failed, rolling back...`, error)

        // Rollback in reverse order
        for (let i = executedOperations.length - 1; i >= 0; i--) {
          const executed = executedOperations[i]
          if (executed.rollback) {
            try {
              await executed.rollback()
              console.log(`Rolled back operation: ${executed.name}`)
            } catch (rollbackError) {
              console.error(`Failed to rollback operation: ${executed.name}`, rollbackError)
            }
          }
        }

        return {
          success: false,
          error: error.message || `Operation "${operation.name}" failed`,
          failedOperation: operation.name,
        }
      }
    }

    return {
      success: true,
      data: results as T,
    }
  } catch (error: any) {
    // Final rollback attempt
    for (let i = executedOperations.length - 1; i >= 0; i--) {
      const executed = executedOperations[i]
      if (executed.rollback) {
        try {
          await executed.rollback()
        } catch (rollbackError) {
          console.error(`Failed to rollback operation: ${executed.name}`, rollbackError)
        }
      }
    }

    return {
      success: false,
      error: error.message || 'Transaction failed',
    }
  }
}

/**
 * Update piece status with optimistic locking
 */
export async function updatePieceStatusWithLock(
  pieceId: string,
  newStatus: string,
  expectedCurrentStatus?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, check current status if expected status is provided
    if (expectedCurrentStatus) {
      const { data: piece, error: fetchError } = await supabase
        .from('land_pieces')
        .select('status')
        .eq('id', pieceId)
        .single()

      if (fetchError) {
        return { success: false, error: `Failed to fetch piece: ${fetchError.message}` }
      }

      if (piece.status !== expectedCurrentStatus) {
        return {
          success: false,
          error: `Piece status mismatch. Expected: ${expectedCurrentStatus}, Actual: ${piece.status}`,
        }
      }
    }

    // Update status
    const { error: updateError } = await supabase
      .from('land_pieces')
      .update({ status: newStatus })
      .eq('id', pieceId)

    if (updateError) {
      return { success: false, error: `Failed to update piece status: ${updateError.message}` }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update piece status' }
  }
}

/**
 * Check if piece is available for sale
 * Returns detailed availability information including orphaned reservations
 */
export async function checkPieceAvailability(
  pieceId: string
): Promise<{ available: boolean; currentStatus?: string; error?: string; hasPendingSale?: boolean }> {
  try {
    const { data: piece, error } = await supabase
      .from('land_pieces')
      .select('status, id')
      .eq('id', pieceId)
      .single()

    if (error) {
      return { available: false, error: `فشل التحقق من القطعة: ${error.message}` }
    }

    if (!piece) {
      return { available: false, error: 'القطعة غير موجودة' }
    }

    // Check if there's already a pending or completed sale for this piece
    const { data: existingSale, error: saleError } = await supabase
      .from('sales')
      .select('id, status')
      .eq('land_piece_id', pieceId)
      .in('status', ['pending', 'completed'])
      .maybeSingle()

    if (saleError) {
      console.error('Error checking existing sale:', saleError)
      // Don't block if we can't check - just warn
    }

    if (existingSale) {
      const statusMap: Record<string, string> = {
        'pending': 'معلق',
        'completed': 'مكتمل'
      }
      const statusText = statusMap[existingSale.status] || existingSale.status
      return {
        available: false,
        currentStatus: piece.status,
        hasPendingSale: existingSale.status === 'pending',
        error: `القطعة لديها بيع ${statusText} بالفعل`,
      }
    }

    // If Reserved but no pending sale, it's an orphaned reservation
    if (piece.status === 'Reserved' && !existingSale) {
      return {
        available: false,
        currentStatus: piece.status,
        hasPendingSale: false,
        error: 'القطعة محجوزة بدون بيع معلق. قد تحتاج إلى تحديث الحالة.',
      }
    }

    return {
      available: piece.status === 'Available',
      currentStatus: piece.status,
      hasPendingSale: false,
    }
  } catch (error: any) {
    return { available: false, error: error.message || 'فشل التحقق من توفر القطعة' }
  }
}

