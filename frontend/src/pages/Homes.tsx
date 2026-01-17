import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sanitizeText, sanitizeNotes, sanitizeCIN, sanitizePhone } from '@/lib/sanitize'
import { showNotification } from '@/components/ui/notification'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { validatePermissionServerSide } from '@/lib/permissionValidation'
import { Plus, Edit, Trash2, ShoppingCart, X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import type { House, LandStatus, Client, PaymentOffer } from '@/types/database'

const statusColors: Record<LandStatus, 'success' | 'warning' | 'default' | 'secondary'> = {
  Available: 'success',
  Reserved: 'warning',
  Sold: 'default',
  Cancelled: 'secondary',
}

export function Homes() {
  const { hasPermission, user, profile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [houseToDelete, setHouseToDelete] = useState<string | null>(null)
  
  // House dialog
  const [houseDialogOpen, setHouseDialogOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [houseForm, setHouseForm] = useState({
    name: '',
    place: '',
    surface: '',
    price_full: '',
    price_installment: '',
    company_fee_percentage: '',
    notes: '',
  })
  
  // Payment offer form for installment price calculation
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [houseOffers, setHouseOffers] = useState<PaymentOffer[]>([]) // List of offers for the current house
  const [editingOffer, setEditingOffer] = useState<PaymentOffer | null>(null) // Currently editing offer
  const [offerDialogOpen, setOfferDialogOpen] = useState(false) // Separate dialog for offer editing
  const [offerForm, setOfferForm] = useState({
    company_fee_percentage: '',
    advance_amount: '',
    advance_is_percentage: false,
    monthly_payment: '',
    number_of_months: '',
    calculation_method: 'monthly' as 'monthly' | 'months',
    offer_name: '',
    notes: '',
    is_default: false,
  })

  // Sale dialog
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null)
  const [saleDialogOpen, setSaleDialogOpen] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [newClient, setNewClient] = useState<Client | null>(null)
  const [clientForm, setClientForm] = useState({
    name: '',
    cin: '',
    phone: '',
    email: '',
    address: '',
    client_type: 'Individual',
    notes: '',
  })
  const [saleForm, setSaleForm] = useState({
    payment_type: 'Full' as 'Full' | 'Installment' | 'PromiseOfSale',
    reservation_amount: '',
    deadline_date: '',
    selected_offer_id: '',
    promise_initial_payment: '',
  })
  const [availableOffers, setAvailableOffers] = useState<PaymentOffer[]>([])
  const [selectedOffer, setSelectedOffer] = useState<PaymentOffer | null>(null)
  const [savingClient, setSavingClient] = useState(false)
  const [creatingSale, setCreatingSale] = useState(false)
  const [searchingClient, setSearchingClient] = useState(false)
  const [foundClient, setFoundClient] = useState<Client | null>(null)
  const [clientSearchStatus, setClientSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')

  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // Debounced CIN search for client dialog
  const debouncedCINSearch = useCallback(
    debounce(async (cin: string) => {
      if (!cin || cin.trim().length < 2) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      const sanitizedCIN = sanitizeCIN(cin)
      if (!sanitizedCIN || sanitizedCIN.length < 2) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      setSearchingClient(true)
      setClientSearchStatus('searching')
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('cin', sanitizedCIN)
          .maybeSingle()

        if (!error && data) {
          setFoundClient(data)
          setClientSearchStatus('found')
          // Auto-fill form with found client data
          setClientForm({
            name: data.name,
            cin: data.cin,
            phone: data.phone || '',
            email: data.email || '',
            address: data.address || '',
            client_type: data.client_type,
            notes: data.notes || '',
          })
          setNewClient(data) // Set as selected client
        } else {
          setFoundClient(null)
          if (sanitizedCIN.length >= 4) {
            setClientSearchStatus('not_found')
          } else {
            setClientSearchStatus('idle')
          }
        }
      } catch (error) {
        setFoundClient(null)
        if (sanitizedCIN.length >= 4) {
          setClientSearchStatus('not_found')
        } else {
          setClientSearchStatus('idle')
        }
      } finally {
        setSearchingClient(false)
      }
    }, 400),
    []
  )

  useEffect(() => {
    if (searchTerm !== debouncedSearchTerm) {
      debouncedSearchFn(searchTerm)
    }
  }, [searchTerm, debouncedSearchTerm, debouncedSearchFn])

  useEffect(() => {
    fetchHouses()
  }, [])

  // Auto-select offer when sale dialog opens and payment type is Installment
  useEffect(() => {
    if (saleDialogOpen && saleForm.payment_type === 'Installment' && availableOffers.length > 0 && !selectedOffer) {
      const defaultOffer = availableOffers.find(o => o.is_default) || availableOffers[0]
      if (defaultOffer) {
        setSelectedOffer(defaultOffer)
        setSaleForm(prev => ({ ...prev, selected_offer_id: defaultOffer.id }))
      }
    }
  }, [saleDialogOpen, saleForm.payment_type, availableOffers, selectedOffer])

  const fetchHouses = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('houses')
        .select(`
          *,
          payment_offers!payment_offers_house_id_fkey(*)
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(t('homes.errorLoadingData'))
        if (fetchError.code === '42P01') {
          setError(t('homes.tableNotFound'))
        } else {
          setError(fetchError.message)
        }
        return
      }

      const housesData = (data as any[]) || []
      setHouses(housesData.map(house => ({
        ...house,
        payment_offers: house.payment_offers || []
      })) as House[])
    } catch (err) {
      setError(t('homes.errorLoadingHouses'))
    } finally {
      setLoading(false)
    }
  }

  // Calculate installment price from offer details
  const calculateInstallmentPrice = useCallback(() => {
    if (!houseForm.price_installment || !showOfferForm) return
    
    // Use the manually set installment price as the base
    const installmentPrice = parseFloat(houseForm.price_installment)
    if (isNaN(installmentPrice) || installmentPrice <= 0) return
    
    const priceFull = houseForm.price_full ? parseFloat(houseForm.price_full) : 0
    
    // Use functional update to get latest form state and avoid stale closures
    setOfferForm(prev => {
      // Calculate advance amount (for display and calculation of remaining amount)
      const advanceAmount = prev.advance_amount 
        ? (prev.advance_is_percentage 
            ? (priceFull * parseFloat(prev.advance_amount)) / 100
            : parseFloat(prev.advance_amount))
        : 0
      
      // Remaining amount for installments = Installment price - Advance
      // This is what will be paid in monthly installments
      const remainingForInstallments = installmentPrice - advanceAmount
      
      // Removed excessive logging - only log when calculation method is set
      if (prev.calculation_method) {
        console.log('[calculateInstallmentPrice] Calculation:', {
          installmentPrice,
          advanceAmount,
          remainingForInstallments,
          calculationMethod: prev.calculation_method,
          monthlyPayment: prev.monthly_payment,
          numberOfMonths: prev.number_of_months
        })
      }
      
      const updates: Partial<typeof prev> = {}
      
      // Calculate monthly payment or number of months based on remaining amount
      // CRITICAL: Only calculate based on the selected calculation_method - never change it
      if (prev.calculation_method === 'monthly' && prev.monthly_payment) {
        const monthlyPayment = parseFloat(prev.monthly_payment)
        if (!isNaN(monthlyPayment) && monthlyPayment > 0 && remainingForInstallments > 0) {
          // Calculate number of months needed based on remaining amount (after advance)
          const numberOfMonths = Math.ceil(remainingForInstallments / monthlyPayment)
          
          console.log('[calculateInstallmentPrice] Monthly calculation:', {
            monthlyPayment,
            numberOfMonths,
            remainingForInstallments,
            calculationMethod: prev.calculation_method, // Log to verify it's not changing
            breakdown: {
              installmentPrice: installmentPrice,
              advance: advanceAmount,
              remaining: remainingForInstallments,
              monthlyPayment: monthlyPayment,
              numberOfMonths: numberOfMonths
            }
          })
          
          updates.number_of_months = numberOfMonths.toString()
        } else if (!isNaN(monthlyPayment) && monthlyPayment > 0 && remainingForInstallments <= 0) {
          // If advance covers everything, no installments needed
          updates.number_of_months = '0'
        }
      } else if (prev.calculation_method === 'months' && prev.number_of_months) {
        const numberOfMonths = parseFloat(prev.number_of_months)
        if (!isNaN(numberOfMonths) && numberOfMonths > 0 && remainingForInstallments > 0) {
          // Calculate monthly payment from remaining amount (after advance)
          const monthlyPayment = remainingForInstallments / numberOfMonths
          
          console.log('[calculateInstallmentPrice] Months calculation:', {
            numberOfMonths,
            monthlyPayment,
            remainingForInstallments,
            calculationMethod: prev.calculation_method, // Log to verify it's not changing
            breakdown: {
              installmentPrice: installmentPrice,
              advance: advanceAmount,
              remaining: remainingForInstallments,
              monthlyPayment: monthlyPayment,
              numberOfMonths: numberOfMonths
            }
          })
          
          updates.monthly_payment = monthlyPayment.toFixed(2)
        } else if (!isNaN(numberOfMonths) && numberOfMonths > 0 && remainingForInstallments <= 0) {
          // If advance covers everything, no monthly payment needed
          updates.monthly_payment = '0'
        }
      }
      
      // Only update if there are changes to avoid infinite loops
      // IMPORTANT: Always preserve the calculation_method - never change it during calculation
      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates, calculation_method: prev.calculation_method }
      }
      
      return prev
    })
  }, [houseForm.price_installment, houseForm.price_full, showOfferForm])

  // Calculate monthly payment or number of months when installment price, advance, or calculation method changes
  // The installment price is manually set by the user and does NOT change automatically
  useEffect(() => {
    if (houseForm.price_installment && showOfferForm && offerForm.calculation_method) {
      // Only calculate if we have the required input value for the selected method
      // IMPORTANT: Only calculate based on the selected method, not based on which field has a value
      // This prevents the method from switching when the calculated value is set
      let shouldCalculate = false
      
      if (offerForm.calculation_method === 'monthly') {
        // Only calculate if monthly_payment is provided and valid
        const monthlyPayment = parseFloat(offerForm.monthly_payment || '0')
        shouldCalculate = !isNaN(monthlyPayment) && monthlyPayment > 0
      } else if (offerForm.calculation_method === 'months') {
        // Only calculate if number_of_months is provided and valid
        const numberOfMonths = parseFloat(offerForm.number_of_months || '0')
        shouldCalculate = !isNaN(numberOfMonths) && numberOfMonths > 0
      }
      
      if (shouldCalculate) {
        console.log('[useEffect] Triggering calculation with method:', offerForm.calculation_method)
        calculateInstallmentPrice()
      }
    }
  }, [
    houseForm.price_installment,
    offerForm.advance_amount, 
    offerForm.advance_is_percentage, 
    offerForm.monthly_payment, 
    offerForm.number_of_months, 
    offerForm.calculation_method,
    showOfferForm,
    calculateInstallmentPrice
  ])

  const openHouseDialog = async (house?: House) => {
    if (house) {
      setEditingHouse(house)
      setHouseForm({
        name: house.name,
        place: house.place,
        surface: (house as any).surface?.toString() || '',
        price_full: house.price_full.toString(),
        price_installment: house.price_installment.toString(),
        company_fee_percentage: (house as any).company_fee_percentage?.toString() || '',
        notes: house.notes || '',
      })
      
      // Load existing offer if any - always fetch from database
      const { data: offersData, error: offersError } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('house_id', house.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
      
      if (offersError) {
        console.error('[openHouseDialog] Error loading offer:', offersError)
      }
      
      const offer = offersData && Array.isArray(offersData) && offersData.length > 0 
        ? offersData[0] as PaymentOffer
        : null
      
      if (offer) {
        // Load offer data into form
        setOfferForm({
          company_fee_percentage: '', // Not used in offer form anymore
          advance_amount: offer.advance_amount ? offer.advance_amount.toString() : '',
          advance_is_percentage: offer.advance_is_percentage || false,
          monthly_payment: offer.monthly_payment ? offer.monthly_payment.toString() : '',
          number_of_months: offer.number_of_months ? offer.number_of_months.toString() : '',
          calculation_method: (offer.monthly_payment && offer.monthly_payment > 0) ? 'monthly' : 'months',
          offer_name: offer.offer_name || '',
          notes: offer.notes || '',
          is_default: offer.is_default || false,
        })
        setShowOfferForm(true)
      } else {
        // No offer found, reset form
        setShowOfferForm(true) // Always show offer form
        setOfferForm({
          company_fee_percentage: '',
          advance_amount: '',
          advance_is_percentage: false,
          monthly_payment: '',
          number_of_months: '',
          calculation_method: 'monthly',
          offer_name: '',
          notes: '',
          is_default: false,
        })
      }
    } else {
      setEditingHouse(null)
      setHouseForm({
        name: '',
        place: '',
        surface: '',
        price_full: '',
        price_installment: '',
        company_fee_percentage: '',
        notes: '',
      })
      setShowOfferForm(true) // Always show offer form
      setOfferForm({
        company_fee_percentage: '',
        advance_amount: '',
        advance_is_percentage: false,
        monthly_payment: '',
        number_of_months: '',
        calculation_method: 'monthly',
        offer_name: '',
        notes: '',
        is_default: false,
      })
    }
    setHouseDialogOpen(true)
  }

  const saveHouse = async () => {
    console.log('[saveHouse] Starting save process...')
    console.log('[saveHouse] Form data:', houseForm)
    console.log('[saveHouse] User:', user?.id)
    
    if (!houseForm.name.trim() || !houseForm.place.trim() || !houseForm.price_full || !houseForm.price_installment) {
      console.log('[saveHouse] Validation failed - missing required fields')
      setError(t('homes.fillAllRequiredFields'))
      return
    }

    try {
      const houseData: any = {
        name: sanitizeText(houseForm.name),
        place: sanitizeText(houseForm.place),
        surface: houseForm.surface ? parseFloat(houseForm.surface) : null,
        price_full: parseFloat(houseForm.price_full),
        price_installment: parseFloat(houseForm.price_installment),
        company_fee_percentage: houseForm.company_fee_percentage ? parseFloat(houseForm.company_fee_percentage) : null,
        notes: houseForm.notes ? sanitizeNotes(houseForm.notes) : null,
      }
      
      // Only set created_by for new houses, not when updating
      if (!editingHouse) {
        houseData.created_by = user?.id || null
      }

      console.log('[saveHouse] Prepared house data:', houseData)
      console.log('[saveHouse] Editing house?', !!editingHouse)

      let houseId: string

      if (editingHouse) {
        console.log('[saveHouse] Updating existing house:', editingHouse.id)
        console.log('[saveHouse] Update data:', JSON.stringify(houseData, null, 2))
        console.log('[saveHouse] User role check:', { userId: user?.id, profile: profile })
        
        // First, check if we can see the house before update
        const { data: beforeUpdate, error: beforeError } = await supabase
          .from('houses')
          .select('id, name, created_by')
          .eq('id', editingHouse.id)
          .single()
        
        console.log('[saveHouse] Before update - can we see the house?', { 
          data: beforeUpdate, 
          dataId: beforeUpdate?.id,
          dataCreatedBy: beforeUpdate?.created_by,
          error: beforeError,
          errorMessage: beforeError?.message,
          errorCode: beforeError?.code
        })
        
        // Try update - if select doesn't work, we'll check separately
        const { error: updateError } = await supabase
          .from('houses')
          .update(houseData)
          .eq('id', editingHouse.id)
        
        if (updateError) {
          console.error('[saveHouse] Update error:', updateError)
          throw updateError
        }
        
        // Check if update was successful by querying the house
        const { data: updateData, error: selectError } = await supabase
          .from('houses')
          .select('id')
          .eq('id', editingHouse.id)
          .single()
        
        if (selectError) {
          console.error('[saveHouse] Select error after update:', selectError)
          throw selectError
        }
        
        if (!updateData) {
          console.error('[saveHouse] Update failed - no data returned')
          console.error('[saveHouse] This might be an RLS issue. Checking if house exists...')
          
          // Check if house still exists and if we can see it
          const { data: checkData, error: checkError } = await supabase
            .from('houses')
            .select('id, name, created_by')
            .eq('id', editingHouse.id)
            .single()
          
          console.log('[saveHouse] House existence check after update:', { 
            data: checkData, 
            dataId: checkData?.id,
            dataCreatedBy: checkData?.created_by,
            error: checkError,
            errorMessage: checkError?.message,
            errorCode: checkError?.code,
            errorDetails: checkError?.details,
            errorHint: checkError?.hint
          })
          
          // Try to get the house without single to see if it exists
          const { data: checkDataArray, error: checkErrorArray } = await supabase
            .from('houses')
            .select('id, name, created_by')
            .eq('id', editingHouse.id)
          
          console.log('[saveHouse] House existence check (array):', { 
            data: checkDataArray, 
            dataLength: checkDataArray?.length,
            dataIsArray: Array.isArray(checkDataArray),
            error: checkErrorArray,
            errorMessage: checkErrorArray?.message,
            errorCode: checkErrorArray?.code
          })
          
          // Try to get ALL houses to see if we can see any
          const { data: allHouses, error: allHousesError } = await supabase
            .from('houses')
            .select('id, name, created_by')
            .limit(5)
          
          console.log('[saveHouse] Can we see any houses?', { 
            data: allHouses, 
            dataLength: allHouses?.length,
            error: allHousesError,
            errorMessage: allHousesError?.message
          })
          
          throw new Error('فشل في تحديث المنزل: لم يتم إرجاع بيانات. قد تكون هناك مشكلة في صلاحيات قاعدة البيانات (RLS).')
        }
        
        // Handle both array and single object responses
        const data = Array.isArray(updateData) ? updateData[0] : updateData
        houseId = data.id
        console.log('[saveHouse] House updated successfully, ID:', houseId)
      } else {
        console.log('[saveHouse] Creating new house...')
        console.log('[saveHouse] Attempting insert with data:', JSON.stringify(houseData, null, 2))
        
        // Try without .single() first to see what we get
        const { data: insertData, error: insertError } = await supabase
          .from('houses')
          .insert([houseData])
          .select('id')
        
        console.log('[saveHouse] Insert response (without single):', { data: insertData, error: insertError })
        console.log('[saveHouse] Insert response type:', typeof insertData)
        console.log('[saveHouse] Insert response is array?', Array.isArray(insertData))
        console.log('[saveHouse] Insert response length:', insertData?.length)
        
        if (insertError) {
          console.error('[saveHouse] Insert error:', insertError)
          console.error('[saveHouse] Error code:', insertError.code)
          console.error('[saveHouse] Error message:', insertError.message)
          console.error('[saveHouse] Error details:', insertError.details)
          console.error('[saveHouse] Error hint:', insertError.hint)
          
          // Check if it's an RLS error
          if (insertError.code === '42501' || insertError.message?.includes('permission denied') || insertError.message?.includes('policy')) {
            throw new Error('خطأ في الصلاحيات: لا يمكنك إضافة منزل. يرجى التحقق من أنك Owner.')
          }
          
          throw insertError
        }
        
        if (!insertData || !Array.isArray(insertData) || insertData.length === 0) {
          console.error('[saveHouse] Insert failed - no data returned or empty array')
          console.error('[saveHouse] Response:', { insertData, insertError })
          console.error('[saveHouse] insertData type:', typeof insertData)
          console.error('[saveHouse] insertData value:', JSON.stringify(insertData))
          
          // Try to query the house we just inserted by name and created_by
          console.log('[saveHouse] Attempting to find inserted house by name and created_by...')
          const { data: foundHouse, error: findError } = await supabase
            .from('houses')
            .select('id, name, created_by')
            .eq('name', houseData.name)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          console.log('[saveHouse] Found house query result:', { foundHouse, findError })
          
          if (findError) {
            console.error('[saveHouse] Error finding house:', findError)
          }
          
          // Check if table exists by trying a simple select
          const { data: testData, error: testError } = await supabase
            .from('houses')
            .select('id')
            .limit(1)
          
          console.log('[saveHouse] Table existence check:', { testData, testError })
          
          if (testError && testError.code === '42P01') {
            throw new Error('جدول المنازل غير موجود. يرجى تنفيذ ملف SQL لإنشاء الجدول أولاً.')
          }
          
          // If we found the house, use it
          if (foundHouse && foundHouse.id) {
            console.log('[saveHouse] Found house after insert, using it:', foundHouse.id)
            houseId = foundHouse.id
            showNotification(t('homes.houseAddedSuccess'), 'success')
            setHouseDialogOpen(false)
            await fetchHouses()
            return
          }
          
          throw new Error('فشل في إضافة المنزل: لم يتم إرجاع بيانات من قاعدة البيانات. قد تكون هناك مشكلة في صلاحيات قاعدة البيانات (RLS). يرجى تنفيذ ملف fix_houses_rls_v2.sql في Supabase.')
        }
        
        const data = insertData[0]
        if (!data || !data.id) {
          console.error('[saveHouse] Insert failed - data exists but no ID:', data)
          throw new Error('فشل في إضافة المنزل: لم يتم إرجاع معرف المنزل')
        }
        
        houseId = data.id
        console.log('[saveHouse] House created successfully, ID:', houseId)
        showNotification(t('homes.houseAddedSuccess'), 'success')
      }

      // Save payment offer if offer form is filled
      if (showOfferForm && (offerForm.monthly_payment || offerForm.number_of_months)) {
        console.log('[saveHouse] Saving payment offer...', {
          houseId,
          monthly_payment: offerForm.monthly_payment,
          number_of_months: offerForm.number_of_months,
          advance_amount: offerForm.advance_amount
        })
        
        // Build offer data - only include house_id, exclude land_batch_id and land_piece_id
        // The constraint requires exactly one of house_id, land_batch_id, or land_piece_id to be non-null
        // By omitting the null fields, we let the database use their default (null) values
        const offerData: any = {
          house_id: houseId,
          // Explicitly DO NOT include land_batch_id or land_piece_id - let them be null by default
          company_fee_percentage: houseForm.company_fee_percentage ? parseFloat(houseForm.company_fee_percentage) : 0,
          advance_amount: offerForm.advance_amount ? parseFloat(offerForm.advance_amount) : 0,
          advance_is_percentage: offerForm.advance_is_percentage,
          monthly_payment: offerForm.monthly_payment ? parseFloat(offerForm.monthly_payment) : null,
          number_of_months: offerForm.number_of_months ? parseInt(offerForm.number_of_months) : null,
          offer_name: offerForm.offer_name.trim() || null,
          notes: offerForm.notes.trim() || null,
          is_default: offerForm.is_default,
          created_by: user?.id || null,
        }

        // Remove null values to avoid constraint issues - Supabase may send null explicitly
        // which can cause check_reference constraint to fail
        const cleanedOfferData: any = { ...offerData }
        // Don't include land_batch_id or land_piece_id at all - let them be null by default
        delete cleanedOfferData.land_batch_id
        delete cleanedOfferData.land_piece_id
        
        console.log('[saveHouse] Offer data to save:', cleanedOfferData)

        // Check if offer already exists for this house
        const { data: existingOffer, error: offerCheckError } = await supabase
          .from('payment_offers')
          .select('id')
          .eq('house_id', houseId)
          .maybeSingle()

        console.log('[saveHouse] Existing offer check:', { existingOffer, error: offerCheckError })

        if (offerCheckError) {
          console.error('Error checking existing offer:', offerCheckError)
          // Continue anyway - try to create new offer
        }

        if (existingOffer && existingOffer.id) {
          // Update existing offer
          console.log('[saveHouse] Updating existing offer:', existingOffer.id)
          const { data: updatedOffer, error: updateError } = await supabase
            .from('payment_offers')
            .update(cleanedOfferData)
            .eq('id', existingOffer.id)
            .select()
            .single()
          
          if (updateError) {
            console.error('Error updating offer:', updateError)
            showNotification('تم حفظ المنزل لكن فشل تحديث العرض', 'warning')
          } else {
            console.log('[saveHouse] Offer updated successfully:', updatedOffer)
            showNotification('تم حفظ المنزل والعرض بنجاح', 'success')
          }
        } else {
          // Create new offer
          console.log('[saveHouse] Creating new offer...')
          const { data: newOffer, error: insertError } = await supabase
            .from('payment_offers')
            .insert([cleanedOfferData])
            .select()
            .single()
          
          if (insertError) {
            console.error('Error creating offer:', insertError)
            showNotification('تم حفظ المنزل لكن فشل إنشاء العرض', 'warning')
          } else {
            console.log('[saveHouse] Offer created successfully:', newOffer)
            showNotification('تم حفظ المنزل والعرض بنجاح', 'success')
          }
        }
      } else {
        console.log('[saveHouse] No offer to save - form not filled or no monthly payment/number of months')
      }

      setHouseDialogOpen(false)
      await fetchHouses()
    } catch (err: any) {
      setError(err.message || t('homes.errorSavingHouse'))
      showNotification(t('homes.errorSavingHouse') + ': ' + (err.message || t('homes.unknownError')), 'error')
    }
  }

  const deleteHouse = async () => {
    if (!houseToDelete) return

    try {
      // Check if house is sold or reserved
      const house = houses.find(h => h.id === houseToDelete)
      if (house && (house.status === 'Sold' || house.status === 'Reserved')) {
        setError(t('homes.cannotDeleteSoldOrReserved'))
        setDeleteConfirmOpen(false)
        return
      }

      const { error } = await supabase
        .from('houses')
        .delete()
        .eq('id', houseToDelete)
      
      if (error) throw error
      
      showNotification(t('homes.houseDeletedSuccess'), 'success')
      setDeleteConfirmOpen(false)
      await fetchHouses()
    } catch (err: any) {
      setError(err.message || t('homes.errorDeletingHouse'))
      showNotification(t('homes.errorDeletingHouse') + ': ' + (err.message || t('homes.unknownError')), 'error')
    }
  }

  const openSaleDialog = async (house: House) => {
    if (house.status === 'Sold') {
      showNotification(t('homes.houseAlreadySold'), 'warning')
      return
    }

    setSelectedHouse(house)
    setSaleForm({
      payment_type: 'Full',
      reservation_amount: '',
      deadline_date: '',
      selected_offer_id: '',
      promise_initial_payment: '',
    })
    setNewClient(null)
    setFoundClient(null)
    setClientSearchStatus('idle')
    setClientForm({
      name: '',
      cin: '',
      phone: '',
      email: '',
      address: '',
      client_type: 'Individual',
      notes: '',
    })

    // Always fetch offers from database to ensure we have the latest data
    const { data: offers, error: offersError } = await supabase
      .from('payment_offers')
      .select('*')
      .eq('house_id', house.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    
    if (offersError) {
      console.error('[openSaleDialog] Error fetching offers:', offersError)
    }
    
    const offersList = (offers as PaymentOffer[]) || []
    setAvailableOffers(offersList)
    
    // Auto-select default offer or first offer if available
    if (offersList.length > 0) {
      const defaultOffer = offersList.find(o => o.is_default) || offersList[0]
      setSelectedOffer(defaultOffer)
      setSaleForm(prev => ({ ...prev, selected_offer_id: defaultOffer.id }))
    } else {
      setSelectedOffer(null)
      setSaleForm(prev => ({ ...prev, selected_offer_id: '' }))
    }
    
    // Open client dialog first
    setClientDialogOpen(true)
  }

  const handleCreateClient = async () => {
    if (savingClient) return
    
    setSavingClient(true)
    
    try {
      if (!clientForm.name.trim() || !clientForm.cin.trim() || !clientForm.phone.trim()) {
        showNotification('يرجى ملء جميع الحقول المطلوبة', 'error')
        setSavingClient(false)
        return
      }

      const sanitizedCIN = sanitizeCIN(clientForm.cin)
      if (!sanitizedCIN) {
        showNotification('رقم CIN غير صالح', 'error')
        setSavingClient(false)
        return
      }

      const sanitizedPhone = sanitizePhone(clientForm.phone)
      
      // Check for duplicate CIN - if found, use it instead of showing error
      const { data: existingClients, error: checkError } = await supabase
        .from('clients')
        .select('*')
        .eq('cin', sanitizedCIN)
        .limit(1)

      if (existingClients && existingClients.length > 0) {
        const existingClient = existingClients[0]
        // Client exists - use it instead of creating new one
        setFoundClient(existingClient)
        setNewClient(existingClient)
        setClientForm({
          name: existingClient.name,
          cin: existingClient.cin,
          phone: existingClient.phone || '',
          email: existingClient.email || '',
          address: existingClient.address || '',
          client_type: existingClient.client_type,
          notes: existingClient.notes || '',
        })
        showNotification('تم العثور على عميل موجود. سيتم استخدام بياناته.', 'info')
        setSavingClient(false)
        // Close client dialog first
        setClientDialogOpen(false)
        // Wait a bit longer to ensure state is updated, then open sale dialog
        setTimeout(() => {
          // Double-check that newClient is set, if not, set it again
          setNewClient(prev => prev || existingClient)
          setSaleDialogOpen(true)
        }, 200)
        return
      }

      // Create new client
      const { data, error } = await supabase
        .from('clients')
        .insert([{
          name: sanitizeText(clientForm.name),
          cin: sanitizedCIN,
          phone: sanitizedPhone || null,
          email: clientForm.email ? sanitizeText(clientForm.email) : null,
          address: clientForm.address ? sanitizeText(clientForm.address) : null,
          client_type: clientForm.client_type,
          notes: clientForm.notes ? sanitizeNotes(clientForm.notes) : null,
          created_by: user?.id || null,
        }])
        .select()
        .single()

      let createdClient = data
      
      // If select() didn't return data (RLS issue), fetch it by CIN
      if (error || !createdClient) {
        if (error && !error.message?.includes('permission')) {
          throw error
        }
        
        // Wait a moment for the insert to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Fetch the newly created client by CIN
        const { data: fetchedClient, error: fetchError } = await supabase
          .from('clients')
          .select('*')
          .eq('cin', sanitizedCIN)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (fetchError || !fetchedClient) {
          throw new Error('تم إنشاء العميل لكن فشل في جلب بياناته. يرجى المحاولة مرة أخرى.')
        }
        
        createdClient = fetchedClient
      }
      
      // Set the new client first
      setNewClient(createdClient)
      setFoundClient(createdClient)
      showNotification(t('homes.clientAddedSuccess'), 'success')
      
      // Close client dialog first
      setClientDialogOpen(false)
      
      // Wait a bit longer to ensure state is updated, then open sale dialog
      setTimeout(() => {
        // Double-check that newClient is set, if not, set it again
        setNewClient(prev => prev || createdClient)
        setSaleDialogOpen(true)
      }, 200)
    } catch (err: any) {
      setError(err.message || t('homes.errorSavingClient'))
      showNotification(t('homes.errorSavingClient') + ': ' + (err.message || t('homes.unknownError')), 'error')
    } finally {
      setSavingClient(false)
    }
  }

  const createSale = async () => {
    // Store newClient in a local variable to prevent it from becoming null during execution
    const currentClient = newClient
    
    if (!selectedHouse || !currentClient) {
      setError(t('homes.selectClient'))
      showNotification('يرجى اختيار عميل أولاً', 'error')
      return
    }

    if (!saleForm.reservation_amount || parseFloat(saleForm.reservation_amount) <= 0) {
      setError(t('homes.enterReservationAmount'))
      return
    }

    if (!saleForm.deadline_date || saleForm.deadline_date.trim() === '') {
      showNotification('يرجى إدخال آخر أجل لإتمام الإجراءات', 'error')
      return
    }

    setCreatingSale(true)
    try {
      // Create sale similar to land sales
      const reservationAmount = parseFloat(saleForm.reservation_amount)
      const price = saleForm.payment_type === 'Full' 
        ? selectedHouse.price_full 
        : selectedHouse.price_installment
      
      const purchaseCost = 0 // No purchase cost for houses
      const companyFeePercentage = (selectedHouse as any).company_fee_percentage || (selectedOffer?.company_fee_percentage || 0)
      const companyFeeAmount = (price * companyFeePercentage) / 100
      
      const saleData: any = {
        client_id: currentClient.id,
        land_piece_ids: [], // Empty array for house sales
        house_ids: [selectedHouse.id], // Using house_ids for house sales
        payment_type: saleForm.payment_type,
        total_purchase_cost: purchaseCost,
        total_selling_price: price,
        profit_margin: price - purchaseCost,
        small_advance_amount: reservationAmount,
        big_advance_amount: 0,
        company_fee_percentage: companyFeePercentage,
        company_fee_amount: companyFeeAmount,
        status: 'Pending',
        sale_date: new Date().toISOString().split('T')[0],
        deadline_date: saleForm.deadline_date,
        notes: `${t('homes.sellingHouseNote')}: ${selectedHouse.name}`,
        created_by: user?.id || null,
      }

      if (saleForm.payment_type === 'Installment' && selectedOffer) {
        saleData.selected_offer_id = selectedOffer.id
        // Calculate installment details
        const advanceAmount = selectedOffer.advance_is_percentage
          ? (price * selectedOffer.advance_amount) / 100
          : selectedOffer.advance_amount
        
        // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
        const advanceAfterReservation = Math.max(0, advanceAmount - reservationAmount)
        
        // Remaining for installments = Price - Advance (after reservation deduction) - Commission
        const remainingForInstallments = Math.max(0, price - advanceAfterReservation - companyFeeAmount)
        
        // Calculate months and monthly payment
        // IMPORTANT: Prioritize number_of_months if set - this was the primary input method
        // Only calculate from monthly_payment if number_of_months is not set
        let numberOfMonths = 0
        let monthlyAmount = 0
        
        if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
          // Use number_of_months directly - this is the primary input
          numberOfMonths = selectedOffer.number_of_months
          monthlyAmount = remainingForInstallments > 0
            ? remainingForInstallments / selectedOffer.number_of_months
            : 0
        } else if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
          // Calculate number of months from monthly payment only if number_of_months is not set
          monthlyAmount = selectedOffer.monthly_payment
          numberOfMonths = remainingForInstallments > 0
            ? Math.ceil(remainingForInstallments / selectedOffer.monthly_payment)
            : 0
        }
        
        saleData.number_of_installments = numberOfMonths
        saleData.monthly_installment_amount = monthlyAmount
      }

      const { data: sale, error } = await supabase
        .from('sales')
        .insert([saleData])
        .select()
        .single()

      if (error) throw error
      
      // Check if sale was created successfully
      if (!sale || !sale.id) {
        // If select() didn't return data (RLS issue), try fetching it manually
        await new Promise(resolve => setTimeout(resolve, 100))
        
        const { data: fetchedSales, error: fetchError } = await supabase
          .from('sales')
          .select('id')
          .eq('client_id', currentClient.id)
          .contains('house_ids', [selectedHouse.id])
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .limit(1)
        
        if (fetchError || !fetchedSales || fetchedSales.length === 0) {
          throw new Error('تم إنشاء البيع لكن فشل في جلب بياناته. يرجى التحقق من قاعدة البيانات.')
        }
        
        // Use the fetched sale
        const saleId = fetchedSales[0].id

      // Update house status to Reserved
        const { error: houseError } = await supabase
        .from('houses')
        .update({ 
          status: 'Reserved',
            reservation_client_id: currentClient.id,
          reserved_until: saleForm.deadline_date || null,
        } as any)
        .eq('id', selectedHouse.id)
        
        if (houseError) {
          // If house update fails, try to delete the sale we just created
          await supabase.from('sales').delete().eq('id', saleId)
          throw new Error('فشل في تحديث حالة المنزل: ' + houseError.message)
        }

      // Create payment record for reservation
      if (reservationAmount > 0) {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert([{
              client_id: currentClient.id,
              sale_id: saleId,
              amount_paid: reservationAmount,
              payment_type: 'SmallAdvance',
              payment_date: new Date().toISOString().split('T')[0],
              payment_method: 'Cash',
              recorded_by: user?.id || null,
            }])
          
          if (paymentError) {
            // If payment creation fails, rollback house status
        await supabase
              .from('houses')
              .update({ status: 'Available', reservation_client_id: null, reserved_until: null } as any)
              .eq('id', selectedHouse.id)
            throw new Error('فشل في إنشاء سجل الدفع: ' + paymentError.message)
          }
        }

        showNotification(t('homes.saleCreatedSuccess'), 'success')
        setNewClient(null)
        setSaleDialogOpen(false)
        await fetchHouses()
        navigate(`/sales/confirmation?saleId=${saleId}`)
        return
      }
      
      // Sale was returned successfully - proceed with house status update and payment
      // Update house status to Reserved
      const { error: houseError } = await supabase
        .from('houses')
        .update({ 
          status: 'Reserved',
          reservation_client_id: currentClient.id,
          reserved_until: saleForm.deadline_date || null,
        } as any)
        .eq('id', selectedHouse.id)
      
      if (houseError) {
        // If house update fails, try to delete the sale we just created
        await supabase.from('sales').delete().eq('id', sale.id)
        throw new Error('فشل في تحديث حالة المنزل: ' + houseError.message)
      }

      // Create payment record for reservation
      if (reservationAmount > 0) {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert([{
            client_id: currentClient.id,
            sale_id: sale.id,
            amount_paid: reservationAmount,
            payment_type: 'SmallAdvance',
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: 'Cash',
            recorded_by: user?.id || null,
          }])
        
        if (paymentError) {
          // If payment creation fails, rollback house status
          await supabase
            .from('houses')
            .update({ status: 'Available', reservation_client_id: null, reserved_until: null } as any)
            .eq('id', selectedHouse.id)
          throw new Error('فشل في إنشاء سجل الدفع: ' + paymentError.message)
        }
      }

      showNotification(t('homes.saleCreatedSuccess'), 'success')
      setNewClient(null)
      setSaleDialogOpen(false)
      await fetchHouses()
      navigate(`/sales/confirmation?saleId=${sale.id}`)
    } catch (err: any) {
      setError(err.message || t('homes.errorCreatingSale'))
      showNotification(t('homes.errorCreatingSale') + ': ' + (err.message || t('homes.unknownError')), 'error')
    } finally {
      setCreatingSale(false)
    }
  }

  const filteredHouses = houses.filter(house => {
    if (!debouncedSearchTerm) return true
    const search = debouncedSearchTerm.toLowerCase()
    return (
      house.name.toLowerCase().includes(search) ||
      house.place.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('homes.title')}</h1>
          <p className="text-gray-500 mt-1">{t('homes.subtitle')}</p>
        </div>
        <Button onClick={() => openHouseDialog()} className="w-full md:w-auto">
          <Plus className="h-4 w-4 ml-2" />
          {t('homes.newHouse')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>{t('homes.housesList')}</CardTitle>
            <div className="flex-1 max-w-md">
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          {filteredHouses.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">{t('common.noData')}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">{t('homes.name')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('homes.place')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('homes.surface')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('homes.priceFull')}</TableHead>
                      <TableHead className="min-w-[140px]">{t('homes.priceInstallment')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('homes.status')}</TableHead>
                      <TableHead className="min-w-[150px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHouses.map((house) => (
                      <TableRow key={house.id}>
                        <TableCell className="font-medium">{house.name}</TableCell>
                        <TableCell>{house.place}</TableCell>
                        <TableCell>{(house as any).surface ? `${(house as any).surface} ${t('land.surface')}` : '-'}</TableCell>
                        <TableCell>{formatCurrency(house.price_full)}</TableCell>
                        <TableCell>{formatCurrency(house.price_installment)}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[house.status]}>
                            {t(`land.${house.status.toLowerCase()}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openHouseDialog(house)}
                              title={t('common.edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {house.status === 'Available' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openSaleDialog(house)}
                                  title={t('homes.createSale')}
                                >
                                  <ShoppingCart className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setHouseToDelete(house.id)
                                    setDeleteConfirmOpen(true)
                                  }}
                                  title={t('common.delete')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4 p-4">
                {filteredHouses.map((house) => (
                  <Card key={house.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{house.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{house.place}</p>
                        </div>
                        <Badge variant={statusColors[house.status]} className="ml-2">
                          {t(`land.${house.status.toLowerCase()}`)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">{t('homes.surface')}</p>
                          <p className="font-medium">{(house as any).surface ? `${(house as any).surface} ${t('land.surface')}` : '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">{t('homes.priceFull')}</p>
                          <p className="font-medium">{formatCurrency(house.price_full)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-500">{t('homes.priceInstallment')}</p>
                          <p className="font-medium">{formatCurrency(house.price_installment)}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openHouseDialog(house)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 ml-1" />
                          {t('common.edit')}
                        </Button>
                        {house.status === 'Available' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openSaleDialog(house)}
                              className="flex-1"
                            >
                              <ShoppingCart className="h-4 w-4 ml-1" />
                              {t('homes.createSale')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setHouseToDelete(house.id)
                                setDeleteConfirmOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* House Dialog */}
      <Dialog open={houseDialogOpen} onOpenChange={setHouseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">
              {editingHouse ? t('homes.editHouse') : t('homes.newHouse')}
            </DialogTitle>
            <DialogDescription className="text-sm">{t('homes.houseFormDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>{t('homes.name')} *</Label>
              <Input
                value={houseForm.name}
                onChange={(e) => setHouseForm({ ...houseForm, name: e.target.value })}
                placeholder={t('homes.namePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.place')} *</Label>
              <Input
                value={houseForm.place}
                onChange={(e) => setHouseForm({ ...houseForm, place: e.target.value })}
                placeholder={t('homes.placePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.surface')}</Label>
              <Input
                type="number"
                value={houseForm.surface}
                onChange={(e) => setHouseForm({ ...houseForm, surface: e.target.value })}
                placeholder={t('homes.surfacePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.priceFull')} *</Label>
              <Input
                type="number"
                value={houseForm.price_full}
                onChange={(e) => setHouseForm({ ...houseForm, price_full: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t('homes.companyFeePercentage')}</Label>
              <Input
                type="number"
                value={houseForm.company_fee_percentage}
                onChange={(e) => setHouseForm({ ...houseForm, company_fee_percentage: e.target.value })}
                placeholder="0"
                step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('homes.companyFeeAppliesToBoth')}</p>
            </div>
            
            {/* Payment Offer Form - Always visible */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold">{t('homes.installmentOffer')}</h3>
              
              <div>
                <Label>{t('homes.priceInstallment')} *</Label>
                <Input
                  type="number"
                  value={houseForm.price_installment}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setHouseForm({ ...houseForm, price_installment: newValue })
                    // Recalculate monthly payment/number of months if calculation method is set
                    // The installment price itself is manually set and won't change automatically
                    if (showOfferForm && offerForm.calculation_method) {
                      setTimeout(() => calculateInstallmentPrice(), 0)
                    }
                  }}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('homes.priceInstallment')} {t('homes.priceWillBeCalculated')}
                </p>
              </div>
              
              <div>
                <Label>{t('land.offerName')}</Label>
                <Input
                  value={offerForm.offer_name}
                  onChange={(e) => setOfferForm({ ...offerForm, offer_name: e.target.value })}
                  placeholder={t('land.offerName')}
                />
              </div>

              <div>
                <Label>{t('land.advanceAmount')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={offerForm.advance_amount}
                    onChange={(e) => {
                      setOfferForm({ ...offerForm, advance_amount: e.target.value })
                      // Trigger calculation immediately
                      setTimeout(() => calculateInstallmentPrice(), 0)
                    }}
                    placeholder="0"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={offerForm.advance_is_percentage}
                      onChange={(e) => {
                        setOfferForm({ ...offerForm, advance_is_percentage: e.target.checked })
                        // Trigger calculation immediately
                        setTimeout(() => calculateInstallmentPrice(), 0)
                      }}
                      className="rounded"
                    />
                    <Label className="text-sm">{t('land.advanceIsPercentage')}</Label>
                  </div>
                </div>
                {/* Show actual advance amount */}
                {offerForm.advance_amount && houseForm.price_full && (
                  <p className="text-xs text-gray-600 mt-1">
                    {t('land.advanceAmount')}: {formatCurrency(
                      offerForm.advance_is_percentage
                        ? (parseFloat(houseForm.price_full) * parseFloat(offerForm.advance_amount)) / 100
                        : parseFloat(offerForm.advance_amount)
                    )}
                  </p>
                )}
              </div>

              <div>
                <Label>{t('land.calculationMethod')}</Label>
                <Select
                  value={offerForm.calculation_method}
                  onChange={(e) => {
                    setOfferForm(prev => ({ ...prev, calculation_method: e.target.value as 'monthly' | 'months' }))
                  }}
                >
                  <option value="monthly">{t('land.calculateByMonthly')}</option>
                  <option value="months">{t('land.calculateByMonths')}</option>
                </Select>
              </div>

              {offerForm.calculation_method === 'monthly' ? (
                <div>
                  <Label>{t('land.monthlyPayment')} *</Label>
                  <Input
                    type="number"
                    value={offerForm.monthly_payment}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setOfferForm(prev => ({ ...prev, monthly_payment: newValue }))
                    }}
                    placeholder="0"
                  />
                  {offerForm.monthly_payment && houseForm.price_full && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('land.numberOfMonths')}: {offerForm.number_of_months || '...'}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label>{t('land.numberOfMonths')} *</Label>
                  <Input
                    type="number"
                    value={offerForm.number_of_months}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setOfferForm(prev => ({ ...prev, number_of_months: newValue }))
                    }}
                    placeholder="0"
                  />
                  {offerForm.number_of_months && houseForm.price_full && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('land.monthlyPayment')}: {formatCurrency(parseFloat(offerForm.monthly_payment) || 0)}
                    </p>
                  )}
                </div>
              )}
              
              {/* List of existing offers */}
              {houseOffers.length > 0 && (
                <div className="mt-4">
                  <Label className="mb-2 block">العروض المحفوظة:</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {houseOffers.map((offer) => (
                      <div key={offer.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <div className="flex-1">
                          <div className="font-medium">{offer.offer_name || 'عرض بدون اسم'}</div>
                          <div className="text-xs text-gray-600">
                            {offer.monthly_payment && `${formatCurrency(offer.monthly_payment)}/شهر`}
                            {offer.number_of_months && ` × ${offer.number_of_months} شهر`}
                            {offer.is_default && <span className="ml-2 text-green-600">(افتراضي)</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingOffer(offer)
                            setOfferForm({
                              company_fee_percentage: '',
                              advance_amount: offer.advance_amount ? offer.advance_amount.toString() : '',
                              advance_is_percentage: offer.advance_is_percentage || false,
                              monthly_payment: offer.monthly_payment ? offer.monthly_payment.toString() : '',
                              number_of_months: offer.number_of_months ? offer.number_of_months.toString() : '',
                              calculation_method: (offer.monthly_payment && offer.monthly_payment > 0) ? 'monthly' : 'months',
                              offer_name: offer.offer_name || '',
                              notes: offer.notes || '',
                              is_default: offer.is_default || false,
                            })
                            setOfferDialogOpen(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Add new offer button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingOffer(null)
                  setOfferForm({
                    company_fee_percentage: '',
                    advance_amount: '',
                    advance_is_percentage: false,
                    monthly_payment: '',
                    number_of_months: '',
                    calculation_method: 'monthly',
                    offer_name: '',
                    notes: '',
                    is_default: false,
                  })
                  setOfferDialogOpen(true)
                }}
                className="w-full mt-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                إضافة عرض آخر
              </Button>
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Textarea
                value={houseForm.notes}
                onChange={(e) => setHouseForm({ ...houseForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setHouseDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={saveHouse}
              className="w-full sm:w-auto"
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Only clear state when explicitly closing (not when opening)
          setSaleDialogOpen(false)
          // Clear newClient when dialog is manually closed (not after sale creation)
          setNewClient(null)
          setSelectedHouse(null)
          setSaleForm({
            payment_type: 'Full',
            reservation_amount: '',
            deadline_date: '',
            selected_offer_id: '',
            promise_initial_payment: '',
          })
          setSelectedOffer(null)
        } else {
          // When opening, ensure newClient is still set
          setSaleDialogOpen(open)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">{t('homes.createSale')}</DialogTitle>
            <DialogDescription className="text-sm">
              {selectedHouse && `${t('homes.sellingHouse')}: ${selectedHouse.name}`}
            </DialogDescription>
          </DialogHeader>
          {!newClient ? (
            <div className="p-4 text-center text-muted-foreground">
              <p>يرجى اختيار عميل أولاً</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSaleDialogOpen(false)
                  setClientDialogOpen(true)
                }}
              >
                {t('clients.newClient')}
              </Button>
            </div>
          ) : !selectedHouse ? (
            <div className="p-4 text-center text-muted-foreground">
              <p>يرجى اختيار منزل</p>
            </div>
          ) : (
          <div className="space-y-4 pt-4">
            {/* Client Info Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-medium text-sm">العميل: {newClient.name}</p>
              <p className="text-xs text-muted-foreground">CIN: {newClient.cin} | الهاتف: {newClient.phone}</p>
            </div>

            {/* Payment Type */}
            <div>
              <Label>{t('sales.type')}</Label>
              <Select
                value={saleForm.payment_type}
                onChange={(e) => {
                  const newPaymentType = e.target.value as 'Full' | 'Installment' | 'PromiseOfSale'
                  setSaleForm({ ...saleForm, payment_type: newPaymentType })
                  
                  // Auto-select offer when switching to Installment
                  if (newPaymentType === 'Installment' && availableOffers.length > 0 && !selectedOffer) {
                    const defaultOffer = availableOffers.find(o => o.is_default) || availableOffers[0]
                    if (defaultOffer) {
                      setSelectedOffer(defaultOffer)
                      setSaleForm(prev => ({ ...prev, selected_offer_id: defaultOffer.id }))
                    }
                  } else if (newPaymentType !== 'Installment') {
                    setSelectedOffer(null)
                    setSaleForm(prev => ({ ...prev, selected_offer_id: '' }))
                  }
                }}
              >
                <option value="Full">{t('sales.full')}</option>
                <option value="Installment">{t('sales.installment')}</option>
              </Select>
            </div>

            {/* Installment Offer Selection */}
            {saleForm.payment_type === 'Installment' && availableOffers.length > 0 && (
              <div className="space-y-2">
                <Label>عرض الدفع {selectedOffer && `(محدد تلقائياً)`}</Label>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                  {availableOffers.map((offer) => {
                    if (!selectedHouse) return null
                    
                    const price = selectedHouse.price_installment
                    const companyFeePercentage = (selectedHouse as any).company_fee_percentage || offer.company_fee_percentage || 0
                    const companyFeeAmount = (price * companyFeePercentage) / 100
                    
                    const advanceAmount = offer.advance_is_percentage
                      ? (price * offer.advance_amount) / 100
                      : offer.advance_amount
                    
                    const reservation = parseFloat(saleForm.reservation_amount) || 0
                    const advanceAfterReservation = Math.max(0, advanceAmount - reservation)
                    const remainingForInstallments = Math.max(0, price - advanceAfterReservation - companyFeeAmount)
                    
                    let numberOfMonths = 0
                    // Prioritize number_of_months if set - this was the primary input method
                    // Only calculate from monthly_payment if number_of_months is not set
                    if (offer.number_of_months && offer.number_of_months > 0) {
                      numberOfMonths = offer.number_of_months
                    } else if (offer.monthly_payment && offer.monthly_payment > 0) {
                      numberOfMonths = remainingForInstallments > 0
                        ? Math.ceil(remainingForInstallments / offer.monthly_payment)
                        : 0
                    }
                    
                    const isSelected = selectedOffer?.id === offer.id
                    
                    return (
                      <div
                        key={offer.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          setSelectedOffer(offer)
                          setSaleForm({ ...saleForm, selected_offer_id: offer.id })
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation()
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-green-100 border-green-500 ring-2 ring-green-500'
                            : 'bg-white border-green-200 hover:bg-green-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {offer.is_default && (
                                <Badge variant="default" className="text-xs">افتراضي</Badge>
                              )}
                              {offer.offer_name && (
                                <span className="font-medium text-sm">{offer.offer_name}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>عمولة الشركة: {companyFeePercentage}%</div>
                              <div>
                                التسبقة: {offer.advance_is_percentage 
                                  ? `${offer.advance_amount}% (${formatCurrency(advanceAmount)})`
                                  : `${formatCurrency(offer.advance_amount)}`}
                              </div>
                              {offer.monthly_payment && offer.monthly_payment > 0 && (
                                <div>المبلغ الشهري: {formatCurrency(offer.monthly_payment)}</div>
                              )}
                              {offer.number_of_months && offer.number_of_months > 0 && (
                                <div>عدد الأشهر: {offer.number_of_months} شهر</div>
                              )}
                              {/* Show calculated months only if offer doesn't have number_of_months set */}
                              {numberOfMonths > 0 && !offer.number_of_months && (
                                <div>عدد الأشهر: {numberOfMonths} شهر</div>
                              )}
                            </div>
                          </div>
                          <div className="ml-2">
                            <input
                              type="radio"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation()
                                setSelectedOffer(offer)
                                setSaleForm({ ...saleForm, selected_offer_id: offer.id })
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                              }}
                              className="h-4 w-4 text-green-600"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  اختر عرضاً لملء الحقول تلقائياً، أو املأها يدوياً
                </p>
              </div>
            )}

            {/* Reservation Amount */}
            <div>
              <Label>{t('sales.reservation')} *</Label>
              <Input
                type="number"
                value={saleForm.reservation_amount}
                onChange={(e) => setSaleForm({ ...saleForm, reservation_amount: e.target.value })}
                placeholder="0"
              />
            </div>

            {/* Deadline Date */}
            <div>
              <Label>{t('saleConfirmation.deadline')} *</Label>
              <Input
                type="date"
                value={saleForm.deadline_date}
                onChange={(e) => setSaleForm({ ...saleForm, deadline_date: e.target.value })}
              />
            </div>

            {/* Sale Details Summary - Calculations */}
            {selectedHouse && newClient && saleForm.reservation_amount && (() => {
              const reservation = parseFloat(saleForm.reservation_amount) || 0
              const price = saleForm.payment_type === 'Full' 
                ? selectedHouse.price_full 
                : selectedHouse.price_installment
              
              const companyFeePercentage = (selectedHouse as any).company_fee_percentage || (selectedOffer?.company_fee_percentage || 0)
              const companyFeeAmount = (price * companyFeePercentage) / 100
              
              if (saleForm.payment_type === 'Full') {
                // Full Payment Details
                const totalPayable = price + companyFeeAmount
                const remainingAfterReservation = totalPayable - reservation
                
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-green-800 text-sm mb-2">تفاصيل البيع (بالحاضر):</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">السعر الإجمالي:</span>
                        <span className="font-semibold text-green-700">{formatCurrency(price)}</span>
                      </div>
                      {companyFeePercentage > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">عمولة الشركة ({companyFeePercentage}%):</span>
                          <span className="font-medium text-green-700">{formatCurrency(companyFeeAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-green-200 pt-2">
                        <span className="font-medium text-muted-foreground">المبلغ الإجمالي المستحق:</span>
                        <span className="font-semibold text-green-800">{formatCurrency(totalPayable)}</span>
                      </div>
                      {reservation > 0 && (
                        <>
                          <div className="flex justify-between text-green-700">
                            <span>العربون (مدفوع عند الحجز):</span>
                            <span className="font-medium">{formatCurrency(reservation)}</span>
                          </div>
                          <div className="flex justify-between border-t border-green-200 pt-2">
                            <span className="font-medium text-muted-foreground">المبلغ المتبقي:</span>
                            <span className="font-semibold text-green-800">{formatCurrency(Math.max(0, remainingAfterReservation))}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              } else {
                // Installment Payment Details
                // If no offer selected but we have available offers, show message
                if (!selectedOffer && availableOffers.length > 0) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-xs text-yellow-800">يرجى اختيار عرض الدفع من القائمة أعلاه لعرض التفاصيل</p>
                    </div>
                  )
                }
                
                // If no offer selected and no offers available, use house price_installment for basic calculation
                if (!selectedOffer) {
                  // Calculate basic installment info from house price_installment
                  const advanceAmount = 0 // No advance if no offer
                  const advanceAfterReservation = 0
                  const remainingForInstallments = Math.max(0, price - companyFeeAmount)
                  
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <p className="font-semibold text-blue-800 text-sm mb-2">تفاصيل البيع (بالتقسيط):</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">السعر الإجمالي:</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(price)}</span>
                        </div>
                        {companyFeePercentage > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">عمولة الشركة ({companyFeePercentage}%):</span>
                            <span className="font-medium text-blue-700">{formatCurrency(companyFeeAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-green-700">
                          <span>العربون (مدفوع عند الحجز):</span>
                          <span className="font-medium">{formatCurrency(reservation)}</span>
                        </div>
                        <div className="flex justify-between text-blue-700 font-medium mt-1">
                          <span>المتبقي للتقسيط (بدون العمولة):</span>
                          <span className="font-semibold">{formatCurrency(remainingForInstallments)}</span>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-2">
                          <p className="text-xs text-yellow-800">ملاحظة: لا يوجد عرض تقسيط محدد لهذا المنزل. يرجى إضافة عرض في صفحة تعديل المنزل لتحديد التسبقة والأقساط.</p>
                        </div>
                      </div>
                    </div>
                  )
                }
                
                // Calculate with selected offer
                // Use installment price as base (not full price)
                const installmentPrice = selectedHouse.price_installment
                const advanceAmount = selectedOffer.advance_is_percentage
                  ? (installmentPrice * selectedOffer.advance_amount) / 100
                  : selectedOffer.advance_amount
                
                // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
                const advanceAfterReservation = Math.max(0, advanceAmount - reservation)
                
                // Remaining for installments = Installment Price - Advance - Commission
                // المتبقي للتقسيط = السعر (بالتقسيط) - التسبقة - العمولة
                const remainingForInstallments = Math.max(0, installmentPrice - advanceAmount - companyFeeAmount)
                
                // Calculate months and monthly payment
                // IMPORTANT: Prioritize number_of_months if set - this was the primary input method
                // Only calculate from monthly_payment if number_of_months is not set
                let numberOfMonths = 0
                let monthlyAmount = 0
                
                if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
                  // Use number_of_months directly - this is the primary input
                  numberOfMonths = selectedOffer.number_of_months
                  monthlyAmount = remainingForInstallments > 0
                    ? remainingForInstallments / selectedOffer.number_of_months
                    : 0
                } else if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
                  // Calculate number of months from monthly payment only if number_of_months is not set
                  monthlyAmount = selectedOffer.monthly_payment
                  numberOfMonths = remainingForInstallments > 0
                    ? Math.ceil(remainingForInstallments / selectedOffer.monthly_payment)
                    : 0
                }
                
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-blue-800 text-sm mb-2">تفاصيل البيع (بالتقسيط):</p>
                    <div className="bg-white rounded p-3 border border-blue-100 space-y-2 text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-medium text-xs">{selectedHouse.name}</p>
                          <p className="text-muted-foreground text-xs">{selectedHouse.place}</p>
                          {selectedOffer.offer_name && (
                            <p className="text-blue-600 text-xs mt-1">✓ {selectedOffer.offer_name}</p>
                          )}
                        </div>
                        <p className="font-semibold text-blue-700 text-xs">{formatCurrency(price)}</p>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5 pl-2">
                        <div className="text-green-700">العربون (مدفوع): {formatCurrency(reservation)}</div>
                        <div className="text-purple-700 font-medium border-t border-purple-200 pt-1 mt-1">المستحق عند التأكيد:</div>
                        <div className="text-xs text-purple-700 pl-2">التسبقة: {formatCurrency(advanceAmount)}</div>
                        {reservation > 0 && (
                          <div className="text-xs text-purple-600 pl-4">(-) العربون: {formatCurrency(reservation)}</div>
                        )}
                        <div className="text-xs text-purple-700 pl-2 border-t border-purple-100 pt-0.5 mt-0.5">= التسبقة (بعد خصم العربون): {formatCurrency(advanceAfterReservation)}</div>
                        <div className="text-xs text-purple-700 pl-2">+ العمولة ({companyFeePercentage}%): {formatCurrency(companyFeeAmount)}</div>
                        <div className="text-xs text-purple-800 font-semibold pl-2 border-t border-purple-200 pt-0.5 mt-0.5">= المستحق عند التأكيد: {formatCurrency(advanceAfterReservation + companyFeeAmount)}</div>
                        <div className="text-blue-700 font-medium mt-1">المتبقي للتقسيط (بدون العمولة): {formatCurrency(remainingForInstallments)}</div>
                        {monthlyAmount > 0 && (
                          <div>المبلغ الشهري: {formatCurrency(monthlyAmount)}</div>
                        )}
                        {numberOfMonths > 0 && (
                          <div className="font-medium text-blue-700">عدد الأشهر: {numberOfMonths} شهر</div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-blue-200 pt-2 mt-2">
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>السعر الإجمالي:</span>
                          <span className="font-medium">{formatCurrency(price)}</span>
                        </div>
                        <div className="flex justify-between text-green-700">
                          <span>العربون (مدفوع عند الحجز):</span>
                          <span className="font-medium">{formatCurrency(reservation)}</span>
                        </div>
                        <div className="border-t border-purple-200 pt-1 mt-1 space-y-1">
                          <div className="flex justify-between text-purple-700 font-medium">
                            <span>المستحق عند التأكيد:</span>
                          </div>
                          <div className="flex justify-between pl-2 text-purple-700">
                            <span>التسبقة:</span>
                            <span className="font-medium">{formatCurrency(advanceAmount)}</span>
                          </div>
                          {reservation > 0 && (
                            <div className="flex justify-between pl-4 text-purple-600">
                              <span>(-) العربون:</span>
                              <span className="font-medium">{formatCurrency(reservation)}</span>
                            </div>
                          )}
                          <div className="flex justify-between pl-2 text-purple-700 border-t border-purple-100 pt-0.5">
                            <span>= التسبقة (بعد خصم العربون):</span>
                            <span className="font-medium">{formatCurrency(advanceAfterReservation)}</span>
                          </div>
                          <div className="flex justify-between pl-2 text-purple-700">
                            <span>+ العمولة ({companyFeePercentage.toFixed(1)}%):</span>
                            <span className="font-medium">{formatCurrency(companyFeeAmount)}</span>
                          </div>
                          <div className="flex justify-between pl-2 text-purple-800 font-semibold border-t border-purple-200 pt-0.5">
                            <span>= المستحق عند التأكيد:</span>
                            <span className="font-semibold">{formatCurrency(advanceAfterReservation + companyFeeAmount)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-blue-700 font-medium mt-1">
                          <span>المتبقي للتقسيط (بدون العمولة):</span>
                          <span className="font-semibold">{formatCurrency(remainingForInstallments)}</span>
                        </div>
                        {monthlyAmount > 0 && (
                          <div className="flex justify-between">
                            <span>المبلغ الشهري:</span>
                            <span className="font-medium">{formatCurrency(monthlyAmount)}</span>
                          </div>
                        )}
                        {numberOfMonths > 0 && (
                          <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
                            <span className="font-medium">عدد الأشهر:</span>
                            <span className="font-semibold text-blue-800">{numberOfMonths} شهر</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-blue-100">
                          <p className="font-medium mb-1">ملاحظة:</p>
                          <p>• العربون: مبلغ يتم دفعه عند إنشاء البيع (الحجز)</p>
                          <p>• التسبقة + العمولة: تُدفع عند تأكيد البيع</p>
                          {numberOfMonths > 0 && (
                            <p>• المبلغ المتبقي: يتم تقسيطه على {numberOfMonths} شهر بمبلغ {formatCurrency(monthlyAmount)} شهرياً</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }
            })()}
          </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setSaleDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={createSale} 
              disabled={!newClient || creatingSale}
              className="w-full sm:w-auto"
            >
              {creatingSale ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={(open) => {
        setClientDialogOpen(open)
        if (!open) {
          // Reset form when dialog closes
          setClientForm({
            name: '',
            cin: '',
            phone: '',
            email: '',
            address: '',
            client_type: 'Individual',
            notes: '',
          })
          setFoundClient(null)
          setNewClient(null)
          setClientSearchStatus('idle')
        } else {
          // Clear found client when dialog opens (so message only shows after search)
          setFoundClient(null)
          setClientSearchStatus('idle')
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="clientCIN" className="text-sm">رقم الهوية *</Label>
              <div className="relative">
                <Input
                  id="clientCIN"
                  value={clientForm.cin}
                  onChange={(e) => {
                    const newCIN = e.target.value
                    setClientForm({ ...clientForm, cin: newCIN })
                    // Clear found client if CIN changes and doesn't match
                    if (foundClient && newCIN !== foundClient.cin) {
                      setFoundClient(null)
                      setNewClient(null)
                      setClientSearchStatus('idle')
                      // Also clear name if it was auto-filled from search
                      if (foundClient.name && clientForm.name === foundClient.name) {
                        setClientForm(prev => ({ ...prev, name: '' }))
                      }
                    }
                    // Trigger search by CIN
                    debouncedCINSearch(newCIN)
                  }}
                  placeholder="رقم الهوية"
                  className={`h-9 ${searchingClient ? 'pr-10' : ''} ${clientSearchStatus === 'found' ? 'border-green-500' : clientSearchStatus === 'not_found' ? 'border-blue-300' : ''}`}
                  autoFocus
                />
                {searchingClient && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  </div>
                )}
                {!searchingClient && clientForm.cin && clientForm.cin.trim().length >= 2 && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    {clientSearchStatus === 'found' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {clientSearchStatus === 'not_found' && (
                      <XCircle className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                )}
              </div>
              {foundClient && clientForm.cin && clientForm.cin.trim().length >= 2 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 mt-1">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-green-800 flex-1">
                      <p className="font-medium mb-0.5">✓ تم العثور على عميل: {foundClient.name}</p>
                      <p className="text-xs">CIN: {foundClient.cin} {foundClient.phone && `| الهاتف: ${foundClient.phone}`}</p>
                      <p className="text-xs mt-1">تم ملء البيانات تلقائياً. يمكنك تعديلها أو المتابعة.</p>
                    </div>
                  </div>
                </div>
              )}
              {clientSearchStatus === 'not_found' && !foundClient && clientForm.cin && clientForm.cin.trim().length >= 4 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-1">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800">
                      <p className="font-medium mb-0.5">لا يوجد عميل بهذا الرقم</p>
                      <p className="text-xs">يمكنك المتابعة لإضافة عميل جديد.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientName" className="text-sm">الاسم *</Label>
              <Input
                id="clientName"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="اسم العميل"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientPhone" className="text-sm">رقم الهاتف *</Label>
              <Input
                id="clientPhone"
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                placeholder="مثال: 5822092120192614/10/593"
                className="h-9"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientEmail" className="text-sm">البريد الإلكتروني</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="البريد الإلكتروني (اختياري)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientAddress" className="text-sm">العنوان</Label>
              <Input
                id="clientAddress"
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                placeholder="العنوان (اختياري)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientType" className="text-sm">نوع العميل</Label>
              <Select
                value={clientForm.client_type}
                onChange={(e) => setClientForm({ ...clientForm, client_type: e.target.value as 'Individual' | 'Company' })}
              >
                <option value="Individual">فردي</option>
                <option value="Company">شركة</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientNotes" className="text-sm">ملاحظات</Label>
              <Textarea
                id="clientNotes"
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                placeholder="ملاحظات (اختياري)"
                className="min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={async () => {
                // If client found, use it directly, otherwise create new
                if (foundClient) {
                  // Set newClient first
                  setNewClient(foundClient)
                  // Close client dialog first
                  setClientDialogOpen(false)
                  // Wait a bit to ensure state is updated, then open sale dialog
                  setTimeout(() => {
                    // Double-check that newClient is set, if not, set it again
                    setNewClient(prev => prev || foundClient)
                    setSaleDialogOpen(true)
                  }, 200)
                } else {
                  await handleCreateClient()
                }
              }}
              disabled={savingClient || searchingClient || !clientForm.name || !clientForm.cin || !clientForm.phone}
            >
              {savingClient ? 'جاري الحفظ...' : searchingClient ? 'جاري البحث...' : foundClient ? 'استخدام والمتابعة' : 'حفظ والمتابعة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteHouse}
        title={t('common.deleteConfirm')}
        description={t('homes.deleteHouseConfirm')}
      />
    </div>
  )
}

