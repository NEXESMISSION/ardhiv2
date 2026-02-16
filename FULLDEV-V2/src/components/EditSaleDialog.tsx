import { useState, useEffect, useMemo, useRef } from 'react'
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
import { useLanguage } from '@/i18n/context'

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
  isOwner?: boolean
}

const replaceVars = (str: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)

export function EditSaleDialog({ open, onClose, sale, onSave, isOwner = true }: EditSaleDialogProps) {
  const { t } = useLanguage()
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
  const [loadingSale, setLoadingSale] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add new offer (inline in edit sale dialog)
  const [showAddOffer, setShowAddOffer] = useState(false)
  const [savingNewOffer, setSavingNewOffer] = useState(false)
  const [addOfferError, setAddOfferError] = useState<string | null>(null)
  const [newOfferName, setNewOfferName] = useState('')
  const [newOfferPricePerM2, setNewOfferPricePerM2] = useState('')
  const [newOfferAdvanceMode, setNewOfferAdvanceMode] = useState<'fixed' | 'percent'>('fixed')
  const [newOfferAdvanceValue, setNewOfferAdvanceValue] = useState('')
  const [newOfferCalcMode, setNewOfferCalcMode] = useState<'monthlyAmount' | 'months'>('monthlyAmount')
  const [newOfferMonthlyAmount, setNewOfferMonthlyAmount] = useState('')
  const [newOfferMonths, setNewOfferMonths] = useState('')

  // Track when dialog opens and which sale we inited from
  const prevOpenRef = useRef(false)
  const initialOfferRef = useRef<{ method: string; offerId: string } | null>(null)
  const skipNextAutoUpdateRef = useRef(false)
  const initedSaleIdRef = useRef<string | null>(null)

  // Fetch sale by id when dialog opens so we always show actual DB values (fixes stale list data)
  useEffect(() => {
    if (!open || !sale?.id) return
    let cancelled = false
    setLoadingSale(true)
    const saleId = typeof sale.id === 'string' ? sale.id : String(sale.id)
    supabase
      .from('sales')
      .select('sale_price, deposit_amount, payment_method, payment_offer_id, deadline_date, notes, partial_payment_amount, remaining_payment_amount')
      .eq('id', saleId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return
        setLoadingSale(false)
        if (err || !data) return
        setSalePrice(Number(data.sale_price).toString())
        setDepositAmount(Number(data.deposit_amount).toString())
        setPaymentMethod((data.payment_method as 'full' | 'installment' | 'promise') || 'full')
        setPaymentOfferId(data.payment_offer_id || '')
        setDeadlineDate(data.deadline_date || '')
        setNotes(data.notes || '')
        setPartialPaymentAmount(data.partial_payment_amount != null ? String(data.partial_payment_amount) : '')
        setRemainingPaymentAmount(data.remaining_payment_amount != null ? String(data.remaining_payment_amount) : '')
      })
    return () => { cancelled = true }
  }, [open, sale?.id])

  // Initialize form when dialog opens OR when sale.id changes (client data for piece/batch/offer; price comes from fetch above)
  useEffect(() => {
    if (open && sale) {
      const justOpened = !prevOpenRef.current
      prevOpenRef.current = true
      const saleIdChanged = initedSaleIdRef.current !== sale.id
      if (justOpened || saleIdChanged) {
        initedSaleIdRef.current = sale.id
        // Set from prop only as fallback before fetch; fetch above will overwrite with DB values
        setSalePrice(sale.sale_price.toString())
        setDepositAmount(sale.deposit_amount.toString())
        setPaymentMethod(sale.payment_method || 'full')
        setPaymentOfferId(sale.payment_offer_id || '')
        setDeadlineDate(sale.deadline_date || '')
        setNotes(sale.notes || '')
        setPartialPaymentAmount(sale.partial_payment_amount?.toString() || '')
        setRemainingPaymentAmount(sale.remaining_payment_amount?.toString() || '')
        setError(null)
        initialOfferRef.current = {
          method: sale.payment_method || 'full',
          offerId: sale.payment_offer_id || '',
        }
        skipNextAutoUpdateRef.current = true
        if (sale.payment_method === 'installment' && sale.batch_id) {
          loadPaymentOffers(sale.batch_id)
        }
      }
    } else {
      prevOpenRef.current = false
      initialOfferRef.current = null
      initedSaleIdRef.current = null
      setShowAddOffer(false)
      setAddOfferError(null)
    }
  }, [open, sale])

  async function loadPaymentOffers(batchId: string): Promise<PaymentOffer[]> {
    setLoadingOffers(true)
    try {
      const { data, error: err } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('batch_id', batchId)
        .is('land_piece_id', null)
        .order('created_at', { ascending: false })

      if (err) throw err
      const list = (data || []) as PaymentOffer[]
      setPaymentOffers(list)

      // Auto-select the current offer if available
      if (sale.payment_offer_id && list.some(o => o?.id === sale.payment_offer_id)) {
        setPaymentOfferId(sale.payment_offer_id)
      } else if (list.length > 0 && !paymentOfferId) {
        setPaymentOfferId(list[0].id)
      }
      return list
    } catch (e: any) {
      console.error('Error loading payment offers:', e)
      return []
    } finally {
      setLoadingOffers(false)
    }
  }

  function resetAddOfferForm() {
    setShowAddOffer(false)
    setAddOfferError(null)
    setNewOfferName('')
    setNewOfferPricePerM2('')
    setNewOfferAdvanceMode('fixed')
    setNewOfferAdvanceValue('')
    setNewOfferCalcMode('monthlyAmount')
    setNewOfferMonthlyAmount('')
    setNewOfferMonths('')
  }

  async function handleAddNewOffer() {
    if (!sale.batch_id) {
      setAddOfferError(t('editSale.noBatchForSale'))
      return
    }
    const pricePerM2 = parseFloat(newOfferPricePerM2)
    if (isNaN(pricePerM2) || pricePerM2 <= 0) {
      setAddOfferError(t('editSale.errorPricePerM2'))
      return
    }
    const advanceVal = parseFloat(newOfferAdvanceValue)
    if (isNaN(advanceVal) || advanceVal < 0) {
      setAddOfferError(t('editSale.errorAdvanceValue'))
      return
    }
    if (newOfferCalcMode === 'monthlyAmount') {
      const m = parseFloat(newOfferMonthlyAmount)
      if (isNaN(m) || m <= 0) {
        setAddOfferError(t('editSale.errorMonthlyAmount'))
        return
      }
    } else {
      const m = parseInt(newOfferMonths, 10)
      if (isNaN(m) || m <= 0) {
        setAddOfferError(t('editSale.errorMonths'))
        return
      }
    }
    setSavingNewOffer(true)
    setAddOfferError(null)
    try {
      const payload = {
        batch_id: sale.batch_id,
        name: newOfferName.trim() || null,
        price_per_m2_installment: pricePerM2,
        advance_mode: newOfferAdvanceMode,
        advance_value: advanceVal,
        calc_mode: newOfferCalcMode,
        monthly_amount: newOfferCalcMode === 'monthlyAmount' ? parseFloat(newOfferMonthlyAmount) : null,
        months: newOfferCalcMode === 'months' ? parseInt(newOfferMonths, 10) : null,
      }
      const { data: inserted, error: err } = await supabase
        .from('payment_offers')
        .insert(payload)
        .select('id, name, price_per_m2_installment, advance_mode, advance_value, calc_mode, monthly_amount, months')
        .single()
      if (err) throw err
      if (!inserted?.id) {
        // Insert may succeed but RLS can block .select() - reload offers from server
        if (sale.batch_id) {
          const list = await loadPaymentOffers(sale.batch_id)
          const firstId = list[0]?.id
          if (firstId) setPaymentOfferId(firstId)
        }
        resetAddOfferForm()
        return
      }
      const newOffer = inserted as PaymentOffer
      setPaymentOffers((prev) => [newOffer, ...prev.filter(Boolean)])
      setPaymentOfferId(newOffer.id)
      resetAddOfferForm()
    } catch (e: any) {
      setAddOfferError(e.message || t('editSale.addOfferFailed'))
    } finally {
      setSavingNewOffer(false)
    }
  }

  // Load offers when payment method changes to installment
  useEffect(() => {
    if (open && paymentMethod === 'installment' && sale.batch_id && paymentOffers.length === 0) {
      loadPaymentOffers(sale.batch_id)
    }
  }, [paymentMethod, open, sale.batch_id])

  // Calculate installment details for preview. Uses form sale price as total when set (custom price), otherwise offer-based total.
  const installmentPreview = useMemo(() => {
    if (paymentMethod !== 'installment' || !sale?.piece) return null
    if (!paymentOfferId) return null

    const selectedOffer = paymentOffers.find(o => o != null && o.id === paymentOfferId)
    if (!selectedOffer) return null

    const deposit = parseFloat(depositAmount) || 0
    const formPrice = parseFloat(salePrice)
    const useCustomTotal = !isNaN(formPrice) && formPrice > 0

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

    // When user entered a custom sale price, use it as total and recalc advance/remaining from it
    let totalPrice = calc.basePrice
    let advanceAmount = calc.advanceAmount
    let advanceAfterDeposit = calc.advanceAfterDeposit
    let remainingForInstallments = calc.remainingForInstallments
    let monthlyPayment = calc.recalculatedMonthlyPayment
    let numberOfMonths = calc.recalculatedNumberOfMonths

    if (useCustomTotal) {
      totalPrice = formPrice
      advanceAmount = selectedOffer.advance_mode === 'fixed'
        ? selectedOffer.advance_value
        : (formPrice * selectedOffer.advance_value) / 100
      advanceAfterDeposit = Math.max(0, advanceAmount - deposit)
      remainingForInstallments = formPrice - Math.max(advanceAmount, deposit)
      if (selectedOffer.calc_mode === 'months' && (selectedOffer.months || 0) > 0) {
        numberOfMonths = selectedOffer.months!
        monthlyPayment = remainingForInstallments / numberOfMonths
      } else if (selectedOffer.calc_mode === 'monthlyAmount' && (selectedOffer.monthly_amount || 0) > 0) {
        monthlyPayment = selectedOffer.monthly_amount!
        numberOfMonths = Math.ceil(remainingForInstallments / monthlyPayment)
      }
    }

    return {
      basePrice: calc.basePrice,
      totalPrice,
      advanceAmount,
      advanceAfterDeposit,
      remainingForInstallments,
      monthlyPayment,
      numberOfMonths,
    }
  }, [paymentMethod, paymentOfferId, depositAmount, salePrice, sale?.piece, paymentOffers])

  async function handleSave() {
    setError(null)

    // Validation
    const price = parseFloat(salePrice)
    const deposit = parseFloat(depositAmount)

    if (isNaN(price) || price <= 0) {
      setError(t('editSale.errorPrice'))
      return
    }

    if (isNaN(deposit) || deposit < 0) {
      setError(t('editSale.errorDeposit'))
      return
    }

    if (deposit > price) {
      setError(t('editSale.errorDepositExceeds'))
      return
    }

    if (!deadlineDate) {
      setError(t('editSale.errorDeadline'))
      return
    }

    if (paymentMethod === 'installment' && !paymentOfferId) {
      setError(t('editSale.errorOffer'))
      return
    }

    if (paymentMethod === 'promise') {
      const partial = parseFloat(partialPaymentAmount) || 0
      const remaining = parseFloat(remainingPaymentAmount) || 0
      
      if (partial < 0 || remaining < 0) {
        setError(t('editSale.errorPartial'))
        return
      }
      
      if (Math.abs(partial + remaining - (price - deposit)) > 0.01) {
        setError(replaceVars(t('editSale.errorPartialMismatch'), { amount: formatPrice(price - deposit) }))
        return
      }
    }

    setSaving(true)
    try {
      // Use the price from the form (user may have edited it - including fixed/custom price)
      const finalPrice = price

      const updateData: any = {
        sale_price: finalPrice,
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
        throw new Error(t('editSale.invalidSaleId'))
      }

      // First verify the sale exists and is pending
      const { data: existingSale, error: checkError } = await supabase
        .from('sales')
        .select('id, status')
        .eq('id', saleId)
        .single()

      if (checkError || !existingSale) {
        throw new Error(t('editSale.saleNotFound'))
      }

      if (existingSale.status !== 'pending') {
        throw new Error(replaceVars(t('editSale.errorCannotUpdateStatus'), { status: existingSale.status }))
      }

      // Update by ID (status already verified)
      const { data: updatedRows, error: updateError } = await supabase
        .from('sales')
        .update(updateData)
        .eq('id', saleId)
        .select('id')

      if (updateError) {
        console.error('Error updating sale:', updateError)
        throw updateError
      }

      if (!updatedRows || updatedRows.length === 0) {
        // Retry without .select() - sometimes UPDATE succeeds but RETURN is blocked by SELECT RLS
        const { error: updateOnlyError } = await supabase
          .from('sales')
          .update(updateData)
          .eq('id', saleId)

        if (updateOnlyError) {
          console.error('Error updating sale (retry):', updateOnlyError)
          throw new Error(t('editSale.permissionError'))
        }
      }

      // Verify the update actually persisted (RLS can make UPDATE "succeed" but affect 0 rows)
      const { data: verifyRow, error: verifyError } = await supabase
        .from('sales')
        .select('sale_price')
        .eq('id', saleId)
        .single()

      if (verifyError || !verifyRow) {
        throw new Error(t('editSale.permissionError'))
      }

      const savedPrice = Number(verifyRow.sale_price)
      if (Math.abs(savedPrice - finalPrice) > 0.01) {
        throw new Error(t('editSale.permissionError'))
      }

      onSave()
      onClose()
    } catch (e: any) {
      console.error('Error updating sale:', e)
      setError(e.message || t('editSale.updateError'))
    } finally {
      setSaving(false)
    }
  }

  // Auto-update sale_price only when user switches to "full" (cash) - use batch cash price.
  // For installment we never overwrite: keep sale's actual price (may be custom/fixed).
  useEffect(() => {
    if (!open || !initialOfferRef.current || !sale.piece) return
    if (skipNextAutoUpdateRef.current) {
      skipNextAutoUpdateRef.current = false
      return
    }
    const init = initialOfferRef.current
    const userChangedOffer = paymentOfferId !== init.offerId || paymentMethod !== init.method
    if (!userChangedOffer) return
    if (paymentMethod === 'full' && sale.batch?.price_per_m2_cash) {
      const cashPrice = sale.piece.surface_m2 * sale.batch.price_per_m2_cash
      setSalePrice(cashPrice.toFixed(2))
    }
    // For installment: do NOT overwrite sale_price so custom/fixed price is preserved
  }, [paymentMethod, paymentOfferId, sale.piece, sale.batch, open])

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
      title={t('editSale.title')}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving || loadingSale}>
            {t('editSale.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingSale}>
            {saving ? t('editSale.saving') : loadingSale ? t('editSale.loadingDetails') : `💾 ${t('editSale.saveChanges')}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {loadingSale && (
          <p className="text-xs sm:text-sm text-gray-500">{t('editSale.loadingSale')}</p>
        )}
        {error && <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>}

        {/* Sale Info */}
        <Card className="p-3 bg-blue-50 border-blue-200">
          <h3 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">{t('editSale.saleInfoTitle')}</h3>
          <div className="space-y-1 text-xs sm:text-sm">
            <p><span className="font-medium">{t('editSale.clientLabel')}:</span> {sale.client?.name || t('shared.unknown')}</p>
            <p><span className="font-medium">{t('editSale.pieceLabel')}:</span> {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'}</p>
            <p><span className="font-medium">{t('editSale.surfaceLabel')}:</span> {sale.piece?.surface_m2.toLocaleString('en-US')} م²</p>
          </div>
        </Card>

        {/* Sale Price */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">
            {t('editSale.salePriceLabel')} <span className="text-gray-500 text-xs">({t('editSale.salePriceHint')})</span>
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
            {t('editSale.depositLabel')} <span className="text-gray-500 text-xs">({t('editSale.depositHint')})</span>
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
              {t('editSale.remainingAfterDeposit')}: {formatPrice((parseFloat(salePrice) || 0) - (parseFloat(depositAmount) || 0))} DT
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">{t('editSale.saleTypeLabel')}</Label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'full' | 'installment' | 'promise')}
            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
          >
            <option value="full">{t('editSale.paymentFull')}</option>
            <option value="installment">{t('editSale.paymentInstallment')}</option>
            <option value="promise">{t('editSale.paymentPromise')}</option>
          </select>
        </div>

        {/* Installment Offer Selection */}
        {paymentMethod === 'installment' && (
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">{t('editSale.installmentOfferLabel')}</Label>
            {loadingOffers ? (
              <p className="text-xs sm:text-sm text-gray-500">{t('editSale.loadingOffers')}</p>
            ) : paymentOffers.length === 0 && !showAddOffer ? (
              isOwner ? (
                <Alert variant="error" className="text-xs sm:text-sm">{t('editSale.noOffers')}</Alert>
              ) : (
                <Alert variant="error" className="text-xs sm:text-sm">{t('editSale.noOffers').split('.')[0]}.</Alert>
              )
            ) : !showAddOffer ? (
              <select
                value={paymentOfferId}
                onChange={(e) => setPaymentOfferId(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
              >
                <option value="">{t('editSale.chooseOfferPlaceholder')}</option>
                {paymentOffers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name || t('editSale.offerNoName')} - {offer.price_per_m2_installment.toLocaleString()} د/م²
                  </option>
                ))}
              </select>
            ) : null}
            {paymentMethod === 'installment' && sale.batch_id && isOwner && (
              <>
                {!showAddOffer ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAddOffer(true)}
                    className="text-xs sm:text-sm"
                  >
                    + {t('editSale.addOffer')}
                  </Button>
                ) : (
                  <Card className="p-3 bg-blue-50 border-blue-200 space-y-3">
                    <h4 className="text-xs sm:text-sm font-semibold text-blue-900">{t('editSale.addOfferTitle')}</h4>
                    {addOfferError && (
                      <Alert variant="error" className="text-xs sm:text-sm">{addOfferError}</Alert>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('editSale.offerNameLabelShort')}</Label>
                        <Input
                          value={newOfferName}
                          onChange={(e) => setNewOfferName(e.target.value)}
                          placeholder={t('editSale.offerNamePlaceholder')}
                          size="sm"
                          className="text-xs sm:text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('editSale.pricePerM2Label')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newOfferPricePerM2}
                          onChange={(e) => setNewOfferPricePerM2(e.target.value)}
                          placeholder="15"
                          size="sm"
                          className="text-xs sm:text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('editSale.advanceTypeLabel')}</Label>
                        <select
                          value={newOfferAdvanceMode}
                          onChange={(e) => setNewOfferAdvanceMode(e.target.value as 'fixed' | 'percent')}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs sm:text-sm"
                        >
<option value="fixed">{t('editSale.advanceFixed')}</option>
                        <option value="percent">{t('editSale.advancePercent')}</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('editSale.advanceValueLabel')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step={newOfferAdvanceMode === 'percent' ? '1' : '0.01'}
                          value={newOfferAdvanceValue}
                          onChange={(e) => setNewOfferAdvanceValue(e.target.value)}
                          placeholder={newOfferAdvanceMode === 'percent' ? '10' : '500'}
                          size="sm"
                          className="text-xs sm:text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">{t('editSale.calcMethodLabel')}</Label>
                      <select
                        value={newOfferCalcMode}
                        onChange={(e) => setNewOfferCalcMode(e.target.value as 'monthlyAmount' | 'months')}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs sm:text-sm"
                      >
                        <option value="monthlyAmount">{t('editSale.calcMonthly')}</option>
                        <option value="months">{t('editSale.calcMonths')}</option>
                      </select>
                      {newOfferCalcMode === 'monthlyAmount' ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newOfferMonthlyAmount}
                          onChange={(e) => setNewOfferMonthlyAmount(e.target.value)}
                          placeholder="70"
                          size="sm"
                          className="text-xs sm:text-sm"
                        />
                      ) : (
                        <Input
                          type="number"
                          min="1"
                          value={newOfferMonths}
                          onChange={(e) => setNewOfferMonths(e.target.value)}
                          placeholder="96"
                          size="sm"
                          className="text-xs sm:text-sm"
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddNewOffer}
                        disabled={savingNewOffer}
                        className="text-xs sm:text-sm"
                      >
                        {savingNewOffer ? t('editSale.addingOffer') : t('editSale.addOfferBtn')}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={resetAddOfferForm}
                        disabled={savingNewOffer}
                        className="text-xs sm:text-sm"
                      >
                        {t('editSale.cancel')}
                      </Button>
                    </div>
                  </Card>
                )}
              </>
            )}
            
            {/* Installment Preview */}
            {installmentPreview && sale.piece && (
              <Card className="p-3 bg-green-50 border-green-200 mt-2">
                <h4 className="text-xs sm:text-sm font-semibold text-green-900 mb-2">{t('editSale.previewTitle')}</h4>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span>{t('editSale.totalPriceLabel')}:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.totalPrice)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('editSale.advanceLabel')}:</span>
                    <span className="font-semibold text-orange-600">{formatPrice(installmentPreview.advanceAmount)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('finance.deposit')}:</span>
                    <span className="font-semibold text-blue-600">{formatPrice(parseFloat(depositAmount) || 0)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('editSale.remainingAfterAdvance')}:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.advanceAfterDeposit)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('editSale.remainingInstallments')}:</span>
                    <span className="font-semibold text-purple-600">{formatPrice(installmentPreview.remainingForInstallments)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('editSale.monthlyAmountLabel')}:</span>
                    <span className="font-semibold">{formatPrice(installmentPreview.monthlyPayment)} DT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('editSale.monthsCountLabel')}:</span>
                    <span className="font-semibold">{installmentPreview.numberOfMonths} {t('editSale.monthWord')}</span>
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
              <h4 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">{t('editSale.promiseDetailsTitle')}</h4>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">{t('editSale.amountReceivedLabel')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={partialPaymentAmount}
                    onChange={(e) => setPartialPaymentAmount(e.target.value)}
                    size="sm"
                    className="text-xs sm:text-sm"
                  />
                  <p className="text-xs text-gray-500">{t('editSale.partialReceivedHint')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm">{t('editSale.amountRemainingLabel')}</Label>
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
                    {t('editSale.remainingAutoUpdate')}: {t('finance.price')} ({formatPrice(parseFloat(salePrice) || 0)}) - {t('finance.deposit')} ({formatPrice(parseFloat(depositAmount) || 0)}) - {t('editSale.receivedLabel')} ({formatPrice(parseFloat(partialPaymentAmount) || 0)}) = {formatPrice(parseFloat(remainingPaymentAmount) || 0)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Deadline Date */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm">{t('editSale.deadlineLabel')}</Label>
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
          <Label className="text-xs sm:text-sm">{t('editSale.notesLabel')}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('editSale.notesPlaceholder')}
            rows={3}
            size="sm"
            className="text-xs sm:text-sm"
          />
        </div>
      </div>
    </Dialog>
  )
}

