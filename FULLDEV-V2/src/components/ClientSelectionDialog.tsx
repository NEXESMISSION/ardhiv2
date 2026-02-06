import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert } from './ui/alert'
import { Card } from './ui/card'

interface Client {
  id: string
  id_number: string
  name: string
  phone: string
  email: string | null
  address: string | null
  type: 'individual' | 'company'
}

interface ClientSelectionDialogProps {
  open: boolean
  onClose: () => void
  onClientSelected: (client: Client) => void
}

export function ClientSelectionDialog({ open, onClose, onClientSelected }: ClientSelectionDialogProps) {
  const [cin, setCin] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [foundClient, setFoundClient] = useState<Client | null>(null)
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle')
  
  // New client form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [clientType, setClientType] = useState<'individual' | 'company'>('individual')

  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes
      setCin('')
      setFoundClient(null)
      setError(null)
      setInfo(null)
      setSearchStatus('idle')
      setName('')
      setPhone('')
      setEmail('')
      setAddress('')
      setClientType('individual')
    }
  }, [open])

  // Auto-search when CIN or phone is entered (debounced) - 4+ chars for either
  useEffect(() => {
    const canSearchByCin = open && cin.trim().length >= 4
    const canSearchByPhone = open && phone.trim().length >= 4
    if (!canSearchByCin && !canSearchByPhone) {
      setSearchStatus('idle')
      setFoundClient(null)
      return
    }

    const searchTimeout = setTimeout(async () => {
      await handleSearch()
    }, 500) // Debounce: wait 500ms after user stops typing

    return () => clearTimeout(searchTimeout)
  }, [cin, phone, open])

  async function handleSearch() {
    const cinTrim = cin.trim()
    const phoneTrim = phone.trim()
    const searchByCin = cinTrim.length >= 4
    const searchByPhone = phoneTrim.length >= 4

    if (!searchByCin && !searchByPhone) {
      setSearchStatus('idle')
      setFoundClient(null)
      return
    }

    setError(null)
    setSearchStatus('searching')
    setFoundClient(null)

    try {
      let query = supabase
        .from('clients')
        .select('id, id_number, name, phone, email, address, type')

      if (searchByCin) {
        query = query.eq('id_number', cinTrim)
      } else {
        query = query.eq('phone', phoneTrim)
      }

      const { data, error: err } = await query.maybeSingle()

      if (err) {
        throw err
      } else if (data) {
        // Client found
        setFoundClient(data)
        setSearchStatus('found')
        // Auto-fill form with found client data
        setName(data.name || '')
        setPhone(data.phone || '')
        setEmail(data.email || '')
        setAddress(data.address || '')
        setClientType(data.type || 'individual')
      } else {
        // Client not found
        setFoundClient(null)
        setSearchStatus('not-found')
        // Don't clear name/phone if they were already entered
      }
    } catch (e: any) {
      setError(e.message || 'فشل البحث عن العميل')
      setSearchStatus('not-found')
    }
  }

  // Helper function to check if error is a duplicate error
  function isDuplicateError(error: any): boolean {
    if (!error) return false
    
    const errorMessage = typeof error === 'string' 
      ? error 
      : error?.message || error?.details || error?.hint || JSON.stringify(error)
    
    return (
      errorMessage.includes('duplicate key value violates unique constraint') ||
      errorMessage.includes('clients_id_number_key') ||
      errorMessage.includes('unique constraint') ||
      errorMessage.includes('duplicate') ||
      error?.code === '23505' // PostgreSQL unique violation error code
    )
  }

  // Helper function to fetch existing client by CIN
  async function fetchExistingClient(cinValue: string): Promise<Client | null> {
    try {
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('id, id_number, name, phone, email, address, type')
        .eq('id_number', cinValue.trim())
        .maybeSingle()

      if (fetchError) {
        console.error('Error fetching existing client:', fetchError)
        return null
      }

      return data
    } catch (e) {
      console.error('Exception fetching existing client:', e)
      return null
    }
  }

  async function handleCreateClient() {
    console.log('=== handleCreateClient START ===')
    console.log('Form values:', { cin, name, phone, email, address, clientType })
    
    if (!name.trim()) {
      console.log('ERROR: Name is required')
      setError('اسم العميل مطلوب')
      return
    }
    if (!phone.trim()) {
      console.log('ERROR: Phone is required')
      setError('رقم الهاتف مطلوب')
      return
    }
    if (!cin.trim()) {
      console.log('ERROR: CIN is required')
      setError('رقم الهوية مطلوب')
      return
    }

    console.log('Validation passed, setting creating=true')
    setCreating(true)
    setError(null)
    setInfo(null)

    try {
      // First, check if client already exists before attempting insert
      console.log('Checking if client exists with CIN:', cin.trim())
      const existingClient = await fetchExistingClient(cin.trim())
      console.log('Existing client check result:', existingClient)
      
      if (existingClient) {
        // Client already exists, use it
        console.log('Client already exists, using it:', existingClient)
        setFoundClient(existingClient)
        setSearchStatus('found')
        setInfo('تم العثور على عميل موجود بنفس رقم الهوية - سيتم استخدامه')
        setCreating(false)
        // CRITICAL: Use setTimeout to call callback in a clean execution context
        console.log('Calling onClientSelected via setTimeout for existing client')
        setTimeout(() => {
          console.log('setTimeout fired - calling onClientSelected with:', existingClient)
          onClientSelected(existingClient)
          console.log('onClientSelected completed')
        }, 0)
        return
      }

      // Client doesn't exist, try to create
      console.log('Client does not exist, creating new client...')
      const { data, error: err } = await supabase
        .from('clients')
        .insert({
          id_number: cin.trim(),
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          type: clientType,
        })
        .select()
        .single()

      console.log('Supabase insert result:', { data, error: err })

      if (err) {
        console.log('Supabase error:', err)
        // Check if it's a duplicate error
        if (isDuplicateError(err)) {
          console.log('Duplicate error detected, fetching existing client')
          // Duplicate detected, fetch and use existing client
          const existing = await fetchExistingClient(cin.trim())
          console.log('Fetched existing client:', existing)
          if (existing) {
            setFoundClient(existing)
            setSearchStatus('found')
            setInfo('تم العثور على عميل موجود بنفس رقم الهوية - سيتم استخدامه')
            setCreating(false)
            // CRITICAL: Use setTimeout to call callback in a clean execution context
            console.log('Calling onClientSelected via setTimeout for duplicate-found client')
            setTimeout(() => {
              console.log('setTimeout fired - calling onClientSelected with:', existing)
              onClientSelected(existing)
              console.log('onClientSelected completed')
            }, 0)
            return
          } else {
            // Couldn't fetch existing client, show error
            console.log('Could not fetch existing client after duplicate error')
            setError('حدث خطأ أثناء البحث عن العميل الموجود')
            setCreating(false)
            return
          }
        }
        // Other error, throw it
        console.log('Non-duplicate error, throwing')
        throw err
      }

      if (data) {
        console.log('Client created successfully:', data)
        setFoundClient(data)
        setSearchStatus('found')
        setCreating(false)
        // CRITICAL: Use setTimeout to call callback in a clean execution context
        console.log('Calling onClientSelected via setTimeout for new client')
        setTimeout(() => {
          console.log('setTimeout fired - calling onClientSelected with:', data)
          onClientSelected(data)
          console.log('onClientSelected completed')
        }, 0)
        return
      } else {
        // No data returned from insert, but no error either
        // This can happen due to RLS policies - try to fetch the client we just created
        console.log('No data returned from insert, fetching the created client...')
        const createdClient = await fetchExistingClient(cin.trim())
        console.log('Fetched created client:', createdClient)
        if (createdClient) {
          setFoundClient(createdClient)
          setSearchStatus('found')
          setCreating(false)
          console.log('Calling onClientSelected via setTimeout for fetched-after-insert client')
          setTimeout(() => {
            console.log('setTimeout fired - calling onClientSelected with:', createdClient)
            onClientSelected(createdClient)
            console.log('onClientSelected completed')
          }, 0)
          return
        } else {
          console.log('Could not fetch client after insert')
          setError('تم إنشاء العميل لكن حدث خطأ في استرجاع البيانات')
          setCreating(false)
          return
        }
      }
    } catch (e: any) {
      console.log('Caught exception:', e)
      // Final fallback: check if it's a duplicate error
      if (isDuplicateError(e)) {
        console.log('Exception is duplicate error, trying to fetch existing')
        // Try to fetch existing client one more time
        const existing = await fetchExistingClient(cin.trim())
        console.log('Fetched existing client:', existing)
        if (existing) {
          setFoundClient(existing)
          setSearchStatus('found')
          setInfo('تم العثور على عميل موجود بنفس رقم الهوية - سيتم استخدامه')
          setCreating(false)
          // CRITICAL: Use setTimeout to call callback in a clean execution context
          console.log('Calling onClientSelected via setTimeout for exception-found client')
          setTimeout(() => {
            console.log('setTimeout fired - calling onClientSelected with:', existing)
            onClientSelected(existing)
            console.log('onClientSelected completed')
          }, 0)
          return
        }
      }
      
      // If we get here, it's a real error
      const msg = e.message || ''
      const isRlsError = /row-level security|violates.*policy/i.test(msg)
      const displayMessage = isRlsError
        ? 'لا يوجد صلاحية لإنشاء عميل. يرجى طلب إضافة صلاحية "الأراضي" أو "العملاء" من المسؤول.'
        : (msg || 'فشل إنشاء العميل')
      console.log('Setting error:', displayMessage)
      setError(displayMessage)
    } finally {
      console.log('=== handleCreateClient FINALLY - setting creating=false ===')
      setCreating(false)
    }
  }

  function handleUseClient() {
    console.log('=== handleUseClient called ===')
    console.log('foundClient:', foundClient)
    if (foundClient) {
      console.log('Calling onClientSelected directly (sync) with:', foundClient)
      onClientSelected(foundClient)
      console.log('onClientSelected completed')
    } else {
      console.log('No foundClient to use!')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="اختيار العميل"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          {foundClient ? (
            <Button onClick={handleUseClient}>
              استخدام هذا العميل
            </Button>
          ) : (
            <Button 
              onClick={handleCreateClient} 
              disabled={creating || !cin.trim() || cin.length < 4 || !name.trim() || !phone.trim()}
            >
              {creating ? 'جاري الإنشاء...' : 'إنشاء واستخدام العميل'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
        {error && (
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        )}
        {info && (
          <Alert variant="info" className="text-xs sm:text-sm">{info}</Alert>
        )}

        {/* Status Messages */}
        {searchStatus === 'searching' && (
          <div className="p-1.5 sm:p-2 bg-blue-50 border border-blue-200 rounded">
            <p className="text-xs text-blue-600">جاري البحث عن العميل...</p>
          </div>
        )}
        {searchStatus === 'found' && foundClient && (
          <div className="p-1.5 sm:p-2 bg-green-50 border border-green-200 rounded">
            <p className="text-xs text-green-600">✓ تم العثور على العميل - تم تعبئة البيانات تلقائياً</p>
          </div>
        )}
        {searchStatus === 'not-found' && (cin.trim().length >= 4 || phone.trim().length >= 4) && (
          <div className="p-1.5 sm:p-2 bg-orange-50 border border-orange-200 rounded">
            <p className="text-xs sm:text-sm text-orange-700 font-medium">لم يتم العثور على عميل بهذا رقم الهوية أو رقم الهاتف. يمكنك ملء البيانات أدناه وإنشاء عميل جديد.</p>
          </div>
        )}

        {/* Client Form */}
        <Card className="p-2 sm:p-3 lg:p-4 bg-gray-50 border-gray-200">
          <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">
            {foundClient ? 'معلومات العميل (تم العثور عليها)' : 'معلومات العميل'}
          </h3>
          <div className="space-y-2 sm:space-y-2.5 lg:space-y-3">
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">رقم الهوية (CIN) *</Label>
              <Input
                type="text"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                placeholder="أدخل رقم الهوية"
                size="sm"
                className="text-xs sm:text-sm"
              />
              <p className="text-xs text-gray-500">سيتم البحث تلقائياً عند إدخال 4 أرقام على الأقل (رقم الهوية أو الهاتف)</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم العميل"
                size="sm"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">رقم الهاتف *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="رقم الهاتف"
                size="sm"
                className="text-xs sm:text-sm"
              />
              <p className="text-xs text-gray-500">سيتم البحث تلقائياً عند إدخال 4 أرقام على الأقل</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">البريد الإلكتروني</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني (اختياري)"
                size="sm"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">العنوان</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان (اختياري)"
                size="sm"
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">النوع</Label>
              <select
                value={clientType}
                onChange={(e) => setClientType(e.target.value as 'individual' | 'company')}
                className="w-full px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
              >
                <option value="individual">فرد</option>
                <option value="company">شركة</option>
              </select>
            </div>
          </div>
        </Card>
      </div>
    </Dialog>
  )
}

