// ============================================================================
// PAYMENT TERMINOLOGY CONSTANTS
// ============================================================================
// Centralized payment-related terminology to ensure consistency across the app
// and make future changes easier
// ============================================================================

export const PaymentTerms = {
  // Advance payment (التسبقة) - paid at confirmation for installment sales
  advance: 'التسبقة',
  advanceAfterDeposit: 'التسبقة (بعد خصم العربون)',
  advanceAtConfirmation: 'المستحق عند التأكيد (التسبقة)',
  advanceLabel: 'التسبقة',
  
  // Deposit (العربون) - paid initially
  deposit: 'العربون',
  depositPaid: 'المدفوع مسبقاً (العربون)',
  depositLabel: 'العربون',
  
  // Payment types
  fullPayment: 'بيع بالحاضر',
  installmentPayment: 'تقسيط',
  promisePayment: 'وعد بالبيع',
  
  // Payment method labels
  cash: 'نقدي',
  check: 'شيك',
  bankTransfer: 'تحويل بنكي',
  
  // Status labels
  pending: 'معلق',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  
  // Confirmation labels
  confirmationAmount: 'المبلغ المستحق عند التأكيد',
  paidAtConfirmation: 'المدفوع عند التأكيد',
  paidAtConfirmationWithAdvance: 'المدفوع عند التأكيد (التسبقة)',
  paidAtConfirmationPhase2: 'المدفوع عند التأكيد (التسبقة - المرحلة الثانية)',
  
  // Remaining amounts
  remaining: 'المتبقي',
  remainingAfterDeposit: 'المتبقي بعد العربون',
  remainingForInstallment: 'المتبقي للتقسيط',
  
  // Company fee
  companyFee: 'عمولة الشركة',
  companyFeeLabel: 'عمولة الشركة (مبلغ في الدينار التونسي)',
  
  // Installment schedule
  installmentScheduleCreated: 'سيتم إنشاء جدول الأقساط تلقائياً بعد تأكيد التسبقة',
  installmentStartDate: 'تاريخ بداية الأقساط',
  
  // Promise sale specific
  promisePartialPayment: 'المبلغ المحصل في التأكيد الأول',
  promiseRemaining: 'المتبقي (سيتم دفعه لاحقاً)',
  promiseWarning: 'سيتم الدفع على جزئين: أدخل المبلغ المحصل في التأكيد الأول',
  
  // Progress and payment status
  progress: 'التقدم',
  paid: 'المدفوع',
  totalAmount: 'إجمالي المبلغ',
  remainingAmount: 'المتبقي',
  
  // Sale details
  saleDetails: 'تفاصيل الصفقة',
  saleDetailsTitle: 'تفاصيل البيع',
  client: 'العميل',
  saleDate: 'تاريخ البيع',
  piece: 'القطع',
} as const

// Helper function to get payment type label
export function getPaymentTypeLabel(paymentMethod: string | null | undefined): string {
  if (!paymentMethod) return PaymentTerms.promisePayment
  switch (paymentMethod) {
    case 'full':
      return PaymentTerms.fullPayment
    case 'installment':
      return PaymentTerms.installmentPayment
    case 'promise':
      return PaymentTerms.promisePayment
    default:
      return paymentMethod
  }
}

// Helper function to get status label
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return PaymentTerms.pending
    case 'completed':
      return PaymentTerms.completed
    case 'cancelled':
      return PaymentTerms.cancelled
    default:
      return status
  }
}

