import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { NotificationDialog } from '@/components/ui/notification-dialog'
import { logPhoneCallAppointmentCreated, logPhoneCallAppointmentUpdated, getAuditLogs, type AuditLog } from '@/utils/auditLog'
import { useLanguage } from '@/i18n/context'

interface PhoneCallAppointment {
  id: string
  phone_number: string
  name: string
  appointment_datetime: string
  land_batch_id: string | null
  appointment_type: string
  notes: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  created_at: string
  updated_at: string
  land_batch?: {
    id: string
    name: string
  }
}

interface LandBatch {
  id: string
  name: string
}

const englishDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function PhoneCallAppointmentsPage() {
  const { systemUser } = useAuth()
  const { t } = useLanguage()
  const [appointments, setAppointments] = useState<PhoneCallAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [dateAppointmentsDialogOpen, setDateAppointmentsDialogOpen] = useState(false)
  const [dialogSelectedDate, setDialogSelectedDate] = useState<Date | null>(null)
  const [addAppointmentDialogOpen, setAddAppointmentDialogOpen] = useState(false)
  const [appointmentDateTime, setAppointmentDateTime] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [name, setName] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [isMotorizer, setIsMotorizer] = useState(false)
  const [appointmentNotes, setAppointmentNotes] = useState('')
  const [availableBatches, setAvailableBatches] = useState<LandBatch[]>([])
  const [saving, setSaving] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState<PhoneCallAppointment | null>(null)
  const [appointmentDetailsDialogOpen, setAppointmentDetailsDialogOpen] = useState(false)
  const [isEditingAppointment, setIsEditingAppointment] = useState(false)
  const [editAppointmentDateTime, setEditAppointmentDateTime] = useState('')
  const [updatingAppointment, setUpdatingAppointment] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)

  useEffect(() => {
    loadAppointments()
    loadAvailableBatches()
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
      const logs = await getAuditLogs('phone_call_appointment', appointmentId)
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
        .from('phone_call_appointments')
        .select(`
          *,
          land_batches:land_batch_id (
            id,
            name
          )
        `)
        .order('appointment_datetime', { ascending: true })

      if (err) throw err

      // Format appointments with nested data
      const formattedAppointments = (data || []).map((apt: any) => {
        const batch = apt.land_batches ? (Array.isArray(apt.land_batches) ? apt.land_batches[0] : apt.land_batches) : null

        return {
          ...apt,
          land_batch: batch
        }
      })

      setAppointments(formattedAppointments)
    } catch (e: any) {
      setError(e.message || t('phoneCallAppointments.loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function loadAvailableBatches() {
    try {
      const { data, error: err } = await supabase
        .from('land_batches')
        .select('id, name')
        .order('name', { ascending: true })

      if (err) throw err

      setAvailableBatches(data || [])
    } catch (e: any) {
      console.error('Error loading batches:', e)
    }
  }

  // Get appointments for a specific date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, PhoneCallAppointment[]>()
    appointments.forEach(apt => {
      const aptDate = new Date(apt.appointment_datetime)
      const dateKey = aptDate.toISOString().split('T')[0]
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(apt)
    })
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

  const getAppointmentsForDate = (date: Date): PhoneCallAppointment[] => {
    const dateKey = date.toISOString().split('T')[0]
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
        return t('phoneCallAppointments.statusScheduled')
      case 'completed':
        return t('phoneCallAppointments.statusCompleted')
      case 'cancelled':
        return t('phoneCallAppointments.statusCancelled')
      case 'no_show':
        return t('phoneCallAppointments.statusNoShow')
      default:
        return status
    }
  }

  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  async function handleAddAppointment() {
    if (!appointmentDateTime || !phoneNumber.trim() || !name.trim()) {
      setErrorMessage(t('phoneCallAppointments.fillRequired'))
      setShowErrorDialog(true)
      return
    }

    setSaving(true)
    try {
      // Build appointment data - include created_by/updated_by only if columns exist
      const appointmentData: any = {
        phone_number: phoneNumber.trim(),
        name: name.trim(),
        appointment_datetime: appointmentDateTime,
        land_batch_id: selectedBatchId || null,
        appointment_type: isMotorizer ? 'motorizer' : 'non motorizer',
        notes: appointmentNotes.trim() || null,
        status: 'scheduled',
      }

      // Try to include created_by/updated_by if migration has been run
      // If columns don't exist, Supabase will ignore them or we'll catch the error
      if (systemUser?.id) {
        appointmentData.created_by = systemUser.id
        appointmentData.updated_by = systemUser.id
      }

      let insertedData: any = null
      const { data, error: appointmentError } = await supabase
        .from('phone_call_appointments')
        .insert(appointmentData)
        .select()
        .single()

      if (appointmentError) {
        // If error is about missing columns, retry without them
        if (appointmentError.message?.includes('updated_by') || appointmentError.message?.includes('created_by')) {
          const { data: retryData, error: retryError } = await supabase
            .from('phone_call_appointments')
            .insert({
              phone_number: phoneNumber.trim(),
              name: name.trim(),
              appointment_datetime: appointmentDateTime,
              land_batch_id: selectedBatchId || null,
              appointment_type: isMotorizer ? 'motorizer' : 'non motorizer',
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
        await logPhoneCallAppointmentCreated(
          insertedData.id,
          appointmentData,
          systemUser?.id,
          systemUser?.email,
          systemUser?.name || systemUser?.email
        )
      }

      // Log the creation
      if (insertedData) {
        await logPhoneCallAppointmentCreated(
          insertedData.id,
          appointmentData,
          systemUser?.id,
          systemUser?.email,
          systemUser?.name || systemUser?.email
        )
      }

      setSuccessMessage(t('phoneCallAppointments.addSuccess'))
      setShowSuccessDialog(true)
      setAddAppointmentDialogOpen(false)
      setAppointmentDateTime('')
      setPhoneNumber('')
      setName('')
      setSelectedBatchId('')
      setIsMotorizer(false)
      setAppointmentNotes('')
      loadAppointments()
    } catch (e: any) {
      setErrorMessage(e.message || 'فشل إضافة الموعد')
      setShowErrorDialog(true)
    } finally {
      setSaving(false)
    }
  }

  // Status → dot color
  const statusDot = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500'
      case 'completed': return 'bg-emerald-500'
      case 'cancelled': return 'bg-rose-500'
      case 'no_show': return 'bg-orange-500'
      default: return 'bg-gray-400'
    }
  }

  const todayKey = new Date().toDateString()

  const openAddDialog = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    const timeStr = '09:00'
    setAppointmentDateTime(`${dateStr}T${timeStr}`)
    setPhoneNumber('')
    setName('')
    setSelectedBatchId('')
    setIsMotorizer(false)
    setAppointmentNotes('')
    setAddAppointmentDialogOpen(true)
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl space-y-3 sm:space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[19px] sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{t('phoneCallAppointments.title')}</h1>
            <p className="text-[11.5px] sm:text-xs text-gray-500 font-medium truncate">{t('phoneCallAppointments.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openAddDialog}
          className="ardhi-btn-primary h-10 px-3 sm:px-4 rounded-xl text-[13px] font-bold flex-shrink-0 inline-flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          <span className="hidden sm:inline">{t('phoneCallAppointments.addAppointment') || 'Ajouter'}</span>
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mb-3" />
          <p className="text-[13px] text-gray-500 font-semibold">{t('phoneCallAppointments.loading')}</p>
        </div>
      ) : (
        <>
          {/* CALENDAR */}
          <div className="rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-gray-200/80 bg-gradient-to-l from-rose-50/50 via-pink-50/30 to-white">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateMonth(-1)}
                  className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center transition-colors"
                  aria-label="Previous month"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <h2 className="text-[14px] sm:text-base font-extrabold text-gray-900 tracking-tight px-2 min-w-[140px] text-center tabular-nums">
                  {englishMonths[currentMonth]} {currentYear}
                </h2>
                <button
                  type="button"
                  onClick={() => navigateMonth(1)}
                  className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center justify-center transition-colors"
                  aria-label="Next month"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-50 text-rose-700 text-[10.5px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  {appointments.length} {t('phoneCallAppointments.title')}
                </span>
                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 px-3 rounded-xl bg-white border border-gray-200 text-[12px] font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors"
                >
                  {t('phoneCallAppointments.today')}
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-2 sm:p-3" dir="ltr">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {englishDays.map((day) => (
                  <div key={day} className="text-center text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider py-1.5">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date, idx) => {
                  const isCurrentMonth = date.getMonth() === currentMonth
                  const isToday = date.toDateString() === todayKey
                  const dateAppointments = getAppointmentsForDate(date)
                  const count = dateAppointments.length
                  const hasEvents = count > 0

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDialogSelectedDate(date)
                        setDateAppointmentsDialogOpen(true)
                      }}
                      className={`
                        relative min-h-[56px] sm:min-h-[72px] p-1 sm:p-1.5 rounded-xl border transition-all text-start
                        ${isCurrentMonth ? 'bg-white' : 'bg-gray-50/40'}
                        ${isToday ? 'border-blue-400 ring-2 ring-blue-500/15 bg-blue-50/40' : 'border-gray-100 hover:border-rose-200 hover:bg-rose-50/40'}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`
                            inline-flex items-center justify-center
                            ${isToday ? 'w-6 h-6 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 text-white font-extrabold text-[11px] shadow-sm shadow-blue-500/30' : ''}
                            ${!isToday && isCurrentMonth ? 'text-[12px] sm:text-[13px] font-bold text-gray-900 tabular-nums' : ''}
                            ${!isToday && !isCurrentMonth ? 'text-[12px] sm:text-[13px] font-semibold text-gray-300 tabular-nums' : ''}
                          `}
                        >
                          {date.getDate()}
                        </span>
                        {hasEvents && (
                          <span className="text-[9px] font-bold text-gray-400 tabular-nums">
                            {count}
                          </span>
                        )}
                      </div>

                      {hasEvents && (
                        <div className="flex flex-wrap items-center gap-0.5 max-h-[28px] overflow-hidden">
                          {dateAppointments.slice(0, 4).map((apt) => (
                            <span
                              key={apt.id}
                              className={`w-1.5 h-1.5 rounded-full ${statusDot(apt.status)}`}
                              title={`${formatDateTime(apt.appointment_datetime)} · ${apt.name}`}
                            />
                          ))}
                          {count > 4 && (
                            <span className="text-[8px] font-bold text-gray-400 leading-none">+{count - 4}</span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Status legend */}
            <div className="px-3 sm:px-4 py-2.5 border-t border-gray-200/80 bg-gray-50/60 flex items-center gap-3 sm:gap-4 flex-wrap">
              {[
                { color: 'bg-blue-500', label: t('phoneCallAppointments.statusScheduled') },
                { color: 'bg-emerald-500', label: t('phoneCallAppointments.statusCompleted') },
                { color: 'bg-rose-500', label: t('phoneCallAppointments.statusCancelled') },
                { color: 'bg-orange-500', label: t('phoneCallAppointments.statusNoShow') },
              ].map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-gray-600">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
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
          title={`مواعيد ${dialogSelectedDate.getDate()} ${englishMonths[dialogSelectedDate.getMonth()]} ${dialogSelectedDate.getFullYear()}`}
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
                {t('phoneCallAppointments.close')}
              </Button>
            </div>
          }
        >
          {getAppointmentsForDate(dialogSelectedDate).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">{t('phoneCallAppointments.noAppointmentsForDate')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getAppointmentsForDate(dialogSelectedDate)
                .sort((a, b) => new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime())
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => {
                      setSelectedAppointment(apt)
                      setDateAppointmentsDialogOpen(false)
                      setAppointmentDetailsDialogOpen(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-900">{formatDateTime(apt.appointment_datetime)}</span>
                          <Badge className={`text-[10px] ${getStatusColor(apt.status)}`}>
                            {getStatusLabel(apt.status)}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          {apt.name}
                        </p>
                        <p className="text-xs text-gray-600">
                          📞 {apt.phone_number}
                        </p>
                        {apt.land_batch && (
                          <p className="text-xs text-gray-600">
                            🏞️ {apt.land_batch.name}
                          </p>
                        )}
                        <p className="text-xs text-gray-600">
                          📋 {apt.appointment_type === 'motorizer' ? 'Motorizer' : apt.appointment_type === 'non motorizer' ? 'Non Motorizer' : apt.appointment_type}
                        </p>
                        {apt.notes && (
                          <p className="text-xs text-gray-500 mt-1">📝 {apt.notes}</p>
                        )}
                      </div>
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
          setAppointmentDateTime('')
          setPhoneNumber('')
          setName('')
          setSelectedBatchId('')
          setIsMotorizer(false)
          setAppointmentNotes('')
        }}
        title="إضافة موعد"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setAddAppointmentDialogOpen(false)
                setAppointmentDateTime('')
                setPhoneNumber('')
                setName('')
                setSelectedBatchId('')
                setIsMotorizer(false)
                setAppointmentNotes('')
              }}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleAddAppointment}
              disabled={saving || !appointmentDateTime || !phoneNumber.trim() || !name.trim()}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800"
            >
              {saving ? 'جاري الحفظ...' : 'إضافة'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="pca-phone" className="text-xs sm:text-sm">
              رقم الهاتف * <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pca-phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="رقم الهاتف"
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="pca-name" className="text-xs sm:text-sm">
              الاسم * <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pca-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم"
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="pca-datetime" className="text-xs sm:text-sm">
              تاريخ ووقت الموعد * <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pca-datetime"
              type="datetime-local"
              value={appointmentDateTime}
              onChange={(e) => setAppointmentDateTime(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="pca-batch" className="text-xs sm:text-sm">دفعة الأرض</Label>
            <Select
              id="pca-batch"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              size="sm"
              className="text-base"
            >
              <option value="">اختر دفعة</option>
              {availableBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">
              نوع الموعد * <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appointmentType"
                  checked={isMotorizer}
                  onChange={() => setIsMotorizer(true)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs sm:text-sm text-gray-700">Motorizer</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appointmentType"
                  checked={!isMotorizer}
                  onChange={() => setIsMotorizer(false)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs sm:text-sm text-gray-700">Non Motorizer</span>
              </label>
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="pca-notes" className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
              id="pca-notes"
              value={appointmentNotes}
              onChange={(e) => setAppointmentNotes(e.target.value)}
              placeholder="ملاحظات إضافية..."
              rows={3}
              size="sm"
              className="text-base"
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
                      setEditAppointmentDateTime('')
                    }}
                    disabled={updatingAppointment}
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!editAppointmentDateTime) {
                        setErrorMessage(t('phoneCallAppointments.fillDateTime'))
                        setShowErrorDialog(true)
                        return
                      }

                      setUpdatingAppointment(true)
                      try {
                        // Store old values for audit log
                        const oldValues = {
                          appointment_datetime: selectedAppointment.appointment_datetime,
                        }

                        const newValues = {
                          appointment_datetime: editAppointmentDateTime,
                        }

                        // Calculate changes
                        const changes: Record<string, any> = {}
                        if (oldValues.appointment_datetime !== newValues.appointment_datetime) {
                          changes.appointment_datetime = {
                            old: oldValues.appointment_datetime,
                            new: newValues.appointment_datetime,
                          }
                        }

                        // Build update data - start without updated_by to avoid errors
                        // Only add updated_by if we're sure the column exists (after migration)
                        const updateData: any = {
                          appointment_datetime: editAppointmentDateTime,
                          updated_at: new Date().toISOString(),
                        }

                        // Try to include updated_by if migration has been run
                        // But catch errors and retry without it
                        let updateSucceeded = false

                        // First try with updated_by if we have systemUser
                        if (systemUser?.id) {
                          const { error: err } = await supabase
                            .from('phone_call_appointments')
                            .update({
                              ...updateData,
                              updated_by: systemUser.id,
                            })
                            .eq('id', selectedAppointment.id)

                          if (err) {
                            // Previous code also tracked the error in a local
                            // `updateError` variable here, but it was never
                            // read. Removed.
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
                            .from('phone_call_appointments')
                            .update(updateData)
                            .eq('id', selectedAppointment.id)

                          if (retryError) {
                            throw retryError
                          }
                          updateSucceeded = true
                        }

                        // Log the update
                        await logPhoneCallAppointmentUpdated(
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
                        setEditAppointmentDateTime('')
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
                    disabled={updatingAppointment || !editAppointmentDateTime}
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
                    {t('phoneCallAppointments.close')}
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditingAppointment(true)
                      // Convert datetime to local datetime-local format
                      const dt = new Date(selectedAppointment.appointment_datetime)
                      const year = dt.getFullYear()
                      const month = String(dt.getMonth() + 1).padStart(2, '0')
                      const day = String(dt.getDate()).padStart(2, '0')
                      const hours = String(dt.getHours()).padStart(2, '0')
                      const minutes = String(dt.getMinutes()).padStart(2, '0')
                      setEditAppointmentDateTime(`${year}-${month}-${day}T${hours}:${minutes}`)
                    }}
                  >
                    ✏️ تعديل الوقت
                  </Button>
                </>
              )}
            </div>
          }
        >
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 space-y-1.5 text-xs sm:text-sm">
              <p><span className="font-medium text-blue-900">الاسم:</span> <span className="text-gray-700">{selectedAppointment.name}</span></p>
              <p><span className="font-medium text-blue-900">رقم الهاتف:</span> <span className="text-gray-700">{selectedAppointment.phone_number}</span></p>
            </div>
            {isEditingAppointment ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="pca-edit-datetime" className="text-xs sm:text-sm">
                    التاريخ والوقت * <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="pca-edit-datetime"
                    type="datetime-local"
                    value={editAppointmentDateTime}
                    onChange={(e) => setEditAppointmentDateTime(e.target.value)}
                    className="text-xs sm:text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-xs sm:text-sm">
                <p><span className="font-medium text-gray-700">التاريخ والوقت:</span> {
                  new Date(selectedAppointment.appointment_datetime).toLocaleString('en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                }</p>
                <p><span className="font-medium text-gray-700">نوع الموعد:</span> {
                  selectedAppointment.appointment_type === 'motorizer' ? 'Motorizer' : 
                  selectedAppointment.appointment_type === 'non motorizer' ? 'Non Motorizer' : 
                  selectedAppointment.appointment_type
                }</p>
                <p><span className="font-medium text-gray-700">الحالة:</span> <Badge className={getStatusColor(selectedAppointment.status)}>{getStatusLabel(selectedAppointment.status)}</Badge></p>
                {selectedAppointment.land_batch && (
                  <p><span className="font-medium text-gray-700">دفعة الأرض:</span> {selectedAppointment.land_batch.name}</p>
                )}
                {selectedAppointment.notes && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p><span className="font-medium text-gray-700">ملاحظات:</span></p>
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
                  <p className="text-xs text-gray-500">{t('phoneCallAppointments.loading')}</p>
                ) : auditLogs.length === 0 ? (
                  <p className="text-xs text-gray-500">{t('shared.noChanges') || 'لا توجد تغييرات مسجلة'}</p>
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
                                <span className="font-medium">{key === 'appointment_datetime' ? 'التاريخ والوقت' : key}:</span>{' '}
                                <span className="line-through text-red-500">
                                  {new Date(value.old).toLocaleString('en-US', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>{' '}
                                → <span className="text-green-600">
                                  {new Date(value.new).toLocaleString('en-US', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
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

export default PhoneCallAppointmentsPage

