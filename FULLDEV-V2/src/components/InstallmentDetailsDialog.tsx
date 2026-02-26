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
import { ConfirmDialog } from './ui/confirm-dialog'
import { formatPrice, formatDateShort } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'

/** Add one month to a date (same day of month, clamp to last day if needed) */
function addMonth(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate(), 0, 0, 0, 0)
  if (next.getDate() !== date.getDate()) {
    next.setDate(0)
  }
  return next
}

/** Add n months to a date (n can be negative to go back). Same day of month, clamp to last day if needed. */
function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  if (n === 0) return d
  d.setMonth(d.getMonth() + n)
  if (d.getDate() !== date.getDate()) {
    d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  }
  return d
}

/** Format date as YYYY-MM-DD in local time (avoid UTC shift from toISOString) */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
  const [loadedPaymentOffer, setLoadedPaymentOffer] = useState<Sale['payment_offer'] | null>(null)
  const [showEditFirstDateDialog, setShowEditFirstDateDialog] = useState(false)
  const [editFirstDateValue, setEditFirstDateValue] = useState('')
  const [savingEditDate, setSavingEditDate] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [multiPayInstallments, setMultiPayInstallments] = useState<InstallmentPayment[] | null>(null)
  /** Number of next installments to pay (user types e.g. 6 → pay next 6 in order) */
  const [payNextCountInput, setPayNextCountInput] = useState('')
  const [resetTableConfirmOpen, setResetTableConfirmOpen] = useState(false)
  const [resettingTable, setResettingTable] = useState(false)
  const [cancelPaymentInst, setCancelPaymentInst] = useState<InstallmentPayment | null>(null)
  const [cancellingPayment, setCancellingPayment] = useState(false)

  useEffect(() => {
    if (open && sale) {
      loadInstallments()
      // Load payment offer if missing but payment_offer_id exists
      if (sale.payment_method === 'installment' && sale.payment_offer_id && !sale.payment_offer) {
        loadPaymentOffer(sale.payment_offer_id)
      } else {
        setLoadedPaymentOffer(null)
      }
    }
    if (!open) {
      setSelectedIds(new Set())
      setMultiPayInstallments(null)
      setShowEditFirstDateDialog(false)
    }
  }, [open, sale])

  async function loadPaymentOffer(offerId: string) {
    if (!offerId) return
    try {
      const { data, error } = await supabase
        .from('payment_offers')
        .select('id, name, price_per_m2_installment, advance_mode, advance_value, calc_mode, monthly_amount, months')
        .eq('id', offerId)
        .single()

      if (error) {
        console.error('Error loading payment offer:', error)
        setLoadedPaymentOffer(null)
      } else {
        setLoadedPaymentOffer(data)
      }
    } catch (e: any) {
      console.error('Exception loading payment offer:', e)
      setLoadedPaymentOffer(null)
    }
  }

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

  const firstPendingInstallment = useMemo(() => {
    const pending = installments.filter((i) => i.status !== 'paid').sort((a, b) => a.installment_number - b.installment_number)
    return pending[0] ?? null
  }, [installments])

  /** First installment in the table (row #1) — used as anchor for "edit first date" */
  const firstInstallment = useMemo(() => {
    const all = [...installments].sort((a, b) => a.installment_number - b.installment_number)
    return all[0] ?? null
  }, [installments])

  /** Pending installments in order (for "pay next N" and max count) */
  const pendingOrdered = useMemo(
    () => installments.filter((i) => i.status !== 'paid').sort((a, b) => a.installment_number - b.installment_number),
    [installments]
  )
  const pendingCount = pendingOrdered.length

  async function handleEditFirstDateConfirm() {
    if (!firstInstallment || !editFirstDateValue.trim()) return
    setSavingEditDate(true)
    try {
      const newFirstDate = new Date(editFirstDateValue)
      const y = newFirstDate.getFullYear()
      const m = newFirstDate.getMonth()
      const day = newFirstDate.getDate()
      const baseDate = new Date(y, m, day, 0, 0, 0, 0)
      // First date = due_date of row #1 (first installment). Then #2 = +1 month, #3 = +2 months, etc. Paid rows keep paid, we only update due_date.
      const allOrdered = [...installments].sort((a, b) => a.installment_number - b.installment_number)
      const updates: { id: string; due_date: string }[] = []
      for (let i = 0; i < allOrdered.length; i++) {
        const newDue = addMonths(baseDate, i)
        updates.push({ id: allOrdered[i].id, due_date: toLocalDateString(newDue) })
      }
      for (const u of updates) {
        const { error } = await supabase
          .from('installment_payments')
          .update({ due_date: u.due_date, updated_at: new Date().toISOString() })
          .eq('id', u.id)
        if (error) throw error
      }
      setShowEditFirstDateDialog(false)
      setEditFirstDateValue('')
      setSuccessMessage('تم تحديث تواريخ جميع الأقساط (المدفوعة والمعلقة) ليتوافق الجدول مع التاريخ الجديد.')
      setShowSuccessDialog(true)
      await loadInstallments()
      onPaymentSuccess()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل تعديل التواريخ')
      setShowErrorDialog(true)
    } finally {
      setSavingEditDate(false)
    }
  }

  const stats = useMemo(() => {
    if (!sale || !sale.piece) return null

    let totalPaid = sale.deposit_amount || 0

    // Use payment_offer from sale or loadedPaymentOffer
    const paymentOffer = sale.payment_offer || loadedPaymentOffer

    // If payment_offer exists, calculate advance payment
    if (paymentOffer) {
      const calc = calculateInstallmentWithDeposit(
        sale.piece.surface_m2,
        {
          price_per_m2_installment: paymentOffer.price_per_m2_installment,
          advance_mode: paymentOffer.advance_mode,
          advance_value: paymentOffer.advance_value,
          calc_mode: paymentOffer.calc_mode,
          monthly_amount: paymentOffer.monthly_amount,
          months: paymentOffer.months,
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
  }, [sale, installments, loadedPaymentOffer])

  /** Reset all payments for this sale: set every row to unpaid (amount_paid=0, paid_date=null, status=pending) */
  async function handleResetAllPayments() {
    setResettingTable(true)
    try {
      for (const inst of installments) {
        const { error } = await supabase
          .from('installment_payments')
          .update({
            amount_paid: 0,
            paid_date: null,
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', inst.id)
        if (error) throw error
      }
      setResetTableConfirmOpen(false)
      setSuccessMessage('تم إعادة تعيين جدول الأقساط. جميع الأقساط أصبحت غير مدفوعة.')
      setShowSuccessDialog(true)
      await loadInstallments()
      onPaymentSuccess()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل إعادة تعيين الجدول')
      setShowErrorDialog(true)
    } finally {
      setResettingTable(false)
    }
  }

  /** Cancel a single payment: set this row to unpaid. If the next installment is partially paid (overpayment from this one), zero it too. */
  async function handleCancelPayment(inst: InstallmentPayment) {
    setCancellingPayment(true)
    try {
      const { error } = await supabase
        .from('installment_payments')
        .update({
          amount_paid: 0,
          paid_date: null,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', inst.id)
      if (error) throw error

      // If the next installment (by number) is partially paid, zero it too so overpayment from this row is reverted
      const nextInst = installments.find(
        (i) => i.installment_number === inst.installment_number + 1 && i.amount_paid > 0 && i.amount_paid < i.amount_due
      )
      if (nextInst) {
        const { error: err2 } = await supabase
          .from('installment_payments')
          .update({
            amount_paid: 0,
            paid_date: null,
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', nextInst.id)
        if (err2) throw err2
      }

      setCancelPaymentInst(null)
      setSuccessMessage(
        nextInst
          ? `تم إلغاء دفع القسط #${inst.installment_number} والقسم المدفوع جزئياً من القسط #${nextInst.installment_number}.`
          : `تم إلغاء دفع القسط #${inst.installment_number}.`
      )
      setShowSuccessDialog(true)
      await loadInstallments()
      onPaymentSuccess()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل إلغاء الدفع')
      setShowErrorDialog(true)
    } finally {
      setCancellingPayment(false)
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
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح')
      setShowErrorDialog(true)
      return
    }

    const allOrdered = [...installments].sort((a, b) => a.installment_number - b.installment_number)
    const paidToday = new Date().toISOString().split('T')[0]

    if (multiPayInstallments && multiPayInstallments.length > 0) {
      setPaying(true)
      try {
        const sorted = [...multiPayInstallments].sort((a, b) => a.installment_number - b.installment_number)
        const totalDueSelected = sorted.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0)
        const startIdx = allOrdered.findIndex((i) => i.id === sorted[0].id)
        if (startIdx < 0) throw new Error('Installment not found')
        let toApply = amount
        let totalApplied = 0
        for (let i = startIdx; i < allOrdered.length && toApply > 0; i++) {
          const inst = allOrdered[i]
          const need = inst.amount_due - inst.amount_paid
          if (need <= 0) continue
          const pay = Math.min(toApply, need)
          const newAmountPaid = inst.amount_paid + pay
          const newStatus = newAmountPaid >= inst.amount_due ? 'paid' : 'pending'
          const updateData: any = {
            amount_paid: newAmountPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          }
          if (newStatus === 'paid') updateData.paid_date = paidToday
          const { error } = await supabase.from('installment_payments').update(updateData).eq('id', inst.id)
          if (error) throw error
          toApply -= pay
          totalApplied += pay
        }
        const overApplied = amount - totalApplied
        const hadExcessApplied = amount > totalDueSelected && overApplied <= 0
        const msg =
          overApplied > 0
            ? `تم استلام ${formatPrice(amount)} DT وتطبيق ${formatPrice(totalApplied)} DT على الأقساط. المبلغ الزائد ${formatPrice(overApplied)} DT لم يُطبَّق (لا أقساط مستقبلية).`
            : `تم دفع ${formatPrice(amount)} DT بنجاح.${hadExcessApplied ? ' تم تطبيق الزائد على الأقساط التالية.' : ''}`
        setSuccessMessage(msg)
        setShowSuccessDialog(true)
        setMultiPayInstallments(null)
        setSelectedIds(new Set())
        setPayNextCountInput('')
        setPaymentAmount('')
        await loadInstallments()
        onPaymentSuccess()
      } catch (e: any) {
        const msg = e?.message ?? 'فشل تسجيل الدفع'
        setErrorMessage(msg.includes('يتجاوز المتبقي') ? 'فشل تسجيل الدفع. تأكد من الاتصال ثم أعد المحاولة.' : msg)
        setShowErrorDialog(true)
      } finally {
        setPaying(false)
      }
      return
    }

    if (!selectedInstallment) return

    // Allow any amount > 0; excess is applied to next installments (overpayment supported)
    const remainingThis = selectedInstallment.amount_due - selectedInstallment.amount_paid
    const startIdx = allOrdered.findIndex((i) => i.id === selectedInstallment.id)
    if (startIdx < 0) return

    setPaying(true)
    try {
      let toApply = amount
      let totalApplied = 0
      for (let i = startIdx; i < allOrdered.length && toApply > 0; i++) {
        const inst = allOrdered[i]
        const need = inst.amount_due - inst.amount_paid
        if (need <= 0) continue
        const pay = Math.min(toApply, need)
        const newAmountPaid = inst.amount_paid + pay
        const newStatus = newAmountPaid >= inst.amount_due ? 'paid' : 'pending'
        const updateData: any = {
          amount_paid: newAmountPaid,
          status: newStatus,
          updated_at: new Date().toISOString(),
        }
        if (newStatus === 'paid') updateData.paid_date = paidToday
        const { error } = await supabase.from('installment_payments').update(updateData).eq('id', inst.id)
        if (error) throw error
        toApply -= pay
        totalApplied += pay
      }
      const overApplied = amount - totalApplied
      const successMsg =
        overApplied > 0
          ? `تم استلام ${formatPrice(amount)} DT. تم تطبيق ${formatPrice(totalApplied)} DT على القسط/الأقساط. المبلغ الزائد ${formatPrice(overApplied)} DT لم يُطبَّق (لا أقساط مستقبلية).`
          : totalApplied > remainingThis
            ? `تم دفع ${formatPrice(amount)} DT بنجاح. تم تطبيق الزائد على الأقساط التالية.`
            : `تم دفع ${formatPrice(amount)} DT بنجاح!`
      setSuccessMessage(successMsg)
      setShowSuccessDialog(true)
      setSelectedInstallment(null)
      setPaymentAmount('')
      await loadInstallments()
      onPaymentSuccess()
    } catch (e: any) {
      const msg = e?.message ?? 'فشل تسجيل الدفع'
      setErrorMessage(msg.includes('يتجاوز المتبقي') ? 'فشل تسجيل الدفع. تأكد من الاتصال ثم أعد المحاولة.' : msg)
      setShowErrorDialog(true)
    } finally {
      setPaying(false)
    }
  }

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
              <div className="flex items-center justify-between">
                <span className="text-gray-600">طريقة الدفع:</span>
                <span className="font-medium">
                  {sale.payment_method === 'full' ? 'نقدي' :
                   sale.payment_method === 'installment' ? 'تقسيط' :
                   sale.payment_method === 'promise' ? 'وعد بالبيع' :
                   sale.payment_method || 'غير محدد'}
                </span>
              </div>
              {(sale.payment_offer || loadedPaymentOffer) && (
                <div className="mt-2 pt-2 border-t border-blue-300">
                  <p className="font-semibold text-blue-900 mb-1">عرض التقسيط:</p>
                  <div className="space-y-0.5 text-xs text-gray-700">
                    {(() => {
                      const offer = sale.payment_offer || loadedPaymentOffer
                      if (!offer) return null
                      return (
                        <>
                          <p>• الاسم: {offer.name || 'بدون اسم'}</p>
                          <p>• السعر لكل م²: {offer.price_per_m2_installment.toLocaleString()} دت</p>
                          <p>• التسبقة: {
                            offer.advance_mode === 'fixed' 
                              ? `${offer.advance_value.toLocaleString()} دت`
                              : `${offer.advance_value}%`
                          }</p>
                          {offer.calc_mode === 'monthlyAmount' && offer.monthly_amount && (
                            <p>• المبلغ الشهري: {offer.monthly_amount.toLocaleString()} دت</p>
                          )}
                          {offer.calc_mode === 'months' && offer.months && (
                            <p>• عدد الأشهر: {offer.months} شهر</p>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">جدول الأقساط</h3>
              <div className="flex flex-wrap items-center gap-2">
                {firstInstallment && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setEditFirstDateValue(firstInstallment.due_date)
                      setShowEditFirstDateDialog(true)
                    }}
                  >
                    📅 تعديل جدول الاستحقاق (الأول ← والباقي تلقائياً)
                  </Button>
                )}
                {installments.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => setResetTableConfirmOpen(true)}
                  >
                    🧹 تنظيف جدول الأقساط (إعادة تعيين كل المدفوعات)
                  </Button>
                )}
                {pendingCount > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">عدد الأقساط لدفعها معاً (التالية بالترتيب):</Label>
                      <Input
                        type="number"
                        min={1}
                        max={pendingCount}
                        value={payNextCountInput}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '') setPayNextCountInput('')
                          else {
                            const n = parseInt(v, 10)
                            if (!Number.isNaN(n) && n >= 1) setPayNextCountInput(String(Math.min(n, pendingCount)))
                          }
                        }}
                        placeholder="مثلاً 6"
                        size="sm"
                        className="w-20 text-xs"
                      />
                      <span className="text-xs text-gray-500">من {pendingCount} متبقية</span>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="text-xs"
                        disabled={!payNextCountInput || parseInt(payNextCountInput, 10) < 1}
                        onClick={() => {
                          const n = Math.min(Math.max(1, parseInt(payNextCountInput, 10) || 0), pendingCount)
                          if (n < 1) return
                          const next = pendingOrdered.slice(0, n)
                          const total = next.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0)
                          setMultiPayInstallments(next)
                          setPaymentAmount(total.toFixed(2))
                        }}
                      >
                        💰 معاينة ودفع الـ {payNextCountInput ? Math.min(parseInt(payNextCountInput, 10) || 0, pendingCount) : 0} أقساط التالية
                      </Button>
                    </div>
                    {selectedIds.size > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          const selected = installments.filter((i) => selectedIds.has(i.id)).sort((a, b) => a.installment_number - b.installment_number)
                          setMultiPayInstallments(selected)
                          setPaymentAmount(selected.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0).toFixed(2))
                        }}
                      >
                        دفع المختارة ({selectedIds.size}) من الجدول
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            
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
                  const isSelected = selectedIds.has(inst.id)
                  const isPending = inst.status !== 'paid'

                  return (
                    <Card key={inst.id} className="p-2 sm:p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {isPending && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(inst.id)) next.delete(inst.id)
                                    else next.add(inst.id)
                                    return next
                                  })
                                }}
                                className="rounded border-gray-300"
                              />
                            )}
                            <span className="font-semibold text-xs sm:text-sm truncate">قسط #{inst.installment_number}</span>
                          </div>
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

                        {inst.status === 'paid' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setCancelPaymentInst(inst)}
                            className="w-full text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          >
                            إلغاء الدفع
                          </Button>
                        ) : (
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
                    <th className="text-right py-2 px-3 font-semibold text-xs w-8">اختيار</th>
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
                      <td colSpan={8} className="py-4 text-center text-gray-500 text-xs">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : installments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-500 text-xs">
                        لا توجد أقساط
                      </td>
                    </tr>
                  ) : (
                    installments.map((inst) => {
                      const remaining = inst.amount_due - inst.amount_paid
                      const timeUntilDue = getTimeUntilDue(inst.due_date)
                      const isOverdue = inst.status === 'overdue' || (inst.status === 'pending' && new Date(inst.due_date) < new Date())
                      const isPending = inst.status !== 'paid'
                      const isSelected = selectedIds.has(inst.id)

                      return (
                        <tr key={inst.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            {isPending ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(inst.id)) next.delete(inst.id)
                                    else next.add(inst.id)
                                    return next
                                  })
                                }}
                                className="rounded border-gray-300"
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
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
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setCancelPaymentInst(inst)}
                                className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                              >
                                إلغاء الدفع
                              </Button>
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

      {/* Payment Dialog - Single or multiple installments */}
      {(selectedInstallment || (multiPayInstallments && multiPayInstallments.length > 0)) && (
        <Dialog
          open={!!selectedInstallment || !!(multiPayInstallments && multiPayInstallments.length > 0)}
          onClose={() => {
            setSelectedInstallment(null)
            setMultiPayInstallments(null)
            setPayNextCountInput('')
          }}
          title={multiPayInstallments && multiPayInstallments.length > 0 ? `دفع ${multiPayInstallments.length} أقساط` : selectedInstallment ? `دفع القسط #${selectedInstallment.installment_number}` : ''}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedInstallment(null)
                  setMultiPayInstallments(null)
                  setPayNextCountInput('')
                }}
                disabled={paying}
                size="sm"
              >
                إلغاء
              </Button>
              <Button onClick={handlePaymentConfirm} disabled={paying} size="sm">
                {paying ? 'جاري الدفع...' : 'تأكيد الدفع'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            {multiPayInstallments && multiPayInstallments.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs font-semibold text-amber-900 mb-2">سيتم دفع الأقساط التالية عند التأكيد:</p>
                <ul className="text-xs text-gray-700 space-y-1 max-h-32 overflow-y-auto">
                  {multiPayInstallments.map((inst) => {
                    const remaining = inst.amount_due - inst.amount_paid
                    return (
                      <li key={inst.id}>
                        قسط #{inst.installment_number} — {formatPrice(remaining)} DT (المتبقي)
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs font-semibold text-amber-900 mt-2 pt-2 border-t border-amber-200">
                  الإجمالي: {formatPrice(multiPayInstallments.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0))} DT
                </p>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
              <p className="text-sm font-medium text-gray-900 mb-1">
                {multiPayInstallments && multiPayInstallments.length > 0 ? 'إجمالي المبلغ المطلوب:' : 'سيتم استلام المبلغ:'}
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
              <p className="text-xs text-gray-500">
                {multiPayInstallments && multiPayInstallments.length > 0
                  ? `الإجمالي المطلوب لهذه الأقساط: ${formatPrice(multiPayInstallments.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0))} DT. يمكنك إدخال مبلغاً أكبر وسيُطبَّق الزائد على الأقساط التالية.`
                  : 'يمكنك إدخال مبلغاً أكبر من المتبقي وسيُطبَّق الزائد على الأقساط التالية.'}
              </p>
            </div>
          </div>
        </Dialog>
      )}

      {/* Edit first installment date dialog */}
      {showEditFirstDateDialog && firstInstallment && (
        <Dialog
          open={showEditFirstDateDialog}
          onClose={() => !savingEditDate && setShowEditFirstDateDialog(false)}
          title="تعديل جدول الاستحقاق: الأول يحدّث الكل"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditFirstDateDialog(false)} disabled={savingEditDate} size="sm">
                إلغاء
              </Button>
              <Button onClick={handleEditFirstDateConfirm} disabled={savingEditDate || !editFirstDateValue.trim()} size="sm">
                {savingEditDate ? 'جاري الحفظ...' : 'حفظ وتحديث كل التواريخ'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              حدد تاريخ استحقاق <strong>أول قسط في الجدول (رقم 1)</strong>. سيتم تحديث هذا التاريخ، ثم <strong>كل</strong> تواريخ الأقساط التالية تلقائياً (كل قسط بعد شهر من السابق). المدفوع يبقى مدفوعاً، والجدول يتوافق مع التاريخ الجديد.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">تاريخ أول قسط في الجدول *</Label>
              <Input
                type="date"
                value={editFirstDateValue}
                onChange={(e) => setEditFirstDateValue(e.target.value)}
                size="sm"
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Reset table: clear all payments for this sale */}
      <ConfirmDialog
        open={resetTableConfirmOpen}
        onClose={() => !resettingTable && setResetTableConfirmOpen(false)}
        onConfirm={handleResetAllPayments}
        title="تنظيف جدول الأقساط"
        description="سيتم اعتبار جميع الأقساط غير مدفوعة (المبلغ المدفوع = 0). لا يمكن التراجع. هل تتابع؟"
        confirmText="نعم، إعادة تعيين الكل"
        cancelText="إلغاء"
        variant="danger"
        loading={resettingTable}
      />

      {/* Cancel single payment */}
      <ConfirmDialog
        open={!!cancelPaymentInst}
        onClose={() => !cancellingPayment && setCancelPaymentInst(null)}
        onConfirm={() => cancelPaymentInst && handleCancelPayment(cancelPaymentInst)}
        title="إلغاء دفع القسط"
        description={cancelPaymentInst ? `سيتم إلغاء دفع القسط #${cancelPaymentInst.installment_number} (اعتباره غير مدفوع). هل تتابع؟` : ''}
        confirmText="نعم، إلغاء الدفع"
        cancelText="تراجع"
        variant="danger"
        loading={cancellingPayment}
      />

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

