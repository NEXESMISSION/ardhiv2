import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Play, Pause, Calendar, Clock, Repeat } from 'lucide-react'
import type { RecurringExpenseTemplate, ExpenseCategory, RecurrenceType, PaymentMethod } from '@/types/database'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { showNotification } from '@/components/ui/notification'

const RECURRENCE_TYPES: { value: RecurrenceType; label: string }[] = [
  { value: 'Daily', label: 'يومي' },
  { value: 'Weekly', label: 'أسبوعي' },
  { value: 'Monthly', label: 'شهري' },
  { value: 'Yearly', label: 'سنوي' },
]

const DAYS_OF_WEEK = [
  { value: 1, label: 'الإثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
  { value: 7, label: 'الأحد' },
]

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}))

interface RecurringExpensesManagerProps {
  categories: ExpenseCategory[]
}

export function RecurringExpensesManager({ categories }: RecurringExpensesManagerProps) {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<RecurringExpenseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringExpenseTemplate | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    amount: '',
    description: '',
    payment_method: 'Cash' as PaymentMethod,
    is_revenue: false,
    recurrence_type: 'Monthly' as RecurrenceType,
    recurrence_day: 1,
    recurrence_time: '08:00',
    is_active: true,
    related_batch_id: '',
    related_sale_id: '',
    tags: '',
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_expenses_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates((data as RecurringExpenseTemplate[]) || [])
    } catch (error: any) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (template?: RecurringExpenseTemplate) => {
    if (template) {
      setEditingTemplate(template)
      setForm({
        name: template.name,
        category_id: template.category_id,
        amount: template.amount.toString(),
        description: template.description || '',
        payment_method: template.payment_method,
        is_revenue: template.is_revenue,
        recurrence_type: template.recurrence_type,
        recurrence_day: template.recurrence_day,
        recurrence_time: template.recurrence_time.substring(0, 5), // HH:MM
        is_active: template.is_active,
        related_batch_id: template.related_batch_id || '',
        related_sale_id: template.related_sale_id || '',
        tags: template.tags?.join(', ') || '',
      })
    } else {
      setEditingTemplate(null)
      setForm({
        name: '',
        category_id: '',
        amount: '',
        description: '',
        payment_method: 'Cash',
        is_revenue: false,
        recurrence_type: 'Monthly',
        recurrence_day: 1,
        recurrence_time: '08:00',
        is_active: true,
        related_batch_id: '',
        related_sale_id: '',
        tags: '',
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!user) return

    try {
      const tagsArray = form.tags
        ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []

      // Calculate next occurrence date
      const recurrenceTime = form.recurrence_time + ':00' // Add seconds
      let nextOccurrenceDate = new Date()

      if (form.recurrence_type === 'Daily') {
        nextOccurrenceDate = new Date()
        nextOccurrenceDate.setDate(nextOccurrenceDate.getDate() + 1)
      } else if (form.recurrence_type === 'Weekly') {
        const currentDay = nextOccurrenceDate.getDay() // 0=Sunday, 1=Monday, etc.
        const targetDay = form.recurrence_day === 7 ? 0 : form.recurrence_day // Convert to JS day
        let daysUntil = targetDay - currentDay
        if (daysUntil <= 0) daysUntil += 7
        nextOccurrenceDate.setDate(nextOccurrenceDate.getDate() + daysUntil)
      } else if (form.recurrence_type === 'Monthly') {
        nextOccurrenceDate = new Date(
          nextOccurrenceDate.getFullYear(),
          nextOccurrenceDate.getMonth() + 1,
          Math.min(form.recurrence_day, 28) // Use 28 to avoid month-end issues
        )
      } else if (form.recurrence_type === 'Yearly') {
        nextOccurrenceDate = new Date(
          nextOccurrenceDate.getFullYear() + 1,
          nextOccurrenceDate.getMonth(),
          nextOccurrenceDate.getDate()
        )
      }

      const templateData = {
        name: form.name,
        category_id: form.category_id,
        amount: parseFloat(form.amount),
        description: form.description || null,
        payment_method: form.payment_method,
        is_revenue: form.is_revenue,
        recurrence_type: form.recurrence_type,
        recurrence_day: form.recurrence_day,
        recurrence_time: recurrenceTime,
        is_active: form.is_active,
        next_occurrence_date: nextOccurrenceDate.toISOString().split('T')[0],
        related_batch_id: form.related_batch_id || null,
        related_sale_id: form.related_sale_id || null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        created_by: user.id,
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('recurring_expenses_templates')
          .update(templateData)
          .eq('id', editingTemplate.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recurring_expenses_templates')
          .insert([templateData])

        if (error) throw error
      }

      setDialogOpen(false)
      fetchTemplates()
      showNotification('تم حفظ القالب بنجاح', 'success')
    } catch (error: any) {
      console.error('Error saving template:', error)
      showNotification('حدث خطأ أثناء الحفظ: ' + error.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!templateToDelete) return

    try {
      const { error } = await supabase
        .from('recurring_expenses_templates')
        .delete()
        .eq('id', templateToDelete)

      if (error) throw error

      setDeleteConfirmOpen(false)
      setTemplateToDelete(null)
      fetchTemplates()
      showNotification('تم حذف القالب بنجاح', 'success')
    } catch (error: any) {
      console.error('Error deleting template:', error)
      showNotification('حدث خطأ أثناء الحذف: ' + error.message, 'error')
    }
  }

  const handleToggleActive = async (template: RecurringExpenseTemplate) => {
    try {
      const { error } = await supabase
        .from('recurring_expenses_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id)

      if (error) throw error
      fetchTemplates()
      showNotification('تم تحديث حالة القالب', 'success')
    } catch (error: any) {
      console.error('Error toggling template:', error)
      showNotification('حدث خطأ: ' + error.message, 'error')
    }
  }

  const handleGenerateNow = async (template: RecurringExpenseTemplate) => {
    try {
      const { data, error } = await supabase.rpc('generate_recurring_expenses')

      if (error) throw error
      showNotification('تم إنشاء المصاريف المتكررة بنجاح', 'success')
      fetchTemplates()
    } catch (error: any) {
      console.error('Error generating expenses:', error)
      showNotification('حدث خطأ: ' + error.message, 'error')
    }
  }

  const getRecurrenceLabel = (template: RecurringExpenseTemplate) => {
    const time = template.recurrence_time.substring(0, 5) // HH:MM
    switch (template.recurrence_type) {
      case 'Daily':
        return `يومي في الساعة ${time}`
      case 'Weekly':
        const dayName = DAYS_OF_WEEK.find(d => d.value === template.recurrence_day)?.label || ''
        return `أسبوعي - ${dayName} في الساعة ${time}`
      case 'Monthly':
        return `شهري - اليوم ${template.recurrence_day} في الساعة ${time}`
      case 'Yearly':
        return `سنوي في الساعة ${time}`
      default:
        return template.recurrence_type
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">المصاريف والإيرادات المتكررة</h3>
          <p className="text-sm text-muted-foreground">
            إدارة القوالب للمصاريف والإيرادات المتكررة تلقائياً
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 ml-2" />
          قالب جديد
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Repeat className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">لا توجد قوالب متكررة</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 ml-2" />
              إنشاء قالب جديد
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const category = categories.find(c => c.id === template.category_id)
            return (
              <Card key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base mb-1">{template.name}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <Badge variant={template.is_revenue ? 'default' : 'secondary'}>
                          {template.is_revenue ? 'إيراد' : 'مصروف'}
                        </Badge>
                        <Badge variant={template.is_active ? 'default' : 'outline'}>
                          {template.is_active ? 'نشط' : 'متوقف'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold">{formatCurrency(template.amount)}</p>
                    <p className="text-sm text-muted-foreground">
                      {category?.name || 'غير محدد'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Repeat className="h-4 w-4" />
                    <span>{getRecurrenceLabel(template)}</span>
                  </div>

                  {template.next_occurrence_date && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>التالي: {formatDate(template.next_occurrence_date)}</span>
                    </div>
                  )}

                  {template.last_generated_date && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>آخر إنشاء: {formatDate(template.last_generated_date)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(template)}
                      className="flex-1"
                    >
                      {template.is_active ? (
                        <>
                          <Pause className="h-4 w-4 ml-2" />
                          إيقاف
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 ml-2" />
                          تفعيل
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateNow(template)}
                      className="flex-1"
                    >
                      <Play className="h-4 w-4 ml-2" />
                      إنشاء الآن
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleOpenDialog(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setTemplateToDelete(template.id)
                        setDeleteConfirmOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'تعديل قالب متكرر' : 'إنشاء قالب متكرر جديد'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">اسم القالب *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: إيجار المكتب الشهري"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category_id">الفئة *</Label>
                <Select
                  id="category_id"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">اختر الفئة</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="amount">المبلغ *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="وصف تفصيلي..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment_method">طريقة الدفع</Label>
                <Select
                  id="payment_method"
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm({ ...form, payment_method: e.target.value as PaymentMethod })
                  }
                >
                  <option value="Cash">نقدي</option>
                  <option value="BankTransfer">تحويل بنكي</option>
                  <option value="Check">شيك</option>
                  <option value="CreditCard">بطاقة ائتمان</option>
                  <option value="Other">أخرى</option>
                </Select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_revenue}
                    onChange={(e) => setForm({ ...form, is_revenue: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">إيراد (وليس مصروف)</span>
                </label>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">إعدادات التكرار</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recurrence_type">نوع التكرار *</Label>
                  <Select
                    id="recurrence_type"
                    value={form.recurrence_type}
                    onChange={(e) =>
                      setForm({ ...form, recurrence_type: e.target.value as RecurrenceType })
                    }
                  >
                    {RECURRENCE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {form.recurrence_type === 'Weekly' && (
                  <div>
                    <Label htmlFor="recurrence_day_weekly">يوم الأسبوع *</Label>
                    <Select
                      id="recurrence_day_weekly"
                      value={form.recurrence_day.toString()}
                      onChange={(e) =>
                        setForm({ ...form, recurrence_day: parseInt(e.target.value) })
                      }
                    >
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day.value} value={day.value.toString()}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {form.recurrence_type === 'Monthly' && (
                  <div>
                    <Label htmlFor="recurrence_day_monthly">يوم الشهر *</Label>
                    <Select
                      id="recurrence_day_monthly"
                      value={form.recurrence_day.toString()}
                      onChange={(e) =>
                        setForm({ ...form, recurrence_day: parseInt(e.target.value) })
                      }
                    >
                      {DAYS_OF_MONTH.map((day) => (
                        <option key={day.value} value={day.value.toString()}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="recurrence_time">الوقت *</Label>
                  <Input
                    id="recurrence_time"
                    type="time"
                    value={form.recurrence_time}
                    onChange={(e) => setForm({ ...form, recurrence_time: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="tags">العلامات (مفصولة بفواصل)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="مثال: إيجار, مكتب, شهري"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={!form.name || !form.category_id || !form.amount}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDelete}
        title="حذف القالب المتكرر"
        description="هل أنت متأكد من حذف هذا القالب؟ سيتم إيقاف إنشاء المصاريف المتكررة تلقائياً."
      />
    </div>
  )
}

