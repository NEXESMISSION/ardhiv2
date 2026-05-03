import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

const log = logger('Notif')

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  read: boolean
  created_at: string
  metadata: Record<string, any> | null
}

/**
 * Check if a notification already exists for the same entity within a time window
 * Prevents duplicate notifications for the same event
 * Checks both by type and by entity_id (for sales, any notification about the same sale is considered duplicate)
 */
async function checkExistingNotification(
  type: string,
  entityType?: string,
  entityId?: string,
  timeWindowMinutes: number = 30
): Promise<boolean> {
  if (!entityType || !entityId) {
    return false // Can't check without entity info
  }

  try {
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - timeWindowMinutes)

    // First check: exact match (same type, entity_type, entity_id)
    const { data: exactMatch, error: exactError } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', type)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('created_at', timeWindow.toISOString())
      .limit(1)

    if (exactError) {
      log.warn('checkExisting: error on exact-match query', exactError)
    } else if (exactMatch && exactMatch.length > 0) {
      log.debug('checkExisting: found exact duplicate', { type, entityType, entityId })
      return true
    }

    // Second check: for sales, check if ANY notification exists for this sale_id within time window
    // This prevents different notification types for the same sale (e.g., installment vs promise)
    if (entityType === 'sale') {
      const { data: saleMatch, error: saleError } = await supabase
        .from('notifications')
        .select('id, type, title')
        .eq('entity_type', 'sale')
        .eq('entity_id', entityId)
        .gte('created_at', timeWindow.toISOString())
        .limit(5) // Get a few to see what types exist

      if (saleError) {
        log.warn('checkExisting: error on sale-id query', saleError)
      } else if (saleMatch && saleMatch.length > 0) {
        log.debug(`checkExisting: ${saleMatch.length} existing notif(s) for sale ${entityId}`,
          saleMatch.map(n => ({ type: n.type, title: n.title })))
        return true // Found existing notification for this sale
      }
    }

    return false // No duplicates found
  } catch (error) {
    log.warn('checkExisting: exception', error)
    return false // If check fails, allow notification
  }
}

/**
 * Delete old duplicate notifications for the same entity
 * Keeps only the most recent one
 */
async function cleanupDuplicateNotifications(
  entityType: string,
  entityId: string,
  timeWindowMinutes: number = 30
): Promise<void> {
  try {
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - timeWindowMinutes)

    // Get all notifications for this entity within time window
    const { data: duplicates, error: fetchError } = await supabase
      .from('notifications')
      .select('id, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('created_at', timeWindow.toISOString())
      .order('created_at', { ascending: false })

    if (fetchError || !duplicates || duplicates.length <= 1) {
      return // No duplicates or error fetching
    }

    // Keep the most recent one, delete the rest
    const idsToDelete = duplicates.slice(1).map(n => n.id)
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('notifications')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        log.warn('cleanupDuplicates: delete error', deleteError)
      } else {
        log.info(`cleanupDuplicates: deleted ${idsToDelete.length} row(s)`)
      }
    }
  } catch (error) {
    log.warn('cleanupDuplicates: exception', error)
  }
}

/**
 * Create a notification for all owners
 * Robust implementation with proper error handling and validation
 * Includes duplicate prevention
 */
export async function notifyOwners(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // Validate inputs
  if (!type || !title || !message) {
    log.error('notifyOwners: missing required params', { type, title, message })
    return false
  }

  // Check for existing notification to prevent duplicates
  const hasDuplicate = await checkExistingNotification(type, entityType, entityId, 30)
  if (hasDuplicate) {
    log.debug('notifyOwners: duplicate prevented', { type, entityType, entityId })
    // Clean up any old duplicates that might exist
    if (entityType && entityId) {
      await cleanupDuplicateNotifications(entityType, entityId, 30)
    }
    return true // Return true to indicate "success" (we prevented a duplicate, which is good)
  }

  return log.track(`notifyOwners(${type}/${entityType ?? '-'}/${entityId ?? '-'})`, async () => {
    try {
      // Try RPC function first (most efficient)
      log.debug('notifyOwners: RPC call', { type, title, message: message.substring(0, 50) })
      const { data: rpcResult, error: rpcError } = await supabase.rpc('notify_owners', {
        p_type: type,
        p_title: title,
        p_message: message,
        p_entity_type: entityType || null,
        p_entity_id: entityId || null,
        p_metadata: metadata || null,
      })

      if (!rpcError) {
        log.info('notifyOwners: RPC succeeded', { rpcResult })
        return rpcResult === true
      }

      // RPC failed, use fallback
      log.warn('notifyOwners: RPC failed, falling back', rpcError)
      return await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
    } catch (error) {
      log.error('notifyOwners: exception', error)
      // Try fallback on exception
      return await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
    }
  })
}

