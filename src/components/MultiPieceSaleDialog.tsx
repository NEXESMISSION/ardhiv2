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
import { calculateInstallment } from '@/utils/installmentCalculator'
import { useFormDraft } from '@/hooks/useFormDraft'

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

/** Suggested starting price for a piece (only used to pre-fill the manual price input).
 *  Priority: explicit per-piece direct price > batch rate × surface > empty. The user can
 *  freely override; this is just a sensible default so they don't start from a blank field. */
function suggestPiecePrice(piece: LandPiece, batchRate: number | null): string {
  if (piece.direct_full_payment_price && piece.direct_full_payment_price > 0) {
    return String(piece.direct_full_payment_price)
  }
  if (batchRate && batchRate > 0 && piece.surface_m2 > 0) {
    return String(Math.round(batchRate * piece.surface_m2 * 100) / 100)
  }
  return ''
}

function buildPriceSuggestionMap(
  pieces: LandPiece[],
  batchRate: number | null
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of pieces) {
    map[p.id] = suggestPiecePrice(p, batchRate)
  }
  return map
}

interface MultiPieceSaleDialogProps {
  open: boolean
  onClose: () => void
  pieces: LandPiece[]
  client: Client | null
  batchId: string
  batchName: string
  batchPricePerM2: number | null
  /** Called when user wants to add another piece to the sale from inside the dialog */
  onRequestAddPiece?: () => void
  onConfirm: (data: {
    client: Client
    depositAmount: number
    deadlineDate: string
    saleType: 'full' | 'installment' | 'promise'
    paymentOfferId?: string
    /** When set (installment), Land can skip fetching payment_offers for faster sell */
    installmentPricePerM2?: number
    notes?: string
    /** Manual per-piece total prices, one entry per piece in the same order as `pieces` */
    fixedPricesPerPiece?: number[]
  }) => Promise<void>
}

