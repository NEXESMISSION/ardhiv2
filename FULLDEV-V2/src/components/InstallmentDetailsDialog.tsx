import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { NotificationDialog } from './ui/notification-dialog'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'

interface Sale {
  id: string
  client_id: string
  land_piece_id: string
  batch_id: string
  sale_price: number
  deposit_amount: number
  sale_date: string
  deadline_date: string | null
  status: string
  payment_method: 'full' | 'installment' | 'promise' | null
  payment_offer_id: string | null
  installment_start_date: string | null
  contract_writer_id: string | null
  sold_by: string | null
  confirmed_by: string | null
  client?: {
    id: string
    name: string
    id_number: string
    phone: string
  }
  piece?: {
    id: string
    piece_number: string
    surface_m2: number
  }
  batch?: {
    id: string
    name: string
    price_per_m2_cash: number | null
  }
  payment_offer?: {
    id: string
    name: string | null
    price_per_m2_installment: number
    advance_mode: 'fixed' | 'percent'
    advance_value: number
    calc_mode: 'monthlyAmount' | 'months'
    monthly_amount: number | null
    months: number | null
  }
  contract_writer?: {
    id: string
    name: string
    type: string
    location: string | null
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

interface InstallmentPayment {
  id: string
  sale_id: string
  installment_number: number
  amount_due: number
  amount_paid: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
}

interface InstallmentDetailsDialogProps {
  open: boolean
  onClose: () => void
  sale: Sale
  onPaymentSuccess: () => void
}

export function InstallmentDetailsDialog({
  open,
  onClose,
  sale,
  onPaymentSuccess,
}: InstallmentDetailsDialogProps) {
  const [installments, setInstallments] = useState<InstallmentPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentPayment | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paying, setPaying] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (open && sale) {
      loadInstallments()
    }
  }, [open, sale])

  async function loadInstallments() {
    setLoading(true)
    try {
      // Optimize query - only select needed fields
      const { data, error } = await supabase
        .from('installment_payments')
        .select('id, sale_id, installment_number, amount_due, amount_paid, due_date, paid_date, status')
        .eq('sale_id', sale.id)
        .order('installment_number', { ascending: true })

      if (error) throw error

      // Update status based on due date (client-side for speed)
      const now = new Date()
      const updatedInstallments = (data || []).map((inst: InstallmentPayment) => {
        const dueDate = new Date(inst.due_date)
        if (inst.status === 'pending' && dueDate < now) {
          return { ...inst, status: 'overdue' as const }
        }
        return inst
      })

      setInstallments(updatedInstallments)
    } catch (e: any) {
      console.error('Error loading installments:', e)
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    if (!sale || !sale.piece) return null

    let totalPaid = sale.deposit_amount || 0

    // If payment_offer exists, calculate advance payment
    if (sale.payment_offer) {
      const calc = calculateInstallmentWithDeposit(
        sale.piece.surface_m2,
        {
          price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
          advance_mode: sale.payment_offer.advance_mode,
          advance_value: sale.payment_offer.advance_value,
          calc_mode: sale.payment_offer.calc_mode,
          monthly_amount: sale.payment_offer.monthly_amount,
          months: sale.payment_offer.months,
        },
        sale.deposit_amount || 0
      )

      totalPaid += calc.advanceAfterDeposit
    }

    // Add paid installments
    const paidInstallments = installments.filter((i) => i.status === 'paid')
    totalPaid += paidInstallments.reduce((sum, i) => sum + i.amount_paid, 0)

    const remaining = sale.sale_price - totalPaid
    const progress = sale.sale_price > 0 ? (totalPaid / sale.sale_price) * 100 : 0

    return {
      totalPaid,
      remaining,
      progress,
      paidCount: paidInstallments.length,
      totalCount: installments.length,
    }
  }, [sale, installments])

  function getDeadlineStatus() {
    if (!sale.deadline_date) return null

    const deadline = new Date(sale.deadline_date)
    const now = new Date()
    const diffMs = now.getTime() - deadline.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (diffMs > 0) {
      return {
        overdue: true,
        days: diffDays,
        hours: diffHours,
      }
    }

    return {
      overdue: false,
      days: Math.abs(diffDays),
      hours: Math.abs(diffHours),
    }
  }

  function getTimeUntilDue(dueDate: string) {
    const due = new Date(dueDate)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()

    if (diffMs < 0) return null

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    return { days, hours }
  }

  function handlePayClick(installment: InstallmentPayment) {
    setSelectedInstallment(installment)
    const remaining = installment.amount_due - installment.amount_paid
    setPaymentAmount(remaining.toFixed(2))
    // Payment date is now automatically set to current date when payment is confirmed
  }

  async function handlePaymentConfirm() {
    if (!selectedInstallment) return

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح')
      setShowErrorDialog(true)
      return
    }

    const remaining = selectedInstallment.amount_due - selectedInstallment.amount_paid
    if (amount > remaining) {
      setErrorMessage(`المبلغ المدخل يتجاوز المتبقي (${formatPrice(remaining)} DT)`)
      setShowErrorDialog(true)
      return
    }

    setPaying(true)
    try {
      const newAmountPaid = selectedInstallment.amount_paid + amount
      const newStatus = newAmountPaid >= selectedInstallment.amount_due ? 'paid' : 'pending'

      const updateData: any = {
        amount_paid: newAmountPaid,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === 'paid') {
        // Use current date/time by default
        updateData.paid_date = new Date().toISOString().split('T')[0]
      }

      const { error } = await supabase
        .from('installment_payments')
        .update(updateData)
        .eq('id', selectedInstallment.id)

      if (error) throw error

      setSuccessMessage(`تم دفع ${formatPrice(amount)} DT بنجاح!`)
      setShowSuccessDialog(true)
      setSelectedInstallment(null)
      setPaymentAmount('')
      await loadInstallments()
      onPaymentSuccess()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل تسجيل الدفع')
      setShowErrorDialog(true)
    } finally {
      setPaying(false)
    }
  }

  const deadlineStatus = getDeadlineStatus()

  // Don't return null if stats is null, show loading or error instead
  if (!stats) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="تفاصيل الصفقة"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose} size="sm">
              إغلاق
            </Button>
          </div>
        }
      >
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">جاري تحميل البيانات...</p>
        </div>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="تفاصيل الصفقة"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose} size="sm">
              إغلاق
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {/* Client Info - Compact */}
          <Card className="p-2 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-1.5 text-xs sm:text-sm">العميل</h3>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">الاسم:</span>
                <span className="font-medium">{sale.client?.name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">CIN:</span>
                <span className="font-medium">{sale.client?.id_number || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">تاريخ البيع:</span>
                <span>{formatDateShort(sale.sale_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">القطعة:</span>
                <span className="font-medium">{sale.piece?.piece_number || '-'}</span>
              </div>
            </div>
          </Card>

          {/* Payment Summary - Compact */}
          <Card className="p-2 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-900 mb-1.5 text-xs sm:text-sm">ملخص الدفع</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <div className="text-center sm:text-right">
                <p className="text-xs text-gray-600 mb-1">إجمالي المبلغ</p>
                <p className="font-bold text-base sm:text-lg">{formatPrice(sale.sale_price)} DT</p>
              </div>
              <div className="text-center sm:text-right">
                <p className="text-xs text-gray-600 mb-1">المدفوع</p>
                <p className="font-bold text-base sm:text-lg text-green-600">{formatPrice(stats.totalPaid)} DT</p>
              </div>
              <div className="text-center sm:text-right">
                <p className="text-xs text-gray-600 mb-1">المتبقي</p>
                <p className="font-bold text-base sm:text-lg text-gray-700">{formatPrice(stats.remaining)} DT</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>التقدم</span>
                <span>{stats.progress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Deadline Warning */}
          {deadlineStatus && deadlineStatus.overdue && (
            <Alert variant="error" className="text-xs sm:text-sm">
              ⚠ تجاوز الموعد بـ {deadlineStatus.days} أيام و {deadlineStatus.hours} ساعات
              <br />
              <span className="text-xs">آخر أجل لإتمام الإجراءات: {formatDateShort(sale.deadline_date!)}</span>
            </Alert>
          )}

          {/* Contract Writer & Other Info - Mobile optimized */}
          {(sale.contract_writer || sale.sold_by || sale.confirmed_by) && (
            <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
              {sale.contract_writer && (
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">محرر العقد:</span>
                  <span className="font-medium">{sale.contract_writer.name} ({sale.contract_writer.type})</span>
                </div>
              )}
              {sale.seller && (
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">باعه:</span>
                  <span className="font-medium">
                    {sale.seller.name}
                    {sale.seller.place && ` (${sale.seller.place})`}
                  </span>
                </div>
              )}
              {sale.confirmedBy && (
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">أكده:</span>
                  <span className="font-medium">
                    {sale.confirmedBy.name}
                    {sale.confirmedBy.place && ` (${sale.confirmedBy.place})`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Installments - Mobile: Cards, Desktop: Table */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5 text-xs sm:text-sm">جدول الأقساط</h3>
            
            {/* Mobile: Card layout */}
            <div className="space-y-2 lg:hidden">
              {loading ? (
                <Card className="p-3 text-center">
                  <p className="text-xs text-gray-500">جاري التحميل...</p>
                </Card>
              ) : installments.length === 0 ? (
                <Card className="p-3 text-center">
                  <p className="text-xs text-gray-500">لا توجد أقساط</p>
                </Card>
              ) : (
                installments.map((inst) => {
                  const remaining = inst.amount_due - inst.amount_paid
                  const timeUntilDue = getTimeUntilDue(inst.due_date)
                  const isOverdue = inst.status === 'overdue' || (inst.status === 'pending' && new Date(inst.due_date) < new Date())

                  return (
                    <Card key={inst.id} className="p-2 sm:p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs sm:text-sm">قسط #{inst.installment_number}</span>
                          {inst.status === 'paid' ? (
                            <Badge variant="success" size="sm" className="text-xs">مدفوع</Badge>
                          ) : isOverdue ? (
                            <Badge variant="danger" size="sm" className="text-xs">متأخر</Badge>
                          ) : (
                            <Badge variant="warning" size="sm" className="text-xs">مستحق</Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">المستحق:</span>
                            <span className="font-semibold block">{formatPrice(inst.amount_due)} DT</span>
                          </div>
                          <div>
                            <span className="text-gray-600">المدفوع:</span>
                            <span className="font-semibold block text-green-600">{formatPrice(inst.amount_paid)} DT</span>
                          </div>
                          <div>
                            <span className="text-gray-600">المتبقي:</span>
                            <span className="font-semibold block text-gray-700">{formatPrice(remaining)} DT</span>
                          </div>
                          <div>
                            <span className="text-gray-600">تاريخ الاستحقاق:</span>
                            <span className="font-medium block">{formatDateShort(inst.due_date)}</span>
                            {timeUntilDue && inst.status === 'pending' && (
                              <span className="text-xs text-gray-500 block">
                                ⏰ {timeUntilDue.days} يوم و {timeUntilDue.hours} ساعة
                              </span>
                            )}
                          </div>
                        </div>

                        {inst.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handlePayClick(inst)}
                            className="w-full text-xs"
                          >
                            💰 دفع القسط
                          </Button>
                        )}
                      </div>
                    </Card>
                  )
                })
              )}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="text-right py-2 px-3 font-semibold text-xs">#</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">المبلغ المستحق</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">المدفوع</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">المتبقي</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">تاريخ الاستحقاق</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">الحالة</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-500 text-xs">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : installments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-500 text-xs">
                        لا توجد أقساط
                      </td>
                    </tr>
                  ) : (
                    installments.map((inst) => {
                      const remaining = inst.amount_due - inst.amount_paid
                      const timeUntilDue = getTimeUntilDue(inst.due_date)
                      const isOverdue = inst.status === 'overdue' || (inst.status === 'pending' && new Date(inst.due_date) < new Date())

                      return (
                        <tr key={inst.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 px-3 text-xs">#{inst.installment_number}</td>
                          <td className="py-2 px-3 text-xs">{formatPrice(inst.amount_due)} DT</td>
                          <td className="py-2 px-3 text-xs">{formatPrice(inst.amount_paid)} DT</td>
                          <td className="py-2 px-3 text-xs">{formatPrice(remaining)} DT</td>
                          <td className="py-2 px-3 text-xs">
                            <div>{formatDateShort(inst.due_date)}</div>
                            {timeUntilDue && inst.status === 'pending' && (
                              <div className="text-xs text-gray-500">
                                ⏰ متبقي: {timeUntilDue.days} أيام و {timeUntilDue.hours} ساعات
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {inst.status === 'paid' ? (
                              <Badge variant="success" size="sm" className="text-xs">مدفوع</Badge>
                            ) : isOverdue ? (
                              <Badge variant="danger" size="sm" className="text-xs">متأخر</Badge>
                            ) : (
                              <Badge variant="warning" size="sm" className="text-xs">مستحق</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {inst.status === 'paid' ? (
                              <span className="text-gray-400 text-xs">-</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handlePayClick(inst)}
                                className="text-xs"
                              >
                                دفع
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Payment Dialog - Simplified */}
      {selectedInstallment && (
        <Dialog
          open={!!selectedInstallment}
          onClose={() => setSelectedInstallment(null)}
          title={`دفع القسط #${selectedInstallment.installment_number}`}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedInstallment(null)} disabled={paying} size="sm">
                إلغاء
              </Button>
              <Button onClick={handlePaymentConfirm} disabled={paying} size="sm">
                {paying ? 'جاري الدفع...' : 'تأكيد الدفع'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
              <p className="text-sm font-medium text-gray-900 mb-1">
                سيتم استلام المبلغ:
              </p>
              <p className="text-lg font-bold text-blue-600">
                {formatPrice(parseFloat(paymentAmount) || 0)} DT
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">مبلغ الدفع *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                size="sm"
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Success Dialog */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={() => {
          setShowSuccessDialog(false)
          setSuccessMessage('')
        }}
        type="success"
        title="نجح الدفع"
        message={successMessage}
      />

      {/* Error Dialog */}
      <NotificationDialog
        open={showErrorDialog}
        onClose={() => {
          setShowErrorDialog(false)
          setErrorMessage('')
        }}
        type="error"
        title="فشل الدفع"
        message={errorMessage}
      />
    </>
  )
}

