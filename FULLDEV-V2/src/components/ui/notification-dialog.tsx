import { Dialog } from './dialog'
import { Button } from './button'

interface NotificationDialogProps {
  open: boolean
  onClose: () => void
  type: 'success' | 'error'
  title: string
  message: string
}

export function NotificationDialog({ open, onClose, type, title, message }: NotificationDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            موافق
          </Button>
        </div>
      }
    >
      <div className="text-center py-4">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          type === 'success' ? 'bg-green-100' : 'bg-red-100'
        }`}>
          {type === 'success' ? (
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <p className={`text-lg font-medium ${
          type === 'success' ? 'text-green-700' : 'text-red-700'
        }`}>
          {message}
        </p>
      </div>
    </Dialog>
  )
}

