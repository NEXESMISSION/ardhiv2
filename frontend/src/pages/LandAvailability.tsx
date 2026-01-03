import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { debounce } from '@/lib/throttle'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Check, Clock, X, Filter, RotateCcw, Search } from 'lucide-react'

interface PieceWithStatus {
  id: string
  piece_number: string | number
  surface_area: number
  purchase_cost: number
  selling_price_full: number
  selling_price_installment: number
  land_batch?: { name: string; id: string; real_estate_tax_number?: string | null }
  status_display: 'Available' | 'Reserved' | 'Sold'
  sale?: any
  reservation?: any
}

export function LandAvailability() {
  const [pieces, setPieces] = useState<PieceWithStatus[]>([])
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'Available' | 'Reserved' | 'Sold'>('all')
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [minSize, setMinSize] = useState<string>('')
  const [maxSize, setMaxSize] = useState<string>('')
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAll, setShowAll] = useState(false) // Show all lands or only search results
  
  const [selectedPiece, setSelectedPiece] = useState<PieceWithStatus | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  
  // Search by piece number - MUST be declared before any early returns
  const [pieceSearch, setPieceSearch] = useState('')
  const [searchedPieces, setSearchedPieces] = useState<PieceWithStatus[]>([])

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((searchValue: string) => {
      if (!searchValue.trim()) {
        setSearchedPieces([])
        return
      }
      
      const filteredByBatch = batchFilter === 'all' 
        ? pieces 
        : pieces.filter(p => p.land_batch?.name === batchFilter)
      
      const found = filteredByBatch.filter(p => {
        const pieceNum = String(p.piece_number)
        const pieceDigits = pieceNum.replace(/\D/g, '')
        const searchDigits = searchValue.replace(/\D/g, '')
        
        if (searchDigits && pieceDigits) {
          const pieceInt = parseInt(pieceDigits, 10)
          const searchInt = parseInt(searchDigits, 10)
          if (!isNaN(pieceInt) && !isNaN(searchInt) && pieceInt === searchInt) {
            return true
          }
        }
        
        const pieceNumLower = pieceNum.toLowerCase()
        const searchLower = searchValue.toLowerCase()
        if (pieceNumLower === searchLower) return true
        
        const normalize = (str: string): string => {
          return str.toLowerCase().replace(/^[p#]/, '').replace(/^0+/, '').trim()
        }
        const pieceNorm = normalize(pieceNum)
        const searchNorm = normalize(searchValue)
        if (pieceNorm && searchNorm && pieceNorm === searchNorm) return true
        
        return false
      })
      setSearchedPieces(found)
    }, 300),
    [pieces, batchFilter]
  )

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch all pieces with batch info including real estate tax number
      const { data: piecesData } = await supabase
        .from('land_pieces')
        .select('*, land_batch:land_batches(name, real_estate_tax_number)')
        .order('piece_number', { ascending: true })

      // Fetch all sales (including completed and active)
      const { data: salesData } = await supabase
        .from('sales')
        .select('*, client:clients(*)')
        .neq('status', 'Cancelled')

      // Fetch all active reservations (Pending or Confirmed, not Cancelled or Expired)
      const { data: reservationsData } = await supabase
        .from('reservations')
        .select('*, client:clients(*)')
        .in('status', ['Pending', 'Confirmed'])

      // Get unique batches for filter - properly deduplicate by name
      const batchMap = new Map<string, { id: string; name: string }>()
      ;(piecesData || []).forEach((p: any) => {
        if (p.land_batch && p.land_batch.name) {
          const batchName = p.land_batch.name
          if (!batchMap.has(batchName)) {
            batchMap.set(batchName, { 
              id: p.land_batch.id || batchName, 
              name: batchName 
            })
          }
        }
      })
      setBatches(Array.from(batchMap.values()))

      const piecesWithStatus: PieceWithStatus[] = ((piecesData || []) as any[]).map((piece: any) => {
        // Check if piece is sold (only if sale is completed)
        const sale = ((salesData || []) as any[]).find((s: any) => 
          s.land_piece_ids?.includes(piece.id) && s.status === 'Completed'
        )
        
        // Check if piece has an active sale (not completed)
        const activeSale = ((salesData || []) as any[]).find((s: any) => 
          s.land_piece_ids?.includes(piece.id) && s.status !== 'Completed' && s.status !== 'Cancelled'
        )
        
        // Check if piece is reserved (reservations use land_piece_ids array)
        const reservation = ((reservationsData || []) as any[]).find((r: any) => 
          r.land_piece_ids?.includes(piece.id)
        )

        let status_display: 'Available' | 'Reserved' | 'Sold' = 'Available'
        if (sale) {
          // Only mark as Sold if sale is actually completed
          status_display = 'Sold'
        } else if (activeSale || reservation) {
          // If there's an active sale (not completed) or reservation, mark as Reserved
          status_display = 'Reserved'
        }

        return {
          id: piece.id,
          piece_number: piece.piece_number,
          surface_area: piece.surface_area,
          purchase_cost: piece.purchase_cost || 0,
          selling_price_full: piece.selling_price_full || 0,
          selling_price_installment: piece.selling_price_installment || 0,
          land_batch: piece.land_batch,
          status_display,
          sale: sale || activeSale, // Include active sale for display
          reservation,
        }
      })

      setPieces(piecesWithStatus)
    } catch (error) {
      // Error fetching data - silent fail
    } finally {
      setLoading(false)
    }
  }

  // Advanced filtering with useMemo
  const filteredPieces = useMemo(() => {
    return pieces.filter(p => {
      // Status filter
      if (statusFilter !== 'all' && p.status_display !== statusFilter) return false
      // Batch filter
      if (batchFilter !== 'all' && p.land_batch?.name !== batchFilter) return false
      // Size filter
      if (minSize && p.surface_area < parseFloat(minSize)) return false
      if (maxSize && p.surface_area > parseFloat(maxSize)) return false
      // Price filter (using full payment price)
      if (minPrice && p.selling_price_full < parseFloat(minPrice)) return false
      if (maxPrice && p.selling_price_full > parseFloat(maxPrice)) return false
      return true
    })
  }, [pieces, statusFilter, batchFilter, minSize, maxSize, minPrice, maxPrice])

  const stats = {
    total: pieces.length,
    available: pieces.filter(p => p.status_display === 'Available').length,
    reserved: pieces.filter(p => p.status_display === 'Reserved').length,
    sold: pieces.filter(p => p.status_display === 'Sold').length,
  }

  const resetFilters = () => {
    setStatusFilter('all')
    setBatchFilter('all')
    setMinSize('')
    setMaxSize('')
    setMinPrice('')
    setMaxPrice('')
  }

  const openDetails = (piece: PieceWithStatus) => {
    setSelectedPiece(piece)
    setDetailsOpen(true)
  }

  const handleSearch = () => {
    if (!pieceSearch.trim()) {
      setSearchedPieces([])
      return
    }
    
    const searchTerm = pieceSearch.trim()
    
    // Filter pieces by batch first if filter is set
    const filteredByBatch = batchFilter === 'all' 
      ? pieces 
      : pieces.filter(p => p.land_batch?.name === batchFilter)
    
    // Smart search - find ALL matching pieces, not just the first one
    const found = filteredByBatch.filter(p => {
      const pieceNum = String(p.piece_number)
      const pieceNumLower = pieceNum.toLowerCase().trim()
      const searchLower = searchTerm.toLowerCase().trim()
      
      // Strategy 1: Direct exact match (case insensitive)
      if (pieceNumLower === searchLower) return true
      
      // Strategy 2: Extract and compare numeric values (PRIMARY - handles "88" finding "P088")
      // Extract all digits from both strings
      const pieceDigits = pieceNum.replace(/\D/g, '')
      const searchDigits = searchTerm.replace(/\D/g, '')
      
      if (searchDigits && pieceDigits) {
        // Compare as integers - this is the key fix
        // "P088" -> "088" -> 88
        // "88" -> "88" -> 88
        // They match!
        const pieceInt = parseInt(pieceDigits, 10)
        const searchInt = parseInt(searchDigits, 10)
        
        if (!isNaN(pieceInt) && !isNaN(searchInt) && pieceInt === searchInt) {
          return true
        }
      }
      
      // Strategy 3: Normalize (remove P/# prefix and leading zeros) and compare
      const normalize = (str: string): string => {
        return str.toLowerCase()
          .replace(/^[p#]/, '')
          .replace(/^0+/, '')
          .trim()
      }
      
      const pieceNormalized = normalize(pieceNum)
      const searchNormalized = normalize(searchTerm)
      
      if (pieceNormalized && searchNormalized && pieceNormalized === searchNormalized) {
        return true
      }
      
      return false
    })
    
    setSearchedPieces(found)
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">توفر الأراضي</h1>
          <p className="text-sm text-muted-foreground mt-1">عرض حالة قطع الأراضي</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-green-600 font-medium">متاح: <strong>{stats.available}</strong></span>
          <span className="text-orange-600 font-medium">محجوز: <strong>{stats.reserved}</strong></span>
          <span className="text-red-600 font-medium">مباع: <strong>{stats.sold}</strong></span>
        </div>
      </div>

      {/* Search Bar - Centered */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <div className="flex-1 w-full sm:max-w-md">
                <Input
                  type="text"
                  placeholder="ابحث برقم القطعة (مثال: P001 أو 88)..."
                  value={pieceSearch}
                  maxLength={50}
                  onChange={(e) => {
                    const value = e.target.value
                    setPieceSearch(value)
                    if (!value.trim()) {
                      setSearchedPieces([])
                    } else {
                      debouncedSearch(value.trim())
                    }
                  }}
                  onKeyPress={handleSearchKeyPress}
                  className="w-full text-center sm:text-right"
                />
              </div>
              <Button onClick={handleSearch} className="w-full sm:w-auto">
                <Search className="h-4 w-4 ml-2" />
                بحث
              </Button>
            </div>
            {/* Batch name search and Show All button - Centered */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:max-w-md">
              <Select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value)
                  // Re-search with new batch filter
                  if (pieceSearch.trim()) {
                    handleSearch()
                  } else {
                    setSearchedPieces([])
                  }
                }}
                className="flex-1 w-full"
              >
                <option value="all">جميع المناطق</option>
                {batches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </Select>
              <Button 
                variant={showAll ? "default" : "outline"}
                onClick={() => {
                  setShowAll(!showAll)
                  if (!showAll) {
                    setSearchedPieces([])
                    setPieceSearch('')
                  }
                }}
                className="w-full sm:w-auto"
              >
                {showAll ? 'إخفاء الكل' : 'عرض الكل'}
              </Button>
            </div>
            {/* Status Filter */}
            <div className="w-full sm:max-w-md">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any)
                  if (!showAll && pieceSearch.trim()) {
                    handleSearch()
                  }
                }}
                className="w-full"
              >
                <option value="all">جميع الحالات</option>
                <option value="Available">متاح</option>
                <option value="Reserved">محجوز</option>
                <option value="Sold">مباع</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results - Show ALL matching pieces */}
      {searchedPieces.length > 0 && (
        <div className="space-y-3">
          {searchedPieces.map((searchedPiece) => (
            <Card key={searchedPiece.id} className={`border-2 ${
              searchedPiece.status_display === 'Available' ? 'border-green-500 bg-green-50' :
              searchedPiece.status_display === 'Reserved' ? 'border-orange-500 bg-orange-50' :
              'border-red-500 bg-red-50'
            }`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold">القطعة #{searchedPiece.piece_number}</h3>
                    <p className="text-sm text-muted-foreground">{searchedPiece.land_batch?.name}</p>
                    {searchedPiece.land_batch?.real_estate_tax_number && (
                      <p className="text-xs text-muted-foreground mt-1">
                        الرسم العقاري: {searchedPiece.land_batch.real_estate_tax_number}
                      </p>
                    )}
                  </div>
                  <Badge 
                    variant={
                      searchedPiece.status_display === 'Available' ? 'success' :
                      searchedPiece.status_display === 'Reserved' ? 'warning' : 'destructive'
                    }
                    className="text-base px-4 py-2"
                  >
                    {searchedPiece.status_display === 'Available' ? 'متاح' :
                     searchedPiece.status_display === 'Reserved' ? 'محجوز' : 'مباع'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">المساحة</p>
                    <p className="font-bold text-lg">{searchedPiece.surface_area} م²</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">السعر (كامل)</p>
                    <p className="font-bold text-lg">{formatCurrency(searchedPiece.selling_price_full)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">السعر (أقساط)</p>
                    <p className="font-bold text-lg">{formatCurrency(searchedPiece.selling_price_installment)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    <p className="font-bold text-lg">
                      {searchedPiece.status_display === 'Available' ? 'متاح للبيع' :
                       searchedPiece.status_display === 'Reserved' ? 'محجوز' : 'مباع'}
                    </p>
                  </div>
                </div>
                {searchedPiece.reservation && (
                  <div className="mt-4 p-3 bg-orange-100 rounded-lg space-y-1">
                    <p className="text-sm"><strong>العميل:</strong> {searchedPiece.reservation.client?.name || 'غير معروف'}</p>
                    <p className="text-sm"><strong>تاريخ الحجز:</strong> {formatDate(searchedPiece.reservation.reservation_date || searchedPiece.reservation.created_at)}</p>
                    {searchedPiece.reservation.small_advance_amount && (
                      <p className="text-sm"><strong>مبلغ الحجز:</strong> {formatCurrency(searchedPiece.reservation.small_advance_amount)}</p>
                    )}
                    {searchedPiece.reservation.reserved_until && (
                      <p className="text-sm"><strong>صالح حتى:</strong> {formatDate(searchedPiece.reservation.reserved_until)}</p>
                    )}
                  </div>
                )}
                {searchedPiece.sale && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    searchedPiece.sale.status === 'Completed' ? 'bg-red-100' : 'bg-orange-100'
                  }`}>
                    <p className="text-sm"><strong>العميل:</strong> {searchedPiece.sale.client?.name}</p>
                    <p className="text-sm"><strong>تاريخ البيع:</strong> {formatDate(searchedPiece.sale.sale_date)}</p>
                    <p className="text-sm"><strong>نوع الدفع:</strong> {searchedPiece.sale.payment_type === 'Full' ? 'كامل' : 'أقساط'}</p>
                    <p className="text-sm"><strong>حالة البيع:</strong> {
                      searchedPiece.sale.status === 'Completed' ? 'مكتمل' :
                      searchedPiece.sale.status === 'Pending' ? 'معلق' :
                      searchedPiece.sale.status === 'AwaitingPayment' ? 'قيد الدفع' :
                      'قيد المعالجة'
                    }</p>
                    {searchedPiece.sale.status !== 'Completed' && (
                      <p className="text-xs text-orange-700 mt-1">⚠️ البيع لم يكتمل بعد</p>
                    )}
                  </div>
                )}
                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={() => openDetails(searchedPiece)}
                >
                  عرض التفاصيل الكاملة
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {searchedPieces.length === 0 && pieceSearch.trim() && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <p className="text-yellow-800 font-medium">لم يتم العثور على قطعة برقم: {pieceSearch}</p>
              <div className="text-xs text-yellow-700 space-y-1">
                <p>جرب البحث بـ:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-2 py-1 bg-yellow-100 rounded">P{pieceSearch}</span>
                  <span className="px-2 py-1 bg-yellow-100 rounded">#{pieceSearch}</span>
                  {!isNaN(Number(pieceSearch)) && (
                    <>
                      <span className="px-2 py-1 bg-yellow-100 rounded">{pieceSearch.padStart(3, '0')}</span>
                      <span className="px-2 py-1 bg-yellow-100 rounded">P{pieceSearch.padStart(3, '0')}</span>
                    </>
                  )}
                </div>
              </div>
              {pieces.length > 0 && (
                <div className="mt-4 pt-3 border-t border-yellow-300">
                  <p className="text-xs font-medium text-yellow-800 mb-2">أمثلة على أرقام القطع المتاحة:</p>
                  <div className="flex flex-wrap gap-1 justify-center max-h-32 overflow-y-auto">
                    {pieces.slice(0, 15).map((p, i) => (
                      <span key={i} className="px-2 py-1 bg-yellow-100 rounded text-xs">
                        {p.piece_number}
                      </span>
                    ))}
                    {pieces.length > 15 && (
                      <span className="px-2 py-1 text-xs text-yellow-700">... و {pieces.length - 15} أكثر</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}


      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل القطعة #{selectedPiece?.piece_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPiece && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المجموعة:</span>
                  <span className="font-medium">{selectedPiece.land_batch?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المساحة:</span>
                  <span className="font-medium">{selectedPiece.surface_area} م²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سعر الشراء:</span>
                  <span className="font-medium">{formatCurrency(selectedPiece.purchase_cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سعر البيع (كامل):</span>
                  <span className="font-medium">{formatCurrency(selectedPiece.selling_price_full)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سعر البيع (أقساط):</span>
                  <span className="font-medium">{formatCurrency(selectedPiece.selling_price_installment)}</span>
                </div>
              </div>

              {/* Status */}
              <div className={`p-3 rounded-lg ${
                selectedPiece.status_display === 'Available' ? 'bg-green-100' :
                selectedPiece.status_display === 'Reserved' ? 'bg-orange-100' : 'bg-red-100'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={
                    selectedPiece.status_display === 'Available' ? 'success' :
                    selectedPiece.status_display === 'Reserved' ? 'warning' : 'destructive'
                  }>
                    {selectedPiece.status_display === 'Available' ? 'متاح للبيع' :
                     selectedPiece.status_display === 'Reserved' ? 'محجوز' : 'مباع'}
                  </Badge>
                </div>

                {/* Reservation Details */}
                {selectedPiece.status_display === 'Reserved' && selectedPiece.reservation && (
                  <div className="space-y-1 text-sm">
                    <p><strong>العميل:</strong> {selectedPiece.reservation.client?.name || 'غير معروف'}</p>
                    <p><strong>تاريخ الحجز:</strong> {formatDate(selectedPiece.reservation.reservation_date || selectedPiece.reservation.created_at)}</p>
                    {selectedPiece.reservation.small_advance_amount && (
                      <p><strong>مبلغ الحجز:</strong> {formatCurrency(selectedPiece.reservation.small_advance_amount)}</p>
                    )}
                    {selectedPiece.reservation.reserved_until && (
                      <p><strong>صالح حتى:</strong> {formatDate(selectedPiece.reservation.reserved_until)}</p>
                    )}
                  </div>
                )}

                {/* Sale Details */}
                {selectedPiece.sale && (
                  <div className="space-y-1 text-sm">
                    <p><strong>العميل:</strong> {selectedPiece.sale.client?.name}</p>
                    <p><strong>تاريخ البيع:</strong> {formatDate(selectedPiece.sale.sale_date)}</p>
                    <p><strong>نوع الدفع:</strong> {selectedPiece.sale.payment_type === 'Full' ? 'كامل' : 'أقساط'}</p>
                    <p><strong>السعر:</strong> {formatCurrency(selectedPiece.sale.total_selling_price)}</p>
                    <p><strong>حالة البيع:</strong> {
                      selectedPiece.sale.status === 'Completed' ? 'مكتمل' :
                      selectedPiece.sale.status === 'Pending' ? 'معلق' :
                      selectedPiece.sale.status === 'AwaitingPayment' ? 'قيد الدفع' :
                      'قيد المعالجة'
                    }</p>
                    {selectedPiece.sale.status !== 'Completed' && (
                      <p className="text-xs text-orange-700 mt-1">⚠️ البيع لم يكتمل بعد - القطعة محجوزة</p>
                    )}
                  </div>
                )}

                {/* Available */}
                {selectedPiece.status_display === 'Available' && (
                  <p className="text-sm text-green-700">هذه القطعة متاحة للبيع أو الحجز</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
