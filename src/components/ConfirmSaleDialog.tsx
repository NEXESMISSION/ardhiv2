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
import { parseAmount } from '@/utils/parseAmount'
import { safeNotify } from '@/utils/safeNotify'
import { useFormDraft } from '@/hooks/useFormDraft'
import { NotificationDialog } from './ui/notification-dialog'
import { SaleDetailsDialog } from './SaleDetailsDialog'
import { formatPrice, formatDate } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { generateInstallmentSchedule } from '@/utils/installmentSchedule'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/context'
import { notifyOwners, notifyCurrentUser } from '@/utils/notifications'
import { getContractWritersCached, getContractWriters, type ContractWriterCached } from '@/utils/contractWritersCache'

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
  company_fee_amount: number | null
  confirmed_by: string | null
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
  notes?: string | null
  deadline_date?: string | null
  appointment_date?: string | null
  sold_by?: string | null
  // confirmed_by already declared above as `string | null`; the optional
  // duplicate was a leftover from an earlier merge.
  created_at?: string
  seller?: {
    id: string
    name: string
    place: string | null
  }
}

interface ConfirmSaleDialogProps {
  open: boolean
  onClose: () => void
  sale: Sale | null
  onConfirm: () => void
}

// (Previous local `replaceVars` helper removed — no callers; the shared util
// in `@/utils/replaceVars` is used elsewhere if needed.)

