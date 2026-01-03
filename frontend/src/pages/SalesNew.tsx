import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sanitizeText, sanitizePhone, sanitizeCIN } from '@/lib/sanitize'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { Sale, Client, LandPiece, Installment } from '@/types/database'

// Types for per-piece tracking
interface PieceSale {
  id: string
  saleId: string
  pieceId: string
  pieceName: string
  batchName: string
  surfaceArea: number
  clientId: string
  clientName: string
  paymentType: 'Full' | 'Installment'
  price: number
  cost: number
  profit: number
  saleDate: string
  // Reservation (عربون) - paid on spot
  reservationAmount: number
  // Remaining amount after payments
  remainingAmount?: number
  // Full payment fields
  fullPaymentConfirmed: boolean
  // Installment fields
  numberOfInstallments: number | null
  bigAdvanceAmount: number
  bigAdvanceConfirmed: boolean
  bigAdvanceDueDate: string | null
  monthlyInstallmentAmount: number | null
  installmentStartDate: string | null
  installmentsData: Installment[]
  // Status - matches SaleStatus type
  status: 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed' | 'Cancelled'
}

interface ClientMonthlySummary {
  clientId: string
  clientName: string
  totalDueThisMonth: number
  overdueAmount: number
  piecesCount: number
}

export function SalesNew() {
  const { hasPermission } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [pieces, setPieces] = useState<LandPiece[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // View state
  
  // New Sale Dialog
  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState('')
  const [clientSearch, setClientSearch] = useState('') // Search for clients by ID, phone, name
  const [selectedPieces, setSelectedPieces] = useState<string[]>([])
  const [pieceSearch, setPieceSearch] = useState('') // Search for land pieces by number
  const [paymentType, setPaymentType] = useState<'Full' | 'Installment'>('Full')
  const [numberOfInstallments, setNumberOfInstallments] = useState('12')
  const [reservationAmount, setReservationAmount] = useState('')
  
  // New Client Dialog (from sale popup)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')
  const [newClientCin, setNewClientCin] = useState('')
  
  // Confirm dialogs
  const [confirmFullOpen, setConfirmFullOpen] = useState(false)
  const [confirmBigAdvanceOpen, setConfirmBigAdvanceOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<PieceSale | null>(null)
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [bigAdvancePaidAmount, setBigAdvancePaidAmount] = useState('')
  const [bigAdvancePaidDate, setBigAdvancePaidDate] = useState(new Date().toISOString().split('T')[0])
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // UI/UX: Filter and sort states
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed'>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'Full' | 'Installment'>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'client' | 'price' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [salesRes, clientsRes, piecesRes, installmentsRes, paymentsRes] = await Promise.all([
        supabase.from('sales').select('*').order('sale_date', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
        supabase.from('land_pieces').select('*, land_batch:land_batches(name)'),
        supabase.from('installments').select('*').order('due_date'),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      ])

      setSales((salesRes.data || []) as Sale[])
      setClients((clientsRes.data || []) as Client[])
      setPieces((piecesRes.data || []) as any[])
      setInstallments((installmentsRes.data || []) as Installment[])
      setPayments((paymentsRes.data || []) as any[])
    } catch (error) {
      setErrorMessage('خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  // Transform sales data to per-piece format
  const pieceSales = useMemo((): PieceSale[] => {
    const result: PieceSale[] = []
    
    sales.forEach(sale => {
      const client = clients.find(c => c.id === sale.client_id)
      const saleInstallments = installments.filter(i => i.sale_id === sale.id)
      const salePayments = payments.filter(p => p.sale_id === sale.id)
      
      // Calculate total paid for this sale
      const totalPaid = salePayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // For each piece in the sale, create a separate entry
      sale.land_piece_ids.forEach((pieceId) => {
        const piece = pieces.find(p => p.id === pieceId) as any
        if (!piece) return
        
        const isInstallment = sale.payment_type === 'Installment'
        const pricePerPiece = sale.total_selling_price / sale.land_piece_ids.length
        const costPerPiece = sale.total_purchase_cost / sale.land_piece_ids.length
        const paidPerPiece = totalPaid / sale.land_piece_ids.length
        const remainingPerPiece = Math.max(0, pricePerPiece - paidPerPiece)
        
        // Determine status based on payment state
        let status: PieceSale['status'] = 'Pending'
        const isConfirmed = (sale as any).is_confirmed === true
        
        if (sale.status === 'Cancelled') {
          status = 'Cancelled'
        } else if (isInstallment) {
          // Installment sale: check big advance and installments
          if (!isConfirmed) {
            status = 'AwaitingPayment' // قيد الدفع - waiting for big advance
          } else {
            // Big advance paid - check if all installments are paid
            const allPaid = saleInstallments.length > 0 && 
              saleInstallments.every(i => i.status === 'Paid')
            status = allPaid ? 'Completed' : 'InstallmentsOngoing' // أقساط جارية
          }
        } else {
          // Full payment sale
          status = sale.status === 'Completed' ? 'Completed' : 'AwaitingPayment'
        }
        
        result.push({
          id: `${sale.id}-${pieceId}`,
          saleId: sale.id,
          pieceId,
          pieceName: `#${piece.piece_number}`,
          batchName: piece.land_batch?.name || '',
          surfaceArea: piece.surface_area,
          clientId: sale.client_id,
          clientName: client?.name || 'غير معروف',
          paymentType: isInstallment ? 'Installment' : 'Full',
          price: pricePerPiece,
          cost: costPerPiece,
          profit: pricePerPiece - costPerPiece,
          saleDate: sale.sale_date,
          reservationAmount: (sale.small_advance_amount || 0) / sale.land_piece_ids.length,
          remainingAmount: remainingPerPiece, // Add remaining amount
          fullPaymentConfirmed: sale.status === 'Completed',
          numberOfInstallments: sale.number_of_installments,
          bigAdvanceAmount: (sale.big_advance_amount || 0) / sale.land_piece_ids.length,
          bigAdvanceConfirmed: (sale as any).is_confirmed || false,
          bigAdvanceDueDate: (sale as any).big_advance_due_date,
          monthlyInstallmentAmount: sale.monthly_installment_amount 
            ? sale.monthly_installment_amount / sale.land_piece_ids.length 
            : null,
          installmentStartDate: sale.installment_start_date,
          installmentsData: saleInstallments,
          status,
        })
      })
    })
    
    return result
  }, [sales, clients, pieces, installments, payments])

  // Separate full payment and installment sales (exclude cancelled)
  const fullPaymentSales = pieceSales.filter(s => s.paymentType === 'Full' && s.status !== 'Cancelled')
  const installmentSales = pieceSales.filter(s => s.paymentType === 'Installment' && s.status !== 'Cancelled')
  const _cancelledSales = pieceSales.filter(s => s.status === 'Cancelled')

  // Filtered and sorted sales for display
  const filteredAndSortedSales = useMemo(() => {
    let filtered = pieceSales.filter(s => s.status !== 'Cancelled')

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter)
    }

    // Apply payment type filter
    if (paymentTypeFilter !== 'all') {
      filtered = filtered.filter(s => s.paymentType === paymentTypeFilter)
    }

    // Apply client filter
    if (clientFilter) {
      const search = clientFilter.toLowerCase()
      filtered = filtered.filter(s => 
        s.clientName.toLowerCase().includes(search) ||
        s.clientId.toLowerCase().includes(search)
      )
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime()
          break
        case 'client':
          comparison = a.clientName.localeCompare(b.clientName)
          break
        case 'price':
          comparison = a.price - b.price
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [pieceSales, statusFilter, paymentTypeFilter, clientFilter, sortBy, sortOrder])

  // Calculate monthly summary per client
  const clientMonthlySummary = useMemo((): ClientMonthlySummary[] => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    const summaryMap = new Map<string, ClientMonthlySummary>()
    const processedSaleIds = new Set<string>() // Track processed sales to avoid double-counting
    
    installmentSales.forEach(sale => {
      if (!sale.bigAdvanceConfirmed || !sale.monthlyInstallmentAmount) return
      
      if (!summaryMap.has(sale.clientId)) {
        summaryMap.set(sale.clientId, {
          clientId: sale.clientId,
          clientName: sale.clientName,
          totalDueThisMonth: 0,
          overdueAmount: 0,
          piecesCount: 0,
        })
      }
      
      const summary = summaryMap.get(sale.clientId)!
      summary.piecesCount++
      
      // Only count installments once per sale (avoid double-counting for multi-piece sales)
      if (!processedSaleIds.has(sale.saleId)) {
        processedSaleIds.add(sale.saleId)
        
        // Check installments due this month
        sale.installmentsData.forEach(inst => {
          const dueDate = new Date(inst.due_date)
          if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
            const remaining = inst.amount_due - inst.amount_paid
            if (remaining > 0) {
              summary.totalDueThisMonth += remaining
            }
          }
          // Check overdue
          if (dueDate < now && inst.status !== 'Paid') {
            summary.overdueAmount += inst.amount_due - inst.amount_paid
          }
        })
      }
    })
    
    return Array.from(summaryMap.values()).filter(s => s.totalDueThisMonth > 0 || s.overdueAmount > 0)
  }, [installmentSales])

  // Available pieces for new sale
  const availablePieces = pieces.filter((p: any) => p.status === 'Available')

  // Create new sale (supports multiple pieces)
  const createSale = async () => {
    if (isSubmitting) return // Prevent double submission
    
    // Authorization check
    if (!hasPermission('create_sales')) {
      setErrorMessage('ليس لديك صلاحية لإنشاء مبيعات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    
    if (!selectedClient || selectedPieces.length === 0) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(true)
    try {
      // Double-check that selected pieces are still available (prevent double-selling)
      const { data: currentPieces } = await supabase
        .from('land_pieces')
        .select('id, status, piece_number')
        .in('id', selectedPieces)
      
      const unavailablePieces = (currentPieces || []).filter((p: any) => p.status !== 'Available')
      if (unavailablePieces.length > 0) {
        const pieceNumbers = unavailablePieces.map((p: any) => `#${p.piece_number}`).join(', ')
        setErrorMessage(`القطع التالية لم تعد متاحة: ${pieceNumbers}. يرجى تحديث الصفحة واختيار قطع أخرى.`)
        fetchData() // Refresh data
        setIsSubmitting(false)
        return
      }

      // Calculate totals from selected pieces using m² pricing
      const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id)) as any[]
      const totalCost = selectedPieceObjects.reduce((sum, p) => sum + (p.purchase_cost || 0), 0)
      const totalSurface = selectedPieceObjects.reduce((sum, p) => sum + (p.surface_area || 0), 0)
      
      // Calculate total price based on payment type and pre-set prices
      const totalPrice = selectedPieceObjects.reduce((sum, p) => {
        if (paymentType === 'Full') {
          return sum + (p.selling_price_full || 0)
        } else {
          return sum + (p.selling_price_installment || 0)
        }
      }, 0)
      
      if (totalPrice <= 0) {
        setErrorMessage('يرجى التأكد من أن القطع المختارة لها أسعار محددة. يمكنك تحديد الأسعار من صفحة إدارة الأراضي عند إنشاء الدفعة.')
        setIsSubmitting(false)
        return
      }
      
      // Validate calculation
      if (isNaN(totalPrice) || totalPrice <= 0) {
        setErrorMessage('خطأ في حساب السعر الإجمالي. يرجى التحقق من البيانات')
        setIsSubmitting(false)
        return
      }
      
      const reservation = parseFloat(reservationAmount) || 0
      
      // Validate reservation doesn't exceed total price
      if (reservation > totalPrice) {
        setErrorMessage('مبلغ العربون لا يمكن أن يكون أكبر من السعر الإجمالي')
        setIsSubmitting(false)
        return
      }
      
      const saleData: any = {
        client_id: selectedClient,
        land_piece_ids: selectedPieces, // Multiple pieces
        payment_type: paymentType,
        total_purchase_cost: totalCost,
        total_selling_price: totalPrice, // Calculated from m² price
        profit_margin: totalPrice - totalCost,
        small_advance_amount: reservation, // عربون - reservation amount
        big_advance_amount: 0, // Will be set at confirmation
        number_of_installments: paymentType === 'Installment' ? (numberOfInstallments ? parseInt(numberOfInstallments) || null : null) : null,
        status: 'Pending',
        sale_date: new Date().toISOString().split('T')[0], // Auto-default to current date
      }

      const { data: newSale, error } = await supabase.from('sales').insert([saleData] as any).select().single()
      if (error) throw error

      // Create SmallAdvance payment if reservation amount > 0
      if (reservation > 0 && newSale) {
        await supabase.from('payments').insert([{
          client_id: selectedClient,
          sale_id: newSale.id,
          amount_paid: reservation,
          payment_type: 'SmallAdvance',
          payment_date: new Date().toISOString().split('T')[0],
        }] as any)
      }

      // Update all selected pieces status to Reserved
      for (const pieceId of selectedPieces) {
        await supabase
          .from('land_pieces')
          .update({ status: 'Reserved' } as any)
          .eq('id', pieceId)
      }

      setNewSaleOpen(false)
      resetForm()
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إنشاء البيع')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedClient('')
    setClientSearch('')
    setSelectedPieces([])
    setPieceSearch('')
    setPaymentType('Full')
    setNumberOfInstallments('12')
    setReservationAmount('')
    setNewClientName('')
    setNewClientPhone('')
    setNewClientAddress('')
    setNewClientCin('')
  }
  
  // Calculate total price based on selected pieces and payment type
  const calculatedTotalPrice = useMemo(() => {
    if (selectedPieces.length === 0) return 0
    const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id))
    return selectedPieceObjects.reduce((sum, p) => {
      if (paymentType === 'Full') {
        return sum + (p.selling_price_full || 0)
      } else {
        return sum + (p.selling_price_installment || 0)
      }
    }, 0)
  }, [selectedPieces, paymentType, pieces])
  
  // Calculate total surface
  const calculatedTotalSurface = useMemo(() => {
    if (selectedPieces.length === 0) return 0
    const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id))
    return selectedPieceObjects.reduce((sum, p) => sum + (p.surface_area || 0), 0)
  }, [selectedPieces, pieces])

  const [creatingClient, setCreatingClient] = useState(false)

  // Create new client from sale popup
  const createNewClient = async () => {
    if (creatingClient) return // Prevent double submission
    setCreatingClient(true)
    setErrorMessage(null)
    
    // Sanitize inputs
    const sanitizedName = sanitizeText(newClientName)
    const sanitizedCIN = sanitizeCIN(newClientCin)
    const sanitizedPhone = newClientPhone ? sanitizePhone(newClientPhone) : null
    const sanitizedAddress = newClientAddress ? sanitizeText(newClientAddress) : null
    
    if (!sanitizedName || !sanitizedCIN) {
      setErrorMessage('يرجى إدخال اسم العميل ورقم CIN')
      setCreatingClient(false)
      return
    }
    
    try {
      // Check for duplicate CIN
      const { data: existingClients, error: checkError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('cin', sanitizedCIN)
        .limit(1)
      
      // Handle 406 error gracefully (might be RLS issue)
      if (checkError && checkError.code !== 'PGRST116') {
        // Continue anyway - let the insert handle duplicates
      }
      
      const existingClient = existingClients && existingClients.length > 0 ? existingClients[0] : null

      if (existingClient) {
        setErrorMessage(`يوجد عميل بنفس رقم CIN: ${existingClient.name}`)
        setCreatingClient(false)
        return
      }

      const { data, error } = await supabase
        .from('clients')
        .insert([{
          name: sanitizedName,
          cin: sanitizedCIN,
          phone: sanitizedPhone,
          address: sanitizedAddress,
          client_type: 'Individual',
        }])
        .select()
        .single()
      
      if (error) throw error
      
      // Add to clients list and automatically select the new client
      setClients([...clients, data])
      setSelectedClient(data.id)
      setClientSearch(data.name)
      
      // Reset and close new client dialog
      setNewClientName('')
      setNewClientPhone('')
      setNewClientAddress('')
      setNewClientCin('')
      setNewClientOpen(false)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إضافة العميل')
    } finally {
      setCreatingClient(false)
    }
  }

  // Debounced client search
  const [debouncedClientSearch, setDebouncedClientSearch] = useState('')
  const debouncedClientSearchFn = useCallback(
    debounce((value: string) => setDebouncedClientSearch(value), 300),
    []
  )

  // Debounced piece search
  const [debouncedPieceSearch, setDebouncedPieceSearch] = useState('')
  const debouncedPieceSearchFn = useCallback(
    debounce((value: string) => setDebouncedPieceSearch(value), 300),
    []
  )

  // Filter clients by search (ID, phone, name)
  const filteredClients = useMemo(() => {
    if (!debouncedClientSearch) return clients
    const search = debouncedClientSearch.toLowerCase()
    return clients.filter(client => 
      client.id.toLowerCase().includes(search) ||
      client.phone?.toLowerCase().includes(search) ||
      client.name.toLowerCase().includes(search) ||
      client.cin?.toLowerCase().includes(search)
    )
  }, [clients, debouncedClientSearch])

  // Filter pieces by land number
  const filteredAvailablePieces = useMemo(() => {
    if (!debouncedPieceSearch) return availablePieces
    const search = debouncedPieceSearch.toLowerCase()
    return availablePieces.filter((piece: any) => 
      piece.piece_number?.toString().toLowerCase().includes(search)
    )
  }, [availablePieces, debouncedPieceSearch])

  // Confirm full payment - for a single piece only
  const confirmFullPayment = async () => {
    if (!selectedSale) return
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      // Get the original sale
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', selectedSale.saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const pieceCount = sale.land_piece_ids.length

      // If this sale has multiple pieces, split it - create a new sale for this piece
      if (pieceCount > 1) {
        // Calculate per-piece values
        const pricePerPiece = sale.total_selling_price / pieceCount
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount
        const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount

        // Create a new sale for just this piece
        const { data: newSale, error: newSaleError } = await supabase
          .from('sales')
          .insert([{
            client_id: sale.client_id,
            land_piece_ids: [selectedSale.pieceId],
            payment_type: sale.payment_type,
            total_purchase_cost: costPerPiece,
            total_selling_price: pricePerPiece,
            profit_margin: profitPerPiece,
            small_advance_amount: reservationPerPiece,
            big_advance_amount: 0,
            number_of_installments: null,
            monthly_installment_amount: null,
            status: 'Completed',
            sale_date: sale.sale_date,
            notes: sale.notes,
          }] as any)
          .select()
          .single()

        if (newSaleError) throw newSaleError

        // Update the piece status
        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        // Record payment for this piece
        await supabase.from('payments').insert([{
          client_id: selectedSale.clientId,
          sale_id: newSale.id,
          amount_paid: pricePerPiece,
          payment_type: 'Full',
          payment_date: new Date().toISOString().split('T')[0],
        }] as any)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== selectedSale.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', selectedSale.saleId)

        // If there are installments, we need to update them too
        if (sale.payment_type === 'Installment') {
          const { data: existingInstallments } = await supabase
            .from('installments')
            .select('*')
            .eq('sale_id', sale.id)

          if (existingInstallments && existingInstallments.length > 0) {
            // Update existing installments to reflect remaining pieces
            for (const inst of existingInstallments) {
              await supabase
                .from('installments')
                .update({
                  amount_due: (inst.amount_due as number) * remainingCount / pieceCount,
                  amount_paid: (inst.amount_paid as number) * remainingCount / pieceCount,
                  stacked_amount: (inst.stacked_amount as number) * remainingCount / pieceCount,
                } as any)
                .eq('id', inst.id)
            }
          }
        }
      } else {
        // Single piece sale - update sale and piece
        await supabase
          .from('sales')
          .update({ status: 'Completed' } as any)
          .eq('id', selectedSale.saleId)

        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        await supabase.from('payments').insert([{
          client_id: selectedSale.clientId,
          sale_id: selectedSale.saleId,
          amount_paid: selectedSale.price,
          payment_type: 'Full',
          payment_date: new Date().toISOString().split('T')[0],
        }] as any)
      }

      setConfirmFullOpen(false)
      setSelectedSale(null)
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تأكيد الدفع. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Confirm big advance - for a single piece only
  const confirmBigAdvance = async () => {
    if (!selectedSale || !installmentStartDate || !bigAdvancePaidAmount) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      return
    }
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', selectedSale.saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const numInstallments = selectedSale.numberOfInstallments || 12
      const bigAdvPaid = parseFloat(bigAdvancePaidAmount)
      
      const pieceCount = sale.land_piece_ids.length
      const pricePerPiece = sale.total_selling_price / pieceCount
      const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount
      // عربون is part of advance payment, so remaining = price - (bigAdvance + reservation)
      const totalAdvance = bigAdvPaid + reservationPerPiece
      const remaining = pricePerPiece - totalAdvance
      const monthlyAmount = remaining / numInstallments

      // If this sale has multiple pieces, split it - create a new sale for this piece
      if (pieceCount > 1) {
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount

        // Create a new sale for just this piece
        const { data: newSale, error: newSaleError } = await supabase
          .from('sales')
          .insert([{
            client_id: sale.client_id,
            land_piece_ids: [selectedSale.pieceId],
            payment_type: 'Installment',
            total_purchase_cost: costPerPiece,
            total_selling_price: pricePerPiece,
            profit_margin: profitPerPiece,
            small_advance_amount: reservationPerPiece,
            big_advance_amount: totalAdvance, // Include reservation in big advance
            number_of_installments: numInstallments,
            monthly_installment_amount: monthlyAmount,
            installment_start_date: installmentStartDate,
            status: 'Pending', // Use 'Pending' for ongoing installments (database enum doesn't have 'InstallmentsOngoing')
            is_confirmed: true,
            sale_date: sale.sale_date,
            notes: sale.notes,
          }] as any)
          .select()
          .single()

        if (newSaleError) throw newSaleError

        // Update the piece status
        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        // Record big advance payment for this piece (includes reservation)
        await supabase.from('payments').insert([{
          client_id: sale.client_id,
          sale_id: newSale.id,
          amount_paid: totalAdvance, // Include reservation in big advance payment
          payment_type: 'BigAdvance',
          payment_date: new Date().toISOString().split('T')[0],
        }] as any)

        // Create installments for this piece
        const installmentsToCreate = []
        const startDate = new Date(installmentStartDate)
        for (let i = 0; i < numInstallments; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          installmentsToCreate.push({
            sale_id: newSale.id,
            installment_number: i + 1,
            amount_due: monthlyAmount,
            amount_paid: 0,
            stacked_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'Unpaid',
          })
        }
        await supabase.from('installments').insert(installmentsToCreate as any)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== selectedSale.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', selectedSale.saleId)

        // Update existing installments to reflect remaining pieces
        const { data: existingInstallments } = await supabase
          .from('installments')
          .select('*')
          .eq('sale_id', sale.id)

        if (existingInstallments && existingInstallments.length > 0) {
          for (const inst of existingInstallments) {
            await supabase
              .from('installments')
              .update({
                amount_due: (inst.amount_due as number) * remainingCount / pieceCount,
                amount_paid: (inst.amount_paid as number) * remainingCount / pieceCount,
                stacked_amount: (inst.stacked_amount as number) * remainingCount / pieceCount,
              } as any)
              .eq('id', inst.id)
          }
        }
      } else {
        // Single piece sale - standard flow
        await supabase
          .from('sales')
          .update({
            is_confirmed: true,
            big_advance_amount: totalAdvance, // Include reservation in big advance
            monthly_installment_amount: monthlyAmount,
            installment_start_date: installmentStartDate,
            status: 'Pending', // Use 'Pending' for ongoing installments (database enum doesn't have 'InstallmentsOngoing')
          } as any)
          .eq('id', selectedSale.saleId)

        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        await supabase.from('payments').insert([{
          client_id: sale.client_id,
          sale_id: sale.id,
          amount_paid: totalAdvance, // Include reservation in big advance payment
          payment_type: 'BigAdvance',
          payment_date: new Date().toISOString().split('T')[0],
        }] as any)

        const installmentsToCreate = []
        const startDate = new Date(installmentStartDate)
        for (let i = 0; i < numInstallments; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          installmentsToCreate.push({
            sale_id: sale.id,
            installment_number: i + 1,
            amount_due: monthlyAmount,
            amount_paid: 0,
            stacked_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'Unpaid',
          })
        }
        await supabase.from('installments').insert(installmentsToCreate as any)
      }

      setConfirmBigAdvanceOpen(false)
      setSelectedSale(null)
      setInstallmentStartDate('')
      setBigAdvancePaidAmount('')
      setBigAdvancePaidDate(new Date().toISOString().split('T')[0])
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تأكيد الدفعة الأولى. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cancel sale - removes all related data
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [saleToCancel, setSaleToCancel] = useState<PieceSale | null>(null)
  const [refundAmount, setRefundAmount] = useState('')

  // Check how many pieces are in a sale
  const [salePieceCount, setSalePieceCount] = useState(1)

  const openCancelDialog = async (sale: PieceSale) => {
    setSaleToCancel(sale)
    setRefundAmount('')
    
    // Check if this sale has multiple pieces
    const { data } = await supabase
      .from('sales')
      .select('land_piece_ids')
      .eq('id', sale.saleId)
      .single()
    
    if (data) {
      setSalePieceCount((data as any).land_piece_ids?.length || 1)
    }
    
    setCancelDialogOpen(true)
  }

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const cancelSale = async () => {
    if (!saleToCancel) return
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const saleId = saleToCancel.saleId
      const refund = parseFloat(refundAmount) || 0

      // Get the original sale
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const pieceCount = sale.land_piece_ids.length

      // If this sale has multiple pieces, remove only this piece
      if (pieceCount > 1) {
        // Calculate per-piece values
        const pricePerPiece = sale.total_selling_price / pieceCount
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount
        const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount

        // Get payments and installments for this sale
        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('sale_id', saleId)

        const { data: installments } = await supabase
          .from('installments')
          .select('*')
          .eq('sale_id', saleId)

        // Delete payments related to this piece (proportional)
        if (payments && payments.length > 0) {
          for (const payment of payments) {
            const piecePaymentAmount = payment.amount_paid / pieceCount
            if (piecePaymentAmount > 0) {
              // Update payment to reflect remaining pieces
              await supabase
                .from('payments')
                .update({ amount_paid: payment.amount_paid - piecePaymentAmount } as any)
                .eq('id', payment.id)
            }
          }
        }

        // Delete installments related to this piece (proportional)
        if (installments && installments.length > 0) {
          for (const inst of installments) {
            const pieceAmount = (inst.amount_due as number) / pieceCount
            const piecePaid = (inst.amount_paid as number) / pieceCount
            const pieceStacked = (inst.stacked_amount as number) / pieceCount

            // Update installment to reflect remaining pieces
            await supabase
              .from('installments')
              .update({
                amount_due: (inst.amount_due as number) - pieceAmount,
                amount_paid: (inst.amount_paid as number) - piecePaid,
                stacked_amount: (inst.stacked_amount as number) - pieceStacked,
              } as any)
              .eq('id', inst.id)
          }
        }

        // If refund amount specified, record it
        if (refund > 0) {
          await supabase.from('payments').insert([{
            client_id: saleToCancel.clientId,
            sale_id: saleId,
            amount_paid: refund,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
          }] as any)
        }

        // Update only this specific piece back to Available
        await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', saleToCancel.pieceId)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== saleToCancel.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', saleId)
      } else {
        // Single piece sale - cancel the entire sale
        // 1. Delete all installments for this sale
        await supabase
          .from('installments')
          .delete()
          .eq('sale_id', saleId)

        // 2. Delete all payments for this sale
        await supabase
          .from('payments')
          .delete()
          .eq('sale_id', saleId)

        // 3. If refund amount specified, record it
        if (refund > 0) {
          await supabase.from('payments').insert([{
            client_id: saleToCancel.clientId,
            sale_id: saleId,
            amount_paid: refund,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
          }] as any)
        }

        // 4. Update land piece back to Available - CRITICAL: Must be done before sale update
        const { error: pieceError } = await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', saleToCancel.pieceId)

        if (pieceError) {
          throw pieceError
        }

        // 5. Cancel the entire sale (single piece sale)
        await supabase
          .from('sales')
          .update({ status: 'Cancelled' } as any)
          .eq('id', saleId)
      }

      setCancelDialogOpen(false)
      setSaleToCancel(null)
      setRefundAmount('')
      
      // Force refresh of pieces to ensure cancelled piece shows as available
      await fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إلغاء البيع. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {errorMessage && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-3">
            <p className="text-destructive text-sm">{errorMessage}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setErrorMessage(null)}
              className="mt-2"
            >
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">المبيعات</h1>
        {hasPermission('create_sales') && (
          <Button 
            onClick={() => setNewSaleOpen(true)} 
            size="sm"
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 ml-1" />
            بيع جديد
          </Button>
        )}
      </div>

      {/* Compact Stats - Inline */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
        <span className="text-muted-foreground">إجمالي: <strong className="text-blue-600">{filteredAndSortedSales.length}</strong></span>
        <span className="text-muted-foreground">مكتمل: <strong className="text-green-600">{filteredAndSortedSales.filter(s => s.status === 'Completed').length}</strong></span>
        <span className="text-muted-foreground">قيد الدفع: <strong className="text-yellow-600">{filteredAndSortedSales.filter(s => s.status === 'AwaitingPayment').length}</strong></span>
        <span className="text-muted-foreground">أقساط: <strong className="text-purple-600">{filteredAndSortedSales.filter(s => s.status === 'InstallmentsOngoing').length}</strong></span>
      </div>

      {/* Compact Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="text"
          placeholder="بحث..."
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="flex-1"
        />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full sm:w-40">
          <option value="all">الكل</option>
          <option value="Pending">معلق</option>
          <option value="AwaitingPayment">قيد الدفع</option>
          <option value="InstallmentsOngoing">أقساط</option>
          <option value="Completed">مكتمل</option>
        </Select>
      </div>

      {/* Compact Sales Table */}
      {filteredAndSortedSales.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">لا توجد مبيعات</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">العميل</TableHead>
                    <TableHead className="w-[120px]">القطعة</TableHead>
                    <TableHead className="w-[80px]">النوع</TableHead>
                    <TableHead className="w-[100px] text-right">السعر</TableHead>
                    <TableHead className="w-[100px] text-right">عربون</TableHead>
                    <TableHead className="w-[100px] text-right">المتبقي</TableHead>
                    <TableHead className="w-[100px]">الحالة</TableHead>
                    <TableHead className="w-[120px] text-center">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedSales.map(sale => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.clientName}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{sale.batchName} - {sale.pieceName}</div>
                          <div className="text-xs text-muted-foreground">{sale.surfaceArea} م²</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sale.paymentType === 'Full' ? 'success' : 'secondary'} className="text-xs">
                          {sale.paymentType === 'Full' ? 'كامل' : 'أقساط'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(sale.price)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(sale.reservationAmount)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency((sale as any).remainingAmount ?? sale.price)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            sale.status === 'Completed' ? 'success' :
                            sale.status === 'InstallmentsOngoing' ? 'secondary' :
                            sale.status === 'AwaitingPayment' ? 'warning' : 'destructive'
                          }
                          className="text-xs"
                        >
                          {sale.status === 'Completed' ? 'مكتمل' :
                           sale.status === 'InstallmentsOngoing' ? 'أقساط' :
                           sale.status === 'AwaitingPayment' ? 'قيد الدفع' :
                           sale.status === 'Pending' ? 'معلق' : 'ملغي'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          {sale.paymentType === 'Full' && !sale.fullPaymentConfirmed && hasPermission('edit_sales') && (
                            <Button 
                              size="sm" 
                              onClick={() => { setSelectedSale(sale); setConfirmFullOpen(true) }} 
                              className="bg-green-600 hover:bg-green-700 text-xs px-2"
                            >
                              تأكيد
                            </Button>
                          )}
                          {sale.paymentType === 'Installment' && !sale.bigAdvanceConfirmed && hasPermission('edit_sales') && (
                            <Button 
                              size="sm" 
                              onClick={() => { setSelectedSale(sale); setConfirmBigAdvanceOpen(true) }} 
                              className="bg-blue-600 hover:bg-blue-700 text-xs px-2"
                            >
                              تأكيد
                            </Button>
                          )}
                          {hasPermission('edit_sales') && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => openCancelDialog(sale)}
                              className="text-destructive hover:bg-destructive/10 text-xs px-2"
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Sale Dialog */}
      <Dialog open={newSaleOpen} onOpenChange={setNewSaleOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>بيع جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>العميل</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewClientOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة عميل جديد
                </Button>
              </div>
              <Input
                type="text"
                placeholder="بحث عن العميل (الاسم، رقم الهاتف، أو ID)..."
                value={clientSearch}
                maxLength={255}
                onChange={e => {
                  setClientSearch(e.target.value)
                  debouncedClientSearchFn(e.target.value)
                  // Auto-select if exact match found
                  const exactMatch = clients.find(c => 
                    c.id === e.target.value || 
                    c.phone === e.target.value ||
                    c.name.toLowerCase() === e.target.value.toLowerCase()
                  )
                  if (exactMatch) {
                    setSelectedClient(exactMatch.id)
                  }
                }}
                className="mb-2"
              />
              <Select 
                value={selectedClient} 
                onChange={e => {
                  setSelectedClient(e.target.value)
                  const selected = clients.find(c => c.id === e.target.value)
                  if (selected) {
                    setClientSearch(selected.name)
                  }
                }}
              >
                <option value="">اختر العميل</option>
                {filteredClients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.phone ? `- ${client.phone}` : ''}
                  </option>
                ))}
              </Select>
              {clientSearch && filteredClients.length === 0 && (
                <p className="text-xs text-muted-foreground">لم يتم العثور على عميل</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>قطع الأرض ({selectedPieces.length} محددة)</Label>
              <Input
                type="text"
                placeholder="بحث عن قطعة برقم القطعة..."
                value={pieceSearch}
                maxLength={50}
                onChange={e => {
                  setPieceSearch(e.target.value)
                  debouncedPieceSearchFn(e.target.value)
                }}
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {filteredAvailablePieces.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد قطع متاحة</p>
                ) : (
                  filteredAvailablePieces.map((piece: any) => (
                    <label key={piece.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPieces.includes(piece.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPieces([...selectedPieces, piece.id])
                          } else {
                            setSelectedPieces(selectedPieces.filter(id => id !== piece.id))
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">
                        {piece.land_batch?.name} - #{piece.piece_number} ({piece.surface_area} م²)
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedPieces.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  إجمالي المساحة: {pieces.filter(p => selectedPieces.includes(p.id)).reduce((sum, p: any) => sum + p.surface_area, 0)} م²
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>نوع الدفع</Label>
              <Select value={paymentType} onChange={e => setPaymentType(e.target.value as any)}>
                <option value="Full">دفع كامل</option>
                <option value="Installment">أقساط</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>العربون (مبلغ الحجز)</Label>
              <Input
                type="number"
                value={reservationAmount}
                onChange={e => setReservationAmount(e.target.value)}
                placeholder="أدخل مبلغ العربون"
              />
              {reservationAmount && selectedPieces.length > 0 && calculatedTotalPrice > 0 && (
                <p className="text-sm text-muted-foreground">
                  المتبقي: {formatCurrency(calculatedTotalPrice)}
                  <span className="mr-2">(العربون سيُضاف للدفعة الأولى)</span>
                </p>
              )}
            </div>

            {paymentType === 'Installment' && (
              <div className="space-y-2">
                <Label>عدد الأشهر</Label>
                <Input
                  type="text"
                  value={numberOfInstallments}
                  onChange={e => setNumberOfInstallments(e.target.value)}
                  placeholder="أدخل عدد الأشهر"
                  maxLength={10}
                />
                <p className="text-xs text-muted-foreground">
                  * الدفعة الأولى وتاريخ استحقاقها سيتم تحديدها عند التأكيد
                </p>
              </div>
            )}

          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setNewSaleOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={createSale} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء البيع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Full Payment Dialog */}
      <Dialog open={confirmFullOpen} onOpenChange={setConfirmFullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الدفع الكامل</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><strong>العميل:</strong> {selectedSale.clientName}</p>
                <p><strong>القطعة:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>السعر:</strong> {formatCurrency(selectedSale.price)}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                سيتم تأكيد استلام الدفعة الكاملة وتحويل حالة القطعة إلى "مباعة".
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmFullOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={confirmFullPayment} disabled={isSubmitting} className="bg-green-600 w-full sm:w-auto">
              {isSubmitting ? 'جاري التأكيد...' : 'تأكيد الدفع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Big Advance Dialog */}
      <Dialog open={confirmBigAdvanceOpen} onOpenChange={setConfirmBigAdvanceOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تأكيد الدفعة الأولى وإنشاء جدول الأقساط</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><strong>العميل:</strong> {selectedSale.clientName}</p>
                <p><strong>القطعة:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>السعر الإجمالي:</strong> {formatCurrency(selectedSale.price)}</p>
                <p><strong>عدد الأشهر:</strong> {selectedSale.numberOfInstallments}</p>
                {selectedSale.bigAdvanceDueDate && (
                  <p><strong>تاريخ استحقاق الدفعة:</strong> {formatDate(selectedSale.bigAdvanceDueDate)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>مبلغ الدفعة الأولى المستلم</Label>
                <Input
                  type="number"
                  value={bigAdvancePaidAmount}
                  onChange={e => setBigAdvancePaidAmount(e.target.value)}
                  placeholder="أدخل المبلغ المستلم"
                />
              </div>

              <div className="space-y-2">
                <Label>تاريخ أول قسط شهري</Label>
                <Input
                  type="date"
                  value={installmentStartDate}
                  onChange={e => setInstallmentStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  سيتم حساب الأقساط الشهرية ابتداءً من هذا التاريخ
                </p>
              </div>

              {installmentStartDate && selectedSale.numberOfInstallments && bigAdvancePaidAmount && (
                <div className="bg-blue-50 p-3 rounded-lg space-y-1">
                  <p className="text-sm text-blue-800">
                    <strong>الدفعة الأولى (تشمل العربون):</strong>{' '}
                    {formatCurrency(parseFloat(bigAdvancePaidAmount) + selectedSale.reservationAmount)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>المبلغ المتبقي:</strong>{' '}
                    {formatCurrency(selectedSale.price - parseFloat(bigAdvancePaidAmount) - selectedSale.reservationAmount)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>القسط الشهري:</strong>{' '}
                    {formatCurrency(
                      (selectedSale.price - parseFloat(bigAdvancePaidAmount) - selectedSale.reservationAmount) / selectedSale.numberOfInstallments
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBigAdvanceOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={confirmBigAdvance} disabled={isSubmitting || !installmentStartDate || !bigAdvancePaidAmount}>
              {isSubmitting ? 'جاري التأكيد...' : 'تأكيد وإنشاء الأقساط'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">إلغاء البيع</DialogTitle>
          </DialogHeader>
          {saleToCancel && (
            <div className="space-y-4">
              <div className="bg-destructive/10 p-4 rounded-lg space-y-2 border border-destructive/20">
                <p><strong>العميل:</strong> {saleToCancel.clientName}</p>
                <p><strong>القطعة:</strong> {saleToCancel.batchName} - {saleToCancel.pieceName}</p>
                <p><strong>السعر:</strong> {formatCurrency(saleToCancel.price)}</p>
                <p><strong>نوع الدفع:</strong> {saleToCancel.paymentType === 'Full' ? 'دفع كامل' : 'أقساط'}</p>
              </div>

              {salePieceCount > 1 && (
                <div className="bg-red-100 p-3 rounded-lg border border-red-300">
                  <p className="text-sm text-red-800 font-bold">
                    ⚠️ تحذير هام: هذا البيع يحتوي على {salePieceCount} قطع!
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    سيتم إلغاء جميع القطع في هذا البيع معاً. لإلغاء قطعة واحدة فقط، يرجى تشغيل سكريبت تقسيم المبيعات أولاً.
                  </p>
                </div>
              )}

              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <strong>تحذير:</strong> سيتم حذف جميع المدفوعات والأقساط المرتبطة بهذا البيع وإرجاع {salePieceCount > 1 ? 'القطع' : 'القطعة'} إلى حالة "متاحة".
                </p>
              </div>

              <div className="space-y-2">
                <Label>مبلغ الاسترداد للعميل (اختياري)</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="أدخل المبلغ المسترد إن وجد"
                />
                <p className="text-xs text-muted-foreground">
                  إذا تم دفع مبالغ سابقاً وتريد تسجيل استرداد، أدخل المبلغ هنا
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              تراجع
            </Button>
            <Button variant="destructive" onClick={() => {
              setCancelDialogOpen(false)
              setCancelConfirmOpen(true)
            }} disabled={isSubmitting}>
              متابعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Confirmation Dialog */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        onConfirm={cancelSale}
        title="تأكيد الإلغاء"
        description={saleToCancel ? `هل أنت متأكد من إلغاء هذه القطعة؟ سيتم إرجاع القطعة إلى حالة "متاحة".${salePieceCount > 1 ? ` تحذير: هذا البيع يحتوي على ${salePieceCount} قطع!` : ''}` : ''}
        variant="destructive"
        confirmText="نعم، إلغاء"
        cancelText="تراجع"
      />

      {/* New Client Dialog */}
      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                placeholder="اسم العميل"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label>CIN *</Label>
              <Input
                value={newClientCin}
                onChange={e => setNewClientCin(e.target.value)}
                placeholder="رقم CIN"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input
                value={newClientPhone}
                onChange={e => setNewClientPhone(e.target.value)}
                placeholder="رقم الهاتف (اختياري)"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={newClientAddress}
                onChange={e => setNewClientAddress(e.target.value)}
                placeholder="العنوان (اختياري)"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewClientOpen(false)
              setNewClientName('')
              setNewClientPhone('')
              setNewClientAddress('')
              setNewClientCin('')
            }}>
              إلغاء
            </Button>
            <Button onClick={createNewClient} disabled={creatingClient}>
              إضافة واختيار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
