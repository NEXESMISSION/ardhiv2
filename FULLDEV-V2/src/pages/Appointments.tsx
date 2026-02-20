import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { NotificationDialog } from '@/components/ui/notification-dialog'
import { formatDate, formatDateShort } from '@/utils/priceCalculator'
import { IconButton } from '@/components/ui/icon-button'
import { logAppointmentCreated, logAppointmentUpdated, logAppointmentDeleted, getAuditLogs, type AuditLog } from '@/utils/auditLog'
import { useLanguage } from '@/i18n/context'
import { replaceVars } from '@/utils/replaceVars'

interface Appointment {
  id: string
  sale_id: string
  client_id: string
  appointment_date: string
  appointment_time: string
  notes: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  created_at: string
  updated_at: string
  sale?: {
    id: string
    sale_price: number
    deposit_amount: number | null
    payment_method: 'full' | 'installment' | 'promise' | null
    payment_offer_id: string | null
    piece?: {
      piece_number: string
      surface_m2: number
    }
    batch?: {
      name: string
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
  }
  client?: {
    id: string
    name: string
    id_number: string
    phone: string
  }
}

const englishDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function AppointmentsPage() {
  const { systemUser } = useAuth()
  const { t } = useLanguage()
  const isOwner = systemUser?.role === 'owner'
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [dateAppointmentsDialogOpen, setDateAppointmentsDialogOpen] = useState(false)
  const [dialogSelectedDate, setDialogSelectedDate] = useState<Date | null>(null)
  const [addAppointmentDialogOpen, setAddAppointmentDialogOpen] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('09:00')
  const [appointmentNotes, setAppointmentNotes] = useState('')
  const [selectedSaleId, setSelectedSaleId] = useState<string>('')
  const [availableSales, setAvailableSales] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [appointmentDetailsDialogOpen, setAppointmentDetailsDialogOpen] = useState(false)
  const [isEditingAppointment, setIsEditingAppointment] = useState(false)
  const [editAppointmentDate, setEditAppointmentDate] = useState('')
  const [editAppointmentTime, setEditAppointmentTime] = useState('')
  const [updatingAppointment, setUpdatingAppointment] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)

  useEffect(() => {
    loadAppointments()
    loadAvailableSales()

    // Listen for refresh events
    const handlePageRefresh = () => {
      loadAppointments()
      loadAvailableSales()
    }

    const handleAppointmentCreated = () => {
      loadAppointments()
      loadAvailableSales()
    }

    // Listen for page visibility changes (when user navigates back to this page)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAppointments()
        loadAvailableSales()
      }
    }

    window.addEventListener('pageRefresh', handlePageRefresh)
    window.addEventListener('appointmentCreated', handleAppointmentCreated)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Real-time subscription for appointments
    const channel = supabase
      .channel('appointments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
        },
        (payload) => {
          console.log('Real-time appointment change:', payload.eventType)
          loadAppointments()
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener('pageRefresh', handlePageRefresh)
      window.removeEventListener('appointmentCreated', handleAppointmentCreated)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [])

  // Load audit logs when appointment is selected
  useEffect(() => {
    if (selectedAppointment && appointmentDetailsDialogOpen) {
      loadAuditLogs(selectedAppointment.id)
    }
  }, [selectedAppointment, appointmentDetailsDialogOpen])

  async function loadAuditLogs(appointmentId: string) {
    setLoadingAuditLogs(true)
    try {
      const logs = await getAuditLogs('appointment', appointmentId)
      setAuditLogs(logs)
    } catch (error) {
      console.error('Error loading audit logs:', error)
    } finally {
      setLoadingAuditLogs(false)
    }
  }

  async function loadAppointments() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('appointments')
        .select(`
          *,
          sales:sale_id (
            id,
            sale_price,
            deposit_amount,
            payment_method,
            payment_offer_id,
            payment_offers:payment_offer_id (
              id,
              name,
              price_per_m2_installment,
              advance_mode,
              advance_value,
              calc_mode,
              monthly_amount,
              months
            ),
            land_pieces:land_piece_id (
              piece_number,
              surface_m2
            ),
            land_batches:batch_id (
              name
            )
          ),
          clients:client_id (
            id,
            name,
            id_number,
            phone
          )
        `)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      if (err) {
        console.error('Error loading appointments:', err)
        throw err
      }