export function ConfirmSaleDialog({ open, onClose, sale, onConfirm }: ConfirmSaleDialogProps) {
  const { systemUser } = useAuth()
  const { t } = useLanguage()
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [contractWriterId, setContractWriterId] = useState('')
  const [notes, setNotes] = useState('')
  const [contractWriters, setContractWriters] = useState<ContractWriterCached[]>([])
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
  const [loadedPaymentOffer, setLoadedPaymentOffer] = useState<Sale['payment_offer'] | null>(null)
  const [loadingPaymentOffer, setLoadingPaymentOffer] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  // Draft persistence — keyed per sale.id. Confirming a sale is one of the
  // most data-intensive flows in the app; losing it to an accidental close
  // or connection drop is exactly what this prevents.
  type ConfirmDraftShape = {
    installmentStartDate: string
    paymentMethod: string
    contractWriterId: string
    notes: string
    companyFee: string
    promisePaymentAmount: string
    appointmentDate: string
  }
  const draft = useFormDraft<ConfirmDraftShape>('confirm-sale', {
    open,
    key: sale?.id ?? null,
    keepOnClose: true,
  })

  useEffect(() => {
    if (open && sale) {
      // Set default installment start date to today
      const today = new Date()
      setInstallmentStartDate(today.toISOString().split('T')[0])
      setPaymentMethod('cash')
      setContractWriterId('')
      setNotes('')
      // Only set company fee from sale if it's a promise sale with existing partial payment
      // Otherwise, always start with empty to let user type it fresh
      if (sale.payment_method === 'promise' && sale.partial_payment_amount && sale.company_fee_amount) {
        // For promise sales with existing partial payment, show existing fee (read-only)
        setCompanyFee('')
      } else {
        // For all other cases, start empty - user must type it
        setCompanyFee('')
      }
      setAppointmentDate('')
      
      // For promise sales, auto-fill with remaining amount if partial payment was made
      if (sale.payment_method === 'promise' && sale.remaining_payment_amount) {
        setPromisePaymentAmount(sale.remaining_payment_amount.toString())
      } else {
        setPromisePaymentAmount('')
      }
      
      // Debug logging for installment sales (development only)
      if (import.meta.env.DEV && sale.payment_method === 'installment') {
        console.log('ConfirmSaleDialog - Installment sale:', {
          sale_id: sale.id,
          payment_offer_id: sale.payment_offer_id,
          payment_offer: sale.payment_offer,
          has_payment_offer: !!sale.payment_offer
        })
      }
      
      // Always try to load payment offer if payment_offer_id exists but payment_offer is missing
      // This ensures we have the offer data even if it wasn't included in the initial query
      if (sale.payment_method === 'installment') {
        if (sale.payment_offer_id) {
          if (!sale.payment_offer) {
            // Payment offer not loaded, fetch it immediately
            loadPaymentOffer(sale.payment_offer_id)
          } else {
            // Payment offer already loaded, clear any previously loaded offer
            setLoadedPaymentOffer(null)
          }
        } else {
          // No payment_offer_id - this is an error for installment sales
          setLoadedPaymentOffer(null)
        }
      } else {
        setLoadedPaymentOffer(null)
      }
      
      setError(null)
      setShowFinalConfirmDialog(false)
      setShowDetailsDialog(false)
      setShowSuccessDialog(false)
      setShowErrorDialog(false)
      setShowAppointmentDialog(false)
      const cached = getContractWritersCached()
      if (cached?.length) setContractWriters(cached)
      loadContractWriters()

      // After defaults are set, restore any saved draft on top.
      const saved = draft.read()
      if (saved) {
        if (saved.installmentStartDate) setInstallmentStartDate(saved.installmentStartDate)
        if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod)
        if (saved.contractWriterId) setContractWriterId(saved.contractWriterId)
        if (saved.notes) setNotes(saved.notes)
        if (saved.companyFee) setCompanyFee(saved.companyFee)
        if (saved.promisePaymentAmount) setPromisePaymentAmount(saved.promisePaymentAmount)
        if (saved.appointmentDate) setAppointmentDate(saved.appointmentDate)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale])

  // Persist the form to localStorage on every change so a connection drop
  // mid-confirmation doesn't lose the user's progress.
  useEffect(() => {
    if (!open) return
    draft.write({
      installmentStartDate,
      paymentMethod,
      contractWriterId,
      notes,
      companyFee,
      promisePaymentAmount,
      appointmentDate,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installmentStartDate, paymentMethod, contractWriterId, notes, companyFee, promisePaymentAmount, appointmentDate])

  async function loadPaymentOffer(offerId: string) {
    if (!offerId) {
      setLoadedPaymentOffer(null)
      return
    }
    
    setLoadingPaymentOffer(true)
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
        if (import.meta.env.DEV) {
          console.log('Loaded payment offer:', data)
        }
      }
    } catch (e: any) {
      console.error('Exception loading payment offer:', e)
      setLoadedPaymentOffer(null)
    } finally {
      setLoadingPaymentOffer(false)
    }
  }

  async function loadContractWriters() {
    const cached = getContractWritersCached()
    if (cached?.length) {
      setContractWriters(cached)
      setLoadingWriters(false)
      return
    }
    setLoadingWriters(true)
    try {
      const data = await getContractWriters()
      setContractWriters(data)
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
    let advanceAmount = 0

    // Use loaded payment offer if sale doesn't have one
    const paymentOffer = sale.payment_offer || loadedPaymentOffer

    // Use sale.sale_price as total (actual contract price; may be custom/fixed for installment)
    let totalPrice = sale.sale_price

    if (sale.payment_method === 'installment' && paymentOffer && sale.piece) {
      // Note: previous versions also assigned `calculateInstallmentWithDeposit(...)`
      // to a local `calc` variable here, but the result was never read — the
      // values that matter (advanceAmount, confirmationAmount, ...) are computed
      // directly below. The dead computation has been removed.

      // Use sale.sale_price as total (not offer basePrice) so custom/fixed price is correct
      totalPrice = sale.sale_price
      advanceAmount = paymentOffer.advance_mode === 'fixed'
        ? paymentOffer.advance_value
        : (sale.sale_price * paymentOffer.advance_value) / 100
      confirmationAmount = Math.max(0, advanceAmount - depositAmount)
      remainingForInstallments = sale.sale_price - Math.max(advanceAmount, depositAmount)

      // Always create installment details, even without start date
      let startDate = null
      let endDate = null

      if (installmentStartDate) {
        const schedule = generateInstallmentSchedule(
          sale.piece.surface_m2,
          {
            price_per_m2_installment: paymentOffer.price_per_m2_installment,
            advance_mode: paymentOffer.advance_mode,
            advance_value: paymentOffer.advance_value,
            calc_mode: paymentOffer.calc_mode,
            monthly_amount: paymentOffer.monthly_amount,
            months: paymentOffer.months,
          },
          new Date(installmentStartDate),
          depositAmount
        )

        // Previous code also computed `totalRemainingFromSchedule = schedule.reduce(...)`
        // here but the value was never read. Removed.
        startDate = schedule.length > 0 ? schedule[0].dueDate : null
        endDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : null
      }

      // Monthly and months from offer rules, using remainingForInstallments (based on sale.sale_price)
      let finalMonthlyPayment = 0
      let finalNumberOfMonths = 0
      if (paymentOffer.calc_mode === 'months' && (paymentOffer.months || 0) > 0) {
        finalNumberOfMonths = paymentOffer.months!
        finalMonthlyPayment = remainingForInstallments / finalNumberOfMonths
      } else if (paymentOffer.calc_mode === 'monthlyAmount' && (paymentOffer.monthly_amount || 0) > 0) {
        finalMonthlyPayment = paymentOffer.monthly_amount!
        finalNumberOfMonths = Math.ceil(remainingForInstallments / finalMonthlyPayment)
      }

      installmentDetails = {
        numberOfMonths: finalNumberOfMonths,
        monthlyPayment: finalMonthlyPayment,
        startDate,
        endDate,
        totalRemaining: remainingForInstallments,
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
      totalPrice,
      advanceAmount,
    }
  }, [sale, installmentStartDate, sale?.partial_payment_amount, sale?.remaining_payment_amount, loadedPaymentOffer])

  function handleConfirmClick() {
    if (!sale) return

    setError(null)

    if (sale.payment_method === 'installment' && !installmentStartDate) {
      setError(t('confirmation.dialogErrorInstallmentDate'))
      return
    }

    if (sale.payment_method === 'promise') {
      // Trim and clean the input
      const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
      const amount = parseFloat(cleanedAmount)
      
      if (!cleanedAmount || cleanedAmount === '' || isNaN(amount) || amount <= 0) {
        setError(t('confirmation.dialogErrorAmountRequired'))
        return
      }
      // Overpayment allowed: do not reject when amount > confirmationAmount
    }

    // Reset company fee when opening final confirm dialog to ensure it starts fresh
    // Only preserve if it's a promise sale with existing partial payment (read-only case)
    if (!(sale.payment_method === 'promise' && sale.partial_payment_amount && sale.company_fee_amount)) {
      setCompanyFee('')
    }
    
    setShowFinalConfirmDialog(true)
  }

  async function handleFinalConfirm() {
    if (!sale) return
    
    // Prevent multiple simultaneous confirmations
    if (confirming) {
      console.warn('Already confirming, ignoring duplicate request')
      return
    }

    setShowFinalConfirmDialog(false)
    setConfirming(true)
    
    // Early check: verify sale is still pending before proceeding
    try {
      const { data: preCheckSale, error: preCheckError } = await supabase
        .from('sales')
        .select('id, status')
        .eq('id', sale.id)
        .single()
      
      if (preCheckError || !preCheckSale) {
        throw new Error(t('confirmation.dialogErrorVerifySale'))
      }
      
      if (preCheckSale.status !== 'pending') {
        setConfirming(false)
        setErrorMessage(`لا يمكن تأكيد البيع. الحالة الحالية: ${preCheckSale.status}`)
        setShowErrorDialog(true)
        return
      }
    } catch (earlyError: any) {
      setConfirming(false)
      setErrorMessage(earlyError.message || t('confirmation.dialogErrorVerifySale'))
      setShowErrorDialog(true)
      return
    }

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
            updateData.company_fee_amount = parseAmount(companyFee)
          }
          // If commission already exists, don't include it in update (preserve existing value)

          // Ensure ID is a valid UUID string
          const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)

          // Validate UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          if (!uuidRegex.test(saleId)) {
            throw new Error('معرف البيع غير صحيح')
          }

          // Update by ID (status already verified by preCheck at start)
      let updateErr: any = null
      const updateResult = await supabase
            .from('sales')
            .update(updateData)
        .match({ id: saleId })
      
      updateErr = updateResult.error

      if (updateErr && (updateErr.message?.includes('uuid') || updateErr.message?.includes('character varying') || updateErr.message?.includes('operator does not exist'))) {
        console.warn('UUID type error detected, attempting RPC function workaround...')
        try {
          const rpcResult = await supabase.rpc('update_sale_safe', {
            p_sale_id: saleId,
            p_update_data: updateData
          })
          if (!rpcResult.error) {
            updateErr = null
          } else {
            throw new Error('خطأ في قاعدة البيانات: يرجى تشغيل ملفات SQL المطلوبة في Supabase. راجع ملفات docs/sql/fix_sales_trigger_uuid_issue.sql و fix_sales_update_uuid_issue.sql')
          }
        } catch (rpcErr: any) {
          throw new Error('خطأ في قاعدة البيانات: يرجى تشغيل ملفات SQL المطلوبة في Supabase. راجع ملفات docs/sql/fix_sales_trigger_uuid_issue.sql و fix_sales_update_uuid_issue.sql')
        }
      }

      if (updateErr) {
        if (updateErr.code === 'PGRST116' || updateErr.message?.includes('404') || updateErr.message?.includes('not found')) {
          throw new Error('البيع غير موجود أو لا يمكن الوصول إليه. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
        }
        throw new Error(updateErr.message || 'فشل تحديث البيع')
      }

          setSuccessMessage(`تم استلام ${formatPrice(paymentAmount)} DT. المتبقي: ${formatPrice(newRemaining)} DT`)
          setShowSuccessDialog(true)
          draft.clear()
          onConfirm()
          // Close the main dialog immediately
          onClose()
          return
        }
      }

      // Full completion (for full payment, installment, or promise with full payment)
      // confirmed_at = when we confirm → used as "date sold" in Finance today / Confirmation History
      const updateData: any = {
        status: 'completed',
        contract_writer_id: contractWriterId || null,
        notes: notes.trim() || null,
        confirmed_by: systemUser?.id || null,
        confirmed_at: new Date().toISOString(),
      }

      // For promise sales: only set commission if it doesn't exist yet (first time)
      // For other sales: set commission if provided
      if (sale.payment_method === 'promise') {
        // Only set commission if it's not already set (first payment)
        if (!sale.company_fee_amount && companyFee) {
          updateData.company_fee_amount = parseAmount(companyFee)
        }
        // If commission already exists, don't update it
      } else {
        // For non-promise sales, set commission if provided
        if (companyFee) {
          updateData.company_fee_amount = parseAmount(companyFee)
        }
      }

      // For promise sales, set final amounts
      if (sale.payment_method === 'promise') {
        const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
        const paymentAmount = parseFloat(cleanedAmount)
        updateData.partial_payment_amount = (sale.partial_payment_amount || 0) + paymentAmount
        updateData.remaining_payment_amount = 0
      }

      // Ensure ID is a valid UUID string
      const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(saleId)) {
        throw new Error('معرف البيع غير صحيح')
      }

      // Update by ID (status already verified by preCheck at start)
      let updateErr: any = null
      try {
        const result = await supabase
        .from('sales')
        .update(updateData)
          .match({ id: saleId })
        updateErr = result.error
      } catch (err: any) {
        updateErr = err
      }
      
      // If UUID type error, try using RPC function (if it exists)
      if (updateErr && (updateErr.message?.includes('uuid') || updateErr.message?.includes('character varying') || updateErr.message?.includes('operator does not exist'))) {
        console.warn('UUID type error detected, attempting RPC function workaround...')
        
        // Try RPC function as fallback (requires running fix_sales_update_uuid_issue.sql)
        const rpcResult = await supabase.rpc('update_sale_safe', {
          p_sale_id: saleId,
          p_update_data: updateData
        })
        
        if (!rpcResult.error) {
          // RPC succeeded, continue
          updateErr = null
        } else {
          // RPC also failed or doesn't exist
          console.error('RPC function also failed or not available:', rpcResult.error)
        }
      }

      if (updateErr) {
        console.error('Error updating sale:', updateErr)
        console.error('Update error details:', {
          code: updateErr.code,
          message: updateErr.message,
          details: updateErr.details,
          hint: updateErr.hint,
        })
        
        // Check if it's a UUID type mismatch error
        if (updateErr.message?.includes('uuid') || updateErr.message?.includes('character varying') || updateErr.message?.includes('operator does not exist')) {
          throw new Error('خطأ في نوع البيانات. يرجى المحاولة مرة أخرى أو تحديث الصفحة.')
        }
        
        // Check if it's a 404 (sale not found or RLS blocking)
        if (updateErr.code === 'PGRST116' || updateErr.message?.includes('404') || updateErr.message?.includes('not found')) {
          throw new Error('البيع غير موجود أو لا يمكن الوصول إليه. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
        }
        
        throw new Error(updateErr.message || 'فشل تحديث البيع')
      }

      // If no error, update succeeded

      // Update piece status to Sold
      const { error: pieceErr } = await supabase
        .from('land_pieces')
        .update({ status: 'Sold', updated_at: new Date().toISOString() })
        .eq('id', sale.land_piece_id)

      if (pieceErr) throw pieceErr

      // Create installment schedule if installment sale
      const paymentOffer = sale.payment_offer || loadedPaymentOffer
      if (sale.payment_method === 'installment' && paymentOffer && sale.piece && installmentStartDate) {
        const schedule = generateInstallmentSchedule(
          sale.piece.surface_m2,
          {
            price_per_m2_installment: paymentOffer.price_per_m2_installment,
            advance_mode: paymentOffer.advance_mode,
            advance_value: paymentOffer.advance_value,
            calc_mode: paymentOffer.calc_mode,
            monthly_amount: paymentOffer.monthly_amount,
            months: paymentOffer.months,
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

      // Show success and close immediately; run notifications in background so confirm feels fast
      setSuccessMessage(t('confirmation.dialogSuccessConfirm'))
      setShowSuccessDialog(true)
      draft.clear()
      onConfirm()
      onClose()

      // Background: verify and send notifications (non-blocking but with retries)
      safeNotify(`sale_confirmed:${sale.id}`, async () => {
        const { data: finalSaleCheck, error: finalCheckError } = await supabase
          .from('sales')
          .select('id, status')
          .eq('id', sale.id)
          .single()
        if (finalCheckError) throw finalCheckError
        if (!finalSaleCheck || finalSaleCheck.status !== 'completed') return
const clientName = sale.client?.name || t('confirmation.clientUnknown')
      const pieceNumber = sale.piece?.piece_number || t('confirmation.unknown')
      const batchName = sale.batch?.name || t('confirmation.unknown')
      const confirmedByName = systemUser?.name || t('confirmation.unknown')
          const confirmedByPlace = systemUser?.place || null
          let notificationMessage = ''
          let notificationTitle = ''
          if (sale.payment_method === 'full') {
            notificationTitle = 'تم تأكيد البيع - دفع كامل'
            notificationMessage = `تم تأكيد بيع القطعة ${pieceNumber} للعميل ${clientName} من دفعة ${batchName}\n\n📋 تفاصيل البيع:\n• السعر الإجمالي: ${formatPrice(calculations.totalPrice)} DT\n• العربون (مدفوع مسبقاً): ${formatPrice(sale.deposit_amount || 0)} DT\n• المبلغ المستلم عند التأكيد: ${formatPrice(calculations.confirmationAmount)} DT\n\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
          } else if (sale.payment_method === 'installment') {
            notificationTitle = 'تم تأكيد البيع - تقسيط'
            notificationMessage = `تم تأكيد بيع القطعة ${pieceNumber} للعميل ${clientName} من دفعة ${batchName}\n\n📋 تفاصيل البيع:\n• السعر الإجمالي: ${formatPrice(calculations.totalPrice)} DT\n• العربون (مدفوع مسبقاً): ${formatPrice(sale.deposit_amount || 0)} DT\n• التسبقة (المستلم عند التأكيد): ${formatPrice(calculations.confirmationAmount)} DT\n${calculations.installmentDetails ? `\n📅 تفاصيل الأقساط:\n• عدد الأشهر: ${calculations.installmentDetails.numberOfMonths} شهر\n• المبلغ الشهري: ${formatPrice(calculations.installmentDetails.monthlyPayment)} DT\n` : ''}\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
          } else if (sale.payment_method === 'promise') {
            notificationTitle = 'تم تأكيد البيع - وعد بالبيع'
            notificationMessage = `تم تأكيد بيع القطعة ${pieceNumber} للعميل ${clientName} من دفعة ${batchName}\n\n📋 تفاصيل البيع:\n• السعر الإجمالي: ${formatPrice(calculations.totalPrice)} DT\n• العربون (مدفوع مسبقاً): ${formatPrice(sale.deposit_amount || 0)} DT\n• المبلغ المستلم عند التأكيد: ${formatPrice(calculations.confirmationAmount)} DT\n\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
          } else {
            notificationTitle = 'تم تأكيد البيع'
            notificationMessage = `تم تأكيد بيع القطعة ${pieceNumber} للعميل ${clientName} من دفعة ${batchName}\n\n• السعر: ${formatPrice(calculations.totalPrice)} DT\n\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
          }
          const payload = { client_name: clientName, piece_number: pieceNumber, batch_name: batchName, sale_price: sale.sale_price, deposit_amount: sale.deposit_amount || 0, confirmation_amount: calculations.confirmationAmount, payment_method: sale.payment_method, confirmed_by_name: confirmedByName, confirmed_by_place: confirmedByPlace, installment_details: calculations.installmentDetails, promise_payment_amount: sale.payment_method === 'promise' && promisePaymentAmount ? (parseFloat(promisePaymentAmount.trim().replace(/,/g, '')) || 0) : null }
          await notifyOwners('sale_confirmed', notificationTitle, notificationMessage, 'sale', sale.id, payload)
          if (systemUser?.id) await notifyCurrentUser('sale_confirmed', notificationTitle, notificationMessage, systemUser.id, 'sale', sale.id, { ...payload, promise_payment_amount: undefined })
      })
    } catch (e: any) {
      setErrorMessage(e.message || t('confirmation.dialogErrorConfirmSale'))
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
      // Ensure ID is a valid UUID string
      const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)
      
      const { error } = await supabase
        .from('sales')
        .update({ 
          appointment_date: appointmentDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', saleId)

      if (error) throw error

      setShowAppointmentDialog(false)
      setSuccessMessage('تم تحديد الموعد بنجاح!')
      setShowSuccessDialog(true)
      onConfirm() // Refresh the list
    } catch (e: any) {
      setErrorMessage(e.message || t('confirmation.dialogErrorConfirmSale'))
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
        <div className="flex justify-between w-full gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowDetailsDialog(true)}
            disabled={confirming}
            className="text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            تفاصيل
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={confirming}>
              {t('confirmation.cancel')}
            </Button>
            <Button 
              onClick={handleConfirmClick} 
              disabled={confirming}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500"
            >
            {confirming 
              ? t('confirmation.dialogConfirming') 
              : isPromise && sale.partial_payment_amount
                ? t('confirmation.confirmPromisePartial')
                : isPromise
                  ? t('confirmation.confirmPromise')
                  : isInstallment
                    ? t('confirmation.confirmInstallment')
                    : isFull
                      ? t('confirmation.confirmFull')
                      : t('confirmation.confirmSale')}
            </Button>
          </div>
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
                          {formatPrice(calculations.advanceAmount)} DT
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
                    {(sale.payment_offer || loadedPaymentOffer)?.name && (
                      <div className="border-t border-blue-300 pt-2 mt-2">
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">اسم العرض:</span> {(sale.payment_offer || loadedPaymentOffer)!.name}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {loadingPaymentOffer ? (
                      <div className="border-t border-yellow-200 pt-2 mt-2">
                        <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                          جاري تحميل عرض التقسيط...
                        </div>
                      </div>
                    ) : sale.payment_offer_id ? (
                      <div className="border-t border-yellow-200 pt-2 mt-2">
                        <div className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                          ⚠️ تحذير: لم يتم العثور على عرض التقسيط (ID: {sale.payment_offer_id}). يرجى التحقق من البيانات.
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-red-200 pt-2 mt-2">
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          ⚠️ تحذير: لم يتم تحديد عرض التقسيط لهذا البيع.
                        </div>
                      </div>
                    )}
                  </>
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
              <Label htmlFor="confirm-installment-start" className="text-xs sm:text-sm">تاريخ بداية الأقساط *</Label>
              <Input
                id="confirm-installment-start"
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
          <Label htmlFor="confirm-payment-method" className="text-xs sm:text-sm">طريقة الدفع</Label>
          <select
            id="confirm-payment-method"
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
          <Label htmlFor="confirm-contract-writer" className="text-xs sm:text-sm">محرر العقد</Label>
          {loadingWriters ? (
            <p className="text-xs sm:text-sm text-gray-500">جاري التحميل...</p>
          ) : (
            <select
              id="confirm-contract-writer"
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
                <Label htmlFor="confirm-promise-payment" className="text-xs sm:text-sm">المبلغ المستلم الآن *</Label>
                <Input
                  id="confirm-promise-payment"
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
                      <span className="font-medium">{t('confirmation.dialogRemainingAfterPayment')}</span>{' '}
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
          <Label htmlFor="confirm-notes" className="text-xs sm:text-sm">ملاحظات</Label>
          <Textarea
            id="confirm-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('confirmation.dialogNotesPlaceholder')}
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
        confirmText={isPromise ? t('confirmation.dialogConfirmPromise') : t('common.confirm')}
        cancelText={t('confirmation.cancel')}
        variant="warning"
        disabled={confirming}
        loading={confirming}
      >
        {/* Commission field - only show for first payment of promise sales */}
        {(!isPromise || !sale.partial_payment_amount || !sale.company_fee_amount) && (
        <div className="mt-2 sm:mt-3 lg:mt-4 space-y-1.5 sm:space-y-2">
            <Label htmlFor="confirm-company-fee" className="text-xs sm:text-sm">
              عمولة الشركة (DT)
              {isPromise && sale.partial_payment_amount && (
                <span className="text-gray-500 text-xs block mt-0.5">
                  (يتم تحديدها فقط في الدفعة الأولى)
                </span>
              )}
            </Label>
          <Input
            id="confirm-company-fee"
            key={`company-fee-${sale.id}-${showFinalConfirmDialog}`}
            type="number"
            min="0"
            step="0.01"
            value={companyFee || ''}
            onChange={(e) => {
              const val = e.target.value
              // Only allow numbers and decimal point
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setCompanyFee(val)
              }
            }}
            placeholder="0.00"
            size="sm"
            className="text-xs sm:text-sm"
            disabled={isPromise && sale.partial_payment_amount && sale.company_fee_amount ? true : false}
            autoComplete="off"
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
        title={t('confirmation.dialogSuccessTitle')}
        message={successMessage}
      />

      {/* Error Dialog */}
      <NotificationDialog
        open={showErrorDialog}
        onClose={handleErrorClose}
        type="error"
        title={t('confirmation.dialogErrorTitle')}
        message={errorMessage}
      />

      {/* Appointment Dialog */}
      <Dialog
        open={showAppointmentDialog}
        onClose={() => setShowAppointmentDialog(false)}
        title={t('confirmation.dialogSetAppointmentTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAppointmentDialog(false)}>
              {t('confirmation.cancel')}
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
            <Label htmlFor="confirm-appointment-date" className="text-xs sm:text-sm">تاريخ الموعد *</Label>
            <Input
              id="confirm-appointment-date"
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
              <p><span className="font-medium">{t('confirmation.clientLabel')}:</span> {sale.client?.name || t('confirmation.unknown')}</p>
              <p><span className="font-medium">{t('confirmation.dialogPieceLabel')}:</span> {sale.piece?.piece_number || t('confirmation.unknown')}</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sale details (تفاصيل) */}
      <SaleDetailsDialog
        open={showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
        sale={sale}
      />
    </Dialog>
  )
}

