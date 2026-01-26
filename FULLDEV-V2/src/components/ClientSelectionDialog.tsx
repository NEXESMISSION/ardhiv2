import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert } from './ui/alert'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

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
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setSearchStatus('idle')
      setName('')
      setPhone('')
      setEmail('')
      setAddress('')
      setClientType('individual')
    }
  }, [open])

  // Auto-search when CIN is entered (debounced)
  useEffect(() => {
    if (!open || !cin.trim() || cin.length < 4) {
      setSearchStatus('idle')
      setFoundClient(null)
      return
    }

    const searchTimeout = setTimeout(async () => {
      await handleSearch()
    }, 500) // Debounce: wait 500ms after user stops typing

    return () => clearTimeout(searchTimeout)
  }, [cin, open])

  async function handleSearch() {
    if (!cin.trim() || cin.length < 4) {
      setSearchStatus('idle')
      setFoundClient(null)
      return
    }

    setSearching(true)
    setError(null)
    setSearchStatus('searching')
    setFoundClient(null)

    try {
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, id_number, name, phone, email, address, type')
        .eq('id_number', cin.trim())
        .maybeSingle()

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
    } finally {
      setSearching(false)
    }
  }

  async function handleCreateClient() {
    if (!name.trim()) {
      setError('اسم العميل مطلوب')
      return
    }
    if (!phone.trim()) {
      setError('رقم الهاتف مطلوب')
      return
    }
    if (!cin.trim()) {
      setError('رقم الهوية مطلوب')
      return
    }

    setCreating(true)
    setError(null)

    try {
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

      if (err) throw err

      if (data) {
        setFoundClient(data)
        setSearchStatus('found')
        // Immediately use the created client
        onClientSelected(data)
      }
    } catch (e: any) {
      setError(e.message || 'فشل إنشاء العميل')
    } finally {
      setCreating(false)
    }
  }

  function handleSelectClient() {
    if (foundClient) {
      onClientSelected(foundClient)
      // Don't call onClose here - let the parent handle closing
    }
  }

  function handleUseClient() {
    if (foundClient) {
      onClientSelected(foundClient)
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
        {searchStatus === 'not-found' && cin.trim().length >= 4 && (
          <div className="p-1.5 sm:p-2 bg-orange-50 border border-orange-200 rounded">
            <p className="text-xs text-orange-600">⚠ العميل غير موجود - يمكنك ملء البيانات وإنشاء عميل جديد</p>
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
              <p className="text-xs text-gray-500">سيتم البحث تلقائياً عند إدخال 4 أرقام على الأقل</p>
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

