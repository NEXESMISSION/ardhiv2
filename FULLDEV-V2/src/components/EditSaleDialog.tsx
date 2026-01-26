import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { formatPrice } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'

interface PaymentOffer {
  id: string
  name: string | null
  price_per_m2_installment: number
  advance_mode: 'fixed' | 'percent'
  advance_value: number
  calc_mode: 'monthlyAmount' | 'months'
  monthly_amount: number | null
  months: number | null
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
  partial_payment_amount: number | null
  remaining_payment_amount: number | null
  notes: string | null
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
  payment_offer?: PaymentOffer | null
}

interface EditSaleDialogProps {
  open: boolean
  onClose: () => void
  sale: Sale
  onSave: () => void
}

export function EditSaleDialog({ open, onClose, sale, onSave }: EditSaleDialogProps) {
  const [salePrice, setSalePrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'full' | 'installment' | 'promise'>('full')
  const [paymentOfferId, setPaymentOfferId] = useState<string>('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [notes, setNotes] = useState('')
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('')
  const [remainingPaymentAmount, setRemainingPaymentAmount] = useState('')
  
  const [paymentOffers, setPaymentOffers] = useState<PaymentOffer[]>([])
  const [loadingOffers, setLoadingOffers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form when dialog opens or sale changes
  useEffect(() => {
    if (open && sale) {
      setSalePrice(sale.sale_price.toString())
      setDepositAmount(sale.deposit_amount.toString())
      setPaymentMethod(sale.payment_method || 'full')
      setPaymentOfferId(sale.payment_offer_id || '')
      setDeadlineDate(sale.deadline_date || '')
      setNotes(sale.notes || '')
      setPartialPaymentAmount(sale.partial_payment_amount?.toString() || '')
      setRemainingPaymentAmount(sale.remaining_payment_amount?.toString() || '')
      setError(null)
      
      // Load payment offers if installment
      if (sale.payment_method === 'installment' && sale.batch_id) {
        loadPaymentOffers(sale.batch_id)
      }
    }
  }, [open, sale])

  async function loadPaymentOffers(batchId: string) {
    setLoadingOffers(true)
    try {
      const { data, error: err } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('batch_id', batchId)
        .is('land_piece_id', null)
        .order('created_at', { ascending: false })

      if (err) throw err
      setPaymentOffers(data || [])
      
      // Auto-select the current offer if available
      if (sale.payment_offer_id && data?.some(o => o.id === sale.payment_offer_id)) {
        setPaymentOfferId(sale.payment_offer_id)
      } else if (data && data.length > 0 && !paymentOfferId) {
        setPaymentOfferId(data[0].id)
      }
    } catch (e: any) {
      console.error('Error loading payment offers:', e)
    } finally {
      setLoadingOffers(false)
    }
  }

  // Load offers when payment method changes to installment
  useEffect(() => {
    if (open && paymentMethod === 'installment' && sale.batch_id && paymentOffers.length === 0) {
      loadPaymentOffers(sale.batch_id)
    }
  }, [paymentMethod, open, sale.batch_id])

  // Calculate installment details for preview
  const installmentPreview = useMemo(() => {
    if (paymentMethod !== 'installment' || !sale.piece) return null
    
    const selectedOffer = paymentOffers.find(o => o.id === paymentOfferId)
    if (!selectedOffer) return null

    const deposit = parseFloat(depositAmount) || 0
    const calc = calculateInstallmentWithDeposit(
      sale.piece.surface_m2,
      {
        price_per_m2_installment: selectedOffer.price_per_m2_installment,
        advance_mode: selectedOffer.advance_mode,
        advance_value: selectedOffer.advance_value,
        calc_mode: selectedOffer.calc_mode,
        monthly_amount: selectedOffer.monthly_amount,
        months: selectedOffer.months,
      },
      deposit
    )

    return {
      basePrice: calc.basePrice,
      advanceAmount: calc.advanceAmount,
      advanceAfterDeposit: calc.advanceAfterDeposit,
      remainingForInstallments: calc.remainingForInstallments,
      monthlyPayment: calc.recalculatedMonthlyPayment,
      numberOfMonths: calc.recalculatedNumberOfMonths,
    }
  }, [paymentMethod, paymentOfferId, depositAmount, sale.piece, paymentOffers])

  async function handleSave() {
    setError(null)

    // Validation
    const price = parseFloat(salePrice)
    const deposit = parseFloat(depositAmount)

    if (isNaN(price) || price <= 0) {
      setError('يرجى إدخال سعر صحيح')
      return
    }

    if (isNaN(deposit) || deposit < 0) {
      setError('يرجى إدخال مبلغ العربون صحيح')
      return
    }

    if (deposit > price) {
      setError('مبلغ العربون لا يمكن أن يتجاوز السعر')
      return
    }

    if (!deadlineDate) {
      setError('يرجى تحديد تاريخ آخر أجل')
      return
    }

    if (paymentMethod === 'installment' && !paymentOfferId) {
      setError('يرجى اختيار عرض التقسيط')
      return
    }

    if (paymentMethod === 'promise') {
      const partial = parseFloat(partialPaymentAmount) || 0
      const remaining = parseFloat(remainingPaymentAmount) || 0
      
      if (partial < 0 || remaining < 0) {
        setError('المبالغ الجزئية يجب أن تكون موجبة')
        return
      }
      
      if (Math.abs(partial + remaining - (price - deposit)) > 0.01) {
        setError(`المبالغ الجزئية غير متطابقة. يجب أن يكون المجموع: ${formatPrice(price - deposit)} DT`)
        return
      }
    }

    setSaving(true)
    try {
      const updateData: any = {
        sale_price: price,
        deposit_amount: deposit,
        payment_method: paymentMethod,
        payment_offer_id: paymentMethod === 'installment' ? paymentOfferId : null,
        deadline_date: deadlineDate,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (paymentMethod === 'promise') {
        updateData.partial_payment_amount = parseFloat(partialPaymentAmount) || deposit
        updateData.remaining_payment_amount = parseFloat(remainingPaymentAmount) || (price - deposit)
      } else {
        updateData.partial_payment_amount = null
        updateData.remaining_payment_amount = null
      }

      // Ensure ID is a valid UUID string
      const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(saleId)) {
        throw new Error('معرف البيع غير صحيح')
      }

      // First verify the sale exists and is pending
      const { data: existingSale, error: checkError } = await supabase
        .from('sales')
        .select('id, status')
        .eq('id', saleId)
        .single()

      if (checkError || !existingSale) {
        throw new Error('البيع غير موجود')
      }

      if (existingSale.status !== 'pending') {
        throw new Error(`لا يمكن تحديث البيع. الحالة الحالية: ${existingSale.status}`)
      }

      // Now update only by ID (status already verified)
      // Use match() with single field to ensure proper UUID type handling
      const { error: updateError } = await supabase
        .from('sales')
        .update(updateData)
        .match({ id: saleId })

      if (updateError) {
        console.error('Error updating sale:', updateError)
        throw updateError
      }

      onSave()
      onClose()
    } catch (e: any) {
      console.error('Error updating sale:', e)
      setError(e.message || 'فشل تحديث البيع')
    } finally {
      setSaving(false)
    }
  }

  // Auto-calculate remaining for promise sales - LIVE UPDATE
  useEffect(() => {
    if (paymentMethod === 'promise') {
      const price = parseFloat(salePrice) || 0
      const deposit = parseFloat(depositAmount) || 0
      const partial = parseFloat(partialPaymentAmount) || 0
      const remaining = price - deposit - partial
      
      // Always update remaining, even if negative (user will see the error)
      setRemainingPaymentAmount(remaining.toFixed(2))
    }
  }, [paymentMethod, salePrice, depositAmount, partialPaymentAmount])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="تعديل تفاصيل البيع"
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>}

        {/* Sale Info */}
        <Card className="p-3 bg-blue-50 border-blue-200">
          <h3 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">معلومات البيع</h3>
          <div className="space-y-1 text-xs sm:text-sm">
            <p><span className="font-medium">العميل:</span> {sale.client?.name || 'غير محدد'}</p>
            <p><span className="font-medium">القطعة:</span> {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'}</p>
            <p><span className="font-medium">المساحة:</span> {sale.piece?.surface_m2.toLocaleString('en-US')} م²</p>
          </div>
        </Card>

        {/* Sale Price */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">
            سعر البيع (DT) * <span className="text-gray-500 text-xs">(يمكن تعديله يدوياً)</span>
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            size="sm"
            className="text-xs sm:text-sm"
          />
        </div>

        {/* Deposit Amount */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">
            مبلغ العربون (DT) * <span className="text-gray-500 text-xs">(يمكن تعديله يدوياً)</span>
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            size="sm"
            className="text-xs sm:text-sm"
          />
          {salePrice && depositAmount && (
            <p className="text-xs text-gray-500">
              المتبقي بعد العربون: {formatPrice((parseFloat(salePrice) || 0) - (parseFloat(depositAmount) || 0))} DT
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">نوع البيع *</Label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'full' | 'installment' | 'promise')}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
          >
            <option value="full">بالحاضر</option>
            <option value="installment">التقسيط</option>
            <option value="promise">وعد بالبيع</option>
          </select>
        </div>

        {/* Installment Offer Selection */}
        {paymentMethod === 'installment' && (
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">عرض التقسيط *</Label>
            {loadingOffers ? (
              <p className="text-xs sm:text-sm text-gray-500">جاري تحميل العروض...</p>
            ) : paymentOffers.length === 0 ? (
              <Alert variant="error" className="text-xs sm:text-sm">لا توجد عروض تقسيط متاحة لهذه الدفعة</Alert>
            ) : (
              <select
                value={paymentOfferId}
                onChange={(e) => setPaymentOfferId(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
              >
                <option value="">-- اختر عرض التقسيط --</option>
                {paymentOffers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name || 'عرض بدون اسم'} - {offer.price_per_m2_installment.toLocaleString()} د/م²
                  </option>
                ))}
              </select>
            )}
            
            {/* Installment Preview */}
            {installmentPreview && sale.piece && (
              <Card className="p-3 bg-green-50 border-green-200 mt-2">
                <h4 className="text-xs sm:text-sm font-semibold text-green-900 mb-2">معاينة الحسابات</h4>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span>السعر الإجمالي:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.basePrice)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التسبقة:</span>
                    <span className="font-semibold text-orange-600">{formatPrice(installmentPreview.advanceAmount)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>العربون:</span>
                    <span className="font-semibold text-blue-600">{formatPrice(parseFloat(depositAmount) || 0)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>المتبقي من التسبقة:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.advanceAfterDeposit)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>المتبقي للأقساط:</span>
                    <span className="font-semibold text-purple-600">{formatPrice(installmentPreview.remainingForInstallments)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>المبلغ الشهري:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.monthlyPayment)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>عدد الأشهر:</span>
                    <span className="font-semibold">{installmentPreview.numberOfMonths} شهر</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Promise Payment Details */}
        {paymentMethod === 'promise' && (
          <div className="space-y-3">
            <Card className="p-3 bg-orange-50 border-orange-200">
              <h4 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">تفاصيل وعد البيع</h4>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">المبلغ المستلم (DT)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={partialPaymentAmount}
                    onChange={(e) => setPartialPaymentAmount(e.target.value)}
                    size="sm"
                    className="text-xs sm:text-sm"
                  />
                  <p className="text-xs text-gray-500">المبلغ الذي تم استلامه بالفعل</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">المبلغ المتبقي (DT)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={remainingPaymentAmount}
                      onChange={(e) => setRemainingPaymentAmount(e.target.value)}
                      size="sm"
                      className="text-xs sm:text-sm flex-1"
                      readOnly
                    />
                    <span className="text-xs sm:text-sm font-semibold text-orange-600 whitespace-nowrap">
                      {formatPrice(parseFloat(remainingPaymentAmount) || 0)} DT
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    يتم تحديثه تلقائياً: السعر ({formatPrice(parseFloat(salePrice) || 0)}) - العربون ({formatPrice(parseFloat(depositAmount) || 0)}) - المستلم ({formatPrice(parseFloat(partialPaymentAmount) || 0)}) = {formatPrice(parseFloat(remainingPaymentAmount) || 0)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Deadline Date */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">تاريخ آخر أجل لإتمام الإجراءات *</Label>
          <Input
            type="date"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            size="sm"
            className="text-xs sm:text-sm"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">ملاحظات</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية..."
            rows={3}
            size="sm"
            className="text-xs sm:text-sm"
          />
        </div>
      </div>
    </Dialog>
  )
}

