import { type ReactNode } from 'react'
import { Dialog } from './dialog'
import { Button } from './button'
import { Alert } from './alert'
import { useLanguage } from '@/i18n/context'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  message?: string // Alias for description for backward compatibility
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive' | 'danger' | 'warning'
  disabled?: boolean
  loading?: boolean // Alias for disabled
  errorMessage?: string | null
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  message,
  confirmText,
  cancelText,
  variant = 'destructive',
  disabled = false,
  loading = false,
  errorMessage,
  children,
}: ConfirmDialogProps) {
  const { t } = useLanguage()
  const isDisabled = disabled || loading
  const displayText = description || message || ''
  const resolvedConfirmText = confirmText ?? t('common.confirm')
  const resolvedCancelText = cancelText ?? t('common.cancel')
  
  const getVariantClass = () => {
    if (variant === 'danger' || variant === 'destructive') {
      return 'bg-red-600 hover:bg-red-700'
    }
    if (variant === 'warning') {
      return 'bg-yellow-600 hover:bg-yellow-700'
    }
    return ''
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isDisabled}>
            {resolvedCancelText}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isDisabled}
            className={getVariantClass()}
          >
            {loading ? t('common.processing') : resolvedConfirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {displayText && (
          <p className="text-sm text-gray-700 whitespace-pre-line">{displayText}</p>
        )}
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {children}
      </div>
    </Dialog>
  )
}