      console.log('Loaded appointments:', data?.length || 0, 'appointments')
      if (data && data.length > 0) {
        console.log('Sample appointment dates:', data.slice(0, 3).map((apt: any) => ({
          id: apt.id,
          raw_date: apt.appointment_date,
          sale_id: apt.sale_id
        })))
      }

      // Format appointments with nested data
      const formattedAppointments = (data || []).map((apt: any) => {
        const sale = Array.isArray(apt.sales) ? apt.sales[0] : apt.sales
        const client = Array.isArray(apt.clients) ? apt.clients[0] : apt.clients
        const piece = sale?.land_pieces ? (Array.isArray(sale.land_pieces) ? sale.land_pieces[0] : sale.land_pieces) : null
        const batch = sale?.land_batches ? (Array.isArray(sale.land_batches) ? sale.land_batches[0] : sale.land_batches) : null
        const payment_offer = sale?.payment_offers ? (Array.isArray(sale.payment_offers) ? sale.payment_offers[0] : sale.payment_offers) : null

        // Infer payment_method from payment_offer_id if payment_method is null
        let inferredPaymentMethod = sale?.payment_method
        if (!inferredPaymentMethod && (sale?.payment_offer_id || payment_offer)) {
          inferredPaymentMethod = 'installment'
        }

        // Ensure appointment_date is in YYYY-MM-DD format
        let appointmentDate = apt.appointment_date
        if (appointmentDate) {
          // If it contains 'T', it's a timestamp - extract just the date part
          if (appointmentDate.includes('T')) {
            appointmentDate = appointmentDate.split('T')[0]
          }
          // Validate it's in YYYY-MM-DD format (10 characters)
          // If not, try to parse it, but avoid timezone conversion issues
          if (appointmentDate.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
            // Try parsing, but use local date components to avoid timezone shift
            const dateObj = new Date(appointmentDate + 'T12:00:00') // Use noon to avoid timezone edge cases
            if (!isNaN(dateObj.getTime())) {
              const year = dateObj.getFullYear()
              const month = String(dateObj.getMonth() + 1).padStart(2, '0')
              const day = String(dateObj.getDate()).padStart(2, '0')
              appointmentDate = `${year}-${month}-${day}`
            }
          }
        }

        return {
          ...apt,
          appointment_date: appointmentDate, // Normalize date format
          sale: sale ? {
            ...sale,
            payment_method: inferredPaymentMethod || sale.payment_method,
            piece,
            batch,
            payment_offer
          } : null,
          client
        }
      })

