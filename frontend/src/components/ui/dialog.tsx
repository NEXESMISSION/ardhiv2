import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DialogContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined)

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open: controlledOpen, onOpenChange, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  
  const setOpen = React.useCallback((newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setUncontrolledOpen(newOpen)
    }
  }, [onOpenChange])

  // Lock body scroll when dialog is open (mobile fix)
  React.useEffect(() => {
    if (open) {
      // Save current scroll position for both window and main container
      const scrollY = window.scrollY
      const mainElement = document.querySelector('main')
      const mainScrollTop = mainElement?.scrollTop || 0
      
      // Lock body scroll - mobile-friendly approach
      const originalStyle = window.getComputedStyle(document.body).overflow
      const originalPosition = window.getComputedStyle(document.body).position
      const originalTop = window.getComputedStyle(document.body).top
      const originalWidth = window.getComputedStyle(document.body).width
      
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      
      // Also lock main container scroll if it exists
      if (mainElement) {
        const mainOriginalOverflow = window.getComputedStyle(mainElement).overflow
        mainElement.style.overflow = 'hidden'
        
        return () => {
          // Restore body styles
          document.body.style.overflow = originalStyle
          document.body.style.position = originalPosition
          document.body.style.top = originalTop
          document.body.style.width = originalWidth
          
          // Restore main container styles
          if (mainElement) {
            mainElement.style.overflow = mainOriginalOverflow
            mainElement.scrollTop = mainScrollTop
          }
          
          // Restore window scroll position
          window.scrollTo(0, scrollY)
        }
      } else {
        return () => {
          // Restore body styles
          document.body.style.overflow = originalStyle
          document.body.style.position = originalPosition
          document.body.style.top = originalTop
          document.body.style.width = originalWidth
          
          // Restore window scroll position
          window.scrollTo(0, scrollY)
        }
      }
    }
  }, [open])

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogTrigger must be used within Dialog")

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => context.setOpen(true),
    })
  }

  return (
    <button onClick={() => context.setOpen(true)} type="button">
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogPortal must be used within Dialog")
  if (!context.open) return null
  return <>{children}</>
}

function DialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogOverlay must be used within Dialog")

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      onClick={() => context.setOpen(false)}
      {...props}
    />
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogContent must be used within Dialog")

  if (!context.open) return null

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl translate-x-[-50%] translate-y-[-50%] gap-3 sm:gap-4 border bg-background p-3 sm:p-4 md:p-6 shadow-lg duration-200 rounded-lg sm:rounded-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto",
          className
        )}
        {...props}
      >
        {children}
        <button
          className="absolute right-2 sm:right-4 top-2 sm:top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none p-1"
          onClick={() => context.setOpen(false)}
          type="button"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1 sm:space-y-1.5 text-center sm:text-left pb-2 sm:pb-3",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
