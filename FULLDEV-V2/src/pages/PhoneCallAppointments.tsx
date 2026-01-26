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
import { IconButton } from '@/components/ui/icon-button'
import { logPhoneCallAppointmentCreated, logPhoneCallAppointmentUpdated, getAuditLogs, type AuditLog } from '@/utils/auditLog'

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
      setError(e.message || 'فشل تحميل المواعيد')
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
    setSelectedDate(today)
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
        return 'مجدول'
      case 'completed':
        return 'مكتمل'
      case 'cancelled':
        return 'ملغي'
      case 'no_show':
        return 'لم يحضر'
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
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
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

      setSuccessMessage('تم إضافة الموعد بنجاح!')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-sm text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-3 sm:mb-4 lg:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">مواعيد المكالمات</h1>
          <p className="text-xs sm:text-sm text-gray-600">إدارة مواعيد المكالمات الهاتفية</p>
        </div>
        <Button
          onClick={() => {
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
          }}
          className="text-xs sm:text-sm"
        >
          + إضافة موعد
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" className="text-xs sm:text-sm">{error}</Alert>
        </div>
      )}

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
            اليوم
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
                        pointer-events-none
                      `}
                      title={`${apt.name} - ${formatDateTime(apt.appointment_datetime)}`}
                    >
                      {formatDateTime(apt.appointment_datetime)} - {apt.name}
                    </div>
                  ))}
                  {dateAppointments.length > 2 && (
                    <div className="text-[8px] sm:text-[10px] text-gray-500 px-1 pointer-events-none">
                      +{dateAppointments.length - 2} أكثر
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

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
                إغلاق
              </Button>
            </div>
          }
        >
          {getAppointmentsForDate(dialogSelectedDate).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">لا توجد مواعيد في هذا التاريخ</p>
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
            <Label className="text-xs sm:text-sm">
              رقم الهاتف * <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="رقم الهاتف"
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">
              الاسم * <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم"
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">
              تاريخ ووقت الموعد * <span className="text-red-500">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={appointmentDateTime}
              onChange={(e) => setAppointmentDateTime(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              size="sm"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">دفعة الأرض</Label>
            <Select
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
            <Label className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
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
                        setErrorMessage('يرجى ملء التاريخ والوقت')
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
                        let updateError: any = null

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
                            updateError = err
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
                    إغلاق
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
                  <Label className="text-xs sm:text-sm">
                    التاريخ والوقت * <span className="text-red-500">*</span>
                  </Label>
                  <Input
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

