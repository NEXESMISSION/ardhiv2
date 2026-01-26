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
import { formatPrice, formatDateShort, formatDate } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'
import { generateInstallmentSchedule } from '@/utils/installmentSchedule'
import { useAuth } from '@/contexts/AuthContext'
import { notifyOwners, notifyCurrentUser } from '@/utils/notifications'

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

interface ConfirmGroupSaleDialogProps {
  open: boolean
  onClose: () => void
  sales: Sale[]
  onConfirm: () => void
}

export function ConfirmGroupSaleDialog({
  open,
  onClose,
  sales,
  onConfirm,
}: ConfirmGroupSaleDialogProps) {
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

  useEffect(() => {
    if (open && sales.length > 0) {
      const today = new Date()
      setInstallmentStartDate(today.toISOString().split('T')[0])
      setPaymentMethod('cash')
      setContractWriterId('')
      setNotes('')
      setCompanyFee('')
      
      const firstSale = sales[0]
      if (firstSale.payment_method === 'promise') {
        const totalRemaining = sales.reduce((sum, s) => {
          return sum + (s.remaining_payment_amount || (s.sale_price - (s.partial_payment_amount || s.deposit_amount)))
        }, 0)
        setPromisePaymentAmount(totalRemaining.toString())
      } else {
        setPromisePaymentAmount('')
      }
      
      // Debug logging for installment sales (development only)
      if (process.env.NODE_ENV === 'development' && firstSale.payment_method === 'installment') {
        console.log('ConfirmGroupSaleDialog - Installment sales:', {
          sales_count: sales.length,
          first_sale_id: firstSale.id,
          payment_offer_id: firstSale.payment_offer_id,
          payment_offer: firstSale.payment_offer,
          has_payment_offer: !!firstSale.payment_offer
        })
      }
      
      setError(null)
      setShowFinalConfirmDialog(false)
      setShowSuccessDialog(false)
      setShowErrorDialog(false)
      loadContractWriters()
    }
  }, [open, sales])

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

  // Smart calculations for grouped sales
  const calculations = useMemo(() => {
    if (sales.length === 0) return null

    const firstSale = sales[0]
    const isInstallment = firstSale.payment_method === 'installment'
    const isPromise = firstSale.payment_method === 'promise'
    const isFull = firstSale.payment_method === 'full'

    // Calculate totals
    const totalPrice = sales.reduce((sum, s) => sum + s.sale_price, 0)
    const totalDeposit = sales.reduce((sum, s) => sum + s.deposit_amount, 0)
    const totalPartialPaid = sales.reduce((sum, s) => sum + (s.partial_payment_amount || 0), 0)
    const totalRemaining = sales.reduce((sum, s) => {
      if (s.remaining_payment_amount !== null && s.remaining_payment_amount !== undefined) {
        return sum + s.remaining_payment_amount
      }
      return sum + (s.sale_price - (s.partial_payment_amount || s.deposit_amount))
    }, 0)

    let confirmationAmount = 0
    let installmentDetails = null

    if (isInstallment) {
      if (firstSale.payment_offer) {
        // Calculate total surface for all pieces
        const totalSurface = sales.reduce((sum, s) => sum + (s.piece?.surface_m2 || 0), 0)
        
        // Use centralized calculator (use totalSurface or default to 1 if 0 to avoid division errors)
        const calc = calculateInstallmentWithDeposit(
          totalSurface > 0 ? totalSurface : 1,
          {
            price_per_m2_installment: firstSale.payment_offer.price_per_m2_installment,
            advance_mode: firstSale.payment_offer.advance_mode,
            advance_value: firstSale.payment_offer.advance_value,
            calc_mode: firstSale.payment_offer.calc_mode,
            monthly_amount: firstSale.payment_offer.monthly_amount,
            months: firstSale.payment_offer.months,
          },
          totalDeposit
        )

        confirmationAmount = calc.advanceAfterDeposit

        // المتبقي للتقسيط = السعر الفعلي الإجمالي - (التسبقة بعد خصم العربون)
        const totalRemainingForInstallments = totalPrice - calc.advanceAfterDeposit
        
        // Always create installment details, even without start date
        let startDate = null
        let endDate = null
        
        if (installmentStartDate && totalSurface > 0) {
          const schedule = generateInstallmentSchedule(
            totalSurface,
            {
              price_per_m2_installment: firstSale.payment_offer.price_per_m2_installment,
              advance_mode: firstSale.payment_offer.advance_mode,
              advance_value: firstSale.payment_offer.advance_value,
              calc_mode: firstSale.payment_offer.calc_mode,
              monthly_amount: firstSale.payment_offer.monthly_amount,
              months: firstSale.payment_offer.months,
            },
            new Date(installmentStartDate),
            totalDeposit
          )
          
          startDate = schedule.length > 0 ? schedule[0].dueDate : null
          endDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : null
        }
        
        // Calculate number of months based on remaining amount divided by monthly payment
        const calculatedMonths = calc.recalculatedMonthlyPayment > 0 
          ? Math.ceil(totalRemainingForInstallments / calc.recalculatedMonthlyPayment)
          : calc.recalculatedNumberOfMonths
        
        installmentDetails = {
          numberOfMonths: calculatedMonths,
          monthlyPayment: calc.recalculatedMonthlyPayment,
          startDate,
          endDate,
          totalRemaining: totalRemainingForInstallments,
        }
      } else {
        // If payment_offer is missing, set a default confirmation amount
        // This should not happen, but we handle it gracefully
        confirmationAmount = totalPrice - totalDeposit
        console.warn('ConfirmGroupSaleDialog: payment_offer is missing for installment sale', {
          sales: sales.map(s => ({ id: s.id, payment_offer_id: s.payment_offer_id }))
        })
      }
    } else if (isFull) {
      confirmationAmount = totalPrice - totalDeposit
    } else if (isPromise) {
      confirmationAmount = totalRemaining
    }

    return {
      totalPrice,
      totalDeposit,
      totalPartialPaid,
      totalRemaining,
      confirmationAmount,
      installmentDetails,
      totalSurface: sales.reduce((sum, s) => sum + (s.piece?.surface_m2 || 0), 0),
    }
  }, [sales, installmentStartDate])

  function handleConfirmClick() {
    setError(null)

    const firstSale = sales[0]
    if (firstSale.payment_method === 'installment' && !installmentStartDate) {
      setError('يرجى تحديد تاريخ بداية الأقساط')
      return
    }

    if (firstSale.payment_method === 'promise') {
      const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
      const amount = parseFloat(cleanedAmount)
      
      if (!cleanedAmount || cleanedAmount === '' || isNaN(amount) || amount <= 0) {
        setError('يرجى إدخال المبلغ المستلم الآن')
        return
      }
      if (amount > (calculations?.confirmationAmount || 0)) {
        setError(`المبلغ المدخل يتجاوز المتبقي (${formatPrice(calculations?.confirmationAmount || 0)} DT)`)
        return
      }
    }

    setShowFinalConfirmDialog(true)
  }

  async function handleFinalConfirm() {
    if (sales.length === 0 || !calculations) return

    setShowFinalConfirmDialog(false)
    setConfirming(true)

    try {
      const firstSale = sales[0]
      const isInstallment = firstSale.payment_method === 'installment'
      const isPromise = firstSale.payment_method === 'promise'

      // For promise sales, handle partial payment
      if (isPromise) {
        const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
        const paymentAmount = parseFloat(cleanedAmount)
        const totalRemaining = calculations.confirmationAmount
        const newRemaining = totalRemaining - paymentAmount

        if (newRemaining > 0.01) {
          // Partial payment - update each sale
          const saleIds = sales.map(s => s.id)
          const updatePromises = sales.map(async (sale) => {
            const saleRemaining = sale.remaining_payment_amount || (sale.sale_price - (sale.partial_payment_amount || sale.deposit_amount))
            const salePayment = (paymentAmount / totalRemaining) * saleRemaining
            const newSaleRemaining = saleRemaining - salePayment
            const currentPartial = sale.partial_payment_amount || 0
            const newPartial = currentPartial + salePayment

            // Commission should only be set on the FIRST partial payment
            // If company_fee_amount already exists, don't update it (this is a subsequent payment)
            const isFirstPayment = !sale.company_fee_amount || sale.company_fee_amount === 0
            
            const updateData: any = {
                partial_payment_amount: newPartial,
                remaining_payment_amount: newSaleRemaining,
                contract_writer_id: contractWriterId || null,
                notes: notes.trim() || null,
                updated_at: new Date().toISOString(),
            }
            
            // Only set confirmed_by on first confirmation (when status changes to completed)
            if (newSaleRemaining <= 0 && !sale.confirmed_by) {
              updateData.status = 'completed'
              updateData.confirmed_by = systemUser?.id || null
            }

            // Only set commission if this is the first payment and commission is provided
            if (isFirstPayment && companyFee) {
              updateData.company_fee_amount = parseFloat(companyFee) / sales.length
            }
            // If commission already exists, don't include it in update (preserve existing value)

            // Ensure ID is a valid UUID string
            const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)

            // Validate UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            if (!uuidRegex.test(saleId)) {
              throw new Error(`معرف البيع غير صحيح: ${saleId}`)
            }

            // First verify the sale exists and is pending
            const { data: existingSale, error: checkError } = await supabase
              .from('sales')
              .select('id, status')
              .eq('id', saleId)
              .single()

            if (checkError || !existingSale || existingSale.status !== 'pending') {
              throw new Error(`البيع ${saleId} غير موجود أو غير معلق`)
            }

            // Now update only by ID (status already verified)
            // Use match() with single field to ensure proper UUID type handling
            return supabase
              .from('sales')
              .update(updateData)
              .match({ id: saleId })
          })

          await Promise.all(updatePromises)

          setSuccessMessage(`تم استلام ${formatPrice(paymentAmount)} DT. المتبقي: ${formatPrice(newRemaining)} DT`)
          setShowSuccessDialog(true)
          onConfirm()
          onClose()
          return
        }
      }

      // Full completion - update all sales
      // Ensure all IDs are valid UUID strings
      const saleIds = sales.map(s => typeof s.id === 'string' ? s.id : String(s.id))
      const baseUpdateData: any = {
        status: 'completed',
        contract_writer_id: contractWriterId || null,
        notes: notes.trim() || null,
        confirmed_by: systemUser?.id || null,
      }

      if (isPromise) {
        const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
        const paymentAmount = parseFloat(cleanedAmount)
        
        // Distribute payment across sales proportionally
        const totalRemaining = calculations.confirmationAmount
        const updatePromises = sales.map(async (sale) => {
          const saleRemaining = sale.remaining_payment_amount || (sale.sale_price - (sale.partial_payment_amount || sale.deposit_amount))
          const salePayment = (paymentAmount / totalRemaining) * saleRemaining
          
          // For promise sales: only set commission if it doesn't exist yet (first time)
          const saleUpdateData: any = {
            ...baseUpdateData,
              partial_payment_amount: (sale.partial_payment_amount || 0) + salePayment,
              remaining_payment_amount: 0,
          }

          // Only set commission if it's not already set (first payment)
          if (!sale.company_fee_amount && companyFee) {
            saleUpdateData.company_fee_amount = parseFloat(companyFee) / sales.length
          }
          // If commission already exists, don't update it (preserve existing value)
          
          // Ensure ID is a valid UUID string
          const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)
          
          // Validate UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          if (!uuidRegex.test(saleId)) {
            throw new Error(`معرف البيع غير صحيح: ${saleId}`)
          }
          
          // First verify the sale exists and is pending
          const { data: existingSale, error: checkError } = await supabase
            .from('sales')
            .select('id, status')
            .eq('id', saleId)
            .single()

          if (checkError || !existingSale || existingSale.status !== 'pending') {
            throw new Error(`البيع ${saleId} غير موجود أو غير معلق`)
          }

          // Now update only by ID (status already verified)
          // Use match() with single field to ensure proper UUID type handling
          return supabase
            .from('sales')
            .update(saleUpdateData)
            .match({ id: saleId })
        })
        
        await Promise.all(updatePromises)
      } else {
        // For non-promise sales, set commission if provided
        const updateData: any = { ...baseUpdateData }
        if (companyFee) {
          updateData.company_fee_amount = parseFloat(companyFee) / sales.length
        }
        
        // Update all sales at once - use filter to avoid UUID type mismatch
        // Ensure all IDs are strings
        const stringSaleIds = saleIds.map(id => typeof id === 'string' ? id : String(id))
        await supabase
          .from('sales')
          .update(updateData)
          .in('id', stringSaleIds)
          .eq('status', 'pending')
      }

      // Update all pieces to Sold
      const pieceIds = sales.map(s => s.land_piece_id)
      await supabase
        .from('land_pieces')
        .update({ status: 'Sold', updated_at: new Date().toISOString() })
        .in('id', pieceIds)

      // Create installment schedule if installment sale
      if (isInstallment && firstSale.payment_offer && installmentStartDate) {
        const totalSurface = calculations.totalSurface
        
        const schedule = generateInstallmentSchedule(
          totalSurface,
          {
            price_per_m2_installment: firstSale.payment_offer.price_per_m2_installment,
            advance_mode: firstSale.payment_offer.advance_mode,
            advance_value: firstSale.payment_offer.advance_value,
            calc_mode: firstSale.payment_offer.calc_mode,
            monthly_amount: firstSale.payment_offer.monthly_amount,
            months: firstSale.payment_offer.months,
          },
          new Date(installmentStartDate),
          calculations.totalDeposit
        )

        // Create installment payments for each sale proportionally
        for (const sale of sales) {
          const saleSurface = sale.piece?.surface_m2 || 0
          const saleProportion = saleSurface / totalSurface
          
          const installmentPayments = schedule.map((item, idx) => ({
            sale_id: sale.id,
            installment_number: idx + 1,
            amount_due: Math.round(item.amountDue * saleProportion * 100) / 100,
            amount_paid: 0,
            due_date: item.dueDate.toISOString().split('T')[0],
            status: 'pending',
          }))

          await supabase
            .from('installment_payments')
            .insert(installmentPayments)
        }
      }

      // Notify owners and current user about group sale confirmation
      try {
      const clientName = firstSale.client?.name || 'عميل غير معروف'
        const confirmedByName = systemUser?.name || 'غير معروف'
        const confirmedByPlace = systemUser?.place || null
      const totalPrice = sales.reduce((sum, s) => sum + s.sale_price, 0)
        const totalDeposit = sales.reduce((sum, s) => sum + (s.deposit_amount || 0), 0)
        
        // Build notification message based on payment method
        let notificationMessage = ''
        let notificationTitle = ''
        
        if (firstSale.payment_method === 'full') {
          // Full payment notification
          notificationTitle = `تم تأكيد ${sales.length} بيع - دفع كامل`
          notificationMessage = `تم تأكيد ${sales.length} بيع للعميل ${clientName}\n\n`
          notificationMessage += `📋 تفاصيل البيع:\n`
          notificationMessage += `• عدد القطع: ${sales.length} قطعة\n`
          notificationMessage += `• السعر الإجمالي: ${formatPrice(totalPrice)} DT\n`
          notificationMessage += `• العربون الإجمالي (مدفوع مسبقاً): ${formatPrice(totalDeposit)} DT\n`
          notificationMessage += `• المبلغ المستلم عند التأكيد: ${formatPrice(calculations.confirmationAmount)} DT\n\n`
          notificationMessage += `✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
        } else if (firstSale.payment_method === 'installment') {
          // Installment notification
          notificationTitle = `تم تأكيد ${sales.length} بيع - تقسيط`
          notificationMessage = `تم تأكيد ${sales.length} بيع للعميل ${clientName}\n\n`
          notificationMessage += `📋 تفاصيل البيع:\n`
          notificationMessage += `• عدد القطع: ${sales.length} قطعة\n`
          notificationMessage += `• السعر الإجمالي: ${formatPrice(totalPrice)} DT\n`
          notificationMessage += `• العربون الإجمالي (مدفوع مسبقاً): ${formatPrice(totalDeposit)} DT\n`
          notificationMessage += `• التسبقة الإجمالية (المستلم عند التأكيد): ${formatPrice(calculations.confirmationAmount)} DT\n`
          
          if (calculations.installmentDetails) {
            notificationMessage += `\n📅 تفاصيل الأقساط:\n`
            notificationMessage += `• عدد الأشهر: ${calculations.installmentDetails.numberOfMonths} شهر\n`
            notificationMessage += `• المبلغ الشهري: ${formatPrice(calculations.installmentDetails.monthlyPayment)} DT\n`
            if (calculations.installmentDetails.startDate && calculations.installmentDetails.endDate) {
              notificationMessage += `• من: ${formatDate(calculations.installmentDetails.startDate, { year: 'numeric', month: 'long', day: 'numeric' })}\n`
              notificationMessage += `• إلى: ${formatDate(calculations.installmentDetails.endDate, { year: 'numeric', month: 'long', day: 'numeric' })}\n`
            }
          }
          
          notificationMessage += `\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
        } else if (firstSale.payment_method === 'promise') {
          // Promise of sale notification
          notificationTitle = `تم تأكيد ${sales.length} بيع - وعد بالبيع`
          notificationMessage = `تم تأكيد ${sales.length} بيع للعميل ${clientName}\n\n`
          notificationMessage += `📋 تفاصيل البيع:\n`
          notificationMessage += `• عدد القطع: ${sales.length} قطعة\n`
          notificationMessage += `• السعر الإجمالي: ${formatPrice(totalPrice)} DT\n`
          notificationMessage += `• العربون الإجمالي (مدفوع مسبقاً): ${formatPrice(totalDeposit)} DT\n`
          notificationMessage += `• المبلغ المستلم عند التأكيد: ${formatPrice(calculations.confirmationAmount)} DT\n\n`
          notificationMessage += `✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
        } else {
          // Fallback for unknown payment method
          notificationTitle = `تم تأكيد ${sales.length} بيع`
          notificationMessage = `تم تأكيد ${sales.length} بيع للعميل ${clientName}\n\n`
          notificationMessage += `• السعر الإجمالي: ${formatPrice(totalPrice)} DT\n`
          notificationMessage += `\n✅ تم التأكيد بواسطة: ${confirmedByName}${confirmedByPlace ? ` (${confirmedByPlace})` : ''}`
        }
      
      // Notify owners
        const notifyOwnersResult = await notifyOwners(
        'sale_confirmed',
          notificationTitle,
        notificationMessage,
        'sale',
        firstSale.id,
        {
          client_name: clientName,
          sales_count: sales.length,
          total_price: totalPrice,
            total_deposit: totalDeposit,
            total_confirmation: calculations.confirmationAmount,
          payment_method: firstSale.payment_method,
            confirmed_by_name: confirmedByName,
            confirmed_by_place: confirmedByPlace,
            installment_details: calculations.installmentDetails,
          sale_ids: sales.map(s => s.id),
        }
      )
        
        if (!notifyOwnersResult) {
          console.warn('Failed to notify owners about group sale confirmation')
        }
      
      // Also notify current user if they're not an owner
      if (systemUser?.id) {
          const notifyUserResult = await notifyCurrentUser(
          'sale_confirmed',
            notificationTitle,
          notificationMessage,
          systemUser.id,
          'sale',
          firstSale.id,
          {
            client_name: clientName,
            sales_count: sales.length,
            total_price: totalPrice,
              total_deposit: totalDeposit,
              total_confirmation: calculations.confirmationAmount,
            payment_method: firstSale.payment_method,
              confirmed_by_name: confirmedByName,
              confirmed_by_place: confirmedByPlace,
              installment_details: calculations.installmentDetails,
            sale_ids: sales.map(s => s.id),
          }
        )
          
          if (!notifyUserResult) {
            console.warn('Failed to notify current user about group sale confirmation')
          }
        }
      } catch (notifError: any) {
        // Don't fail the confirmation if notification fails
        console.error('Error creating notifications (non-critical):', notifError)
      }

      setSuccessMessage(`تم تأكيد ${sales.length} بيع بنجاح!`)
      setShowSuccessDialog(true)
      onConfirm()
      onClose()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل تأكيد المبيعات')
      setShowErrorDialog(true)
    } finally {
      setConfirming(false)
    }
  }

  if (!calculations || sales.length === 0) return null

  const firstSale = sales[0]
  const isInstallment = firstSale.payment_method === 'installment'
  const isFull = firstSale.payment_method === 'full'
  const isPromise = firstSale.payment_method === 'promise'

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={`تأكيد ${sales.length} بيع - ${firstSale.client?.name || 'غير محدد'}`}
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
              {confirming ? 'جاري التأكيد...' : isPromise ? 'تأكيد الوعد بالبيع' : 'اتمام البيع'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Client Info */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">معلومات العميل</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><span className="font-medium">الاسم:</span> {firstSale.client?.name || 'غير محدد'}</p>
                <p><span className="font-medium">رقم الهوية:</span> {firstSale.client?.id_number || 'غير محدد'}</p>
              </div>
              <div>
                <p><span className="font-medium">الهاتف:</span> {firstSale.client?.phone || 'غير محدد'}</p>
                {firstSale.payment_offer && (
                  <p><span className="font-medium">عرض التقسيط:</span> {firstSale.payment_offer.name || 'بدون اسم'}</p>
                )}
              </div>
            </div>
          </Card>

          {/* Pieces Summary */}
          <Card className="p-4 bg-gray-50 border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">القطع ({sales.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-right py-2 px-2 font-semibold">#</th>
                    <th className="text-right py-2 px-2 font-semibold">الدفعة</th>
                    <th className="text-right py-2 px-2 font-semibold">القطعة</th>
                    <th className="text-right py-2 px-2 font-semibold">المساحة</th>
                    <th className="text-right py-2 px-2 font-semibold">السعر</th>
                    <th className="text-right py-2 px-2 font-semibold">العربون</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale, idx) => (
                    <tr key={sale.id} className="border-b border-gray-200">
                      <td className="py-2 px-2">{idx + 1}</td>
                      <td className="py-2 px-2">{sale.batch?.name || '-'}</td>
                      <td className="py-2 px-2">{sale.piece?.piece_number || '-'}</td>
                      <td className="py-2 px-2">{sale.piece?.surface_m2.toLocaleString('en-US')} م²</td>
                      <td className="py-2 px-2 font-semibold">{formatPrice(sale.sale_price)} DT</td>
                      <td className="py-2 px-2">{formatPrice(sale.deposit_amount)} DT</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold">
                    <td colSpan={3} className="py-2 px-2 text-right">الإجمالي:</td>
                    <td className="py-2 px-2">{calculations.totalSurface.toLocaleString('en-US')} م²</td>
                    <td className="py-2 px-2">{formatPrice(calculations.totalPrice)} DT</td>
                    <td className="py-2 px-2">{formatPrice(calculations.totalDeposit)} DT</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Calculation Details */}
          <Card className="p-4 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-900 mb-3">تفاصيل الحساب</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>إجمالي سعر القطع:</span>
                <span className="font-semibold">{formatPrice(calculations.totalPrice)} DT</span>
              </div>
              <div className="flex justify-between">
                <span>إجمالي العربون:</span>
                <span className="font-semibold text-blue-600">{formatPrice(calculations.totalDeposit)} DT</span>
              </div>

              {isInstallment && (
                <>
                  {firstSale.payment_offer ? (
                    <>
                      <div className="border-t border-green-300 pt-2 mt-2">
                        <div className="flex justify-between">
                          <span>التسبقة:</span>
                          <span className="font-semibold text-orange-600">
                            {formatPrice(
                              calculateInstallmentWithDeposit(
                                calculations.totalSurface,
                                {
                                  price_per_m2_installment: firstSale.payment_offer.price_per_m2_installment,
                                  advance_mode: firstSale.payment_offer.advance_mode,
                                  advance_value: firstSale.payment_offer.advance_value,
                                  calc_mode: firstSale.payment_offer.calc_mode,
                                  monthly_amount: firstSale.payment_offer.monthly_amount,
                                  months: firstSale.payment_offer.months,
                                },
                                calculations.totalDeposit
                              ).advanceAmount
                            )}{' '}
                            DT
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>(-) العربون:</span>
                          <span>{formatPrice(calculations.totalDeposit)} DT</span>
                        </div>
                        <div className="flex justify-between font-semibold mt-1">
                          <span>= التسبقة (بعد خصم العربون):</span>
                          <span className="text-orange-600">{formatPrice(calculations.confirmationAmount)} DT</span>
                        </div>
                      </div>
                      <div className="border-t border-green-300 pt-2 mt-2">
                        <div className="flex justify-between font-semibold text-green-600">
                          <span>المستحق عند التأكيد:</span>
                          <span>{formatPrice(calculations.confirmationAmount)} DT</span>
                        </div>
                      </div>
                      <div className="border-t border-green-300 pt-2 mt-2 space-y-1">
                        {calculations.installmentDetails ? (
                          <>
                            <div className="flex justify-between">
                              <span>عدد الأشهر:</span>
                              <span className="font-semibold">{calculations.installmentDetails.numberOfMonths} شهر</span>
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
                        <div className="flex justify-between pt-2 border-t border-green-200">
                          <span>المتبقي للتقسيط:</span>
                          <span className="font-semibold text-purple-600">
                            {formatPrice(calculations.installmentDetails?.totalRemaining || (calculations.totalPrice - calculations.confirmationAmount))} DT
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 pt-1">
                          (السعر الإجمالي - التسبقة بعد خصم العربون)
                        </div>
                      </div>
                      {firstSale.payment_offer.name && (
                        <div className="border-t border-green-300 pt-2 mt-2">
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">اسم العرض:</span> {firstSale.payment_offer.name}
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
                <div className="border-t border-green-300 pt-2 mt-2">
                  <div className="flex justify-between font-semibold text-green-600">
                    <span>المبلغ المتبقي:</span>
                    <span>{formatPrice(calculations.confirmationAmount)} DT</span>
                  </div>
                </div>
              )}

              {isPromise && (
                <>
                  {calculations.totalPartialPaid > 0 && (
                    <div className="flex justify-between">
                      <span>المدفوع سابقاً:</span>
                      <span className="font-semibold text-orange-600">
                        {formatPrice(calculations.totalPartialPaid)} DT
                      </span>
                    </div>
                  )}
                  <div className="border-t border-green-300 pt-2 mt-2">
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
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">إعدادات الأقساط</h3>
              <div className="space-y-2">
                <Label>تاريخ بداية الأقساط *</Label>
                <Input
                  type="date"
                  value={installmentStartDate}
                  onChange={(e) => setInstallmentStartDate(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  سيتم إنشاء جدول الأقساط تلقائياً بعد تأكيد التسبقة
                </p>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">نقدي</option>
              <option value="check">شيك</option>
              <option value="transfer">تحويل بنكي</option>
            </select>
          </div>

          {/* Contract Writer */}
          <div className="space-y-2">
            <Label>محرر العقد</Label>
            {loadingWriters ? (
              <p className="text-sm text-gray-500">جاري التحميل...</p>
            ) : (
              <select
                value={contractWriterId}
                onChange={(e) => setContractWriterId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <Card className="p-4 bg-orange-50 border-orange-200">
              <h3 className="font-semibold text-orange-900 mb-3">معلومات وعد البيع</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>المبلغ المستلم الآن *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promisePaymentAmount}
                    onChange={(e) => setPromisePaymentAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500">
                    المبلغ الذي سيتم استلامه الآن. الباقي سيتم تأكيده لاحقاً.
                  </p>
                  {promisePaymentAmount && !isNaN(parseFloat(promisePaymentAmount)) && (
                    <div className="mt-2 p-2 bg-white rounded border border-orange-300">
                      <p className="text-sm">
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
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية..."
              rows={3}
            />
          </div>
        </div>
      </Dialog>

      {/* Final Confirmation Dialog */}
      <ConfirmDialog
        open={showFinalConfirmDialog}
        onClose={() => setShowFinalConfirmDialog(false)}
        onConfirm={handleFinalConfirm}
        title={isPromise ? 'تأكيد وعد البيع' : 'تأكيد المبيعات'}
        description={
          isPromise
            ? (() => {
                const cleanedAmount = promisePaymentAmount.trim().replace(/,/g, '')
                const amount = parseFloat(cleanedAmount) || 0
                const piecesInfo = sales.map(s => `${s.batch?.name || '-'} - ${s.piece?.piece_number || '-'}`).join(', ')
                return `هل أنت مستعد للتأكيد؟\n\nستحصل على المبلغ: ${formatPrice(amount)} DT\n\nالمتبقي بعد هذا الدفع: ${formatPrice(calculations.confirmationAmount - amount)} DT\n\nالقطع: ${piecesInfo}`
              })()
            : (() => {
                const piecesInfo = sales.map(s => `${s.batch?.name || '-'} - ${s.piece?.piece_number || '-'}`).join(', ')
                return `هل أنت مستعد لتأكيد البيع؟\n\nسيتم إنشاء ${sales.length} بيع للعميل ${firstSale.client?.name || 'غير محدد'}\n\nالقطع: ${piecesInfo}\n\nالعربون: ${formatPrice(calculations.totalDeposit)} DT\n\nالمستحق عند التأكيد: ${formatPrice(calculations.confirmationAmount)} DT`
              })()
        }
        confirmText={isPromise ? 'تأكيد الوعد بالبيع' : 'تأكيد'}
        cancelText="إلغاء"
        variant="warning"
        disabled={confirming}
        loading={confirming}
      >
        <div className="mt-4 space-y-4">
          {/* Commission field - only show for first payment of promise sales */}
          {(!isPromise || !sales[0]?.partial_payment_amount || !sales[0]?.company_fee_amount) && (
          <div className="space-y-2">
              <Label>
                عمولة الشركة (DT) - سيتم توزيعها على جميع المبيعات
                {isPromise && sales[0]?.partial_payment_amount && (
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
                disabled={isPromise && sales[0]?.partial_payment_amount && sales[0]?.company_fee_amount ? true : false}
            />
              {isPromise && sales[0]?.partial_payment_amount && sales[0]?.company_fee_amount && (
                <p className="text-xs text-gray-500">
                  تم تحديد العمولة في الدفعة الأولى: {formatPrice(sales[0].company_fee_amount)} DT لكل بيع
                </p>
              )}
          </div>
          )}
          
          {/* Pieces List */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h4 className="font-semibold text-gray-900 mb-2 text-sm">القطع ({sales.length})</h4>
            <div className="space-y-1 text-xs">
              {sales.map((sale, idx) => (
                <div key={sale.id} className="flex justify-between items-center">
                  <span className="text-gray-600">
                    {idx + 1}. {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'}
                  </span>
                  <span className="font-medium">{formatPrice(sale.sale_price)} DT</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* Success Dialog */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={() => {
          setShowSuccessDialog(false)
          setSuccessMessage('')
        }}
        type="success"
        title="نجح التأكيد"
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
        title="فشل التأكيد"
        message={errorMessage}
      />
    </>
  )
}

