import React, { useState, useMemo } from 'react'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'

interface Detail {
  sale: {
    id: string
    batch?: {
      id: string
      name: string
    }
    piece?: {
      id: string
      piece_number: string
    }
    client?: {
      id: string
      name: string
      id_number: string
    }
    seller?: {
      id: string
      name: string
      place: string | null
    }
    confirmedBy?: {
      id: string
      name: string
      place: string | null
    }
  }
  amount: number
  date: string
}

interface FinanceDetailsDialogProps {
  open: boolean
  onClose: () => void
  type: string
  typeLabel: string
  details: Detail[]
  totalAmount: number
}


export function FinanceDetailsDialog({
  open,
  onClose,
  type,
  typeLabel,
  details,
  totalAmount,
}: FinanceDetailsDialogProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Group and sort details - fixed: group by batch, sort by date descending
  const groupedDetails = useMemo(() => {
    // Sort by date descending
    const sorted = [...details].sort((a, b) => {
      const aDate = new Date(a.date).getTime()
      const bDate = new Date(b.date).getTime()
      return bDate - aDate // Descending
    })

    // Group by batch
    const groups: Record<string, Detail[]> = {}
    
    sorted.forEach((detail) => {
      const key = detail.sale.batch?.name || 'غير محدد'
      
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(detail)
    })

    return groups
  }, [details])

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedGroups(newExpanded)
  }

  const expandAll = () => {
    setExpandedGroups(new Set(Object.keys(groupedDetails)))
  }

  const collapseAll = () => {
    setExpandedGroups(new Set())
  }

  // Get specific header based on type
  const getHeader = () => {
    if (type === 'installments') return 'تفاصيل المدفوعات بالتقسيط'
    if (type === 'deposits') return 'تفاصيل العربون'
    if (type === 'full') return 'تفاصيل المبيعات النقدية'
    if (type === 'advance') return 'تفاصيل التسبقة'
    if (type === 'promise') return 'تفاصيل وعد بالبيع'
    if (type === 'commission') return 'تفاصيل العمولة'
    return `تفاصيل ${typeLabel}`
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={getHeader()}
      size="lg"
      footer={
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 w-full">
          <div className="text-xs sm:text-sm text-gray-600">
            <span className="font-medium">الإجمالي:</span>{' '}
            <span className="font-bold text-gray-900">{formatPrice(totalAmount)} DT</span>
          </div>
          <Button variant="secondary" onClick={onClose} size="sm" className="w-full sm:w-auto">
            إغلاق
          </Button>
        </div>
      }
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Summary - Mobile-Friendly */}
        <Card className="p-3 sm:p-4 bg-blue-50 border-blue-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div>
              <span className="text-gray-600">عدد العملاء:</span>{' '}
              <span className="font-semibold text-gray-900">{new Set(details.map(d => d.sale.client?.id)).size}</span>
            </div>
            <div>
              <span className="text-gray-600">عدد العمليات:</span>{' '}
              <span className="font-semibold text-gray-900">{details.length}</span>
            </div>
            <div>
              <span className="text-gray-600">المبلغ الإجمالي:</span>{' '}
              <span className="font-semibold text-gray-900">{formatPrice(totalAmount)} DT</span>
            </div>
          </div>
        </Card>

        {/* Details - Mobile-Friendly Cards */}
        <div>
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-700">سجل الدفعات</h3>
            {Object.keys(groupedDetails).length > 1 && (
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={expandAll}
                  className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
                >
                  توسيع الكل
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={collapseAll}
                  className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
                >
                  طي الكل
                </Button>
              </div>
            )}
          </div>
          
          {details.length === 0 ? (
            <Card className="p-6 sm:p-8 text-center">
              <p className="text-xs sm:text-sm text-gray-500">لا توجد بيانات</p>
            </Card>
          ) : (
            <div className="space-y-2 sm:space-y-3 max-h-[60vh] overflow-y-auto">
              {Object.entries(groupedDetails).map(([groupKey, groupDetails]) => {
                const groupTotal = groupDetails.reduce((sum, d) => sum + d.amount, 0)
                const isExpanded = expandedGroups.has(groupKey)
                
                return (
                  <Card key={groupKey} className="border-l-2 border-l-blue-500">
                    {/* Group Header */}
                    <div
                      className="p-2 sm:p-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-gray-900">{groupKey}</span>
                          <Badge variant="info" size="sm" className="text-[10px] sm:text-xs">
                            {groupDetails.length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-xs sm:text-sm font-semibold text-gray-700">
                            {formatPrice(groupTotal)} DT
                          </span>
                          <span className="text-gray-500 text-xs sm:text-sm">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Group Details */}
                    {isExpanded && (
                      <div className="p-2 sm:p-3 space-y-2">
                        {groupDetails.map((detail, idx) => (
                          <Card key={`${groupKey}-${idx}`} className="p-2 sm:p-3 bg-white border border-gray-200">
                            <div className="space-y-1.5 sm:space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                                    <Badge variant="default" size="sm" className="text-[10px] sm:text-xs">
                                      #{idx + 1}
                                    </Badge>
                                    <span className="text-xs sm:text-sm font-medium text-gray-900">
                                      {detail.sale.client?.name || 'غير محدد'}
                                    </span>
                                  </div>
                                  {detail.sale.client?.id_number && (
                                    <p className="text-[10px] sm:text-xs text-gray-500 mb-1">
                                      هوية: {detail.sale.client.id_number}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-xs text-gray-600">
                                    <span>{detail.sale.batch?.name || '-'}</span>
                                    <span>•</span>
                                    <Badge variant="secondary" size="sm" className="text-[10px] sm:text-xs">
                                      {detail.sale.piece?.piece_number || '-'}
                                    </Badge>
                                    <span>•</span>
                                    <span>{formatDateShort(detail.date)}</span>
                                  </div>
                                  {(detail.sale.seller || detail.sale.confirmedBy) && (
                                    <div className="mt-1.5 space-y-0.5 text-[10px] sm:text-xs text-gray-500">
                                      {detail.sale.seller && (
                                        <div>
                                          باعه: <span className="font-medium">{detail.sale.seller.name}</span>
                                          {detail.sale.seller.place && (
                                            <span> ({detail.sale.seller.place})</span>
                                          )}
                                        </div>
                                      )}
                                      {detail.sale.confirmedBy && (
                                        <div>
                                          أكده: <span className="font-medium">{detail.sale.confirmedBy.name}</span>
                                          {detail.sale.confirmedBy.place && (
                                            <span> ({detail.sale.confirmedBy.place})</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="text-left">
                                  <p className="text-sm sm:text-base font-bold text-gray-900">
                                    {formatPrice(detail.amount)} DT
                                  </p>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