export function MultiPieceSaleDialog({
  open,
  onClose,
  pieces,
  client: initialClient,
  batchId,
  batchName: _batchName,
  batchPricePerM2,
  onRequestAddPiece,
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
  /** Per-piece manual price is the only pricing mode (kept as const so existing
   *  calculation branches that gate on this flag continue to work unchanged). */
  const useFixedPrice = true
  /** Per-piece manual price input (piece.id -> input value) */
  const [fixedPriceByPieceId, setFixedPriceByPieceId] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Draft persistence — guards against losing typed data when the user closes
  // the dialog by mistake or loses internet mid-form. Key includes batchId
  // and the sorted piece IDs so different selections get different drafts.
  // `keepOnClose: true` so closing without saving doesn't lose the draft;
  // we call .clear() manually on successful save (handleSuccessClose).
  const draftKey = `${batchId}:${pieces.map((p) => p.id).sort().join(',')}`
  type DraftShape = {
    depositAmount: string
    deadlineDate: string
    saleType: 'full' | 'installment' | 'promise'
    selectedOfferId: string
    notes: string
    fixedPriceByPieceId: Record<string, string>
  }
  const draft = useFormDraft<DraftShape>('multi-piece-sale', {
    open,
    key: draftKey,
    keepOnClose: true,
  })

  // Calculate totals from manual per-piece prices, plus advance / monthly schedule when an offer is selected
  const calculations = useMemo(() => {
    let totalSurface = 0
    let totalPrice = 0

    // Get selected offer inside useMemo to ensure it's fresh
    const selectedOffer = paymentOffers.find((o) => o.id === selectedOfferId)

    // Calculate total surface first
    pieces.forEach((piece) => {
      totalSurface += piece.surface_m2 || 0
    })

    // Manual per-piece prices (سعر كل قطعة على حدة): total = sum of inputs
    if (useFixedPrice) {
      pieces.forEach((piece) => {
        const v = parseFloat(fixedPriceByPieceId[piece.id] || '0')
        if (!isNaN(v) && v > 0) totalPrice += v
      })
    } else if (saleType === 'installment' && selectedOffer && totalSurface > 0) {
      // Offer is per piece: base = price_per_m² × total surface
      const surfacePerPiece = totalSurface / pieces.length
      const perPieceCalc = calculateInstallment(surfacePerPiece, {
        price_per_m2_installment: selectedOffer.price_per_m2_installment,
        advance_mode: selectedOffer.advance_mode,
        advance_value: selectedOffer.advance_value,
        calc_mode: selectedOffer.calc_mode,
        monthly_amount: selectedOffer.monthly_amount,
        months: selectedOffer.months,
      })
      totalPrice = perPieceCalc.basePrice * pieces.length
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
        // Manual price path: advance and monthly are derived per piece × number of pieces
        const advancePerPiece = selectedOffer.advance_mode === 'fixed'
          ? selectedOffer.advance_value
          : (totalPrice / pieces.length) * (selectedOffer.advance_value / 100)
        advanceAmount = advancePerPiece * pieces.length
        advanceAfterDeposit = Math.max(0, advanceAmount - deposit)
        remainingForInstallments = totalPrice - Math.max(advanceAmount, deposit)
        const monthlyPerPiece = selectedOffer.monthly_amount || 0
        finalMonthlyPayment = monthlyPerPiece * pieces.length
        finalNumberOfMonths = finalMonthlyPayment > 0 ? Math.ceil(remainingForInstallments / finalMonthlyPayment) : 0
        if (selectedOffer.calc_mode === 'months' && (selectedOffer.months || 0) > 0) {
          finalNumberOfMonths = selectedOffer.months!
          finalMonthlyPayment = finalNumberOfMonths > 0 ? remainingForInstallments / finalNumberOfMonths : 0
        }
      } else {
        // Normal: offer is per piece — تسبقة and مبلغ شهري are per piece, so multiply by n
        const surfacePerPiece = totalSurface / pieces.length
        const perPieceCalc = calculateInstallment(surfacePerPiece, {
          price_per_m2_installment: selectedOffer.price_per_m2_installment,
          advance_mode: selectedOffer.advance_mode,
          advance_value: selectedOffer.advance_value,
          calc_mode: selectedOffer.calc_mode,
          monthly_amount: selectedOffer.monthly_amount,
          months: selectedOffer.months,
        })
        advanceAmount = perPieceCalc.advanceAmount * pieces.length
        advanceAfterDeposit = Math.max(0, advanceAmount - deposit)
        remainingForInstallments = totalPrice - Math.max(advanceAmount, deposit)
        finalMonthlyPayment = perPieceCalc.monthlyPayment * pieces.length
        if (selectedOffer.calc_mode === 'months' && (selectedOffer.months || 0) > 0) {
          finalNumberOfMonths = selectedOffer.months!
          finalMonthlyPayment = finalNumberOfMonths > 0 ? remainingForInstallments / finalNumberOfMonths : 0
        } else {
          finalNumberOfMonths = finalMonthlyPayment > 0 ? Math.ceil(remainingForInstallments / finalMonthlyPayment) : 0
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
  }, [pieces, batchPricePerM2, depositAmount, saleType, selectedOfferId, paymentOffers, useFixedPrice, fixedPriceByPieceId])

  // Reset form when dialog opens; pre-fill per-piece price suggestions from
  // direct_full_payment_price or batch rate × surface (user can override).
  useEffect(() => {
    if (open) {
      setDepositAmount('')
      setNotes('')
      setSaleType('full')
      setSelectedOfferId('')
      setError(null)
      setFixedPriceByPieceId(buildPriceSuggestionMap(pieces, batchPricePerM2))
      // Default the deadline to a week from today so the user has time to
      // complete the procedures. They can always pick a different date.
      const defaultDeadline = new Date()
      defaultDeadline.setDate(defaultDeadline.getDate() + 7)
      // Build YYYY-MM-DD in local time (avoid UTC drift from toISOString)
      const yyyy = defaultDeadline.getFullYear()
      const mm = String(defaultDeadline.getMonth() + 1).padStart(2, '0')
      const dd = String(defaultDeadline.getDate()).padStart(2, '0')
      setDeadlineDate(`${yyyy}-${mm}-${dd}`)
    }
    // Intentionally only depends on `open`: re-running on every pieces/rate
    // change would also clobber depositAmount/notes/etc. New pieces added
    // mid-dialog are handled by the separate sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // When pieces change while the dialog is open (e.g. user clicks "إضافة قطعة"),
  // fill in a suggested price for any new piece without overwriting existing entries.
  useEffect(() => {
    if (!open) return
    setFixedPriceByPieceId((prev) => {
      let changed = false
      const next = { ...prev }
      for (const p of pieces) {
        if (next[p.id] === undefined) {
          next[p.id] = suggestPiecePrice(p, batchPricePerM2)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pieces, batchPricePerM2, open])

  // After defaults are set on open, restore any saved draft on top — so a
  // user who lost connection mid-form picks up exactly where they left off.
  useEffect(() => {
    if (!open) return
    const saved = draft.read()
    if (!saved) return
    if (saved.depositAmount) setDepositAmount(saved.depositAmount)
    if (saved.deadlineDate) setDeadlineDate(saved.deadlineDate)
    if (saved.saleType) setSaleType(saved.saleType)
    if (saved.selectedOfferId) setSelectedOfferId(saved.selectedOfferId)
    if (saved.notes) setNotes(saved.notes)
    if (saved.fixedPriceByPieceId) {
      setFixedPriceByPieceId((current) => ({ ...current, ...saved.fixedPriceByPieceId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Continuously persist the form to localStorage so a connection drop or
  // accidental close doesn't lose what the user typed. Cleared on success.
  useEffect(() => {
    if (!open) return
    draft.write({
      depositAmount,
      deadlineDate,
      saleType,
      selectedOfferId,
      notes,
      fixedPriceByPieceId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, depositAmount, deadlineDate, saleType, selectedOfferId, notes, fixedPriceByPieceId])

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

    if (useFixedPrice) {
      const missing = pieces.some((p) => {
        const v = parseFloat(fixedPriceByPieceId[p.id] || '0')
        return isNaN(v) || v <= 0
      })
      if (missing || calculations.totalPrice <= 0) {
        setError('يرجى إدخال سعراً صحيحاً لكل قطعة')
        return
      }
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
      const selectedOffer = paymentOffers.find((o) => o.id === selectedOfferId)
      await onConfirm({
        client,
        depositAmount: calculations.deposit,
        deadlineDate,
        saleType,
        paymentOfferId: saleType === 'installment' && selectedOfferId ? selectedOfferId : undefined,
        installmentPricePerM2: saleType === 'installment' && selectedOffer ? selectedOffer.price_per_m2_installment : undefined,
        notes: notes.trim() || undefined,
        fixedPricesPerPiece: useFixedPrice && calculations.totalPrice > 0
          ? pieces.map((p) => parseFloat(fixedPriceByPieceId[p.id] || '0'))
          : undefined,
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
    // Clear the draft now that the sale was saved successfully — we don't
    // want stale form data popping up the next time the user opens the
    // dialog for the same pieces. (Failed saves keep the draft so the user
    // can retry without losing input.)
    draft.clear()
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
      // Block backdrop-click and Escape from closing while the user is typing
      // a sale. Losing the form mid-entry was a real complaint — close only
      // happens via the explicit X / إلغاء / تأكيد buttons. A draft is also
      // saved to localStorage on every keystroke (see useEffect with draft.write)
      // so even a hard reload preserves what they typed.
      disableDismiss
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
          <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">القطع المختارة ({pieces.length})</h3>
            {onRequestAddPiece && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRequestAddPiece}
                className="text-xs sm:text-sm flex-shrink-0"
              >
                إضافة قطعة
              </Button>
            )}
          </div>
          <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-56 lg:max-h-64 overflow-y-auto scrollbar-thin">
            {pieces.map((piece, idx) => {
              const piecePrice = useFixedPrice
                ? parseFloat(fixedPriceByPieceId[piece.id] || '0') || 0
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`mp-price-${piece.id}`} className="text-xs sm:text-sm font-medium whitespace-nowrap">السعر (د.ت) *</Label>
                      <Input
                        id={`mp-price-${piece.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={fixedPriceByPieceId[piece.id] ?? ''}
                        onChange={(e) => setFixedPriceByPieceId((prev) => ({ ...prev, [piece.id]: e.target.value }))}
                        placeholder="0.00"
                        size="sm"
                        className="text-xs sm:text-sm w-24 sm:w-28"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Badge variant="default" size="sm" className="text-xs">#{idx + 1}</Badge>
                          <span className="text-xs sm:text-sm font-medium truncate">القطعة {piece.piece_number}</span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                          المساحة: {piece.surface_m2.toLocaleString()} م²{piecePrice > 0 ? ` · السعر: ${formatPrice(piecePrice)} DT` : ''}
                        </div>
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
            <Label htmlFor="mp-deposit" className="text-xs sm:text-sm">مبلغ العربون (DT) *</Label>
            <Input
              id="mp-deposit"
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
            <Label htmlFor="mp-sale-type" className="text-xs sm:text-sm">نوع البيع *</Label>
            <select
              id="mp-sale-type"
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

          {/* Installment Offers Selection — 2-col grid, no scroll cap so all
              offers stay visible at once. The previous version capped height
              at 192px and forced scroll, which hid offers behind the fold. */}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                  {paymentOffers.map((offer) => {
                    const isSelected = selectedOfferId === offer.id
                    return (
                      <button
                        key={offer.id}
                        type="button"
                        onClick={() => setSelectedOfferId(offer.id)}
                        aria-pressed={isSelected}
                        className={`relative text-start p-2 sm:p-2.5 rounded-lg border-2 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
                            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        {/* Selection check — replaces the radio for a cleaner card look */}
                        {isSelected && (
                          <div className="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m5 12 5 5L20 7" />
                            </svg>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1 pe-6">
                          <span className="text-[12.5px] sm:text-sm font-bold text-gray-900 truncate">{offer.name || 'عرض بدون اسم'}</span>
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {offer.price_per_m2_installment.toLocaleString()} د/م²
                          </span>
                        </div>
                        <div className="text-[11px] sm:text-xs text-gray-600 space-y-0.5 tabular-nums">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">تسبقة:</span>
                            <span className="font-semibold text-gray-800">
                              {offer.advance_value.toLocaleString()}{' '}{offer.advance_mode === 'percent' ? '%' : 'دت'}
                            </span>
                          </div>
                          {offer.calc_mode === 'monthlyAmount' ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">شهري:</span>
                              <span className="font-semibold text-gray-800">{offer.monthly_amount?.toLocaleString() || 0} دت</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">أشهر:</span>
                              <span className="font-semibold text-gray-800">{offer.months || 0}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="mp-deadline" className="text-xs sm:text-sm">تاريخ آخر أجل لإتمام الإجراءات *</Label>
            <Input
              id="mp-deadline"
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="mp-notes" className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
              id="mp-notes"
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

