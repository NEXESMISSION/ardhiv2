import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { sanitizeText } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, FileText } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'

export interface ContractEditor {
  id: string
  type: string
  name: string
  place: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export function ContractEditors() {
  const { hasPermission, user } = useAuth()
  const { t } = useLanguage()
  const [editors, setEditors] = useState<ContractEditor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEditor, setEditingEditor] = useState<ContractEditor | null>(null)
  const [form, setForm] = useState({
    type: '',
    name: '',
    place: '',
  })
  const [saving, setSaving] = useState(false)
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editorToDelete, setEditorToDelete] = useState<ContractEditor | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchEditors()
  }, [])

  const fetchEditors = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('contract_editors')
        .select('*')
        .order('type', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        // If table doesn't exist (404), show helpful message
        if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('404')) {
          console.warn('contract_editors table does not exist yet. Please run the SQL migration: create_contract_editors_table.sql')
          showNotification('جدول المحررين غير موجود. يرجى تشغيل SQL migration أولاً', 'error')
          setEditors([])
        } else {
          throw error
        }
      } else {
        setEditors(data || [])
      }
    } catch (error: any) {
      // Handle CORS or other errors gracefully
      if (error?.message?.includes('CORS') || error?.message?.includes('404') || error?.message?.includes('does not exist')) {
        console.warn('contract_editors table does not exist yet. Please run the SQL migration: create_contract_editors_table.sql')
        showNotification('جدول المحررين غير موجود. يرجى تشغيل SQL migration أولاً', 'error')
        setEditors([])
      } else {
        console.error('Error fetching editors:', error)
        showNotification('خطأ في تحميل المحررين', 'error')
        setEditors([])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (editor?: ContractEditor) => {
    if (editor) {
      setEditingEditor(editor)
      setForm({
        type: editor.type,
        name: editor.name,
        place: editor.place,
      })
    } else {
      setEditingEditor(null)
      setForm({
        type: '',
        name: '',
        place: '',
      })
    }
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingEditor(null)
    setForm({
      type: '',
      name: '',
      place: '',
    })
  }

  const handleSave = async () => {
    if (!form.type.trim() || !form.name.trim() || !form.place.trim()) {
      showNotification('يرجى ملء جميع الحقول', 'error')
      return
    }

    setSaving(true)
    try {
      const sanitizedData = {
        type: sanitizeText(form.type.trim()),
        name: sanitizeText(form.name.trim()),
        place: sanitizeText(form.place.trim()),
      }

      if (editingEditor) {
        // Update
        const { error } = await supabase
          .from('contract_editors')
          .update({
            ...sanitizedData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEditor.id)

        if (error) throw error
        showNotification('تم تحديث المحرر بنجاح', 'success')
      } else {
        // Create
        const { error } = await supabase
          .from('contract_editors')
          .insert([{
            ...sanitizedData,
            created_by: user?.id || null,
          }])

        if (error) throw error
        showNotification('تم إضافة المحرر بنجاح', 'success')
      }

      handleCloseDialog()
      fetchEditors()
    } catch (error: any) {
      console.error('Error saving editor:', error)
      showNotification(`خطأ في حفظ المحرر: ${error.message || 'خطأ غير معروف'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editorToDelete) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('contract_editors')
        .delete()
        .eq('id', editorToDelete.id)

      if (error) throw error

      showNotification('تم حذف المحرر بنجاح', 'success')
      setDeleteDialogOpen(false)
      setEditorToDelete(null)
      fetchEditors()
    } catch (error: any) {
      console.error('Error deleting editor:', error)
      showNotification(`خطأ في حذف المحرر: ${error.message || 'خطأ غير معروف'}`, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filteredEditors = editors.filter(editor => {
    const search = searchTerm.toLowerCase()
    return (
      editor.type.toLowerCase().includes(search) ||
      editor.name.toLowerCase().includes(search) ||
      editor.place.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p>جاري التحميل...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">محررين العقد</h1>
          <p className="text-muted-foreground mt-1">إدارة محررين العقود</p>
        </div>
        {hasPermission('edit_clients') && (
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 ml-2" />
            إضافة محرر
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="بحث بالاسم، النوع، أو المكان..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            maxLength={100}
          />
        </CardContent>
      </Card>

      {/* Editors Table */}
      <Card>
        <CardHeader>
          <CardTitle>المحررين ({filteredEditors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEditors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'لا توجد نتائج' : 'لا يوجد محررين'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>النوع</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المكان</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEditors.map((editor) => (
                  <TableRow key={editor.id}>
                    <TableCell className="font-medium">{editor.type}</TableCell>
                    <TableCell>{editor.name}</TableCell>
                    <TableCell>{editor.place}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {hasPermission('edit_clients') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDialog(editor)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {hasPermission('delete_clients') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditorToDelete(editor)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingEditor ? 'تعديل محرر' : 'إضافة محرر جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="type">النوع *</Label>
              <Input
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="مثال: محامي، كاتب عدل، إلخ"
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="name">الاسم *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم المحرر"
                maxLength={255}
              />
            </div>
            <div>
              <Label htmlFor="place">المكان *</Label>
              <Input
                id="place"
                value={form.place}
                onChange={(e) => setForm({ ...form, place: e.target.value })}
                placeholder="مكان المحرر"
                maxLength={255}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editingEditor ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="تأكيد الحذف"
        description={`هل أنت متأكد من حذف المحرر "${editorToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText={deleting ? 'جاري الحذف...' : 'نعم، حذف'}
        cancelText="إلغاء"
        disabled={deleting}
      />
    </div>
  )
}

