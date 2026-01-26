import { type ReactNode } from 'react'
import { Dialog } from './dialog'
import { Button } from './button'
import { Alert } from './alert'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  disabled?: boolean
  errorMessage?: string | null
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  variant = 'destructive',
  disabled = false,
  errorMessage,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={disabled}>
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={disabled}
            className={variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">{description}</p>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {children}
      </div>
    </Dialog>
  )
}