      console.log('Formatted appointments:', formattedAppointments.length)
      setAppointments(formattedAppointments)
    } catch (e: any) {
      console.error('Error in loadAppointments:', e)
      setError(e.message || t('appointments.loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function loadAvailableSales() {
    try {
      const { data, error: err } = await supabase
        .from('sales')
        .select(`
          id,
          client_id,
          sale_price,
          clients:client_id (
            id,
            name
          ),
          land_pieces:land_piece_id (
            piece_number
          ),
          land_batches:batch_id (
            name
          )
        `)
        .eq('status', 'pending')
        .not('client_id', 'is', null)
        .order('created_at', { ascending: false })

      if (err) throw err

      const formattedSales = (data || []).map((sale: any) => {
        const client = Array.isArray(sale.clients) ? sale.clients[0] : sale.clients
        const piece = Array.isArray(sale.land_pieces) ? sale.land_pieces[0] : sale.land_pieces
        const batch = Array.isArray(sale.land_batches) ? sale.land_batches[0] : sale.land_batches

        return {
          ...sale,
          client,
          piece,
          batch
        }
      })

      setAvailableSales(formattedSales)
    } catch (e: any) {
      console.error('Error loading available sales:', e)
    }
  }

  // Get appointments for a specific date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    appointments.forEach(apt => {
      // Normalize date to YYYY-MM-DD format
      let dateKey = apt.appointment_date
      if (dateKey) {
        // Handle different date formats
        if (dateKey.includes('T')) {
          dateKey = dateKey.split('T')[0]
        }
        // Validate it's in YYYY-MM-DD format (10 characters)
        // If already in correct format, use it directly to avoid timezone conversion issues
        if (dateKey.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          // Already in YYYY-MM-DD format, use it directly
        } else {
          // Try parsing, but use local date components to avoid timezone shift
          const dateObj = new Date(dateKey + 'T12:00:00') // Use noon to avoid timezone edge cases
          if (!isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear()
            const month = String(dateObj.getMonth() + 1).padStart(2, '0')
            const day = String(dateObj.getDate()).padStart(2, '0')
            dateKey = `${year}-${month}-${day}`
          }
        }
        
        if (!map.has(dateKey)) {
          map.set(dateKey, [])
        }
        map.get(dateKey)!.push(apt)
      }
    })
    console.log('Appointments by date map:', Array.from(map.entries()).map(([date, apts]) => `${date}: ${apts.length}`))
    return map
  }, [appointments])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDate.getDay()) // Start from Sunday

    const days: Date[] = []
    const current = new Date(startDate)
    const endDate = new Date(lastDay)
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay())) // End on Saturday

    while (current <= endDate) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return days
  }, [currentMonth, currentYear])

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentYear, currentMonth + direction, 1)
    setCurrentMonth(newDate.getMonth())
    setCurrentYear(newDate.getFullYear())
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentMonth(today.getMonth())
    setCurrentYear(today.getFullYear())
  }

  const getAppointmentsForDate = (date: Date): Appointment[] => {
    // Use local date components instead of toISOString() to avoid timezone shifts
    // This ensures that clicking on Feb 21 shows appointments for Feb 21, not Feb 20 or 22
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    return appointmentsByDate.get(dateKey) || []
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'no_show':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled':
        return t('appointments.statusScheduled')
      case 'completed':
        return t('appointments.statusCompleted')
      case 'cancelled':
        return t('appointments.statusCancelled')
      case 'no_show':
        return t('appointments.statusNoShow')
      default:
        return status
    }
  }

  async function handleAddAppointment() {
    if (!appointmentDate || !appointmentTime || !selectedSaleId) return

    setSaving(true)
    try {
      // Get sale to get client_id
      const selectedSale = availableSales.find(s => s.id === selectedSaleId)
      if (!selectedSale) throw new Error(t('appointments.saleNotFound'))

      // Validate client_id exists
      if (!selectedSale.client_id) {
        throw new Error(t('appointments.saleNoClientId'))
      }

      // Build appointment data - include created_by/updated_by only if columns exist
      const appointmentData: any = {
        sale_id: selectedSaleId,
        client_id: selectedSale.client_id,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        notes: appointmentNotes.trim() || null,
        status: 'scheduled',
      }

      // Try to include created_by/updated_by if migration has been run
      if (systemUser?.id) {
        appointmentData.created_by = systemUser.id
        appointmentData.updated_by = systemUser.id
      }

      let insertedData: any = null
      const { data, error: appointmentError } = await supabase
        .from('appointments')
        .insert(appointmentData)
        .select()
        .single()

      if (appointmentError) {
        // If error is about missing columns, retry without them
        if (appointmentError.message?.includes('updated_by') || appointmentError.message?.includes('created_by')) {
          const { data: retryData, error: retryError } = await supabase
        .from('appointments')
        .insert({
          sale_id: selectedSaleId,
          client_id: selectedSale.client_id,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          notes: appointmentNotes.trim() || null,
              status: 'scheduled',
            })
            .select()
            .single()
          
          if (retryError) throw retryError
          insertedData = retryData
        } else {
          throw appointmentError
        }
      } else {
        insertedData = data
      }

      // Log the creation if we have inserted data
      if (insertedData) {
        await logAppointmentCreated(
          insertedData.id,
          appointmentData,
          systemUser?.id,
          systemUser?.email,
          systemUser?.name || systemUser?.email
        )
      }

      setSuccessMessage(t('appointments.addSuccess'))
      setShowSuccessDialog(true)
      setAddAppointmentDialogOpen(false)
      setAppointmentDate('')
      setAppointmentTime('09:00')
      setAppointmentNotes('')
      setSelectedSaleId('')
      loadAppointments()
    } catch (e: any) {
      setErrorMessage(e.message || t('appointments.addError'))
      setShowErrorDialog(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAppointment(appointment: Appointment) {
    if (!confirm(t('appointments.deleteConfirm'))) {
      return
    }

    try {
      // Log the deletion before deleting
      await logAppointmentDeleted(
        appointment.id,
        {
          sale_id: appointment.sale_id,
          client_id: appointment.client_id,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          notes: appointment.notes,
          status: appointment.status
        },
        systemUser?.id,
        systemUser?.email,
        systemUser?.name || systemUser?.email
      )

      // Delete the appointment
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointment.id)

      if (error) throw error

      // Reload appointments
      await loadAppointments()
      
      // Close dialogs if open
      setDateAppointmentsDialogOpen(false)
      setAppointmentDetailsDialogOpen(false)
      setSelectedAppointment(null)
    } catch (e: any) {
      console.error('Error deleting appointment:', e)
      alert(t('appointments.deleteError') + ': ' + (e.message || t('appointments.deleteErrorUnknown')))
    }
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl">
      {/* Header - always visible */}
      <div className="mb-3 sm:mb-4 lg:mb-6">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">{t('appointments.title')}</h1>
          <p className="text-xs sm:text-sm text-gray-600">{t('appointments.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        </div>
      )}

      {/* Debug info - show appointment count */}
      {!loading && appointments.length > 0 && (
        <div className="mb-4">
          <Card className="p-2 bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-700">
              تم تحميل {appointments.length} موعد
            </p>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 min-h-[160px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="mt-2 text-xs text-gray-500">{t('appointments.loading')}</p>
          </div>
        </div>
      ) : appointments.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-500 mb-4">{t('appointments.noAppointments')}</p>
          <Button
            variant="primary"
            onClick={() => setAddAppointmentDialogOpen(true)}
            size="sm"
          >
            {t('appointments.addAppointment')}
          </Button>
        </Card>
      ) : (
        <>
      {/* Calendar */}
      <Card className="p-3 sm:p-4 lg:p-6 mb-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconButton
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(-1)}
              className="p-1.5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </IconButton>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              {englishMonths[currentMonth]} {currentYear}
            </h2>
            <IconButton
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(1)}
              className="p-1.5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </IconButton>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={goToToday}
            className="text-xs sm:text-sm"
          >
            {t('appointments.today')}
          </Button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Day Headers */}
          {englishDays.map((day) => (
            <div key={day} className="text-center text-xs sm:text-sm font-semibold text-gray-700 py-1 sm:py-2">
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((date, idx) => {
            const isCurrentMonth = date.getMonth() === currentMonth
            const isToday = date.toDateString() === new Date().toDateString()
            const dateAppointments = getAppointmentsForDate(date)
            const dateKey = date.toISOString().split('T')[0]

            return (
              <div
                key={idx}
                className={`
                  min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 border rounded
                  ${isCurrentMonth ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}
                  ${isToday ? 'ring-2 ring-blue-500' : ''}
                  cursor-pointer hover:bg-blue-50 transition-colors
                `}
                onClick={() => {
                  setDialogSelectedDate(date)
                  setDateAppointmentsDialogOpen(true)
                }}
              >
                <div className={`text-xs sm:text-sm font-medium mb-1 ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dateAppointments.slice(0, 2).map((apt) => (
                    <div
                      key={apt.id}
                      className={`
                        text-[8px] sm:text-[10px] px-1 py-0.5 rounded truncate
                        ${getStatusColor(apt.status)}
                        cursor-pointer
                      `}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedAppointment(apt)
                        setAppointmentDetailsDialogOpen(true)
                      }}
                      title={`${apt.client?.name || ''} - ${apt.appointment_time}`}
                    >
                      {apt.appointment_time} - {apt.client?.name || t('shared.unknown')}
                    </div>
                  ))}
                  {dateAppointments.length > 2 && (
                    <div className="text-[8px] sm:text-[10px] text-gray-500 px-1">
                      +{dateAppointments.length - 2} {t('appointments.more')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
        </>
      )}

      {/* Date Appointments Dialog */}
      {dialogSelectedDate && (
        <Dialog
          open={dateAppointmentsDialogOpen}
          onClose={() => {
            setDateAppointmentsDialogOpen(false)
            setDialogSelectedDate(null)
          }}
          title={`مواعيد ${formatDate(dialogSelectedDate, { day: 'numeric', month: 'long', year: 'numeric' })}`}
          size="md"
          footer={
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setDateAppointmentsDialogOpen(false)
                  setDialogSelectedDate(null)
                }}
              >
                {t('appointments.close')}
              </Button>
            </div>
          }
        >
          {getAppointmentsForDate(dialogSelectedDate).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">{t('appointments.noAppointmentsForDate')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getAppointmentsForDate(dialogSelectedDate)
                .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setSelectedAppointment(apt)
                          setDateAppointmentsDialogOpen(false)
                          setAppointmentDetailsDialogOpen(true)
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-900">{apt.appointment_time}</span>
                          <Badge className={`text-[10px] ${getStatusColor(apt.status)}`}>
                            {getStatusLabel(apt.status)}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          {apt.client?.name || t('shared.unknown')}
                        </p>
                        <p className="text-xs text-gray-600">
                          {apt.sale?.batch?.name || '-'} - {apt.sale?.piece?.piece_number || '-'}
                        </p>
                        {apt.notes && (
                          <p className="text-xs text-gray-500 mt-1">📝 {apt.notes}</p>
                        )}
                      </div>
                      {isOwner && (
                        <IconButton
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteAppointment(apt)
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                          title={t('appointments.deleteTitle')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Dialog>
      )}

      {/* Add Appointment Dialog */}
      <Dialog
        open={addAppointmentDialogOpen}
        onClose={() => {
          setAddAppointmentDialogOpen(false)
          setAppointmentDate('')
          setAppointmentTime('09:00')
          setAppointmentNotes('')
          setSelectedSaleId('')
        }}
        title={t('appointments.appointmentTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setAddAppointmentDialogOpen(false)
                setAppointmentDate('')
                setAppointmentTime('09:00')
                setAppointmentNotes('')
                setSelectedSaleId('')
              }}
              disabled={saving}
            >
              {t('appointments.cancel')}
            </Button>
            <Button
              onClick={handleAddAppointment}
              disabled={saving || !appointmentDate || !appointmentTime || !selectedSaleId}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800"
            >
              {saving ? t('appointments.saving') : '💾 ' + t('appointments.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">{t('appointments.selectSale')} *</Label>
            <Select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="text-xs sm:text-sm"
            >
              <option value="">{t('appointments.selectSale')}...</option>
              {availableSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.client?.name || t('shared.unknown')} - {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'} (#{sale.id.substring(0, 8)})
                </option>
              ))}
            </Select>
          </div>
          {selectedSaleId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 space-y-1.5 text-xs sm:text-sm">
              {(() => {
                const selectedSale = availableSales.find(s => s.id === selectedSaleId)
                return selectedSale ? (
                  <>
                    <p><span className="font-medium text-blue-900">{t('appointments.client')}:</span> <span className="text-gray-700">{selectedSale.client?.name || t('shared.unknown')}</span></p>
                    <p><span className="font-medium text-blue-900">{t('appointments.saleNumber')}:</span> <span className="text-gray-700">#{selectedSale.id.substring(0, 8)}</span></p>
                  </>
                ) : null
              })()}
            </div>
          )}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">{t('appointments.date')} *</Label>
            <Input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">{t('appointments.time')} *</Label>
            <Input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">{t('appointments.notes')}</Label>
            <Textarea
              value={appointmentNotes}
              onChange={(e) => setAppointmentNotes(e.target.value)}
              placeholder={t('appointments.notesPlaceholder')}
              rows={3}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
        </div>
      </Dialog>

      {/* Appointment Details Dialog */}
      {selectedAppointment && (
        <Dialog
          open={appointmentDetailsDialogOpen}
          onClose={() => {
            setAppointmentDetailsDialogOpen(false)
            setSelectedAppointment(null)
            setIsEditingAppointment(false)
          }}
          title={isEditingAppointment ? "تعديل الموعد" : "تفاصيل الموعد"}
          size="md"
          footer={
            <div className="flex justify-end gap-3">
              {isEditingAppointment ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsEditingAppointment(false)
                      setEditAppointmentDate('')
                      setEditAppointmentTime('')
                    }}
                    disabled={updatingAppointment}
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!editAppointmentDate || !editAppointmentTime) {
                        setErrorMessage('يرجى ملء التاريخ والوقت')
                        setShowErrorDialog(true)
                        return
                      }

                      setUpdatingAppointment(true)
                      try {
                        // Store old values for audit log
                        const oldValues = {
                          appointment_date: selectedAppointment.appointment_date,
                          appointment_time: selectedAppointment.appointment_time,
                        }

                        const newValues = {
                          appointment_date: editAppointmentDate,
                          appointment_time: editAppointmentTime,
                        }

                        // Calculate changes
                        const changes: Record<string, any> = {}
                        if (oldValues.appointment_date !== newValues.appointment_date) {
                          changes.appointment_date = {
                            old: oldValues.appointment_date,
                            new: newValues.appointment_date,
                          }
                        }
                        if (oldValues.appointment_time !== newValues.appointment_time) {
                          changes.appointment_time = {
                            old: oldValues.appointment_time,
                            new: newValues.appointment_time,
                          }
                        }

                        // Build update data - start without updated_by to avoid errors
                        // Only add updated_by if we're sure the column exists (after migration)
                        const updateData: any = {
                          appointment_date: editAppointmentDate,
                          appointment_time: editAppointmentTime,
                          updated_at: new Date().toISOString(),
                        }

                        // Try to include updated_by if migration has been run
                        // But catch errors and retry without it
                        let updateSucceeded = false

                        // First try with updated_by if we have systemUser
                        if (systemUser?.id) {
                          const { error: err } = await supabase
                            .from('appointments')
                            .update({
                              ...updateData,
                              updated_by: systemUser.id,
                            })
                            .eq('id', selectedAppointment.id)

                          if (err) {
                            // Check if it's a column error
                            const errorMsg = (err.message || '').toLowerCase()
                            const errorCode = err.code || ''
                            const errorStr = JSON.stringify(err).toLowerCase()
                            
                            // If it's NOT a column error, throw immediately
                            if (!errorMsg.includes('updated_by') && 
                                errorCode !== 'PGRST204' && 
                                errorCode !== '42703' && 
                                !errorMsg.includes('schema cache') && 
                                !errorMsg.includes('column') && 
                                !errorMsg.includes('does not exist') &&
                                !errorStr.includes('updated_by') && 
                                !errorStr.includes('42703')) {
                              throw err
                            }
                            // Otherwise, we'll retry without updated_by below
                          } else {
                            updateSucceeded = true
                          }
                        }

                        // If first attempt failed or we don't have systemUser, try without updated_by
                        if (!updateSucceeded) {
                          const { error: retryError } = await supabase
                            .from('appointments')
                            .update(updateData)
                            .eq('id', selectedAppointment.id)

                          if (retryError) {
                            throw retryError
                          }
                          updateSucceeded = true
                        }

                        // Log the update
                        await logAppointmentUpdated(
                          selectedAppointment.id,
                          oldValues,
                          newValues,
                          changes,
                          systemUser?.id,
                          systemUser?.email,
                          systemUser?.name || systemUser?.email
                        )

                        setSuccessMessage('تم تحديث الموعد بنجاح!')
                        setShowSuccessDialog(true)
                        setIsEditingAppointment(false)
                        setEditAppointmentDate('')
                        setEditAppointmentTime('')
                        loadAppointments()
                        // Reload audit logs if dialog is still open
                        if (selectedAppointment) {
                          loadAuditLogs(selectedAppointment.id)
                        }
                      } catch (e: any) {
                        setErrorMessage(e.message || 'فشل تحديث الموعد')
                        setShowErrorDialog(true)
                      } finally {
                        setUpdatingAppointment(false)
                      }
                    }}
                    disabled={updatingAppointment || !editAppointmentDate || !editAppointmentTime}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {updatingAppointment ? 'جاري الحفظ...' : '💾 حفظ'}
                  </Button>
                </>
              ) : (
                <>
              <Button
                variant="secondary"
                onClick={() => {
                  setAppointmentDetailsDialogOpen(false)
                  setSelectedAppointment(null)
                }}
              >
                {t('appointments.close')}
              </Button>
                  <Button
                    onClick={() => {
                      setIsEditingAppointment(true)
                      setEditAppointmentDate(selectedAppointment.appointment_date)
                      setEditAppointmentTime(selectedAppointment.appointment_time)
                    }}
                  >
                    ✏️ {t('appointments.editTime')}
                  </Button>
                </>
              )}
            </div>
          }
        >
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 space-y-1.5 text-xs sm:text-sm">
              <p><span className="font-medium text-blue-900">{t('appointments.client')}:</span> <span className="text-gray-700">{selectedAppointment.client?.name || t('shared.unknown')}</span></p>
              <p><span className="font-medium text-blue-900">{t('clients.idNumber')}:</span> <span className="text-gray-700">{selectedAppointment.client?.id_number || '-'}</span></p>
              <p><span className="font-medium text-blue-900">{t('clients.phone')}:</span> <span className="text-gray-700">{selectedAppointment.client?.phone || '-'}</span></p>
            </div>
            {isEditingAppointment ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">
                    {t('appointments.date')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={editAppointmentDate}
                    onChange={(e) => setEditAppointmentDate(e.target.value)}
                    className="text-xs sm:text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">
                    {t('appointments.time')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="time"
                    value={editAppointmentTime}
                    onChange={(e) => setEditAppointmentTime(e.target.value)}
                    className="text-xs sm:text-sm"
                  />
                </div>
              </div>
            ) : (
            <div className="space-y-1.5 text-xs sm:text-sm">
              <p><span className="font-medium text-gray-700">{t('appointments.date')}:</span> {formatDate(selectedAppointment.appointment_date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p><span className="font-medium text-gray-700">{t('appointments.time')}:</span> {selectedAppointment.appointment_time}</p>
              <p><span className="font-medium text-gray-700">{t('appointments.status')}:</span> <Badge className={getStatusColor(selectedAppointment.status)}>{getStatusLabel(selectedAppointment.status)}</Badge></p>
              {selectedAppointment.sale && (
                <>
                  <p><span className="font-medium text-gray-700">{t('appointments.piece')}:</span> {selectedAppointment.sale.batch?.name || '-'} - {selectedAppointment.sale.piece?.piece_number || '-'}</p>
                  <p><span className="font-medium text-gray-700">{t('appointments.surface')}:</span> {selectedAppointment.sale.piece?.surface_m2.toLocaleString() || '-'} م²</p>
                  <p><span className="font-medium text-gray-700">{t('appointments.salePrice')}:</span> {selectedAppointment.sale.sale_price.toLocaleString()} دت</p>
                  {selectedAppointment.sale.deposit_amount && (
                    <p><span className="font-medium text-gray-700">{t('appointments.deposit')}:</span> {selectedAppointment.sale.deposit_amount.toLocaleString()} دت</p>
                  )}
                  <p><span className="font-medium text-gray-700">{t('appointments.paymentMethod')}:</span> {
                    (() => {
                      const method = selectedAppointment.sale.payment_method
                      if (method === 'full') return t('appointments.fullPayment')
                      if (method === 'installment') return t('appointments.installmentPayment')
                      if (method === 'promise') return t('appointments.promisePayment')
                      // Infer from payment_offer_id if method is null
                      if (!method && selectedAppointment.sale.payment_offer_id) return t('appointments.installmentPayment')
                      if (!method && selectedAppointment.sale.payment_offer) return t('appointments.installmentPayment')
                      return method || t('shared.unknown')
                    })()
                  }</p>
                  {selectedAppointment.sale.payment_offer && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="font-medium text-gray-700 mb-1">{t('appointments.paymentOffer')}:</p>
                      <div className="text-xs sm:text-sm space-y-1 text-gray-600">
                        <p>• {t('appointments.offerName')}: {selectedAppointment.sale.payment_offer.name || t('appointments.noName')}</p>
                        <p>• {t('appointments.pricePerM2')}: {selectedAppointment.sale.payment_offer.price_per_m2_installment.toLocaleString()} دت</p>
                        <p>• {t('appointments.advance')}: {
                          selectedAppointment.sale.payment_offer.advance_mode === 'fixed' 
                            ? `${selectedAppointment.sale.payment_offer.advance_value.toLocaleString()} دت`
                            : `${selectedAppointment.sale.payment_offer.advance_value}%`
                        }</p>
                        {selectedAppointment.sale.payment_offer.calc_mode === 'monthlyAmount' && selectedAppointment.sale.payment_offer.monthly_amount && (
                          <p>• {t('appointments.monthlyAmount')}: {selectedAppointment.sale.payment_offer.monthly_amount.toLocaleString()} دت</p>
                        )}
                        {selectedAppointment.sale.payment_offer.calc_mode === 'months' && selectedAppointment.sale.payment_offer.months && (
                          <p>• {t('appointments.monthsCount')}: {selectedAppointment.sale.payment_offer.months} {t('appointments.month')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {selectedAppointment.notes && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p><span className="font-medium text-gray-700">{t('appointments.notes')}:</span></p>
                  <p className="text-gray-600">{selectedAppointment.notes}</p>
                </div>
              )}
            </div>
            )}
            
            {/* Audit Log / Change History */}
            {!isEditingAppointment && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-bold text-gray-900 mb-3">📋 سجل التغييرات</h4>
                {loadingAuditLogs ? (
                  <p className="text-xs text-gray-500">جاري التحميل...</p>
                ) : auditLogs.length === 0 ? (
                  <p className="text-xs text-gray-500">لا توجد تغييرات مسجلة</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {log.action === 'created' ? '✅ تم الإنشاء' : 
                               log.action === 'updated' ? '✏️ تم التعديل' : 
                               log.action === 'deleted' ? '🗑️ تم الحذف' : 
                               log.action}
                            </p>
                            <p className="text-gray-600 text-[10px] mt-0.5">
                              {log.user_name || log.user_email || 'مستخدم غير معروف'}
                            </p>
                          </div>
                          <p className="text-gray-500 text-[10px] whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('en-US', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            {Object.entries(log.changes).map(([key, value]: [string, any]) => (
                              <div key={key} className="text-[10px] text-gray-600 mb-1">
                                <span className="font-medium">{key === 'appointment_date' ? 'التاريخ' : key === 'appointment_time' ? 'الوقت' : key}:</span>{' '}
                                <span className="line-through text-red-500">{value.old}</span>{' '}
                                → <span className="text-green-600">{value.new}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Success/Error Dialogs */}
      <NotificationDialog
        open={showSuccessDialog}
        onClose={() => {
          setShowSuccessDialog(false)
          setSuccessMessage('')
        }}
        type="success"
        title="نجح العملية"
        message={successMessage}
      />

      <NotificationDialog
        open={showErrorDialog}
        onClose={() => {
          setShowErrorDialog(false)
          setErrorMessage('')
        }}
        type="error"
        title="فشل العملية"
        message={errorMessage}
      />
    </div>
  )
}
