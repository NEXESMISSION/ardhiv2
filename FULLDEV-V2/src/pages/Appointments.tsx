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
import { logAppointmentCreated, logAppointmentUpdated, getAuditLogs, type AuditLog } from '@/utils/auditLog'

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
    piece?: {
      piece_number: string
      surface_m2: number
    }
    batch?: {
      name: string
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

      if (err) throw err

      // Format appointments with nested data
      const formattedAppointments = (data || []).map((apt: any) => {
        const sale = Array.isArray(apt.sales) ? apt.sales[0] : apt.sales
        const client = Array.isArray(apt.clients) ? apt.clients[0] : apt.clients
        const piece = sale?.land_pieces ? (Array.isArray(sale.land_pieces) ? sale.land_pieces[0] : sale.land_pieces) : null
        const batch = sale?.land_batches ? (Array.isArray(sale.land_batches) ? sale.land_batches[0] : sale.land_batches) : null

        return {
          ...apt,
          sale: sale ? {
            ...sale,
            piece,
            batch
          } : null,
          client
        }
      })

      setAppointments(formattedAppointments)
    } catch (e: any) {
      setError(e.message || 'فشل تحميل المواعيد')
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
      const dateKey = apt.appointment_date
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

  const getAppointmentsForDate = (date: Date): Appointment[] => {
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

  async function handleAddAppointment() {
    if (!appointmentDate || !appointmentTime || !selectedSaleId) return

    setSaving(true)
    try {
      // Get sale to get client_id
      const selectedSale = availableSales.find(s => s.id === selectedSaleId)
      if (!selectedSale) throw new Error('البيع المحدد غير موجود')

      // Validate client_id exists
      if (!selectedSale.client_id) {
        throw new Error('خطأ: البيع المحدد لا يحتوي على معرف عميل. يرجى التحقق من بيانات البيع.')
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

      setSuccessMessage('تم إضافة الموعد بنجاح!')
      setShowSuccessDialog(true)
      setAddAppointmentDialogOpen(false)
      setAppointmentDate('')
      setAppointmentTime('09:00')
      setAppointmentNotes('')
      setSelectedSaleId('')
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
      <div className="mb-3 sm:mb-4 lg:mb-6">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 mb-1">موعد اتمام البيع</h1>
          <p className="text-xs sm:text-sm text-gray-600">إدارة مواعيد البيع (Rendez-vous de vente)</p>
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
                      {apt.appointment_time} - {apt.client?.name || 'غير محدد'}
                    </div>
                  ))}
                  {dateAppointments.length > 2 && (
                    <div className="text-[8px] sm:text-[10px] text-gray-500 px-1">
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
                .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
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
                          <span className="text-sm font-bold text-gray-900">{apt.appointment_time}</span>
                          <Badge className={`text-[10px] ${getStatusColor(apt.status)}`}>
                            {getStatusLabel(apt.status)}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          {apt.client?.name || 'غير محدد'}
                        </p>
                        <p className="text-xs text-gray-600">
                          {apt.sale?.batch?.name || '-'} - {apt.sale?.piece?.piece_number || '-'}
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
          setAppointmentDate('')
          setAppointmentTime('09:00')
          setAppointmentNotes('')
          setSelectedSaleId('')
        }}
        title="موعد البيع (Rendez-vous de vente)"
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
              إلغاء
            </Button>
            <Button
              onClick={handleAddAppointment}
              disabled={saving || !appointmentDate || !appointmentTime || !selectedSaleId}
              className="bg-green-600 hover:bg-green-700 active:bg-green-800"
            >
              {saving ? 'جاري الحفظ...' : '💾 حفظ الموعد'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">البيع *</Label>
            <Select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="text-xs sm:text-sm"
            >
              <option value="">اختر البيع...</option>
              {availableSales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.client?.name || 'غير محدد'} - {sale.batch?.name || '-'} - {sale.piece?.piece_number || '-'} (#{sale.id.substring(0, 8)})
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
                    <p><span className="font-medium text-blue-900">العميل:</span> <span className="text-gray-700">{selectedSale.client?.name || 'غير محدد'}</span></p>
                    <p><span className="font-medium text-blue-900">رقم البيع:</span> <span className="text-gray-700">#{selectedSale.id.substring(0, 8)}</span></p>
                  </>
                ) : null
              })()}
            </div>
          )}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">التاريخ *</Label>
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
            <Label className="text-xs sm:text-sm">الوقت *</Label>
            <Input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              size="sm"
              className="text-xs sm:text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">ملاحظات</Label>
            <Textarea
              value={appointmentNotes}
              onChange={(e) => setAppointmentNotes(e.target.value)}
              placeholder="ملاحظات إضافية حول الموعد..."
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
                إغلاق
              </Button>
                  <Button
                    onClick={() => {
                      setIsEditingAppointment(true)
                      setEditAppointmentDate(selectedAppointment.appointment_date)
                      setEditAppointmentTime(selectedAppointment.appointment_time)
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
              <p><span className="font-medium text-blue-900">العميل:</span> <span className="text-gray-700">{selectedAppointment.client?.name || 'غير محدد'}</span></p>
              <p><span className="font-medium text-blue-900">رقم الهوية:</span> <span className="text-gray-700">{selectedAppointment.client?.id_number || '-'}</span></p>
              <p><span className="font-medium text-blue-900">الهاتف:</span> <span className="text-gray-700">{selectedAppointment.client?.phone || '-'}</span></p>
            </div>
            {isEditingAppointment ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">
                    التاريخ * <span className="text-red-500">*</span>
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
                    الوقت * <span className="text-red-500">*</span>
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
              <p><span className="font-medium text-gray-700">التاريخ:</span> {formatDate(selectedAppointment.appointment_date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p><span className="font-medium text-gray-700">الوقت:</span> {selectedAppointment.appointment_time}</p>
              <p><span className="font-medium text-gray-700">الحالة:</span> <Badge className={getStatusColor(selectedAppointment.status)}>{getStatusLabel(selectedAppointment.status)}</Badge></p>
              {selectedAppointment.sale && (
                <>
                  <p><span className="font-medium text-gray-700">القطعة:</span> {selectedAppointment.sale.batch?.name || '-'} - {selectedAppointment.sale.piece?.piece_number || '-'}</p>
                  <p><span className="font-medium text-gray-700">المساحة:</span> {selectedAppointment.sale.piece?.surface_m2.toLocaleString() || '-'} م²</p>
                  <p><span className="font-medium text-gray-700">سعر البيع:</span> {selectedAppointment.sale.sale_price.toLocaleString()} دت</p>
                </>
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
