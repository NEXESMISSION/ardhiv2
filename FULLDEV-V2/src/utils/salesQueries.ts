import { supabase } from '@/lib/supabase'

/**
 * Seller information interface
 */
export interface Seller {
  id: string
  name: string
  place: string | null
}

/**
 * Standard sale query fields - reusable across all pages
 */
export const SALE_QUERY_FIELDS = `
  *,
  clients:client_id (
    id,
    name,
    id_number,
    phone
  ),
  land_pieces:land_piece_id (
    id,
    piece_number,
    surface_m2
  ),
  land_batches:batch_id (
    id,
    name,
    price_per_m2_cash
  ),
  payment_offers:payment_offer_id (
    id,
    name,
    price_per_m2_installment,
    advance_mode,
    advance_value,
    calc_mode,
    monthly_amount,
    months
  )
`

/**
 * Fetch seller information by user ID
 */
export async function fetchSeller(userId: string | null): Promise<Seller | null> {
  if (!userId) return null
  
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, place')
      .eq('id', userId)
      .single()

    if (error || !data) return null

    return {
      id: data.id,
      name: data.name || 'غير معروف',
      place: data.place,
    }
  } catch (error) {
    console.error('Error fetching seller:', error)
    return null
  }
}

/**
 * Fetch sellers in batch (for multiple sales)
 */
export async function fetchSellers(userIds: string[]): Promise<Map<string, Seller>> {
  const sellersMap = new Map<string, Seller>()
  
  if (userIds.length === 0) return sellersMap

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, place')
      .in('id', [...new Set(userIds)])

    if (error || !data) return sellersMap

    data.forEach((user) => {
      sellersMap.set(user.id, {
        id: user.id,
        name: user.name || 'غير معروف',
        place: user.place,
      })
    })
  } catch (error) {
    console.error('Error fetching sellers:', error)
  }

  return sellersMap
}

/**
 * Format sale data with nested objects (handles Supabase array/object responses)
 */
export function formatSaleData(sale: any): any {
  return {
    ...sale,
    client: Array.isArray(sale.clients) ? sale.clients[0] : sale.clients,
    piece: Array.isArray(sale.land_pieces) ? sale.land_pieces[0] : sale.land_pieces,
    batch: Array.isArray(sale.land_batches) ? sale.land_batches[0] : sale.land_batches,
    payment_offer: Array.isArray(sale.payment_offers) 
      ? sale.payment_offers[0] 
      : sale.payment_offers,
  }
}

/**
 * Format multiple sales and enrich with seller and confirmed_by information
 */
export async function formatSalesWithSellers(sales: any[]): Promise<any[]> {
  // Extract unique seller IDs and confirmed_by IDs
  const sellerIds = sales
    .map(sale => sale.sold_by)
    .filter((id): id is string => id !== null && id !== undefined)
  
  const confirmedByIds = sales
    .map(sale => sale.confirmed_by)
    .filter((id): id is string => id !== null && id !== undefined)

  // Fetch all sellers and confirmers in parallel
  const [sellersMap, confirmersMap] = await Promise.all([
    fetchSellers(sellerIds),
    fetchSellers(confirmedByIds)
  ])

  // Format sales and add seller and confirmed_by information
  return sales.map((sale) => {
    const formatted = formatSaleData(sale)
    if (sale.sold_by && sellersMap.has(sale.sold_by)) {
      formatted.seller = sellersMap.get(sale.sold_by)
    }
    if (sale.confirmed_by && confirmersMap.has(sale.confirmed_by)) {
      formatted.confirmedBy = confirmersMap.get(sale.confirmed_by)
    }
    return formatted
  })
}

/**
 * Standard query builder for sales with all related data
 */
export function buildSaleQuery(additionalFields: string = '') {
  const baseFields = SALE_QUERY_FIELDS
  return additionalFields 
    ? `${baseFields},${additionalFields}` 
    : baseFields
}

