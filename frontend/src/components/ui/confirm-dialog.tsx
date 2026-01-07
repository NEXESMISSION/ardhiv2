import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive"
  disabled?: boolean
  errorMessage?: string | null
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  variant = "destructive",
  disabled = false,
  errorMessage
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        preventClose={disabled}
        className="bg-white border-2 border-[#2563eb] rounded-[16px] p-[22px_26px] max-w-[440px] shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-[#020617] mb-2">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[14px] text-[#334155] mb-4">
            {description}
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <div className="bg-[#fef2f2] border-l-[5px] border-l-[#ef4444] text-[#7f1d1d] p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-[#ef4444]" />
            <p className="flex-1 font-medium break-words">{errorMessage}</p>
          </div>
        )}
        <DialogFooter className="flex justify-end gap-[10px] mt-2">
          <Button 
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) {
                onOpenChange(false)
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) {
                onOpenChange(false)
              }
            }}
            disabled={disabled}
            className="px-[14px] py-[8px] rounded-[10px] text-[14px] font-medium bg-[#e5e7eb] text-[#020617] hover:bg-[#d1d5db] border-none"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) {
                onConfirm()
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) {
                onConfirm()
              }
            }}
            disabled={disabled}
            className={`px-[14px] py-[8px] rounded-[10px] text-[14px] font-medium border-none ${
              variant === "destructive" 
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626]" 
                : "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            }`}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
