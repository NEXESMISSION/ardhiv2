import { supabase } from '@/lib/supabase'

export interface ContractWriterCached {
  id: string
  name: string
  type: string
  location?: string | null
}

let cache: ContractWriterCached[] | null = null
let cachePromise: Promise<ContractWriterCached[]> | null = null

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let cacheTime = 0

/** Return cached list if available and fresh (no await). Use for instant dropdown display. */
export function getContractWritersCached(): ContractWriterCached[] | null {
  if (cache !== null && Date.now() - cacheTime < CACHE_TTL_MS) return cache
  return null
}

/** Fetch contract writers, use cache if fresh, otherwise load and cache. */
export async function getContractWriters(): Promise<ContractWriterCached[]> {
  if (cache !== null && Date.now() - cacheTime < CACHE_TTL_MS) return cache
  if (cachePromise) return cachePromise
  cachePromise = (async () => {
    const { data, error } = await supabase
      .from('contract_writers')
      .select('id, name, type, location')
      .order('name', { ascending: true })
    if (error) throw error
    cache = (data || []) as ContractWriterCached[]
    cacheTime = Date.now()
    return cache
  })()
  try {
    return await cachePromise
  } finally {
    cachePromise = null
  }
}

/** Prefetch into cache so dialogs show the dropdown instantly. Call e.g. when Confirmation page mounts. */
export function prefetchContractWriters(): void {
  if (cache !== null && Date.now() - cacheTime < CACHE_TTL_MS) return
  if (cachePromise) return
  getContractWriters().catch(() => {})
}
