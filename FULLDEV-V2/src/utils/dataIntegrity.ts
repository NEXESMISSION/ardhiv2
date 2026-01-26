// ============================================================================
// DATA INTEGRITY UTILITIES
// ============================================================================

import { supabase } from '@/lib/supabase'

// Global lock to prevent cleanup during active operations
const activeOperationLocks = new Set<string>()

/**
 * Lock a piece ID to prevent cleanup during active operations
 */
export function lockPieceForOperation(pieceId: string): void {
  activeOperationLocks.add(pieceId)
}

/**
 * Unlock a piece ID after operation completes
 */
export function unlockPieceForOperation(pieceId: string): void {
  activeOperationLocks.delete(pieceId)
}

/**
 * Check if a piece is locked for an active operation
 */
export function isPieceLocked(pieceId: string): boolean {
  return activeOperationLocks.has(pieceId)
}

/**
 * Clean up orphaned reservations - pieces that are Reserved but have no pending sale
 * Returns the number of pieces cleaned up
 */
export async function cleanupOrphanedReservations(): Promise<number> {
  try {
    // Find all Reserved pieces
    const { data: reservedPieces, error: piecesError } = await supabase
      .from('land_pieces')
      .select('id, piece_number, status, updated_at')
      .eq('status', 'Reserved')

    if (piecesError) {
      console.error('Error fetching reserved pieces:', piecesError)
      return 0
    }

    if (!reservedPieces || reservedPieces.length === 0) {
      return 0
    }

    let cleanedCount = 0
    const now = Date.now()
    const GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minutes grace period to avoid racing with active reservations

    // Check each reserved piece for pending sales
    for (const piece of reservedPieces) {
      // Skip pieces that are locked for active operations
      if (isPieceLocked(piece.id)) {
        console.log(`Skipping cleanup for piece ${piece.piece_number} - locked for active operation`)
        continue
      }

      // Skip pieces that were recently updated/reserved to avoid racing with in-flight sales
      if (piece.updated_at) {
        const updatedAtMs = new Date(piece.updated_at).getTime()
        if (!Number.isNaN(updatedAtMs) && now - updatedAtMs < GRACE_PERIOD_MS) {
          continue
        }
      }

      const { data: pendingSale, error: saleError } = await supabase
        .from('sales')
        .select('id')
        .eq('land_piece_id', piece.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (saleError) {
        console.error(`Error checking sale for piece ${piece.piece_number}:`, saleError)
        continue
      }

      // If no pending sale exists, this is an orphaned reservation - fix it
      if (!pendingSale) {
        const { error: updateError } = await supabase
          .from('land_pieces')
          .update({ status: 'Available' })
          .eq('id', piece.id)
          .eq('status', 'Reserved')

        if (updateError) {
          console.error(`Error cleaning up piece ${piece.piece_number}:`, updateError)
        } else {
          cleanedCount++
          console.log(`Cleaned up orphaned reservation for piece ${piece.piece_number}`)
        }
      }
    }

    return cleanedCount
  } catch (error: any) {
    console.error('Error in cleanupOrphanedReservations:', error)
    return 0
  }
}

/**
 * Verify piece status consistency - check if piece status matches its sales
 * Returns inconsistencies found
 */
export async function verifyPieceStatusConsistency(pieceId: string): Promise<{
  isConsistent: boolean
  issues: string[]
  recommendedAction?: string
}> {
  const issues: string[] = []

  try {
    // Get piece status
    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('id, status, piece_number')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return {
        isConsistent: false,
        issues: ['القطعة غير موجودة'],
      }
    }

    // Get all sales for this piece
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, status')
      .eq('land_piece_id', pieceId)
      .order('created_at', { ascending: false })

    if (salesError) {
      return {
        isConsistent: false,
        issues: [`خطأ في جلب المبيعات: ${salesError.message}`],
      }
    }

    const pendingSales = (sales || []).filter(s => s.status === 'pending')
    const completedSales = (sales || []).filter(s => s.status === 'completed')

    // Check consistency rules
    if (piece.status === 'Available' && pendingSales.length > 0) {
      issues.push(`القطعة متاحة لكن لديها ${pendingSales.length} بيع معلق`)
      return {
        isConsistent: false,
        issues,
        recommendedAction: 'reserve_piece',
      }
    }

    if (piece.status === 'Reserved' && pendingSales.length === 0) {
      issues.push('القطعة محجوزة لكن لا يوجد بيع معلق')
      return {
        isConsistent: false,
        issues,
        recommendedAction: 'release_piece',
      }
    }

    if (piece.status === 'Sold' && completedSales.length === 0) {
      issues.push('القطعة مبيعة لكن لا يوجد بيع مكتمل')
      return {
        isConsistent: false,
        issues,
        recommendedAction: 'check_sales',
      }
    }

    if (completedSales.length > 1) {
      issues.push(`القطعة لديها ${completedSales.length} بيع مكتمل (يجب أن يكون واحد فقط)`)
      return {
        isConsistent: false,
        issues,
        recommendedAction: 'review_sales',
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues,
    }
  } catch (error: any) {
    return {
      isConsistent: false,
      issues: [`خطأ في التحقق: ${error.message}`],
    }
  }
}

/**
 * Fix piece status based on its sales
 * Returns success status and action taken
 */
export async function fixPieceStatus(pieceId: string): Promise<{
  success: boolean
  action?: string
  error?: string
}> {
  try {
    const verification = await verifyPieceStatusConsistency(pieceId)

    if (verification.isConsistent) {
      return { success: true, action: 'no_action_needed' }
    }

    if (verification.recommendedAction === 'release_piece') {
      const { error } = await supabase
        .from('land_pieces')
        .update({ status: 'Available' })
        .eq('id', pieceId)
        .eq('status', 'Reserved')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, action: 'released_piece' }
    }

    if (verification.recommendedAction === 'reserve_piece') {
      const { error } = await supabase
        .from('land_pieces')
        .update({ status: 'Reserved' })
        .eq('id', pieceId)
        .eq('status', 'Available')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, action: 'reserved_piece' }
    }

    return { success: false, error: 'لا يمكن إصلاح الحالة تلقائياً. يرجى المراجعة اليدوية.' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Don't retry on certain errors
      if (error.message?.includes('غير موجود') || error.message?.includes('not found')) {
        throw error
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt)
        console.log(`Operation failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * Ensure piece is available before operation
 * Automatically fixes orphaned reservations
 */
export async function ensurePieceAvailable(pieceId: string): Promise<{
  available: boolean
  wasFixed: boolean
  error?: string
}> {
  try {
    // First, try to fix any inconsistencies
    const fixResult = await fixPieceStatus(pieceId)

    // Then check availability
    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('id, status')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return {
        available: false,
        wasFixed: fixResult.success,
        error: pieceError?.message || 'القطعة غير موجودة',
      }
    }

    // Check for pending sales
    const { data: pendingSale } = await supabase
      .from('sales')
      .select('id')
      .eq('land_piece_id', pieceId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingSale) {
      return {
        available: false,
        wasFixed: fixResult.success,
        error: 'القطعة محجوزة لبيع معلق',
      }
    }

    return {
      available: piece.status === 'Available',
      wasFixed: fixResult.success && fixResult.action !== 'no_action_needed',
    }
  } catch (error: any) {
    return {
      available: false,
      wasFixed: false,
      error: error.message,
    }
  }
}

/**
 * Get piece status with any pending sale info
 */
export async function getPieceStatusWithPendingSale(
  pieceId: string
): Promise<{
  status?: string
  pendingSaleId?: string
  error?: string
}> {
  try {
    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('id, status')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return { error: pieceError?.message || 'القطعة غير موجودة' }
    }

    const { data: pendingSale } = await supabase
      .from('sales')
      .select('id')
      .eq('land_piece_id', pieceId)
      .eq('status', 'pending')
      .maybeSingle()

    return {
      status: piece.status,
      pendingSaleId: pendingSale?.id,
    }
  } catch (error: any) {
    return { error: error.message || 'فشل جلب حالة القطعة' }
  }
}

/**
 * Get real-time status of a piece by checking both piece table and sales table
 * This ensures the status reflects the actual state in the database
 */
export async function getRealTimePieceStatus(
  pieceId: string
): Promise<{
  status: string
  hasPendingSale: boolean
  hasCompletedSale: boolean
  error?: string
}> {
  try {
    // Get piece status
    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('id, status')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return {
        status: 'Unknown',
        hasPendingSale: false,
        hasCompletedSale: false,
        error: pieceError?.message || 'القطعة غير موجودة',
      }
    }

    // Check for sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, status')
      .eq('land_piece_id', pieceId)
      .in('status', ['pending', 'completed'])

    if (salesError) {
      console.error('Error checking sales for piece:', salesError)
      // Return piece status even if we can't check sales
      return {
        status: piece.status,
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    const hasPendingSale = (sales || []).some((s) => s.status === 'pending')
    const hasCompletedSale = (sales || []).some((s) => s.status === 'completed')

    // Determine real-time status based on sales
    let realTimeStatus = piece.status

    // If there's a completed sale, piece should be Sold
    if (hasCompletedSale) {
      realTimeStatus = 'Sold'
    }
    // If there's a pending sale, piece should be Reserved
    else if (hasPendingSale) {
      realTimeStatus = 'Reserved'
    }
    // If piece is Reserved but no pending sale, it might be orphaned
    // But we'll return the actual piece status and let cleanup handle it
    else if (piece.status === 'Reserved') {
      // Keep Reserved status but mark as potentially orphaned
      realTimeStatus = 'Reserved'
    }
    // Otherwise, use the piece status
    else {
      realTimeStatus = piece.status
    }

    return {
      status: realTimeStatus,
      hasPendingSale,
      hasCompletedSale,
    }
  } catch (error: any) {
    return {
      status: 'Unknown',
      hasPendingSale: false,
      hasCompletedSale: false,
      error: error.message || 'فشل جلب حالة القطعة',
    }
  }
}

/**
 * Get real-time statuses for multiple pieces
 * More efficient than calling getRealTimePieceStatus for each piece
 */
export async function getRealTimePieceStatuses(
  pieceIds: string[]
): Promise<Map<string, { status: string; hasPendingSale: boolean; hasCompletedSale: boolean }>> {
  const statusMap = new Map<string, { status: string; hasPendingSale: boolean; hasCompletedSale: boolean }>()

  try {
    if (pieceIds.length === 0) {
      return statusMap
    }

    // Get all pieces
    const { data: pieces, error: piecesError } = await supabase
      .from('land_pieces')
      .select('id, status')
      .in('id', pieceIds)

    if (piecesError || !pieces) {
      console.error('Error fetching pieces:', piecesError)
      return statusMap
    }

    // Get all sales for these pieces
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, land_piece_id, status')
      .in('land_piece_id', pieceIds)
      .in('status', ['pending', 'completed'])

    if (salesError) {
      console.error('Error fetching sales:', salesError)
      // Still return piece statuses even if we can't check sales
      pieces.forEach((piece) => {
        statusMap.set(piece.id, {
          status: piece.status,
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      })
      return statusMap
    }

    // Group sales by piece_id
    const salesByPiece = new Map<string, { pending: boolean; completed: boolean }>()
    ;(sales || []).forEach((sale) => {
      const existing = salesByPiece.get(sale.land_piece_id) || { pending: false, completed: false }
      if (sale.status === 'pending') {
        existing.pending = true
      } else if (sale.status === 'completed') {
        existing.completed = true
      }
      salesByPiece.set(sale.land_piece_id, existing)
    })

    // Determine real-time status for each piece
    pieces.forEach((piece) => {
      const sales = salesByPiece.get(piece.id) || { pending: false, completed: false }
      let realTimeStatus = piece.status

      // If there's a completed sale, piece should be Sold
      if (sales.completed) {
        realTimeStatus = 'Sold'
      }
      // If there's a pending sale, piece should be Reserved
      else if (sales.pending) {
        realTimeStatus = 'Reserved'
      }
      // Otherwise, use the piece status
      else {
        realTimeStatus = piece.status
      }

      statusMap.set(piece.id, {
        status: realTimeStatus,
        hasPendingSale: sales.pending,
        hasCompletedSale: sales.completed,
      })
    })

    return statusMap
  } catch (error: any) {
    console.error('Error in getRealTimePieceStatuses:', error)
    return statusMap
  }
}

/**
 * Auto-fix orphaned reservation for a single piece
 */
export async function autoFixOrphanedReservation(
  pieceId: string
): Promise<{ fixed: boolean; error?: string }> {
  try {
    // Don't fix if piece is locked for active operation
    if (isPieceLocked(pieceId)) {
      return { fixed: false, error: 'القطعة قيد الاستخدام في عملية نشطة' }
    }

    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('status, id')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return { fixed: false, error: pieceError?.message || 'القطعة غير موجودة' }
    }

    if (piece.status !== 'Reserved') {
      return { fixed: false }
    }

    const { data: pendingSale } = await supabase
      .from('sales')
      .select('id')
      .eq('land_piece_id', pieceId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingSale) {
      return { fixed: false, error: 'القطعة مرتبطة ببيع معلق' }
    }

    const { error: updateError } = await supabase
      .from('land_pieces')
      .update({ status: 'Available' })
      .eq('id', pieceId)
      .eq('status', 'Reserved')

    if (updateError) {
      return { fixed: false, error: updateError.message }
    }

    return { fixed: true }
  } catch (error: any) {
    return { fixed: false, error: error.message }
  }
}

/**
 * Cancel stale/old pending sales for a piece
 * A sale is considered stale if it's older than specified hours (default 1 hour)
 */
export async function cancelStalePendingSales(
  pieceId: string,
  maxAgeHours: number = 1
): Promise<{ cancelled: number; cancelledIds: string[]; error?: string }> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours)

    // Get all pending sales for this piece
    const { data: pendingSales, error: fetchError } = await supabase
      .from('sales')
      .select('id, created_at, status, client_id, land_piece_id, sale_price, deposit_amount, company_fee_amount')
      .eq('land_piece_id', pieceId)
      .eq('status', 'pending')

    if (fetchError) {
      return { cancelled: 0, cancelledIds: [], error: fetchError.message }
    }

    if (!pendingSales || pendingSales.length === 0) {
      return { cancelled: 0, cancelledIds: [] }
    }

    let cancelledCount = 0
    const cancelledIds: string[] = []

    // Import audit log function
    const { logSaleCancellation } = await import('@/utils/auditLog')

    for (const sale of pendingSales) {
      const saleDate = new Date(sale.created_at)
      
      // Cancel if older than maxAgeHours
      if (saleDate < cutoffDate) {
        const { error: cancelError } = await supabase
          .from('sales')
          .update({ status: 'cancelled' })
          .eq('id', sale.id.toString())
          .eq('status', 'pending')

        if (!cancelError) {
          cancelledCount++
          cancelledIds.push(sale.id)
          
          // Log cancellation with audit trail
          await logSaleCancellation(sale.id, {
            client_id: sale.client_id,
            land_piece_id: sale.land_piece_id,
            sale_price: sale.sale_price,
            deposit_amount: sale.deposit_amount || 0,
            company_fee_amount: sale.company_fee_amount,
            status: 'pending',
          })
          
          console.log(`Cancelled stale pending sale ${sale.id.slice(0, 8)} for piece ${pieceId.slice(0, 8)}`)
        }
      }
    }

    // If we cancelled any sales, also fix the piece status
    if (cancelledCount > 0) {
      await autoFixOrphanedReservation(pieceId)
    }

    return { cancelled: cancelledCount, cancelledIds }
  } catch (error: any) {
    return { cancelled: 0, cancelledIds: [], error: error.message }
  }
}

/**
 * Cancel ALL stale pending sales across the entire system
 * This is a global cleanup function that should be run periodically
 * A sale is considered stale if it's older than specified hours (default 1 hour)
 */
export async function cleanupAllStalePendingSales(
  maxAgeHours: number = 1
): Promise<{ cancelled: number; cancelledIds: string[]; affectedPieces: string[]; error?: string }> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours)
    const cutoffISO = cutoffDate.toISOString()

    // Get all stale pending sales across all pieces
    const { data: staleSales, error: fetchError } = await supabase
      .from('sales')
      .select('id, created_at, status, client_id, land_piece_id, sale_price, deposit_amount, company_fee_amount')
      .eq('status', 'pending')
      .lt('created_at', cutoffISO)

    if (fetchError) {
      return { cancelled: 0, cancelledIds: [], affectedPieces: [], error: fetchError.message }
    }

    if (!staleSales || staleSales.length === 0) {
      return { cancelled: 0, cancelledIds: [], affectedPieces: [] }
    }

    let cancelledCount = 0
    const cancelledIds: string[] = []
    const affectedPieceIds = new Set<string>()

    // Import audit log function
    const { logSaleCancellation } = await import('@/utils/auditLog')

    // Cancel all stale sales
    for (const sale of staleSales) {
      const { error: cancelError } = await supabase
        .from('sales')
        .update({ status: 'cancelled' })
        .eq('id', sale.id.toString())
        .eq('status', 'pending')

      if (!cancelError) {
        cancelledCount++
        cancelledIds.push(sale.id)
        affectedPieceIds.add(sale.land_piece_id)
        
        // Log cancellation with audit trail
        await logSaleCancellation(sale.id, {
          client_id: sale.client_id,
          land_piece_id: sale.land_piece_id,
          sale_price: sale.sale_price,
          deposit_amount: sale.deposit_amount || 0,
          company_fee_amount: sale.company_fee_amount,
          status: 'pending',
        })
        
        console.log(`Cancelled stale pending sale ${sale.id.slice(0, 8)} (age: ${Math.round((Date.now() - new Date(sale.created_at).getTime()) / (1000 * 60))} minutes)`)
      }
    }

    // Fix orphaned reservations for all affected pieces
    const affectedPiecesArray = Array.from(affectedPieceIds)
    for (const pieceId of affectedPiecesArray) {
      await autoFixOrphanedReservation(pieceId)
    }

    if (cancelledCount > 0) {
      console.log(`Global cleanup: cancelled ${cancelledCount} stale pending sale(s) affecting ${affectedPiecesArray.length} piece(s)`)
    }

    return { 
      cancelled: cancelledCount, 
      cancelledIds, 
      affectedPieces: affectedPiecesArray 
    }
  } catch (error: any) {
    return { cancelled: 0, cancelledIds: [], affectedPieces: [], error: error.message }
  }
}

/**
 * Claim piece for a new sale or fail with pending sale info
 * Now includes automatic cleanup of stale pending sales
 */
export async function claimPieceOrFail(
  pieceId: string,
  options?: { cancelStaleSales?: boolean; maxStaleAgeHours?: number }
): Promise<{
  success: boolean
  pendingSaleId?: string
  status?: string
  wasFixed?: boolean
  error?: string
}> {
  try {
    // First, optionally cancel stale pending sales (default: yes, cancel sales older than 1 hour)
    if (options?.cancelStaleSales !== false) {
      const staleResult = await cancelStalePendingSales(
        pieceId,
        options?.maxStaleAgeHours || 1
      )
      
      if (staleResult.cancelled > 0) {
        console.log(`Cancelled ${staleResult.cancelled} stale pending sale(s) for piece ${pieceId.slice(0, 8)}`)
      }
    }

    // Fix orphaned reservations
    const fixResult = await autoFixOrphanedReservation(pieceId)

    const statusInfo = await getPieceStatusWithPendingSale(pieceId)
    if (statusInfo.error) {
      return { success: false, error: statusInfo.error }
    }

    if (statusInfo.pendingSaleId) {
      return {
        success: false,
        pendingSaleId: statusInfo.pendingSaleId,
        status: statusInfo.status,
        wasFixed: fixResult.fixed,
        error: `القطعة محجوزة لبيع معلق (${statusInfo.pendingSaleId.slice(0, 8)})`,
      }
    }

    if (statusInfo.status !== 'Available') {
      return {
        success: false,
        status: statusInfo.status,
        wasFixed: fixResult.fixed,
        error: `القطعة غير متاحة. الحالة الحالية: ${statusInfo.status}`,
      }
    }

    return {
      success: true,
      wasFixed: fixResult.fixed,
      status: statusInfo.status,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل التحقق من حالة القطعة' }
  }
}

