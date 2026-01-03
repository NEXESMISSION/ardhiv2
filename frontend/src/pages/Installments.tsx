import { useEffect, useState, useMemo, useCallback } from 'react'
import { debounce } from '@/lib/throttle'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { sanitizeNotes } from '@/lib/sanitize'
import { formatCurrency, formatDate } from '@/lib/utils'
import { User, ChevronDown, ChevronUp } from 'lucide-react'
import type { Installment, Sale, Client, InstallmentStatus } from '@/types/database'

interface InstallmentWithRelations extends Installment {
  sale?: Sale & { client?: Client }
}

interface ClientInstallmentGroup {
  clientId: string
  clientName: string
  sales: {
    saleId: string
    saleDate: string
    totalPrice: number
    installments: InstallmentWithRelations[]
    totalDue: number
    totalPaid: number
    nextDueDate: string | null
    progress: number
  }[]
  totalDue: number
  totalPaid: number
  overdueCount: number
}

const statusColors: Record<InstallmentStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  Paid: 'success',
  Unpaid: 'warning',
  Late: 'destructive',
  Partial: 'secondary',
}

export function Installments() {
  const { hasPermission } = useAuth()
  const [installments, setInstallments] = useState<InstallmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'clients' | 'list'>('clients')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set()) // Track expanded sales
  const [searchTerm, setSearchTerm] = useState('') // Search by client name
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  
  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [monthsToPayCount, setMonthsToPayCount] = useState(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false)

  // Summary stats
  const [stats, setStats] = useState({
    totalDue: 0,
    totalPaid: 0,
    totalOverdue: 0,
    overdueCount: 0,
    clientsWithOverdue: 0,
    totalClients: 0,
  })

  useEffect(() => {
    fetchInstallments()
  }, [])

  const fetchInstallments = async () => {
    try {
      const { data, error } = await supabase
        .from('installments')
        .select(`
          *,
          sale:sales (
            *,
            client:clients (*),
            land_piece_ids
          )
        `)
        .order('due_date', { ascending: true })

      if (error) throw error
      const installmentData = (data as InstallmentWithRelations[]) || []
      setInstallments(installmentData)

      // Calculate stats
      const totalDue = installmentData.reduce((sum, i) => sum + i.amount_due, 0)
      const totalPaid = installmentData.reduce((sum, i) => sum + i.amount_paid, 0)
      // Check overdue based on due date, not just status
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const overdue = installmentData.filter((i) => {
        if (i.status === 'Paid') return false
        const dueDate = new Date(i.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < now
      })
      const totalOverdue = overdue.reduce((sum, i) => sum + (i.amount_due - i.amount_paid + i.stacked_amount), 0)
      
      // Count unique clients
      const uniqueClients = new Set(installmentData.map(i => i.sale?.client_id).filter(Boolean))
      const clientsWithOverdue = new Set(overdue.map(i => i.sale?.client_id).filter(Boolean))

      setStats({
        totalDue,
        totalPaid,
        totalOverdue,
        overdueCount: overdue.length,
        clientsWithOverdue: clientsWithOverdue.size,
        totalClients: uniqueClients.size,
      })
    } catch (error) {
      setErrorMessage('خطأ في تحميل الأقساط')
    } finally {
      setLoading(false)
    }
  }

  // Get next unpaid installment for a sale
  const getNextInstallment = (saleId: string, currentInstallmentNumber: number) => {
    return installments.find(
      (i) => i.sale_id === saleId && 
             i.installment_number > currentInstallmentNumber && 
             i.status !== 'Paid'
    )
  }

  // Get all unpaid installments for a sale (for multi-month payment) - Memoized
  const getUnpaidInstallmentsForSale = useCallback((saleId: string) => {
    return installments
      .filter((i) => i.sale_id === saleId && i.status !== 'Paid')
      .sort((a, b) => a.installment_number - b.installment_number)
  }, [installments])

  // Recalculate sale status based on installment payments
  const recalculateSaleStatus = async (saleId: string) => {
    try {
      // Get all installments for this sale
      const { data: saleInstallments } = await supabase
        .from('installments')
        .select('*')
        .eq('sale_id', saleId)

      if (!saleInstallments || saleInstallments.length === 0) return

      // Check if all installments are paid
      const allPaid = saleInstallments.every(i => i.status === 'Paid')
      
      // Update sale status accordingly
      const newStatus = allPaid ? 'Completed' : 'InstallmentsOngoing'
      await supabase
        .from('sales')
        .update({ status: newStatus })
        .eq('id', saleId)
    } catch (error) {
      // Silent fail - status recalculation is not critical
    }
  }

  const openPaymentDialog = (installment: InstallmentWithRelations) => {
    setSelectedInstallment(installment)
    setMonthsToPayCount(1)
    // Auto-calculate payment amount for first month
    const unpaid = getUnpaidInstallmentsForSale(installment.sale_id)
    const firstMonthAmount = unpaid.length > 0 
      ? unpaid[0].amount_due + unpaid[0].stacked_amount - unpaid[0].amount_paid
      : 0
    setPaymentAmount(String(firstMonthAmount))
    setPaymentDialogOpen(true)
  }

  const recordPayment = async () => {
    if (!selectedInstallment || !paymentAmount) return

    // Authorization check
    if (!hasPermission('record_payments')) {
      setErrorMessage('ليس لديك صلاحية لتسجيل المدفوعات')
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح')
      return
    }

    setErrorMessage(null)
    try {
      // Get installments to pay (for multi-month payment)
      const unpaidInstallments = getUnpaidInstallmentsForSale(selectedInstallment.sale_id)
      const installmentsToPay = unpaidInstallments.slice(0, monthsToPayCount)
      
      let remainingPayment = amount
      const today = new Date().toISOString().split('T')[0]

      // Process each installment
      for (const inst of installmentsToPay) {
        if (remainingPayment <= 0) break

        const totalDue = inst.amount_due + inst.stacked_amount - inst.amount_paid
        const paymentForThis = Math.min(remainingPayment, totalDue)
        const newPaid = inst.amount_paid + paymentForThis
        const isFullyPaid = newPaid >= inst.amount_due + inst.stacked_amount

        // Update installment
        await supabase
          .from('installments')
          .update({
            amount_paid: newPaid,
            status: isFullyPaid ? 'Paid' : newPaid > 0 ? 'Partial' : inst.status,
            paid_date: isFullyPaid ? today : null,
            stacked_amount: isFullyPaid ? 0 : Math.max(0, inst.amount_due + inst.stacked_amount - newPaid),
          })
          .eq('id', inst.id)

        // Record individual payment
        await supabase.from('payments').insert([{
          client_id: selectedInstallment.sale?.client_id,
          sale_id: selectedInstallment.sale_id,
          installment_id: inst.id,
          amount_paid: paymentForThis,
          payment_type: 'Installment',
          payment_date: today,
        }])

        remainingPayment -= paymentForThis
      }

      // Recalculate sale status after payment
      await recalculateSaleStatus(selectedInstallment.sale_id)

      setPaymentDialogOpen(false)
      setPaymentAmount('')
      setMonthsToPayCount(1)
      setSelectedInstallment(null)
      fetchInstallments()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تسجيل الدفع')
    }
  }

  // Helper function to check if installment is overdue
  const isInstallmentOverdue = (inst: InstallmentWithRelations): boolean => {
    if (inst.status === 'Paid') return false
    const dueDate = new Date(inst.due_date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < now
  }

  // Helper function to get days until due or overdue
  const getDaysUntilDue = (inst: InstallmentWithRelations): number => {
    const dueDate = new Date(inst.due_date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Filter installments - also check if overdue based on due date
  const filteredInstallments = installments.filter((inst) => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'Late') {
      // Check if actually overdue: due date passed AND not fully paid
      return isInstallmentOverdue(inst)
    }
    return inst.status === filterStatus
  })

  // Toggle sale expansion
  const toggleSale = (saleId: string) => {
    const newExpanded = new Set(expandedSales)
    if (newExpanded.has(saleId)) {
      newExpanded.delete(saleId)
    } else {
      newExpanded.add(saleId)
    }
    setExpandedSales(newExpanded)
  }

  // Smart installment grouping - group consecutive installments with same amount and date pattern
  const groupInstallments = (installments: InstallmentWithRelations[]) => {
    if (installments.length === 0) return []
    
    const groups: Array<{
      type: 'single' | 'range'
      installments: InstallmentWithRelations[]
      startNumber?: number
      endNumber?: number
      amount?: number
      date?: string
    }> = []
    
    let currentGroup: InstallmentWithRelations[] = [installments[0]]
    
    for (let i = 1; i < installments.length; i++) {
      const prev = installments[i - 1]
      const curr = installments[i]
      
      const prevAmount = prev.amount_due + prev.stacked_amount - prev.amount_paid
      const currAmount = curr.amount_due + curr.stacked_amount - curr.amount_paid
      const prevDate = new Date(prev.due_date)
      const currDate = new Date(curr.due_date)
      
      // Check if same amount and consecutive dates (within 35 days - monthly pattern)
      const daysDiff = Math.abs((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      const sameAmount = Math.abs(prevAmount - currAmount) < 0.01
      const consecutive = daysDiff <= 35 && curr.installment_number === prev.installment_number + 1
      
      if (sameAmount && consecutive) {
        currentGroup.push(curr)
      } else {
        // Save current group
        if (currentGroup.length > 3) {
          groups.push({
            type: 'range',
            installments: currentGroup,
            startNumber: currentGroup[0].installment_number,
            endNumber: currentGroup[currentGroup.length - 1].installment_number,
            amount: prevAmount,
            date: formatDate(currentGroup[0].due_date)
          })
        } else {
          currentGroup.forEach(inst => {
            groups.push({
              type: 'single',
              installments: [inst],
              amount: inst.amount_due + inst.stacked_amount - inst.amount_paid,
              date: formatDate(inst.due_date)
            })
          })
        }
        currentGroup = [curr]
      }
    }
    
    // Save last group
    if (currentGroup.length > 3) {
      const last = currentGroup[currentGroup.length - 1]
      groups.push({
        type: 'range',
        installments: currentGroup,
        startNumber: currentGroup[0].installment_number,
        endNumber: last.installment_number,
        amount: last.amount_due + last.stacked_amount - last.amount_paid,
        date: formatDate(currentGroup[0].due_date)
      })
    } else {
      currentGroup.forEach(inst => {
        groups.push({
          type: 'single',
          installments: [inst],
          amount: inst.amount_due + inst.stacked_amount - inst.amount_paid,
          date: formatDate(inst.due_date)
        })
      })
    }
    
    return groups
  }

  // Group installments by client
  const clientGroups = useMemo((): ClientInstallmentGroup[] => {
    const groups = new Map<string, ClientInstallmentGroup>()
    
    filteredInstallments.forEach(inst => {
      const clientId = inst.sale?.client_id || 'unknown'
      const clientName = inst.sale?.client?.name || 'عميل غير معروف'
      
      if (!groups.has(clientId)) {
        groups.set(clientId, {
          clientId,
          clientName,
          sales: [],
          totalDue: 0,
          totalPaid: 0,
          overdueCount: 0,
        })
      }
      
      const group = groups.get(clientId)!
      group.totalDue += inst.amount_due
      group.totalPaid += inst.amount_paid
      // Check if actually overdue based on due date
      if (isInstallmentOverdue(inst)) group.overdueCount++
      
      // Group by sale
      let saleGroup = group.sales.find(s => s.saleId === inst.sale_id)
      if (!saleGroup) {
        saleGroup = {
          saleId: inst.sale_id,
          saleDate: inst.sale?.sale_date || '',
          totalPrice: inst.sale?.total_selling_price || 0,
          installments: [],
          totalDue: 0,
          totalPaid: 0,
          nextDueDate: null,
          progress: 0,
        }
        group.sales.push(saleGroup)
      }
      
      saleGroup.installments.push(inst)
      saleGroup.totalDue += inst.amount_due
      saleGroup.totalPaid += inst.amount_paid
      
      // Find next due date
      if (inst.status !== 'Paid' && (!saleGroup.nextDueDate || inst.due_date < saleGroup.nextDueDate)) {
        saleGroup.nextDueDate = inst.due_date
      }
    })
    
    // Calculate progress for each sale
    groups.forEach(group => {
      group.sales.forEach(sale => {
        sale.progress = sale.totalDue > 0 ? (sale.totalPaid / sale.totalDue) * 100 : 0
        sale.installments.sort((a, b) => a.installment_number - b.installment_number)
      })
    })
    
    return Array.from(groups.values()).sort((a, b) => b.overdueCount - a.overdueCount)
  }, [filteredInstallments])

  // Toggle client expansion
  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }

  // Monthly summary - uses ALL installments (not filtered) so it always shows
  const monthlySummary = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    const clientMap = new Map<string, {
      clientId: string
      clientName: string
      piecesCount: number
      dueThisMonth: number
      overdueAmount: number
    }>()
    
    installments.forEach(inst => {
      const clientId = inst.sale?.client_id || 'unknown'
      const clientName = inst.sale?.client?.name || 'غير معروف'
      
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          clientName,
          piecesCount: 0,
          dueThisMonth: 0,
          overdueAmount: 0,
        })
      }
      
      const client = clientMap.get(clientId)!
      const dueDate = new Date(inst.due_date)
      const remaining = inst.amount_due - inst.amount_paid
      
      // Count pieces (unique sales)
      if (!client.piecesCount) client.piecesCount = 0
      
      // Check if due this month
      if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear && remaining > 0) {
        client.dueThisMonth += remaining
      }
      
      // Check if overdue
      if (dueDate < now && inst.status !== 'Paid' && remaining > 0) {
        client.overdueAmount += remaining
      }
    })
    
    // Count pieces per client
    const saleClientMap = new Map<string, Set<string>>()
    installments.forEach(inst => {
      const clientId = inst.sale?.client_id || 'unknown'
      if (!saleClientMap.has(clientId)) {
        saleClientMap.set(clientId, new Set())
      }
      saleClientMap.get(clientId)!.add(inst.sale_id)
    })
    
    clientMap.forEach((client, clientId) => {
      client.piecesCount = saleClientMap.get(clientId)?.size || 0
    })
    
    return Array.from(clientMap.values()).filter(c => c.dueThisMonth > 0 || c.overdueAmount > 0)
  }, [installments])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري تحميل الأقساط...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">الأقساط</h1>
        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
          <span>مدفوع: <strong className="text-green-600">{formatCurrency(stats.totalPaid)}</strong></span>
          <span>متبقي: <strong>{formatCurrency(stats.totalDue - stats.totalPaid)}</strong></span>
          {stats.totalOverdue > 0 && (
            <span className="text-red-600">متأخر: <strong>{formatCurrency(stats.totalOverdue)}</strong></span>
          )}
        </div>
      </div>

      {/* Monthly Summary - Compact */}
      {monthlySummary.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium text-orange-800">المستحقات الشهرية:</span>
            {monthlySummary.map(client => (
              <span key={client.clientId}>
                {client.clientName}: <strong className="text-orange-600">{formatCurrency(client.dueThisMonth)}</strong>
                {client.overdueAmount > 0 && (
                  <span className="text-red-600 mr-2">({formatCurrency(client.overdueAmount)} متأخر)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-2 items-center">
        <Input
          type="text"
          placeholder="🔍 ابحث عن عميل..."
          value={searchTerm}
          maxLength={255}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            debouncedSearchFn(e.target.value)
          }}
          className="flex-1"
        />
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-40">
          <option value="all">الكل</option>
          <option value="Unpaid">غير مدفوع</option>
          <option value="Paid">مدفوع</option>
          <option value="Late">متأخر</option>
        </Select>
        <div className="flex gap-2">
          <Button 
            variant={viewMode === 'clients' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('clients')}
          >
            حسب العميل
          </Button>
          <Button 
            variant={viewMode === 'list' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('list')}
          >
            قائمة
          </Button>
        </div>
      </div>

      {/* Client-based View - Grouped by Client and Sale */}
      {viewMode === 'clients' && (
        <div className="space-y-4">
          {clientGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">لا توجد أقساط</CardContent>
            </Card>
          ) : (
            clientGroups.map(group => {
              // Get client CIN and total pieces count
              const clientCin = group.sales[0]?.installments[0]?.sale?.client?.cin || ''
              const totalPieces = group.sales.reduce((sum, s) => {
                return sum + (s.installments[0]?.sale?.land_piece_ids?.length || 0)
              }, 0)
              
              return (
              <Card key={group.clientId} className="overflow-hidden">
                <CardHeader className="bg-blue-50 border-b">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{group.clientName}</CardTitle>
                    {clientCin && (
                      <span className="text-xs text-muted-foreground">({clientCin})</span>
                    )}
                    {totalPieces > 0 && (
                      <Badge variant="secondary" className="text-xs">{totalPieces} قطعة</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {group.sales.length} صفقة • {group.sales.reduce((sum, s) => sum + s.installments.length, 0)} قسط
                    {group.overdueCount > 0 && (
                      <Badge variant="destructive" className="text-xs mr-2">{group.overdueCount} متأخر</Badge>
                    )}
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  {group.sales.map(sale => {
                    const nextInst = sale.installments.find(i => i.status !== 'Paid')
                    if (!nextInst) return null
                    
                    const daysLeft = getDaysUntilDue(nextInst)
                    const isOverdue = isInstallmentOverdue(nextInst)
                    const paidCount = sale.installments.filter(i => i.status === 'Paid').length
                    const totalCount = sale.installments.length
                    
                    // Determine urgency level
                    let actionText = 'دفع'
                    let actionVariant: 'destructive' | 'default' | 'outline' = 'default'
                    
                    if (isOverdue) {
                      actionText = `دفع (متأخر ${Math.abs(daysLeft)} يوم)`
                      actionVariant = 'destructive'
                    } else if (daysLeft <= 3) {
                      actionText = daysLeft === 0 ? 'دفع (مستحق اليوم)' : `دفع (متبقي ${daysLeft} يوم)`
                      actionVariant = 'default'
                    } else if (daysLeft <= 7) {
                      actionText = `دفع (متبقي ${daysLeft} أيام)`
                      actionVariant = 'outline'
                    }
                    
                    return (
                      <div 
                        key={sale.saleId} 
                        className={`border-b last:border-b-0 p-4 ${
                          isOverdue ? 'bg-red-50/30' : daysLeft <= 3 ? 'bg-yellow-50/20' : ''
                        }`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 sm:gap-4 items-center">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleSale(sale.saleId)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                              {expandedSales.has(sale.saleId) ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                            <div>
                              <p className="font-medium text-sm text-muted-foreground mb-1">
                                تاريخ البيع: {formatDate(sale.saleDate)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {sale.installments.length} قسط مستحق
                              </p>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm">
                              <div className="font-bold">{paidCount}/{totalCount}</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div 
                                  className="bg-green-500 h-1.5 rounded-full" 
                                  style={{ width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm">
                              <span className="text-green-600 font-bold">{formatCurrency(sale.totalPaid)}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span className="font-bold">{formatCurrency(sale.totalDue)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm">
                              <div className="font-bold">{formatCurrency(nextInst.amount_due + nextInst.stacked_amount - nextInst.amount_paid)}</div>
                              <div className={`text-xs font-medium ${
                                isOverdue ? 'text-red-600' : 
                                daysLeft <= 3 ? 'text-orange-600' :
                                daysLeft <= 7 ? 'text-yellow-600' : 
                                'text-muted-foreground'
                              }`}>
                                {isOverdue ? `⚠️ متأخر ${Math.abs(daysLeft)} يوم` : 
                                 daysLeft === 0 ? '⏰ مستحق اليوم' :
                                 daysLeft <= 3 ? `⏳ متبقي ${daysLeft} أيام` :
                                 daysLeft <= 7 ? `📅 متبقي ${daysLeft} أيام` : 
                                 `📅 ${formatDate(nextInst.due_date)}`}
                              </div>
                            </div>
                          </div>
                          <div>
                            {hasPermission('record_payments') && (
                              <Button 
                                size="sm" 
                                variant={actionVariant}
                                onClick={() => openPaymentDialog(nextInst)}
                                className={`w-full ${
                                  isOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                  daysLeft <= 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                  ''
                                }`}
                              >
                                {actionText}
                              </Button>
                            )}
                          </div>
                        </div>
                        {expandedSales.has(sale.saleId) && (
                          <div className="overflow-x-auto mt-3">
                            {(() => {
                              const grouped = groupInstallments(sale.installments)
                              return (
                                <div className="space-y-2">
                                  {grouped.map((group, idx) => {
                                    if (group.type === 'range') {
                                      const firstInst = group.installments[0]
                                      const lastInst = group.installments[group.installments.length - 1]
                                      const instDaysLeft = getDaysUntilDue(firstInst)
                                      const instIsOverdue = isInstallmentOverdue(firstInst)
                                      
                                      return (
                                        <div key={idx} className="bg-gray-50 p-3 rounded-lg border">
                                          <div className="flex items-center justify-between">
                                            <div>
                                              <p className="font-medium text-sm">
                                                أقساط #{group.startNumber} - #{group.endNumber} ({group.installments.length} قسط)
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatCurrency(group.amount!)} × {group.installments.length} = {formatCurrency(group.amount! * group.installments.length)}
                                              </p>
                                              <p className="text-xs text-muted-foreground mt-1">
                                                من {formatDate(firstInst.due_date)} إلى {formatDate(lastInst.due_date)}
                                              </p>
                                            </div>
                                            <div className="text-right">
                                              <Badge 
                                                variant={instIsOverdue ? 'destructive' : 'secondary'} 
                                                className="text-xs"
                                              >
                                                {instIsOverdue ? 'متأخر' : 'مستحق'}
                                              </Badge>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    } else {
                                      const inst = group.installments[0]
                                      const instDaysLeft = getDaysUntilDue(inst)
                                      const instIsOverdue = isInstallmentOverdue(inst)
                                      const instRemainingAmount = inst.amount_due + inst.stacked_amount - inst.amount_paid
                                      
                                      let instActionText = 'دفع'
                                      let instActionVariant: 'destructive' | 'default' | 'outline' = 'default'
                                      
                                      if (instIsOverdue) {
                                        instActionText = `دفع (متأخر ${Math.abs(instDaysLeft)} يوم)`
                                        instActionVariant = 'destructive'
                                      } else if (instDaysLeft <= 3) {
                                        instActionText = instDaysLeft === 0 ? 'دفع (مستحق اليوم)' : `دفع (متبقي ${instDaysLeft} يوم)`
                                        instActionVariant = 'default'
                                      } else if (instDaysLeft <= 7) {
                                        instActionText = `دفع (متبقي ${instDaysLeft} أيام)`
                                        instActionVariant = 'outline'
                                      }
                                      
                                      return (
                                        <div key={idx} className={`p-3 rounded-lg border ${
                                          instIsOverdue ? 'bg-red-50/30 border-red-200' : 
                                          instDaysLeft <= 3 ? 'bg-yellow-50/20 border-yellow-200' : 
                                          'bg-gray-50'
                                        }`}>
                                          <div className="flex items-center justify-between">
                                            <div>
                                              <p className="font-medium text-sm">
                                                قسط #{inst.installment_number}
                                              </p>
                                              <p className="text-sm font-bold">{formatCurrency(instRemainingAmount)}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatDate(inst.due_date)}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Badge 
                                                variant={instIsOverdue ? 'destructive' : statusColors[inst.status]} 
                                                className="text-xs"
                                              >
                                                {inst.status === 'Paid' ? 'مدفوع' :
                                                 instIsOverdue ? 'متأخر' :
                                                 inst.status === 'Late' ? 'متأخر' :
                                                 inst.status === 'Partial' ? 'جزئي' : 'غير مدفوع'}
                                              </Badge>
                                              {hasPermission('record_payments') && inst.status !== 'Paid' && (
                                                <Button 
                                                  size="sm" 
                                                  variant={instActionVariant}
                                                  onClick={() => openPaymentDialog(inst)}
                                                  className={`${
                                                    instIsOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                                    instDaysLeft <= 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                                    ''
                                                  }`}
                                                >
                                                  {instActionText}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    }
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        {!expandedSales.has(sale.saleId) && sale.installments.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground text-center">
                            اضغط على السهم لعرض {sale.installments.length} قسط
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
              )
            })
          )}
        </div>
      )}

      {/* List View - Grouped by Client and Sale */}
      {viewMode === 'list' && (() => {
        // Group installments by client, then by sale
        const groupedByClient = new Map<string, {
          clientId: string
          clientName: string
          sales: Map<string, {
            saleId: string
            saleDate: string
            installments: InstallmentWithRelations[]
          }>
        }>()
        
        let filtered = filteredInstallments.filter(i => i.status !== 'Paid')
        
        // Filter by search term
        if (debouncedSearchTerm.trim()) {
          const search = debouncedSearchTerm.toLowerCase().trim()
          filtered = filtered.filter(inst => 
            inst.sale?.client?.name?.toLowerCase().includes(search)
          )
        }
        
        filtered.forEach(inst => {
            const clientId = inst.sale?.client_id || 'unknown'
            const clientName = inst.sale?.client?.name || 'غير معروف'
            const saleId = inst.sale_id
            
            if (!groupedByClient.has(clientId)) {
              groupedByClient.set(clientId, {
                clientId,
                clientName,
                sales: new Map()
              })
            }
            
            const clientGroup = groupedByClient.get(clientId)!
            if (!clientGroup.sales.has(saleId)) {
              clientGroup.sales.set(saleId, {
                saleId,
                saleDate: inst.sale?.sale_date || '',
                installments: []
              })
            }
            
            clientGroup.sales.get(saleId)!.installments.push(inst)
          })
        
        // Sort installments within each sale by due date
        groupedByClient.forEach(clientGroup => {
          clientGroup.sales.forEach(sale => {
            sale.installments.sort((a, b) => {
              const dateA = new Date(a.due_date).getTime()
              const dateB = new Date(b.due_date).getTime()
              return dateA - dateB
            })
          })
        })
        
        return (
          <div className="space-y-4">
            {groupedByClient.size === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  لا توجد أقساط مستحقة
                </CardContent>
              </Card>
            ) : (
              Array.from(groupedByClient.values()).map(clientGroup => (
                <Card key={clientGroup.clientId} className="overflow-hidden">
                  <CardHeader className="bg-blue-50 border-b">
                    <CardTitle className="text-lg">{clientGroup.clientName}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {clientGroup.sales.size} صفقة • {Array.from(clientGroup.sales.values()).reduce((sum, s) => sum + s.installments.length, 0)} قسط مستحق
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {Array.from(clientGroup.sales.values()).map(sale => {
                      const nextInst = sale.installments[0] // First unpaid installment
                      if (!nextInst) return null
                      
                      const daysLeft = getDaysUntilDue(nextInst)
                      const isOverdue = isInstallmentOverdue(nextInst)
                      const remainingAmount = nextInst.amount_due + nextInst.stacked_amount - nextInst.amount_paid
                      
                      // Determine urgency level
                      let actionText = 'دفع'
                      let actionVariant: 'destructive' | 'default' | 'outline' = 'default'
                      
                      if (isOverdue) {
                        actionText = `دفع (متأخر ${Math.abs(daysLeft)} يوم)`
                        actionVariant = 'destructive'
                      } else if (daysLeft <= 3) {
                        actionText = daysLeft === 0 ? 'دفع (مستحق اليوم)' : `دفع (متبقي ${daysLeft} يوم)`
                        actionVariant = 'default'
                      } else if (daysLeft <= 7) {
                        actionText = `دفع (متبقي ${daysLeft} أيام)`
                        actionVariant = 'outline'
                      }
                      
                      return (
                        <div 
                          key={sale.saleId} 
                          className={`border-b last:border-b-0 p-4 ${
                            isOverdue ? 'bg-red-50/30' : daysLeft <= 3 ? 'bg-yellow-50/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleSale(sale.saleId)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                              >
                                {expandedSales.has(sale.saleId) ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              <div>
                                <p className="font-medium text-sm text-muted-foreground">
                                  تاريخ البيع: {formatDate(sale.saleDate)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {sale.installments.length} قسط مستحق
                                </p>
                              </div>
                            </div>
                            {hasPermission('record_payments') && (
                              <Button 
                                size="sm" 
                                variant={actionVariant}
                                onClick={() => openPaymentDialog(nextInst)}
                                className={`${
                                  isOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                  daysLeft <= 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                  ''
                                }`}
                              >
                                {actionText}
                              </Button>
                            )}
                          </div>
                          {expandedSales.has(sale.saleId) && (
                            <div className="overflow-x-auto mt-3">
                              {(() => {
                                const grouped = groupInstallments(sale.installments)
                                return (
                                  <div className="space-y-2">
                                    {grouped.map((group, idx) => {
                                      if (group.type === 'range') {
                                        const firstInst = group.installments[0]
                                        const lastInst = group.installments[group.installments.length - 1]
                                        const instDaysLeft = getDaysUntilDue(firstInst)
                                        const instIsOverdue = isInstallmentOverdue(firstInst)
                                        
                                        return (
                                          <div key={idx} className="bg-gray-50 p-3 rounded-lg border">
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <p className="font-medium text-sm">
                                                  أقساط #{group.startNumber} - #{group.endNumber} ({group.installments.length} قسط)
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                  {formatCurrency(group.amount!)} × {group.installments.length} = {formatCurrency(group.amount! * group.installments.length)}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  من {formatDate(firstInst.due_date)} إلى {formatDate(lastInst.due_date)}
                                                </p>
                                              </div>
                                              <div className="text-right">
                                                <Badge 
                                                  variant={instIsOverdue ? 'destructive' : 'secondary'} 
                                                  className="text-xs"
                                                >
                                                  {instIsOverdue ? 'متأخر' : 'مستحق'}
                                                </Badge>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      } else {
                                        const inst = group.installments[0]
                                        const instDaysLeft = getDaysUntilDue(inst)
                                        const instIsOverdue = isInstallmentOverdue(inst)
                                        const instRemainingAmount = inst.amount_due + inst.stacked_amount - inst.amount_paid
                                        
                                        let instActionText = 'دفع'
                                        let instActionVariant: 'destructive' | 'default' | 'outline' = 'default'
                                        
                                        if (instIsOverdue) {
                                          instActionText = `دفع (متأخر ${Math.abs(instDaysLeft)} يوم)`
                                          instActionVariant = 'destructive'
                                        } else if (instDaysLeft <= 3) {
                                          instActionText = instDaysLeft === 0 ? 'دفع (مستحق اليوم)' : `دفع (متبقي ${instDaysLeft} يوم)`
                                          instActionVariant = 'default'
                                        } else if (instDaysLeft <= 7) {
                                          instActionText = `دفع (متبقي ${instDaysLeft} أيام)`
                                          instActionVariant = 'outline'
                                        }
                                        
                                        return (
                                          <div key={idx} className={`p-3 rounded-lg border ${
                                            instIsOverdue ? 'bg-red-50/30 border-red-200' : 
                                            instDaysLeft <= 3 ? 'bg-yellow-50/20 border-yellow-200' : 
                                            'bg-gray-50'
                                          }`}>
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <p className="font-medium text-sm">
                                                  قسط #{inst.installment_number}
                                                </p>
                                                <p className="text-sm font-bold">{formatCurrency(instRemainingAmount)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {formatDate(inst.due_date)}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Badge 
                                                  variant={instIsOverdue ? 'destructive' : statusColors[inst.status]} 
                                                  className="text-xs"
                                                >
                                                  {inst.status === 'Paid' ? 'مدفوع' :
                                                   instIsOverdue ? 'متأخر' :
                                                   inst.status === 'Late' ? 'متأخر' :
                                                   inst.status === 'Partial' ? 'جزئي' : 'غير مدفوع'}
                                                </Badge>
                                                {hasPermission('record_payments') && inst.status !== 'Paid' && (
                                                  <Button 
                                                    size="sm" 
                                                    variant={instActionVariant}
                                                    onClick={() => openPaymentDialog(inst)}
                                                    className={`${
                                                      instIsOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                                      instDaysLeft <= 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                                      ''
                                                    }`}
                                                  >
                                                    {instActionText}
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      }
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                          {!expandedSales.has(sale.saleId) && sale.installments.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground text-center">
                              اضغط على السهم لعرض {sale.installments.length} قسط
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )
      })()}

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
          </DialogHeader>
          {selectedInstallment && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">العميل</p>
                  <p className="font-medium">
                    {selectedInstallment.sale?.client?.name}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">رقم القسط</p>
                  <p className="font-medium">#{selectedInstallment.installment_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">المبلغ المستحق</p>
                  <p className="font-medium">
                    {formatCurrency(selectedInstallment.amount_due)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">المدفوع مسبقاً</p>
                  <p className="font-medium text-green-600">
                    {formatCurrency(selectedInstallment.amount_paid)}
                  </p>
                </div>
                {selectedInstallment.stacked_amount > 0 && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">المبلغ المتراكم</p>
                    <p className="font-medium text-destructive">
                      +{formatCurrency(selectedInstallment.stacked_amount)}
                    </p>
                  </div>
                )}
              </div>

              {/* Multi-month payment selector - Optimized */}
              {selectedInstallment && (() => {
                const unpaid = getUnpaidInstallmentsForSale(selectedInstallment.sale_id)
                
                // Pre-calculate all month totals once
                const monthTotals: number[] = []
                for (let i = 0; i < unpaid.length; i++) {
                  const prevTotal = i > 0 ? monthTotals[i - 1] : 0
                  monthTotals.push(prevTotal + unpaid[i].amount_due + unpaid[i].stacked_amount - unpaid[i].amount_paid)
                }
                
                const totalAmount = monthTotals[monthsToPayCount - 1] || 0
                
                return (
                  <div className="space-y-2 bg-blue-50 p-3 rounded-md">
                    <Label>دفع عدة أشهر معاً</Label>
                    <Select
                      value={String(monthsToPayCount)}
                      onChange={(e) => {
                        const count = parseInt(e.target.value)
                        setMonthsToPayCount(count)
                        setPaymentAmount(String(monthTotals[count - 1] || 0))
                      }}
                    >
                      {unpaid.map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {idx + 1} شهر ({formatCurrency(monthTotals[idx] || 0)})
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-blue-600">
                      الأقساط: {unpaid.slice(0, monthsToPayCount).map(i => `#${i.installment_number}`).join('، ')}
                    </p>
                    <p className="text-sm font-bold text-blue-800 mt-2">
                      المبلغ الإجمالي: {formatCurrency(totalAmount)}
                    </p>
                  </div>
                )
              })()}

              <p className="text-sm text-muted-foreground">
                المتبقي بعد الدفع:{' '}
                <span className="font-medium">
                  {formatCurrency(
                    Math.max(
                      0,
                      selectedInstallment.amount_due +
                        selectedInstallment.stacked_amount -
                        selectedInstallment.amount_paid -
                        (parseFloat(paymentAmount) || 0)
                    )
                  )}
                </span>
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={() => setPaymentConfirmOpen(true)} className="w-full sm:w-auto">تسجيل الدفعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Confirmation Dialog */}
      <ConfirmDialog
        open={paymentConfirmOpen}
        onOpenChange={setPaymentConfirmOpen}
        onConfirm={recordPayment}
        title="تأكيد تسجيل الدفعة"
        description={selectedInstallment ? `هل أنت متأكد من تسجيل دفعة بقيمة ${formatCurrency(parseFloat(paymentAmount) || 0)}؟` : ''}
        confirmText="نعم، تسجيل"
        cancelText="إلغاء"
      />

      {/* Error Message */}
      {errorMessage && (
        <Card className="bg-destructive/10 border-destructive/20 fixed top-4 right-4 z-50 max-w-md">
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
    </div>
  )
}
