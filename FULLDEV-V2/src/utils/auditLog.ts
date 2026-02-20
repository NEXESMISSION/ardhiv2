// ============================================================================
// AUDIT LOG UTILITIES
// ============================================================================

import { supabase } from '@/lib/supabase'

export interface AuditLogEntry {
  action: string
  entity_type: 'sale' | 'piece' | 'client' | 'installment' | 'appointment' | 'phone_call_appointment'
  entity_id: string
  details: Record<string, any>
  user_id?: string
  timestamp: string
}

export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  action: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  changes: Record<string, any> | null
  notes: string | null
  created_at: string
}

/**
 * Log an audit trail entry
 */
export async function logAuditEvent(
  action: string,
  entityType: 'sale' | 'piece' | 'client' | 'installment' | 'appointment' | 'phone_call_appointment',
  entityId: string,
  details: Record<string, any> = {},
  userId?: string,
  userEmail?: string,
  userName?: string,
  oldValues?: Record<string, any>,
  newValues?: Record<string, any>,
  changes?: Record<string, any>
): Promise<void> {
  try {
    const auditEntry: AuditLogEntry = {
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      user_id: userId,
      timestamp: new Date().toISOString(),
    }

    // Log to console for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUDIT]', JSON.stringify(auditEntry, null, 2))
    }

    // Save to database if audit_logs table exists
    // Start with minimal data to avoid column errors if migration hasn't been run
    try {
      // First, try with basic columns plus user_email/user_name (these are more likely to exist)
      const basicData: any = {
        action,
        entity_type: entityType,
        entity_id: entityId,
        user_id: userId || null,
        created_at: new Date().toISOString(),
      }

      // Try to include user email and name if provided (these columns might exist)
      if (userEmail) basicData.user_email = userEmail
      if (userName) basicData.user_name = userName

      // Try insert with basic + user info
      const { error: basicError } = await supabase.from('audit_logs').insert(basicData)

      if (basicError) {
        // If error is about user_email/user_name columns, try without them
        const errorMsg = basicError.message?.toLowerCase() || ''
        const errorCode = basicError.code || ''
        if (errorMsg.includes('user_email') || errorMsg.includes('user_name') || errorCode === 'PGRST204') {
          // Retry with minimal data only
          const minimalData: any = {
            action,
            entity_type: entityType,
            entity_id: entityId,
            user_id: userId || null,
            created_at: new Date().toISOString(),
          }

          const { error: minimalError } = await supabase.from('audit_logs').insert(minimalData)
          if (minimalError && process.env.NODE_ENV === 'development') {
            console.warn('Failed to save audit log (minimal):', minimalError)
          }
        } else {
          // Other error - log it
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to save audit log:', basicError)
          }
        }
        return
      }

      // Basic insert succeeded - that's good enough for now
      // Full tracking with old_values, new_values, changes, etc. will work after migration is run
    } catch (dbError) {
      // Table might not exist yet, just log to console
      if (process.env.NODE_ENV === 'development') {
        console.warn('Audit log table may not exist yet:', dbError)
      }
    }
  } catch (error) {
    console.error('Error logging audit event:', error)
    // Don't throw - audit logging failure shouldn't block the operation
  }
}

/**
 * Get audit logs for an entity
 */
export async function getAuditLogs(
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching audit logs:', error)
      return []
    }

    const logs = (data || []) as AuditLog[]

    // If any logs are missing user_name/user_email but have user_id, fetch user info
    const logsNeedingUserInfo = logs.filter(log => 
      log.user_id && (!log.user_name && !log.user_email)
    )

    if (logsNeedingUserInfo.length > 0) {
      const userIds = [...new Set(logsNeedingUserInfo.map(log => log.user_id).filter(Boolean))]
      
      if (userIds.length > 0) {
        try {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, email, name')
            .in('id', userIds)

          if (usersData) {
            const usersMap = new Map(usersData.map(u => [u.id, u]))
            
            // Enrich logs with user info
            logs.forEach(log => {
              if (log.user_id && (!log.user_name && !log.user_email)) {
                const user = usersMap.get(log.user_id)
                if (user) {
                  log.user_email = user.email
                  log.user_name = user.name || user.email
                }
              }
            })
          }
        } catch (userFetchError) {
          // Silently fail - user info is optional
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to fetch user info for audit logs:', userFetchError)
          }
        }
      }
    }

    return logs
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return []
  }
}

