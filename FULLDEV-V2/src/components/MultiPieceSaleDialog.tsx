import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Alert } from './ui/alert'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { ConfirmDialog } from './ui/confirm-dialog'
import { NotificationDialog } from './ui/notification-dialog'
import { formatPrice, calculatePiecePrice } from '@/utils/priceCalculator'
import { calculateInstallmentWithDeposit } from '@/utils/installmentCalculator'

interface LandPiece {
  id: string
  piece_number: string
  surface_m2: number
  batch_id: string
  direct_full_payment_price: number | null
}

interface Client {
  id: string
  name: string
  id_number: string
  phone: string
}

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

interface MultiPieceSaleDialogProps {
  open: boolean
  onClose: () => void
  pieces: LandPiece[]
  client: Client | null
  batchId: string
  batchName: string
  batchPricePerM2: number | null
  onConfirm: (data: {
    client: Client
    depositAmount: number
    deadlineDate: string
    saleType: 'full' | 'installment' | 'promise'
    paymentOfferId?: string
    notes?: string
    /** When set, use this total price instead of price per m² (temporary fixed price) */
    fixedTotalPrice?: number
  }) => Promise<void>
}

export function MultiPieceSaleDialog({
  open,
  onClose,
  pieces,
  client: initialClient,
  batchId,
  batchName,
  batchPricePerM2,
  onConfirm,
}: MultiPieceSaleDialogProps) {
  // Client is already selected, just use it
  const client = initialClient
  
  const [depositAmount, setDepositAmount] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [saleType, setSaleType] = useState<'full' | 'installment' | 'promise'>('full')
  const [selectedOfferId, setSelectedOfferId] = useState<string>('')
  const [paymentOffers, setPaymentOffers] = useState<PaymentOffer[]>([])
  const [loadingOffers, setLoadingOffers] = useState(false)
  const [notes, setNotes] = useState('')
  /** Temporary option: use a hard-coded total price instead of price per m² */
  const [useFixedPrice, setUseFixedPrice] = useState(false)
  const [fixedTotalPriceInput, setFixedTotalPriceInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Calculate totals - recalculate when offer changes (or when fixed price is used)
  const calculations = useMemo(() => {
    let totalSurface = 0
    let totalPrice = 0

    // Get selected offer inside useMemo to ensure it's fresh
    const selectedOffer = paymentOffers.find((o) => o.id === selectedOfferId)

    // Calculate total surface first
    pieces.forEach((piece) => {
      totalSurface += piece.surface_m2 || 0
    })

    // Temporary fixed price: use hard-coded total instead of price per m²
    const fixedPrice = useFixedPrice ? parseFloat(fixedTotalPriceInput) : NaN
    if (useFixedPrice && !isNaN(fixedPrice) && fixedPrice > 0) {
      totalPrice = fixedPrice
    } else if (saleType === 'installment' && selectedOffer && totalSurface > 0) {
      // Calculate for total surface (more accurate than summing per piece)
      const totalInstallmentCalc = calculateInstallmentWithDeposit(
        totalSurface,
        {
          price_per_m2_installment: selectedOffer.price_per_m2_installment,
          advance_mode: selectedOffer.advance_mode,
          advance_value: selectedOffer.advance_value,
          calc_mode: selectedOffer.calc_mode,
          monthly_amount: selectedOffer.monthly_amount,
          months: selectedOffer.months,
        },
        0 // No deposit yet at this stage
      )
      
      totalPrice = totalInstallmentCalc.basePrice
    } else {
      // For full payment or promise, use regular price calculation
      pieces.forEach((piece) => {
        const calc = calculatePiecePrice({
          surfaceM2: piece.surface_m2,
          batchPricePerM2: batchPricePerM2,
          pieceDirectPrice: piece.direct_full_payment_price,
          depositAmount: 0,
        })
        totalPrice += calc.totalPrice
      })
    }

    const deposit = parseFloat(depositAmount) || 0
    
    // Calculate installment details if installment is selected
    let installmentDetails = null
    if (saleType === 'installment' && selectedOffer && (totalSurface > 0 || (useFixedPrice && totalPrice > 0))) {
      let advanceAmount: number
      let advanceAfterDeposit: number
      let remainingForInstallments: number
      let finalMonthlyPayment: number
      let finalNumberOfMonths: number

      if (useFixedPrice && totalPrice > 0) {
        // Fixed price: compute advance and remaining from our total (not from price_per_m² × surface)
        advanceAmount = selectedOffer.advance_mode === 'fixed'
          ? selectedOffer.advance_value
          : (totalPrice * selectedOffer.advance_value) / 100
        advanceAfterDeposit = Math.max(0, advanceAmount - deposit)
        // المبلغ المتبقي للأقساط = السعر الإجمالي - max(التسبقة، العربون)
        remainingForInstallments = totalPrice - Math.max(advanceAmount, deposit)
      } else {
        // Normal: use calculator with surface × price_per_m²
        const calc = calculateInstallmentWithDeposit(
          totalSurface,
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
        advanceAmount = calc.advanceAmount
        advanceAfterDeposit = calc.advanceAfterDeposit
        remainingForInstallments = calc.remainingForInstallments
        finalMonthlyPayment = calc.recalculatedMonthlyPayment
        finalNumberOfMonths = calc.recalculatedNumberOfMonths
      }

      // When fixed price, compute monthly/number of months from remainingForInstallments and offer
      if (useFixedPrice && totalPrice > 0) {
        if (selectedOffer.calc_mode === 'months' && (selectedOffer.months || 0) > 0) {
          finalNumberOfMonths = selectedOffer.months!
          finalMonthlyPayment = finalNumberOfMonths > 0 ? remainingForInstallments / finalNumberOfMonths : 0
        } else if (selectedOffer.calc_mode === 'monthlyAmount' && (selectedOffer.monthly_amount || 0) > 0) {
          finalMonthlyPayment = selectedOffer.monthly_amount!
          finalNumberOfMonths = Math.ceil(remainingForInstallments / finalMonthlyPayment)
        } else {
          finalMonthlyPayment = 0
          finalNumberOfMonths = 0
        }
      } else {
        // Non-fixed: adjust monthly/months from remaining (original logic)
        if (selectedOffer.calc_mode === 'monthlyAmount' && finalMonthlyPayment > 0) {
          finalNumberOfMonths = Math.ceil(remainingForInstallments / finalMonthlyPayment)
        } else if (selectedOffer.calc_mode === 'months' && finalNumberOfMonths > 0) {
          finalMonthlyPayment = remainingForInstallments / finalNumberOfMonths
        }
      }
      
      installmentDetails = {
        basePrice: totalPrice,
        advanceAmount,
        advanceAfterDeposit,
        remainingAmount: remainingForInstallments,
        monthlyPayment: finalMonthlyPayment,
        numberOfMonths: finalNumberOfMonths,
        remaining: remainingForInstallments,
      }
    }

    const remaining = installmentDetails 
      ? installmentDetails.remaining 
      : totalPrice - deposit

    return {
      totalSurface,
      totalPrice,
      deposit,
      remaining,
      installmentDetails,
    }
  }, [pieces, batchPricePerM2, depositAmount, saleType, selectedOfferId, paymentOffers, useFixedPrice, fixedTotalPriceInput])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDepositAmount('')
      setNotes('')
      setSaleType('full')
      setSelectedOfferId('')
      setUseFixedPrice(false)
      setFixedTotalPriceInput('')
      setError(null)
      
      // Set default deadline to today
      const today = new Date()
      setDeadlineDate(today.toISOString().split('T')[0])
    }
  }, [open])

  // Load payment offers when installment is selected
  useEffect(() => {
    if (open && saleType === 'installment' && batchId) {
      loadPaymentOffers()
    } else {
      setPaymentOffers([])
      setSelectedOfferId('')
    }
  }, [open, saleType, batchId])

  async function loadPaymentOffers() {
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
      if (data && data.length > 0) {
        // Always set the first offer as default if none is selected
        if (!selectedOfferId || selectedOfferId === '') {
          console.log('Auto-selecting first payment offer:', data[0].id)
          setSelectedOfferId(data[0].id)
        }
      } else {
        // Reset selectedOfferId if no offers available
        setSelectedOfferId('')
      }
    } catch (e: any) {
      console.error('Error loading payment offers:', e)
      setError('فشل تحميل عروض التقسيط')
    } finally {
      setLoadingOffers(false)
    }
  }

  function handleConfirmClick() {
    setError(null)

    if (!client) {
      setError('لم يتم اختيار العميل')
      return
    }

    if (!depositAmount || parseFloat(depositAmount) < 0) {
      setError('يرجى إدخال مبلغ العربون')
      return
    }

    if (!deadlineDate) {
      setError('يرجى تحديد تاريخ آخر أجل')
      return
    }

    if (calculations.deposit > calculations.totalPrice) {
      setError('مبلغ العربون لا يمكن أن يتجاوز السعر الإجمالي')
      return
    }

    if (useFixedPrice && (calculations.totalPrice <= 0 || isNaN(calculations.totalPrice))) {
      setError('يرجى إدخال سعر إجمالي صحيح عند استخدام السعر الثابت')
      return
    }

    if (saleType === 'installment' && !selectedOfferId) {
      setError('يرجى اختيار عرض التقسيط')
      return
    }

    setShowFinalConfirmDialog(true)
  }

  async function handleFinalConfirm() {
    if (!client) return
    
    setShowFinalConfirmDialog(false)
    setSaving(true)
    try {
      await onConfirm({
        client,
        depositAmount: calculations.deposit,
        deadlineDate,
        saleType,
        paymentOfferId: saleType === 'installment' && selectedOfferId ? selectedOfferId : undefined,
        notes: notes.trim() || undefined,
        fixedTotalPrice: useFixedPrice && calculations.totalPrice > 0 ? calculations.totalPrice : undefined,
      })
      setSuccessMessage(`تم إنشاء ${pieces.length} بيع بنجاح!`)
      setShowSuccessDialog(true)
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل إنشاء البيع')
      setShowErrorDialog(true)
    } finally {
      setSaving(false)
    }
  }

  function handleSuccessClose() {
    setShowSuccessDialog(false)
    onClose()
  }

  function handleErrorClose() {
    setShowErrorDialog(false)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
        title={`بيع ${pieces.length} قطعة`}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleConfirmClick} disabled={saving || !client}>
            {saving ? 'جاري الحفظ...' : 'تأكيد البيع'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 sm:space-y-4 lg:space-y-6">
        {/* Fixed price option - FIRST so always visible on mobile/PWA */}
        <Card className="p-3 sm:p-4 bg-amber-50 border-2 border-amber-300 flex-shrink-0">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="useFixedPrice"
              checked={useFixedPrice}
              onChange={(e) => setUseFixedPrice(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-2 border-amber-500 text-amber-600 focus:ring-amber-500 flex-shrink-0"
              aria-label="استخدام سعر ثابت"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="useFixedPrice" className="text-sm sm:text-base font-bold text-amber-900 cursor-pointer block">
                استخدام سعر ثابت (مؤقت)
              </Label>
              <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                استخدم سعراً إجمالياً محدداً بدلاً من السعر لكل م² (نقدي أو تقسيط).
              </p>
              {useFixedPrice && (
                <div className="pt-2">
                  <Label className="text-xs sm:text-sm font-medium">السعر الإجمالي (د.ت) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fixedTotalPriceInput}
                    onChange={(e) => setFixedTotalPriceInput(e.target.value)}
                    placeholder="0.00"
                    size="sm"
                    className="mt-1 text-sm w-full max-w-[14rem]"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        {error && <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>}

        {/* Client Information */}
        {client && (
          <Card className="p-2 sm:p-3 lg:p-4 bg-blue-50 border-blue-200">
            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-blue-900 mb-1.5 sm:mb-2">معلومات العميل</h3>
            <div className="text-xs sm:text-sm space-y-0.5 sm:space-y-1">
              <p><span className="font-medium">الاسم:</span> {client.name}</p>
              <p><span className="font-medium">رقم الهوية:</span> {client.id_number}</p>
              <p><span className="font-medium">الهاتف:</span> {client.phone}</p>
            </div>
          </Card>
        )}

        {/* Pieces List */}
        <div>
          <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 mb-2 sm:mb-3">القطع المختارة ({pieces.length})</h3>
          <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-56 lg:max-h-64 overflow-y-auto scrollbar-thin">
            {pieces.map((piece, idx) => {
              // When fixed price is used, show proportional price per piece
              const totalSurface = pieces.reduce((s, p) => s + (p.surface_m2 || 0), 0)
              const piecePrice = useFixedPrice && calculations.totalPrice > 0 && totalSurface > 0
                ? (piece.surface_m2 / totalSurface) * calculations.totalPrice
                : (() => {
                    const selectedOffer = paymentOffers.find((o) => o.id === selectedOfferId)
                    const pricePerM2 = saleType === 'installment' && selectedOffer
                      ? selectedOffer.price_per_m2_installment
                      : batchPricePerM2
                    const calc = calculatePiecePrice({
                      surfaceM2: piece.surface_m2,
                      batchPricePerM2: pricePerM2,
                      pieceDirectPrice: piece.direct_full_payment_price,
                      depositAmount: 0,
                    })
                    return calc.totalPrice
                  })()
              return (
                <Card key={piece.id} className="p-2 sm:p-2.5 lg:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <Badge variant="default" size="sm" className="text-xs">#{idx + 1}</Badge>
                        <span className="text-xs sm:text-sm font-medium truncate">القطعة {piece.piece_number}</span>
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                        المساحة: {piece.surface_m2.toLocaleString()} م² · السعر: {formatPrice(piecePrice)} DT
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">مبلغ العربون (DT) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              size="sm"
              className="text-xs sm:text-sm"
            />
            <p className={`text-xs ${calculations.remaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              المتبقي بعد العربون: {formatPrice(calculations.remaining)} DT
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">نوع البيع *</Label>
            <select
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as 'full' | 'installment' | 'promise')}
              className="w-full px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
            >
              <option value="full">بالحاضر</option>
              <option value="installment">التقسيط</option>
              <option value="promise">وعد بالبيع</option>
            </select>
            <p className="text-xs text-gray-500">
              {saleType === 'full' && 'بالحاضر عند التأكيد'}
              {saleType === 'installment' && 'الدفع بالتقسيط'}
              {saleType === 'promise' && 'وعد بالبيع - الدفع على جزئين'}
            </p>
          </div>

          {/* Installment Offers Selection */}
          {saleType === 'installment' && (
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">اختر عرض التقسيط *</Label>
              {loadingOffers ? (
                <div className="text-center py-3 sm:py-4">
                  <p className="text-xs sm:text-sm text-gray-500">جاري تحميل العروض...</p>
                </div>
              ) : paymentOffers.length === 0 ? (
                <Alert variant="error" className="text-xs sm:text-sm">لا توجد عروض تقسيط متاحة لهذه الدفعة</Alert>
              ) : (
                <div className="space-y-1.5 sm:space-y-2 max-h-40 sm:max-h-48 overflow-y-auto scrollbar-thin">
                  {paymentOffers.map((offer) => (
                    <Card
                      key={offer.id}
                      className={`p-2 sm:p-2.5 lg:p-3 cursor-pointer transition-all ${
                        selectedOfferId === offer.id
                          ? 'bg-blue-50 border-blue-300 border-2'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedOfferId(offer.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <input
                              type="radio"
                              checked={selectedOfferId === offer.id}
                              onChange={() => setSelectedOfferId(offer.id)}
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0"
                            />
                            <span className="text-xs sm:text-sm font-semibold truncate">{offer.name || 'عرض بدون اسم'}</span>
                            <Badge variant="info" size="sm" className="text-xs flex-shrink-0">
                              {offer.price_per_m2_installment.toLocaleString()} د/م²
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-600 space-y-0.5 sm:space-y-1">
                            <p>
                              تسبقة: {offer.advance_value.toLocaleString()}{' '}
                              {offer.advance_mode === 'percent' ? '%' : 'دت'}
                            </p>
                            {offer.calc_mode === 'monthlyAmount' ? (
                              <p>مبلغ شهري: {offer.monthly_amount?.toLocaleString() || 0} دت</p>
                            ) : (
                              <p>عدد الأشهر: {offer.months || 0}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">تاريخ آخر أجل لإتمام الإجراءات *</Label>
            <Input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية (اختياري)"
              rows={2}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Calculations - Moved to end */}
        <Card className="p-2 sm:p-3 lg:p-4 bg-green-50 border-green-200">
          <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-green-900 mb-2 sm:mb-3">الحسابات</h3>
          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span>إجمالي المساحة:</span>
              <span className="font-semibold">{calculations.totalSurface.toLocaleString()} م²</span>
            </div>
            
            {calculations.installmentDetails ? (
              <>
                {/* Installment Details */}
                <div className="flex justify-between">
                  <span>السعر الإجمالي (بالتقسيط):</span>
                  <span className="font-semibold">{formatPrice(calculations.totalPrice)} DT</span>
                </div>
                
                <div className="border-t border-green-300 pt-2 mt-2 space-y-2">
                  <div className="flex justify-between">
                    <span>التسبقة ({calculations.installmentDetails.advanceAmount > 0 ? formatPrice(calculations.installmentDetails.advanceAmount) : '0'} DT):</span>
                    <span className="font-semibold text-orange-600">
                      {formatPrice(calculations.installmentDetails.advanceAmount)} DT
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>العربون:</span>
                    <span className="font-semibold text-blue-600">{formatPrice(calculations.deposit)} DT</span>
                  </div>
                  
                  {calculations.installmentDetails.advanceAfterDeposit > 0 && (
                    <div className={`flex justify-between text-xs ${calculations.installmentDetails.advanceAfterDeposit < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      <span>المتبقي من التسبقة بعد العربون:</span>
                      <span className={calculations.installmentDetails.advanceAfterDeposit < 0 ? 'font-semibold' : ''}>
                        {formatPrice(calculations.installmentDetails.advanceAfterDeposit)} DT
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <span>المبلغ المتبقي للأقساط:</span>
                    <span className={`font-semibold ${calculations.installmentDetails.remainingAmount < 0 ? 'text-red-600' : 'text-purple-600'}`}>
                      {formatPrice(calculations.installmentDetails.remainingAmount)} DT
                    </span>
                  </div>
                  
                  <div className="border-t border-green-300 pt-2 mt-2 space-y-1">
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
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>إجمالي الأقساط:</span>
                      <span>
                        {formatPrice(calculations.installmentDetails.monthlyPayment * calculations.installmentDetails.numberOfMonths)} DT
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Full Payment or Promise Details */}
                <div className="flex justify-between">
                  <span>السعر الإجمالي:</span>
                  <span className="font-semibold">{formatPrice(calculations.totalPrice)} DT</span>
                </div>
                <div className="border-t border-green-300 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span>العربون:</span>
                    <span className="font-semibold text-blue-600">{formatPrice(calculations.deposit)} DT</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>المتبقي:</span>
                    <span className={`font-semibold ${calculations.remaining < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {formatPrice(calculations.remaining)} DT
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Final Confirmation Dialog */}
      <ConfirmDialog
        open={showFinalConfirmDialog}
        onClose={() => setShowFinalConfirmDialog(false)}
        onConfirm={handleFinalConfirm}
        title="تأكيد البيع"
        description={client ? `هل أنت مستعد لتأكيد البيع؟\n\nسيتم إنشاء ${pieces.length} بيع للعميل ${client.name}\n\nالعربون: ${formatPrice(calculations.deposit)} DT` : ''}
        confirmText="تأكيد"
        cancelText="إلغاء"
        variant="warning"
        disabled={saving}
        loading={saving}
      />

      {/* Success Dialog */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={handleSuccessClose}
        type="success"
        title="نجح البيع"
        message={successMessage}
      />

      {/* Error Dialog */}
      <NotificationDialog
        open={showErrorDialog}
        onClose={handleErrorClose}
        type="error"
        title="فشل البيع"
        message={errorMessage}
      />
    </Dialog>
  )
}

