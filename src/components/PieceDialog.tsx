import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calculatePiecePrice, formatPrice } from '@/utils/priceCalculator'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert } from './ui/alert'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { ConfirmDialog } from './ui/confirm-dialog'
import { NotificationDialog } from './ui/notification-dialog'

interface LandPiece {
  id: string
  batch_id: string
  piece_number: string
  surface_m2: number
  notes: string | null
  direct_full_payment_price: number | null
  status: string
  created_at: string
  updated_at: string
  availabilityStatus?: {
    isAvailable: boolean
    reason?: string
    status: string
    hasPendingSale: boolean
    hasCompletedSale: boolean
  }
}

interface PieceDialogProps {
  open: boolean
  onClose: () => void
  batchId: string
  batchName: string
  batchPricePerM2: number | null
  batchImageUrl?: string | null
  isOwner?: boolean
  onImageClick?: (imageUrl: string, imageName: string) => void
  onPieceAdded: () => void
  onSellPieces?: (pieces: LandPiece[]) => void
}

const PIECES_PAGE_SIZE = 20

export function PieceDialog({ open, onClose, batchId, batchName, batchPricePerM2, batchImageUrl, isOwner = true, onImageClick, onPieceAdded, onSellPieces }: PieceDialogProps) {
  const [pieces, setPieces] = useState<LandPiece[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedPieces, setSelectedPieces] = useState<Set<string>>(new Set())
  /** Ref kept in sync with selectedPieces so Sell button always uses latest selection (avoids race when user selects then quickly clicks Sell) */
  const selectedPiecesRef = useRef<Set<string>>(new Set())
  // Tracks the last touchend timestamp for synthetic-click suppression
  // (see handleClick / handleTouchEnd below for the why).
  const lastTouchEndRef = useRef(0)
  useEffect(() => {
    selectedPiecesRef.current = selectedPieces
  }, [selectedPieces])
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number; isScrolling?: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LandPiece[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [batchImageLoaded, setBatchImageLoaded] = useState(false)
  const [batchImageUrlKnownNull, setBatchImageUrlKnownNull] = useState(false)
  const [localBatchImageUrl, setLocalBatchImageUrl] = useState<string | null>(null)
  const [localFetchSettled, setLocalFetchSettled] = useState(false)
  /** For reserved pieces: pieceId -> { clientName, paymentMethod } from pending sale */
  const [reservedPieceInfo, setReservedPieceInfo] = useState<Record<string, { clientName: string; paymentMethod: string }>>({})
  /** Bulk-delete confirmation flow. Replaces the per-piece delete button +
   *  native confirm()/alert(). The user selects N pieces from the grid and
   *  hits "حذف المحدّدة" in the top toolbar; this opens a single styled
   *  ConfirmDialog covering the whole batch operation. */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [deletePieceError, setDeletePieceError] = useState<string | null>(null)
  const [deletePieceErrorOpen, setDeletePieceErrorOpen] = useState(false)
  const lastLoadedImageUrlRef = useRef<string | null>(null)
  const currentBatchImageUrlRef = useRef<string | null>(null)
  /** Ordered piece ids for this batch (natural sort: 1,2,3..10,11 and a,a2,b1,b2) so pagination shows correct order */
  const orderedPieceIdsRef = useRef<string[]>([])
  const currentPageRef = useRef(1)
  const piecesListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // Scroll to top of pieces when page changes (better UX: see new page from the top)
  useEffect(() => {
    if (currentPage <= 0) return
    // Scroll the pieces grid to top
    piecesListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    // Also scroll the dialog body to top so user sees top of content (search, then pieces)
    const dialogBody = piecesListRef.current?.closest('.overflow-y-auto')
    if (dialogBody && dialogBody !== piecesListRef.current) {
      dialogBody.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentPage])

  // Form state — pieces only need piece_number + surface_m2 at creation time.
  // Price is set later at sale time (manual per-piece total in MultiPieceSaleDialog).
  // Status defaults to 'Available' and transitions automatically (Reserved/Sold) via the sale flow.
  const [pieceNumber, setPieceNumber] = useState('')
  const [surfaceM2, setSurfaceM2] = useState('')

  // Effective URL: from parent or from our own fetch (fallback when parent hasn't loaded it yet)
  const effectiveBatchImageUrl = batchImageUrl?.trim() || localBatchImageUrl?.trim() || null

  // Reset search and selections when dialog closes (keep lastLoadedImageUrlRef so cache shows instantly next time)
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSearchResults([])
      setSelectedPieces(new Set())
      setBatchImageLoaded(false)
      setBatchImageUrlKnownNull(false)
      setLocalBatchImageUrl(null)
      setLocalFetchSettled(false)
      setReservedPieceInfo({})
    }
  }, [open])

  // Load buyer info for reserved pieces (pending sale: client name + payment method)
  useEffect(() => {
    if (!open || !batchId) return
    const list = searchQuery.trim() ? searchResults : pieces
    const reservedIds = list
      .filter((p) => (p.availabilityStatus?.status || p.status) === 'Reserved')
      .map((p) => p.id)
    if (reservedIds.length === 0) {
      setReservedPieceInfo({})
      return
    }
    let cancelled = false
    supabase
      .from('sales')
      .select('land_piece_id, payment_method, clients:client_id(name)')
      .eq('status', 'pending')
      .in('land_piece_id', reservedIds)
      .then(({ data, error }) => {
        if (cancelled || error) {
          if (error) console.error('Error loading reserved piece sales:', error)
          return
        }
        const map: Record<string, { clientName: string; paymentMethod: string }> = {}
        const paymentMethodLabel = (m: string | null) => {
          if (m === 'full') return 'نقدي'
          if (m === 'installment') return 'تقسيط'
          if (m === 'promise') return 'وعد بالبيع'
          return m || '—'
        }
        ;(data || []).forEach((row: any) => {
          const pieceId = row.land_piece_id
          const client = row.clients
          const name = Array.isArray(client) ? client[0]?.name : client?.name
          map[pieceId] = {
            clientName: name || '—',
            paymentMethod: paymentMethodLabel(row.payment_method),
          }
        })
        if (!cancelled) setReservedPieceInfo(map)
      })
    return () => { cancelled = true }
  }, [open, batchId, pieces, searchResults, searchQuery])

  // When dialog opens with no URL from parent, fetch image_url ourselves so we don't show "لا توجد صورة" when image exists
  useEffect(() => {
    if (!open || !batchId) return
    const fromParent = batchImageUrl?.trim()
    if (fromParent) {
      setLocalBatchImageUrl(null)
      setLocalFetchSettled(true)
      return
    }
    setLocalFetchSettled(false)
    let cancelled = false
    supabase
      .from('land_batches')
      .select('image_url')
      .eq('id', batchId)
      .single()
      .then(
        ({ data, error }) => {
          if (cancelled) return
          if (!error && data?.image_url?.trim()) setLocalBatchImageUrl(data.image_url.trim())
        },
        () => {}, // swallow rejection; PromiseLike has no `.catch`
      )
      .then(() => {
        if (!cancelled) setLocalFetchSettled(true)
      })
    return () => { cancelled = true }
  }, [open, batchId, batchImageUrl])

  // Show "لا توجد صورة للدفعة" only after our fetch has settled and we still have no URL (avoids showing it while fetch in flight)
  useEffect(() => {
    if (!open || effectiveBatchImageUrl) {
      setBatchImageUrlKnownNull(false)
      return
    }
    if (!localFetchSettled) return
    const t = setTimeout(() => setBatchImageUrlKnownNull(true), 400)
    return () => clearTimeout(t)
  }, [open, effectiveBatchImageUrl, localFetchSettled])

  // Batch image: show loading only when URL is new; if same URL already loaded (e.g. from cache), show image immediately. Short timeout so we never stay stuck.
  useEffect(() => {
    const url = effectiveBatchImageUrl
    currentBatchImageUrlRef.current = url
    if (!url) {
      setBatchImageLoaded(false)
      return
    }
    setBatchImageUrlKnownNull(false)
    if (url === lastLoadedImageUrlRef.current) {
      setBatchImageLoaded(true)
      return
    }
    setBatchImageLoaded(false)
    const img = new Image()
    const done = () => {
      if (url !== currentBatchImageUrlRef.current) return
      lastLoadedImageUrlRef.current = url
      setBatchImageLoaded(true)
    }
    img.onload = done
    img.onerror = done
    img.src = url
    const t = setTimeout(() => {
      if (img.complete) done()
    }, 0)
    const fallback = setTimeout(done, 5000)
    return () => {
      clearTimeout(t)
      clearTimeout(fallback)
      img.onload = null
      img.onerror = null
      img.src = ''
    }
  }, [effectiveBatchImageUrl])

  // Load first page when dialog opens; listen for status changes and sale created so list updates without refresh
  useEffect(() => {
    if (open && batchId) {
      setCurrentPage(1)
      setTotalCount(0)
      orderedPieceIdsRef.current = []
      loadPieces(1)

      let refreshTimeout: ReturnType<typeof setTimeout> | null = null
      const debouncedRefresh = (delayMs = 200) => {
        if (refreshTimeout) clearTimeout(refreshTimeout)
        refreshTimeout = setTimeout(() => {
          if (open && batchId) {
            loadPieces(currentPageRef.current)
          }
        }, delayMs)
      }

      const handlePieceStatusChanged = () => {
        debouncedRefresh(200)
      }

      const handleSaleCreated = () => {
        debouncedRefresh(200)
      }

      const handleClearSelections = () => {
        setSelectedPieces(new Set())
      }

      window.addEventListener('pieceStatusChanged', handlePieceStatusChanged)
      window.addEventListener('saleCreated', handleSaleCreated)
      window.addEventListener('clearPieceSelections', handleClearSelections)

      const statusRefreshInterval = setInterval(() => {
        if (open && batchId) {
          loadPieces(currentPageRef.current)
        }
      }, 30000)

      return () => {
        window.removeEventListener('pieceStatusChanged', handlePieceStatusChanged)
        window.removeEventListener('saleCreated', handleSaleCreated)
        window.removeEventListener('clearPieceSelections', handleClearSelections)
        clearInterval(statusRefreshInterval)
        if (refreshTimeout) clearTimeout(refreshTimeout)
      }
    }
  }, [open, batchId])

  // When user types in search, load all pieces in batch in chunks (Supabase .in() has limits), then filter client-side
  const SEARCH_CHUNK_SIZE = 100
  useEffect(() => {
    if (!open || !batchId) return
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    let cancelled = false
    const timeout = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const query = q.toLowerCase()
        const { data: allRows, error: listErr } = await supabase
          .from('land_pieces')
          .select('id, piece_number')
          .eq('batch_id', batchId)
        if (listErr) throw listErr
        if (cancelled || !allRows?.length) {
          setSearchResults([])
          setSearchLoading(false)
          return
        }
        setTotalCount((prev) => (prev === 0 ? allRows.length : prev))
        const sortedRows = [...allRows].sort((a, b) =>
          naturalSort(a.piece_number || '', b.piece_number || '')
        )
        const orderedIds = sortedRows.map((p) => p.id)
        const allFetched: LandPiece[] = []
        for (let i = 0; i < orderedIds.length; i += SEARCH_CHUNK_SIZE) {
          if (cancelled) break
          const chunk = orderedIds.slice(i, i + SEARCH_CHUNK_SIZE)
          const { data: chunkData, error: err } = await supabase
            .from('land_pieces')
            .select('id, batch_id, piece_number, surface_m2, notes, direct_full_payment_price, status, created_at, updated_at')
            .in('id', chunk)
          if (err) throw err
          const orderMap = new Map(chunk.map((id, idx) => [id, i + idx]))
          const sortedChunk = [...(chunkData || [])].sort(
            (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
          )
          allFetched.push(...sortedChunk)
        }
        if (cancelled) return
        const orderMapFull = new Map(orderedIds.map((id, idx) => [id, idx]))
        const sorted = [...allFetched].sort(
          (a, b) => (orderMapFull.get(a.id) ?? 0) - (orderMapFull.get(b.id) ?? 0)
        )
        const withStatus = sorted.map((p) => ({
          ...p,
          availabilityStatus: {
            isAvailable: p.status === 'Available',
            status: p.status,
            hasPendingSale: false,
            hasCompletedSale: false,
          },
        }))
        const filtered = withStatus.filter((piece) => {
          const pieceNumberMatch = piece.piece_number?.toLowerCase().includes(query)
          const surfaceMatch = piece.surface_m2?.toString().includes(query)
          const notesMatch = piece.notes?.toLowerCase().includes(query)
          const statusMatch = piece.status?.toLowerCase().includes(query)
          return pieceNumberMatch || surfaceMatch || notesMatch || statusMatch
        })
        if (cancelled) return
        setSearchResults(filtered)
        if (filtered.length > 0) {
          const ids = filtered.map((p) => p.id)
          Promise.resolve().then(async () => {
            try {
              const { getPiecesAvailabilityStatus } = await import('@/utils/pieceStatus')
              const availabilityMap = await getPiecesAvailabilityStatus(ids)
              setSearchResults((current) =>
                current.map((p) => {
                  const accurateStatus = availabilityMap.get(p.id)
                  if (accurateStatus) return { ...p, availabilityStatus: accurateStatus }
                  return p
                })
              )
            } catch (e) {
              console.error('Error loading availability for search results:', e)
            }
          })
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Error searching pieces:', e)
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [open, batchId, searchQuery])

  // Natural sort function for alphanumeric piece numbers (e.g., "a1", "a2", "a10", "b1", "a1b2")
  function naturalSort(a: string, b: string): number {
    // Handle empty strings
    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1
    
    // Split into alternating letter and number parts
    const aParts = a.match(/([a-zA-Z]+|\d+)/g) || []
    const bParts = b.match(/([a-zA-Z]+|\d+)/g) || []
    
    // Compare part by part
    const maxLength = Math.max(aParts.length, bParts.length)
    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || ''
      const bPart = bParts[i] || ''
      
      // If one part is missing, the shorter string comes first
      if (!aPart) return -1
      if (!bPart) return 1
      
      // Check if both are numbers or both are letters
      const aIsNum = /^\d+$/.test(aPart)
      const bIsNum = /^\d+$/.test(bPart)
      
      if (aIsNum && bIsNum) {
        // Compare as numbers
        const diff = parseInt(aPart, 10) - parseInt(bPart, 10)
        if (diff !== 0) return diff
      } else if (!aIsNum && !bIsNum) {
        // Compare as strings
        const diff = aPart.localeCompare(bPart)
        if (diff !== 0) return diff
      } else {
        // Numbers come before letters
        return aIsNum ? -1 : 1
      }
    }
    
    return 0
  }

  async function loadPieces(page: number = currentPage) {
    const isInitialLoad = pieces.length === 0 || pieces[0]?.batch_id !== batchId
    if (isInitialLoad) {
      setLoading(true)
    }
    try {
      let orderedIds = orderedPieceIdsRef.current

      // Build naturally-ordered id list for this batch once (handles 1,2,3..10,11 and a,a2,b1,b2)
      if (orderedIds.length === 0) {
        const { data: allRows, error: listErr } = await supabase
          .from('land_pieces')
          .select('id, piece_number')
          .eq('batch_id', batchId)

        if (listErr) throw listErr
        if (!allRows || allRows.length === 0) {
          setPieces([])
          setTotalCount(0)
          setLoading(false)
          return
        }

        const sortedRows = [...allRows].sort((a, b) =>
          naturalSort(a.piece_number || '', b.piece_number || '')
        )
        orderedIds = sortedRows.map((p) => p.id)
        orderedPieceIdsRef.current = orderedIds
        setTotalCount(orderedIds.length)
      }

      setCurrentPage(page)

      const start = (page - 1) * PIECES_PAGE_SIZE
      const pageIds = orderedIds.slice(start, start + PIECES_PAGE_SIZE)

      if (pageIds.length === 0) {
        setPieces([])
        setLoading(false)
        return
      }

      const { data: pageData, error: err } = await supabase
        .from('land_pieces')
        .select('id, batch_id, piece_number, surface_m2, notes, direct_full_payment_price, status, created_at, updated_at')
        .in('id', pageIds)

      if (err) throw err
      if (!pageData || pageData.length === 0) {
        setPieces([])
        setLoading(false)
        return
      }

      // Preserve natural order (Supabase .in() does not guarantee order)
      const orderMap = new Map(pageIds.map((id, i) => [id, i]))
      const sorted = [...pageData]
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
        .map((p) => ({
          ...p,
          availabilityStatus: {
            isAvailable: p.status === 'Available',
            status: p.status,
            hasPendingSale: false,
            hasCompletedSale: false,
          },
        }))

      setPieces(sorted)
      setLoading(false)

      // Load availability status for current page only (background)
      Promise.resolve().then(async () => {
        try {
          const { getPiecesAvailabilityStatus } = await import('@/utils/pieceStatus')
          const availabilityMap = await getPiecesAvailabilityStatus(pageIds)
          setPieces((currentPieces) => {
            if (currentPieces.length === 0 || currentPieces[0]?.batch_id !== batchId) {
              return currentPieces
            }
            return currentPieces.map((p) => {
              const accurateStatus = availabilityMap.get(p.id)
              if (accurateStatus && (accurateStatus.status !== (p.availabilityStatus?.status || p.status) || accurateStatus.isAvailable !== p.availabilityStatus?.isAvailable)) {
                return { ...p, availabilityStatus: accurateStatus }
              }
              return p
            })
          })
        } catch (e) {
          console.error('Error loading availability status:', e)
        }
      })
    } catch (e: any) {
      console.error('Error loading pieces:', e)
      setError('فشل تحميل القطع')
      setLoading(false)
    }
  }

  async function handleAddPiece() {
    setError(null)
    setSuccess(null)

    if (!pieceNumber.trim()) {
      setError('رقم القطعة إجباري')
      return
    }

    if (!surfaceM2 || Number(surfaceM2) <= 0) {
      setError('المساحة يجب أن تكون أكبر من صفر')
      return
    }

    setSaving(true)
    try {
      // Check for duplicate piece_number in the same batch
      const { data: existingPiece, error: checkErr } = await supabase
        .from('land_pieces')
        .select('id, piece_number')
        .eq('batch_id', batchId)
        .eq('piece_number', pieceNumber.trim())
        .maybeSingle()

      if (checkErr) {
        throw new Error('فشل التحقق من رقم القطعة. يرجى المحاولة مرة أخرى.')
      }

      if (existingPiece) {
        setError(`رقم القطعة "${pieceNumber.trim()}" موجود بالفعل في هذه الدفعة. يرجى استخدام رقم آخر.`)
        setSaving(false)
        return
      }

      const { error: err } = await supabase.from('land_pieces').insert({
        batch_id: batchId,
        piece_number: pieceNumber.trim(),
        surface_m2: Number(surfaceM2),
        direct_full_payment_price: null,
        notes: null,
        status: 'Available',
      })

      if (err) {
        // Check if error is due to duplicate piece_number (database constraint)
        if (err.code === '23505' || err.message?.includes('unique') || err.message?.includes('duplicate')) {
          setError(`رقم القطعة "${pieceNumber.trim()}" موجود بالفعل في هذه الدفعة. يرجى استخدام رقم آخر.`)
        } else {
          throw err
        }
        return
      }

      setSuccess('تم إضافة القطعة بنجاح')
      setPieceNumber('')
      setSurfaceM2('')
      orderedPieceIdsRef.current = []
      await loadPieces(currentPageRef.current)
      onPieceAdded()
      // Hide form after successful addition
      setTimeout(() => {
        setShowAddForm(false)
        setSuccess(null)
      }, 2000)
    } catch (e: any) {
      setError(e.message || 'خطأ في إضافة القطعة')
    } finally {
      setSaving(false)
    }
  }

  /** Bulk delete: takes the current selection (via ref so we always get the
   *  latest), removes them in a single Supabase call, then reloads. Errors
   *  surface through the styled NotificationDialog instead of alert(). */
  async function confirmBulkDelete() {
    const ids = Array.from(selectedPiecesRef.current)
    if (ids.length === 0) {
      setBulkDeleteOpen(false)
      return
    }
    setDeletingBulk(true)
    try {
      const { error } = await supabase.from('land_pieces').delete().in('id', ids)
      if (error) throw error
      orderedPieceIdsRef.current = []
      setSelectedPieces(new Set())
      await loadPieces(currentPageRef.current)
      onPieceAdded()
      setBulkDeleteOpen(false)
    } catch (e: any) {
      setDeletePieceError('فشل حذف القطع المحدّدة: ' + (e?.message ?? 'خطأ غير معروف'))
      setDeletePieceErrorOpen(true)
    } finally {
      setDeletingBulk(false)
    }
  }

  // When searching, show search results (all matching pieces in batch); otherwise show current page
  const piecesToShow = searchQuery.trim() ? searchResults : pieces
  const totalSurface = piecesToShow.reduce((sum, p) => sum + (p.surface_m2 || 0), 0)
  const isLoadingList = searchQuery.trim() ? searchLoading : loading

  // Calculate piece prices (for both current page and search results)
  const piecePrices = useMemo(() => {
    return piecesToShow.reduce((acc, piece) => {
      const calc = calculatePiecePrice({
        surfaceM2: piece.surface_m2,
        batchPricePerM2: batchPricePerM2,
        pieceDirectPrice: piece.direct_full_payment_price, // Will take priority over batch price
        depositAmount: 0,
      })
      acc[piece.id] = calc
      return acc
    }, {} as Record<string, ReturnType<typeof calculatePiecePrice>>)
  }, [piecesToShow, batchPricePerM2])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`قطع الدفعة: ${batchName}`}
      size="xl"
      // Block stray backdrop clicks / Escape from closing the dialog. The user
      // is in the middle of selecting pieces, adding new ones, or editing
      // prices — losing that on a misclick is a hard failure. Close only
      // happens via the explicit X button in the header.
      disableDismiss
    >
      <div className="space-y-3 sm:space-y-4 lg:space-y-6 flex flex-col h-full">
        {/* Batch Image - Placeholder with loading animation until image is ready */}
        <div 
          className={`mb-3 sm:mb-4 w-full h-48 sm:h-56 lg:h-64 rounded-lg overflow-hidden border-2 border-gray-200 shadow-sm bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center relative ${effectiveBatchImageUrl && onImageClick ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
          onClick={() => {
            if (effectiveBatchImageUrl && onImageClick) {
              onImageClick(effectiveBatchImageUrl, batchName)
            }
          }}
        >
          {effectiveBatchImageUrl && !batchImageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100" aria-hidden>
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                <span className="text-sm text-gray-500">جاري تحميل الصورة...</span>
              </div>
            </div>
          )}
          {!effectiveBatchImageUrl && !batchImageUrlKnownNull && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100" aria-hidden>
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                <span className="text-sm text-gray-500">جاري تحميل الصورة...</span>
              </div>
            </div>
          )}
          {!effectiveBatchImageUrl && batchImageUrlKnownNull && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100" aria-hidden>
              <span className="text-sm text-gray-500">لا توجد صورة للدفعة</span>
            </div>
          )}
          {effectiveBatchImageUrl && (
            <img
              src={effectiveBatchImageUrl}
              alt={batchName}
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover transition-opacity duration-300 ${batchImageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setBatchImageLoaded(true)}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                setBatchImageLoaded(true)
              }}
            />
          )}
        </div>

        {/* Top selection toolbar — owner-only, ONLY the delete action.
            The cancel + sell actions live in the original bottom toolbar (kept
            untouched below). Sticky so it stays visible while scrolling long
            piece lists. */}
        {isOwner && selectedPieces.size > 0 && (
          <div className="sticky top-0 z-20 -mx-1 sm:-mx-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/95 backdrop-blur border border-red-200 shadow-sm flex items-center gap-2 sm:gap-3">
            <span className="text-xs sm:text-sm font-semibold text-red-700 flex-shrink-0">
              {selectedPieces.size} محدّدة
            </span>
            <div className="flex-1" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              className="text-xs sm:text-sm flex-shrink-0 bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
              title="حذف القطع المحدّدة"
            >
              🗑 حذف ({selectedPieces.size})
            </Button>
          </div>
        )}

        {/* Add Piece Form Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
          <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
            القطع {totalCount > 0 ? `(${totalCount})` : ''}
          </h3>
          {isOwner && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowAddForm(!showAddForm)
              if (showAddForm) {
                // Reset form when hiding
                setError(null)
                setSuccess(null)
              }
            }}
            className="text-xs sm:text-sm w-full sm:w-auto"
          >
            {showAddForm ? (
              <>إخفاء نموذج الإضافة</>
            ) : (
              <>+ إضافة قطعة جديدة</>
            )}
          </Button>
          )}
        </div>

        {/* Add Piece Form */}
        {showAddForm && (
          <Card className="p-2 sm:p-3 lg:p-4 bg-blue-50 border-blue-200">
            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-blue-900 mb-2 sm:mb-3 lg:mb-4">إضافة قطعة جديدة</h3>
            
            {error && (
              <div className="mb-4">
                <Alert variant="error">{error}</Alert>
              </div>
            )}

            {success && (
              <div className="mb-4">
                <Alert variant="success">{success}</Alert>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="piece-number" className="text-xs sm:text-sm">رقم القطعة *</Label>
                <Input
                  id="piece-number"
                  value={pieceNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPieceNumber(e.target.value)}
                  placeholder="رقم القطعة"
                  size="sm"
                  className="text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="piece-surface" className="text-xs sm:text-sm">المساحة (م²) *</Label>
                <Input
                  id="piece-surface"
                  type="number"
                  min="0"
                  step="0.01"
                  value={surfaceM2}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSurfaceM2(e.target.value)}
                  placeholder="0.00"
                  size="sm"
                  className="text-xs sm:text-sm"
                />
              </div>

            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={handleAddPiece} disabled={saving}>
                {saving ? 'جاري الإضافة...' : '+ إضافة القطعة'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddForm(false)
                  setError(null)
                  setSuccess(null)
                  setPieceNumber('')
                  setSurfaceM2('')
                }}
              >
                إلغاء
              </Button>
            </div>
          </Card>
        )}

        {/* Pieces List */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search Bar - Always visible at top */}
          <div className="mb-3 sm:mb-4 flex-shrink-0">
            <div className="relative">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="🔍 ابحث عن قطعة (الرقم، المساحة، الملاحظات، الحالة)..."
                className="w-full text-xs sm:text-sm pr-10"
                size="sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="مسح البحث"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4 flex-shrink-0">
            <Badge variant="info" size="sm" className="text-xs sm:text-sm">
              إجمالي المساحة: {totalSurface.toLocaleString()} م²
            </Badge>
            {searchQuery && (
              <Badge variant="secondary" size="sm" className="text-xs sm:text-sm">
                عرض {piecesToShow.length} من {totalCount} قطعة
              </Badge>
            )}
          </div>

          {isLoadingList ? (
            <div className="text-center py-6 sm:py-8 flex-1 flex items-center justify-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : !searchQuery.trim() && pieces.length === 0 ? (
            <p className="text-center text-xs sm:text-sm text-gray-500 py-6 sm:py-8 flex-1 flex items-center justify-center">لا توجد قطع</p>
          ) : searchQuery.trim() && piecesToShow.length === 0 ? (
            <div className="text-center py-6 sm:py-8 flex-1 flex flex-col items-center justify-center">
              <p className="text-xs sm:text-sm text-gray-500 mb-2">
                لا توجد نتائج للبحث عن "{searchQuery}"
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="text-xs sm:text-sm"
              >
                مسح البحث
              </Button>
            </div>
          ) : (
            <div ref={piecesListRef} className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 overflow-y-auto scrollbar-thin min-h-0 content-start">
              {piecesToShow.map((piece, idx) => {
                // Use stable status: prefer availabilityStatus if loaded, otherwise use piece.status
                const displayStatus = piece.availabilityStatus?.status || piece.status
                const isAvailable = piece.availabilityStatus?.isAvailable === true || 
                                  (piece.availabilityStatus === undefined && piece.status === 'Available')
                const isReserved = displayStatus === 'Reserved' || displayStatus === 'reserved'
                const isSold = displayStatus === 'Sold' || displayStatus === 'sold'
                const isSelected = selectedPieces.has(piece.id)
                const canSelect = isAvailable && onSellPieces && !isReserved && !isSold

                const handleTouchStart = (e: React.TouchEvent) => {
                  if (!canSelect) return
                  const touch = e.touches[0]
                  setTouchStart({
                    x: touch.clientX,
                    y: touch.clientY,
                    time: Date.now(),
                    isScrolling: false,
                  })
                }

                const handleTouchMove = (e: React.TouchEvent) => {
                  if (!touchStart || !canSelect) return
                  const touch = e.touches[0]
                  const deltaX = Math.abs(touch.clientX - touchStart.x)
                  const deltaY = Math.abs(touch.clientY - touchStart.y)
                  
                  // If moved more than 5px, it's definitely a scroll
                  if (deltaX > 5 || deltaY > 5) {
                    setTouchStart({ ...touchStart, isScrolling: true })
                  }
                }

                const handleTouchEnd = (e: React.TouchEvent) => {
                  if (!touchStart || !canSelect) return
                  
                  // If we detected scrolling, don't treat as click
                  if (touchStart.isScrolling) {
                    setTouchStart(null)
                    return
                  }
                  
                  const touch = e.changedTouches[0]
                  const deltaX = Math.abs(touch.clientX - touchStart.x)
                  const deltaY = Math.abs(touch.clientY - touchStart.y)
                  const deltaTime = Date.now() - touchStart.time
                  
                  // Increased threshold to 20px and 250ms
                  if (deltaX > 20 || deltaY > 20 || deltaTime > 250) {
                    setTouchStart(null)
                    return
                  }
                  
                  // It's a click, toggle selection - only prevent default at the end
                  e.preventDefault()
                  lastTouchEndRef.current = Date.now()
                  setSelectedPieces((prev) => {
                    const next = new Set(prev)
                    if (next.has(piece.id)) next.delete(piece.id)
                    else next.add(piece.id)
                    return next
                  })
                  setTouchStart(null)
                }

                const handleClick = (_e: React.MouseEvent) => {
                  // Suppress the synthetic click that browsers fire shortly
                  // after touchend — handleTouchEnd already toggled selection
                  // for the touch case. The earlier `e.detail === 0` guard
                  // also blocked keyboard activation (Enter/Space on a
                  // focusable card), so a11y silently broke. Timestamp
                  // window of 500ms covers ghost-click delay across iOS/Android.
                  if (Date.now() - lastTouchEndRef.current < 500) return
                  if (canSelect) {
                    setSelectedPieces((prev) => {
                      const next = new Set(prev)
                      if (next.has(piece.id)) next.delete(piece.id)
                      else next.add(piece.id)
                      return next
                    })
                  }
                }

                return (
                  <Card
                    key={piece.id}
                    className={`relative p-2 sm:p-2.5 lg:p-3 cursor-pointer transition-all flex flex-col ${
                      isReserved
                        ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                        : isSold
                          ? 'bg-gray-50 border-gray-200'
                          : isSelected
                            ? 'bg-blue-50 border-blue-300 border-2'
                            : canSelect
                              ? 'hover:bg-gray-50 hover:border-gray-300'
                              : ''
                    }`}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onClick={handleClick}
                  >
                    <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                      <div className="flex-1 space-y-0.5 sm:space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 lg:gap-2">
                          <Badge variant="default" size="sm" className="text-xs">#{idx + 1}</Badge>
                          <span className="text-xs sm:text-sm font-semibold truncate">القطعة {piece.piece_number}</span>
                          <Badge
                            variant={
                              displayStatus === 'Available' || displayStatus === 'available'
                                ? 'success'
                                : displayStatus === 'Sold' || displayStatus === 'sold'
                                  ? 'default'
                                  : displayStatus === 'Reserved' || displayStatus === 'reserved'
                                    ? 'warning'
                                    : 'warning'
                            }
                            size="sm"
                            className="text-xs"
                          >
                            {displayStatus === 'Available' || displayStatus === 'available' ? 'متاح' :
                             displayStatus === 'Sold' || displayStatus === 'sold' ? 'مباع' :
                             displayStatus === 'Reserved' || displayStatus === 'reserved' ? 'محجوز' :
                             displayStatus}
                          </Badge>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600">
                          المساحة: {piece.surface_m2.toLocaleString()} م²
                          {piecePrices[piece.id] && piecePrices[piece.id].totalPrice > 0 ? (
                            <> · السعر: {formatPrice(piecePrices[piece.id].totalPrice)} DT</>
                          ) : (
                            <> · لا يوجد سعر محدد</>
                          )}
                        </div>
                        {piece.notes && (
                          <p className="text-xs text-gray-500 truncate">📝 {piece.notes}</p>
                        )}
                      </div>
                      {canSelect && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedPieces((prev) => {
                                const next = new Set(prev)
                                if (checked) next.add(piece.id)
                                else next.delete(piece.id)
                                return next
                              })
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0"
                          />
                        </div>
                      )}
                    </div>
                    {isReserved && (
                      <div className="text-xs text-orange-700 mt-1 space-y-0.5">
                        <span className="font-medium">محجوزة</span>
                        {reservedPieceInfo[piece.id] && (
                          <>
                            <div className="text-gray-600">
                              المشتري: <span className="font-medium text-gray-900">{reservedPieceInfo[piece.id].clientName}</span>
                            </div>
                            <div className="text-gray-600">
                              الدفع: <span className="font-medium text-gray-900">{reservedPieceInfo[piece.id].paymentMethod}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {!isAvailable && !isReserved && !isSold && piece.availabilityStatus?.reason && (
                      <span className="text-xs text-gray-500 mt-0.5 block">{piece.availabilityStatus.reason}</span>
                    )}
                    {/* Per-piece delete button removed — use the top
                        selection toolbar (select pieces → "حذف المحدّدة")
                        instead, which is much harder to mis-tap. */}
                  </Card>
                )
              })}
            </div>
          )}

          {!searchQuery.trim() && !loading && pieces.length > 0 && totalCount > PIECES_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 flex-wrap py-3 mt-3 border-t border-gray-200 flex-shrink-0">
              <span className="text-xs text-gray-500 mr-1">
                صفحة {currentPage} من {Math.ceil(totalCount / PIECES_PAGE_SIZE)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => {
                  const prev = currentPage - 1
                  setCurrentPage(prev)
                  loadPieces(prev)
                }}
                className="text-xs"
              >
                السابق
              </Button>
              <span className="flex items-center gap-1 px-2 text-sm text-gray-700">
                {(() => {
                  const totalPages = Math.ceil(totalCount / PIECES_PAGE_SIZE)
                  const pages: (number | 'ellipsis')[] = []
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i)
                  } else {
                    pages.push(1)
                    if (currentPage > 2) pages.push('ellipsis')
                    const mid = [currentPage - 1, currentPage, currentPage + 1].filter(p => p >= 2 && p <= totalPages - 1)
                    mid.forEach(p => { if (!pages.includes(p)) pages.push(p) })
                    if (currentPage < totalPages - 1) pages.push('ellipsis')
                    if (totalPages > 1) pages.push(totalPages)
                  }
                  return (
                    <>
                      {pages.map((p, i) =>
                        p === 'ellipsis' ? (
                          <span key={`e-${i}`} className="px-1">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => {
                              setCurrentPage(p)
                              loadPieces(p)
                            }}
                            disabled={loading}
                            className={`min-w-[28px] h-8 rounded px-2 text-sm font-medium ${
                              currentPage === p
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    </>
                  )
                })()}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= Math.ceil(totalCount / PIECES_PAGE_SIZE)}
                onClick={() => {
                  const next = currentPage + 1
                  setCurrentPage(next)
                  loadPieces(next)
                }}
                className="text-xs"
              >
                التالي
              </Button>
            </div>
          )}

          {/* Sell + Cancel at bottom — kept exactly as before. The top
              toolbar (above) only carries the destructive "Delete" action,
              which is restricted to owners. */}
          {onSellPieces && selectedPieces.size > 0 && (
            <div className="mt-2 sm:mt-3 lg:mt-4 pt-2 sm:pt-3 lg:pt-4 border-t border-gray-200 flex-shrink-0 bg-white sticky bottom-0 z-10">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedPieces(new Set())
                  }}
                  className="flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 border-gray-300 hover:bg-gray-100"
                  title="إلغاء تحديد الكل"
                >
                  ✕ إلغاء الكل
                </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  // Use ref so we always have the latest selection (avoids race when user selects then quickly clicks Sell)
                  const selectedIds = Array.from(selectedPiecesRef.current)
                  if (selectedIds.length === 0) return
                  // Fetch full piece data for ALL selected IDs so we include pieces from every page (not just current page)
                  const { data: fetched, error } = await supabase
                    .from('land_pieces')
                    .select('id, batch_id, piece_number, surface_m2, notes, direct_full_payment_price, status, created_at, updated_at')
                    .in('id', selectedIds)
                    .eq('batch_id', batchId)
                  if (error) {
                    console.error('Failed to load selected pieces for sale', error)
                    return
                  }
                  const withStatus: LandPiece[] = (fetched || []).map((p) => ({
                    ...p,
                    availabilityStatus: {
                      isAvailable: p.status === 'Available',
                      status: p.status,
                      hasPendingSale: false,
                      hasCompletedSale: false,
                    },
                  }))
                  // Preserve selection order
                  const orderMap = new Map(selectedIds.map((id, i) => [id, i]))
                  withStatus.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
                  onSellPieces(withStatus)
                }}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 text-xs sm:text-sm font-semibold py-2 sm:py-2.5"
              >
                بيع ({selectedPieces.size}) قطعة
              </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk delete confirmation — opens from the top selection toolbar */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => { if (!deletingBulk) setBulkDeleteOpen(false) }}
        onConfirm={confirmBulkDelete}
        title="حذف القطع المحدّدة"
        description={`هل أنت متأكد من حذف ${selectedPieces.size} قطعة؟ لا يمكن التراجع.`}
        confirmText="حذف"
        variant="destructive"
        loading={deletingBulk}
      />

      {/* Styled error popup (replaces native window.alert) */}
      <NotificationDialog
        open={deletePieceErrorOpen}
        onClose={() => setDeletePieceErrorOpen(false)}
        type="error"
        title="فشل الحذف"
        message={deletePieceError ?? ''}
      />
    </Dialog>
  )
}