/**
 * Fallback method to manually create notifications for owners
 * More robust with retry logic and better error handling
 */
async function notifyOwnersFallback(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
    // Get all owner user IDs
    const { data: owners, error: ownersError } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'owner')

    if (ownersError) {
        lastError = ownersError
        log.error(`notifyOwnersFallback: attempt ${attempt} - error fetching owners`, ownersError)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        return false
    }

    if (!owners || owners.length === 0) {
        log.warn('notifyOwnersFallback: no owners exist to notify')
        return true // Not an error, just no owners to notify
    }

      log.debug(`notifyOwnersFallback: ${owners.length} owner(s) to notify`)

    // Create notifications for each owner
    const notifications = owners.map(owner => ({
      user_id: owner.id,
      type,
      title,
      message,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || null,
      read: false,
    }))

      // Insert notifications in batches to avoid payload size issues
      const batchSize = 50
      let successCount = 0

      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize)
        const { error: insertError } = await supabase
      .from('notifications')
          .insert(batch)
      .select()

    if (insertError) {
          lastError = insertError
          log.error(`notifyOwnersFallback: attempt ${attempt}, batch ${Math.floor(i / batchSize) + 1} - insert error`, insertError)
          if (attempt < maxRetries) break // Retry outer loop
    } else {
          successCount += batch.length
        }
      }

      if (successCount === notifications.length) {
        log.info(`notifyOwnersFallback: created ${successCount} notification(s)`)
        return true
      }
      
      log.error(`notifyOwnersFallback: partial success ${successCount}/${notifications.length}`)

      // Partial success, retry failed ones
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        continue
    }
  } catch (error) {
      lastError = error
      log.error(`notifyOwnersFallback: attempt ${attempt} - exception`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  log.error('notifyOwnersFallback: all retries failed', lastError)
  return false
}

/**
 * Create a notification for the current user
 * Robust with validation and retry logic
 * Includes duplicate prevention
 */
export async function notifyCurrentUser(
  type: string,
  title: string,
  message: string,
  userId: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // Validate inputs
  if (!type || !title || !message || !userId) {
    log.error('notifyCurrentUser: missing required params', { type, title, message, userId })
    return false
  }

  // Check for existing notification to prevent duplicates
  if (entityType && entityId) {
    const hasDuplicate = await checkExistingNotification(type, entityType, entityId, 30)
    if (hasDuplicate) {
      log.debug('notifyCurrentUser: duplicate prevented', { type, entityType, entityId, userId })
      // Clean up any old duplicates that might exist
      await cleanupDuplicateNotifications(entityType, entityId, 30)
      return true // Return true to indicate "success" (we prevented a duplicate)
    }
  }

  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        entity_type: entityType || null,
        entity_id: entityId || null,
        metadata: metadata || null,
        read: false,
      })
      .select()

      if (!insertError) {
        return true
      }

      lastError = insertError
      log.error(`notifyCurrentUser: attempt ${attempt} - insert error`, insertError)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  } catch (error) {
      lastError = error
      log.error(`notifyCurrentUser: attempt ${attempt} - exception`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  log.error('notifyCurrentUser: all retries failed', lastError)
  return false
}

/** Date filter for notifications: 'all' | 'today' | 'yesterday' | 'this_week' | 'YYYY-MM-DD' (specific day) */
export type NotificationDateFilter = 'all' | 'today' | 'yesterday' | 'this_week' | string

function getDateRange(filter: NotificationDateFilter): { from: string; to: string } | null {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  let from = new Date(now)

  if (filter === 'all') return null
  if (filter === 'today') {
    from.setHours(0, 0, 0, 0)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  if (filter === 'yesterday') {
    from.setDate(from.getDate() - 1)
    from.setHours(0, 0, 0, 0)
    to.setDate(to.getDate() - 1)
    to.setHours(23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  if (filter === 'this_week') {
    const day = from.getDay()
    const start = new Date(from)
    start.setDate(from.getDate() - (day === 0 ? 6 : day - 1))
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: to.toISOString() }
  }
  // Specific day: YYYY-MM-DD (local date)
  if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
    const [y, m, d] = filter.split('-').map(Number)
    from = new Date(y, m - 1, d, 0, 0, 0, 0)
    const toDay = new Date(y, m - 1, d, 23, 59, 59, 999)
    return { from: from.toISOString(), to: toDay.toISOString() }
  }
  return null
}

/**
 * Get notifications for the current user with pagination and optional date filter
 */
export async function getNotifications(
  userId: string,
  limit: number = 20,
  offset: number = 0,
  dateFilter: NotificationDateFilter = 'all'
): Promise<Notification[]> {
  if (!userId) {
    log.error('getNotifications: missing userId')
    return []
  }

  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const range = getDateRange(dateFilter)
    if (range) {
      query = query.gte('created_at', range.from).lte('created_at', range.to)
    }

    const { data, error } = await query
      .range(offset, offset + Math.min(limit, 100) - 1)

    if (error) {
      log.error('getNotifications: query error', error)
      return []
    }

    return (data || []) as Notification[]
  } catch (error) {
    log.error('getNotifications: exception', error)
    return []
  }
}

/**
 * Get unread notification count
 * Optimized query with proper error handling
 */
export async function getUnreadCount(userId: string): Promise<number> {
  if (!userId) {
    return 0
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      log.error('getUnreadCount: query error', error)
      return 0
    }

    return count || 0
  } catch (error) {
    log.error('getUnreadCount: exception', error)
    return 0
  }
}

