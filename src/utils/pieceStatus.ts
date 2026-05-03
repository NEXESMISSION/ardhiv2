import { supabase } from '@/lib/supabase'

/**
 * Availability status for a piece
 */
export interface PieceAvailabilityStatus {
  isAvailable: boolean
  reason?: string
  status: string
  hasPendingSale: boolean
  hasCompletedSale: boolean
}

/**
 * Get availability status for a single piece
 * A piece is available only if:
 * - status === 'Available' AND
 * - No pending sales exist AND
 * - No completed sales exist
 */
export async function getPieceAvailabilityStatus(
  pieceId: string
): Promise<PieceAvailabilityStatus> {
  try {
    // Get piece status
    const { data: piece, error: pieceError } = await supabase
      .from('land_pieces')
      .select('id, status')
      .eq('id', pieceId)
      .single()

    if (pieceError || !piece) {
      return {
        isAvailable: false,
        reason: 'القطعة غير موجودة',
        status: 'Unknown',
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    // Check for sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('status')
      .eq('land_piece_id', pieceId)
      .in('status', ['pending', 'completed'])

    if (salesError) {
      console.error('Error checking sales for piece:', salesError)
      // If we can't check sales, assume not available for safety
      return {
        isAvailable: false,
        reason: 'خطأ في التحقق من حالة البيع',
        status: piece.status,
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    const hasPendingSale = (sales || []).some((s) => s.status === 'pending')
    const hasCompletedSale = (sales || []).some((s) => s.status === 'completed')

    // Determine availability
    if (hasCompletedSale) {
      return {
        isAvailable: false,
        reason: 'القطعة مبيعة بالفعل',
        status: 'Sold',
        hasPendingSale: false,
        hasCompletedSale: true,
      }
    }

    if (hasPendingSale) {
      return {
        isAvailable: false,
        reason: 'القطعة محجوزة لبيع معلق',
        status: 'Reserved',
        hasPendingSale: true,
        hasCompletedSale: false,
      }
    }

    if (piece.status === 'Sold') {
      return {
        isAvailable: false,
        reason: 'القطعة مبيعة',
        status: 'Sold',
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    if (piece.status === 'Reserved') {
      return {
        isAvailable: false,
        reason: 'القطعة محجوزة',
        status: 'Reserved',
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    if (piece.status === 'Available') {
      return {
        isAvailable: true,
        status: 'Available',
        hasPendingSale: false,
        hasCompletedSale: false,
      }
    }

    // Unknown status
    return {
      isAvailable: false,
      reason: `حالة غير معروفة: ${piece.status}`,
      status: piece.status,
      hasPendingSale: false,
      hasCompletedSale: false,
    }
  } catch (error: any) {
    console.error('Error in getPieceAvailabilityStatus:', error)
    return {
      isAvailable: false,
      reason: 'خطأ في التحقق من حالة القطعة',
      status: 'Unknown',
      hasPendingSale: false,
      hasCompletedSale: false,
    }
  }
}

/**
 * Get availability status for multiple pieces (batch operation)
 * Returns a Map of pieceId -> availability status
 * Optimized to use parallel queries instead of sequential
 */
export async function getPiecesAvailabilityStatus(
  pieceIds: string[]
): Promise<Map<string, PieceAvailabilityStatus>> {
  const statusMap = new Map<string, PieceAvailabilityStatus>()

  if (pieceIds.length === 0) {
    return statusMap
  }

  try {
    // Execute both queries in parallel for better performance
    // Only select minimal fields needed for performance
    const [piecesResult, salesResult] = await Promise.all([
      supabase
        .from('land_pieces')
        .select('id, status')
        .in('id', pieceIds),
      supabase
        .from('sales')
        .select('land_piece_id, status')
        .in('land_piece_id', pieceIds)
        .in('status', ['pending', 'completed'])
        // Limit to only active sales - no need to check cancelled ones
    ])

    const { data: pieces, error: piecesError } = piecesResult
    const { data: sales, error: salesError } = salesResult

    if (piecesError || !pieces) {
      console.error('Error fetching pieces:', piecesError)
      // Return unavailable for all pieces on error
      pieceIds.forEach((id) => {
        statusMap.set(id, {
          isAvailable: false,
          reason: 'خطأ في جلب بيانات القطعة',
          status: 'Unknown',
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      })
      return statusMap
    }

    if (salesError) {
      console.error('Error fetching sales:', salesError)
      // Still process pieces even if sales check fails
    }

    // Group sales by piece_id (optimized with single pass)
    const salesByPiece = new Map<string, { pending: boolean; completed: boolean }>()
    ;(sales || []).forEach((sale) => {
      if (!salesByPiece.has(sale.land_piece_id)) {
        salesByPiece.set(sale.land_piece_id, { pending: false, completed: false })
      }
      const existing = salesByPiece.get(sale.land_piece_id)!
      if (sale.status === 'pending') {
        existing.pending = true
      } else if (sale.status === 'completed') {
        existing.completed = true
      }
    })

    // Determine availability for each piece (optimized single pass)
    pieces.forEach((piece) => {
      const salesInfo = salesByPiece.get(piece.id) || { pending: false, completed: false }

      if (salesInfo.completed) {
        statusMap.set(piece.id, {
          isAvailable: false,
          reason: 'القطعة مبيعة بالفعل',
          status: 'Sold',
          hasPendingSale: false,
          hasCompletedSale: true,
        })
      } else if (salesInfo.pending) {
        statusMap.set(piece.id, {
          isAvailable: false,
          reason: 'القطعة محجوزة لبيع معلق',
          status: 'Reserved',
          hasPendingSale: true,
          hasCompletedSale: false,
        })
      } else if (piece.status === 'Sold') {
        statusMap.set(piece.id, {
          isAvailable: false,
          reason: 'القطعة مبيعة',
          status: 'Sold',
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      } else if (piece.status === 'Reserved') {
        statusMap.set(piece.id, {
          isAvailable: false,
          reason: 'القطعة محجوزة',
          status: 'Reserved',
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      } else if (piece.status === 'Available') {
        statusMap.set(piece.id, {
          isAvailable: true,
          status: 'Available',
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      } else {
        statusMap.set(piece.id, {
          isAvailable: false,
          reason: `حالة غير معروفة: ${piece.status}`,
          status: piece.status,
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      }
    })

    // Handle pieces that weren't found
    pieceIds.forEach((id) => {
      if (!statusMap.has(id)) {
        statusMap.set(id, {
          isAvailable: false,
          reason: 'القطعة غير موجودة',
          status: 'Unknown',
          hasPendingSale: false,
          hasCompletedSale: false,
        })
      }
    })

    return statusMap
  } catch (error: any) {
    console.error('Error in getPiecesAvailabilityStatus:', error)
    // Return unavailable for all pieces on error
    pieceIds.forEach((id) => {
      statusMap.set(id, {
        isAvailable: false,
        reason: 'خطأ في التحقق من حالة القطعة',
        status: 'Unknown',
        hasPendingSale: false,
        hasCompletedSale: false,
      })
    })
    return statusMap
  }
}

