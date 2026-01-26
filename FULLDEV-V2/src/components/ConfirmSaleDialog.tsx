import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Alert } from './ui/alert'
import { Card } from './ui/card'
import { ConfirmDialog } from './ui/confirm-dialog'
import { NotificationDialog } from './ui/notification-dialog'
import { formatPrice, formatDate } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { generateInstallmentSchedule } from '@/utils/installmentSchedule'
import { useAuth } from '@/contexts/AuthContext'

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
  payment_offer_id: string | null
  partial_payment_amount: number | null
  remaining_payment_amount: number | null
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
  client?: {
    id: string
    name: string
    id_number: string
    phone: string
  }
}

interface ContractWriter {
  id: string
  name: string
  type: string
}

interface ConfirmSaleDialogProps {
  open: boolean
  onClose: () => void
  sale: Sale | null
  onConfirm: () => void
}

export function ConfirmSaleDialog({ open, onClose, sale, onConfirm }: ConfirmSaleDialogProps) {
  const { systemUser } = useAuth()
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [contractWriterId, setContractWriterId] = useState('')
  const [notes, setNotes] = useState('')
  const [contractWriters, setContractWriters] = useState<ContractWriter[]>([])
  const [loadingWriters, setLoadingWriters] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false)
  const [companyFee, setCompanyFee] = useState('')
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [promisePaymentAmount, setPromisePaymentAmount] = useState('')
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState('')

  useEffect(() => {
    if (open && sale) {
      // Set default installment start date to today
      const today = new Date()
      setInstallmentStartDate(today.toISOString().split('T')[0])
      setPaymentMethod('cash')
      setContractWriterId('')
      setNotes('')
      setCompanyFee('')
      setAppointmentDate('')
      
      // For promise sales, auto-fill with remaining amount if partial payment was made
      if (sale.payment_method === 'promise' && sale.remaining_payment_amount) {
        setPromisePaymentAmount(sale.remaining_payment_amount.toString())
      } else {
        setPromisePaymentAmount('')
      }
      
      // Debug logging for installment sales (development only)
      if (process.env.NODE_ENV === 'development' && sale.payment_method === 'installment') {
        console.log('ConfirmSaleDialog - Installment sale:', {
          sale_id: sale.id,
          payment_offer_id: sale.payment_offer_id,
          payment_offer: sale.payment_offer,
          has_payment_offer: !!sale.payment_offer
        })
      }
      
      setError(null)
      setShowFinalConfirmDialog(false)
      setShowSuccessDialog(false)
      setShowErrorDialog(false)
      setShowAppointmentDialog(false)
      loadContractWriters()
    }
  }, [open, sale])

  async function loadContractWriters() {
    setLoadingWriters(true)
    try {
      const { data, error: err } = await supabase
        .from('contract_writers')
        .select('*')
        .order('name', { ascending: true })

      if (err) throw err
      setContractWriters(data || [])
    } catch (e: any) {
      console.error('Error loading contract writers:', e)
    } finally {
      setLoadingWriters(false)
    }
  }

  // Calculate confirmation details
  const calculations = useMemo(() => {
    if (!sale || !sale.piece) return null

    const depositAmount = sale.deposit_amount || 0
    let confirmationAmount = 0
    let remainingForInstallments = 0
    let installmentDetails = null

    if (sale.payment_method === 'installment' && sale.payment_offer && sale.piece) {
      // Use centralized calculator
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
        depositAmount
      )

      confirmationAmount = calc.advanceAfterDeposit
      // المتبقي للتقسيط = السعر الفعلي للبيع - (التسبقة بعد خصم العربون)
      remainingForInstallments = sale.sale_price - calc.advanceAfterDeposit

      // Always create installment details, even without start date
      let startDate = null
      let endDate = null
      let totalRemainingFromSchedule = 0

      if (installmentStartDate) {
        const schedule = generateInstallmentSchedule(
          sale.piece.surface_m2,
          {
            price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
            advance_mode: sale.payment_offer.advance_mode,
            advance_value: sale.payment_offer.advance_value,
            calc_mode: sale.payment_offer.calc_mode,
            monthly_amount: sale.payment_offer.monthly_amount,
            months: sale.payment_offer.months,
          },
          new Date(installmentStartDate),
          depositAmount
        )

        totalRemainingFromSchedule = schedule.reduce((sum, item) => sum + item.amountDue, 0)
        startDate = schedule.length > 0 ? schedule[0].dueDate : null
        endDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : null
      }

      installmentDetails = {
        numberOfMonths: calc.recalculatedNumberOfMonths,
        monthlyPayment: calc.recalculatedMonthlyPayment,
        startDate,
        endDate,
        totalRemaining: totalRemainingFromSchedule > 0 ? totalRemainingFromSchedule : remainingForInstallments,
      }
    } else if (sale.payment_method === 'full') {
      confirmationAmount = sale.sale_price - depositAmount
    } else if (sale.payment_method === 'promise') {
      // For promise, use remaining_payment_amount if it exists (after partial payment)
      // Otherwise, calculate as sale_price - deposit - partial_payment_amount
      if (sale.remaining_payment_amount !== null && sale.remaining_payment_amount !== undefined) {
        confirmationAmount = sale.remaining_payment_amount
      } else {
        const partialPaid = sale.partial_payment_amount || 0
        confirmationAmount = sale.sale_price - depositAmount - partialPaid
      }
    }

    return {
      depositAmount,
      confirmationAmount,
      remainingForInstallments,
      installmentDetails,
      totalPrice: sale.sale_price,
    }
  }, [sale, installmentStartDate, sale?.partial_payment_amount, sale?.remaining_payment_amount])

  function handleConfirmClick() {
    if (!sale) return

    setError(null)

    if (sale.payment_method === 'installment' && !installmentStartDate) {
      setError('يرجى تحديد تاريخ بداية الأقساط')
      return
    }

    if (sale.payment_method === 'promise') {
      // Trim and clean the input
      const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
      const amount = parseFloat(cleanedAmount)
      
      if (!cleanedAmount || cleanedAmount === '' || isNaN(amount) || amount <= 0) {
        setError('يرجى إدخال المبلغ المستلم الآن')
        return
      }
      if (amount > calculations.confirmationAmount) {
        setError(`المبلغ المدخل يتجاوز المتبقي (${formatPrice(calculations.confirmationAmount)} DT)`)
        return
      }
    }

    setShowFinalConfirmDialog(true)
  }

  async function handleFinalConfirm() {
    if (!sale) return

    setShowFinalConfirmDialog(false)
    setConfirming(true)

    try {
      // For promise sales, check if this is completion or partial payment
      if (sale.payment_method === 'promise') {
        const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
        const paymentAmount = parseFloat(cleanedAmount)
        const totalRemaining = calculations.confirmationAmount
        const newRemaining = totalRemaining - paymentAmount

        // If there's still remaining, this is a partial payment
        if (newRemaining > 0.01) {
          // Partial payment - update partial_payment_amount and remaining_payment_amount
          const currentPartial = sale.partial_payment_amount || 0
          const newPartial = currentPartial + paymentAmount

          // Commission should only be set on the FIRST partial payment
          // If company_fee_amount already exists, don't update it (this is a subsequent payment)
          const isFirstPayment = !sale.company_fee_amount || sale.company_fee_amount === 0
          
          const updateData: any = {
            partial_payment_amount: newPartial,
            remaining_payment_amount: newRemaining,
            contract_writer_id: contractWriterId || null,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          }

          // Only set commission if this is the first payment and commission is provided
          if (isFirstPayment && companyFee) {
            updateData.company_fee_amount = parseFloat(companyFee)
          }
          // If commission already exists, don't include it in update (preserve existing value)

          const { error: updateErr } = await supabase
            .from('sales')
            .update(updateData)
            .eq('id', sale.id)
            .eq('status', 'pending')

          if (updateErr) throw updateErr

          setSuccessMessage(`تم استلام ${formatPrice(paymentAmount)} DT. المتبقي: ${formatPrice(newRemaining)} DT`)
          setShowSuccessDialog(true)
          onConfirm()
          // Close the main dialog immediately
          onClose()
          return
        }
      }

      // Full completion (for full payment, installment, or promise with full payment)
      const updateData: any = {
        status: 'completed',
        contract_writer_id: contractWriterId || null,
        notes: notes.trim() || null,
        confirmed_by: systemUser?.id || null,
      }

      // For promise sales: only set commission if it doesn't exist yet (first time)
      // For other sales: set commission if provided
      if (sale.payment_method === 'promise') {
        // Only set commission if it's not already set (first payment)
        if (!sale.company_fee_amount && companyFee) {
          updateData.company_fee_amount = parseFloat(companyFee)
        }
        // If commission already exists, don't update it
      } else {
        // For non-promise sales, set commission if provided
        if (companyFee) {
          updateData.company_fee_amount = parseFloat(companyFee)
        }
      }

      // For promise sales, set final amounts
      if (sale.payment_method === 'promise') {
        const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
        const paymentAmount = parseFloat(cleanedAmount)
        updateData.partial_payment_amount = (sale.partial_payment_amount || 0) + paymentAmount
        updateData.remaining_payment_amount = 0
      }

      const { error: updateErr } = await supabase
        .from('sales')
        .update(updateData)
        .eq('id', sale.id)
        .eq('status', 'pending')

      if (updateErr) throw updateErr

      // Update piece status to Sold
      const { error: pieceErr } = await supabase
        .from('land_pieces')
        .update({ status: 'Sold', updated_at: new Date().toISOString() })
        .eq('id', sale.land_piece_id)

      if (pieceErr) throw pieceErr

      // Create installment schedule if installment sale
      if (sale.payment_method === 'installment' && sale.payment_offer && sale.piece && installmentStartDate) {
        const schedule = generateInstallmentSchedule(
          sale.piece.surface_m2,
          {
            price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
            advance_mode: sale.payment_offer.advance_mode,
            advance_value: sale.payment_offer.advance_value,
            calc_mode: sale.payment_offer.calc_mode,
            monthly_amount: sale.payment_offer.monthly_amount,
            months: sale.payment_offer.months,
          },
          new Date(installmentStartDate),
          sale.deposit_amount || 0
        )

        // Insert installment payments
        const installmentPayments = schedule.map((item) => ({
          sale_id: sale.id,
          installment_number: item.installmentNumber,
          amount_due: item.amountDue,
          amount_paid: 0,
          due_date: item.dueDate.toISOString().split('T')[0],
          status: 'pending',
        }))

        const { error: installmentsErr } = await supabase
          .from('installment_payments')
          .insert(installmentPayments)

        if (installmentsErr) throw installmentsErr
      }

      setSuccessMessage('تم تأكيد البيع بنجاح!')
      setShowSuccessDialog(true)
      onConfirm()
      // Close the main dialog immediately
      onClose()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل تأكيد البيع')
      setShowErrorDialog(true)
    } finally {
      setConfirming(false)
    }
  }

  function handleSuccessClose() {
    setShowSuccessDialog(false)
    onClose()
  }

  function handleErrorClose() {
    setShowErrorDialog(false)
  }

  async function handleAppointmentConfirm() {
    if (!sale || !appointmentDate) return

    try {
      const { error } = await supabase
        .from('sales')
        .update({ 
          appointment_date: appointmentDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', sale.id)

      if (error) throw error

      setShowAppointmentDialog(false)
      setSuccessMessage('تم تحديد الموعد بنجاح!')
      setShowSuccessDialog(true)
      onConfirm() // Refresh the list
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل تحديد الموعد')
      setShowErrorDialog(true)
    }
  }

  if (!sale || !calculations) return null

  const isInstallment = sale.payment_method === 'installment'
  const isFull = sale.payment_method === 'full'
  const isPromise = sale.payment_method === 'promise'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        isPromise && sale.partial_payment_amount
          ? `استكمال الوعد بالبيع`
          : isPromise
            ? `تأكيد وعد بالبيع`
            : isInstallment
              ? `تأكيد بيع بالتقسيط`
              : isFull
                ? `تأكيد بيع نقدي`
                : `تأكيد البيع`
      }
      size="xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={confirming}>
            إلغاء
          </Button>
          <Button 
            onClick={handleConfirmClick} 
            disabled={confirming}
            className="bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500"
          >
            {confirming 
              ? 'جاري التأكيد...' 
              : isPromise && sale.partial_payment_amount
                ? 'استكمال الوعد بالبيع'
                : isPromise
                  ? 'تأكيد وعد بالبيع'
                  : isInstallment
                    ? 'تأكيد بيع بالتقسيط'
                    : isFull
                      ? 'تأكيد بيع نقدي'
                      : 'تأكيد البيع'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        {error && <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>}

        {/* Calculation Details */}
        <Card className="p-2 sm:p-3 lg:p-4 bg-blue-50 border-blue-200">
          <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-blue-900 mb-2 sm:mb-3">تفاصيل الحساب</h3>
          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span>سعر القطعة:</span>
              <span className="font-semibold">{formatPrice(calculations.totalPrice)} DT</span>
            </div>

            {isInstallment && (
              <>
                {sale.payment_offer ? (
                  <>
                    <div className="border-t border-blue-200 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span>المدفوع مسبقاً (العربون):</span>
                        <span className="font-semibold text-blue-600">
                          {formatPrice(calculations.depositAmount)} DT
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-blue-300 pt-2 mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span>التسبقة:</span>
                        <span className="font-semibold text-orange-600">
                          {formatPrice(
                            calculateInstallmentWithDeposit(
                              sale.piece!.surface_m2,
                              {
                                price_per_m2_installment: sale.payment_offer.price_per_m2_installment,
                                advance_mode: sale.payment_offer.advance_mode,
                                advance_value: sale.payment_offer.advance_value,
                                calc_mode: sale.payment_offer.calc_mode,
                                monthly_amount: sale.payment_offer.monthly_amount,
                                months: sale.payment_offer.months,
                              },
                              calculations.depositAmount
                            ).advanceAmount
                          )}{' '}
                          DT
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>(-) العربون (مدفوع مسبقاً):</span>
                        <span>{formatPrice(calculations.depositAmount)} DT</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>= التسبقة (بعد خصم العربون):</span>
                        <span className="text-orange-600">
                          {formatPrice(calculations.confirmationAmount)} DT
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-blue-300 pt-2 mt-2">
                      <div className="flex justify-between font-semibold text-green-600">
                        <span>المستحق عند التأكيد (التسبقة):</span>
                        <span>{formatPrice(calculations.confirmationAmount)} DT</span>
                      </div>
                    </div>
                    <div className="border-t border-blue-300 pt-2 mt-2 space-y-1">
                      {calculations.installmentDetails ? (
                        <>
                          <div className="flex justify-between">
                            <span>عدد الأشهر:</span>
                            <span className="font-semibold">
                              {calculations.installmentDetails.numberOfMonths} شهر
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>المبلغ الشهري:</span>
                            <span className="font-semibold text-indigo-600">
                              {formatPrice(calculations.installmentDetails.monthlyPayment)} DT
                            </span>
                          </div>
                          {calculations.installmentDetails.startDate && calculations.installmentDetails.endDate && (
                            <div className="space-y-1 text-xs text-gray-600">
                              <div className="flex justify-between">
                                <span>من:</span>
                                <span>
                                  {formatDate(calculations.installmentDetails.startDate, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>إلى:</span>
                                <span>
                                  {formatDate(calculations.installmentDetails.endDate, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-gray-500">
                          سيتم عرض تفاصيل الأقساط بعد تحديد تاريخ البدء
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <span>المتبقي للتقسيط:</span>
                        <span className="font-semibold text-purple-600">
                          {formatPrice(calculations.remainingForInstallments)} DT
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 pt-1">
                        (السعر الإجمالي - التسبقة بعد خصم العربون)
                      </div>
                    </div>
                    {sale.payment_offer.name && (
                      <div className="border-t border-blue-300 pt-2 mt-2">
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">اسم العرض:</span> {sale.payment_offer.name}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="border-t border-red-200 pt-2 mt-2">
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                      ⚠️ تحذير: لم يتم العثور على عرض التقسيط. يرجى التحقق من البيانات.
                    </div>
                  </div>
                )}
              </>
            )}

            {isFull && (
              <>
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span>المدفوع مسبقاً (العربون):</span>
                    <span className="font-semibold text-blue-600">
                      {formatPrice(calculations.depositAmount)} DT
                    </span>
                  </div>
                </div>
                <div className="border-t border-blue-300 pt-2 mt-2">
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>المبلغ المتبقي:</span>
                    <span>{formatPrice(calculations.confirmationAmount)} DT</span>
                  </div>
                </div>
              </>
            )}

            {isPromise && (
              <>
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span>المدفوع مسبقاً (العربون):</span>
                    <span className="font-semibold text-blue-600">
                      {formatPrice(calculations.depositAmount)} DT
                    </span>
                  </div>
                </div>
                {sale.partial_payment_amount && sale.partial_payment_amount > 0 && (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span>المدفوع سابقاً (جزئي):</span>
                      <span className="font-semibold text-orange-600">
                        {formatPrice(sale.partial_payment_amount)} DT
                      </span>
                    </div>
                  </div>
                )}
                <div className="border-t border-blue-300 pt-2 mt-2">
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>المبلغ المتبقي:</span>
                    <span>{formatPrice(calculations.confirmationAmount)} DT</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Installment Settings */}
        {isInstallment && (
          <div className="space-y-2 sm:space-y-3 lg:space-y-4">
            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">إعدادات الأقساط</h3>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">تاريخ بداية الأقساط *</Label>
              <Input
                type="date"
                value={installmentStartDate}
                onChange={(e) => setInstallmentStartDate(e.target.value)}
                size="sm"
                className="text-xs sm:text-sm"
              />
              <p className="text-xs text-gray-500">
                سيتم إنشاء جدول الأقساط تلقائياً بعد تأكيد التسبقة
              </p>
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-xs sm:text-sm">طريقة الدفع</Label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
          >
            <option value="cash">نقدي</option>
            <option value="check">شيك</option>
            <option value="transfer">تحويل بنكي</option>
          </select>
        </div>

        {/* Contract Writer */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-xs sm:text-sm">محرر العقد</Label>
          {loadingWriters ? (
            <p className="text-xs sm:text-sm text-gray-500">جاري التحميل...</p>
          ) : (
            <select
              value={contractWriterId}
              onChange={(e) => setContractWriterId(e.target.value)}
              className="w-full px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
            >
              <option value="">-- اختر محرر العقد --</option>
              {contractWriters.map((writer) => (
                <option key={writer.id} value={writer.id}>
                  {writer.name} ({writer.type})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Promise Payment Section */}
        {isPromise && (
          <Card className="p-2 sm:p-3 lg:p-4 bg-orange-50 border-orange-200">
            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 mb-2 sm:mb-3">معلومات وعد البيع</h3>
            <div className="space-y-2 sm:space-y-3 lg:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">المبلغ المستلم الآن *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={promisePaymentAmount}
                  onChange={(e) => setPromisePaymentAmount(e.target.value)}
                  placeholder="0.00"
                  size="sm"
                  className="text-xs sm:text-sm"
                />
                <p className="text-xs text-gray-500">
                  المبلغ الذي سيتم استلامه الآن. الباقي سيتم تأكيده لاحقاً.
                </p>
                {promisePaymentAmount && !isNaN(parseFloat(promisePaymentAmount)) && (
                  <div className="mt-1.5 sm:mt-2 p-1.5 sm:p-2 bg-white rounded border border-orange-300">
                    <p className="text-xs sm:text-sm">
                      <span className="font-medium">المبلغ المتبقي بعد هذا الدفع:</span>{' '}
                      <span className="font-semibold text-orange-600">
                        {formatPrice(calculations.confirmationAmount - parseFloat(promisePaymentAmount))} DT
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Notes */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-xs sm:text-sm">ملاحظات</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية..."
            rows={2}
            size="sm"
            className="text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Final Confirmation Dialog */}
      <ConfirmDialog
        open={showFinalConfirmDialog}
        onClose={() => setShowFinalConfirmDialog(false)}
        onConfirm={handleFinalConfirm}
        title={
          isPromise && sale.partial_payment_amount
            ? 'استكمال الوعد بالبيع'
            : isPromise
              ? 'تأكيد وعد بالبيع'
              : isInstallment
                ? 'تأكيد بيع بالتقسيط'
                : isFull
                  ? 'تأكيد بيع نقدي'
                  : 'تأكيد البيع'
        }
        description={
          isPromise
            ? (() => {
                const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
                const amount = parseFloat(cleanedAmount) || 0
                return `هل أنت مستعد للتأكيد؟\n\nستحصل على المبلغ: ${formatPrice(amount)} DT\n\nالمتبقي بعد هذا الدفع: ${formatPrice(calculations.confirmationAmount - amount)} DT`
              })()
            : `هل أنت مستعد للتأكيد؟\n\nستحصل على المبلغ: ${formatPrice(calculations.confirmationAmount)} DT`
        }
        confirmText={isPromise ? 'تأكيد الوعد بالبيع' : 'تأكيد'}
        cancelText="إلغاء"
        variant="warning"
        disabled={confirming}
        loading={confirming}
      >
        {/* Commission field - only show for first payment of promise sales */}
        {(!isPromise || !sale.partial_payment_amount || !sale.company_fee_amount) && (
        <div className="mt-2 sm:mt-3 lg:mt-4 space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">
              عمولة الشركة (DT)
              {isPromise && sale.partial_payment_amount && (
                <span className="text-gray-500 text-xs block mt-0.5">
                  (يتم تحديدها فقط في الدفعة الأولى)
                </span>
              )}
            </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={companyFee}
            onChange={(e) => setCompanyFee(e.target.value)}
            placeholder="0.00"
            size="sm"
            className="text-xs sm:text-sm"
              disabled={isPromise && sale.partial_payment_amount && sale.company_fee_amount ? true : false}
          />
            {isPromise && sale.partial_payment_amount && sale.company_fee_amount && (
              <p className="text-xs text-gray-500">
                تم تحديد العمولة في الدفعة الأولى: {formatPrice(sale.company_fee_amount)} DT
              </p>
            )}
        </div>
        )}
      </ConfirmDialog>

      {/* Success Dialog */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={handleSuccessClose}
        type="success"
        title="نجح التأكيد"
        message={successMessage}
      />

      {/* Error Dialog */}
      <NotificationDialog
        open={showErrorDialog}
        onClose={handleErrorClose}
        type="error"
        title="فشل التأكيد"
        message={errorMessage}
      />

      {/* Appointment Dialog */}
      <Dialog
        open={showAppointmentDialog}
        onClose={() => setShowAppointmentDialog(false)}
        title="تحديد موعد"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAppointmentDialog(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleAppointmentConfirm} 
              disabled={!appointmentDate}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500"
            >
              تأكيد
            </Button>
          </div>
        }
      >
        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">تاريخ الموعد *</Label>
            <Input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
          {sale && (
            <div className="text-xs sm:text-sm text-gray-600">
              <p><span className="font-medium">العميل:</span> {sale.client?.name || 'غير محدد'}</p>
              <p><span className="font-medium">القطعة:</span> {sale.piece?.piece_number || 'غير محدد'}</p>
            </div>
          )}
        </div>
      </Dialog>
    </Dialog>
  )
}