/**
 * Mark notification as read
 * With validation and error handling
 */
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  if (!notificationId || !userId) {
    log.error('markAsRead: missing required params')
    return false
  }

  try {
    // .select() forces PostgREST to return the affected rows so we can
    // distinguish "0 rows updated (RLS rejection)" from "1 row updated (success)".
    // Without this, a silently RLS-blocked update returns no error but the
    // notification is never actually marked as read, which is the exact
    // scenario that produced the "badge stays red" bug.
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('id')

    if (error) {
      log.error('markAsRead: query error', error)
      return false
    }
    if (!data || data.length === 0) {
      log.warn('markAsRead: 0 rows updated — likely RLS rejection (auth.uid mismatch with passed user_id)', { notificationId, userId })
      return false
    }
    log.debug('markAsRead: ok', { notificationId, rows: data.length })
    return true
  } catch (error) {
    log.error('markAsRead: exception', error)
    return false
  }
}

/**
 * Mark all notifications as read
 * Optimized with proper error handling
 */
export async function markAllAsRead(userId: string): Promise<boolean> {
  if (!userId) {
    log.error('markAllAsRead: missing userId')
    return false
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .select('id')

    if (error) {
      log.error('markAllAsRead: query error', error)
      return false
    }
    // Zero rows here is legitimate ("nothing was unread") — log as info, not warn.
    // It only matters for diagnosis: if the UI shows unread > 0 but this returns
    // 0 rows, that's an RLS mismatch.
    log.info(`markAllAsRead: ok (${data?.length ?? 0} row(s) flipped)`, { userId })
    return true
  } catch (error) {
    log.error('markAllAsRead: exception', error)
    return false
  }
}

/**
 * Delete notification
 * With validation and error handling
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  if (!notificationId || !userId) {
    log.error('deleteNotification: missing required params')
    return false
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      log.error('deleteNotification: query error', error)
      return false
    }

    return true
  } catch (error) {
    log.error('deleteNotification: exception', error)
    return false
  }
}

/**
 * Format time ago in the user's language. Pass 'fr' for French, anything
 * else (or undefined) for Arabic. Previously this always returned Arabic
 * regardless of the active language.
 */
export function formatTimeAgo(dateString: string, language: 'ar' | 'fr' = 'ar'): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (language === 'fr') {
    if (diffMins < 1) return 'à l\'instant'
    if (diffMins < 60) return `il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`
    if (diffHours < 24) return `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`
    if (diffDays < 7) return `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Arabic (default)
  if (diffMins < 1) return 'الآن'
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`
  if (diffHours < 24) return `منذ ${diffHours} ساعة`
  if (diffDays < 7) return `منذ ${diffDays} يوم`
  return date.toLocaleDateString('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

