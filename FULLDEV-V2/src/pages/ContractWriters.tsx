import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'

interface ContractWriter {
  id: string
  type: string
  name: string
  location: string
  created_at: string
  updated_at: string
}

export function ContractWritersPage() {
  const [writers, setWriters] = useState<ContractWriter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWriter, setEditingWriter] = useState<ContractWriter | null>(null)

  // Form state
  const [formType, setFormType] = useState('')
  const [formName, setFormName] = useState('')
  const [formLocation, setFormLocation] = useState('')

  useEffect(() => {
    loadWriters()
  }, [])

  async function loadWriters() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('contract_writers')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err
      setWriters(data || [])
    } catch (e: any) {
      setError(e.message || 'فشل تحميل محررين العقود')
    } finally {
      setLoading(false)
    }
  }

  function openAddDialog() {
    setEditingWriter(null)
    setFormType('')
    setFormName('')
    setFormLocation('')
    setError(null)
    setDialogOpen(true)
  }

  function openEditDialog(writer: ContractWriter) {
    setEditingWriter(writer)
    setFormType(writer.type)
    setFormName(writer.name)
    setFormLocation(writer.location)
    setError(null)
    setDialogOpen(true)
  }

  async function handleSubmit() {
    setError(null)

    if (!formType.trim()) {
      setError('النوع مطلوب')
      return
    }

    if (!formName.trim()) {
      setError('الاسم مطلوب')
      return
    }

    if (!formLocation.trim()) {
      setError('المكان مطلوب')
      return
    }

    try {
      if (editingWriter) {
        // Update existing writer
        const { error: err } = await supabase
          .from('contract_writers')
          .update({
            type: formType.trim(),
            name: formName.trim(),
            location: formLocation.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingWriter.id)

        if (err) throw err
      } else {
        // Create new writer
        const { error: err } = await supabase
          .from('contract_writers')
          .insert({
            type: formType.trim(),
            name: formName.trim(),
            location: formLocation.trim(),
          })

        if (err) throw err
      }

      setDialogOpen(false)
      await loadWriters()
    } catch (e: any) {
      setError(e.message || 'فشل حفظ محرر العقد')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المحرر؟')) return

    try {
      const { error: err } = await supabase
        .from('contract_writers')
        .delete()
        .eq('id', id)

      if (err) throw err
      await loadWriters()
    } catch (e: any) {
      alert('فشل حذف محرر العقد: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">جاري التحميل...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">محررين العقد</h1>
          <p className="text-gray-600">إدارة محررين العقود</p>
        </div>
        <Button onClick={openAddDialog}>+ إضافة محرر</Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {writers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500 text-lg mb-4">لا يوجد محررين عقود</p>
          <Button onClick={openAddDialog}>إضافة محرر جديد</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {writers.map((writer) => (
            <Card key={writer.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{writer.name}</h3>
                    <Badge variant="info" size="sm">{writer.type}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">المكان:</span> {writer.location}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <IconButton
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditDialog(writer)}
                >
                  ✏️ تعديل
                </IconButton>
                <IconButton
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(writer.id)}
                >
                  🗑️ حذف
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingWriter ? 'تعديل محرر العقد' : 'إضافة محرر جديد'}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit}>
              {editingWriter ? 'حفظ التعديلات' : 'إضافة'}
            </Button>
          </div>
        }
      >
        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">
              النوع <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formType}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormType(e.target.value)}
              placeholder="مثال: محامي، كاتب عدل، إلخ"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">
              الاسم <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
              placeholder="اسم المحرر"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 font-medium">
              المكان <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formLocation}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormLocation(e.target.value)}
              placeholder="مكان المحرر"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}

