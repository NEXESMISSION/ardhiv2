import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NotificationDialog } from '@/components/ui/notification-dialog'
import { PieceDialog } from '@/components/PieceDialog'
import { ClientSelectionDialog } from '@/components/ClientSelectionDialog'
import { MultiPieceSaleDialog } from '@/components/MultiPieceSaleDialog'
import { PaymentTerms } from '@/utils/paymentTerms'
import { useAuth } from '@/contexts/AuthContext'
import { notifyOwners, notifyCurrentUser } from '@/utils/notifications'
import { formatPrice } from '@/utils/priceCalculator'

// ============================================================================
// TYPES
// ============================================================================

type AdvanceMode = 'fixed' | 'percent'
type InstallmentCalcMode = 'monthlyAmount' | 'months'

interface FullPaymentConfig {
  pricePerM2: number
}

interface InstallmentOffer {
  id: string
  name: string
  pricePerM2: number
  advanceMode: AdvanceMode
  advanceValue: number
  calcMode: InstallmentCalcMode
  monthlyAmount?: number
  months?: number
}

interface LandBatch {
  id: string
  name: string
  location: string | null
  title_reference: string | null
  price_per_m2_cash: number | null
  image_url: string | null
  created_at: string
  updated_at: string
  stats?: {
    totalPieces: number
    soldPieces: number
    reservedPieces: number
    availablePieces: number
    totalSurface: number
  }
}

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandPage() {
  const { systemUser } = useAuth()
  
  // ============================================================================
  // STATE: List View
  // ============================================================================
  const [batches, setBatches] = useState<LandBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // ============================================================================
  // STATE: Stats Animation
  // ============================================================================
  interface LandStats {
    totalPieces: number
    soldPieces: number
    reservedPieces: number
    totalSurface: number
  }
  const [stats, setStats] = useState<LandStats>({
    totalPieces: 0,
    soldPieces: 0,
    reservedPieces: 0,
    totalSurface: 0,
  })
  const [displayedStats, setDisplayedStats] = useState<LandStats>({
    totalPieces: 0,
    soldPieces: 0,
    reservedPieces: 0,
    totalSurface: 0,
  })
  const statsAnimationRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const displayedStatsRef = useRef<LandStats>(displayedStats)

  // ============================================================================
  // STATE: Dialogs
  // ============================================================================
  const [dialogOpen, setDialogOpen] = useState(false)
  const [piecesDialogOpen, setPiecesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pieceDialogOpen, setPieceDialogOpen] = useState(false)
  const [selectedBatchForPieces, setSelectedBatchForPieces] = useState<{ 
    id: string
    name: string
    pricePerM2: number | null
    imageUrl: string | null
  } | null>(null)

  // ============================================================================
  // STATE: Selected Batch (for editing/deleting/viewing pieces)
  // ============================================================================
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [selectedBatchName, setSelectedBatchName] = useState<string>('')
  const [batchPieces, setBatchPieces] = useState<LandPiece[]>([])
  const [loadingPieces, setLoadingPieces] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)

  // ============================================================================
  // STATE: Sale Dialogs
  // ============================================================================
  const [clientSelectionDialogOpen, setClientSelectionDialogOpen] = useState(false)
  const [saleDialogOpen, setSaleDialogOpen] = useState(false)
  const [selectedPiecesForSale, setSelectedPiecesForSale] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  // Ref to track when we're transitioning from client selection to sale dialog
  // This prevents the onClose from clearing state during the transition
  const isTransitioningToSaleRef = useRef(false)

  // DEBUG: Log state changes for sale dialog
  useEffect(() => {
    console.log('=== SALE DIALOG STATE CHANGED ===')
    console.log('selectedBatchForPieces:', selectedBatchForPieces)
    console.log('selectedClient:', selectedClient)
    console.log('saleDialogOpen:', saleDialogOpen)
    console.log('clientSelectionDialogOpen:', clientSelectionDialogOpen)
    console.log('selectedPiecesForSale:', selectedPiecesForSale)
    console.log('Condition check: selectedBatchForPieces && selectedClient =', !!(selectedBatchForPieces && selectedClient))
    console.log('================================')
  }, [selectedBatchForPieces, selectedClient, saleDialogOpen, clientSelectionDialogOpen, selectedPiecesForSale])

  // ============================================================================
  // STATE: Search
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState('')

  // ============================================================================
  // STATE: Image Viewer
  // ============================================================================
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null)
  const [imageZoom, setImageZoom] = useState(1)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // STATE: Form Data
  // ============================================================================
  const [batchName, setBatchName] = useState('')
  const [location, setLocation] = useState('')
  const [titleReference, setTitleReference] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [fullPayment, setFullPayment] = useState<FullPaymentConfig>({
    pricePerM2: 0,
  })
  const [installmentOffers, setInstallmentOffers] = useState<InstallmentOffer[]>([])
  const [newOffer, setNewOffer] = useState<InstallmentOffer>({
    id: 'new',
    name: '',
    pricePerM2: 0,
    advanceMode: 'fixed',
    advanceValue: 0,
    calcMode: 'monthlyAmount',
    monthlyAmount: undefined,
    months: undefined,
  })
  const [addOfferDialogOpen, setAddOfferDialogOpen] = useState(false)

  // ============================================================================
  // STATE: Form Status
  // ============================================================================
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // ============================================================================
  // EFFECTS
  // ============================================================================
  // Handle ESC key to close image viewer
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && imageViewerOpen) {
        setImageViewerOpen(false)
        setViewingImage(null)
        setImageZoom(1)
        setImagePosition({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [imageViewerOpen])

  // Handle wheel event for image zoom (non-passive to allow preventDefault)
  useEffect(() => {
    const container = imageContainerRef.current
    if (!container || !imageViewerOpen) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setImageZoom((prev) => Math.max(0.5, Math.min(5, prev + delta)))
    }

    // Add non-passive event listener
    container.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [imageViewerOpen])

  useEffect(() => {
    // Safety mechanism: ensure loading is cleared after max time
    let safetyTimeout: NodeJS.Timeout | null = null
    
    safetyTimeout = setTimeout(() => {
      console.warn('Safety timeout: forcing loading state to false')
      setLoading(false)
      if (batches.length === 0) {
        setListError('استغرق التحميل وقتاً طويلاً. يرجى المحاولة مرة أخرى أو تحديث الصفحة.')
      }
    }, 16000) // 16 second absolute maximum - increased to match function timeout
    
    loadBatches().then(() => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
        safetyTimeout = null
      }
    }).catch(() => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
        safetyTimeout = null
      }
    })

    // Debounce function to prevent too many refreshes (reduced for faster response)
    let refreshTimeout: NodeJS.Timeout | null = null
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      refreshTimeout = setTimeout(() => {
        loadBatches()
      }, 200) // Reduced to 200ms for faster response
    }

    // Listen for sale and piece status events to refresh data (debounced)
    const handleSaleCreated = () => {
      debouncedRefresh()
    }

    const handleSaleConfirmed = () => {
      debouncedRefresh()
    }

    const handleSaleCancelled = () => {
      debouncedRefresh()
    }

    const handleSaleUpdated = () => {
      debouncedRefresh()
    }

    const handlePieceStatusChanged = () => {
      debouncedRefresh()
      // Only refresh pieces if dialog is actually open
      if (pieceDialogOpen && selectedBatchForPieces) {
        loadPieces(selectedBatchForPieces.id, true).catch(console.error)
      }
    }

    window.addEventListener('saleCreated', handleSaleCreated)
    window.addEventListener('saleConfirmed', handleSaleConfirmed)
    window.addEventListener('saleCancelled', handleSaleCancelled)
    window.addEventListener('saleUpdated', handleSaleUpdated)
    window.addEventListener('pieceStatusChanged', handlePieceStatusChanged as EventListener)

    return () => {
      window.removeEventListener('saleCreated', handleSaleCreated)
      window.removeEventListener('saleConfirmed', handleSaleConfirmed)
      window.removeEventListener('saleCancelled', handleSaleCancelled)
      window.removeEventListener('saleUpdated', handleSaleUpdated)
      window.removeEventListener('pieceStatusChanged', handlePieceStatusChanged as EventListener)
      if (refreshTimeout) clearTimeout(refreshTimeout)
      if (safetyTimeout) clearTimeout(safetyTimeout)
    }
  }, []) // Empty dependencies - only run once on mount

  // Sync ref with current displayed stats
  useEffect(() => {
    displayedStatsRef.current = displayedStats
  }, [displayedStats])

  // Animate stats numbers with count-up effect
  useEffect(() => {
    const animateStat = (key: keyof LandStats, targetValue: number) => {
      const currentValue = displayedStatsRef.current[key]
      if (currentValue === targetValue) return

      // Clear existing animation for this stat
      const existingTimeout = statsAnimationRef.current.get(key)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      const diff = targetValue - currentValue
      const steps = Math.min(Math.abs(diff), 30) // Max 30 steps for smooth animation
      const stepValue = diff / steps
      const duration = 600 // 600ms total
      const stepDuration = duration / steps

      let currentStep = 0
      const animate = () => {
        currentStep++
        const newValue = Math.round(currentValue + (stepValue * currentStep))
        const finalValue = currentStep >= steps ? targetValue : newValue
        
        // Update both state and ref
        displayedStatsRef.current = {
          ...displayedStatsRef.current,
          [key]: finalValue,
        }
        
        setDisplayedStats({
          ...displayedStatsRef.current,
        })

        if (currentStep < steps) {
          const timeout = setTimeout(animate, stepDuration)
          statsAnimationRef.current.set(key, timeout)
        } else {
          statsAnimationRef.current.delete(key)
        }
      }

      animate()
    }

    // Animate each stat
    animateStat('totalPieces', stats.totalPieces)
    animateStat('soldPieces', stats.soldPieces)
    animateStat('reservedPieces', stats.reservedPieces)
    animateStat('totalSurface', stats.totalSurface)

    // Cleanup on unmount
    return () => {
      statsAnimationRef.current.forEach(timeout => clearTimeout(timeout))
      statsAnimationRef.current.clear()
    }
  }, [stats])

  // Separate effect for periodic refresh ONLY when piece dialog is open
  useEffect(() => {
    if (!pieceDialogOpen || !selectedBatchForPieces) return

    // Refresh pieces every 15 seconds (optimized for faster updates)
    const statusRefreshInterval = setInterval(() => {
      if (pieceDialogOpen && selectedBatchForPieces) {
        loadPieces(selectedBatchForPieces.id, true).catch(console.error)
      }
    }, 15000) // Refresh every 15 seconds

    return () => {
      clearInterval(statusRefreshInterval)
    }
  }, [pieceDialogOpen, selectedBatchForPieces?.id]) // Only when dialog is open



  // ============================================================================
  // DATA LOADING FUNCTIONS
  // ============================================================================

  async function loadBatches() {
    // Don't show loading if we already have data (optimistic update)
    const isInitialLoad = batches.length === 0
    if (isInitialLoad) {
      setLoading(true)
    }
    setListError(null)
    
    // Use a flag to track if we're still loading
    let isStillLoading = true
    let timeoutCleared = false
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isStillLoading && !timeoutCleared) {
        console.warn('loadBatches timeout - forcing loading to false')
        setLoading(false)
        setListError('استغرق التحميل وقتاً طويلاً. يرجى المحاولة مرة أخرى أو تحديث الصفحة.')
        // Set empty batches so UI doesn't show "no batches" when there's an error
        if (batches.length === 0) {
          setBatches([])
        }
      }
    }, 8000) // 8 second timeout - reasonable for a simple query
    
    try {
      // Load batches WITHOUT images first (images are large and slow down query)
      // Images will load immediately after in a separate fast query
      let query = supabase
        .from('land_batches')
        .select('id, name, location, price_per_m2_cash, created_at, title_reference, updated_at')
        .order('created_at', { ascending: false })
        .limit(50) // Reduced limit for faster initial load

      // Filter by allowed_batches if user is not owner
      if (systemUser?.role !== 'owner' && systemUser?.allowed_batches && systemUser.allowed_batches.length > 0) {
        query = query.in('id', systemUser.allowed_batches)
      }

      // Execute query directly with optimized settings
      console.log('Starting batches query...')
      const startTime = Date.now()
      
      // Execute query directly - no race condition (simpler and faster)
      const { data, error: err } = await query
      const queryTime = Date.now() - startTime
      console.log(`Batches query completed in ${queryTime}ms`)

      timeoutCleared = true
      clearTimeout(timeoutId) // Clear timeout on success
      isStillLoading = false

      if (err) {
        console.error('Error loading batches:', err)
        setLoading(false)
        setListError(err.message || 'فشل تحميل الدفعات')
        // Keep existing batches if any, otherwise set empty
        if (batches.length === 0) {
          setBatches([])
        }
        return
      }
      
      if (!data || data.length === 0) {
        setBatches([])
        setLoading(false)
        return
      }
      
      // Create batches without images (images load only when opening pieces dialog)
      const batchesWithDefaults = data.map(batch => ({
        ...batch,
        title_reference: batch.title_reference || null,
        image_url: null, // Images not loaded in batch list
        updated_at: batch.updated_at || batch.created_at,
      }))
      
      console.log(`Loaded ${batchesWithDefaults.length} batches`)
      setBatches(batchesWithDefaults)
      setLoading(false)
      
      // Load stats in background (completely non-blocking)
      const batchIdsList = data.map(b => b.id)
      if (batchIdsList.length > 0) {
        // Load stats asynchronously without blocking UI
        const loadStatsAsync = () => {
          loadAllBatchStats(batchIdsList)
            .then(allStats => {
              // Only update if batches haven't changed
              setBatches(currentBatches => {
                const currentIds = new Set(currentBatches.map(b => b.id))
                const statsIds = new Set(batchIdsList)
                
                // Safety check: only update if batch list matches
                if (currentIds.size !== statsIds.size || 
                    ![...currentIds].every(id => statsIds.has(id))) {
                  return currentBatches
                }
                
                // Update batches with stats
                const updatedBatches = currentBatches.map(batch => {
                  const stats = allStats.get(batch.id)
                  if (stats) {
                    return { ...batch, stats }
                  }
                  return batch
                })
                
                // Update stats for animation
                const totalStats: LandStats = {
                  totalPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.totalPieces || 0), 0),
                  soldPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.soldPieces || 0), 0),
                  reservedPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.reservedPieces || 0), 0),
                  totalSurface: updatedBatches.reduce((sum, b) => sum + (b.stats?.totalSurface || 0), 0),
                }
                setStats(totalStats)
                
                return updatedBatches
              })
            })
            .catch(error => {
              console.error('Error loading batch stats (non-critical):', error)
            })
        }

        // Load stats in background with minimal delay (non-blocking)
        // Stats are optional - page works without them
        if (typeof (window as any).requestIdleCallback === 'function') {
          (window as any).requestIdleCallback(loadStatsAsync, { timeout: 500 })
        } else {
          setTimeout(loadStatsAsync, 50) // Very short delay
        }
      }
    } catch (e: any) {
      timeoutCleared = true
      isStillLoading = false
      clearTimeout(timeoutId)
      console.error('Exception loading batches:', e)
      setListError(e.message || 'فشل تحميل الدفعات. تحقق من الاتصال بالإنترنت.')
      setLoading(false)
      // Keep existing batches if any, otherwise set empty
      if (batches.length === 0) {
        setBatches([])
      }
    }
  }

  // Ultra-optimized: Load stats using single aggregated query (FASTEST)
  async function loadAllBatchStats(batchIds: string[]): Promise<Map<string, any>> {
    const statsMap = new Map<string, any>()
    
    if (batchIds.length === 0) return statsMap
    
    // Initialize all batches with zero stats first
    batchIds.forEach(batchId => {
      statsMap.set(batchId, {
        totalPieces: 0,
        soldPieces: 0,
        reservedPieces: 0,
        availablePieces: 0,
        totalSurface: 0,
      })
    })
    
    try {
      // Fetch pieces for each batch separately to ensure accuracy (parallel queries)
      // This is more reliable than a single query with limit
      const statsPromises = batchIds.map(async (batchId) => {
        try {
          const { data: pieces, error: piecesErr } = await Promise.race([
            supabase
              .from('land_pieces')
              .select('id, status, surface_m2')
              .eq('batch_id', batchId),
            new Promise<any>((_, reject) => 
              setTimeout(() => reject(new Error('Stats query timeout')), 3000)
            )
          ]) as any

          if (piecesErr) {
            console.error(`Error loading pieces for batch ${batchId}:`, piecesErr)
            return { batchId, stats: null }
          }

          if (!pieces || pieces.length === 0) {
            return { 
              batchId, 
              stats: {
                totalPieces: 0,
                soldPieces: 0,
                reservedPieces: 0,
                availablePieces: 0,
                totalSurface: 0,
              }
            }
          }

          // Calculate stats for this batch
          const totalPieces = pieces.length
          const soldPieces = pieces.filter((p: any) => p.status === 'Sold').length
          const reservedPieces = pieces.filter((p: any) => p.status === 'Reserved').length
          const availablePieces = pieces.filter((p: any) => p.status === 'Available').length
          const totalSurface = pieces.reduce((sum: number, p: any) => sum + (Number(p.surface_m2) || 0), 0)

          return {
            batchId,
            stats: {
              totalPieces,
              soldPieces,
              reservedPieces,
              availablePieces,
              totalSurface,
            }
          }
        } catch (error: any) {
          console.error(`Error loading stats for batch ${batchId}:`, error)
          return { batchId, stats: null }
        }
      })

      // Wait for all stats (with overall timeout)
      const statsResults = await Promise.race([
        Promise.all(statsPromises),
        new Promise<any[]>((resolve) => {
          setTimeout(() => {
            console.warn('Stats loading timeout - using partial results')
            resolve([])
          }, 8000) // 8 second overall timeout
        })
      ])

      // Update stats map with results
      statsResults.forEach(({ batchId, stats }) => {
        if (stats) {
          statsMap.set(batchId, stats)
        }
      })

      console.log('Stats calculated:', {
        batchesProcessed: statsResults.length,
        totalBatches: batchIds.length,
        sampleBatch: batchIds[0],
        sampleStats: statsMap.get(batchIds[0])
      })
    } catch (e: any) {
      console.error('Error loading batch stats:', e)
      // Stats are already initialized with zeros, so just return them
    }
    
    return statsMap
  }

  // Keep old function for backward compatibility (if needed elsewhere)
  async function loadBatchStats(batchId: string) {
    const statsMap = await loadAllBatchStats([batchId])
    return statsMap.get(batchId) || {
      totalPieces: 0,
      soldPieces: 0,
      reservedPieces: 0,
      availablePieces: 0,
      totalSurface: 0,
    }
  }

  // Enhanced natural sort function for alphanumeric piece numbers
  // Handles: 1,2,3 or a1,a2,b2 or A1-B2-C3 or complex patterns with special characters
  function naturalSort(a: string, b: string): number {
    // Handle null/undefined/empty
    if (!a && !b) return 0
    if (!a || a.trim() === '') return 1
    if (!b || b.trim() === '') return -1
    
    // Normalize: trim, lowercase, and handle special characters
    const normalize = (str: string) => str.trim().toLowerCase().replace(/[^\w\d]/g, ' ')
    const aStr = normalize(a)
    const bStr = normalize(b)
    
    // Split into alternating letter and number parts (handles complex patterns)
    const aParts = aStr.match(/([a-zA-Z]+|\d+|[^\s]+)/g) || []
    const bParts = bStr.match(/([a-zA-Z]+|\d+|[^\s]+)/g) || []
    
    // Compare part by part
    const maxLength = Math.max(aParts.length, bParts.length)
    
    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || ''
      const bPart = bParts[i] || ''
      
      // If one part is missing, the shorter string comes first
      if (!aPart && !bPart) continue
      if (!aPart) return -1
      if (!bPart) return 1
      
      // Check if parts are numbers, letters, or mixed
      const aIsNum = /^\d+$/.test(aPart)
      const bIsNum = /^\d+$/.test(bPart)
      const aHasNum = /\d/.test(aPart)
      const bHasNum = /\d/.test(bPart)
      
      if (aIsNum && bIsNum) {
        // Both are pure numbers - compare numerically (handles leading zeros)
        const aNum = parseInt(aPart, 10)
        const bNum = parseInt(bPart, 10)
        const diff = aNum - bNum
        if (diff !== 0) return diff
        // If numbers are equal, compare by string length (1 < 01 < 001)
        if (aPart.length !== bPart.length) {
          return aPart.length - bPart.length
        }
      } else if (aHasNum && bHasNum) {
        // Both have numbers but are mixed - extract and compare numbers first
        const aNumMatch = aPart.match(/\d+/)
        const bNumMatch = bPart.match(/\d+/)
        if (aNumMatch && bNumMatch) {
          const aNum = parseInt(aNumMatch[0], 10)
          const bNum = parseInt(bNumMatch[0], 10)
          if (aNum !== bNum) return aNum - bNum
        }
        // If numbers are equal, compare as strings
        const diff = aPart.localeCompare(bPart, undefined, { numeric: true, sensitivity: 'base' })
        if (diff !== 0) return diff
      } else if (aIsNum) {
        // a is number, b is not - numbers come before letters
        return -1
      } else if (bIsNum) {
        // b is number, a is not - numbers come before letters
        return 1
      } else {
        // Both are strings (letters or mixed without numbers) - compare alphabetically
        const diff = aPart.localeCompare(bPart, undefined, { numeric: true, sensitivity: 'base' })
        if (diff !== 0) return diff
      }
    }
    
    // If all parts are equal, compare original strings (case-insensitive)
    return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
  }

  async function loadPieces(batchId: string, needAvailabilityStatus: boolean = false) {
    // Don't show loading if we already have data for this batch
    const isInitialLoad = batchPieces.length === 0 || batchPieces[0]?.batch_id !== batchId
    if (isInitialLoad) {
    setLoadingPieces(true)
    }
    try {
      // Load pieces first (fast, no availability check)
      const { data, error } = await supabase
        .from('land_pieces')
        .select('id, batch_id, piece_number, surface_m2, notes, direct_full_payment_price, status, created_at, updated_at')
        .eq('batch_id', batchId)
        .limit(1000) // Limit for performance

      if (error) throw error

      if (!data || data.length === 0) {
        setBatchPieces([])
        setLoadingPieces(false)
        return
      }

      // Show pieces IMMEDIATELY without sorting (fastest possible)
      setBatchPieces(data)
      setLoadingPieces(false)
      
      // Sort in background using microtask (non-blocking)
      Promise.resolve().then(() => {
        const sortedPieces = [...data].sort((a, b) => 
          naturalSort(a.piece_number || '', b.piece_number || '')
        )
        
        // Update with sorted pieces only if still viewing same batch
        setBatchPieces(currentPieces => {
          if (currentPieces.length === 0 || currentPieces[0]?.batch_id !== batchId) {
            return currentPieces
          }
          return sortedPieces
        })
      })
      
      // Load availability status ONLY if explicitly needed (completely separate, non-blocking)
      if (data.length > 0 && needAvailabilityStatus) {
        // Use requestIdleCallback or setTimeout for lowest priority
        const loadAvailability = async () => {
          try {
            const { getPiecesAvailabilityStatus } = await import('@/utils/pieceStatus')
            const pieceIds = data.map((p: any) => p.id)
            const availabilityMap = await getPiecesAvailabilityStatus(pieceIds)
            
            // Update pieces with availability status
            setBatchPieces(currentPieces => {
              if (currentPieces.length === 0 || currentPieces[0]?.batch_id !== batchId) {
                return currentPieces
              }
              
              return currentPieces.map((p: any) => {
                const availabilityStatus = availabilityMap.get(p.id)
                if (availabilityStatus) {
                  return { ...p, availabilityStatus }
                }
                return p
              })
            })
          } catch (e) {
            console.error('Error loading availability status:', e)
          }
        }
        
        // Use requestIdleCallback if available, otherwise setTimeout
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadAvailability, { timeout: 2000 })
        } else {
          setTimeout(loadAvailability, 100)
        }
      }
    } catch (e: any) {
      console.error('Error loading pieces:', e)
      setBatchPieces([])
      setLoadingPieces(false)
    }
  }

  async function loadOffersForBatch(batchId: string) {
    try {
      const { data: offers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('batch_id', batchId)
        .is('land_piece_id', null)

      if (offers) {
        setInstallmentOffers(
          offers.map((o: any) => ({
            id: o.id,
            name: o.name || '',
            pricePerM2: o.price_per_m2_installment || 0,
            advanceMode: o.advance_mode as AdvanceMode,
            advanceValue: o.advance_value || 0,
            calcMode: o.calc_mode as InstallmentCalcMode,
            monthlyAmount: o.monthly_amount || undefined,
            months: o.months || undefined,
          })),
        )
      } else {
        setInstallmentOffers([])
      }
      } catch (e: any) {
        console.error('Error loading offers:', e)
        setInstallmentOffers([])
      }
  }

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================

  function openCreateDialog() {
    resetForm()
    setEditingBatchId(null)
    setDialogOpen(true)
  }

  async function openEditDialog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId)
    if (!batch) return

    setEditingBatchId(batchId)
    setBatchName(batch.name)
    setLocation(batch.location || '')
    setTitleReference(batch.title_reference || '')
    setImageFile(null)
    setImagePreview(batch.image_url || null)
    setFullPayment({
      pricePerM2: batch.price_per_m2_cash || 0,
    })

    await loadOffersForBatch(batchId)
    setDialogOpen(true)
  }

  async function openPiecesDialog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId)
    if (!batch) return

    // Fetch batch image directly from database when opening dialog
    let imageUrl: string | null = null
    try {
      const { data: imageData, error: imageErr } = await supabase
        .from('land_batches')
        .select('image_url')
        .eq('id', batchId)
        .single()
      
      if (!imageErr && imageData?.image_url) {
        imageUrl = imageData.image_url
      }
    } catch (err) {
      console.error('Error loading batch image:', err)
    }

    setSelectedBatchForPieces({ 
      id: batchId, 
      name: batch.name,
      pricePerM2: batch.price_per_m2_cash,
      imageUrl: imageUrl
    })
    setPieceDialogOpen(true)
  }


  async function openDeleteDialog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId)
    if (!batch) return

    setBatchToDelete(batchId)
    setSelectedBatchName(batch.name)
    await loadPieces(batchId)
    setDeleteConfirmOpen(true)
    }

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  function resetForm() {
    setBatchName('')
    setLocation('')
    setTitleReference('')
    setImageFile(null)
    setImagePreview(null)
    setFullPayment({ pricePerM2: 0 })
    setInstallmentOffers([])
    setNewOffer({
      id: 'new',
      name: '',
      pricePerM2: 0,
      advanceMode: 'fixed',
      advanceValue: 0,
      calcMode: 'monthlyAmount',
      monthlyAmount: undefined,
      months: undefined,
    })
    setError(null)
    setSuccess(null)
  }

  async function handleSaveBatch() {
    setError(null)
    setSuccess(null)

    if (!batchName.trim()) {
      setError('اسم الأرض إجباري')
      return
    }

    setSaving(true)
    try {
      if (editingBatchId) {
        // Update existing batch
        await updateBatch(editingBatchId)
        setSuccess('تم تحديث الدفعة بنجاح')
      } else {
        // Create new batch
        await createBatch()
        setSuccess('تم إنشاء الدفعة بنجاح')
      }

      setTimeout(() => {
        setDialogOpen(false)
        resetForm()
        // Trigger refresh event (debounced in useEffect)
        window.dispatchEvent(new CustomEvent('saleUpdated'))
      }, 1500)
    } catch (e: any) {
      setError(e.message || 'خطأ غير متوقع')
    } finally {
      setSaving(false)
    }
  }

  async function updateBatch(batchId: string) {
    let finalImageUrl = imagePreview

    // Convert image to base64 if a new file is selected
    if (imageFile) {
      setUploadingImage(true)
      try {
        // Convert image to base64 for storage in database
        // This avoids RLS issues with Supabase Storage
        const reader = new FileReader()
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            resolve(reader.result as string)
          }
          reader.onerror = reject
          reader.readAsDataURL(imageFile)
        })
      } catch (e: any) {
        console.error('Error processing image:', e)
        // Continue with existing image or preview
        finalImageUrl = imagePreview
      } finally {
        setUploadingImage(false)
      }
    }

    // Update batch info
        const { error: batchError } = await supabase
          .from('land_batches')
          .update({
            name: batchName.trim(),
            location: location.trim() || null,
            title_reference: titleReference.trim() || null,
            image_url: finalImageUrl || null,
            price_per_m2_cash: fullPayment.pricePerM2 || null,
            updated_at: new Date().toISOString(),
          })
      .eq('id', batchId)

        if (batchError) throw batchError


        // Delete existing offers and recreate
    await supabase.from('payment_offers').delete().eq('batch_id', batchId).is('land_piece_id', null)

        const offersPayload = installmentOffers.map((offer) => ({
      batch_id: batchId,
          name: offer.name || null,
          price_per_m2_installment: offer.pricePerM2 || null,
          advance_mode: offer.advanceMode,
          advance_value: offer.advanceValue || 0,
          calc_mode: offer.calcMode,
          monthly_amount: offer.calcMode === 'monthlyAmount' ? offer.monthlyAmount || null : null,
          months: offer.calcMode === 'months' ? offer.months || null : null,
        }))

        if (offersPayload.length > 0) {
          const { error: offersError } = await supabase.from('payment_offers').insert(offersPayload)
          if (offersError) throw offersError
    }
        }

  async function createBatch() {
        // Validate required fields
        if (!batchName || !batchName.trim()) {
          throw new Error('اسم الأرض مطلوب')
        }

        // Prepare insert data
        const insertData: any = {
            name: batchName.trim(),
        }

        // Add optional fields only if they have values
        if (location && typeof location === 'string' && location.trim()) {
          insertData.location = location.trim()
        } else {
          insertData.location = null
        }

        if (titleReference && typeof titleReference === 'string' && titleReference.trim()) {
          insertData.title_reference = titleReference.trim()
        } else {
          insertData.title_reference = null
        }

        if (fullPayment.pricePerM2 && fullPayment.pricePerM2 > 0) {
          insertData.price_per_m2_cash = fullPayment.pricePerM2
        } else {
          insertData.price_per_m2_cash = null
        }

        let { data: batch, error: batchError } = await supabase
          .from('land_batches')
          .insert(insertData)
          .select('id')
          .single()

        if (batchError) {
          console.error('Batch creation error:', batchError)
          // Provide more detailed error message
          if (batchError.code === '23505') {
            throw new Error('اسم الدفعة موجود بالفعل. يرجى اختيار اسم آخر.')
          } else if (batchError.code === '23502') {
            throw new Error('حقل مطلوب مفقود: ' + (batchError.message || 'خطأ في البيانات'))
          } else {
            throw new Error(`فشل إنشاء الدفعة: ${batchError.message || 'خطأ غير معروف'}`)
          }
        }

        if (!batch || !batch.id) {
          console.warn('Batch creation succeeded but no data returned, trying fallback query...')
          // Wait a bit for database to commit the transaction
          await new Promise(resolve => setTimeout(resolve, 200))
          
          // Try to find the batch by matching criteria as fallback
          const { data: fallbackBatches, error: fallbackErr } = await supabase
            .from('land_batches')
            .select('id')
            .eq('name', batchName.trim())
            .order('created_at', { ascending: false })
            .limit(1)

          if (fallbackErr) {
            console.error('Fallback query error:', fallbackErr)
            throw new Error('فشل إنشاء الدفعة: لم يتم إرجاع بيانات')
          }

          if (!fallbackBatches || fallbackBatches.length === 0) {
            console.error('Fallback query returned no results')
            throw new Error('فشل إنشاء الدفعة: لم يتم إرجاع بيانات')
          }

          // Use fallback batch
          batch = fallbackBatches[0]
          console.log('Fallback query succeeded, found batch:', batch.id)
        }

        // Convert image to base64 if a file is selected
        let finalImageUrl: string | null = null
        if (imageFile) {
          setUploadingImage(true)
          try {
            // Convert image to base64 for storage in database
            // This avoids RLS issues with Supabase Storage
            const reader = new FileReader()
            finalImageUrl = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                resolve(reader.result as string)
              }
              reader.onerror = reject
              reader.readAsDataURL(imageFile)
            })

            // Update batch with image URL (base64)
            if (finalImageUrl) {
              await supabase
                .from('land_batches')
                .update({ image_url: finalImageUrl })
                .eq('id', batch.id)
            }
          } catch (e: any) {
            console.error('Error processing image:', e)
            // Use base64 preview as fallback
            finalImageUrl = imagePreview
            if (finalImageUrl) {
              await supabase
                .from('land_batches')
                .update({ image_url: finalImageUrl })
                .eq('id', batch.id)
            }
          } finally {
            setUploadingImage(false)
          }
        }

        const offersPayload = installmentOffers.map((offer) => ({
          batch_id: batch.id,
          name: offer.name || null,
          price_per_m2_installment: offer.pricePerM2 || null,
          advance_mode: offer.advanceMode,
          advance_value: offer.advanceValue || 0,
          calc_mode: offer.calcMode,
          monthly_amount: offer.calcMode === 'monthlyAmount' ? offer.monthlyAmount || null : null,
          months: offer.calcMode === 'months' ? offer.months || null : null,
        }))

        if (offersPayload.length > 0) {
          const { error: offersError } = await supabase.from('payment_offers').insert(offersPayload)
          if (offersError) throw offersError
        }
  }

  async function handleDeleteBatch() {
    if (!batchToDelete) return

    setDeleting(true)
    try {
      // Prevent deleting batches that still have pieces or sales
      const { count: pieceCount } = await supabase
        .from('land_pieces')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchToDelete)

      if ((pieceCount || 0) > 0) {
        throw new Error('لا يمكن حذف الدفعة لأنها تحتوي على قطع مرتبطة. يرجى حذف/نقل القطع أولاً.')
      }


      const { error } = await supabase.from('land_batches').delete().eq('id', batchToDelete)

      if (error) throw error

      setDeleteConfirmOpen(false)
      setBatchToDelete(null)
      setBatchPieces([])
      // Trigger refresh event (debounced in useEffect)
      window.dispatchEvent(new CustomEvent('saleUpdated'))
    } catch (e: any) {
      console.error('Error deleting batch:', e)
      setErrorMessage('فشل حذف الدفعة: ' + e.message)
      setShowErrorDialog(true)
    } finally {
      setDeleting(false)
    }
  }

  function addInstallmentOffer() {
    if (!newOffer.pricePerM2 || newOffer.pricePerM2 <= 0) {
      setError('يرجى إدخال سعر المتر المربع')
      return
    }

    if (newOffer.calcMode === 'monthlyAmount' && (!newOffer.monthlyAmount || newOffer.monthlyAmount <= 0)) {
      setError('يرجى إدخال المبلغ الشهري')
      return
    }

    if (newOffer.calcMode === 'months' && (!newOffer.months || newOffer.months <= 0)) {
      setError('يرجى إدخال عدد الأشهر')
      return
    }

    setInstallmentOffers((prev) => [
      ...prev,
      {
        ...newOffer,
        id: `${Date.now()}-${prev.length}`,
      },
    ])

    setNewOffer({
      id: 'new',
      name: '',
      pricePerM2: 0,
      advanceMode: 'fixed',
      advanceValue: 0,
      calcMode: 'monthlyAmount',
      monthlyAmount: undefined,
      months: undefined,
    })

    setAddOfferDialogOpen(false)
    setError(null)
  }

  function openAddOfferDialog() {
    setNewOffer({
      id: 'new',
      name: '',
      pricePerM2: 0,
      advanceMode: 'fixed',
      advanceValue: 0,
      calcMode: 'monthlyAmount',
      monthlyAmount: undefined,
      months: undefined,
    })
    setError(null)
    setAddOfferDialogOpen(true)
  }

  function removeInstallmentOffer(offerId: string) {
    setInstallmentOffers((prev) => prev.filter((o) => o.id !== offerId))
  }

  async function handleCreateSales(saleData: {
    client: Client
    depositAmount: number
    deadlineDate: string
    saleType: 'full' | 'installment' | 'promise'
    paymentOfferId?: string
    notes?: string
  }) {
    if (!saleData.client || selectedPiecesForSale.length === 0 || !selectedBatchForPieces) return

      const reservedPieceIds: string[] = []
      const createdSaleIds: string[] = []

      // Helper function to update pieces to Reserved status immediately
      const reservePiecesImmediately = async (pieceIdsToReserve: string[], saleIdsForRollback: string[]) => {
        console.log('Reserving pieces IMMEDIATELY:', { pieceIds: pieceIdsToReserve.length, saleIds: saleIdsForRollback.length })
        const { error: reserveErr } = await supabase
          .from('land_pieces')
          .update({ status: 'Reserved', updated_at: new Date().toISOString() })
          .in('id', pieceIdsToReserve)

        if (reserveErr) {
          console.error('Error reserving pieces:', reserveErr)
          // Rollback: delete all created sales
          if (saleIdsForRollback.length > 0) {
            await supabase
              .from('sales')
              .delete()
              .in('id', saleIdsForRollback)
          }
          throw new Error(`فشل حجز القطع: ${reserveErr.message || 'خطأ غير معروف'}`)
        }
        
        reservedPieceIds.push(...pieceIdsToReserve)
        // Dispatch event immediately to update UI
        window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
        console.log('Pieces reserved successfully and UI updated')
      }

    try {
      // Get payment offer if installment is selected
      let installmentPricePerM2: number | null = null
      if (saleData.saleType === 'installment' && saleData.paymentOfferId) {
        const { data: offer, error: offerErr } = await supabase
          .from('payment_offers')
          .select('price_per_m2_installment')
          .eq('id', saleData.paymentOfferId)
          .single()
        
        if (!offerErr && offer) {
          installmentPricePerM2 = offer.price_per_m2_installment
        }
      }

      // First, calculate all prices
      const { calculatePiecePrice } = await import('@/utils/priceCalculator')
      const pieceCalculations = selectedPiecesForSale.map((piece) => {
        // For installment sales, pass installmentPricePerM2 separately so calculatePiecePrice can use it
        // For other sales, use batch price
        const calc = calculatePiecePrice({
          surfaceM2: piece.surface_m2,
          batchPricePerM2: selectedBatchForPieces.pricePerM2,
          pieceDirectPrice: piece.direct_full_payment_price,
          installmentPricePerM2: installmentPricePerM2, // Pass installment price separately
          depositAmount: 0,
        })
        return { piece, calc }
      })

      const totalPrice = pieceCalculations.reduce((sum, { calc }) => sum + calc.totalPrice, 0)

      // Validate total price to avoid division by zero
      if (totalPrice <= 0) {
        throw new Error('إجمالي السعر يجب أن يكون أكبر من الصفر')
      }

      // STEP 1: Verify all pieces exist in a single batch query (much faster)
      const pieceIds = pieceCalculations.map(({ piece }) => piece.id)
      const { data: existingPieces, error: piecesCheckErr } = await supabase
          .from('land_pieces')
        .select('id, batch_id, status')
        .in('id', pieceIds)

      if (piecesCheckErr) {
        console.error('Error checking pieces:', piecesCheckErr)
        throw new Error(`فشل التحقق من القطع: ${piecesCheckErr.message || 'خطأ غير معروف'}`)
      }

      if (!existingPieces || existingPieces.length !== pieceIds.length) {
        const missingPieces = pieceIds.filter(id => !existingPieces?.some(p => p.id === id))
        throw new Error(`بعض القطع غير موجودة: ${missingPieces.length} قطعة`)
        }

      // Check if any pieces are already reserved or sold
      const unavailablePieces = existingPieces.filter(p => p.status !== 'Available')
      if (unavailablePieces.length > 0) {
        throw new Error(`بعض القطع غير متاحة (${unavailablePieces.length} قطعة محجوزة أو مباعة)`)
      }

      // STEP 2: Prepare all sales for batch insert (much faster than one-by-one)
        const paymentOfferId = saleData.saleType === 'installment' && saleData.paymentOfferId 
          ? saleData.paymentOfferId 
          : null
        
      const saleDate = new Date().toISOString().split('T')[0]
      
      // Validate systemUser.id is a valid UUID before using it
      // Note: We'll try to include sold_by, but if it causes UUID errors, we'll retry without it
      let validSoldBy: string | null = null
      if (systemUser?.id && typeof systemUser.id === 'string' && systemUser.id.length > 0) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRegex.test(systemUser.id)) {
          validSoldBy = systemUser.id
        }
      }
      
      // Helper function to validate UUID
      const isValidUUID = (value: any): boolean => {
        if (!value || typeof value !== 'string' || value.length === 0) return false
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(value)
      }

      // Validate all UUID fields before creating sales
      if (!isValidUUID(saleData.client.id)) {
        throw new Error('معرف العميل غير صالح')
      }
      if (!isValidUUID(selectedBatchForPieces.id)) {
        throw new Error('معرف الدفعة غير صالح')
      }

      const salesToInsert = pieceCalculations.map(({ piece, calc }) => {
        const depositPerPiece = totalPrice > 0 
          ? (calc.totalPrice / totalPrice) * saleData.depositAmount 
          : 0

        // Validate piece ID
        if (!isValidUUID(piece.id)) {
          throw new Error(`معرف القطعة ${piece.piece_number} غير صالح`)
        }
        
        const saleInsert: any = {
          client_id: saleData.client.id,
          land_piece_id: piece.id,
          batch_id: selectedBatchForPieces.id,
          sale_price: calc.totalPrice,
          deposit_amount: depositPerPiece,
          sale_date: saleDate,
          deadline_date: saleData.deadlineDate || null,
          status: 'pending',
          payment_method: saleData.saleType,
          notes: saleData.notes || null,
        }

        // Only add payment_offer_id if it's a valid UUID (not empty string)
        if (paymentOfferId && isValidUUID(paymentOfferId)) {
          saleInsert.payment_offer_id = paymentOfferId
        }

        // Only add sold_by if we have a valid UUID - don't include it at all if invalid
        if (validSoldBy && isValidUUID(validSoldBy)) {
          saleInsert.sold_by = validSoldBy
        }

        // For promise sales, calculate partial and remaining amounts
        if (saleData.saleType === 'promise') {
          saleInsert.partial_payment_amount = depositPerPiece
          saleInsert.remaining_payment_amount = calc.totalPrice - depositPerPiece
        }

        return saleInsert
      })

      // STEP 3: Create all sales in a single batch insert (much faster)
      // Log what we're trying to insert for debugging
      console.log('Attempting to insert sales:', {
        count: salesToInsert.length,
        sample: salesToInsert[0],
        all: salesToInsert,
        sampleSoldBy: salesToInsert[0]?.sold_by,
        sampleSoldByType: typeof salesToInsert[0]?.sold_by,
      })
      
      // Remove sold_by from all sales if it's not valid to avoid UUID errors
      const cleanedSalesToInsert = salesToInsert.map(sale => {
        const cleaned: any = { ...sale }
        // Only keep sold_by if it's a valid UUID string
        if (cleaned.sold_by && !isValidUUID(cleaned.sold_by)) {
          delete cleaned.sold_by
        }
        // Only keep payment_offer_id if it's a valid UUID
        if (cleaned.payment_offer_id && !isValidUUID(cleaned.payment_offer_id)) {
          delete cleaned.payment_offer_id
        }
        return cleaned
      })
      
      const { data: insertedSales, error: salesErr } = await supabase
          .from('sales')
        .insert(cleanedSalesToInsert)
          .select('id')

      if (salesErr) {
        console.error('Error creating sales:', salesErr)
        // Log full error details for debugging
        console.error('Full error object:', JSON.stringify(salesErr, null, 2))
        console.error('Error code:', salesErr.code)
        console.error('Error details:', salesErr.details)
        console.error('Error hint:', salesErr.hint)
        console.error('Error message:', salesErr.message)
        
        // Check if it's a UUID type mismatch error - retry without sold_by
        const errorMsg = (salesErr.message || '').toLowerCase()
        const errorCode = salesErr.code || ''
        if ((errorMsg.includes('uuid') && errorMsg.includes('character varying')) || 
            errorCode === '42883' || errorMsg.includes('operator does not exist')) {
          console.log('UUID type mismatch detected, retrying without sold_by field...')
          
          // Retry without sold_by field
          const retrySalesToInsert = cleanedSalesToInsert.map(sale => {
            const retrySale: any = { ...sale }
            delete retrySale.sold_by
            return retrySale
          })
          
          const { data: retryInsertedSales, error: retryErr } = await supabase
            .from('sales')
            .insert(retrySalesToInsert)
            .select('id')
          
          if (retryErr) {
            // If retry also fails, throw the original error
            let errorMsg = 'فشل إنشاء المبيعات'
            if (retryErr.message) {
              errorMsg += `: ${retryErr.message}`
            } else if (retryErr.details) {
              errorMsg += `: ${retryErr.details}`
            } else if (retryErr.hint) {
              errorMsg += `: ${retryErr.hint}`
            } else if (retryErr.code) {
              errorMsg += ` (كود الخطأ: ${retryErr.code})`
            }
            throw new Error(errorMsg)
          }
          
          // Success on retry - check if data was returned
          if (!retryInsertedSales || retryInsertedSales.length === 0) {
            console.log('Retry succeeded but no data returned, checking if sales were actually created...')
            
            // Fallback: Check if sales were actually created by querying for them
            await new Promise(resolve => setTimeout(resolve, 300)) // Wait 300ms for DB to commit
            
            const pieceIdsToCheck = retrySalesToInsert.map(s => s.land_piece_id)
            let fallbackSales: any[] | null = null
            
            // Try first fallback query
            const { data: fallbackSales1, error: fallbackErr } = await supabase
              .from('sales')
              .select('id, land_piece_id')
              .in('land_piece_id', pieceIdsToCheck)
              .eq('client_id', saleData.client.id)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(retrySalesToInsert.length)
            
            if (!fallbackErr && fallbackSales1 && fallbackSales1.length > 0) {
              fallbackSales = fallbackSales1
            } else {
              console.error('First fallback query failed:', fallbackErr)
              // Try one more time with a simpler query
              console.log('Trying simpler fallback query...')
              await new Promise(resolve => setTimeout(resolve, 500)) // Wait a bit more
              
              // Try a simpler query - just get recent sales for this client
              const { data: simpleFallback, error: simpleErr } = await supabase
                .from('sales')
                .select('id, land_piece_id, created_at')
                .eq('client_id', saleData.client.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(10)
              
              if (!simpleErr && simpleFallback && simpleFallback.length > 0) {
                // Filter to only include sales for the pieces we're selling
                const matchingSales = simpleFallback.filter(s => 
                  pieceIdsToCheck.includes(s.land_piece_id)
                )
                if (matchingSales.length > 0) {
                  console.log('Found sales with simpler query:', matchingSales.length)
                  fallbackSales = matchingSales
                }
              }
            }
            
            // If we have sales from fallback (either from first or second query)
            if (fallbackSales && fallbackSales.length > 0) {
              // Sales were created, use fallback data
              console.log('Using fallback sales data:', fallbackSales.length, 'sales found')
              // Only add IDs that aren't already in createdSaleIds
              const newIds = fallbackSales
                .map(s => s.id)
                .filter(id => !createdSaleIds.includes(id))
              createdSaleIds.push(...newIds)
              console.log('Sales created successfully after retry (using fallback):', createdSaleIds.length)
              // Reserve pieces IMMEDIATELY after sales are confirmed
              await reservePiecesImmediately(pieceIds, createdSaleIds)
              
              // Try to update sold_by after creation (if validSoldBy exists)
              if (validSoldBy && createdSaleIds.length > 0) {
                console.log('Attempting to update sold_by for created sales...')
                const { error: updateErr } = await supabase
                  .from('sales')
                  .update({ sold_by: validSoldBy })
                  .in('id', createdSaleIds)
                
                if (updateErr) {
                  console.warn('Failed to update sold_by (non-critical):', updateErr)
                  // Non-critical error, continue anyway
                } else {
                  console.log('Successfully updated sold_by for', createdSaleIds.length, 'sales')
                  
                  // Update notifications to include seller information
                  // The trigger created notifications without seller info, so we need to update them
                  console.log('Checking if we should update notifications. systemUser?.name:', systemUser?.name)
                  if (systemUser?.name) {
                    try {
                      console.log('Querying notifications for sales:', createdSaleIds)
                      // Wait longer for notifications to be created by trigger (trigger might be delayed)
                      await new Promise(resolve => setTimeout(resolve, 1000))
                      
                      // Try multiple times to find notifications (they might be created asynchronously)
                      let notifications = null
                      let notifErr = null
                      let attempts = 0
                      const maxAttempts = 3
                      
                      while (attempts < maxAttempts && (!notifications || notifications.length === 0)) {
                        attempts++
                        console.log(`Notification query attempt ${attempts}/${maxAttempts}`)
                        
                        // Get the notifications for these sales
                        // Try querying by entity_id (UUID)
                        const result1 = await supabase
                          .from('notifications')
                          .select('id, message, metadata, entity_id, created_at')
                          .eq('entity_type', 'sale')
                          .in('entity_id', createdSaleIds)
                          .eq('type', 'sale_created')
                          .order('created_at', { ascending: false })
                          .limit(createdSaleIds.length * 2) // Get more in case of duplicates
                        
                        if (!result1.error && result1.data && result1.data.length > 0) {
                          notifications = result1.data
                          notifErr = null
                          break
                        }
                        
                        // If not found, try querying by time range (notifications created in last 5 seconds)
                        const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
                        const result2 = await supabase
                          .from('notifications')
                          .select('id, message, metadata, entity_id, created_at')
                          .eq('entity_type', 'sale')
                          .eq('type', 'sale_created')
                          .gte('created_at', fiveSecondsAgo)
                          .order('created_at', { ascending: false })
                          .limit(10)
                        
                        if (!result2.error && result2.data && result2.data.length > 0) {
                          // Filter to only include notifications for our sales
                          const matchingNotifs = result2.data.filter(n => 
                            createdSaleIds.some(saleId => n.entity_id === saleId)
                          )
                          if (matchingNotifs.length > 0) {
                            notifications = matchingNotifs
                            notifErr = null
                            break
                          }
                        }
                        
                        // Wait before next attempt
                        if (attempts < maxAttempts) {
                          await new Promise(resolve => setTimeout(resolve, 500))
                        }
                      }
                      
                      console.log('Notification query result:', { notifications, notifErr, count: notifications?.length || 0, attempts })
                      
                      if (!notifErr && notifications && notifications.length > 0) {
                        console.log('Found', notifications.length, 'notifications to update')
                        // Update each notification to include seller info
                        for (const notif of notifications) {
                          let updatedMessage = notif.message || ''
                          console.log('Original notification message:', updatedMessage)
                          
                          // Check if seller info is already in the message
                          if (!updatedMessage.includes('البائع:') && !updatedMessage.includes('باعه')) {
                            // Find where to insert seller info (after client/piece info, before payment details)
                            let paymentIndex = updatedMessage.indexOf(' • الدفع')
                            if (paymentIndex < 0) {
                              paymentIndex = updatedMessage.indexOf(' • الأقساط')
                            }
                            if (paymentIndex < 0) {
                              paymentIndex = updatedMessage.indexOf(' • وعد بالبيع')
                            }
                            
                            if (paymentIndex > 0) {
                              // Insert seller info before payment details
                              let sellerInfo = ' • البائع: ' + systemUser.name
                              if (systemUser.place) {
                                sellerInfo = sellerInfo + ' (' + systemUser.place + ')'
                              }
                              updatedMessage = updatedMessage.slice(0, paymentIndex) + sellerInfo + updatedMessage.slice(paymentIndex)
                            } else {
                              // Append at the end if no payment details found
                              updatedMessage += ' • البائع: ' + systemUser.name
                              if (systemUser.place) {
                                updatedMessage += ' (' + systemUser.place + ')'
                              }
                            }
                            
                            console.log('Updated notification message:', updatedMessage)
                            
                            // Update notification
                            const { error: updateNotifErr } = await supabase
                              .from('notifications')
                              .update({ 
                                message: updatedMessage,
                                metadata: {
                                  ...(notif.metadata || {}),
                                  seller_name: systemUser.name,
                                  seller_place: systemUser.place
                                }
                              })
                              .eq('id', notif.id)
                            
                            if (updateNotifErr) {
                              console.error('Error updating notification:', updateNotifErr)
                            } else {
                              console.log('Successfully updated notification:', notif.id)
                            }
                          } else {
                            console.log('Notification already has seller info, skipping')
                          }
                        }
                        console.log('Updated', notifications.length, 'notifications with seller information')
                      } else {
                        console.warn('No notifications found to update. Error:', notifErr, 'Count:', notifications?.length || 0)
                      }
                    } catch (notifUpdateErr) {
                      console.error('Failed to update notifications with seller info (non-critical):', notifUpdateErr)
                      // Non-critical, continue anyway
                    }
                  } else {
                    console.warn('systemUser.name is missing, cannot update notifications')
                  }
                }
              }
            } else {
              // Sales were not created
              throw new Error('فشل إنشاء المبيعات: لم يتم إنشاء البيع في قاعدة البيانات')
            }
          } else {
            // Use retry results
            createdSaleIds.push(...retryInsertedSales.map(s => s.id))
            console.log('Sales created successfully after retry (without sold_by):', createdSaleIds.length)
            // Reserve pieces IMMEDIATELY after sales are confirmed
            await reservePiecesImmediately(pieceIds, createdSaleIds)
            
            // Try to update sold_by after creation (if validSoldBy exists)
            if (validSoldBy && createdSaleIds.length > 0) {
              console.log('Attempting to update sold_by for created sales...')
              const { error: updateErr } = await supabase
                .from('sales')
                .update({ sold_by: validSoldBy })
                .in('id', createdSaleIds)
              
              if (updateErr) {
                console.warn('Failed to update sold_by (non-critical):', updateErr)
                // Non-critical error, continue anyway
              } else {
                console.log('Successfully updated sold_by for', createdSaleIds.length, 'sales')
                
                // Update notifications to include seller information
                // The trigger created notifications without seller info, so we need to update them
                console.log('Checking if we should update notifications. systemUser?.name:', systemUser?.name)
                if (systemUser?.name) {
                  try {
                    console.log('Querying notifications for sales:', createdSaleIds)
                    // Wait a bit for notifications to be created by trigger
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    // Get the notifications for these sales
                    const { data: notifications, error: notifErr } = await supabase
                      .from('notifications')
                      .select('id, message, metadata')
                      .eq('entity_type', 'sale')
                      .in('entity_id', createdSaleIds)
                      .eq('type', 'sale_created')
                      .order('created_at', { ascending: false })
                      .limit(createdSaleIds.length)
                    
                    console.log('Notification query result:', { notifications, notifErr, count: notifications?.length || 0 })
                    
                    if (!notifErr && notifications && notifications.length > 0) {
                      console.log('Found', notifications.length, 'notifications to update')
                      // Update each notification to include seller info
                      for (const notif of notifications) {
                        let updatedMessage = notif.message || ''
                        console.log('Original notification message:', updatedMessage)
                        
                        // Check if seller info is already in the message
                        if (!updatedMessage.includes('البائع:') && !updatedMessage.includes('باعه')) {
                          // Find where to insert seller info (after client/piece info, before payment details)
                          let paymentIndex = updatedMessage.indexOf(' • الدفع')
                          if (paymentIndex < 0) {
                            paymentIndex = updatedMessage.indexOf(' • الأقساط')
                          }
                          if (paymentIndex < 0) {
                            paymentIndex = updatedMessage.indexOf(' • وعد بالبيع')
                          }
                          
                          if (paymentIndex > 0) {
                            // Insert seller info before payment details
                            let sellerInfo = ' • البائع: ' + systemUser.name
                            if (systemUser.place) {
                              sellerInfo = sellerInfo + ' (' + systemUser.place + ')'
                            }
                            updatedMessage = updatedMessage.slice(0, paymentIndex) + sellerInfo + updatedMessage.slice(paymentIndex)
                          } else {
                            // Append at the end if no payment details found
                            updatedMessage += ' • البائع: ' + systemUser.name
                            if (systemUser.place) {
                              updatedMessage += ' (' + systemUser.place + ')'
                            }
                          }
                          
                          console.log('Updated notification message:', updatedMessage)
                          
                          // Update notification
                          const { error: updateNotifErr } = await supabase
                            .from('notifications')
                            .update({ 
                              message: updatedMessage,
                              metadata: {
                                ...(notif.metadata || {}),
                                seller_name: systemUser.name,
                                seller_place: systemUser.place
                              }
                            })
                            .eq('id', notif.id)
                          
                          if (updateNotifErr) {
                            console.error('Error updating notification:', updateNotifErr)
                          } else {
                            console.log('Successfully updated notification:', notif.id)
                          }
                        } else {
                          console.log('Notification already has seller info, skipping')
                        }
                      }
                      console.log('Updated', notifications.length, 'notifications with seller information')
                    } else {
                      console.warn('No notifications found to update. Error:', notifErr, 'Count:', notifications?.length || 0)
                    }
                  } catch (notifUpdateErr) {
                    console.error('Failed to update notifications with seller info (non-critical):', notifUpdateErr)
                    // Non-critical, continue anyway
                  }
                } else {
                  console.warn('systemUser.name is missing, cannot update notifications')
                }
              }
            }
          }
        } else {
          // Build a more descriptive error message
          let errorMsg = 'فشل إنشاء المبيعات'
          if (salesErr.message) {
            errorMsg += `: ${salesErr.message}`
          } else if (salesErr.details) {
            errorMsg += `: ${salesErr.details}`
          } else if (salesErr.hint) {
            errorMsg += `: ${salesErr.hint}`
          } else if (salesErr.code) {
            errorMsg += ` (كود الخطأ: ${salesErr.code})`
          }
          
          throw new Error(errorMsg)
        }
      } else {
        // Success - use original data
        if (!insertedSales || insertedSales.length === 0) {
          console.log('Original insert succeeded but no data returned, trying fallback query...')
          // Try fallback query - RLS might be preventing data return
          await new Promise(resolve => setTimeout(resolve, 500))
          
          const pieceIdsToCheck = cleanedSalesToInsert.map(s => s.land_piece_id)
          
          // Try querying by piece IDs and client
          const { data: fallbackSales1, error: fallbackErr1 } = await supabase
            .from('sales')
            .select('id, land_piece_id')
            .in('land_piece_id', pieceIdsToCheck)
            .eq('client_id', saleData.client.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(cleanedSalesToInsert.length)
          
          if (!fallbackErr1 && fallbackSales1 && fallbackSales1.length > 0) {
            console.log('Found sales with fallback query:', fallbackSales1.length)
            createdSaleIds.push(...fallbackSales1.map(s => s.id))
            // Reserve pieces IMMEDIATELY after sales are confirmed
            await reservePiecesImmediately(pieceIds, createdSaleIds)
          } else {
            // Try simpler query - just by client and recent
            console.log('First fallback failed, trying simpler query...')
            const { data: fallbackSales2, error: fallbackErr2 } = await supabase
              .from('sales')
              .select('id, land_piece_id, created_at')
              .eq('client_id', saleData.client.id)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(10)
            
            if (!fallbackErr2 && fallbackSales2 && fallbackSales2.length > 0) {
              // Filter to only include sales for the pieces we're selling
              const matchingSales = fallbackSales2.filter(s => 
                pieceIdsToCheck.includes(s.land_piece_id)
              )
              if (matchingSales.length > 0) {
                console.log('Found sales with simpler query:', matchingSales.length)
                createdSaleIds.push(...matchingSales.map(s => s.id))
                // Reserve pieces IMMEDIATELY after sales are confirmed
                await reservePiecesImmediately(pieceIds, createdSaleIds)
              } else {
                throw new Error('فشل إنشاء المبيعات: لم يتم العثور على المبيعات المنشأة')
              }
            } else {
              throw new Error('فشل إنشاء المبيعات: لم يتم إرجاع بيانات البيع')
            }
          }
        } else {
          createdSaleIds.push(...insertedSales.map(s => s.id))
          // STEP 4: Reserve pieces IMMEDIATELY after sales are confirmed created
          // This prevents pieces from showing as available even for a moment
          await reservePiecesImmediately(pieceIds, createdSaleIds)
        }
      }

      // If we haven't reserved pieces yet (fallback paths), do it now
      if (reservedPieceIds.length === 0 && createdSaleIds.length > 0) {
        await reservePiecesImmediately(pieceIds, createdSaleIds)
      }
      console.log('Pieces reserved successfully, showing success message')

      // Clear piece selections FIRST (before closing dialogs)
      // This ensures selections are cleared even if dialogs are still open
      window.dispatchEvent(new CustomEvent('clearPieceSelections'))
      console.log('Cleared piece selections after successful sale')

      setSuccessMessage(`✅ تم إنشاء ${createdSaleIds.length} بيع بنجاح!`)
      setShowSuccessDialog(true)

      // Close dialogs and clear selections
      setSaleDialogOpen(false)
      setSelectedClient(null)
      setSelectedPiecesForSale([])
      
      // Trigger refresh events (debounced in useEffect)
      // Notify owners about new sales (if notifications weren't created by trigger)
      if (createdSaleIds.length > 0) {
        try {
          // Wait a bit to see if trigger created notifications
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Check if notifications were created by trigger
          const { data: existingNotifs } = await supabase
            .from('notifications')
            .select('id')
            .eq('entity_type', 'sale')
            .in('entity_id', createdSaleIds)
            .eq('type', 'sale_created')
            .limit(1)
          
          // If no notifications exist, create them manually
          if (!existingNotifs || existingNotifs.length === 0) {
            const clientName = saleData.client.name || 'عميل غير معروف'
            const piecesCount = pieceCalculations.length
            const totalPrice = pieceCalculations.reduce((sum, { calc }) => sum + calc.totalPrice, 0)
            const paymentMethodLabel = saleData.saleType === 'full' ? 'دفع كامل' : 
                                       saleData.saleType === 'installment' ? 'تقسيط' : 
                                       saleData.saleType === 'promise' ? 'وعد بالبيع' : 'غير محدد'
            
            const notificationMessage = `تم إنشاء ${piecesCount} بيع جديد للعميل ${clientName} • طريقة الدفع: ${paymentMethodLabel} • السعر الإجمالي: ${formatPrice(totalPrice)} DT`
            
            // Notify owners
            await notifyOwners(
              'sale_created',
              `بيع جديد: ${piecesCount} قطعة`,
              notificationMessage,
              'sale',
              createdSaleIds[0], // Use first sale ID as entity_id
              {
                client_name: clientName,
                pieces_count: piecesCount,
                total_price: totalPrice,
                payment_method: saleData.saleType,
                sale_ids: createdSaleIds,
                seller_name: systemUser?.name || 'غير معروف',
                seller_place: systemUser?.place || null,
              }
            )
            
            // Also notify current user
            if (systemUser?.id) {
              await notifyCurrentUser(
                'sale_created',
                `بيع جديد: ${piecesCount} قطعة`,
                notificationMessage,
                systemUser.id,
                'sale',
                createdSaleIds[0],
                {
                  client_name: clientName,
                  pieces_count: piecesCount,
                  total_price: totalPrice,
                  payment_method: saleData.saleType,
                  sale_ids: createdSaleIds,
                }
              )
            }
          }
        } catch (notifErr) {
          console.error('Failed to create notifications (non-critical):', notifErr)
          // Non-critical, continue anyway
        }
      }
      
      window.dispatchEvent(new CustomEvent('saleCreated'))
      
      // Only refresh if piece dialog is still open
      if (pieceDialogOpen && selectedBatchForPieces) {
        window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
      }
    } catch (e: any) {
      console.error('Sale creation failed:', e)
      console.log(`Rollback state: ${reservedPieceIds.length} pieces reserved, ${createdSaleIds.length} sales created`)
      
      // CRITICAL: Rollback in reverse order
      // 1. First, unreserve any pieces that were reserved (should be 0 if we're doing it right)
      if (reservedPieceIds.length > 0) {
        console.warn(`WARNING: ${reservedPieceIds.length} pieces were reserved before sales creation failed. This should not happen!`)
        try {
          const { data: rollbackData, error: rollbackErr } = await supabase
            .from('land_pieces')
            .update({ status: 'Available', updated_at: new Date().toISOString() })
            .in('id', reservedPieceIds)
            .select('id')
          
          if (rollbackErr) {
            console.error('Failed to rollback piece reservations:', rollbackErr)
          } else {
            console.log(`Successfully rolled back ${rollbackData?.length || 0} piece reservation(s)`)
          }
        } catch (rollbackErr) {
          console.error('Exception during piece rollback:', rollbackErr)
        }
      }
      
      // 2. Then, delete all created sales
      if (createdSaleIds.length > 0) {
        try {
          const { data: deleteData, error: deleteErr } = await supabase
            .from('sales')
            .delete()
            .in('id', createdSaleIds)
            .select('id')
          
          if (deleteErr) {
            console.error('Failed to rollback created sales:', deleteErr)
          } else {
            console.log(`Successfully rolled back ${deleteData?.length || 0} sale(s)`)
          }
        } catch (deleteErr) {
          console.error('Exception during sales rollback:', deleteErr)
        }
      }
      
      // 3. Double-check: Verify no pieces are still reserved without sales
      if (selectedPiecesForSale.length > 0) {
        try {
          const pieceIds = selectedPiecesForSale.map(p => p.id)
          const { data: piecesCheck, error: checkErr } = await supabase
            .from('land_pieces')
            .select('id, status')
            .in('id', pieceIds)
          
          if (!checkErr && piecesCheck) {
            const stillReserved = piecesCheck.filter(p => p.status === 'Reserved')
            if (stillReserved.length > 0) {
              console.warn(`Found ${stillReserved.length} pieces still reserved after rollback. Fixing...`)
              // Fix any remaining reserved pieces
              await supabase
                .from('land_pieces')
                .update({ status: 'Available', updated_at: new Date().toISOString() })
                .in('id', stillReserved.map(p => p.id))
            }
          }
        } catch (checkErr) {
          console.error('Error checking piece status after rollback:', checkErr)
        }
      }
      
      setErrorMessage(e.message || 'فشل إنشاء البيع. تم إلغاء جميع الحجوزات والمبيعات.')
      setShowErrorDialog(true)
      
      // Trigger refresh events (debounced in useEffect)
      window.dispatchEvent(new CustomEvent('saleUpdated'))
      
      // Only refresh pieces if dialog is still open
      if (pieceDialogOpen && selectedBatchForPieces) {
        window.dispatchEvent(new CustomEvent('pieceStatusChanged'))
      }
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        {/* Header */}
        <header className="mb-3 sm:mb-4 lg:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">دفعات الأراضي</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">إدارة دفعات الأراضي والقطع والعروض</p>
          </div>
          {systemUser?.role === 'owner' && (
          <Button onClick={openCreateDialog} size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
            + دفعة جديدة
          </Button>
          )}
        </header>

        {/* List Error */}
        {listError && (
          <div className="mb-4">
            <Alert variant="error">
              <div className="flex items-center justify-between">
                <span>{listError}</span>
                <Button 
                  onClick={() => {
                    setListError(null)
                    loadBatches()
                  }} 
                  size="sm" 
                  variant="secondary"
                  className="ml-2 text-xs"
                >
                  إعادة المحاولة
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {/* Search Bar */}
        {!loading && batches.length > 0 && (
          <div className="mb-3 sm:mb-4">
            <Input
              type="text"
              placeholder="🔍 بحث (اسم الدفعة، الموقع)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
        )}

        {/* Total Stats for All Batches */}
        {!loading && batches.length > 0 && (
          <Card className="mb-3 sm:mb-4 lg:mb-5 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                <div className="text-xs text-blue-700 font-medium mb-0.5">القطع</div>
                <div className="text-base sm:text-lg font-bold text-blue-900 animate-count-up transition-all duration-300">
                  {displayedStats.totalPieces.toLocaleString()}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                <div className="text-xs text-green-700 font-medium mb-0.5">مباع</div>
                <div className="text-base sm:text-lg font-bold text-green-900 animate-count-up transition-all duration-300">
                  {displayedStats.soldPieces.toLocaleString()}
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 border border-orange-200">
                <div className="text-xs text-orange-700 font-medium mb-0.5">محجوز</div>
                <div className="text-base sm:text-lg font-bold text-orange-900 animate-count-up transition-all duration-300">
                  {displayedStats.reservedPieces.toLocaleString()}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-2 border border-purple-200">
                <div className="text-xs text-purple-700 font-medium mb-0.5">المساحة</div>
                <div className="text-base sm:text-lg font-bold text-purple-900 animate-count-up transition-all duration-300">
                  {displayedStats.totalSurface.toLocaleString()} م²
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Batches List */}
        {loading ? (
          <div className="text-center py-8 sm:py-12">
            <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-xs sm:text-sm text-gray-600">جاري التحميل...</p>
          </div>
        ) : batches.length === 0 && !listError ? (
          <Card className="text-center py-8 sm:py-12">
            <CardContent>
              <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">لا توجد دفعات حتى الآن</p>
              {systemUser?.role === 'owner' && (
              <Button onClick={openCreateDialog} size="sm" className="text-xs sm:text-sm">إنشاء دفعة جديدة</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
            {batches
              .filter((batch) => {
                if (!searchQuery.trim()) return true
                const query = searchQuery.toLowerCase()
                return (
                  batch.name.toLowerCase().includes(query) ||
                  (batch.location && batch.location.toLowerCase().includes(query)) ||
                  (batch.title_reference && batch.title_reference.toLowerCase().includes(query))
                )
              })
              .map((batch) => (
              <Card 
                key={batch.id} 
                className="hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden border-2 hover:border-blue-300 bg-gradient-to-br from-white to-gray-50"
                onClick={() => openPiecesDialog(batch.id)}
              >
                <div className="flex flex-col sm:flex-row h-full">
                  {/* Content */}
                  <div className="flex-1 p-3 sm:p-4 flex flex-col">
                    {/* Header */}
                    <div className="mb-2">
                      <CardTitle className="text-sm sm:text-base font-bold text-gray-900 mb-1 truncate">
                        {batch.name}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      {batch.location && (
                          <span className="truncate flex items-center gap-1">
                          <span>📍</span> {batch.location}
                          </span>
                      )}
                        {batch.price_per_m2_cash && (
                          <Badge variant="info" size="sm" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-300 px-2 py-0.5">
                            {batch.price_per_m2_cash.toLocaleString()} د/م²
                          </Badge>
                      )}
                      </div>
                    </div>

                    {/* Stats - Compact Single Line */}
                    {batch.stats && (
                      <div className="flex items-center gap-3 mb-3 text-xs flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-blue-600 font-semibold">{batch.stats.totalPieces}</span>
                          <span className="text-gray-500">قطع</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-green-600 font-semibold">{batch.stats.soldPieces}</span>
                          <span className="text-gray-500">مباع</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-orange-600 font-semibold">{batch.stats.reservedPieces}</span>
                          <span className="text-gray-500">محجوز</span>
                        </div>
                        {batch.stats.totalSurface > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-purple-600 font-semibold">{batch.stats.totalSurface.toLocaleString()}</span>
                            <span className="text-gray-500">م²</span>
                      </div>
                    )}
                      </div>
                    )}
                  
                  {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="secondary"
                      size="sm"
                        onClick={() => openPiecesDialog(batch.id)}
                        className="flex-1 bg-white hover:bg-gray-50 !text-gray-900 border-2 border-gray-300 font-semibold text-xs sm:text-sm py-2 shadow-sm"
                    >
                        عرض القطع
                    </Button>
                      {systemUser?.role === 'owner' && (
                        <>
                    <IconButton
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(batch.id)}
                            title="تعديل"
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </IconButton>
                          <IconButton
                            variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(batch.id)}
                      title="حذف"
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </IconButton>
                        </>
                      )}
                  </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={() => {
            if (!saving) {
              setDialogOpen(false)
              resetForm()
            }
          }}
          title={
            editingBatchId
              ? `تعديل الدفعة: ${batches.find((b) => b.id === editingBatchId)?.name || ''}`
              : 'دفعة أرض جديدة'
          }
          size="xl"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setDialogOpen(false)
                  resetForm()
                }}
                disabled={saving}
              >
                إلغاء
              </Button>
              <Button onClick={handleSaveBatch} disabled={saving || uploadingImage || !batchName.trim()}>
                {saving || uploadingImage ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {uploadingImage ? 'جاري رفع الصورة...' : 'جارٍ الحفظ...'}
                  </span>
                ) : (
                  '💾 حفظ الدفعة'
                )}
              </Button>
            </div>
          }
        >
          {/* Alerts */}
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

          {/* Single Form - All Sections */}
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-2 sm:space-y-3 lg:space-y-4">
              <div className="border-b border-gray-200 pb-1.5 sm:pb-2">
                <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">معلومات أساسية</h3>
              </div>
              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">
                        اسم الأرض <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={batchName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchName(e.target.value)}
                        placeholder="اسم الدفعة (مثال: مطار 1)"
                    className="transition-all focus:shadow-md text-xs sm:text-sm"
                    size="sm"
                      />
                    </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">الموقع</Label>
                      <Input
                        value={location}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
                        placeholder="الموقع العام للأرض"
                    className="transition-all focus:shadow-md text-xs sm:text-sm"
                    size="sm"
                      />
                    </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">الرسم العقاري / العدد</Label>
                      <Input
                        value={titleReference}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitleReference(e.target.value)}
                        placeholder="رقم الرسم العقاري أو مرجع الملكية"
                    className="transition-all focus:shadow-md text-xs sm:text-sm"
                    size="sm"
                      />
                    </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">صورة الدفعة</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setImageFile(file)
                            // Create preview
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              setImagePreview(reader.result as string)
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                        className="transition-all focus:shadow-md text-xs sm:text-sm"
                        size="sm"
                      />
                      {imagePreview && (
                        <div className="mt-2">
                          <img 
                            src={imagePreview} 
                            alt="Preview" 
                            className="w-full h-32 object-cover rounded border border-gray-300"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                          {imageFile && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setImageFile(null)
                                setImagePreview(null)
                              }}
                              className="mt-2 text-xs"
                            >
                              إزالة الصورة
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
            </div>

            {/* Full Payment Section */}
            <div className="space-y-2 sm:space-y-3 lg:space-y-4">
              <div className="border-b border-gray-200 pb-1.5 sm:pb-2">
                <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">الدفع بالحاضر</h3>
              </div>
              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">
                        سعر المتر المربع (بالحاضر)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fullPayment.pricePerM2 || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setFullPayment((prev) => ({
                            ...prev,
                            pricePerM2: Number(e.target.value || 0),
                          }))
                        }
                        placeholder="0.00"
                    className="transition-all focus:shadow-md text-xs sm:text-sm"
                              size="sm"
                            />
                          </div>
                          </div>
                        </div>

            {/* Offers Section */}
            <div className="space-y-2 sm:space-y-3 lg:space-y-4">
              <div className="border-b border-gray-200 pb-1.5 sm:pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                  عروض التقسيط ({installmentOffers.length})
                </h3>
                <Button size="sm" onClick={openAddOfferDialog} className="text-xs sm:text-sm w-full sm:w-auto">
                  + إضافة عرض تقسيط جديد
                        </Button>
                      </div>
              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                {installmentOffers.length > 0 ? (
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm font-semibold">العروض المضافة</Label>
                    <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-56 lg:max-h-64 overflow-y-auto scrollbar-thin">
                          {installmentOffers.map((offer) => (
                            <div
                              key={offer.id}
                          className="rounded-lg border border-gray-200 bg-white p-2 sm:p-2.5 lg:p-3 flex items-start justify-between gap-2 sm:gap-3"
                            >
                          <div className="flex-1 space-y-0.5 sm:space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="font-medium text-xs sm:text-sm truncate">
                                    {offer.name || 'عرض بدون اسم'}
                                  </span>
                              <Badge variant="info" size="sm" className="text-xs flex-shrink-0">
                                    {offer.pricePerM2.toLocaleString()} د/م²
                                  </Badge>
                                </div>
                                <div className="text-xs text-gray-600">
                                  تسبقة:{' '}
                                  {offer.advanceValue || 0}{' '}
                                  {offer.advanceMode === 'percent' ? '%' : 'دج'}
                                  {offer.calcMode === 'monthlyAmount'
                                    ? ` · مبلغ شهري: ${offer.monthlyAmount || 0} دج`
                                    : ` · عدد الأشهر: ${offer.months || 0}`}
                                </div>
                              </div>
                              <IconButton
                                variant="danger"
                                size="sm"
                                onClick={() => removeInstallmentOffer(offer.id)}
                            className="p-1 sm:p-1.5 flex-shrink-0"
                              >
                                <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </IconButton>
                            </div>
                          ))}
                        </div>
                      </div>
                ) : (
                  <p className="text-xs sm:text-sm text-gray-500 text-center py-3 sm:py-4">
                    لا توجد عروض مضافة. اضغط على "إضافة عرض تقسيط جديد" لإضافة عرض.
                  </p>
                    )}
                  </div>
            </div>
          </div>
        </Dialog>

        {/* Delete Confirmation Dialog with Pieces List */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => {
            if (!deleting) {
              setDeleteConfirmOpen(false)
              setBatchToDelete(null)
              setBatchPieces([])
            }
          }}
          onConfirm={handleDeleteBatch}
          title={`حذف الدفعة: ${selectedBatchName}`}
          description={`هل أنت متأكد من حذف هذه الدفعة؟ سيتم حذف جميع القطع والعروض المرتبطة بها. لا يمكن التراجع عن هذا الإجراء.`}
          confirmText={deleting ? 'جاري الحذف...' : 'نعم، حذف'}
          cancelText="إلغاء"
          variant="destructive"
          disabled={deleting}
        >
          {/* Show Pieces in Delete Dialog */}
          {loadingPieces ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
              <p className="mt-2 text-xs text-gray-600">جاري تحميل القطع...</p>
            </div>
          ) : batchPieces.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                القطع المرتبطة بهذه الدفعة ({batchPieces.length}):
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                {batchPieces.map((piece, idx) => (
                  <div
                    key={piece.id}
                    className="rounded border border-gray-200 bg-gray-50 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" size="sm">
                          #{idx + 1}
                        </Badge>
                        <span className="font-medium">القطعة {piece.piece_number}</span>
                        <Badge
                          variant={
                            piece.status === 'Available'
                              ? 'success'
                              : piece.status === 'Sold'
                                ? 'default'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {piece.status}
                        </Badge>
                      </div>
                      <span className="text-gray-600">{piece.surface_m2.toLocaleString()} م²</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">لا توجد قطع مرتبطة بهذه الدفعة</p>
            </div>
          )}
        </ConfirmDialog>

        {/* Piece Management Dialog */}
        {selectedBatchForPieces && (
          <PieceDialog
            open={pieceDialogOpen}
            onClose={() => {
              setPieceDialogOpen(false)
              setSelectedBatchForPieces(null)
            }}
            batchId={selectedBatchForPieces.id}
            batchName={selectedBatchForPieces.name}
            batchPricePerM2={selectedBatchForPieces.pricePerM2}
            batchImageUrl={selectedBatchForPieces.imageUrl}
            isOwner={systemUser?.role === 'owner'}
            onImageClick={(imageUrl, imageName) => {
              setViewingImage({ url: imageUrl, name: imageName })
              setImageViewerOpen(true)
              setImageZoom(1)
              setImagePosition({ x: 0, y: 0 })
            }}
            onPieceAdded={() => {
              // Trigger refresh event (debounced in useEffect)
              window.dispatchEvent(new CustomEvent('saleUpdated'))
              // Also directly refresh stats for this specific batch after a short delay
              // to ensure database has committed the changes
              setTimeout(() => {
                if (selectedBatchForPieces) {
                  loadAllBatchStats([selectedBatchForPieces.id]).then(statsMap => {
                    setBatches(currentBatches => {
                      const updatedBatches = currentBatches.map(batch => {
                        if (batch.id === selectedBatchForPieces.id) {
                          const stats = statsMap.get(batch.id)
                          if (stats) {
                            return { ...batch, stats }
                          }
                        }
                        return batch
                      })
                      
                      // Update stats for animation
                      const totalStats: LandStats = {
                        totalPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.totalPieces || 0), 0),
                        soldPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.soldPieces || 0), 0),
                        reservedPieces: updatedBatches.reduce((sum, b) => sum + (b.stats?.reservedPieces || 0), 0),
                        totalSurface: updatedBatches.reduce((sum, b) => sum + (b.stats?.totalSurface || 0), 0),
                      }
                      setStats(totalStats)
                      
                      return updatedBatches
                    })
                  }).catch(console.error)
                }
              }, 500) // Wait 500ms for database to commit
            }}
            onSellPieces={(pieces) => {
              console.log('=== onSellPieces called ===')
              console.log('Pieces to sell:', pieces)
              console.log('Current selectedBatchForPieces:', selectedBatchForPieces)
              setSelectedPiecesForSale(pieces)
              setClientSelectionDialogOpen(true)
              console.log('Client selection dialog opened')
            }}
          />
        )}

        {/* Client Selection Dialog */}
        <ClientSelectionDialog
          open={clientSelectionDialogOpen}
          onClose={() => {
            // Only clear state if we're NOT transitioning to sale dialog
            if (!isTransitioningToSaleRef.current) {
              setClientSelectionDialogOpen(false)
              setSelectedClient(null)
              setSelectedPiecesForSale([])
            }
          }}
          onClientSelected={(client) => {
            console.log('=== Land.tsx onClientSelected CALLED ===')
            console.log('Received client:', client)
            console.log('Current state:', { 
              selectedBatchForPieces: selectedBatchForPieces,
              selectedPiecesForSale: selectedPiecesForSale,
              saleDialogOpen: saleDialogOpen,
              clientSelectionDialogOpen: clientSelectionDialogOpen
            })
            
            // Set flag to prevent onClose from clearing state
            isTransitioningToSaleRef.current = true
            console.log('Set isTransitioningToSaleRef to true')
            
            // Set client and open sale dialog
            console.log('Calling setSelectedClient...')
            setSelectedClient(client)
            console.log('Calling setSaleDialogOpen(true)...')
            setSaleDialogOpen(true)
            
            console.log('State updates scheduled, setting timeout to close client dialog')
            
            // Close client dialog after a delay to ensure sale dialog renders
            setTimeout(() => {
              console.log('Timeout fired - closing client selection dialog')
              setClientSelectionDialogOpen(false)
              isTransitioningToSaleRef.current = false
              console.log('Client selection dialog closed, transition flag reset')
            }, 150)
          }}
        />

        {/* Multi Piece Sale Dialog */}
        {selectedBatchForPieces && selectedClient && (
          <MultiPieceSaleDialog
            open={saleDialogOpen}
                onClose={() => {
              setSaleDialogOpen(false)
              setSelectedClient(null)
              setSelectedPiecesForSale([])
                }}
            pieces={selectedPiecesForSale}
            client={selectedClient}
            batchId={selectedBatchForPieces.id}
                batchName={selectedBatchForPieces.name}
                batchPricePerM2={selectedBatchForPieces.pricePerM2}
            onConfirm={async (saleData) => {
              await handleCreateSales({
                ...saleData,
                client: saleData.client,
              })
            }}
              />
        )}

        {/* Pieces View Dialog */}
        <Dialog
          open={piecesDialogOpen}
          onClose={() => {
            setPiecesDialogOpen(false)
            setSelectedBatchId(null)
            setBatchPieces([])
          }}
          title={`قطع الدفعة: ${selectedBatchName}`}
          size="lg"
          footer={
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setPiecesDialogOpen(false)
                  setSelectedBatchId(null)
                  setBatchPieces([])
                }}
              >
                إغلاق
              </Button>
            </div>
          }
        >
          {loadingPieces ? (
            <div className="text-center py-6 sm:py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-xs sm:text-sm text-gray-600">جاري التحميل...</p>
            </div>
          ) : batchPieces.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-xs sm:text-sm text-gray-500">لا توجد قطع في هذه الدفعة</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                <Badge variant="info" size="sm" className="text-xs sm:text-sm">
                  إجمالي القطع: {batchPieces.length}
                </Badge>
                <Badge variant="default" size="sm" className="text-xs sm:text-sm">
                  إجمالي المساحة:{' '}
                  {batchPieces
                    .reduce((sum, p) => sum + (p.surface_m2 || 0), 0)
                    .toLocaleString()}{' '}
                  م²
                </Badge>
              </div>
              <div className="space-y-1.5 sm:space-y-2 max-h-64 sm:max-h-80 lg:max-h-96 overflow-y-auto scrollbar-thin">
                {batchPieces.map((piece, idx) => (
                  <Card key={piece.id} className="p-2 sm:p-2.5 lg:p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-0.5 sm:space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Badge variant="default" size="sm" className="text-xs">
                            #{idx + 1}
                          </Badge>
                          <span className="text-xs sm:text-sm font-semibold truncate">القطعة {piece.piece_number}</span>
                          <Badge
                            variant={
                              piece.status === 'Available'
                                ? 'success'
                                : piece.status === 'Sold'
                                  ? 'default'
                                  : 'warning'
                            }
                            size="sm"
                            className="text-xs"
                          >
                            {piece.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                          <div>
                            <span className="font-medium">المساحة:</span>{' '}
                            {piece.surface_m2.toLocaleString()} م²
                          </div>
                          {piece.direct_full_payment_price && (
                            <div>
                              <span className="font-medium">السعر المباشر:</span>{' '}
                              {piece.direct_full_payment_price.toLocaleString()} دج
                            </div>
                          )}
                        </div>
                        {piece.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">📝 {piece.notes}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Dialog>

        {/* Add Offer Dialog */}
        <Dialog
          open={addOfferDialogOpen}
          onClose={() => {
            setAddOfferDialogOpen(false)
            setError(null)
          }}
          title="إضافة عرض تقسيط جديد"
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setAddOfferDialogOpen(false)
                  setError(null)
                }}
              >
                إلغاء
              </Button>
              <Button onClick={addInstallmentOffer}>
                + إضافة العرض
              </Button>
            </div>
          }
        >
          {error && (
            <div className="mb-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3 lg:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">اسم العرض (اختياري)</Label>
              <Input
                value={newOffer.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewOffer({ ...newOffer, name: e.target.value })}
                placeholder="مثال: عرض 24 شهر"
                size="sm"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">
                سعر المتر (بالتقسيط) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={newOffer.pricePerM2 || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewOffer({
                    ...newOffer,
                    pricePerM2: Number(e.target.value || 0),
                  })
                }
                placeholder="0.00"
                size="sm"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">التسبقة</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={newOffer.advanceValue || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewOffer({
                    ...newOffer,
                    advanceValue: Number(e.target.value || 0),
                  })
                }
                placeholder="0.00"
                size="sm"
                className="text-xs sm:text-sm"
              />
              <div className="flex gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                <button
                  type="button"
                  className={`px-2 sm:px-2.5 lg:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    newOffer.advanceMode === 'fixed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() =>
                    setNewOffer((prev) => ({ ...prev, advanceMode: 'fixed' }))
                  }
                >
                  مبلغ
                </button>
                <button
                  type="button"
                  className={`px-2 sm:px-2.5 lg:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    newOffer.advanceMode === 'percent'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() =>
                    setNewOffer((prev) => ({ ...prev, advanceMode: 'percent' }))
                  }
                >
                  نسبة
                </button>
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">طريقة الحساب</Label>
              <div className="flex gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <button
                  type="button"
                  className={`px-2 sm:px-2.5 lg:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    newOffer.calcMode === 'monthlyAmount'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() =>
                    setNewOffer((prev) => ({ ...prev, calcMode: 'monthlyAmount' }))
                  }
                >
                  مبلغ شهري
                </button>
                <button
                  type="button"
                  className={`px-2 sm:px-2.5 lg:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    newOffer.calcMode === 'months'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() =>
                    setNewOffer((prev) => ({ ...prev, calcMode: 'months' }))
                  }
                >
                  عدد أشهر
                </button>
              </div>
              {newOffer.calcMode === 'monthlyAmount' ? (
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="المبلغ الشهري"
                  value={newOffer.monthlyAmount || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewOffer({
                      ...newOffer,
                      monthlyAmount: Number(e.target.value || 0),
                    })
                  }
                />
              ) : (
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="عدد الأشهر"
                  value={newOffer.months || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewOffer({
                      ...newOffer,
                      months: Number(e.target.value || 0),
                    })
                  }
                />
              )}
            </div>
          </div>
        </Dialog>

        {/* Success/Error Notification Dialogs */}
        <NotificationDialog
          open={showSuccessDialog}
          onClose={() => {
            setShowSuccessDialog(false)
            setSuccessMessage('')
          }}
          type="success"
          title="نجح العملية"
          message={successMessage}
        />

        <NotificationDialog
          open={showErrorDialog}
          onClose={() => {
            setShowErrorDialog(false)
            setErrorMessage('')
          }}
          type="error"
          title="فشل العملية"
          message={errorMessage}
        />

        {/* Image Viewer Dialog */}
        {viewingImage && (
          <div
            className={`fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm ${
              imageViewerOpen ? 'animate-in fade-in' : 'hidden'
            }`}
            onClick={() => {
              setImageViewerOpen(false)
              setViewingImage(null)
              setImageZoom(1)
              setImagePosition({ x: 0, y: 0 })
            }}
          >
            {/* Header Controls */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/50 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm sm:text-base truncate flex-1 pr-4">
                {viewingImage.name}
              </h3>
              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-black/50 rounded-lg p-1">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setImageZoom((prev) => Math.max(0.5, prev - 0.25))
                    }}
                    className="text-white hover:bg-white/20 p-1.5"
                    title="تصغير"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                    </svg>
                  </IconButton>
                  <span className="text-white text-xs px-2 min-w-[3rem] text-center">
                    {Math.round(imageZoom * 100)}%
                  </span>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setImageZoom((prev) => Math.min(5, prev + 0.25))
                    }}
                    className="text-white hover:bg-white/20 p-1.5"
                    title="تكبير"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                    </svg>
                  </IconButton>
                </div>
                {/* Reset Button */}
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImageZoom(1)
                    setImagePosition({ x: 0, y: 0 })
                  }}
                  className="text-white hover:bg-white/20 p-1.5"
                  title="إعادة تعيين"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </IconButton>
                {/* Close Button */}
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImageViewerOpen(false)
                    setViewingImage(null)
                    setImageZoom(1)
                    setImagePosition({ x: 0, y: 0 })
                  }}
                  className="text-white hover:bg-white/20 p-1.5"
                  title="إغلاق"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>
            </div>

            {/* Image Container */}
            <div
              ref={imageContainerRef}
              className="absolute inset-0 flex items-center justify-center overflow-hidden"
              style={{ paddingTop: '60px' }}
              onMouseDown={(e) => {
                if (imageZoom > 1) {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(true)
                  setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y })
                }
              }}
              onMouseMove={(e) => {
                if (isDragging && imageZoom > 1) {
                  e.preventDefault()
                  e.stopPropagation()
                  setImagePosition({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y,
                  })
                }
              }}
              onMouseUp={(e) => {
                if (isDragging) {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(false)
                }
              }}
              onMouseLeave={(e) => {
                if (isDragging) {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(false)
                }
              }}
            >
              <img
                src={viewingImage.url}
                alt={viewingImage.name}
                className="max-w-full max-h-full object-contain select-none"
                style={{
                  transform: `scale(${imageZoom}) translate(${imagePosition.x / imageZoom}px, ${imagePosition.y / imageZoom}px)`,
                  cursor: imageZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>

            {/* Bottom Info */}
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/50 backdrop-blur-sm px-4 py-2 text-center">
              <p className="text-white text-xs sm:text-sm">
                استخدم عجلة الماوس للتكبير/التصغير • اسحب الصورة عند التكبير • اضغط ESC أو انقر خارج الصورة للإغلاق
              </p>
            </div>
          </div>
        )}
    </div>
  )
}

export default LandPage