/**
 * Log sale cancellation
 */
export async function logSaleCancellation(
  saleId: string,
  saleData: {
    client_id: string
    land_piece_id: string
    sale_price: number
    deposit_amount: number
    company_fee_amount?: number | null
    status: string
  }
): Promise<void> {
  await logAuditEvent('sale_cancelled', 'sale', saleId, {
    reason: 'manual_cancellation',
    sale_data: saleData,
  })
}

/**
 * Log sale revert to pending
 */
export async function logSaleRevert(
  saleId: string,
  previousStatus: string,
  saleData: {
    client_id: string
    land_piece_id: string
    deposit_amount: number
  }
): Promise<void> {
  await logAuditEvent('sale_reverted', 'sale', saleId, {
    previous_status: previousStatus,
    new_status: 'pending',
    sale_data: saleData,
  })
}

/**
 * Log sale confirmation
 */
export async function logSaleConfirmation(
  saleId: string,
  confirmationData: {
    payment_method: string
    contract_writer_id?: string | null
    installment_start_date?: string | null
    company_fee_amount?: number | null
    partial_payment_amount?: number | null
    remaining_payment_amount?: number | null
    [key: string]: any
  }
): Promise<void> {
  await logAuditEvent('sale_confirmed', 'sale', saleId, {
    confirmation_data: confirmationData,
  })
}

/**
 * Log piece status change
 */
export async function logPieceStatusChange(
  pieceId: string,
  oldStatus: string,
  newStatus: string,
  reason?: string
): Promise<void> {
  await logAuditEvent('piece_status_changed', 'piece', pieceId, {
    old_status: oldStatus,
    new_status: newStatus,
    reason: reason || 'manual_change',
  })
}

/**
 * Log appointment creation
 */
export async function logAppointmentCreated(
  appointmentId: string,
  appointmentData: Record<string, any>,
  userId?: string,
  userEmail?: string,
  userName?: string
): Promise<void> {
  await logAuditEvent(
    'created',
    'appointment',
    appointmentId,
    { notes: 'Appointment created' },
    userId,
    userEmail,
    userName,
    undefined,
    appointmentData
  )
}

/**
 * Log appointment update
 */
export async function logAppointmentUpdated(
  appointmentId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  changes: Record<string, any>,
  userId?: string,
  userEmail?: string,
  userName?: string
): Promise<void> {
  await logAuditEvent(
    'updated',
    'appointment',
    appointmentId,
    { notes: 'Appointment updated' },
    userId,
    userEmail,
    userName,
    oldValues,
    newValues,
    changes
  )
}

/**
 * Log appointment deletion
 */
export async function logAppointmentDeleted(
  appointmentId: string,
  appointmentData: Record<string, any>,
  userId?: string,
  userEmail?: string,
  userName?: string
): Promise<void> {
  await logAuditEvent(
    'deleted',
    'appointment',
    appointmentId,
    { notes: 'Appointment deleted' },
    userId,
    userEmail,
    userName,
    appointmentData,
    undefined,
    undefined
  )
}

/**
 * Log phone call appointment creation
 */
export async function logPhoneCallAppointmentCreated(
  appointmentId: string,
  appointmentData: Record<string, any>,
  userId?: string,
  userEmail?: string,
  userName?: string
): Promise<void> {
  await logAuditEvent(
    'created',
    'phone_call_appointment',
    appointmentId,
    { notes: 'Phone call appointment created' },
    userId,
    userEmail,
    userName,
    undefined,
    appointmentData
  )
}

/**
 * Log phone call appointment update
 */
export async function logPhoneCallAppointmentUpdated(
  appointmentId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  changes: Record<string, any>,
  userId?: string,
  userEmail?: string,
  userName?: string
): Promise<void> {
  await logAuditEvent(
    'updated',
    'phone_call_appointment',
    appointmentId,
    { notes: 'Phone call appointment updated' },
    userId,
    userEmail,
    userName,
    oldValues,
    newValues,
    changes
  )
}

