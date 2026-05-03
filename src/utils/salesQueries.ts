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
    location,
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
  const row = (arr: any) => Array.isArray(arr) ? arr[0] : arr
  return {
    ...sale,
    client: row(sale.clients),
    piece: row(sale.land_pieces),
    batch: row(sale.land_batches),
    payment_offer: row(sale.payment_offers),
  }
}

/**
 * Format multiple sales and enrich with seller and confirmed_by information
 */
export async function formatSalesWithSellers(sales: any[]): Promise<any[]> {
  const formatted = sales.map((s) => formatSaleData(s))
  const sellerIds = [...new Set(formatted.map((s) => s.sold_by).filter((id): id is string => id != null))]
  const confirmedByIds = [...new Set(formatted.map((s) => s.confirmed_by).filter((id): id is string => id != null))]
  const [sellersMap, confirmersMap] = await Promise.all([
    fetchSellers(sellerIds),
    fetchSellers(confirmedByIds),
  ])
  return formatted.map((s) => {
    if (s.sold_by && sellersMap.has(s.sold_by)) s.seller = sellersMap.get(s.sold_by)
    if (s.confirmed_by && confirmersMap.has(s.confirmed_by)) s.confirmedBy = confirmersMap.get(s.confirmed_by)
    return s
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

