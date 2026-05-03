import { useMemo } from 'react'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'

interface InstallmentPayment {
  id: string
  sale_id: string
  installment_number: number | null
  amount_due: number
  amount_paid: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
}

interface Sale {
  id: string
  client_id: string
  land_piece_id: string
  batch_id: string
  sale_price: number
  deposit_amount: number
  sale_date: string
  status: string
  payment_method: 'full' | 'installment' | 'promise' | null
  client?: {
    id: string
    name: string
    id_number: string
  }
  piece?: {
    id: string
    piece_number: string
    surface_m2: number
  }
  batch?: {
    id: string
    name: string
  }
}

interface InstallmentStatsDialogProps {
  open: boolean
  onClose: () => void
  statType: 'unpaid' | 'paid' | 'expected' | 'total'
  stats: {
    unpaidAmount: number
    unpaidInstallments: number
    unpaidClients: number
    paidAmount: number
    paidInstallments: number
    paidClients: number
    expectedThisMonth: number
    total: number
  }
  filteredData: {
    sales: Sale[]
    installments: InstallmentPayment[]
  }
  sales: Sale[]
  installmentPayments: InstallmentPayment[]
}

export function InstallmentStatsDialog({
  open,
  onClose,
  statType,
  stats,
  filteredData,
  sales,
  installmentPayments,
}: InstallmentStatsDialogProps) {
  const getTitle = () => {
    switch (statType) {
      case 'unpaid':
        return 'المبلغ غير المدفوع'
      case 'paid':
        return 'المبالغ المدفوعة'
      case 'expected':
        return 'المتوقع هذا الشهر'
      case 'total':
        return 'الإجمالي'
      default:
        return 'تفاصيل الأقساط'
    }
  }

  const getDetails = () => {
    if (statType === 'unpaid') {
      const unpaid = filteredData.installments.filter(
        (i) => i.status === 'overdue' || (i.status === 'pending' && new Date(i.due_date) < new Date())
      )
      return unpaid.map((inst) => {
        const sale = sales.find((s) => s.id === inst.sale_id)
        return {
          installment: inst,
          sale,
          amount: inst.amount_due - inst.amount_paid,
        }
      })
    }

    if (statType === 'paid') {
      const paid = filteredData.installments.filter((i) => i.status === 'paid')
      return paid.map((inst) => {
        const sale = sales.find((s) => s.id === inst.sale_id)
        return {
          installment: inst,
          sale,
          amount: inst.amount_paid || 0,
        }
      })
    }

    if (statType === 'expected') {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      const expected = filteredData.installments.filter((i) => {
        const dueDate = new Date(i.due_date)
        return dueDate >= startOfMonth && dueDate <= endOfMonth && i.status === 'pending'
      })
      return expected.map((inst) => {
        const sale = sales.find((s) => s.id === inst.sale_id)
        return {
          installment: inst,
          sale,
          amount: inst.amount_due - inst.amount_paid,
        }
      })
    }

    return []
  }

  const details = getDetails()

  // Group details by client for paid/unpaid stats
  const clientGroups = useMemo(() => {
    const groups: Record<string, typeof details> = {}
    details.forEach((detail) => {
      const clientId = detail.sale?.client_id || 'unknown'
      if (!groups[clientId]) {
        groups[clientId] = []
      }
      groups[clientId].push(detail)
    })
    return groups
  }, [details])

  const totalClients = Object.keys(clientGroups).length
  const paidClients = statType === 'paid' ? totalClients : 0
  const unpaidClients = statType === 'unpaid' ? totalClients : 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={getTitle()}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} size="sm" className="w-full sm:w-auto">
            إغلاق
          </Button>
        </div>
      }
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Summary - Mobile-Friendly */}
        <Card className="p-3 sm:p-4 bg-blue-50 border-blue-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600">عدد العملاء:</span>{' '}
              <span className="font-semibold text-gray-900">
                {statType === 'unpaid' 
                  ? stats.unpaidClients 
                  : statType === 'paid'
                    ? stats.paidClients
                    : new Set(details.map(d => d.sale?.client_id)).size}
              </span>
            </div>
            <div>
              <span className="text-gray-600">عدد الأقساط:</span>{' '}
              <span className="font-semibold text-gray-900">
                {statType === 'unpaid'
                  ? stats.unpaidInstallments
                  : statType === 'paid'
                    ? stats.paidInstallments
                    : details.length}
              </span>
            </div>
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <span className="text-gray-600">المبلغ المستحق:</span>{' '}
              <span className="font-semibold text-gray-900">
                {formatPrice(
                  statType === 'unpaid'
                    ? stats.unpaidAmount
                    : statType === 'paid'
                      ? stats.paidAmount
                      : statType === 'expected'
                        ? stats.expectedThisMonth
                        : stats.total
                )} DT
              </span>
            </div>
            {(statType === 'paid' || statType === 'unpaid') && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                <span className="text-gray-600">من دفعوا:</span>{' '}
                <span className="font-semibold text-green-600">{paidClients}</span>
                {statType === 'unpaid' && (
                  <>
                    {' | '}
                    <span className="text-gray-600">لم يدفعوا:</span>{' '}
                    <span className="font-semibold text-red-600">({unpaidClients})</span>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Client Groups - Mobile-Friendly */}
        {details.length > 0 && (
          <div className="space-y-2 sm:space-y-3">
            {statType === 'paid' && (
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">دفعوا ({paidClients})</h3>
                <div className="space-y-2">
                  {Object.entries(clientGroups).map(([clientId, clientDetails]) => {
                    const client = clientDetails[0].sale?.client
                    const totalAmount = clientDetails.reduce((sum, d) => sum + d.amount, 0)
                    return (
                      <Card key={clientId} className="p-2 sm:p-3 border-l-2 border-l-green-500">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-0.5">
                              {client?.name || 'غير محدد'}
                            </div>
                            {client?.id_number && (
                              <p className="text-[10px] sm:text-xs text-gray-500">هوية: {client.id_number}</p>
                            )}
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm sm:text-base font-bold text-gray-900">
                              {formatPrice(totalAmount)} DT
                            </p>
                            <Badge variant="success" size="sm" className="text-[10px] sm:text-xs mt-0.5">
                              مدفوع
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1.5 pt-2 border-t border-gray-200">
                          {clientDetails.map((detail) => {
                            const installmentNumber = detail.installment.installment_number || 
                              (installmentPayments.findIndex(i => i.id === detail.installment.id) + 1)
                            const dateStr = formatDateShort(
                              detail.installment.paid_date || detail.installment.due_date
                            )
                            return (
                              <div key={detail.installment.id} className="flex items-center justify-between p-1.5 sm:p-2 bg-green-50 rounded">
                                <div className="flex-1">
                                  <p className="text-[10px] sm:text-xs text-gray-600">
                                    قسط #{installmentNumber} ({dateStr})
                                  </p>
                                </div>
                                <p className="text-xs sm:text-sm font-semibold text-gray-900">
                                  {formatPrice(detail.amount)} DT
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}
            
            {statType === 'unpaid' && (
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">لم يدفعوا ({unpaidClients})</h3>
                <div className="space-y-2">
                  {Object.entries(clientGroups).map(([clientId, clientDetails]) => {
                    const client = clientDetails[0].sale?.client
                    const totalAmount = clientDetails.reduce((sum, d) => sum + d.amount, 0)
                    return (
                      <Card key={clientId} className="p-2 sm:p-3 border-l-2 border-l-red-500">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-0.5">
                              {client?.name || 'غير محدد'}
                            </div>
                            {client?.id_number && (
                              <p className="text-[10px] sm:text-xs text-gray-500">هوية: {client.id_number}</p>
                            )}
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm sm:text-base font-bold text-gray-900">
                              {formatPrice(totalAmount)} DT
                            </p>
                            <Badge variant="danger" size="sm" className="text-[10px] sm:text-xs mt-0.5">
                              متأخر
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1.5 pt-2 border-t border-gray-200">
                          {clientDetails.map((detail) => {
                            const installmentNumber = detail.installment.installment_number || 
                              (installmentPayments.findIndex(i => i.id === detail.installment.id) + 1)
                            const dateStr = formatDateShort(detail.installment.due_date)
                            return (
                              <div key={detail.installment.id} className="flex items-center justify-between p-1.5 sm:p-2 bg-red-50 rounded">
                                <div className="flex-1">
                                  <p className="text-[10px] sm:text-xs text-gray-600">
                                    قسط #{installmentNumber} ({dateStr})
                                  </p>
                                </div>
                                <p className="text-xs sm:text-sm font-semibold text-gray-900">
                                  {formatPrice(detail.amount)} DT
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {(statType === 'expected' || statType === 'total') && (
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">سجل الدفعات</h3>
                <div className="space-y-2">
                  {details.map((detail, idx) => {
                    const installmentNumber = detail.installment.installment_number || idx + 1
                    return (
                      <Card key={detail.installment.id} className="p-2 sm:p-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-0.5">
                              {detail.sale?.client?.name || 'غير محدد'}
                            </div>
                            {detail.sale?.client?.id_number && (
                              <p className="text-[10px] sm:text-xs text-gray-500 mb-1">
                                هوية: {detail.sale.client.id_number}
                              </p>
                            )}
                            <p className="text-[10px] sm:text-xs text-gray-600">
                              قسط #{installmentNumber} ({formatDateShort(detail.installment.due_date)})
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm sm:text-base font-bold text-gray-900">
                              {formatPrice(detail.amount)} DT
                            </p>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {details.length === 0 && (
          <Card className="p-6 sm:p-8 text-center">
            <p className="text-xs sm:text-sm text-gray-500">لا توجد بيانات</p>
          </Card>
        )}
      </div>
    </Dialog>
  )
}

